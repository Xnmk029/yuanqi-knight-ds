/* 输入框放行测试：点击/按键在表单控件上不拦截 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');
function makeCtx(){
  const store={};
  const grad={addColorStop(){}};
  return new Proxy({},{
    get(t,p){
      if(p in store) return store[p];
      if(p==='canvas') return {width:640,height:360};
      if(p==='measureText') return ()=>({width:20});
      if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern') return ()=>grad;
      if(p==='getImageData') return ()=>({data:new Uint8ClampedArray(4)});
      if(typeof p==='symbol') return undefined;
      return ()=>{};
    },
    set(t,p,v){ store[p]=v; return true; },
    has(){ return true; }
  });
}
function makeCanvas(w,h){
  return { width:w||300, height:h||150, style:{},
    getContext(){ return makeCtx(); },
    getBoundingClientRect(){ return {left:0,top:0,width:640,height:360,right:640,bottom:360}; },
    addEventListener(){}, removeEventListener(){} };
}
const store={};
global.window=global;
global.localStorage={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=v;}, removeItem:k=>{delete store[k];} };
global.document={
  readyState:'complete',
  getElementById(id){
    if(id==='game') return makeCanvas(640,360);
    if(id==='hud') return makeCanvas(1280,720);
    return null;
  },
  createElement(t){ return makeCanvas(); },
  querySelectorAll(){ return []; },
  addEventListener(){}
};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=function(){}; global.removeEventListener=function(){};
global.requestAnimationFrame=function(){ return 0; };
global.AudioContext=undefined; global.webkitAudioContext=undefined;
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','net.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, IN=G.Input;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 捕获 util.js 注册的监听器 */
const listeners={};
const origAdd=global.addEventListener;
global.addEventListener=function(type,fn){ (listeners[type]=listeners[type]||[]).push(fn); };
const stage={ addEventListener:function(type,fn){ (listeners['stage-'+type]=listeners['stage-'+type]||[]).push(fn); } };
IN.init(stage);

/* 1. 点击输入框：不设置 IN.down、不 preventDefault */
console.log('=== 1. 输入框 mousedown ===');
let prevented=false;
const inputEv={ target:{tagName:'INPUT'}, clientX:100, clientY:100, button:0, preventDefault:function(){ prevented=true; } };
listeners['stage-mousedown'].forEach(fn=>fn(inputEv));
check(!IN.down, '点击输入框不触发游戏攻击 (IN.down='+IN.down+')');
check(!prevented, '输入框 mousedown 不 preventDefault（可聚焦）');

/* 2. 点击普通区域：正常拦截 */
console.log('=== 2. 普通区域 mousedown ===');
prevented=false;
IN.down=false;
const normalEv={ target:{tagName:'CANVAS'}, clientX:200, clientY:200, button:0, preventDefault:function(){ prevented=true; } };
listeners['stage-mousedown'].forEach(fn=>fn(normalEv));
check(IN.down, '普通区域点击触发攻击');
check(prevented, '普通区域 preventDefault');

/* 3. 输入框内按键：不记录到游戏输入 */
console.log('=== 3. 输入框 keydown ===');
IN.keys={}; IN.hits={};
const keyEv={ target:{tagName:'INPUT'}, key:'w', code:'KeyW', preventDefault:function(){ prevented=true; } };
prevented=false;
listeners['keydown'].forEach(fn=>fn(keyEv));
check(!IN.keys['w'] && !IN.hits['w'], '输入框内按 w 不记录为游戏输入');
check(!prevented, '输入框内按键不 preventDefault');

/* 4. 普通区域按键：正常记录 */
console.log('=== 4. 普通区域 keydown ===');
IN.keys={}; IN.hits={};
const keyEv2={ target:{tagName:'BODY'}, key:'w', code:'KeyW', preventDefault:function(){ prevented=true; } };
prevented=false;
listeners['keydown'].forEach(fn=>fn(keyEv2));
check(IN.keys['w'] && IN.hits['w'], '普通按键记录为游戏输入');
check(!prevented, '普通按键不 preventDefault（w 不在拦截列表）');

/* 5. 空格在输入框内不 preventDefault */
console.log('=== 5. 输入框空格 ===');
prevented=false;
const spaceEv={ target:{tagName:'INPUT'}, key:' ', code:'Space', preventDefault:function(){ prevented=true; } };
listeners['keydown'].forEach(fn=>fn(spaceEv));
check(!prevented, '输入框内空格可正常输入');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n输入框放行测试通过 ✔');
