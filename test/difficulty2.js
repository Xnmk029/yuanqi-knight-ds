/* 难度保底商店 + 难度切换测试 */
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
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 困难/噩梦保底商店 */
console.log('=== 1. 保底商店（困难/噩梦） ===');
const SHOP_TYPES=['shop','weaponshop','consumableshop','partshop','gunsmith'];
function hasShop(m){
  for(const r of m.rooms) if(SHOP_TYPES.indexOf(r.type)>=0) return true;
  return false;
}
let hardAll=true, nightmareAll=true, easyNoGuarantee=true;
for(let t=0;t<30;t++){
  const mh=G.Dungeon.generate(2,0,{seed:100+t, difficulty:2});
  if(!hasShop(mh)) hardAll=false;
  const mn=G.Dungeon.generate(2,0,{seed:200+t, difficulty:3});
  if(!hasShop(mn)) nightmareAll=false;
  const me=G.Dungeon.generate(2,0,{seed:300+t, difficulty:0});
  for(const r of me.rooms){
    if(['weaponshop','consumableshop','partshop'].indexOf(r.type)>=0) easyNoGuarantee=false;
  }
}
check(hardAll, '困难 30 层全部有商店');
check(nightmareAll, '噩梦 30 层全部有商店');
check(easyNoGuarantee, '简单层无保底商店类型（仅基础 shop）');

/* 2. 保底商店类型三选一 */
console.log('=== 2. 保底商店类型 ===');
const seenTypes={};
for(let t=0;t<60;t++){
  const m=G.Dungeon.generate(3,0,{seed:400+t, difficulty:3});
  for(const r of m.rooms){
    if(['weaponshop','consumableshop','partshop'].indexOf(r.type)>=0){
      seenTypes[r.type]=(seenTypes[r.type]||0)+1;
    }
  }
}
console.log('  保底商店类型分布:', JSON.stringify(seenTypes));
check(seenTypes.weaponshop>0 && seenTypes.consumableshop>0 && seenTypes.partshop>0, '三种商店类型都出现过');

/* 3. 商店内容 */
console.log('=== 3. 商店内容 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
const shopBefore=g.inter.filter(x=>x.kind==='shopitem').length;
g.makeWeaponShop({cx:100,cy:100});
const ws=g.inter.filter(x=>x.kind==='shopitem');
check(ws.length===shopBefore+3 && ws.slice(shopBefore).every(x=>x.itemKind==='weapon'), '武器商店新增 3 把武器');
g.inter=[];
g.makeConsumableShop({cx:100,cy:100});
const cs=g.inter.filter(x=>x.kind==='shopitem');
check(cs.length===3 && cs.every(x=>x.itemKind!=='weapon'), '消耗品商店无武器');
check(cs.some(x=>x.itemKind==='heal') && cs.some(x=>x.itemKind==='armor') && cs.some(x=>x.itemKind==='key'), '消耗品含药水/护甲/钥匙');

/* 4. 大厅难度切换 */
console.log('=== 4. 大厅难度切换 ===');
const g2=new G.Game();
g2.init();
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
g2.enterLobby();
const d0=g2.difficulty;
/* 模拟 E 切换（走到难度石碑） */
g2.player.x=440; g2.player.y=150;
const IN=G.Input;
IN.hits['e']=true;
g2.update(1/60);
check(g2.difficulty===(d0+1)%G.DIFFICULTY.length, 'E 切换难度 '+d0+'→'+g2.difficulty);
IN.hits['e']=true;
g2.update(1/60);
check(g2.difficulty===(d0+2)%G.DIFFICULTY.length, '再次切换');
/* 循环回简单（从 2 切 2 次：2→3→0） */
for(let i=0;i<2;i++){ IN.hits['e']=true; g2.update(1/60); }
check(g2.difficulty===d0, '循环切换回到原难度');
/* 持久化 */
check(U.load('difficulty',-1)===g2.difficulty, '难度已持久化');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n难度保底商店测试通过 ✔');
