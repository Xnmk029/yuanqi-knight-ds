/* 模块化合成验证：A 形态 + B 技能 + B 特性 */
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

/* 1. 基本合成：A=霰弹枪(形态) + B=寒冰法杖(技能+特性+元素) */
console.log('=== 1. 基本合成 ===');
const A=Wp.get('shotgun'), B=Wp.get('ice_staff');
const fused=Wp.fuse(A,B);
check(fused.type==='gun' && fused.count===A.count, '保留 A 形态（霰弹枪弹道）');
check(fused.skill===B.skill, '获得 B 技能（冰封新星）');
check(fused.skill.name==='绝对暴雪', '技能名正确');
check(fused.trait===B.trait, '获得 B 特性（frostbite 霜寒累积）');
check(fused.freeze>0, '获得 B 元素（冻结）');
check(fused.name.indexOf('绝对暴雪')===0, '命名含技能名: '+fused.name);
check(fused.dmg>0 && fused.rarity>=Math.max(A.rarity,B.rarity), '数值/稀有度正确');

/* 2. 技能可触发 */
console.log('=== 2. 技能触发 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
p.weapons=[]; p.wi=0;
p.giveWeapon(fused,true);
const w=p.weapons[0];
w.skillCd=0;
w.skill.fn(g,p,w);
check(!!p.buffs.blizzard, '技能生效（绝对暴雪 buff）');

/* 3. 特性生效（frostbite 霜寒累积：3 层冻结） */
console.log('=== 3. 特性生效 ===');
const e=g.spawnEnemy('slime', p.x+60, p.y, {});
e.chillStack=2;
const b=g.spawnBullet({x:e.x,y:e.y,ang:0,spd:400,dmg:5,r:3,color:'#fff',shape:'ball',team:'player',pierce:0});
b.trait='frostbite'; /* 游戏内由 emitShot 设置 */
b.checkHit(g);
check(e.frozen>0, '霜寒累积 3 层触发冻结 frozen='+e.frozen.toFixed(1));

/* 4. 组合爆炸：遍历所有 A×B */
console.log('=== 4. 组合爆炸 ===');
let combos=0, named=0, withSkill=0, withTrait=0;
const ids=Wp.list.map(x=>x.id);
for(const aid of ids){
  for(const bid of ids){
    if(aid===bid) continue;
    const f=Wp.fuse(Wp.get(aid), Wp.get(bid));
    combos++;
    if(f.name && f.name.length>0) named++;
    if(f.skill) withSkill++;
    if(f.trait) withTrait++;
    /* 关键不变量：形态来自 A，技能/特性来自 B */
    if(f.type!==Wp.get(aid).type){ check(false, aid+'×'+bid+' 形态错误'); }
    if(f.skill && f.skill!==Wp.get(bid).skill){ check(false, aid+'×'+bid+' 技能错误'); }
    if(f.trait && f.trait!==Wp.get(bid).trait){ check(false, aid+'×'+bid+' 特性错误'); }
  }
}
console.log('  组合数:', combos, ' 命名:', named, ' 带技能:', withSkill, ' 带特性:', withTrait);
check(combos===48*47, '组合数 = 48×47 = '+combos);
check(named===combos, '全部有名字');
check(withSkill>0 && withTrait>0, '技能/特性组合存在');

/* 5. 特殊组合：melee 技能挂到 gun 上 */
console.log('=== 5. 跨类型组合 ===');
const f2=Wp.fuse(Wp.get('pistol'), Wp.get('greatsword'));
check(f2.skill===Wp.get('greatsword').skill, '巨剑技能（崩山击）挂到手枪');
check(f2.trait==='execute', '处决特性挂到手枪');
const g2=new G.Game();
g2.init(); g2.start('knight');
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
const p2=g2.player; p2.maxHp=1e6; p2.hp=1e6; p2.maxEnergy=1e6; p2.energy=1e6;
p2.weapons=[]; p2.wi=0;
p2.giveWeapon(f2,true);
const w2=p2.weapons[0];
w2.skillCd=0;
w2.skill.fn(g2,p2,w2); /* 崩山击 = leapSlam */
check(p2.dashT>0, '崩山击在手枪上可触发（leapSlam）');

/* 6. magazine 特性字段依赖 */
console.log('=== 6. 字段依赖 ===');
const f3=Wp.fuse(Wp.get('pistol'), Wp.get('rpg'));
check(f3.trait==='magazine' && f3.magSize===3 && f3.reloadTime===1.25, 'magazine 字段随特性转移 magSize='+f3.magSize);

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n模块化合成验证通过 ✔');
