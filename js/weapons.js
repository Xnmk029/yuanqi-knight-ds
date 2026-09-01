/* 元气骑士·深渊回响 —— 武器库：38 把武器，每把都有专属技能 */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var TAU = Math.PI*2;
var W = { list:[], byId:{} };
G.Weapons = W;

/* --- 发射辅助 --- */
function sb(g,p,ang,o){
  o = o||{};
  return g.spawnBullet({
    x:(o.x===undefined?p.x:o.x), y:(o.y===undefined?p.y:o.y),
    ang:ang, spd:(o.spd===undefined?320:o.spd), dmg:(o.dmg===undefined?10:o.dmg),
    r:(o.r===undefined?3.5:o.r), color:o.color||'#ffe07a', shape:o.shape||'ball',
    team:o.team||'player', pierce:o.pierce||0, bounce:o.bounce||0, homing:o.homing||0,
    life:(o.life===undefined?1.3:o.life), aoe:o.aoe||0, kb:o.kb||0,
    grav:o.grav||0, accel:o.accel||0, drag:o.drag||0, spin:o.spin||0,
    freeze:o.freeze||0, burn:o.burn||0, poison:o.poison||0, shock:o.shock||0,
    onHit:o.onHit, onDie:o.onDie, split:o.split, delay:o.delay||0, wob:o.wob||0,
    sizeGrow:o.sizeGrow||0, seed:Math.random()*10, noWall:o.noWall, scale:o.scale||1,
    trailC:o.trailC, light:o.light
  });
}
function fan(g,p,ang,n,spread,o){
  for(var i=0;i<n;i++){
    var a = ang + (n===1?0:(i/(n-1)-0.5)*spread);
    sb(g,p,a,o);
  }
}
function ring(g,p,n,o,rot){
  for(var i=0;i<n;i++) sb(g,p,(rot||0)+i/n*TAU,o);
}
W.sb=sb; W.fan=fan; W.ring=ring;

function def(o){
  o.rarity = o.rarity||1;
  o.type = o.type||'gun';
  o.dmg = o.dmg||8;
  o.rate = o.rate||0.3;
  o.spd = o.spd||330;
  o.count = o.count||1;
  o.spread = o.spread||0;
  o.energy = o.energy===undefined?1:o.energy;
  o.auto = o.auto!==false;
  o.kb = o.kb||40;
  o.r = o.r||3.5;
  o.shape = o.shape||'ball';
  o.color = o.color||'#ffe07a';
  o.life = o.life||1.3;
  o.recoil = o.recoil||1;
  if(o.skill){ o.skill.cd = o.skill.cd||6; o.skill.cost = o.skill.cost===undefined?6:o.skill.cost; }
  W.list.push(o); W.byId[o.id]=o;
  return o;
}

/* ============================== 手枪 / 冲锋 ============================== */
def({ id:'pistol', name:'新手手枪', type:'gun', rarity:1, dmg:9, rate:0.26, spd:400, energy:0.6, auto:false,
  color:'#ffe07a', shape:'bolt', desc:'骑士团标配，可靠但平庸。',
  art:{kind:'pistol',c1:'#9aa4c4',c2:'#4a5170',c3:'#ffd45e',len:1},
  skill:{ name:'速射连发', cost:5, cd:4, desc:'瞬间射出 5 发穿透弹',
    fn:function(g,p,w){ for(var i=0;i<5;i++) g.delayed(i*0.06,function(){ sb(g,p,p.aim+U.rand(-0.05,0.05),{dmg:w.dmg*1.1,spd:520,pierce:1,color:'#fff2a8',shape:'bolt',r:4}); }); } } });

def({ id:'dual', name:'双持手枪', type:'gun', rarity:2, dmg:8, rate:0.17, spd:430, energy:0.8, count:1, spread:0.09,
  color:'#ffd27a', shape:'bolt', desc:'左右开弓，射速惊人。',
  art:{kind:'pistol',c1:'#c9a86a',c2:'#5a4a30',c3:'#ffe08a',len:1},
  onFire:function(g,p,w,ang){ var s=(p.dualSide=!p.dualSide)?1:-1;
    sb(g,p,ang+U.rand(-0.05,0.05),{x:p.x+Math.cos(ang+s*1.57)*6,y:p.y+Math.sin(ang+s*1.57)*6,dmg:w.dmg,spd:430,color:'#ffd27a',shape:'bolt'}); return true; },
  skill:{ name:'弹幕扫射', cost:8, cd:6, desc:'扇形泼洒 12 发子弹',
    fn:function(g,p,w){ fan(g,p,p.aim,12,1.5,{dmg:w.dmg,spd:440,color:'#ffd27a',shape:'bolt'}); g.shake(4); } } });

def({ id:'smg', name:'冲锋枪', type:'gun', rarity:2, dmg:7, rate:0.085, spd:470, energy:0.55, spread:0.16,
  color:'#ffe9b0', shape:'bolt', desc:'泼水般的火力压制。',
  art:{kind:'smg',c1:'#8f97b8',c2:'#3f4560',c3:'#ff9f4a',len:1},
  skill:{ name:'超载弹夹', cost:9, cd:9, desc:'6 秒内射速翻倍且不消耗能量',
    fn:function(g,p,w){ p.addBuff('rapid',6,2.2); p.addBuff('freeAmmo',6,1); g.float('超载弹夹!',p.x,p.y-26,'#ffb43c'); } } });

def({ id:'rifle', name:'突击步枪', type:'gun', rarity:3, dmg:12, rate:0.13, spd:560, energy:0.8, spread:0.08,
  color:'#ffe07a', shape:'bolt', desc:'稳定、精准、致命。',
  art:{kind:'rifle',c1:'#7f889f',c2:'#333a4e',c3:'#c8863c',len:1.05},
  skill:{ name:'精准点射', cost:8, cd:7, desc:'三连穿甲弹，必定暴击',
    fn:function(g,p,w){ for(var i=0;i<3;i++) g.delayed(i*0.1,function(){ sb(g,p,p.aim,{dmg:w.dmg*2.4,spd:820,pierce:4,color:'#fff8d0',shape:'laser',r:4,crit:1}); g.shake(3); }); } } });

def({ id:'shotgun', name:'霰弹枪', type:'gun', rarity:2, dmg:6, rate:0.62, spd:430, energy:2.2, count:6, spread:0.62, kb:150,
  color:'#ffcf7a', shape:'ball', r:3, life:0.55, desc:'贴脸即是真理。',
  art:{kind:'shotgun',c1:'#8a7150',c2:'#3f3524',c3:'#d8a04a',len:1.05},
  skill:{ name:'龙息弹', cost:10, cd:8, desc:'喷出灼热烈焰，点燃敌人',
    fn:function(g,p,w){ for(var i=0;i<22;i++) g.delayed(i*0.02,function(){
      sb(g,p,p.aim+U.rand(-0.42,0.42),{dmg:w.dmg*1.1,spd:U.rand(240,420),life:0.42,r:U.rand(4,7),color:'#ff8a2a',shape:'flame',burn:2.5,drag:1.4,sizeGrow:9,pierce:2,kb:90}); });
      g.shake(6); } } });

def({ id:'combat_shotgun', name:'战术连喷', type:'gun', rarity:3, dmg:6, rate:0.3, spd:470, energy:1.8, count:5, spread:0.44, kb:120,
  color:'#ffdca0', shape:'ball', r:3, life:0.6, desc:'半自动的暴力美学。',
  art:{kind:'shotgun',c1:'#4a5a6a',c2:'#232c36',c3:'#8ed0ff',len:1.05},
  skill:{ name:'冲击波爆', cost:9, cd:7, desc:'释放击退冲击波并后跳',
    fn:function(g,p,w){ fan(g,p,p.aim,16,1.9,{dmg:w.dmg*1.6,spd:520,life:0.5,kb:260,color:'#bfe6ff',shape:'wave',r:5,pierce:2});
      p.vx-=Math.cos(p.aim)*280; p.vy-=Math.sin(p.aim)*280; g.shake(8); } } });

def({ id:'sniper', name:'狙击步枪', type:'gun', rarity:3, dmg:46, rate:1.05, spd:1000, energy:3, kb:180,
  color:'#eaf6ff', shape:'laser', r:4, life:1.6, pierce:2, auto:false, desc:'一发入魂，穿透一切。',
  art:{kind:'sniper',c1:'#5f6a80',c2:'#252c3a',c3:'#8ef0ff',len:1.15},
  skill:{ name:'洞穿射线', cost:12, cd:9, desc:'贯穿全屏的电磁射线',
    fn:function(g,p,w){ g.beam(p.x,p.y,p.aim,900,w.dmg*2.2,{color:'#9ff0ff',width:9,team:'player',dur:0.32,pierceAll:true});
      g.shake(11); G.Audio.sfx.thunder(); } } });

def({ id:'minigun', name:'加特林机枪', type:'gun', rarity:4, dmg:8, rate:0.055, spd:520, energy:0.5, spread:0.2,
  color:'#ffdd8a', shape:'bolt', desc:'转速拉满，弹雨倾泻。',
  art:{kind:'minigun',c1:'#78808f',c2:'#2f3540',c3:'#ffb43c',len:1.1},
  skill:{ name:'旋风风暴', cost:12, cd:10, desc:'原地旋转 3.5 秒，向四周狂射',
    fn:function(g,p,w){ p.addBuff('spin',3.5,{dmg:w.dmg*1.1,rate:0.045,color:'#ffdd8a'}); p.addBuff('slowMove',3.5,0.5); g.shake(5); } } });

def({ id:'laser_gun', name:'激光枪', type:'gun', rarity:3, dmg:11, rate:0.16, spd:760, energy:1.1,
  color:'#7affd0', shape:'laser', r:3.4, pierce:1, desc:'源能凝聚的光束。',
  art:{kind:'laser',c1:'#556a8a',c2:'#232c3e',c3:'#7affd0',len:1.05}, sfx:'laser',
  skill:{ name:'持续光炮', cost:14, cd:10, desc:'2.4 秒持续激光，切割一切',
    fn:function(g,p,w){ p.addBuff('beam',2.4,{dmg:w.dmg*0.42,color:'#7affd0',width:11,range:420}); } } });

def({ id:'plasma', name:'等离子步枪', type:'gun', rarity:4, dmg:19, rate:0.28, spd:420, energy:1.8,
  color:'#8affe6', shape:'orb', r:5.5, aoe:26, desc:'高温等离子球，接触即爆。',
  art:{kind:'cannon',c1:'#4a6a8a',c2:'#1e2c3e',c3:'#8affe6',len:1.05}, sfx:'plasma',
  skill:{ name:'等离子核', cost:14, cd:9, desc:'放出缓慢巨球，持续电击周围',
    fn:function(g,p,w){ sb(g,p,p.aim,{dmg:w.dmg*1.4,spd:120,r:14,color:'#8affe6',shape:'orb',aoe:64,pierce:99,life:3.4,shock:1,
      onHit:function(gg,b,e){ gg.zone(b.x,b.y,52,0.4,'shock',w.dmg*0.4,'#8affe6'); }}); g.shake(4); } } });

def({ id:'railgun', name:'电磁轨道炮', type:'gun', rarity:5, dmg:70, rate:1.35, spd:1200, energy:4.5, auto:false, pierce:99,
  color:'#c8f0ff', shape:'laser', r:5.5, life:1.8, kb:200, desc:'传说级毁灭兵器，贯穿一切。',
  art:{kind:'cannon',c1:'#6a7a9a',c2:'#252e42',c3:'#c8f0ff',len:1.2},
  skill:{ name:'歼灭轨道', cost:18, cd:13, desc:'三道贯穿轨道炮 + 全场震荡',
    fn:function(g,p,w){ for(var i=-1;i<=1;i++) (function(i){ g.delayed((i+1)*0.12,function(){
      g.beam(p.x,p.y,p.aim+i*0.16,1000,w.dmg*1.6,{color:'#c8f0ff',width:13,team:'player',dur:0.4,pierceAll:true,stun:1}); }); })(i);
      g.shake(16); G.Audio.sfx.thunder(); } } });

def({ id:'rpg', name:'火箭筒', type:'gun', rarity:4, dmg:40, rate:1.0, spd:330, energy:4, auto:false,
  color:'#ff9a4a', shape:'missile', r:5, aoe:62, kb:180, desc:'爆炸就是艺术。',
  art:{kind:'launcher',c1:'#6a6250',c2:'#2e2a22',c3:'#ff7a3c',len:1.1}, sfx:'heavy',
  skill:{ name:'饱和轰炸', cost:16, cd:12, desc:'齐射 5 枚追踪火箭',
    fn:function(g,p,w){ for(var i=0;i<5;i++) (function(i){ g.delayed(i*0.09,function(){
      sb(g,p,p.aim+(i-2)*0.22,{dmg:w.dmg*0.8,spd:300,r:5,color:'#ff9a4a',shape:'missile',aoe:56,homing:2.6,life:2.6}); }); })(i);
      g.shake(9); } } });

def({ id:'grenade', name:'榴弹发射器', type:'gun', rarity:3, dmg:26, rate:0.62, spd:300, energy:2.6, auto:false,
  color:'#b8d84a', shape:'ball', r:5, aoe:56, drag:0.8, life:1.1, desc:'抛物线送出问候。',
  art:{kind:'launcher',c1:'#5a6a4a',c2:'#28301e',c3:'#b8d84a',len:1.05}, sfx:'heavy',
  skill:{ name:'集束炸弹', cost:12, cd:9, desc:'榴弹在空中裂成 8 枚子炸弹',
    fn:function(g,p,w){ sb(g,p,p.aim,{dmg:w.dmg,spd:340,r:7,color:'#d8f06a',shape:'ball',aoe:60,life:0.55,drag:0.9,
      onDie:function(gg,b){ for(var i=0;i<8;i++) sb(gg,b,i/8*TAU+U.rand(0,0.4),{dmg:w.dmg*0.55,spd:U.rand(180,300),r:4,color:'#b8d84a',shape:'ball',aoe:40,life:0.5,drag:1.2}); } });
      g.shake(5); } } });

def({ id:'frost_cannon', name:'霜寒炮', type:'gun', rarity:3, dmg:13, rate:0.34, spd:400, energy:1.6, count:2, spread:0.18,
  color:'#9fe4ff', shape:'ice', r:4.5, freeze:1.6, desc:'冻结敌人的极寒之息。',
  art:{kind:'cannon',c1:'#4a6a8a',c2:'#1e3040',c3:'#9fe4ff',len:1.05},
  skill:{ name:'冰封新星', cost:12, cd:9, desc:'以自身为中心爆发寒霜，冻结全场',
    fn:function(g,p,w){ ring(g,p,20,{dmg:w.dmg*1.2,spd:360,r:5,color:'#9fe4ff',shape:'ice',freeze:3.2,pierce:3,life:0.8},U.rand(0,1));
      g.zone(p.x,p.y,120,0.5,'frost',w.dmg*0.6,'#9fe4ff'); G.Audio.sfx.freeze(); g.shake(6); } } });

def({ id:'flamer', name:'火焰喷射器', type:'gun', rarity:3, dmg:5, rate:0.045, spd:270, energy:0.45, spread:0.3,
  color:'#ff8a2a', shape:'flame', r:5, life:0.35, burn:1.6, drag:1.6, sizeGrow:14, pierce:2, kb:10,
  desc:'把一切化为灰烬。', art:{kind:'laser',c1:'#7a5030',c2:'#331f12',c3:'#ff8a2a',len:1.05},
  skill:{ name:'烈焰漩涡', cost:13, cd:10, desc:'召唤环绕自身的火焰漩涡 4 秒',
    fn:function(g,p,w){ p.addBuff('firestorm',4,{dmg:w.dmg*1.6,color:'#ff8a2a'}); g.shake(4); } } });

def({ id:'toxic', name:'毒液喷枪', type:'gun', rarity:3, dmg:8, rate:0.2, spd:340, energy:1, count:2, spread:0.22,
  color:'#9ef04a', shape:'ball', r:4, poison:2.4, drag:0.6, desc:'腐蚀性毒液，持续伤害。',
  art:{kind:'laser',c1:'#4a6a3a',c2:'#1e2c18',c3:'#9ef04a',len:1.02},
  skill:{ name:'剧毒瘴气', cost:11, cd:8, desc:'投掷毒气弹，形成大片毒雾',
    fn:function(g,p,w){ sb(g,p,p.aim,{dmg:w.dmg,spd:300,r:6,color:'#9ef04a',shape:'ball',life:0.6,drag:1,
      onDie:function(gg,b){ gg.zone(b.x,b.y,86,5.5,'poison',w.dmg*0.5,'#9ef04a'); } }); } } });

def({ id:'tesla', name:'磁暴线圈枪', type:'gun', rarity:4, dmg:14, rate:0.24, spd:600, energy:1.5,
  color:'#a8d8ff', shape:'star', r:4, shock:1, desc:'电弧在敌群间跳跃。',
  art:{kind:'tesla',c1:'#4a5a8a',c2:'#1e2440',c3:'#a8d8ff',len:1.02},
  skill:{ name:'雷霆风暴', cost:14, cd:10, desc:'向全屏 8 个敌人降下天雷',
    fn:function(g,p,w){ var es=g.enemiesInRadius(p.x,p.y,520); U.shuffle(es);
      for(var i=0;i<Math.min(8,es.length);i++) (function(e,i){ g.delayed(i*0.11,function(){
        if(e.dead) return; g.lightningStrike(e.x,e.y,w.dmg*2.2,'#a8d8ff'); }); })(es[i],i);
      if(es.length===0){ g.lightningStrike(p.x+Math.cos(p.aim)*90,p.y+Math.sin(p.aim)*90,w.dmg*2.2,'#a8d8ff'); }
      G.Audio.sfx.thunder(); g.shake(8); } } });

def({ id:'bouncer', name:'弹跳枪', type:'gun', rarity:3, dmg:11, rate:0.22, spd:420, energy:1.2, bounce:4,
  color:'#ff9ad8', shape:'ball', r:4.5, life:2.6, desc:'子弹在墙壁间疯狂弹射。',
  art:{kind:'smg',c1:'#8a5a8a',c2:'#3a2440',c3:'#ff9ad8',len:1},
  skill:{ name:'弹球风暴', cost:12, cd:9, desc:'一次射出 14 颗超级弹球',
    fn:function(g,p,w){ ring(g,p,14,{dmg:w.dmg*1.2,spd:400,r:5,color:'#ff9ad8',shape:'ball',bounce:8,life:4.5},p.aim); g.shake(5); } } });

def({ id:'homing', name:'追踪导弹枪', type:'gun', rarity:4, dmg:15, rate:0.36, spd:280, energy:1.8, homing:3.2,
  color:'#ffb0e0', shape:'missile', r:4, aoe:30, life:2.6, desc:'锁定目标，无处可逃。',
  art:{kind:'launcher',c1:'#6a5a8a',c2:'#2a2440',c3:'#ffb0e0',len:1.05},
  skill:{ name:'导弹雨', cost:15, cd:11, desc:'升空 16 枚导弹全屏追踪',
    fn:function(g,p,w){ for(var i=0;i<16;i++) (function(i){ g.delayed(i*0.05,function(){
      sb(g,p,-1.57+U.rand(-0.9,0.9),{dmg:w.dmg*0.9,spd:200,r:4,color:'#ffb0e0',shape:'missile',aoe:34,homing:4.2,life:3.2,delay:0.18}); }); })(i);
      g.shake(6); } } });

def({ id:'blackhole', name:'黑洞发生器', type:'gun', rarity:5, dmg:16, rate:0.5, spd:260, energy:2.4,
  color:'#c07aff', shape:'orb', r:6, aoe:40, desc:'撕裂空间的禁忌造物。',
  art:{kind:'cannon',c1:'#5a4a8a',c2:'#241c40',c3:'#c07aff',len:1.1},
  skill:{ name:'奇点坍缩', cost:18, cd:14, desc:'制造黑洞，吸入并绞碎敌人',
    fn:function(g,p,w){ var d=140; g.blackhole(p.x+Math.cos(p.aim)*d,p.y+Math.sin(p.aim)*d,150,3.4,w.dmg*0.7); g.shake(10); } } });

def({ id:'prism', name:'光棱枪', type:'gun', rarity:4, dmg:10, rate:0.2, spd:640, energy:1.2, count:3, spread:0.26,
  color:'#a0f0ff', shape:'laser', r:3, pierce:1, desc:'光线折射，一化为三。',
  art:{kind:'laser',c1:'#6a7a9a',c2:'#28304a',c3:'#a0f0ff',len:1.05}, sfx:'laser',
  skill:{ name:'棱镜绽放', cost:13, cd:9, desc:'射出会分裂两次的光棱弹',
    fn:function(g,p,w){ for(var k=0;k<3;k++) sb(g,p,p.aim+(k-1)*0.2,{dmg:w.dmg*1.5,spd:520,r:4.5,color:'#a0f0ff',shape:'laser',pierce:1,life:1.4,
      onDie:function(gg,b){ for(var i=0;i<4;i++) sb(gg,b,i/4*TAU+U.rand(0,1),{dmg:w.dmg,spd:440,r:3.4,color:'#d0f8ff',shape:'laser',pierce:1,life:1.0}); } }); } } });

def({ id:'gauss', name:'高斯步枪', type:'gun', rarity:4, dmg:24, rate:0.44, spd:900, energy:2.4, pierce:3,
  color:'#d0e8ff', shape:'laser', r:4, desc:'磁力加速的钨芯弹。',
  art:{kind:'sniper',c1:'#68748f',c2:'#28303f',c3:'#d0e8ff',len:1.12},
  skill:{ name:'蓄能爆发', cost:13, cd:9, desc:'蓄力后释放巨型穿透弹',
    fn:function(g,p,w){ sb(g,p,p.aim,{dmg:w.dmg*3.2,spd:700,r:11,color:'#e8f4ff',shape:'orb',pierce:99,life:1.8,kb:220,aoe:44,sizeGrow:16}); g.shake(12); } } });

def({ id:'shuriken_gun', name:'手里剑发射器', type:'gun', rarity:3, dmg:12, rate:0.18, spd:520, energy:1.1, bounce:2,
  color:'#d8e8f0', shape:'star', r:4.5, desc:'高速旋转的钢制飞轮。',
  art:{kind:'smg',c1:'#7a8a9a',c2:'#2e3844',c3:'#d8e8f0',len:1},
  skill:{ name:'千刃乱舞', cost:12, cd:8, desc:'环绕自身释放 18 枚回旋手里剑',
    fn:function(g,p,w){ ring(g,p,18,{dmg:w.dmg*1.2,spd:380,r:5,color:'#d8e8f0',shape:'star',bounce:4,life:2.4,pierce:1},U.rand(0,1)); } } });

/* ============================== 蓄力武器 ============================== */
def({ id:'charge_sniper', name:'蓄力狙击枪', type:'gun', rarity:2, dmg:30, rate:1.0, spd:900, energy:2.5, auto:false, charge:1.0, pierce:1,
  color:'#eaf6ff', shape:'laser', r:4.5, life:1.6, kb:160,
  chargeFullDmg:2.8, chargeFullPierce:3, chargeFullCrit:1,
  desc:'蓄力越久，穿透越强；满蓄力必定暴击。',
  art:{kind:'sniper',c1:'#5f6a80',c2:'#252c3a',c3:'#8ef0ff',len:1.15},
  skill:{ name:'蓄能贯穿', cost:10, cd:8, desc:'立即满蓄力射出贯穿弹',
    fn:function(g,p,w){ p.charge=1; p.fire(g,w,1); g.shake(6); } } });

def({ id:'charge_staff', name:'蓄力法杖', type:'staff', rarity:2, dmg:18, rate:0.8, spd:360, energy:2, auto:false, charge:0.8,
  color:'#ff9a4a', shape:'orb', r:6, aoe:40, chargeFullDmg:2.4,
  desc:'蓄力越久，法球越大；满蓄力附带随机元素爆炸。',
  art:{kind:'staff',c1:'#8a5a2a',c2:'#3a2410',c3:'#ff9a4a',len:1.05}, sfx:'plasma',
  chargeFullFn:function(g,p,w,ang){
    var m=U.randi(0,4);
    var cols=['#ff7a3c','#9fe4ff','#9ef04a','#a8d8ff'];
    var sh=['orb','ice','ball','star'];
    var o={dmg:w.dmg*1.6,spd:420,r:9,color:cols[m],shape:sh[m],aoe:64,life:1.2};
    if(m===0) o.burn=2.5; else if(m===1) o.freeze=2; else if(m===2) o.poison=2.5; else o.shock=1;
    W.sb(g,p,ang,o);
    g.burst(p.x+Math.cos(ang)*16,p.y+Math.sin(ang)*16,10,{color:cols[m],spd:140,life:0.4});
  },
  skill:{ name:'元素爆发', cost:12, cd:9, desc:'立即满蓄力并释放元素法球',
    fn:function(g,p,w){ p.charge=1; p.fire(g,w,1); g.shake(5); } } });

def({ id:'charge_crossbow', name:'蓄力重弩', type:'bow', rarity:3, dmg:22, rate:0.6, spd:800, energy:2, auto:false, charge:0.6, pierce:2, kb:140,
  color:'#ffd8a0', shape:'arrow', r:4.5, chargeFullDmg:1.8,
  desc:'满蓄力三连发穿透弩箭。',
  art:{kind:'crossbow',c1:'#7a7a8a',c2:'#32323e',c3:'#ffd8a0',len:1.08},
  chargeFullFn:function(g,p,w,ang){
    for(var i=-1;i<=1;i++) W.sb(g,p,ang+i*0.12,{dmg:w.dmg*1.2,spd:900,r:5,color:'#ffe8c0',shape:'arrow',pierce:4,life:1.4,kb:180});
  },
  skill:{ name:'破甲齐射', cost:12, cd:8, desc:'立即满蓄力三连发',
    fn:function(g,p,w){ p.charge=1; p.fire(g,w,1); g.shake(5); } } });

def({ id:'charge_hammer', name:'蓄力战锤', type:'melee', rarity:3, dmg:30, rate:0.7, energy:0, kb:300,
  color:'#ffb43c', melee:{arc:2.2,range:46,dur:0.3}, charge:0.7, chargeFullDmg:2.0,
  desc:'蓄力后猛砸，满蓄力范围震荡并眩晕。',
  art:{kind:'hammer',c1:'#a8a098',c2:'#4a3a2a',c3:'#ffb43c',len:1.08},
  chargeFullFn:function(g,p,w,ang){
    g.shake(12);
    g.zone(p.x,p.y,90,0.5,'shock',w.dmg*0.5,'#ffb43c');
    var list=g.enemiesInRadius(p.x,p.y,90);
    for(var i=0;i<list.length;i++){
      g.damageEnemy(list[i], w.dmg*0.8, {kb:260, ang:U.ang(p.x,p.y,list[i].x,list[i].y), from:p});
      list[i].stun=Math.max(list[i].stun||0,1.2);
    }
    g.burst(p.x,p.y,20,{color:'#ffb43c',spd:200,life:0.5});
  },
  skill:{ name:'崩地一击', cost:10, cd:6, desc:'立即满蓄力猛砸',
    fn:function(g,p,w){ p.charge=1; p.fire(g,w,1); } } });

/* ============================== 纯直射激光武器 ============================== */
def({ id:'photon_cutter', name:'光子切割器', type:'laser', rarity:3, dmg:12, rate:0.05, energy:0.06, auto:true,
  beamWidth:6, beamDps:34, beamEnergy:3.0,
  color:'#7affd0', shape:'laser', r:3, desc:'持续光束切割一切，能量消耗平稳。',
  art:{kind:'laser',c1:'#556a8a',c2:'#232c3e',c3:'#7affd0',len:1.05}, sfx:'laser',
  skill:{ name:'光束过载', cost:12, cd:9, desc:'3 秒内光束伤害翻倍',
    fn:function(g,p,w){ p.addBuff('beamPower',3,2); g.float('光束过载!',p.x,p.y-26,'#7affd0'); } } });

def({ id:'annihilator', name:'湮灭射线', type:'laser', rarity:5, dmg:20, rate:0.05, energy:0.15, auto:true,
  beamWidth:12, beamDps:90, beamEnergy:5.0, overheatRate:0.33, overheatCd:1.5,
  color:'#ff5b6e', shape:'laser', r:4, desc:'粗壮湮灭光束，持续射击会过热。',
  art:{kind:'cannon',c1:'#6a5a6a',c2:'#2a202a',c3:'#ff5b6e',len:1.1}, sfx:'laser',
  skill:{ name:'湮灭脉冲', cost:18, cd:12, desc:'瞬间释放全屏贯穿光束',
    fn:function(g,p,w){ g.beam(p.x,p.y,p.aim,900,w.dmg*3,{color:'#ff5b6e',width:16,team:'player',dur:0.4,pierceAll:true}); g.shake(12); G.Audio.sfx.thunder(); } } });

/* ============================== 弓 / 法杖 ============================== */
def({ id:'bow', name:'猎人长弓', type:'bow', rarity:2, dmg:16, rate:0.42, spd:600, energy:1.2, auto:false, charge:0.6, pierce:1,
  color:'#f0d8a0', shape:'arrow', r:4, desc:'蓄力越久，威力越强。',
  art:{kind:'bow',c1:'#8a6a3a',c2:'#3a2c18',c3:'#f0d8a0',len:1.05},
  skill:{ name:'箭雨齐发', cost:11, cd:8, desc:'向天射出 20 箭，覆盖前方',
    fn:function(g,p,w){ for(var i=0;i<20;i++) (function(i){ g.delayed(i*0.03,function(){
      var d=U.rand(60,260), a=p.aim+U.rand(-0.5,0.5);
      g.skyStrike(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,w.dmg*0.9,'#f0d8a0','arrow'); }); })(i); } } });

def({ id:'crossbow', name:'重型十字弩', type:'bow', rarity:3, dmg:30, rate:0.72, spd:780, energy:2.2, auto:false, pierce:3, kb:120,
  color:'#ffd8a0', shape:'arrow', r:4.5, desc:'强力穿透，破甲专家。',
  art:{kind:'crossbow',c1:'#7a7a8a',c2:'#32323e',c3:'#ffd8a0',len:1.08},
  skill:{ name:'破甲三连', cost:12, cd:8, desc:'三发破甲弩箭，穿透并使敌人易伤',
    fn:function(g,p,w){ for(var i=0;i<3;i++) (function(i){ g.delayed(i*0.13,function(){
      sb(g,p,p.aim,{dmg:w.dmg*1.5,spd:900,r:6,color:'#ffe8c0',shape:'arrow',pierce:99,life:1.6,kb:180,
        onHit:function(gg,b,e){ e.vuln=Math.max(e.vuln||0,4); }}); }); })(i); g.shake(5); } } });

def({ id:'fire_staff', name:'炎爆法杖', type:'staff', rarity:3, dmg:18, rate:0.4, spd:340, energy:2,
  color:'#ff7a3c', shape:'orb', r:6, aoe:44, burn:2, desc:'释放灼热火球。',
  art:{kind:'staff',c1:'#8a4a2a',c2:'#3a1e10',c3:'#ff7a3c',len:1.05}, sfx:'plasma',
  skill:{ name:'陨石天降', cost:15, cd:11, desc:'呼唤 6 颗陨石轰击前方',
    fn:function(g,p,w){ for(var i=0;i<6;i++) (function(i){ g.delayed(i*0.16,function(){
      var d=U.rand(40,220), a=p.aim+U.rand(-0.7,0.7);
      g.meteor(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,w.dmg*2.4,70,'#ff7a3c'); }); })(i); g.shake(7); } } });

def({ id:'ice_staff', name:'寒冰法杖', type:'staff', rarity:3, dmg:13, rate:0.3, spd:400, energy:1.6, count:3, spread:0.34,
  color:'#9fe4ff', shape:'ice', r:4.5, freeze:2, desc:'三道寒冰射线。',
  art:{kind:'staff',c1:'#3a5a7a',c2:'#182a3a',c3:'#9fe4ff',len:1.05},
  skill:{ name:'绝对暴雪', cost:14, cd:10, desc:'5 秒暴风雪领域，持续冰冻',
    fn:function(g,p,w){ p.addBuff('blizzard',5,{dmg:w.dmg*0.6,color:'#9fe4ff'}); G.Audio.sfx.freeze(); } } });

def({ id:'storm_staff', name:'雷霆法杖', type:'staff', rarity:4, dmg:16, rate:0.34, spd:700, energy:1.8, shock:1,
  color:'#c8e0ff', shape:'star', r:4.5, pierce:1, desc:'电弧连锁伤害。',
  art:{kind:'staff',c1:'#4a4a8a',c2:'#1e1e40',c3:'#c8e0ff',len:1.05},
  skill:{ name:'万雷归宗', cost:16, cd:12, desc:'在准星处降下持续雷暴',
    fn:function(g,p,w){ var tx=p.x+Math.cos(p.aim)*160, ty=p.y+Math.sin(p.aim)*160;
      for(var i=0;i<14;i++) (function(i){ g.delayed(i*0.13,function(){
        g.lightningStrike(tx+U.rand(-80,80),ty+U.rand(-80,80),w.dmg*1.6,'#c8e0ff'); }); })(i);
      G.Audio.sfx.thunder(); g.shake(9); } } });

def({ id:'necro_staff', name:'亡灵法杖', type:'staff', rarity:4, dmg:14, rate:0.42, spd:340, energy:1.8, homing:1.6,
  color:'#a8ff9a', shape:'skull', r:5, desc:'操纵亡魂之力。',
  art:{kind:'staff',c1:'#3a4a3a',c2:'#161e16',c3:'#a8ff9a',len:1.05},
  skill:{ name:'亡者军团', cost:16, cd:16, desc:'召唤 3 名骷髅战士为你而战',
    fn:function(g,p,w){ for(var i=0;i<3;i++) g.summonAlly('skeleton', p.x+U.rand(-30,30), p.y+U.rand(-30,30), 18);
      g.float('亡者听令!',p.x,p.y-28,'#a8ff9a'); } } });

def({ id:'holy_staff', name:'圣光法杖', type:'staff', rarity:4, dmg:15, rate:0.32, spd:480, energy:1.6, pierce:2,
  color:'#fff0a8', shape:'orb', r:5, desc:'净化之光，对亡灵重伤。',
  art:{kind:'staff',c1:'#8a7a4a',c2:'#3a3018',c3:'#fff0a8',len:1.05},
  skill:{ name:'圣愈之环', cost:14, cd:14, desc:'回复 25 生命并爆发圣光',
    fn:function(g,p,w){ g.healPlayer(25); ring(g,p,16,{dmg:w.dmg*1.8,spd:420,r:5,color:'#fff0a8',shape:'orb',pierce:4,life:1.0},U.rand(0,1));
      g.zone(p.x,p.y,110,0.4,'holy',w.dmg,'#fff0a8'); G.Audio.sfx.heal(); } } });

def({ id:'void_staff', name:'虚空法典', type:'staff', rarity:5, dmg:20, rate:0.28, spd:420, energy:2,
  color:'#d07aff', shape:'orb', r:5.5, homing:1.2, pierce:1, desc:'来自虚空的低语。',
  art:{kind:'book',c1:'#8a4aca',c2:'#2a1440',c3:'#e0a0ff',len:1.05},
  skill:{ name:'虚空裂隙', cost:17, cd:12, desc:'开启裂隙，持续喷涌虚空之矢',
    fn:function(g,p,w){ var tx=p.x+Math.cos(p.aim)*130, ty=p.y+Math.sin(p.aim)*130;
      g.rift(tx,ty,4.0,w.dmg*0.85); g.shake(6); } } });

def({ id:'spellbook', name:'混沌魔典', type:'staff', rarity:4, dmg:14, rate:0.36, spd:420, energy:1.6,
  color:'#ffa0ff', shape:'star', r:5, desc:'每次攻击元素随机。',
  art:{kind:'book',c1:'#6a4a8a',c2:'#241840',c3:'#ffa0ff',len:1.05},
  onFire:function(g,p,w,ang){
    var m=U.randi(0,4);
    if(m===0) sb(g,p,ang,{dmg:w.dmg*1.2,spd:420,r:5,color:'#ff7a3c',shape:'orb',aoe:38,burn:2});
    else if(m===1) fan(g,p,ang,3,0.4,{dmg:w.dmg*0.8,spd:460,r:4,color:'#9fe4ff',shape:'ice',freeze:1.6});
    else if(m===2) sb(g,p,ang,{dmg:w.dmg,spd:640,r:4,color:'#c8e0ff',shape:'star',shock:1,pierce:2});
    else sb(g,p,ang,{dmg:w.dmg*1.1,spd:380,r:5,color:'#a8ff9a',shape:'skull',homing:2.4,poison:2});
    return true; },
  skill:{ name:'元素狂潮', cost:16, cd:11, desc:'四种元素同时爆发环绕全场',
    fn:function(g,p,w){ var cols=['#ff7a3c','#9fe4ff','#c8e0ff','#a8ff9a'], sh=['orb','ice','star','skull'];
      for(var k=0;k<4;k++) (function(k){ g.delayed(k*0.12,function(){
        ring(g,p,9,{dmg:w.dmg*1.3,spd:380,r:5,color:cols[k],shape:sh[k],pierce:2,life:1.6,burn:k===0?2:0,freeze:k===1?2:0,shock:k===2?1:0,poison:k===3?2:0},k*0.2); }); })(k);
      g.shake(7); } } });

/* ============================== 近战 ============================== */
def({ id:'sword', name:'铁剑', type:'melee', rarity:1, dmg:16, rate:0.4, energy:0, kb:150,
  color:'#dfe6f0', melee:{arc:2.0,range:38,dur:0.2}, deflect:true, desc:'挥砍可弹开子弹。',
  art:{kind:'sword',c1:'#cdd6e6',c2:'#5a4a3a',c3:'#ffd45e',len:1},
  skill:{ name:'剑气斩', cost:6, cd:3.5, desc:'挥出远程剑气波',
    fn:function(g,p,w){ sb(g,p,p.aim,{dmg:w.dmg*1.8,spd:460,r:9,color:'#dfe6f0',shape:'slash',pierce:99,life:0.75,kb:160,spin:1}); G.Audio.sfx.sword(); } } });

def({ id:'greatsword', name:'巨剑', type:'melee', rarity:3, dmg:34, rate:0.72, energy:0, kb:260,
  color:'#e8e0c8', melee:{arc:2.5,range:50,dur:0.3}, deflect:true, desc:'沉重但一击致命。',
  art:{kind:'greatsword',c1:'#d8d0b8',c2:'#4a3a2a',c3:'#ff9a3c',len:1.1},
  skill:{ name:'崩山击', cost:10, cd:6, desc:'跃起猛砸，造成范围震荡',
    fn:function(g,p,w){ p.leapSlam(p.aim,w.dmg*2.6); } } });

def({ id:'twin_blade', name:'影双刀', type:'melee', rarity:3, dmg:13, rate:0.16, energy:0, kb:70,
  color:'#c8f0ff', melee:{arc:1.7,range:34,dur:0.12}, deflect:true, desc:'快到出现残影。',
  art:{kind:'dagger',c1:'#c8f0ff',c2:'#2a3a4a',c3:'#7affd0',len:1},
  skill:{ name:'影袭连斩', cost:9, cd:5, desc:'瞬移穿透敌群，沿途连斩',
    fn:function(g,p,w){ p.dashAttack(p.aim,220,w.dmg*2.2,'#c8f0ff'); } } });

def({ id:'spear', name:'龙牙长枪', type:'melee', rarity:3, dmg:24, rate:0.46, energy:0, kb:180,
  color:'#ffd8a0', melee:{arc:0.85,range:62,dur:0.18}, desc:'一寸长一寸强。',
  art:{kind:'spear',c1:'#e0d0b0',c2:'#5a4a2a',c3:'#ff7a3c',len:1.15},
  skill:{ name:'贯穿冲刺', cost:9, cd:5, desc:'化作利箭冲刺，穿透所有敌人',
    fn:function(g,p,w){ p.dashAttack(p.aim,300,w.dmg*2.0,'#ffd8a0'); } } });

def({ id:'hammer', name:'战锤', type:'melee', rarity:3, dmg:40, rate:0.9, energy:0, kb:340,
  color:'#c8c0b0', melee:{arc:2.2,range:44,dur:0.34}, desc:'一锤定音。',
  art:{kind:'hammer',c1:'#a8a098',c2:'#4a3a2a',c3:'#ffb43c',len:1.08},
  skill:{ name:'震地波', cost:11, cd:7, desc:'砸地释放三重冲击波',
    fn:function(g,p,w){ for(var k=0;k<3;k++) (function(k){ g.delayed(k*0.16,function(){
      ring(g,p,10+k*4,{dmg:w.dmg*0.9,spd:300+k*60,r:7,color:'#ffcf8a',shape:'wave',pierce:99,life:0.7,kb:220},k*0.3); }); })(k);
      g.shake(12); G.Audio.sfx.heavy(); } } });

def({ id:'lightsaber', name:'源能光剑', type:'melee', rarity:5, dmg:30, rate:0.24, energy:0, kb:140,
  color:'#7affd0', melee:{arc:2.1,range:44,dur:0.15}, deflect:true, desc:'挥砍自带弹反，切开一切。',
  art:{kind:'saber',c1:'#8a94a8',c2:'#2a3038',c3:'#7affd0',len:1.05},
  skill:{ name:'光刃风暴', cost:12, cd:7, desc:'旋转斩击 2 秒并弹开所有子弹',
    fn:function(g,p,w){ p.addBuff('bladestorm',2.0,{dmg:w.dmg*0.9,color:'#7affd0'}); p.addBuff('deflectAll',2.0,1); } } });

def({ id:'scythe', name:'死神镰刀', type:'melee', rarity:4, dmg:28, rate:0.52, energy:0, kb:160,
  color:'#c07aff', melee:{arc:3.0,range:48,dur:0.26}, lifesteal:0.12, desc:'挥砍吸取生命。',
  art:{kind:'scythe',c1:'#d0c0e8',c2:'#2a1c3a',c3:'#c07aff',len:1.1},
  skill:{ name:'死亡收割', cost:11, cd:8, desc:'旋风收割 2.5 秒，伤害转化为生命',
    fn:function(g,p,w){ p.addBuff('bladestorm',2.5,{dmg:w.dmg*0.8,color:'#c07aff'}); p.addBuff('vamp',2.5,0.35); } } });

def({ id:'gauntlet', name:'源力拳套', type:'melee', rarity:3, dmg:11, rate:0.13, energy:0, kb:120,
  color:'#ffb43c', melee:{arc:1.1,range:30,dur:0.1}, desc:'快如闪电的连击。',
  art:{kind:'fist',c1:'#c8a060',c2:'#4a3a20',c3:'#ffb43c',len:0.95},
  skill:{ name:'百裂拳', cost:10, cd:6, desc:'瞬间打出 16 记重拳冲击',
    fn:function(g,p,w){ for(var i=0;i<16;i++) (function(i){ g.delayed(i*0.05,function(){
      sb(g,p,p.aim+U.rand(-0.28,0.28),{dmg:w.dmg*1.3,spd:520,r:6,color:'#ffb43c',shape:'wave',life:0.22,kb:100,pierce:2}); g.shake(2); }); })(i); } } });

def({ id:'boomerang', name:'回旋利刃', type:'melee', rarity:3, dmg:18, rate:0.5, energy:1.2, kb:90,
  color:'#8ef0ff', shape:'star', spd:400, r:6, desc:'投出后自动飞回。',
  art:{kind:'boomerang',c1:'#8ef0ff',c2:'#2a4a5a',c3:'#ffd45e',len:1},
  onFire:function(g,p,w,ang){ g.boomerang(p,ang,w.dmg,'#8ef0ff'); return true; },
  skill:{ name:'旋风五连镖', cost:11, cd:7, desc:'同时投出 5 把回旋刃',
    fn:function(g,p,w){ for(var i=0;i<5;i++) g.boomerang(p,p.aim+(i-2)*0.35,w.dmg*1.3,'#8ef0ff'); } } });

def({ id:'dragon_fang', name:'龙牙剑', type:'melee', rarity:5, dmg:42, rate:0.44, energy:0, kb:220,
  color:'#ff9a3c', melee:{arc:2.4,range:50,dur:0.22}, deflect:true, burnHit:2,
  desc:'传说中屠龙者的佩剑，斩击附带烈焰。',
  art:{kind:'greatsword',c1:'#ffb060',c2:'#5a2a10',c3:'#ffe07a',len:1.12},
  skill:{ name:'龙焰斩', cost:14, cd:9, desc:'释放巨大龙焰剑气，灼烧一切',
    fn:function(g,p,w){ for(var k=0;k<3;k++) (function(k){ g.delayed(k*0.1,function(){
      sb(g,p,p.aim,{dmg:w.dmg*1.6,spd:420+k*60,r:14+k*4,color:'#ff9a3c',shape:'slash',pierce:99,life:0.9,kb:200,burn:3,sizeGrow:12}); }); })(k);
      g.shake(10); G.Audio.sfx.heavy(); } } });

/* ============================== 射击特性 ==============================
   除右键技能外，每把武器的"普通攻击"还有一条独特机制，进一步拉开手感差异 */
W.TRAITS = {
  everyN:  { name:'蓄能弹',   desc:'每第 3 发射出强化弹：伤害 x2.4、体积更大、穿透 +2 且必定暴击' },
  heat:    { name:'过热连射', desc:'持续开火射速最高提升 55%，停火后逐渐冷却' },
  spinup:  { name:'转膛预热', desc:'越打越快，射速最高提升 85%（起步较慢）' },
  burst:   { name:'三连爆发', desc:'每次开火射出 3 连点射' },
  close:   { name:'贴脸压制', desc:'距离越近伤害越高，最高 +85%' },
  long:    { name:'远程精准', desc:'飞行距离越远伤害越高，最高 +90%' },
  overload:{ name:'能量过载', desc:'能量高于 70% 时伤害 +55%' },
  growing: { name:'滚雪球',   desc:'子弹在飞行中不断变大，伤害持续攀升' },
  magazine:{ name:'弹夹装填', desc:'弹夹打空后需短暂换弹，但每发伤害 +25%' },
  split:   { name:'碎裂弹',   desc:'命中后炸开 3 枚碎片弹' },
  chain:   { name:'电弧传导', desc:'命中后电弧跳向附近 2 个敌人' },
  frostbite:{name:'霜寒累积', desc:'命中叠加霜冻层数，3 层直接冻结目标' },
  ricochet:{ name:'蓄力跳弹', desc:'每次弹跳后伤害 +30%' },
  lock:    { name:'静止锁定', desc:'静止 0.4 秒后子弹获得强力追踪' },
  killCharge:{name:'猎杀充能',desc:'击杀敌人回复 7 点能量并短暂加速' },
  combo:   { name:'连击加速', desc:'连续攻击速度递增，最高 +55%' },
  execute: { name:'处决',     desc:'对生命低于 35% 的敌人造成双倍伤害' },
  harvest: { name:'收割',     desc:'击杀敌人回复 8 点生命' },
  chaos:   { name:'混沌',     desc:'每次攻击的元素完全随机' },
  charge:  { name:'蓄力',     desc:'长按蓄力，伤害与弹速随蓄力提升' }
};
var TRAIT_MAP = {
  pistol:'everyN', dual:'heat', smg:'heat', rifle:'burst', shotgun:'close', combat_shotgun:'close',
  sniper:'long', minigun:'spinup', laser_gun:'overload', plasma:'growing', railgun:'long',
  rpg:'magazine', grenade:'split', frost_cannon:'frostbite', flamer:'heat', toxic:'split',
  tesla:'chain', bouncer:'ricochet', homing:'lock', blackhole:'growing', prism:'split',
  gauss:'long', shuriken_gun:'ricochet', bow:'charge', crossbow:'magazine',
  charge_sniper:'charge', charge_staff:'charge', charge_crossbow:'charge', charge_hammer:'charge',
  fire_staff:'everyN', ice_staff:'frostbite', storm_staff:'chain', necro_staff:'killCharge',
  holy_staff:'overload', void_staff:'growing', spellbook:'chaos',
  sword:'combo', greatsword:'execute', twin_blade:'combo', spear:'execute', hammer:'execute',
  lightsaber:'combo', scythe:'harvest', gauntlet:'combo', boomerang:'killCharge', dragon_fang:'execute'
};
for(var ti=0;ti<W.list.length;ti++){
  var wq=W.list[ti];
  if(TRAIT_MAP[wq.id]) wq.trait=TRAIT_MAP[wq.id];
  if(wq.trait==='magazine'){ wq.magSize=(wq.id==='rpg'?3:5); wq.reloadTime=(wq.id==='rpg'?1.25:0.95); }
}

/* ===== 稀有度重分配：让每一档都有足够多的武器，避免前期反复刷到同几把 ===== */
var RARITY_SET = {
  1:['pistol','sword','smg','dual','shotgun','bow','gauntlet','boomerang'],
  2:['rifle','combat_shotgun','grenade','toxic','bouncer','crossbow','twin_blade','shuriken_gun','spear','flamer','charge_sniper','charge_staff'],
  3:['sniper','laser_gun','frost_cannon','fire_staff','ice_staff','greatsword','hammer','homing','prism','spellbook','scythe','charge_crossbow','charge_hammer','photon_cutter'],
  4:['minigun','plasma','rpg','tesla','storm_staff','necro_staff','holy_staff','gauss'],
  5:['railgun','blackhole','lightsaber','dragon_fang','void_staff','annihilator']
};
for(var rk in RARITY_SET){
  for(var rj=0;rj<RARITY_SET[rk].length;rj++){
    var wr=W.byId[RARITY_SET[rk][rj]];
    if(wr) wr.rarity=parseInt(rk,10);
  }
}

/* ============================== 稀有度池 ============================== */
W.pools = [[],[],[],[],[]];
for(var i=0;i<W.list.length;i++) W.pools[W.list[i].rarity-1].push(W.list[i]);

W.RARITY_NAME = ['普通','精良','稀有','史诗','传说'];
W.RARITY_COLOR = ['#c8d4ea','#6ee27f','#6ab7ff','#c88bff','#ffb143'];

W.roll = function(floor, boost){
  floor = floor||1; boost = boost||0;
  var f = U.clamp((floor-1)/7, 0, 1.1);
  var b = U.clamp(boost, 0, 2.2) * 0.5;
  var wts = [
    Math.max(6, 64 - f*40 - b*20),
    30 + f*4  - b*2,
    8.5 + f*15 + b*8,
    2.0 + f*6.5 + b*6,
    0.35 + f*2.0 + b*2.6
  ];
  /* 强制单调递减：任何一档都不会比更低稀有度更常见 */
  var mi;
  for(mi=1;mi<5;mi++) if(wts[mi] > wts[mi-1]*0.9) wts[mi] = wts[mi-1]*0.9;
  var tot=0,i;
  for(i=0;i<5;i++){ if(wts[i]<0) wts[i]=0; tot+=wts[i]; }
  var r=Math.random()*tot;
  for(i=0;i<5;i++){ r-=wts[i]; if(r<=0) break; }
  if(i>4) i=4;
  var pool = W.pools[i];
  while((!pool || !pool.length) && i>0){ i--; pool=W.pools[i]; }
  return U.pick(pool);
};
/* ============================== 合成 / 回收 ==============================
   合成：主武器（枪械/近战形态）+ 副武器（法杖/元素武器）→ 主武器形态 + 副武器元素属性
   回收：武器分解为金币 + 材料点数（材料可抵扣合成费用） */
W.ELEMENTS = [
  { k:'freeze', name:'霜寒', color:'#9fe4ff', desc:'冻结敌人' },
  { k:'burn',   name:'烈焰', color:'#ff8a2a', desc:'点燃敌人' },
  { k:'poison', name:'剧毒', color:'#9ef04a', desc:'使敌人中毒' },
  { k:'shock',  name:'雷电', color:'#a8d8ff', desc:'触发连锁闪电' }
];
W.elementOf = function(def){
  for(var i=0;i<W.ELEMENTS.length;i++){
    var e=W.ELEMENTS[i];
    if(def[e.k]) return e;
  }
  return null;
};
W.fuseCost = function(mainDef, subDef){
  var r = Math.max(mainDef.rarity, subDef.rarity);
  return Math.max(5, 20 + r*15);
};
/* 合成规则（模块化组合）：
   主武器 A 提供形态/数值，副武器 B 提供【技能 + 特性 + 元素】。
   技能与特性均为模块化对象/字符串，可自由组合 → 组合数量 ≈ 武器数² */
W.fuse = function(mainDef, subDef){
  var out = Object.create(mainDef);
  var prefix = null;
  /* 1. B 的技能转移（B 无技能时清除 A 继承的技能） */
  if(subDef.skill){
    out.skill = subDef.skill;
    prefix = subDef.skill.name;
  } else {
    out.skill = undefined;
  }
  /* 2. B 的特性转移（含 trait 依赖字段；B 无特性时清除 A 继承的特性） */
  if(subDef.trait){
    out.trait = subDef.trait;
    if(subDef.trait==='magazine'){
      out.magSize = subDef.magSize;
      out.reloadTime = subDef.reloadTime;
    }
    if(subDef.charge){
      out.charge = subDef.charge;
      out.chargeFullDmg = subDef.chargeFullDmg;
      out.chargeFullPierce = subDef.chargeFullPierce;
      out.chargeFullCrit = subDef.chargeFullCrit;
      out.chargeFullFn = subDef.chargeFullFn;
    }
    if(!prefix && W.TRAITS[subDef.trait]) prefix = W.TRAITS[subDef.trait].name;
  } else {
    out.trait = undefined;
  }
  /* 3. B 的元素转移 */
  var elem = W.elementOf(subDef);
  if(elem){
    out[elem.k] = Math.max(mainDef[elem.k]||0, subDef[elem.k]);
    out.color = elem.color;
    if(out.art) out.art = Object.create(mainDef.art);
    if(out.art) out.art.c3 = elem.color;
    if(!prefix) prefix = elem.name;
  }
  /* 4. B 的弹道特性兜底（无技能/特性/元素时） */
  if(!prefix){
    if(subDef.homing && !out.homing) out.homing = subDef.homing;
    if(subDef.pierce && !out.pierce) out.pierce = subDef.pierce;
    if(subDef.bounce && !out.bounce) out.bounce = subDef.bounce;
    if(subDef.aoe && !out.aoe) out.aoe = subDef.aoe;
    prefix = '强化';
  }
  out.dmg = Math.round(mainDef.dmg*1.15 + subDef.dmg*0.3);
  out.rarity = Math.min(5, Math.max(mainDef.rarity, subDef.rarity) + (Math.random()<0.25?1:0));
  out.name = prefix + '·' + mainDef.name;
  out.desc = '合成武器：' + mainDef.name + ' × ' + subDef.name;
  out.fused = true;
  out.fuseFrom = [mainDef.id, subDef.id];
  return out;
};
/* ============================== 武器配件（改造） ============================== */
W.PARTS = {
  scope:  { name:'精准瞄准镜', levels:[{rate:0.12},{rate:0.2},{rate:0.3}], desc:'射速 +12% / +20% / +30%' },
  mag:    { name:'扩容弹夹',   levels:[{mag:1},{mag:2},{mag:3}], desc:'弹夹 +1 / +2 / +3（无弹夹武器能量消耗 -10% / -20% / -30%）' },
  pierce: { name:'穿甲弹头',   levels:[{pierce:1},{pierce:2},{pierce:3}], desc:'穿透 +1 / +2 / +3' },
  core:   { name:'能量核心',   levels:[{cost:0.15},{cost:0.25},{cost:0.35}], desc:'能量消耗 -15% / -25% / -35%' },
  boom:   { name:'爆裂模块',   levels:[{boom:0.15},{boom:0.25},{boom:0.35}], desc:'15% / 25% / 35% 命中爆炸' },
  elem:   { name:'元素模块',   levels:[{elem:1},{elem:2},{elem:3}], desc:'随机元素附魔（火/冰/毒/电）' }
};
W.partId = function(kind, lv){ return kind+lv; };
W.partInfo = function(pid){
  var m=String(pid).match(/^([a-z]+)(\d)$/);
  if(!m) return null;
  var p=W.PARTS[m[1]];
  if(!p) return null;
  var lv=parseInt(m[2],10);
  return { id:pid, kind:m[1], level:lv, name:p.name, desc:p.desc, price:15+lv*10 };
};
W.partStats = function(inst){
  var s={rate:0,cost:0,pierce:0,boom:0,mag:0};
  var parts=inst.parts||[];
  for(var i=0;i<parts.length;i++){
    var info=W.partInfo(parts[i]);
    if(!info) continue;
    var l=W.PARTS[info.kind].levels[info.level-1];
    if(!l) continue;
    if(l.rate) s.rate+=l.rate;
    if(l.cost) s.cost+=l.cost;
    if(l.pierce) s.pierce+=l.pierce;
    if(l.boom) s.boom+=l.boom;
    if(l.mag) s.mag+=l.mag;
  }
  return s;
};
W.attachPart = function(inst, pid){
  var info=W.partInfo(pid);
  if(!info) return false;
  if(!inst.parts) inst.parts=[];
  if(inst.parts.length>=2) return false;
  if(inst.parts.indexOf(pid)>=0) return false;
  inst.parts.push(pid);
  if(info.kind==='mag'){
    inst.magSize=(inst.magSize||5)+info.level;
    if(inst.mag!==undefined) inst.mag+=info.level;
  }
  if(info.kind==='elem'){
    var e=U.pick(W.ELEMENTS);
    inst._origColor=inst._origColor||inst.color;
    inst.elemPart=e.k;
    inst[e.k]=Math.max(inst[e.k]||0,1.5);
    inst.color=e.color;
  }
  return true;
};
W.detachPart = function(inst, pid){
  var info=W.partInfo(pid);
  if(!info || !inst.parts) return false;
  var i=inst.parts.indexOf(pid);
  if(i<0) return false;
  inst.parts.splice(i,1);
  if(info.kind==='mag'){
    inst.magSize=Math.max(1,(inst.magSize||5)-info.level);
    if(inst.mag!==undefined) inst.mag=Math.max(0,inst.mag-info.level);
  }
  if(info.kind==='elem' && inst.elemPart){
    var base=Object.getPrototypeOf(inst);
    if(base && base[inst.elemPart]) inst[inst.elemPart]=base[inst.elemPart];
    else delete inst[inst.elemPart];
    inst.elemPart=null;
    if(inst._origColor){ inst.color=inst._origColor; delete inst._origColor; }
  }
  return true;
};
W.snapshot = function(inst){
  /* 武器实例快照：保留实例全部自有属性（附魔/强化/配件/状态），用于掉落/存档。
     沿原型链找到注册 def 作为新原型，避免多次快照形成嵌套原型链。 */
  var def = inst;
  while(def && W.byId[def.id] !== def) def = Object.getPrototypeOf(def);
  if(!def) def = Object.getPrototypeOf(inst) || inst;
  var snap = Object.create(def);
  var cur = inst;
  while(cur && cur !== def){
    for(var k in cur){
      if(Object.prototype.hasOwnProperty.call(cur, k)) snap[k] = cur[k];
    }
    cur = Object.getPrototypeOf(cur);
  }
  return snap;
};
W.scrapValue = function(def){
  var gold = [8, 18, 34, 60, 100][Math.min(4, (def.rarity||1)-1)];
  return { gold: gold, mats: (def.rarity||1) };
};
W.get = function(id){ return W.byId[id]; };
})();
