/* 配件系统测试 */
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
const G=global.G, U=G.U, Wp=G.Weapons;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 配件定义 */
console.log('=== 1. 配件定义 ===');
check(Object.keys(Wp.PARTS).length===6, '6 种配件');
const info=Wp.partInfo('scope2');
check(info && info.name==='精准瞄准镜' && info.level===2 && info.price===35, '配件信息正确');

/* 2. 安装/卸下 */
console.log('=== 2. 安装/卸下 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
p.weapons=[]; p.wi=0;
p.giveWeapon(Wp.get('pistol'),true);
const w=p.weapons[0];
check(Wp.attachPart(w,'scope1'), '安装瞄准镜');
check(Wp.attachPart(w,'pierce2'), '安装穿甲弹');
check(!Wp.attachPart(w,'core1'), '第 3 个配件被拒绝');
check(w.parts.length===2, '2 个配件槽');
check(Wp.detachPart(w,'scope1'), '卸下瞄准镜');
check(w.parts.length===1, '卸下后 1 个配件');

/* 3. 配件效果 */
console.log('=== 3. 配件效果 ===');
const g2=new G.Game();
g2.init(); g2.start('knight');
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
const p2=g2.player; p2.maxHp=1e6; p2.hp=1e6; p2.maxEnergy=1e6; p2.energy=1e6;
p2.weapons=[]; p2.wi=0;
p2.giveWeapon(Wp.get('pistol'),true);
const w2=p2.weapons[0];
// 射速：scope3 +30%
Wp.attachPart(w2,'scope3');
const rateBefore=w2.rate;
p2.fire(g2,w2,1);
const cdAfter=w2.cd;
check(cdAfter<rateBefore, '射速提升 cd='+cdAfter.toFixed(3)+' < '+rateBefore);
// 穿透：pierce3 +3
Wp.attachPart(w2,'pierce3');
w2.cd=0;
p2.fire(g2,w2,1);
const b=g2.bullets[g2.bullets.length-1];
check(b && b.pierce>=3, '穿透+3 pierce='+(b?b.pierce:'无'));
// 能量：core3 -35%
const g3=new G.Game();
g3.init(); g3.start('knight');
g3.onUpgrade=(p)=>{ g3.applyBuff(p[0]); };
g3.onGameOver=()=>{}; g3.onWin=()=>{};
const p3=g3.player; p3.maxHp=1e6; p3.hp=1e6; p3.maxEnergy=1e6; p3.energy=1e6;
p3.weapons=[]; p3.wi=0;
p3.giveWeapon(Wp.get('pistol'),true);
const w3=p3.weapons[0];
const costBefore=w3.energy;
Wp.attachPart(w3,'core3');
p3.fire(g3,w3,1);
check(p3.energy<1e6-costBefore*0.5, '能量消耗降低 (扣 '+(1e6-p3.energy).toFixed(2)+' < '+costBefore+')');
// 元素：elem 附魔
const g4=new G.Game();
g4.init(); g4.start('knight');
g4.onUpgrade=(p)=>{ g4.applyBuff(p[0]); };
g4.onGameOver=()=>{}; g4.onWin=()=>{};
const p4=g4.player; p4.maxHp=1e6; p4.hp=1e6; p4.maxEnergy=1e6; p4.energy=1e6;
p4.weapons=[]; p4.wi=0;
p4.giveWeapon(Wp.get('pistol'),true);
const w4=p4.weapons[0];
Wp.attachPart(w4,'elem1');
const hasElem=Wp.ELEMENTS.some(function(e){ return w4[e.k]>0; });
check(hasElem, '元素附魔生效');
Wp.detachPart(w4,'elem1');
const elemGone=!Wp.ELEMENTS.some(function(e){ return w4[e.k]>0; });
check(elemGone, '卸下后元素移除');

/* 4. 配件随快照保留 */
console.log('=== 4. 配件快照 ===');
const snap=Wp.snapshot(w2);
check(snap.parts && snap.parts.length===2, '快照保留配件 '+JSON.stringify(snap.parts));
const g5=new G.Game();
g5.init(); g5.start('knight');
g5.onUpgrade=(p)=>{ g5.applyBuff(p[0]); };
g5.onGameOver=()=>{}; g5.onWin=()=>{};
const p5=g5.player; p5.maxHp=1e6; p5.hp=1e6; p5.maxEnergy=1e6; p5.energy=1e6;
p5.weapons=[]; p5.wi=0;
p5.giveWeapon(snap,true);
const w5=p5.weapons[0];
check(w5.parts && w5.parts.length===2, '拾回后配件保留');

/* 5. 武器商房间 */
console.log('=== 5. 武器商房间 ===');
let hasGunsmith=false;
for(let t=0;t<10;t++){
  const m=G.Dungeon.generate(2,0,{seed:500+t});
  for(const r of m.rooms) if(r.type==='gunsmith') hasGunsmith=true;
}
check(hasGunsmith, 'gunsmith 房出现');
const g6=new G.Game();
g6.init(); g6.start('knight');
g6.onUpgrade=(p)=>{ g6.applyBuff(p[0]); };
g6.onGameOver=()=>{}; g6.onWin=()=>{};
g6.makeGunsmith({cx:100,cy:100});
const gs=g6.inter[g6.inter.length-1];
check(gs.parts && gs.parts.length===3, '武器商 3 个配件');
check(gs.parts.every(function(pid){ return Wp.partInfo(pid); }), '配件 id 有效');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n配件系统测试通过 ✔');
