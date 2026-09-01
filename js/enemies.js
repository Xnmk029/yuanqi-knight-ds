/* 元气骑士·深渊回响 —— 怪物图鉴与 AI */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var TAU = Math.PI*2;
var E = { defs:{}, list:[], pools:[[],[],[],[],[],[]], bosses:[], AI:{} };
G.Enemies = E;

/* ---------- 移动辅助 ---------- */
function moveTo(e,tx,ty,dt,m){
  var a=Math.atan2(ty-e.y,tx-e.x), s=e.spd*(m===undefined?1:m);
  e.vx=U.damp(e.vx,Math.cos(a)*s,7,dt); e.vy=U.damp(e.vy,Math.sin(a)*s,7,dt);
  e.face = Math.cos(a)>=0?1:-1;
}
function moveAway(e,tx,ty,dt,m){ moveTo(e,e.x*2-tx,e.y*2-ty,dt,m); }
function halt(e,dt){ e.vx=U.damp(e.vx,0,6,dt); e.vy=U.damp(e.vy,0,6,dt); }
function orbitMove(e,tx,ty,dt,radius,dir,m){
  var a=Math.atan2(e.y-ty,e.x-tx), d=U.dist(e.x,e.y,tx,ty);
  var ta=a+dir*0.9, tr=radius+(d-radius)*0.25;
  var px=tx+Math.cos(ta)*tr, py=ty+Math.sin(ta)*tr;
  moveTo(e,px,py,dt,m);
  e.face = tx>e.x?1:-1;
}
function dist(e,p){ return U.dist(e.x,e.y,p.x,p.y); }
function aimAt(e,p){ return U.ang(e.x,e.y,p.x,p.y); }
E.moveTo=moveTo; E.halt=halt; E.orbitMove=orbitMove;

/* ---------- AI 行为 ---------- */
var AI = E.AI;

AI.chase = function(e,g,dt,p){
  moveTo(e,p.x,p.y,dt, e.frozen>0?0.35:1);
  if(e.def.atk && e.atkCd<=0 && dist(e,p) < (e.def.atk.range||420)){
    if(e.def.atk.fn(g,e,p)!==false) e.atkCd = e.def.atk.cd;
  }
};
AI.wander = function(e,g,dt,p){
  e.wt=(e.wt||0)-dt;
  if(e.wt<=0){ e.wt=U.rand(0.7,1.7); e.wa=U.rand(0,TAU); }
  var d=dist(e,p);
  if(d<260) moveTo(e,p.x,p.y,dt,0.9);
  else moveTo(e,e.x+Math.cos(e.wa)*50,e.y+Math.sin(e.wa)*50,dt,0.5);
  if(e.def.atk && e.atkCd<=0 && d<(e.def.atk.range||300)){ if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd; }
};
AI.keepDist = function(e,g,dt,p){
  var d=dist(e,p), want=e.def.pref||180;
  if(d<want*0.72) moveAway(e,p.x,p.y,dt,1.0);
  else if(d>want*1.35) moveTo(e,p.x,p.y,dt,0.92);
  else orbitMove(e,p.x,p.y,dt,want,e.dir||1,0.62);
  if(e.atkCd<=0 && d<(e.def.atk.range||420) && g.los(e.x,e.y,p.x,p.y)){
    if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd;
  }
};
AI.orbit = function(e,g,dt,p){
  orbitMove(e,p.x,p.y,dt,e.def.pref||130,e.dir||1,1);
  if(e.atkCd<=0 && e.def.atk){ if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd; }
};
AI.charger = function(e,g,dt,p){
  e.state=e.state||'walk';
  if(e.state==='walk'){
    moveTo(e,p.x,p.y,dt,0.55);
    if(dist(e,p)<(e.def.chargeRange||210) && e.atkCd<=0 && g.los(e.x,e.y,p.x,p.y)){ e.state='wind'; e.st=0.55; e.ca=aimAt(e,p); }
  } else if(e.state==='wind'){
    halt(e,dt); e.st-=dt; e.ca=U.rotTo(e.ca,aimAt(e,p),2.4*dt); e.flashTell=1;
    if(e.st<=0){ e.state='dash'; e.st=(e.def.dashTime||0.55); e.vx=Math.cos(e.ca)*(e.def.dashSpd||430); e.vy=Math.sin(e.ca)*(e.def.dashSpd||430);
      e.charging=true; if(e.def.onDash) e.def.onDash(g,e,p); }
  } else {
    e.st-=dt; e.vx*=Math.pow(0.35,dt); e.vy*=Math.pow(0.35,dt);
    if(e.st<=0){ e.state='walk'; e.charging=false; e.atkCd=e.def.atk?e.def.atk.cd:2.4; }
  }
};
AI.flyer = function(e,g,dt,p){
  e.fly=true;
  var a=aimAt(e,p), d=dist(e,p);
  var wob=Math.sin(e.t*(e.def.wobF||4)+e.seed)* (e.def.wob||0.6);
  var ta=a+wob;
  var m = d<70?0.5:1;
  e.vx=U.damp(e.vx,Math.cos(ta)*e.spd*m,5,dt);
  e.vy=U.damp(e.vy,Math.sin(ta)*e.spd*m,5,dt);
  e.face=Math.cos(a)>=0?1:-1;
  if(e.def.atk && e.atkCd<=0 && d<(e.def.atk.range||300)){ if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd; }
};
AI.turret = function(e,g,dt,p){
  halt(e,dt);
  e.aimA = U.rotTo(e.aimA===undefined?0:e.aimA, aimAt(e,p), 2.2*dt);
  e.face = Math.cos(e.aimA)>=0?1:-1;
  if(e.atkCd<=0 && dist(e,p)<(e.def.atk.range||420) && g.los(e.x,e.y,p.x,p.y)){
    if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd;
  }
};
AI.bomber = function(e,g,dt,p){
  moveTo(e,p.x,p.y,dt,1.15);
  if(dist(e,p)<(e.def.fuseRange||42) && !e.fusing){ e.fusing=true; e.fuse=0.6; }
  if(e.fusing){ e.fuse-=dt; e.flashTell=1; halt(e,dt*0.5); if(e.fuse<=0) e.hp=-1; }
};
AI.summoner = function(e,g,dt,p){
  var d=dist(e,p);
  if(d<210) moveAway(e,p.x,p.y,dt,0.95); else if(d>330) moveTo(e,p.x,p.y,dt,0.7); else halt(e,dt);
  if(e.atkCd<=0){
    var n=g.countEnemiesOfKind(e.def.summon);
    if(n < (e.def.maxMinions||6)){
      for(var i=0;i<(e.def.summonCount||2);i++){
        var a=U.rand(0,TAU), r=U.rand(24,44);
        g.spawnEnemy(e.def.summon, e.x+Math.cos(a)*r, e.y+Math.sin(a)*r, {spawnFx:true});
      }
      g.burst(e.x,e.y,14,{color:e.def.look.c3||'#a8ff9a',spd:120,life:0.5});
      e.atkCd=e.def.atk.cd;
    } else e.atkCd=1.2;
  }
};
AI.teleporter = function(e,g,dt,p){
  e.state=e.state||'idle';
  if(e.state==='idle'){
    halt(e,dt);
    e.tpT=(e.tpT||U.rand(1,2))-dt;
    if(e.atkCd<=0 && g.los(e.x,e.y,p.x,p.y) && dist(e,p)<420){ if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd; }
    if(e.tpT<=0){ e.state='out'; e.st=0.28; }
  } else if(e.state==='out'){
    e.st-=dt; e.alpha=Math.max(0,e.st/0.28); halt(e,dt);
    if(e.st<=0){
      var a=U.rand(0,TAU), r=U.rand(90,170);
      var nx=p.x+Math.cos(a)*r, ny=p.y+Math.sin(a)*r;
      if(!g.solidAt(nx,ny)){ e.x=nx; e.y=ny; }
      g.burst(e.x,e.y,16,{color:e.def.look.c3||'#c07aff',spd:150,life:0.5});
      e.state='in'; e.st=0.25;
    }
  } else {
    e.st-=dt; e.alpha=1-Math.max(0,e.st/0.25);
    if(e.st<=0){ e.state='idle'; e.alpha=1; e.tpT=U.rand(1.6,3.2); }
  }
};
AI.spinner = function(e,g,dt,p){
  moveTo(e,p.x,p.y,dt,0.5);
  e.spinA=(e.spinA||0)+dt*(e.def.spinSpd||2.2);
  if(e.atkCd<=0){
    var n=e.def.arms||4;
    for(var i=0;i<n;i++) e.shoot(e.spinA+i/n*TAU,{spd:170,dmg:e.def.bdmg||8,r:5,color:e.def.look.c3||'#ff9ad8',shape:'ball',life:2.6});
    e.atkCd=e.def.atk.cd;
  }
};
AI.mortar = function(e,g,dt,p){
  var d=dist(e,p);
  if(d<170) moveAway(e,p.x,p.y,dt,0.8); else if(d>380) moveTo(e,p.x,p.y,dt,0.7); else halt(e,dt);
  if(e.atkCd<=0 && d<460){
    var n=e.def.shells||3;
    for(var i=0;i<n;i++) (function(i){ g.delayed(i*0.22,function(){
      if(e.dead) return;
      g.skyStrike(p.x+U.rand(-46,46), p.y+U.rand(-46,46), e.def.bdmg||14, e.def.look.c3||'#ff7a3c','mortar', e.def.aoe||54);
    }); })(i);
    e.atkCd=e.def.atk.cd;
  }
};
AI.healer = function(e,g,dt,p){
  var ally=g.mostHurtEnemy(e);
  if(dist(e,p)<150) moveAway(e,p.x,p.y,dt,1.0);
  else if(ally) moveTo(e,ally.x,ally.y,dt,0.8);
  else moveAway(e,p.x,p.y,dt,0.5);
  e.healT=(e.healT||0)-dt;
  if(e.healT<=0){
    e.healT=1.4;
    var list=g.enemiesInRadius(e.x,e.y,120);
    for(var i=0;i<list.length;i++){
      var o=list[i]; if(o===e) continue;
      o.hp=Math.min(o.maxHp,o.hp+o.maxHp*0.09);
      g.beamFx(e.x,e.y,o.x,o.y,'#7dffb0',0.3);
    }
    e.shield=1.2;
  }
};
AI.shielded = function(e,g,dt,p){
  moveTo(e,p.x,p.y,dt,0.72);
  e.shieldA=aimAt(e,p);
  e.blockFront=true;
  if(e.def.atk && e.atkCd<=0 && dist(e,p)<(e.def.atk.range||70)){
    if(e.def.atk.fn(g,e,p)!==false) e.atkCd=e.def.atk.cd;
  }
};
AI.swarm = function(e,g,dt,p){
  e.fly=true;
  var a=aimAt(e,p)+Math.sin(e.t*7+e.seed)*0.9;
  e.vx=U.damp(e.vx,Math.cos(a)*e.spd,6,dt);
  e.vy=U.damp(e.vy,Math.sin(a)*e.spd,6,dt);
  e.face=Math.cos(a)>=0?1:-1;
};
AI.sniper = function(e,g,dt,p){
  var d=dist(e,p);
  e.state=e.state||'aim';
  if(d<220) moveAway(e,p.x,p.y,dt,0.9);
  else if(d>420) moveTo(e,p.x,p.y,dt,0.6);
  else halt(e,dt);
  e.aimA = e.aimA===undefined?aimAt(e,p):U.rotTo(e.aimA,aimAt(e,p),1.6*dt);
  e.laserSight = e.atkCd<0.85 && g.los(e.x,e.y,p.x,p.y);
  if(e.atkCd<=0 && g.los(e.x,e.y,p.x,p.y)){
    e.shoot(e.aimA,{spd:640,dmg:e.def.bdmg||16,r:4,color:'#ff5b6e',shape:'laser',life:1.8,pierce:1});
    G.Audio.sfx.laser(); e.atkCd=e.def.atk.cd; e.laserSight=false;
  }
};
AI.boss = function(e,g,dt,p){
  var D=e.def;
  e.phase = e.phase||1;
  var ph = e.hp/e.maxHp;
  var np = ph<0.33?3:(ph<0.66?2:1);
  if(np>e.phase){ e.phase=np; e.patT=0; e.pat=null; e.iframe=0.6;
    g.burst(e.x,e.y,50,{color:D.look.c3||'#ffd45e',spd:260,life:0.9,r:5});
    g.shake(14); G.Audio.sfx.boss(); g.float('第 '+np+' 阶段!',e.x,e.y-e.r-20,'#ff6a6a'); }
  if(!e.pat || e.patT<=0){
    var pool = D.patterns.filter(function(q){ return (q.minPhase||1)<=e.phase; });
    var next = U.pick(pool);
    if(pool.length>1){ var guard=0; while(next===e.pat && guard++<6) next=U.pick(pool); }
    e.pat = next; e.patT = next.dur; e.patAge=0; e.atkCd=0; e.subT=0;
    if(next.start) next.start(g,e,p);
  }
  e.patT-=dt; e.patAge+=dt;
  e.pat.fn(g,e,dt,p);
};

/* ---------- 定义辅助 ---------- */
function ed(o){
  o.hp=o.hp||30; o.spd=o.spd||60; o.r=o.r||11; o.dmg=o.dmg||8;
  o.coins=o.coins===undefined?2:o.coins; o.ai=o.ai||'chase';
  o.look=o.look||{shape:'slime',c1:'#8ac06a',c2:'#4a7a3a',eye:'#fff'};
  o.biome = o.biome===undefined?0:o.biome;
  E.defs[o.id]=o; E.list.push(o);
  if(o.boss) E.bosses.push(o);
  else if(o.spawnable!==false){
    var bs = (o.biomes||[o.biome]);
    for(var i=0;i<bs.length;i++){ if(!E.pools[bs[i]]) E.pools[bs[i]]=[]; E.pools[bs[i]].push({id:o.id,w:o.weight||10,minFloor:o.minFloor||0}); }
  }
  return o;
}
function shootFan(g,e,p,n,spread,o){
  var a=aimAt(e,p);
  for(var i=0;i<n;i++) e.shoot(a+(n===1?0:(i/(n-1)-0.5)*spread), o);
}

/* ============================================================
                     生物群系 0 · 古堡地牢
   ============================================================ */
ed({ id:'slime', name:'史莱姆', hp:26, spd:52, r:11, dmg:8, coins:2, weight:14, biomes:[0,3],
  look:{shape:'slime',c1:'#7fd66a',c2:'#3d7a34',eye:'#fff',bob:0.16},
  desc:'地牢里最常见的软体生物，会分裂。',
  onDeath:function(g,e){ if(!e.small) for(var i=0;i<2;i++) g.spawnEnemy('slime_small',e.x+U.rand(-14,14),e.y+U.rand(-14,14)); } });
ed({ id:'slime_small', name:'小史莱姆', hp:11, spd:78, r:7, dmg:5, coins:1, spawnable:false, small:true,
  look:{shape:'slime',c1:'#9fe07a',c2:'#4d8a3a',eye:'#fff',bob:0.2}, desc:'分裂产物，速度更快。' });
ed({ id:'bat', name:'洞穴蝙蝠', hp:16, spd:118, r:9, dmg:7, coins:1, ai:'flyer', weight:12, biomes:[0,1,2],
  look:{shape:'bat',c1:'#6a5a8a',c2:'#3a2f52',eye:'#ff5d6e',bob:0.05}, wob:0.9, wobF:5.5,
  desc:'飞行迅捷，会无视地形冲向你。' });
ed({ id:'skeleton', name:'骷髅战士', hp:42, spd:66, r:12, dmg:11, coins:3, weight:12, biomes:[0,5],
  look:{shape:'humanoid',c1:'#d8d2c0',c2:'#8a8272',c3:'#6a6250',c4:'#e8e2d0',eye:'#ff8a3c',helm:1},
  desc:'不死的守卫，挥舞锈剑。' });
ed({ id:'skeleton_archer', name:'骷髅弓手', hp:32, spd:56, r:11, dmg:8, coins:3, ai:'keepDist', pref:210, weight:10, biomes:[0,5],
  look:{shape:'humanoid',c1:'#c8c2b0',c2:'#7a7262',c3:'#4a6a3a',c4:'#e0dac8',eye:'#8aff6a'},
  bdmg:9, atk:{ cd:1.6, range:380, fn:function(g,e,p){ shootFan(g,e,p,1,0,{spd:330,dmg:9,r:4,color:'#e8dcc0',shape:'arrow'}); } },
  desc:'远距离放冷箭的亡灵。' });
ed({ id:'goblin', name:'哥布林突袭者', hp:38, spd:82, r:11, dmg:13, coins:3, ai:'charger', weight:11, biomes:[0,3],
  chargeRange:220, dashSpd:460, dashTime:0.5,
  look:{shape:'humanoid',c1:'#7fae5a',c2:'#4a6a34',c3:'#a05a3a',c4:'#8fc06a',eye:'#ffe066'},
  desc:'蓄力后猛冲，注意闪避。' });
ed({ id:'dark_mage', name:'黑袍法师', hp:36, spd:50, r:11, dmg:9, coins:5, ai:'teleporter', weight:8, minFloor:2, biomes:[0,5],
  look:{shape:'humanoid',c1:'#5a3a8a',c2:'#2e1c4a',c3:'#c07aff',c4:'#3a2a52',eye:'#e0a0ff'},
  atk:{ cd:1.9, fn:function(g,e,p){ shootFan(g,e,p,3,0.5,{spd:230,dmg:10,r:5,color:'#c07aff',shape:'orb',life:2.6,homing:0.8}); } },
  desc:'瞬移并投掷追踪暗球。' });
ed({ id:'guard_knight', name:'堕落骑士', hp:88, spd:52, r:13, dmg:16, coins:6, ai:'shielded', weight:7, minFloor:2, biomes:[0,5],
  look:{shape:'knight',c1:'#8a90a8',c2:'#4a4f66',c3:'#c8ccd8',c4:'#e0c8a0',eye:'#ff5b5b',helm:1},
  atk:{ cd:2.2, range:64, fn:function(g,e,p){ shootFan(g,e,p,3,0.7,{spd:280,dmg:12,r:6,color:'#dfe6f0',shape:'slash',life:0.4,pierce:2}); } },
  desc:'正面盾牌可弹开子弹，绕后攻击。' });
ed({ id:'ghost', name:'游荡怨灵', hp:30, spd:74, r:11, dmg:10, coins:4, ai:'chase', weight:8, minFloor:2, biomes:[0,5], phasing:true,
  look:{shape:'ghost',c1:'#a8c8f0',c2:'#5a6a9a',c3:'#ffffff',eye:'#8ef0ff'},
  desc:'可以穿墙，无视一切阻挡。' });
ed({ id:'mimic', name:'宝箱怪', hp:120, spd:70, r:14, dmg:20, coins:30, ai:'charger', weight:1.2, minFloor:2, biomes:[0,1,2,3,4,5],
  chargeRange:260, dashSpd:520, dashTime:0.6,
  look:{shape:'skull',c1:'#8f5f37',c2:'#5c3c22',c3:'#ffd45e',eye:'#ff3c3c',horn:1},
  desc:'伪装成宝箱的贪婪魔物，掉落大量金币。' });

/* ============================================================
                     生物群系 1 · 霜寒冰窟
   ============================================================ */
ed({ id:'ice_slime', name:'寒冰史莱姆', hp:34, spd:50, r:11, dmg:9, coins:2, weight:13, biomes:[1],
  look:{shape:'slime',c1:'#9fe4ff',c2:'#3a7a9a',eye:'#fff',spike:1},
  atk:{ cd:2.4, range:240, fn:function(g,e,p){ for(var i=0;i<6;i++) e.shoot(i/6*TAU+e.t,{spd:150,dmg:7,r:4,color:'#9fe4ff',shape:'ice',life:2,freeze:1.2}); } },
  desc:'死亡与攻击时散射冰锥。' });
ed({ id:'yeti', name:'雪怪', hp:110, spd:58, r:16, dmg:18, coins:6, ai:'charger', weight:8, biomes:[1],
  chargeRange:250, dashSpd:520, dashTime:0.6,
  look:{shape:'golem',c1:'#e8f4ff',c2:'#a8c4d8',c3:'#6ab0d8',eye:'#3a6a8a'},
  onDash:function(g,e,p){ g.shake(5); },
  desc:'冲撞力惊人的雪原霸主。' });
ed({ id:'frost_mage', name:'冰霜巫师', hp:44, spd:52, r:11, dmg:9, coins:5, ai:'keepDist', pref:230, weight:10, biomes:[1],
  look:{shape:'humanoid',c1:'#5a8ac0',c2:'#2c4a6a',c3:'#c8ecff',c4:'#a8d8f0',eye:'#eaffff'},
  atk:{ cd:2.0, range:400, fn:function(g,e,p){ shootFan(g,e,p,5,0.8,{spd:250,dmg:9,r:4.5,color:'#9fe4ff',shape:'ice',freeze:1.6,life:2}); } },
  desc:'扇形冰锥，被击中会减速。' });
ed({ id:'ice_wisp', name:'霜灵', hp:24, spd:96, r:8, dmg:8, coins:3, ai:'orbit', pref:120, weight:10, biomes:[1,5],
  look:{shape:'wisp',c1:'#8ef0ff',c3:'#ffffff',eye:'#fff'},
  atk:{ cd:1.3, fn:function(g,e,p){ e.shoot(aimAt(e,p),{spd:290,dmg:8,r:4,color:'#8ef0ff',shape:'ice',freeze:1}); } },
  desc:'环绕玩家游走的寒霜精魂。' });
ed({ id:'penguin_bomb', name:'炸弹企鹅', hp:26, spd:104, r:10, dmg:6, coins:3, ai:'bomber', weight:9, biomes:[1],
  look:{shape:'blob',c1:'#2c3a4a',c2:'#16202c',c3:'#ffb43c',eye:'#fff'},
  bombR:74, bombDmg:24, bombColor:'#9fe4ff',
  desc:'自杀式冲锋，接近后会爆炸。' });
ed({ id:'ice_golem', name:'冰霜巨像', hp:180, spd:42, r:19, dmg:22, coins:10, ai:'mortar', weight:5, minFloor:2, biomes:[1],
  bdmg:18, aoe:60, shells:3,
  look:{shape:'golem',c1:'#a8d8f0',c2:'#5a8ab0',c3:'#eaffff',eye:'#eaffff'},
  atk:{ cd:3.0 }, desc:'投掷巨大冰块，砸落范围伤害。' });
ed({ id:'frost_wolf', name:'霜狼', hp:46, spd:132, r:11, dmg:14, coins:4, ai:'swarm', weight:10, biomes:[1,3],
  look:{shape:'bug',c1:'#8fb8d8',c2:'#4a6a8a',c3:'#c8e8ff',eye:'#ffd45e'},
  desc:'成群结队，速度极快。' });

/* ============================================================
                     生物群系 2 · 熔火深渊
   ============================================================ */
ed({ id:'imp', name:'小恶魔', hp:30, spd:104, r:9, dmg:9, coins:3, ai:'flyer', weight:13, biomes:[2],
  wob:0.8, wobF:4.5,
  look:{shape:'bat',c1:'#d0543a',c2:'#7a2a1a',c3:'#ffb43c',eye:'#ffe066',horn:1},
  atk:{ cd:1.7, range:340, fn:function(g,e,p){ e.shoot(aimAt(e,p),{spd:270,dmg:9,r:5,color:'#ff8a2a',shape:'flame',burn:1.6,life:1.6}); } },
  desc:'飞行的火焰投掷者。' });
ed({ id:'lava_slug', name:'岩浆蠕虫', hp:58, spd:44, r:13, dmg:13, coins:4, weight:10, biomes:[2],
  look:{shape:'worm',c1:'#e06a2a',c2:'#7a2a10',c3:'#ffd45e',eye:'#ffe066',segs:4},
  trailFire:true, desc:'爬过之处留下岩浆，靠近会灼伤。' });
ed({ id:'fire_skull', name:'烈焰骷髅', hp:34, spd:112, r:10, dmg:10, coins:3, ai:'bomber', weight:11, biomes:[2],
  look:{shape:'skull',c1:'#f0e6d0',c2:'#a09880',eye:'#ff5522',horn:1},
  bombR:78, bombDmg:26, bombColor:'#ff8a2a',
  desc:'扑向你并自爆的火焰头骨。' });
ed({ id:'magma_golem', name:'熔岩巨像', hp:200, spd:40, r:20, dmg:24, coins:12, ai:'mortar', weight:5, minFloor:2, biomes:[2],
  bdmg:22, aoe:66, shells:4,
  look:{shape:'golem',c1:'#8a3a26',c2:'#4a1a10',c3:'#ff8a2a',eye:'#ffd45e'},
  atk:{ cd:3.2 }, desc:'投掷熔岩弹幕的巨型岩石生物。' });
ed({ id:'flame_turret', name:'烈焰炮台', hp:70, spd:0, r:13, dmg:0, coins:5, ai:'turret', weight:8, biomes:[2,4],
  look:{shape:'turret',c1:'#8a5a3a',c2:'#4a2a18',c3:'#ff8a2a',eye:'#ff5522',arms:false},
  atk:{ cd:1.5, range:400, fn:function(g,e,p){
    for(var i=0;i<5;i++) (function(i){ g.delayed(i*0.07,function(){ if(!e.dead) e.shoot(e.aimA+U.rand(-0.12,0.12),{spd:300,dmg:8,r:5,color:'#ff8a2a',shape:'flame',burn:1.6,life:1.2,drag:0.6}); }); })(i); } },
  desc:'固定炮台，喷射连发火球。' });
ed({ id:'demon_brute', name:'炎魔战士', hp:130, spd:64, r:16, dmg:20, coins:8, ai:'shielded', weight:6, minFloor:2, biomes:[2],
  look:{shape:'humanoid',c1:'#a03a2a',c2:'#5a1a10',c3:'#ffb43c',c4:'#c05a3a',eye:'#ffe066',horn:1},
  atk:{ cd:2.0, range:80, fn:function(g,e,p){ shootFan(g,e,p,5,1.1,{spd:300,dmg:13,r:6,color:'#ff8a2a',shape:'slash',life:0.5,pierce:2,burn:1.5}); } },
  desc:'挥出灼热剑气的地狱战士。' });
ed({ id:'ember_spinner', name:'炽焰旋转者', hp:60, spd:44, r:12, dmg:12, coins:5, ai:'spinner', weight:8, minFloor:2, biomes:[2,5],
  arms:5, spinSpd:1.9, bdmg:9,
  look:{shape:'crystal',c1:'#ff8a4a',c2:'#8a2a10',c3:'#ffd45e',eye:'#fff'},
  atk:{ cd:0.24 }, desc:'不断旋转喷射螺旋弹幕。' });

/* ============================================================
                     生物群系 3 · 幽茂丛林
   ============================================================ */
ed({ id:'spider', name:'丛林蜘蛛', hp:32, spd:118, r:10, dmg:11, coins:2, weight:13, biomes:[3],
  look:{shape:'spider',c1:'#5a4a6a',c2:'#2e2440',c3:'#a05aff',eye:'#ff5d6e',spike:0},
  desc:'速度极快，贴身撕咬。' });
ed({ id:'plant_shooter', name:'食人花', hp:54, spd:0, r:12, dmg:0, coins:3, ai:'turret', weight:12, biomes:[3],
  look:{shape:'plant',c1:'#d0524a',c2:'#3f7a45',c3:'#6fbf6a',eye:'#fff'},
  atk:{ cd:1.5, range:360, fn:function(g,e,p){ shootFan(g,e,p,3,0.4,{spd:280,dmg:9,r:5,color:'#9ef04a',shape:'ball',poison:2,life:1.6}); } },
  desc:'扎根地面，喷吐毒液。' });
ed({ id:'wasp', name:'剧毒黄蜂', hp:18, spd:150, r:7, dmg:8, coins:1, ai:'swarm', weight:14, biomes:[3],
  look:{shape:'bug',c1:'#ffd045',c2:'#5a4210',c3:'#2e2410',eye:'#fff'},
  desc:'成群冲锋的毒蜂。' });
ed({ id:'treant', name:'古木行者', hp:210, spd:38, r:20, dmg:22, coins:10, weight:5, minFloor:2, biomes:[3],
  look:{shape:'golem',c1:'#5a7a3a',c2:'#2e3a18',c3:'#8fc06a',eye:'#ffd45e'},
  atk:{ cd:2.6, range:300, fn:function(g,e,p){ for(var i=0;i<8;i++) e.shoot(i/8*TAU+U.rand(0,0.4),{spd:210,dmg:11,r:5,color:'#8fc06a',shape:'star',life:2.2}); } },
  desc:'厚重的树人，会甩出锋利落叶。' });
ed({ id:'toxic_frog', name:'剧毒蟾蜍', hp:40, spd:88, r:12, dmg:10, coins:3, ai:'bomber', weight:10, biomes:[3],
  look:{shape:'blob',c1:'#7fc04a',c2:'#3a6a24',c3:'#c8ff8a',eye:'#ffe066',eyes:2},
  bombR:80, bombDmg:18, bombColor:'#9ef04a', bombPoison:true,
  desc:'爆炸后留下毒雾区域。' });
ed({ id:'vine_witch', name:'藤蔓女巫', hp:60, spd:54, r:12, dmg:10, coins:7, ai:'summoner', weight:6, minFloor:2, biomes:[3],
  summon:'wasp', summonCount:3, maxMinions:9,
  look:{shape:'humanoid',c1:'#4a7a4a',c2:'#24421f',c3:'#c8ff8a',c4:'#8fc06a',eye:'#ffe066'},
  atk:{ cd:4.5 }, desc:'不断召唤毒蜂群，优先击杀。' });
ed({ id:'mush_bomber', name:'孢子菇', hp:44, spd:36, r:11, dmg:8, coins:3, ai:'wander', weight:9, biomes:[3],
  look:{shape:'plant',c1:'#c86ad0',c2:'#4a6a3a',c3:'#8fc06a',eye:'#fff'},
  atk:{ cd:2.6, range:280, fn:function(g,e,p){ for(var i=0;i<10;i++) e.shoot(i/10*TAU,{spd:130,dmg:7,r:5,color:'#c86ad0',shape:'ball',poison:2,life:2.4,drag:0.4}); } },
  desc:'释放环形毒孢。' });

/* ============================================================
                     生物群系 4 · 源能实验室
   ============================================================ */
ed({ id:'drone', name:'巡逻无人机', hp:28, spd:112, r:9, dmg:8, coins:3, ai:'flyer', weight:13, biomes:[4],
  wob:0.5, wobF:3.4,
  look:{shape:'orb',c1:'#5a6a9a',c2:'#2a3450',c3:'#5ee0ff',eye:'#5ee0ff',eyes:1},
  atk:{ cd:1.4, range:340, fn:function(g,e,p){ e.shoot(aimAt(e,p),{spd:340,dmg:8,r:3.5,color:'#5ee0ff',shape:'laser'}); } },
  desc:'高速飞行的射击单位。' });
ed({ id:'mech_walker', name:'机甲步行者', hp:96, spd:56, r:15, dmg:15, coins:6, ai:'keepDist', pref:200, weight:10, biomes:[4],
  look:{shape:'mech',c1:'#5a6480',c2:'#2a3244',c3:'#ff9a3c',eye:'#5ee0ff'},
  atk:{ cd:1.7, range:400, fn:function(g,e,p){
    for(var i=0;i<3;i++) (function(i){ g.delayed(i*0.11,function(){ if(!e.dead) shootFan(g,e,p,2,0.22,{spd:380,dmg:9,r:4,color:'#ffb43c',shape:'bolt'}); }); })(i); } },
  desc:'三连点射的双管机甲。' });
ed({ id:'laser_turret', name:'激光炮台', hp:80, spd:0, r:13, dmg:0, coins:5, ai:'turret', weight:9, biomes:[4],
  look:{shape:'turret',c1:'#48547a',c2:'#232a40',c3:'#ff5b6e',eye:'#ff5b6e',arms:false},
  atk:{ cd:2.4, range:460, fn:function(g,e,p){
    e.telegraph={a:e.aimA,t:0.7};
    g.delayed(0.7,function(){ if(e.dead) return;
      g.beam(e.x,e.y,e.aimA,520,20,{color:'#ff5b6e',width:8,team:'enemy',dur:0.28,pierceAll:true}); G.Audio.sfx.laser(); }); } },
  desc:'蓄力后发射贯穿激光，看到红线快躲开。' });
ed({ id:'nano_blob', name:'纳米泥团', hp:40, spd:70, r:12, dmg:10, coins:3, weight:11, biomes:[4],
  look:{shape:'slime',c1:'#7a9aff',c2:'#33447a',c3:'#c8e0ff',eye:'#fff'},
  onDeath:function(g,e){ if(!e.small) for(var i=0;i<3;i++) g.spawnEnemy('nano_small',e.x+U.rand(-14,14),e.y+U.rand(-14,14)); },
  desc:'死亡后分裂成三个纳米碎块。' });
ed({ id:'nano_small', name:'纳米碎块', hp:12, spd:110, r:7, dmg:6, coins:1, spawnable:false, small:true,
  look:{shape:'slime',c1:'#9ab4ff',c2:'#44559a',eye:'#fff'}, desc:'纳米泥团的碎片。' });
ed({ id:'scientist', name:'疯狂研究员', hp:52, spd:58, r:11, dmg:9, coins:8, ai:'summoner', weight:6, minFloor:2, biomes:[4],
  summon:'drone', summonCount:2, maxMinions:8,
  look:{shape:'humanoid',c1:'#e8eef8',c2:'#8a94a8',c3:'#5ee0ff',c4:'#f0d0b0',eye:'#5ee0ff'},
  atk:{ cd:5 }, desc:'不断投放无人机。' });
ed({ id:'guard_bot', name:'护盾机兵', hp:120, spd:60, r:15, dmg:16, coins:7, ai:'shielded', weight:7, minFloor:2, biomes:[4],
  look:{shape:'mech',c1:'#7a8296',c2:'#343c50',c3:'#5ee0ff',eye:'#ffd45e'},
  atk:{ cd:2.4, range:300, fn:function(g,e,p){ shootFan(g,e,p,4,0.9,{spd:320,dmg:11,r:5,color:'#5ee0ff',shape:'bolt'}); } },
  desc:'正面能量盾可反弹子弹。' });
ed({ id:'sniper_bot', name:'狙击机兵', hp:56, spd:64, r:11, dmg:0, coins:7, ai:'sniper', weight:7, minFloor:2, biomes:[4,5],
  bdmg:22, atk:{cd:2.6},
  look:{shape:'mech',c1:'#6a5a8a',c2:'#2e2440',c3:'#ff5b6e',eye:'#ff5b6e'},
  desc:'红色瞄准线亮起后会发射高伤弹。' });

/* ============================================================
                     生物群系 5 · 虚空回响
   ============================================================ */
ed({ id:'void_wisp', name:'虚空之种', hp:34, spd:104, r:9, dmg:10, coins:4, ai:'orbit', pref:140, weight:12, biomes:[5],
  look:{shape:'wisp',c1:'#c07aff',c3:'#ffffff',eye:'#fff'},
  atk:{ cd:1.1, fn:function(g,e,p){ e.shoot(aimAt(e,p),{spd:260,dmg:10,r:4.5,color:'#c07aff',shape:'orb',homing:1.2,life:2.4}); } },
  desc:'漂浮的虚空造物。' });
ed({ id:'shade', name:'深渊暗影', hp:56, spd:88, r:12, dmg:14, coins:5, ai:'teleporter', weight:10, biomes:[5],
  look:{shape:'ghost',c1:'#7a4aca',c2:'#2a1440',c3:'#e0a0ff',eye:'#ff5d6e'},
  atk:{ cd:1.5, fn:function(g,e,p){ shootFan(g,e,p,5,1.2,{spd:250,dmg:11,r:5,color:'#e0a0ff',shape:'skull',life:2.4}); } },
  desc:'不断闪现的暗影，扇形散射亡魂。' });
ed({ id:'eye_horror', name:'凝视者', hp:78, spd:66, r:14, dmg:14, coins:7, ai:'keepDist', pref:230, weight:9, biomes:[5],
  look:{shape:'orb',c1:'#d84a6a',c2:'#6a1a2a',c3:'#ffd45e',eye:'#ffffff',eyes:1,horn:1},
  atk:{ cd:2.8, range:460, fn:function(g,e,p){
    e.telegraph={a:aimAt(e,p),t:0.6};
    var aa=aimAt(e,p);
    g.delayed(0.6,function(){ if(e.dead) return; g.beam(e.x,e.y,aa,480,18,{color:'#ff5b6e',width:10,team:'enemy',dur:0.3,pierceAll:true}); }); } },
  desc:'巨大的独眼，发射凝视射线。' });
ed({ id:'crystal_guard', name:'棱晶守卫', hp:140, spd:48, r:15, dmg:18, coins:9, ai:'spinner', weight:7, biomes:[5],
  arms:6, spinSpd:-1.6, bdmg:10,
  look:{shape:'crystal',c1:'#a0a8ff',c2:'#4a4a8a',c3:'#e0e8ff',eye:'#fff'},
  atk:{ cd:0.3 }, desc:'旋转释放棱晶弹幕的守卫。' });
ed({ id:'void_healer', name:'虚空祭司', hp:70, spd:60, r:12, dmg:8, coins:9, ai:'healer', weight:5, minFloor:2, biomes:[5,4],
  look:{shape:'humanoid',c1:'#4a8a7a',c2:'#1c3a34',c3:'#7dffb0',c4:'#8ad0c0',eye:'#7dffb0'},
  desc:'治疗周围怪物，必须优先解决。' });
ed({ id:'skeleton_ally', name:'骷髅盟友', hp:40, spd:96, r:11, dmg:14, coins:0, spawnable:false,
  look:{shape:'humanoid',c1:'#c8e8d0',c2:'#6a8a72',c3:'#7dffb0',c4:'#e0f0e8',eye:'#7dffb0'},
  desc:'亡灵法杖召唤的忠诚战士。' });

/* ============================================================
                             BOSS
   ============================================================ */
function bossBullet(e,a,o){ e.shoot(a,o); }

ed({ id:'boss_skeleton_king', name:'骸骨之王', boss:true, hp:900, spd:56, r:26, dmg:24, coins:60, ai:'boss', biome:0,
  look:{shape:'skull',c1:'#efe8d4',c2:'#a09880',c3:'#ffd45e',eye:'#ff5522',horn:1,crown:1,aura:'#ff7a3c'},
  desc:'古堡的统治者，操纵亡骨与烈焰。',
  patterns:[
    { name:'骨矛环射', dur:3.4, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.4);
        if(e.subT<=0){ e.subT=0.55; var off=U.rand(0,1);
          for(var i=0;i<14;i++) bossBullet(e,off+i/14*TAU,{spd:200,dmg:12,r:6,color:'#efe8d4',shape:'ball',life:3}); } } },
    { name:'追魂弹幕', dur:3.0, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.42;
          for(var i=0;i<3;i++) bossBullet(e,aimAt(e,p)+(i-1)*0.35,{spd:250,dmg:14,r:6,color:'#ff7a3c',shape:'skull',homing:1.6,life:3.2}); } } },
    { name:'召唤亡灵', dur:1.6, minPhase:1, start:function(g,e,p){
        for(var i=0;i<4;i++){ var a=U.rand(0,TAU); g.spawnEnemy('skeleton',e.x+Math.cos(a)*60,e.y+Math.sin(a)*60,{spawnFx:true}); }
        g.float('起来吧，我的士兵!',e.x,e.y-e.r-24,'#ffd45e'); },
      fn:function(g,e,dt,p){ halt(e,dt); } },
    { name:'冲撞碾压', dur:3.2, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt;
        if(e.subT<=0){ e.subT=1.1; var a=aimAt(e,p); e.vx=Math.cos(a)*440; e.vy=Math.sin(a)*440; g.shake(6); }
        e.vx*=Math.pow(0.25,dt); e.vy*=Math.pow(0.25,dt); } },
    { name:'骨之螺旋', dur:4.0, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,180,1,0.5);
        e.spinA=(e.spinA||0)+dt*2.6;
        if(e.subT<=0){ e.subT=0.1;
          for(var i=0;i<3;i++) bossBullet(e,e.spinA+i/3*TAU,{spd:230,dmg:11,r:5,color:'#ffd45e',shape:'ball',life:3.4}); } } },
    { name:'灭世火雨', dur:4.5, minPhase:3, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.24; g.skyStrike(p.x+U.rand(-160,160),p.y+U.rand(-160,160),22,'#ff7a3c','mortar',56); } } }
  ] });

ed({ id:'boss_frost_dragon', name:'霜牙巨龙', boss:true, hp:1200, spd:64, r:30, dmg:26, coins:80, ai:'boss', biome:1,
  look:{shape:'dragon',c1:'#9fd8f0',c2:'#4a7a9a',c3:'#eaffff',eye:'#ffee66',aura:'#8ef0ff'},
  desc:'冰窟深处沉睡的远古巨龙。',
  patterns:[
    { name:'寒霜吐息', dur:3.2, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.35);
        if(e.subT<=0){ e.subT=0.06;
          bossBullet(e,aimAt(e,p)+U.rand(-0.34,0.34),{spd:U.rand(240,380),dmg:8,r:U.rand(5,9),color:'#9fe4ff',shape:'ice',freeze:2,life:1.1,drag:0.8,sizeGrow:8}); } } },
    { name:'冰锥环爆', dur:3.0, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.75; var off=U.rand(0,1);
          for(var i=0;i<20;i++) bossBullet(e,off+i/20*TAU,{spd:230,dmg:13,r:6,color:'#8ef0ff',shape:'ice',freeze:1.6,life:3}); g.shake(6); } } },
    { name:'俯冲撕咬', dur:3.6, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt;
        if(e.subT<=0){ e.subT=1.2; var a=aimAt(e,p); e.vx=Math.cos(a)*520; e.vy=Math.sin(a)*520; e.fly=true; g.shake(7); }
        e.vx*=Math.pow(0.3,dt); e.vy*=Math.pow(0.3,dt); } },
    { name:'暴雪领域', dur:4.2, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,200,-1,0.6);
        if(e.subT<=0){ e.subT=0.3;
          g.skyStrike(p.x+U.rand(-190,190),p.y+U.rand(-190,190),16,'#9fe4ff','mortar',52); } } },
    { name:'绝对零度', dur:5.0, minPhase:3, start:function(g,e,p){ g.float('绝对零度!',e.x,e.y-e.r-24,'#8ef0ff'); },
      fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt); e.spinA=(e.spinA||0)+dt*1.5;
        if(e.subT<=0){ e.subT=0.13;
          for(var i=0;i<4;i++) bossBullet(e,e.spinA+i/4*TAU,{spd:200,dmg:12,r:7,color:'#eaffff',shape:'ice',freeze:2.4,life:4,spin:0.5}); } } }
  ] });

ed({ id:'boss_magma_lord', name:'熔岩魔君', boss:true, hp:1500, spd:52, r:30, dmg:30, coins:100, ai:'boss', biome:2,
  look:{shape:'golem',c1:'#a03a26',c2:'#4a140a',c3:'#ff8a2a',eye:'#ffe066',aura:'#ff5a1a'},
  desc:'深渊烈焰凝聚而成的魔君。',
  patterns:[
    { name:'熔岩喷发', dur:3.6, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.3);
        if(e.subT<=0){ e.subT=0.5;
          for(var i=0;i<10;i++) bossBullet(e,U.rand(0,TAU),{spd:U.rand(150,330),dmg:12,r:6,color:'#ff8a2a',shape:'flame',burn:2.5,life:2.2,drag:0.5,sizeGrow:6}); } } },
    { name:'烈焰十字', dur:4.0, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt); e.spinA=(e.spinA||0)+dt*1.1;
        if(e.subT<=0){ e.subT=0.16;
          for(var i=0;i<4;i++) bossBullet(e,e.spinA+i/4*TAU,{spd:250,dmg:13,r:7,color:'#ffb43c',shape:'orb',life:3.4,burn:2}); } } },
    { name:'陨石轰炸', dur:4.4, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.34; g.meteor(p.x+U.rand(-140,140),p.y+U.rand(-140,140),26,72,'#ff7a3c'); } } },
    { name:'火焰冲锋', dur:3.4, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt;
        if(e.subT<=0){ e.subT=0.95; var a=aimAt(e,p); e.vx=Math.cos(a)*500; e.vy=Math.sin(a)*500; g.shake(8);
          g.zone(e.x,e.y,60,3,'fire',10,'#ff7a3c'); }
        e.vx*=Math.pow(0.28,dt); e.vy*=Math.pow(0.28,dt); } },
    { name:'炎狱降临', dur:5.5, minPhase:3, start:function(g,e,p){ g.float('炎狱降临!',e.x,e.y-e.r-24,'#ff7a3c'); g.shake(14); },
      fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,160,1,0.5); e.spinA=(e.spinA||0)+dt*2.2;
        if(e.subT<=0){ e.subT=0.1;
          for(var i=0;i<3;i++) bossBullet(e,e.spinA+i/3*TAU,{spd:210,dmg:14,r:7,color:'#ff5a1a',shape:'flame',burn:3,life:4,sizeGrow:3});
          if(Math.random()<0.35) g.skyStrike(p.x+U.rand(-120,120),p.y+U.rand(-120,120),20,'#ff7a3c','mortar',52); } } }
  ] });

ed({ id:'boss_treant', name:'远古树妖王', boss:true, hp:1800, spd:44, r:32, dmg:28, coins:120, ai:'boss', biome:3,
  look:{shape:'golem',c1:'#5a7a3a',c2:'#2a3a18',c3:'#c8ff8a',eye:'#ffd45e',aura:'#8ef07a'},
  desc:'守护丛林千年的古老意志。',
  patterns:[
    { name:'落叶风暴', dur:4.0, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.3); e.spinA=(e.spinA||0)+dt*2.0;
        if(e.subT<=0){ e.subT=0.12;
          for(var i=0;i<3;i++) bossBullet(e,e.spinA+i/3*TAU,{spd:230,dmg:11,r:6,color:'#8fc06a',shape:'star',life:3.2,spin:1}); } } },
    { name:'孢子毒云', dur:3.4, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.8;
          for(var i=0;i<8;i++){ var a=U.rand(0,TAU), d=U.rand(70,180);
            g.zone(e.x+Math.cos(a)*d, e.y+Math.sin(a)*d, 62, 5, 'poison', 8, '#9ef04a'); } } } },
    { name:'召唤林兽', dur:1.8, start:function(g,e,p){
        for(var i=0;i<5;i++){ var a=U.rand(0,TAU); g.spawnEnemy(U.pick(['wasp','spider','wasp']),e.x+Math.cos(a)*70,e.y+Math.sin(a)*70,{spawnFx:true}); } },
      fn:function(g,e,dt,p){ halt(e,dt); } },
    { name:'根须突刺', dur:4.2, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=0.42; g.skyStrike(p.x,p.y,24,'#8fc06a','spike',58); } } },
    { name:'自然愤怒', dur:5.0, minPhase:3, start:function(g,e,p){ g.float('自然的愤怒!',e.x,e.y-e.r-24,'#8ef07a'); },
      fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,190,-1,0.55);
        if(e.subT<=0){ e.subT=0.3; var off=U.rand(0,1);
          for(var i=0;i<16;i++) bossBullet(e,off+i/16*TAU,{spd:220,dmg:12,r:6,color:'#c8ff8a',shape:'star',life:3.4,poison:2}); } } }
  ] });

ed({ id:'boss_core_prime', name:'源能核心·普罗米', boss:true, hp:2100, spd:60, r:28, dmg:30, coins:150, ai:'boss', biome:4,
  look:{shape:'mech',c1:'#5a6a92',c2:'#252e46',c3:'#5ee0ff',eye:'#ff5b6e',aura:'#5ee0ff'},
  desc:'实验室失控的终极兵器。',
  patterns:[
    { name:'扇形弹幕', dur:3.4, fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,210,1,0.6);
        if(e.subT<=0){ e.subT=0.42;
          for(var i=0;i<9;i++) bossBullet(e,aimAt(e,p)+(i-4)*0.16,{spd:330,dmg:11,r:5,color:'#5ee0ff',shape:'bolt',life:2.6}); } } },
    { name:'十字激光', dur:4.0, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=1.3; var base=U.rand(0,TAU);
          e.telegraph={a:base,t:0.6,cross:true};
          (function(base){ g.delayed(0.6,function(){ if(e.dead) return;
            for(var i=0;i<4;i++) g.beam(e.x,e.y,base+i/4*TAU,600,20,{color:'#ff5b6e',width:9,team:'enemy',dur:0.3,pierceAll:true});
            g.shake(8); G.Audio.sfx.laser(); }); })(base); } } },
    { name:'部署无人机', dur:1.6, start:function(g,e,p){
        for(var i=0;i<4;i++){ var a=U.rand(0,TAU); g.spawnEnemy('drone',e.x+Math.cos(a)*70,e.y+Math.sin(a)*70,{spawnFx:true}); } },
      fn:function(g,e,dt,p){ halt(e,dt); } },
    { name:'追踪导弹阵', dur:3.6, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.4);
        if(e.subT<=0){ e.subT=0.7;
          for(var i=0;i<6;i++) bossBullet(e,U.rand(0,TAU),{spd:180,dmg:13,r:5,color:'#ff9a3c',shape:'missile',homing:2.2,life:4,aoe:34}); } } },
    { name:'螺旋炮击', dur:4.4, minPhase:2, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt); e.spinA=(e.spinA||0)+dt*3.0;
        if(e.subT<=0){ e.subT=0.07;
          for(var i=0;i<2;i++) bossBullet(e,e.spinA+i*Math.PI,{spd:260,dmg:10,r:5,color:'#c8f0ff',shape:'laser',life:3.4}); } } },
    { name:'过载模式', dur:5.5, minPhase:3, start:function(g,e,p){ g.float('过 载 模 式!',e.x,e.y-e.r-24,'#ff5b6e'); g.shake(14); },
      fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.7); e.spinA=(e.spinA||0)+dt*4.2;
        if(e.subT<=0){ e.subT=0.11;
          for(var i=0;i<4;i++) bossBullet(e,e.spinA+i/4*TAU,{spd:300,dmg:12,r:6,color:'#ff5b6e',shape:'orb',life:3});
          if(Math.random()<0.25) bossBullet(e,aimAt(e,p),{spd:200,dmg:14,r:6,color:'#ff9a3c',shape:'missile',homing:2.6,life:4,aoe:36}); } } }
  ] });

ed({ id:'boss_abyss_echo', name:'深渊回响', boss:true, hp:2800, spd:66, r:30, dmg:34, coins:220, ai:'boss', biome:5,
  look:{shape:'orb',c1:'#8a3aca',c2:'#2a0a40',c3:'#e0a0ff',eye:'#ffffff',eyes:1,horn:1,crown:1,aura:'#c07aff'},
  desc:'一切的终点，凝视深渊者终被深渊凝视。',
  patterns:[
    { name:'虚空万华', dur:4.2, fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,190,1,0.6); e.spinA=(e.spinA||0)+dt*1.4;
        if(e.subT<=0){ e.subT=0.22;
          for(var i=0;i<6;i++) bossBullet(e,e.spinA+i/6*TAU,{spd:210,dmg:12,r:6,color:'#c07aff',shape:'orb',life:4,spin:0.4}); } } },
    { name:'凝视射线', dur:4.0, fn:function(g,e,dt,p){
        e.subT-=dt; halt(e,dt);
        if(e.subT<=0){ e.subT=1.1; var aa=aimAt(e,p); e.telegraph={a:aa,t:0.55};
          g.delayed(0.55,function(){ if(e.dead) return;
            for(var i=-1;i<=1;i++) g.beam(e.x,e.y,aa+i*0.2,640,22,{color:'#ff5b6e',width:10,team:'enemy',dur:0.32,pierceAll:true});
            g.shake(9); }); } } },
    { name:'亡魂潮汐', dur:3.6, fn:function(g,e,dt,p){
        e.subT-=dt; moveTo(e,p.x,p.y,dt,0.35);
        if(e.subT<=0){ e.subT=0.36;
          for(var i=0;i<5;i++) bossBullet(e,aimAt(e,p)+(i-2)*0.3,{spd:240,dmg:13,r:6,color:'#e0a0ff',shape:'skull',homing:1.4,life:4}); } } },
    { name:'召唤暗影', dur:1.8, minPhase:2, start:function(g,e,p){
        for(var i=0;i<4;i++){ var a=U.rand(0,TAU); g.spawnEnemy(U.pick(['shade','void_wisp']),e.x+Math.cos(a)*80,e.y+Math.sin(a)*80,{spawnFx:true}); } },
      fn:function(g,e,dt,p){ halt(e,dt); } },
    { name:'空间坍缩', dur:4.6, minPhase:2, start:function(g,e,p){ g.blackhole(p.x,p.y,150,3.2,10,'enemy'); },
      fn:function(g,e,dt,p){
        e.subT-=dt; moveAway(e,p.x,p.y,dt,0.5);
        if(e.subT<=0){ e.subT=0.5; var off=U.rand(0,1);
          for(var i=0;i<14;i++) bossBullet(e,off+i/14*TAU,{spd:230,dmg:12,r:6,color:'#8a3aca',shape:'orb',life:3.4}); } } },
    { name:'终焉回响', dur:6.0, minPhase:3, start:function(g,e,p){ g.float('终 焉 回 响',e.x,e.y-e.r-26,'#e0a0ff'); g.shake(18); },
      fn:function(g,e,dt,p){
        e.subT-=dt; orbitMove(e,p.x,p.y,dt,170,-1,0.7); e.spinA=(e.spinA||0)+dt*2.8;
        if(e.subT<=0){ e.subT=0.1;
          for(var i=0;i<5;i++) bossBullet(e,e.spinA+i/5*TAU,{spd:250,dmg:13,r:6,color:U.pick(['#c07aff','#e0a0ff','#ff5b6e']),shape:'orb',life:4});
          if(Math.random()<0.2) g.skyStrike(p.x+U.rand(-150,150),p.y+U.rand(-150,150),22,'#c07aff','mortar',56); } } }
  ] });

/* ---------- 精英化 ---------- */
E.makeElite = function(d){
  var e = {};
  for(var k in d) e[k]=d[k];
  e.elite = true;
  e.name = '精英·'+d.name;
  e.hp = Math.round(d.hp*2.6);
  e.dmg = Math.round(d.dmg*1.4);
  e.spd = d.spd*1.12;
  e.r = d.r*1.28;
  e.coins = d.coins*4;
  var L={}; for(var k2 in d.look) L[k2]=d.look[k2];
  L.crown=1; L.aura = L.c3||L.c1;
  e.look = L;
  return e;
};

E.pick = function(biome, floor){
  var pool = E.pools[biome%E.pools.length]||E.pools[0];
  var ok = pool.filter(function(q){ return floor >= (q.minFloor||0); });
  if(!ok.length) ok = pool;
  return U.wpick(ok).id;
};
E.bossFor = function(biome){
  for(var i=0;i<E.bosses.length;i++) if(E.bosses[i].biome===biome) return E.bosses[i].id;
  return E.bosses[E.bosses.length-1].id;
};
})();
