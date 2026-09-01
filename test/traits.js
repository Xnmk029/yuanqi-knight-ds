/* 武器特性功能验证：确认每条特性都真实生效 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');
function makeCtx(){ const s={}; const gr={addColorStop(){}};
  return new Proxy({},{get(t,p){ if(p in s)return s[p]; if(p==='canvas')return{width:640,height:360};
    if(p==='measureText')return()=>({width:20}); if(p==='createLinearGradient'||p==='createRadialGradient')return()=>gr;
    if(typeof p==='symbol')return undefined; return ()=>{}; }, set(t,p,v){s[p]=v;return true;}, has(){return true;}}); }
function cv(w,h){ return {width:w||300,height:h||150,style:{},getContext:()=>makeCtx(),
  getBoundingClientRect:()=>({left:0,top:0,width:640,height:360}),addEventListener(){},removeEventListener(){}}; }
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.document={readyState:'complete',getElementById:id=>(id==='game'?cv(640,360):(id==='hud'?cv(1280,720):null)),
  createElement:()=>cv(),querySelectorAll:()=>[],addEventListener(){}};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=()=>{}; global.removeEventListener=()=>{}; global.requestAnimationFrame=()=>0;
for(const f of ['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, W=G.Weapons;

function newGame(){
  const g=new G.Game(); g.init(); g.start('knight');
  g.onUpgrade=p=>g.applyBuff(p[0]); g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e9; p.energy=1e9;
  p.up.crit=-1; // 关闭暴击随机性，保证数值可比
  return g;
}
function equip(g,id){ const p=g.player; p.weapons=[]; p.wi=0; p.giveWeapon(W.get(id),true); return p.weapons[0]; }
function dummy(g,dx,dy){ g.enemies.length=0;
  const e=g.spawnEnemy('slime', g.player.x+(dx||60), g.player.y+(dy||0), {hpScale:400}); e.spawnT=0; return e; }

const results=[];
function check(name, cond, info){ results.push({name, ok:!!cond, info:info||''}); }

/* heat 过热连射：射速应随连续开火提升 */
{ const g=newGame(), p=g.player, w=equip(g,'smg');
  p.aim=0; w.cd=-1; p.fire(g,w,1); const first=w.cd;
  for(let i=0;i<14;i++){ w.cd=-1; p.fire(g,w,1); }
  check('heat 过热连射', w.cd < first*0.75 && w.heat>0.5, '首发间隔'+first.toFixed(3)+'s → 连射后'+w.cd.toFixed(3)+'s, 热度'+w.heat.toFixed(2));
}
/* everyN 蓄能弹：每第3发体积/伤害显著提升 */
{ const g=newGame(), p=g.player, w=equip(g,'pistol');
  p.aim=0; const rs=[];
  for(let i=0;i<6;i++){ g.bullets.length=0; w.cd=-1; p.fire(g,w,1); rs.push(g.bullets[0]?g.bullets[0].r:0); }
  check('everyN 蓄能弹', rs[2]>rs[1]*1.5 && rs[5]>rs[4]*1.5, '各发半径 '+rs.map(x=>x.toFixed(1)).join(','));
}
/* burst 三连爆发：一次触发共发射 3 轮（统计发射次数而非存活子弹） */
{ const g=newGame(), p=g.player, w=equip(g,'rifle');
  p.aim=0;
  let spawned=0;
  const orig=g.spawnBullet.bind(g);
  g.spawnBullet=function(o){ spawned++; return orig(o); };
  w.cd=-1; p.fire(g,w,1);
  for(let i=0;i<30;i++) g.update(1/60);
  g.spawnBullet=orig;
  check('burst 三连爆发', spawned>=3, '共发射 '+spawned+' 发');
}
/* magazine 弹夹：打空后进入装填且无法开火 */
{ const g=newGame(), p=g.player, w=equip(g,'rpg');
  p.aim=0;
  for(let i=0;i<(w.magSize||3);i++){ w.cd=-1; p.fire(g,w,1); }
  const reloading=w.reload>0;
  g.bullets.length=0; w.cd=-1; p.fire(g,w,1);
  check('magazine 弹夹装填', reloading && g.bullets.length===0, '装填计时 '+w.reload.toFixed(2)+'s, 装填中开火='+g.bullets.length+'发');
}
/* close 贴脸压制 vs long 远程精准：距离修正方向相反 */
{ function rangeDmg(trait, travel){
    const g=newGame(), p=g.player; g.enemies.length=0; g.props.length=0;
    const e=g.spawnEnemy('slime', p.x+40, p.y, {hpScale:2000}); e.spawnT=0; e.spd=0;
    const hp0=e.hp;
    const b=g.spawnBullet({x:e.x-16, y:e.y, ang:0, spd:200, dmg:10, r:4, color:'#fff',
      shape:'ball', team:'player', life:2});
    b.trait=trait; b.ox=b.x-travel; b.oy=b.y;   // 伪造"已飞行距离"，隔离验证距离公式
    for(let i=0;i<30 && e.hp===hp0;i++) g.update(1/60);
    return hp0-e.hp;
  }
  const near=rangeDmg('close',10), far=rangeDmg('close',400);
  check('close 贴脸压制', near>far*1.4, '近距 '+near.toFixed(1)+' vs 远距 '+far.toFixed(1));
  const n2=rangeDmg('long',10), f2=rangeDmg('long',400);
  check('long 远程精准', f2>n2*1.4, '远距 '+f2.toFixed(1)+' vs 近距 '+n2.toFixed(1));
}
/* split 碎裂弹：命中后额外产生碎片 */
{ const g=newGame(), p=g.player, w=equip(g,'grenade'); p.aim=0;
  const e=dummy(g,70,0); g.bullets.length=0; w.cd=-1; p.fire(g,w,1);
  let maxAfterHit=0, hit=false;
  for(let i=0;i<60;i++){ const before=g.bullets.length; g.update(1/60);
    if(!hit && e.hp<e.maxHp){ hit=true; maxAfterHit=g.bullets.length; } }
  check('split 碎裂弹', hit && maxAfterHit>=2, '命中后场上碎片 '+maxAfterHit+' 发');
}
/* frostbite 霜寒累积：隔离验证——用不自带冻结的子弹，确认满 3 层才触发 */
{ const g=newGame(), p=g.player;
  const e=dummy(g,60,0); e.frozen=0; e.chillStack=0;
  const states=[];
  for(let k=0;k<3;k++){
    const b=g.spawnBullet({x:p.x,y:p.y,ang:0,spd:600,dmg:5,r:4,color:'#9fe4ff',shape:'ice',team:'player',life:2});
    b.trait='frostbite'; b.freeze=0; b.ox=b.x; b.oy=b.y;
    for(let i=0;i<40 && !b.dead;i++) g.update(1/60);
    states.push({stack:e.chillStack||0, frozen:e.frozen});
  }
  const ok = states[0].frozen<=0 && states[1].frozen<=0 && states[2].frozen>=2.0;
  check('frostbite 霜寒累积', ok, '1层冻结='+states[0].frozen.toFixed(1)+' 2层='+states[1].frozen.toFixed(1)+' 3层='+states[2].frozen.toFixed(1)+'s');
}
/* chain 电弧传导：命中后波及第二个敌人 */
{ const g=newGame(), p=g.player, w=equip(g,'tesla'); p.aim=0;
  g.enemies.length=0;
  const a=g.spawnEnemy('slime',p.x+60,p.y,{hpScale:400}); a.spawnT=0;
  const b=g.spawnEnemy('slime',p.x+80,p.y+30,{hpScale:400}); b.spawnT=0;
  const hp0=b.hp;
  for(let k=0;k<3;k++){ w.cd=-1; p.fire(g,w,1); for(let i=0;i<40;i++) g.update(1/60); }
  check('chain 电弧传导', b.hp<hp0, '第二目标受到 '+(hp0-b.hp).toFixed(0)+' 伤害');
}
/* growing 滚雪球：飞行中伤害与体积增长 */
{ const g=newGame(), p=g.player, w=equip(g,'plasma'); p.aim=0;
  g.enemies.length=0; g.bullets.length=0; w.cd=-1; p.fire(g,w,1);
  const b=g.bullets[0]; const d0=b.dmg, r0=b.r;
  for(let i=0;i<40;i++) g.update(1/60);
  check('growing 滚雪球', b.dmg>d0*1.2 && b.r>r0, '伤害 '+d0.toFixed(0)+'→'+b.dmg.toFixed(0)+', 半径 '+r0.toFixed(1)+'→'+b.r.toFixed(1));
}
/* ricochet 蓄力跳弹：真实撞墙反弹后伤害提升 */
{ const g=newGame(), p=g.player;
  g.enemies.length=0;
  let wallD=null, dir=[1,0];
  for(const d2 of [[1,0],[-1,0],[0,1],[0,-1]]){
    for(let d=24; d<600; d+=6){
      if(g.bulletSolidAt(p.x+d2[0]*d, p.y+d2[1]*d)){ if(wallD===null||d<wallD){ wallD=d; dir=d2; } break; }
    }
  }
  const b=g.spawnBullet({x:p.x, y:p.y, ang:Math.atan2(dir[1],dir[0]), spd:400, dmg:10, r:4, color:'#fff',
    shape:'ball', team:'player', bounce:3, life:9});
  b.trait='ricochet'; const d0=b.dmg, bo=b.bounce;
  for(let i=0;i<200 && b.bounce===bo && !b.dead; i++) g.update(1/60);
  check('ricochet 蓄力跳弹', b.bounce<bo && b.dmg>d0*1.25,
    '墙距'+wallD+'px, 反弹后伤害 '+d0.toFixed(0)+'→'+b.dmg.toFixed(0)+' (剩余弹跳'+b.bounce+')');
}
/* execute 处决：残血敌人双倍近战伤害 */
{ function meleeHit(hpFrac){
    const g=newGame(), p=g.player, w=equip(g,'hammer'); p.aim=0;
    const e=dummy(g,30,0); e.hp=e.maxHp*hpFrac; const hp0=e.hp;
    w.cd=-1; p.fire(g,w,1);
    for(let i=0;i<30 && e.hp===hp0;i++) g.update(1/60);
    return hp0-e.hp;
  }
  const low=meleeHit(0.2), high=meleeHit(0.95);
  check('execute 处决', low>high*1.6, '残血 '+low.toFixed(0)+' vs 满血 '+high.toFixed(0));
}
/* overload 能量过载 */
{ function shot(energyFrac){
    const g=newGame(), p=g.player, w=equip(g,'laser_gun'); p.aim=0;
    p.maxEnergy=100; p.energy=100*energyFrac;
    g.bullets.length=0; w.cd=-1; p.fire(g,w,1);
    return g.bullets[0]?g.bullets[0].dmg:0;
  }
  check('overload 能量过载', shot(1)>shot(0.3)*1.3, '满能量 '+shot(1).toFixed(0)+' vs 低能量 '+shot(0.3).toFixed(0));
}
/* lock 静止锁定 */
{ const g=newGame(), p=g.player, w=equip(g,'homing'); p.aim=0;
  p.stillT=0; g.bullets.length=0; w.cd=-1; p.fire(g,w,1); const h0=g.bullets[0].homing;
  p.stillT=1.0; g.bullets.length=0; w.cd=-1; p.fire(g,w,1); const h1=g.bullets[0].homing;
  check('lock 静止锁定', h1>h0, '追踪强度 '+h0.toFixed(1)+' → '+h1.toFixed(1));
}
/* killCharge 猎杀充能 / harvest 收割 */
{ const g=newGame(), p=g.player; equip(g,'necro_staff');
  p.maxEnergy=100; p.energy=10;
  const e=dummy(g,60,0); g.damageEnemy(e,1e9,{silent:true});
  check('killCharge 猎杀充能', p.energy>10, '能量 10 → '+p.energy.toFixed(1));
}
{ const g=newGame(), p=g.player; equip(g,'scythe');
  p.maxHp=200; p.hp=100;
  const e=dummy(g,60,0); g.damageEnemy(e,1e9,{silent:true});
  check('harvest 收割', p.hp>100, '生命 100 → '+p.hp.toFixed(0));
}

console.log('=== 武器特性功能验证 ===');
let bad=0;
for(const r of results){
  console.log((r.ok?'  ✔ ':'  ✘ ')+r.name.padEnd(18)+r.info);
  if(!r.ok) bad++;
}
console.log(bad? ('\n有 '+bad+' 条特性未生效'):'\n全部特性验证通过 ✔');
process.exit(bad?1:0);
