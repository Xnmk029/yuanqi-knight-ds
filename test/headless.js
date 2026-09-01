/* 无头冒烟测试：模拟 DOM 跑完整游戏逻辑 */
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
global.window = global;
global.localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=v;}, removeItem:k=>{delete store[k];} };
global.document = {
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

const files=['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js'];
for(const f of files){
  const code=fs.readFileSync(path.join(ROOT,'js',f),'utf8');
  try{ vm.runInThisContext(code,{filename:f}); }
  catch(e){ console.error('LOAD FAIL '+f+': '+e.stack); process.exit(1); }
}
const G=global.G, U=G.U;
console.log('已加载: 武器 '+G.Weapons.list.length+' / 怪物 '+G.Enemies.list.length+' (BOSS '+G.Enemies.bosses.length+') / 祝福 '+G.Buffs.length+' / 英雄 '+G.Heroes.length);

let errors=[];
function guard(label,fn){ try{ fn(); }catch(e){ errors.push(label+': '+(e&&e.stack||e)); } }

const IN=G.Input;
function frames(g,n,opts){
  opts=opts||{};
  for(let i=0;i<n;i++){
    IN.keys={}; IN.hits={};
    if(opts.move){ IN.keys[opts.move]=true; }
    IN.down = !!opts.fire;
    if(opts.skill && i%40===0) IN.rdownHit=true;
    if(opts.ult && i%120===0) IN.hits[' ']=true;
    if(opts.dodge && i%50===0) IN.hits['shift']=true;
    if(opts.swap && i%90===0) IN.hits['q']=true;
    IN.mx=640+Math.cos(i*0.05)*200; IN.my=360+Math.sin(i*0.05)*150;
    guard('update@'+i,()=>g.update(1/60));
    guard('draw@'+i,()=>{ g.draw(); g.drawHUD(); });
    IN.end();
    if(errors.length>6) return;
  }
}

/* ---------- 1. 每位英雄跑一遍 ---------- */
for(const H of G.Heroes){
  const g=new G.Game();
  guard('init',()=>g.init());
  guard('start '+H.id,()=>g.start(H.id));
  g.onUpgrade=function(picks){ g.applyBuff(picks[0]); };
  g.onGameOver=function(){};
  g.onWin=function(){};
  g.player.hp=99999; g.player.maxHp=99999;
  frames(g,120,{move:'d',fire:true,skill:true,ult:true,dodge:true,swap:true});
  if(errors.length) break;
}
console.log('英雄循环 OK, 错误 '+errors.length);

/* ---------- 2. 全武器 + 技能压力测试 ---------- */
{
  const g=new G.Game();
  g.init(); g.start('mage');
  g.onUpgrade=function(picks){ g.applyBuff(picks[0]); };
  g.onGameOver=function(){}; g.onWin=function(){};
  const p=g.player;
  p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  // 塞几个怪当靶子
  const room=g.map.startRoom;
  for(let i=0;i<6;i++) g.spawnEnemy(G.Enemies.pick(0,3), room.cx+U.rand(-90,90), room.cy+U.rand(-90,90),{});
  for(const w of G.Weapons.list){
    p.weapons=[]; p.wi=0;
    guard('give '+w.id,()=>p.giveWeapon(w,true));
    const inst=p.weapons[0];
    for(let k=0;k<10;k++){
      p.energy=1e6; inst.cd=-1; inst.skillCd=-1; p.charge=1;
      guard('fire '+w.id,()=>p.fire(g,inst,1));
      guard('skill '+w.id,()=>{ if(inst.skill) inst.skill.fn(g,p,inst); });
      guard('tick '+w.id,()=>g.update(1/60));
    }
    guard('drawW '+w.id,()=>{ g.draw(); g.drawHUD(); });
  }
  console.log('全武器测试完成, 子弹数 '+g.bullets.length+', 错误 '+errors.length);
  for(let i=0;i<200 && !errors.length;i++) guard('settle',()=>{ g.update(1/60); });
}

/* ---------- 3. 全怪物 AI ---------- */
{
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=function(picks){ g.applyBuff(picks[0]); };
  g.onGameOver=function(){}; g.onWin=function(){};
  const p=g.player; p.maxHp=1e6; p.hp=1e6;
  for(const d of G.Enemies.list){
    g.enemies.length=0;
    const room=g.curRoom;
    guard('spawn '+d.id,()=>g.spawnEnemy(d.id, room.cx+40, room.cy+40,{}));
    for(let i=0;i<70;i++){
      IN.keys={}; IN.hits={};
      if(g.enemies[0]) g.enemies[0].hp = g.enemies[0].maxHp*(1 - (i/70)*0.95);
      guard('ai '+d.id+'@'+i,()=>g.update(1/60));
      guard('aidraw '+d.id,()=>g.draw());
      IN.end();
      if(errors.length>3) break;
    }
    if(errors.length>3) break;
  }
  console.log('全怪物 AI 测试完成, 错误 '+errors.length);
}

/* ---------- 4. 完整闯关：遍历所有楼层与房间 ---------- */
{
  const g=new G.Game();
  g.init(); g.start('robot');
  g.onUpgrade=function(picks){ g.applyBuff(picks[U.randi(0,picks.length)]); };
  let over=false;
  g.onGameOver=function(){ over=true; };
  g.onWin=function(){ over=true; };
  const p=g.player;
  p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6;
  let visited=0, floorsDone=0, stuckRun=0;
  for(let floorLoop=0; floorLoop<13 && !over && !errors.length; floorLoop++){
    const rooms=g.map.rooms.slice();
    for(const r of rooms){
      if(over||errors.length) break;
      p.x=r.cx; p.y=r.cy; p.energy=1e6;
      visited++;
      for(let i=0;i<260;i++){
        IN.keys={}; IN.hits={};
        IN.down=true;
        if(i%30===0) IN.hits['e']=true;
        if(i%37===0) IN.rdownHit=true;
        if(i%90===0) IN.hits[' ']=true;
        IN.mx=640+Math.cos(i*0.11)*300; IN.my=360+Math.sin(i*0.11)*200;
        // 无敌 + 秒杀，加速推进
        p.hp=1e6; p.iframe=1;
        if(i>40){ for(const e of g.enemies.slice()){ if(e.team!=='ally' && !e.dead) guard('kill',()=>g.damageEnemy(e,1e7,{silent:true})); } }
        guard('run@f'+g.floorNum,()=>g.update(1/60));
        guard('rundraw',()=>{ g.draw(); g.drawHUD(); });
        if(G.solidCircle(g,p.x,p.y,p.r)){ stuckRun++; if(stuckRun>25){ errors.push('玩家卡在实心格超过25帧 @第'+g.floorNum+'层'); stuckRun=0; } }
        else stuckRun=0;
        IN.end();
        if(errors.length>3) break;
        if(g.state==='upgrade'){ g.state='playing'; }
        if(r.cleared && i>60) break;
      }
    }
    // 找传送门下一层
    const portal=g.inter.filter(x=>x.kind==='portal')[0];
    if(portal && !over){
      floorsDone++;
      guard('nextFloor',()=>portal.act());
    } else break;
  }
  console.log('闯关测试: 访问房间 '+visited+', 通过楼层 '+floorsDone+', 状态 '+g.state+', 错误 '+errors.length);
}

/* ---------- 5. 门口卡死回归测试（复现：进入未清理新房间被卡在门上） ---------- */
{
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=function(picks){ g.applyBuff(picks[0]); };
  g.onGameOver=function(){}; g.onWin=function(){};
  const p=g.player; p.maxHp=1e6; p.hp=1e6;
  let tested=0, stuck=0, locked=0;
  for(const r of g.map.rooms){
    if(r.cleared) continue;
    for(const d of r.doors){
     // 沿门→房间方向扫一遍起点，覆盖整个"半进门"危险带
     const ux=(r.cx-d.cx), uy=(r.cy-d.cy), ul=Math.hypot(ux,uy)||1;
     for(const off of [-16,-10,-6,-2,0,4,8,14]){
      p.x=d.cx+ux/ul*off; p.y=d.cy+uy/ul*off; p.vx=0; p.vy=0;
      g.curRoom=null; r.active=false; r.cleared=false;
      for(const dd of r.doors) dd.open=true;
      for(let i=0;i<100;i++){
        IN.keys={}; IN.hits={};
        const ax=r.cx-p.x, ay=r.cy-p.y;
        IN.keys[Math.abs(ax)>Math.abs(ay)?(ax>0?'d':'a'):(ay>0?'s':'w')]=true;
        p.hp=1e6; p.iframe=1;
        guard('door',()=>g.update(1/60));
        IN.end();
        if(errors.length>3) break;
      }
      tested++;
      if(r.active) locked++;
      if(G.solidCircle(g,p.x,p.y,p.r)){ stuck++; errors.push('门口卡死: 房间#'+r.idx+' 起点偏移'+off); }
      g.enemies.length=0;
      if(errors.length>3) break;
     }
     if(errors.length>3) break;
    }
    if(errors.length>3) break;
  }
  console.log('门口回归测试: 测试 '+tested+' 个门, 成功封锁 '+locked+' 次, 卡死 '+stuck+' 次');
}

if(errors.length){
  console.log('\n===== 发现 '+errors.length+' 个错误 =====');
  errors.slice(0,10).forEach(e=>console.log('- '+e+'\n'));
  process.exit(1);
} else {
  console.log('\n全部测试通过 ✔');
}
