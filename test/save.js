/* 存档系统测试 */
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

/* 1. 种子地图可复现 */
console.log('=== 1. 种子地图 ===');
const m1=G.Dungeon.generate(1,0,{seed:12345});
const m2=G.Dungeon.generate(1,0,{seed:12345});
check(m1.rooms.length===m2.rooms.length, '同种子房间数一致 '+m1.rooms.length);
let same=true;
for(let i=0;i<m1.rooms.length;i++){
  if(m1.rooms[i].type!==m2.rooms[i].type || m1.rooms[i].x!==m2.rooms[i].x || m1.rooms[i].y!==m2.rooms[i].y) same=false;
}
check(same, '同种子房间类型/位置一致');
const m3=G.Dungeon.generate(1,0,{seed:999});
let diff=false;
if(m3.rooms.length!==m1.rooms.length) diff=true;
else for(let i=0;i<m1.rooms.length;i++){
  if(m3.rooms[i].type!==m1.rooms[i].type || m3.rooms[i].x!==m1.rooms[i].x || m3.rooms[i].y!==m1.rooms[i].y) diff=true;
}
if(!diff && m3.props.length===m1.props.length){
  for(let i=0;i<m1.props.length;i++){
    if(m3.props[i].kind!==m1.props[i].kind || m3.props[i].x!==m1.props[i].x) diff=true;
  }
}
check(diff, '不同种子地图不同');

/* 2. 存档/读档全链路 */
console.log('=== 2. 存档/读档 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
// 制造状态：金币/武器/附魔/祝福/清房
p.coins=123; p.keys=2; p.mats=5;
p.giveWeapon(Wp.get('shotgun'),true);
const w=p.weapons[p.weapons.length-1];
w.freeze=1.5; w.dmg=Math.round(w.dmg*1.4);
p.picked.push(G.Buffs[0]); G.Buffs[0].fn(p);
// 标记一个房间已清
const r0=g.map.rooms[0]; r0.cleared=true;
// 存档
const okSave=G.Save.auto(g);
check(okSave, '自动存档成功');
check(G.Save.hasAuto(), '检测到自动存档');
// 手动存档
check(G.Save.manual(g,0), '手动存档槽1成功');
const info=G.Save.manualInfo(0);
check(info && info.floor===1 && info.hero==='knight', '槽位信息正确');

// 读档到新实例
const g2=new G.Game();
g2.init();
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
const data=G.Save.loadAuto();
check(!!data, '读取自动存档数据');
const okRestore=G.Save.restore(g2, data);
check(okRestore, '恢复成功');
check(g2.state==='playing', '恢复后进入游戏');
const p2=g2.player;
check(p2.coins===123 && p2.keys===2 && p2.mats===5, '金币/钥匙/材料恢复 '+p2.coins+'/'+p2.keys+'/'+p2.mats);
check(p2.weapons.length===3, '武器数量恢复 '+p2.weapons.length);
const w2=p2.weapons[2];
check(w2.id==='shotgun', '武器 id 恢复');
check(w2.freeze===1.5, '附魔属性恢复 freeze='+w2.freeze);
check(w2.dmg===Math.round(6*1.4), '强化属性恢复 dmg='+w2.dmg);
check(p2.picked.length>=1, '祝福恢复 '+p2.picked.length);
// 已清房间恢复
const clearedCount=g2.map.rooms.filter(r=>r.cleared).length;
check(clearedCount>=1, '已清房间恢复 '+clearedCount);

/* 3. 自动存档钩子 */
console.log('=== 3. 自动存档钩子 ===');
const g3=new G.Game();
g3.init(); g3.start('knight');
g3.onUpgrade=(p)=>{ g3.applyBuff(p[0]); };
g3.onGameOver=()=>{}; g3.onWin=()=>{};
const p3=g3.player; p3.maxHp=1e6; p3.hp=1e6; p3.maxEnergy=1e6; p3.energy=1e6;
p3.coins=77;
// 触发 30s 定时存档
g3.saveT=0.01;
const IN=G.Input;
IN.keys={}; IN.hits={}; IN.down=false;
g3.update(1/60); IN.end();
const d3=G.Save.loadAuto();
check(d3 && d3.player.coins===77, '定时存档触发');
// 清房触发
g3.player.coins=88;
g3.clearRoom(g3.map.rooms[0]);
const d3b=G.Save.loadAuto();
check(d3b && d3b.player.coins===88, '清房存档触发');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n存档系统测试通过 ✔');
