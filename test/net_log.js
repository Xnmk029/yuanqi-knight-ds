/* 联机日志系统测试 */
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
global.Peer=function(){ this.on=function(){}; this.connect=function(){ return {on:function(){},open:false}; }; this.destroy=function(){}; };
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','net.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, N=G.Net;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 日志记录 */
console.log('=== 1. 日志记录 ===');
N.logs=[];
N.log('info', '测试信息');
N.log('error', '测试错误');
N.log('warn', '测试警告');
check(N.logs.length===3, '3 条日志');
check(N.logs[0].type==='info' && N.logs[0].msg==='测试信息', '日志内容正确');
check(!!N.logs[0].t, '日志带时间戳');

/* 2. 日志上限 */
console.log('=== 2. 日志上限 ===');
for(let i=0;i<150;i++) N.log('info', '批量'+i);
check(N.logs.length<=100, '日志上限 100 条, 实际 '+N.logs.length);
check(N.logs[N.logs.length-1].msg==='批量149', '保留最新日志');

/* 3. onLog 回调 */
console.log('=== 3. onLog 回调 ===');
let cbCount=0;
N.onLog=function(){ cbCount++; };
N.log('info', '回调测试');
check(cbCount===1, 'onLog 回调触发');

/* 4. 协议功能未破坏 */
console.log('=== 4. 协议功能 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
g.players=[g.player];
g.spawnEnemy('slime', 200, 200, {});
const snap=G.Net.buildSnap(g);
check(snap.p.length===1 && snap.e.length===1, '快照构建正常');
N.state='host'; N.g=g; N.conn={open:true, send:function(){}};
N.onData(g, {t:'hello', hero:'mage'});
check(!!g.guest, '客机玩家创建正常');
check(N.logs.some(l=>l.msg.indexOf('客机加入')>=0), '客机加入有日志');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n联机日志系统测试通过 ✔');
