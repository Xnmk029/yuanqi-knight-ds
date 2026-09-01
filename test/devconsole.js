/* 开发控制台测试 */
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
/* 模拟 DOM：devconsole 面板元素 */
const dcEls = {};
function makeEl(id){
  const e={ id:id, style:{}, children:[], _cls:{},
    classList:{ add(c){e._cls[c]=1;}, remove(c){delete e._cls[c];}, contains(c){return !!e._cls[c];} },
    appendChild(c){ e.children.push(c); return c; },
    removeChild(c){ const i=e.children.indexOf(c); if(i>=0) e.children.splice(i,1); },
    setAttribute(k,v){ e._attrs=e._attrs||{}; e._attrs[k]=v; },
    getAttribute(k){ return e._attrs?e._attrs[k]:null; },
    addEventListener(){}, removeEventListener(){},
    getContext(){ return makeCtx(); },
    getBoundingClientRect(){ return {left:0,top:0,width:640,height:360,right:640,bottom:360}; },
    width:300, height:150 };
  dcEls[id]=e;
  return e;
}
makeEl('devconsole');
makeEl('dc-logs');
makeEl('dc-close');
makeEl('dc-clear');
makeEl('dc-filter-all');
const store={};
global.window=global;
global.localStorage={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=v;}, removeItem:k=>{delete store[k];} };
global.document={
  readyState:'complete',
  getElementById(id){ return dcEls[id]||null; },
  createElement(t){ return makeEl(''); },
  querySelectorAll(sel){
    if(sel==='#devconsole .dc-filter') return [dcEls['dc-filter-all']];
    return [];
  },
  addEventListener(){}
};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=function(){}; global.removeEventListener=function(){};
global.requestAnimationFrame=function(){ return 0; };
global.AudioContext=undefined; global.webkitAudioContext=undefined;
for(const f of ['util.js','save.js','devconsole.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','net.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, D=G.DevConsole;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 初始化 */
console.log('=== 1. 初始化 ===');
D.init();
check(D._inited, '已初始化');
check(D.logs.length>=1, '初始化日志存在');

/* 2. console 拦截 */
console.log('=== 2. console 拦截 ===');
const before=D.logs.length;
console.log('测试日志消息');
console.warn('测试警告');
console.error('测试错误', new Error('测试堆栈'));
check(D.logs.length===before+3, 'console 调用被记录');
check(D.logs[before].level==='info' && D.logs[before].msg==='测试日志消息', 'log 级别正确');
check(D.logs[before+1].level==='warn', 'warn 级别正确');
check(D.logs[before+2].level==='error' && D.logs[before+2].msg.indexOf('测试堆栈')>=0, 'error 含堆栈');

/* 3. 多参数格式化 */
console.log('=== 3. 格式化 ===');
const b2=D.logs.length;
console.log('数值', 42, {a:1});
check(D.logs[b2].msg.indexOf('42')>=0 && D.logs[b2].msg.indexOf('{"a":1}')>=0, '多参数拼接: '+D.logs[b2].msg);

/* 4. 主动记录 API */
console.log('=== 4. 主动记录 ===');
D.log('warn', '主动警告');
check(D.logs[D.logs.length-1].level==='warn', 'D.log 主动记录');

/* 5. 上限 */
console.log('=== 5. 上限 ===');
for(let i=0;i<600;i++) D.log('info', '批量'+i);
check(D.logs.length<=500, '日志上限 500, 实际 '+D.logs.length);
check(D.logs.some(l=>l.msg==='批量599'), '保留最新日志');

/* 6. 过滤 */
console.log('=== 6. 过滤 ===');
D.log('error', '过滤测试错误');
D.setFilter('error');
D.render();
const errOnly=dcEls['dc-logs'].children.every(c=>c.className.indexOf('dc-error')>=0);
check(errOnly, '过滤后仅错误');
D.setFilter('all');

/* 7. 清空 */
console.log('=== 7. 清空 ===');
D.clear();
check(D.logs.length===0, '清空后无日志');

/* 8. 开关 */
console.log('=== 8. 开关 ===');
D.toggle();
check(D.visible===true, '打开');
check(dcEls['devconsole'].style.display==='flex', '面板显示');
D.toggle();
check(D.visible===false, '关闭');
check(dcEls['devconsole'].style.display==='none', '面板隐藏');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n开发控制台测试通过 ✔');
