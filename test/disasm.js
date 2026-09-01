/* 拆解机测试 */
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

/* 1. 拆解 */
console.log('=== 1. 拆解 ===');
const sg=Wp.get('shotgun');
const parts=Wp.disassemble(sg);
check(parts.shape.shape==='ball' && parts.shape.count===6, '射弹部件: ball×6');
check(parts.stats.dmg===6 && parts.stats.rate===0.62, '属性部件: dmg/rate');
check(parts.mode.type==='gun' && parts.mode.trait==='close', '攻击方式: gun+close');

/* 2. 安装 */
console.log('=== 2. 安装 ===');
const pistol=Wp.get('pistol');
const modded=Wp.installModules(pistol, parts.shape, parts.stats, parts.mode);
check(modded.shape==='ball' && modded.count===6, '弹道覆盖');
check(modded.dmg===6 && modded.rate===0.62, '数值覆盖');
check(modded.type==='gun' && modded.trait==='close', '攻击方式覆盖');
check(modded.id==='pistol' && modded.skill===pistol.skill, '保留身份与技能');
check(modded.modded===true, '改装标记');

/* 3. 跨类型 + 残留清除 */
console.log('=== 3. 跨类型与残留清除 ===');
const laser=Wp.get('photon_cutter');
const lp=Wp.disassemble(laser);
const laserPistol=Wp.installModules(pistol, lp.shape, lp.stats, lp.mode);
check(laserPistol.type==='laser' && laserPistol.beamDps===34, '手枪→持续光束');
const sword=Wp.get('greatsword');
const sp=Wp.disassemble(sword);
const meleePistol=Wp.installModules(pistol, sp.shape, sp.stats, sp.mode);
check(meleePistol.type==='melee' && meleePistol.melee && meleePistol.melee.arc===2.5, '手枪→挥砍');
/* 残留清除：melee 改装回 gun */
const backGun=Wp.installModules(meleePistol, parts.shape, parts.stats, parts.mode);
check(backGun.type==='gun' && backGun.melee===undefined, 'melee 残留被清除');
/* laser 改装为 melee：beam 残留清除 */
const laserMelee=Wp.installModules(laserPistol, sp.shape, sp.stats, sp.mode);
check(laserMelee.type==='melee' && laserMelee.beamWidth===undefined, 'beam 残留被清除');

/* 4. 游戏内流程 */
console.log('=== 4. 游戏内流程 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
p.weapons=[]; p.wi=0;
p.giveWeapon(Wp.get('shotgun'),true);
p.giveWeapon(Wp.get('pistol'),true);
p.giveWeapon(Wp.get('sword'),true);
/* 拆解 shotgun（idx 0） */
check(g.disassembleWeapon(0), '拆解成功');
check(p.weapons.length===2, '武器减少');
check(p.modules && p.modules.shape && p.modules.shape.shape==='ball', '获得射弹部件');
check(p.modules.stats && p.modules.mode, '获得属性/攻击方式部件');
/* 安装到 pistol（idx 0） */
check(g.installModulesTo(0), '安装成功');
const moddedW=p.weapons[0];
check(moddedW.shape==='ball' && moddedW.count===6, '手枪获得霰弹枪弹道');
check(moddedW.trait==='close', '手枪获得贴脸特性');

/* 5. 存档 */
console.log('=== 5. 存档 ===');
G.Save.auto(g);
const g2=new G.Game();
g2.init();
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
G.Save.restore(g2, G.Save.loadAuto());
check(g2.player.modules && g2.player.modules.shape.shape==='ball', '部件随存档恢复');
const w2=g2.player.weapons[0];
check(w2.shape==='ball' && w2.count===6, '改装武器随存档恢复');

/* 6. 拆解机房间 */
console.log('=== 6. 拆解机房间 ===');
let hasDis=false;
for(let t=0;t<40;t++){
  const m=G.Dungeon.generate(2,0,{seed:700+t});
  for(const r of m.rooms) if(r.type==='disassembler') hasDis=true;
}
check(hasDis, 'disassembler 房出现');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n拆解机测试通过 ✔');
