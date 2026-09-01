/* 元气骑士·深渊回响 —— 实体：英雄 / 怪物 / 子弹 / 特效 */
(function(){
var G = window.G || (window.G = {});
var U = G.U, Art = G.Art, Wp = G.Weapons, En = G.Enemies;
var TAU = Math.PI*2;

/* ==================================================================
                              英 雄
   ================================================================== */
G.Heroes = [
 { id:'knight', name:'骑士', tag:'攻守兼备', c1:'#3f6fd8', c2:'#26417f', c3:'#c8d4ea', skin:'#f2c9a0', cape:'#d84a5a', helm:'knight',
   hp:120, armor:45, spd:152, energy:32, ereg:2.2, crit:0.05, dr:0.12,
   desc:'元气骑士团首席，厚重的板甲让他能硬吃伤害。',
   passive:'受到的伤害降低 12%',
   ult:{ name:'圣盾反弹', cd:20, desc:'3.5 秒无敌，弹开一切子弹并强化攻击',
     fn:function(g,p){ p.addBuff('invuln',3.5,1); p.addBuff('deflectAll',3.5,1); p.addBuff('power',3.5,1.4);
       g.burst(p.x,p.y,32,{color:'#ffe07a',spd:220,life:0.7}); g.shake(8); G.Audio.sfx.power(); } },
   weapons:['sword','pistol'] },

 { id:'mage', name:'法师', tag:'源能大师', c1:'#7a4ad8', c2:'#3f2480', c3:'#e0c060', skin:'#f0d0b0', cape:'#5a3ac0', helm:'hat',
   hp:88, armor:30, spd:150, energy:52, ereg:4.2, crit:0.06, dr:0,
   desc:'能量回复远超常人，可以毫无顾忌地释放武器技能。',
   passive:'能量上限与回复大幅提升，技能消耗 -25%',
   ult:{ name:'时间静滞', cd:24, desc:'冻结时间 4 秒，能量瞬间充满',
     fn:function(g,p){ p.energy=p.maxEnergy; g.timeStop(4.0);
       g.burst(p.x,p.y,44,{color:'#a0d8ff',spd:260,life:0.9}); g.shake(6); G.Audio.sfx.freeze(); } },
   weapons:['fire_staff','pistol'], skillCostMult:0.75 },

 { id:'ranger', name:'游侠', tag:'疾风射手', c1:'#3f9a5a', c2:'#215c38', c3:'#c8e070', skin:'#e8bb90', cape:null, helm:'hood',
   hp:96, armor:32, spd:174, energy:38, ereg:2.8, crit:0.12, dr:0,
   desc:'身法轻盈，翻滚冷却极短，擅长风筝走位。',
   passive:'移动速度 +15%，翻滚冷却减半',
   ult:{ name:'疾风连射', cd:20, desc:'6 秒内射速三倍且不消耗能量',
     fn:function(g,p){ p.addBuff('rapid',6,3.0); p.addBuff('freeAmmo',6,1); p.addBuff('haste',6,1.3);
       g.burst(p.x,p.y,26,{color:'#c8e070',spd:200,life:0.6}); G.Audio.sfx.power(); } },
   weapons:['bow','pistol'], dodgeCdMult:0.5 },

 { id:'assassin', name:'刺客', tag:'暗影收割', c1:'#3a3a52', c2:'#1c1c2e', c3:'#c07aff', skin:'#e0b898', cape:'#2a2038', helm:'hood',
   hp:84, armor:26, spd:168, energy:36, ereg:2.6, crit:0.28, dr:0,
   desc:'暴击率极高，一击致命的黑暗行者。',
   passive:'暴击率 +28%，暴击伤害 +50%',
   ult:{ name:'影袭乱舞', cd:19, desc:'瞬移至敌群中连续斩击 8 次',
     fn:function(g,p){ p.shadowStrike(8); }, },
   weapons:['twin_blade','pistol'], critDmgBonus:0.5 },

 { id:'robot', name:'机械师', tag:'钢铁堡垒', c1:'#5a6a8a', c2:'#2e3850', c3:'#5ee0ff', skin:'#8a94a8', cape:null, helm:'visor', eye:'#5ee0ff',
   hp:140, armor:60, spd:140, energy:34, ereg:2.4, crit:0.04, dr:0.06,
   desc:'超厚护甲与自动炮台，站桩输出的绝对堡垒。',
   passive:'最大护甲极高，护甲恢复速度 +60%',
   ult:{ name:'炮台部署', cd:22, desc:'部署 2 座自动炮台并获得护盾',
     fn:function(g,p){ g.summonAlly('turret_ally',p.x-30,p.y,16); g.summonAlly('turret_ally',p.x+30,p.y,16);
       p.addBuff('shield',10,60); g.burst(p.x,p.y,24,{color:'#5ee0ff',spd:180,life:0.7}); G.Audio.sfx.power(); } },
   weapons:['smg','pistol'], armorRegenMult:1.6 },

 { id:'berserker', name:'狂战士', tag:'背水一战', c1:'#b03a3a', c2:'#5e1c1c', c3:'#ffb43c', skin:'#e8b090', cape:'#7a2020', helm:'crown',
   hp:150, armor:0, spd:158, energy:30, ereg:2.0, crit:0.08, dr:0,
   desc:'没有护甲，但生命越低伤害越高。',
   passive:'无护甲；生命低于 50% 时伤害最高 +70%',
   ult:{ name:'血怒狂暴', cd:21, desc:'8 秒内伤害 +80%、吸血 25%、移速提升',
     fn:function(g,p){ p.addBuff('power',8,1.8); p.addBuff('vamp',8,0.25); p.addBuff('haste',8,1.25);
       g.burst(p.x,p.y,34,{color:'#ff5b5b',spd:240,life:0.8}); g.shake(7); G.Audio.sfx.power(); } },
   weapons:['greatsword','shotgun'], lowHpRage:true }
];

/* ==================================================================
                              祝 福
   ================================================================== */
G.Buffs = [
 {id:'power',   name:'蛮力',     desc:'所有伤害 +18%',            icon:'#ff6a4a', fn:function(p){ p.up.dmg+=0.18; }},
 {id:'rapid',   name:'速射',     desc:'攻击速度 +15%',            icon:'#ffd45e', fn:function(p){ p.up.rate+=0.15; }},
 {id:'swift',   name:'疾风',     desc:'移动速度 +12%',            icon:'#7affd0', fn:function(p){ p.up.spd+=0.12; }},
 {id:'vigor',   name:'强健',     desc:'最大生命 +30 并回满',       icon:'#ff4d6a', fn:function(p){ p.maxHp+=30; p.hp=p.maxHp; }},
 {id:'wall',    name:'铁壁',     desc:'最大护甲 +25',             icon:'#7fd4ff', fn:function(p){ p.maxArmor+=25; p.armor=p.maxArmor; }},
 {id:'mana',    name:'源能核心', desc:'能量上限 +15，回复 +40%',   icon:'#59b8ff', fn:function(p){ p.maxEnergy+=15; p.energy=p.maxEnergy; p.up.ereg+=0.4; }},
 {id:'crit',    name:'致命',     desc:'暴击率 +9%',               icon:'#ff8ac0', fn:function(p){ p.up.crit+=0.09; }},
 {id:'execute', name:'处决',     desc:'暴击伤害 +50%',            icon:'#ff5b6e', fn:function(p){ p.up.critDmg+=0.5; }},
 {id:'vamp',    name:'嗜血',     desc:'造成伤害的 7% 转化为生命',   icon:'#d04a6a', fn:function(p){ p.up.vamp+=0.07; }},
 {id:'multi',   name:'多重射击', desc:'弹丸 +1（单发伤害 -12%）',  icon:'#ffd08a', fn:function(p){ p.up.multi+=1; p.up.dmg-=0.12; }},
 {id:'pierce',  name:'穿透',     desc:'子弹穿透 +1',              icon:'#c8f0ff', fn:function(p){ p.up.pierce+=1; }},
 {id:'bounce',  name:'跳弹',     desc:'子弹弹跳 +1',              icon:'#ff9ad8', fn:function(p){ p.up.bounce+=1; }},
 {id:'homing',  name:'制导',     desc:'子弹获得追踪能力',          icon:'#ffb0e0', fn:function(p){ p.up.homing+=1.4; }},
 {id:'boom',    name:'爆裂弹',   desc:'25% 几率命中时小爆炸',      icon:'#ff9a4a', fn:function(p){ p.up.boom+=0.25; }},
 {id:'frostE',  name:'冰霜附魔', desc:'20% 几率冻结敌人',          icon:'#9fe4ff', fn:function(p){ p.up.frost+=0.2; }},
 {id:'fireE',   name:'烈焰附魔', desc:'30% 几率点燃敌人',          icon:'#ff8a2a', fn:function(p){ p.up.fire+=0.3; }},
 {id:'shockE',  name:'雷电附魔', desc:'22% 几率触发连锁闪电',      icon:'#a8d8ff', fn:function(p){ p.up.shock+=0.22; }},
 {id:'poisonE', name:'剧毒附魔', desc:'30% 几率使敌人中毒',        icon:'#9ef04a', fn:function(p){ p.up.poison+=0.3; }},
 {id:'thorn',   name:'荆棘之甲', desc:'受伤时对周围敌人反弹伤害',   icon:'#c8c0b0', fn:function(p){ p.up.thorn+=22; }},
 {id:'greed',   name:'贪婪',     desc:'金币获取 +50%',            icon:'#ffc93c', fn:function(p){ p.up.gold+=0.5; }},
 {id:'luck',    name:'幸运',     desc:'掉落品质与数量提升',        icon:'#8effa0', fn:function(p){ p.up.luck+=1; }},
 {id:'regen',   name:'回春',     desc:'清理房间恢复 15 生命',      icon:'#7dffb0', fn:function(p){ p.up.regen+=15; }},
 {id:'shadow',  name:'影步',     desc:'翻滚冷却 -40%，距离提升',   icon:'#c07aff', fn:function(p){ p.up.dodgeCd-=0.4; p.up.dodgeDist+=0.35; }},
 {id:'recharge',name:'护甲充能', desc:'护甲恢复速度翻倍',          icon:'#8ec8ff', fn:function(p){ p.up.armorRegen+=1.0; }},
 {id:'brute',   name:'巨力',     desc:'近战伤害 +30%，击退大幅提升',icon:'#ffb43c', fn:function(p){ p.up.melee+=0.3; p.up.kb+=1.0; }},
 {id:'cooldown',name:'速冷',     desc:'武器技能冷却 -28%',         icon:'#a0f0ff', fn:function(p){ p.up.skillCd-=0.28; }},
 {id:'bulwark', name:'不屈',     desc:'受伤后获得 1.2 秒无敌',     icon:'#ffe07a', fn:function(p){ p.up.iframe+=0.6; }},
 {id:'ammoexp', name:'弹药专家', desc:'能量消耗 -30%',            icon:'#59b8ff', fn:function(p){ p.up.ammo-=0.3; }}
];

/* ==================================================================
                              玩 家
   ================================================================== */
function Player(hero, g){
  this.hero = hero;
  this.g = g;
  this.x=0; this.y=0; this.vx=0; this.vy=0; this.r=10;
  this.maxHp=hero.hp; this.hp=hero.hp;
  this.maxArmor=hero.armor; this.armor=hero.armor; this.armorT=0;
  this.maxEnergy=hero.energy; this.energy=hero.energy;
  this.baseSpd=hero.spd;
  this.aim=0; this.face=1; this.t=0;
  this.buffs={};
  this.weapons=[]; this.wi=0;
  this.coins=0; this.keys=0;
  this.dodgeT=0; this.dodgeCd=0; this.iframe=0;
  this.ultCd=0; this.hurtFlash=0; this.moving=0;
  this.swing=null; this.recoil=0; this.charge=0;
  this.dead=false; this.kills=0;
  this.dashA=0; this.dashT=0;
  this.up = { dmg:0, rate:0, spd:0, crit:0, critDmg:0, vamp:0, multi:0, pierce:0, bounce:0,
              homing:0, boom:0, frost:0, fire:0, shock:0, poison:0, thorn:0, gold:0, luck:0,
              regen:0, dodgeCd:0, dodgeDist:0, armorRegen:0, melee:0, kb:0, skillCd:0, ereg:0,
              iframe:0, ammo:0 };
  this.picked=[];
  for(var i=0;i<hero.weapons.length;i++) this.giveWeapon(Wp.get(hero.weapons[i]), true);
}
G.Player = Player;

Player.prototype.giveWeapon = function(def, silent){
  var inst = Object.create(def);
  inst.cd=0; inst.skillCd=0;
  /* charge 是蓄力武器的定义字段（蓄力时间），不能覆盖；非蓄力武器才初始化为 0 */
  if(!def.charge) inst.charge=0;
  var max = 3;
  if(this.weapons.length<max){ this.weapons.push(inst); if(!silent) this.wi=this.weapons.length-1; }
  else {
    var old = this.weapons[this.wi];
    this.weapons[this.wi]=inst;
    /* 满背包替换时，把旧武器掉落到地面，而不是静默销毁（原版元气骑士行为） */
    if(!silent && old && this.g){
      /* 用快照保留实例属性（附魔/强化/配件），避免属性丢失 */
      var oldDef = Wp.snapshot ? Wp.snapshot(old) : (Object.getPrototypeOf(old) || old);
      this.g.dropPickup(this.x+U.rand(-14,14), this.y+U.rand(-14,14), 'weapon', oldDef);
    }
  }
  if(!silent) G.Audio.sfx.pickup();
  return inst;
};
Player.prototype.wpn = function(){ return this.weapons[this.wi]; };
Player.prototype.addBuff = function(k,dur,v){
  var b=this.buffs[k];
  if(b){ b.t=Math.max(b.t,dur); b.v=v; } else this.buffs[k]={t:dur,v:v};
};
Player.prototype.hasBuff = function(k){ return !!this.buffs[k]; };
Player.prototype.buffV = function(k,d){ var b=this.buffs[k]; return b?b.v:(d===undefined?0:d); };

Object.defineProperty(Player.prototype,'dmgMult',{ get:function(){
  var m = 1 + this.up.dmg;
  if(this.buffs.power) m *= this.buffs.power.v;
  if(this.hero.lowHpRage){ var f=1-this.hp/this.maxHp; m *= 1 + Math.max(0,f-0.5)*1.4; }
  return m;
}});
Object.defineProperty(Player.prototype,'critChance',{ get:function(){ return this.hero.crit + this.up.crit; }});
Object.defineProperty(Player.prototype,'critMult',{ get:function(){ return 1.8 + this.up.critDmg + (this.hero.critDmgBonus||0); }});
Object.defineProperty(Player.prototype,'speed',{ get:function(){
  var s = this.baseSpd*(1+this.up.spd);
  if(this.buffs.haste) s*=this.buffs.haste.v;
  if(this.buffs.slowMove) s*=this.buffs.slowMove.v;
  if(this.chilled>0) s*=0.6;
  return s;
}});

Player.prototype.update = function(dt, g){
  var IN = this.netInput || G.Input;
  this.t += dt;
  var b;
  for(var k in this.buffs){ b=this.buffs[k]; b.t-=dt; if(b.t<=0) delete this.buffs[k]; }
  this.chilled = Math.max(0,(this.chilled||0)-dt);
  this.iframe -= dt; this.dodgeCd -= dt; this.ultCd -= dt;
  this.hurtFlash = Math.max(0, this.hurtFlash-dt*4);
  this.recoil = Math.max(0, this.recoil-dt*6);
  for(var i=0;i<this.weapons.length;i++){
    var wq=this.weapons[i];
    wq.cd -= dt; wq.skillCd -= dt;
    if(wq.reload>0) wq.reload -= dt;
    if(wq.heat>0 && wq.type!=='laser'){
      wq.heatIdle=(wq.heatIdle||0)+dt;
      if(wq.heatIdle>0.32) wq.heat=Math.max(0, wq.heat - dt*(wq.trait==='spinup'?1.6:2.4));
    }
  }
  var ereg = (2 + this.maxEnergy*0.045) * (1+this.up.ereg) * (this.hero.ereg/2.4);
  this.energy = Math.min(this.maxEnergy, this.energy + ereg*dt);
  this.armorT -= dt;
  if(this.armorT<=0 && this.armor<this.maxArmor){
    this.armor = Math.min(this.maxArmor, this.armor + (8+(this.up.armorRegen)*8)*(this.hero.armorRegenMult||1)*dt);
  }

  /* --- 瞄准 --- */
  if(this.netInput){
    if(this.netInput.aim!==undefined) this.aim=this.netInput.aim;
    this.autoFire=false;
  } else if(IN.stickR.on && (Math.abs(IN.stickR.dx)+Math.abs(IN.stickR.dy))>0.25){
    this.aim = Math.atan2(IN.stickR.dy, IN.stickR.dx);
    this.autoFire = true;
  } else if(IN.hasTouch){
    this.autoFire = false;
    var ne = g.nearestEnemy(this.x,this.y,320);
    if(ne) this.aim = U.ang(this.x,this.y,ne.x,ne.y);
  } else {
    var w = g.screenToWorld(IN.mx, IN.my);
    this.aim = U.ang(this.x,this.y,w.x,w.y);
    this.autoFire = false;
  }
  this.face = Math.cos(this.aim)>=0?1:-1;

  /* --- 移动 --- */
  var mv = IN.moveVec();
  this.moving = Math.min(1, Math.sqrt(mv.x*mv.x+mv.y*mv.y));
  this.stillT = this.moving<0.12 ? (this.stillT||0)+dt : 0;
  if(this.dashT>0){
    this.dashT-=dt;
    this.vx = Math.cos(this.dashA)*this.dashSpd;
    this.vy = Math.sin(this.dashA)*this.dashSpd;
    this.iframe = Math.max(this.iframe, 0.05);
    if(g.frame%2===0) g.burst(this.x,this.y,1,{color:this.dashColor||'#c8f0ff',spd:30,life:0.35,r:5});
    if(this.dashHit){
      var list=g.enemiesInRadius(this.x,this.y,30);
      for(var di=0;di<list.length;di++){
        if(this.dashHitSet.indexOf(list[di])<0){
          this.dashHitSet.push(list[di]);
          g.damageEnemy(list[di], this.dashDmg*this.dmgMult, {crit:Math.random()<this.critChance, kb:120, ang:this.dashA, from:this});
        }
      }
    }
  } else if(this.dodgeT>0){
    this.dodgeT-=dt;
    this.iframe=Math.max(this.iframe,0.02);
    if(g.frame%2===0) g.burst(this.x,this.y,1,{color:'#ffffff',spd:20,life:0.28,r:4,alpha:0.5});
  } else {
    var sp=this.speed;
    this.vx = U.damp(this.vx, mv.x*sp, 14, dt);
    this.vy = U.damp(this.vy, mv.y*sp, 14, dt);
  }

  /* 翻滚 */
  if((IN.hit('shift','l','shiftleft','shiftright')) && this.dodgeCd<=0 && this.dashT<=0){
    var a = (this.moving>0.1)? Math.atan2(mv.y,mv.x) : this.aim;
    this.dodgeT=0.26; this.dodgeCd = 1.1*(1+this.up.dodgeCd)*(this.hero.dodgeCdMult||1);
    this.charge=0; /* 翻滚中断蓄力 */
    var dspd = 460*(1+this.up.dodgeDist);
    this.vx=Math.cos(a)*dspd; this.vy=Math.sin(a)*dspd;
    G.Audio.sfx.dash(); g.burst(this.x,this.y,10,{color:'#ffffff',spd:120,life:0.35,alpha:0.6});
  }

  moveEntity(g, this, dt, false);

  /* 切枪（中断蓄力） */
  if(IN.hit('q') || IN.wheel!==0){
    if(this.weapons.length>1){
      this.wi = (this.wi + (IN.wheel<0?this.weapons.length-1:1)) % this.weapons.length;
      this.charge=0;
      G.Audio.sfx.click();
    }
  }
  for(var n=1;n<=3;n++) if(IN.hit(''+n) && this.weapons[n-1]){ this.wi=n-1; this.charge=0; G.Audio.sfx.click(); }

  /* 攻击 */
  var wp = this.wpn();
  var firing = IN.down || IN.key('j') || this.autoFire;
  if(wp){
    if(wp.charge){
      if(firing){
        var prevC=this.charge;
        this.charge=Math.min(1,this.charge+dt/wp.charge);
        /* 满蓄力（第 3 段）提示 */
        if(prevC<0.66 && this.charge>=0.66){
          G.Audio.sfx.power();
          g.burst(this.x,this.y,8,{color:wp.color,spd:120,life:0.4});
        }
      }
      else if(this.charge>0.08){ this.fire(g, wp, this.charge); this.charge=0; }
      else this.charge=0;
    } else {
      if(firing && (wp.auto || IN.downHit || IN.hit('j') || this.autoFire)) this.fire(g, wp, 1);
    }
  }
  /* 武器技能 */
  if((IN.rdownHit || IN.hit('k')) && wp && wp.skill){
    var cost = wp.skill.cost*(this.hero.skillCostMult||1);
    if(wp.skillCd<=0 && this.energy>=cost){
      this.energy-=cost;
      wp.skillCd = wp.skill.cd*(1+this.up.skillCd);
      wp.skill.fn(g, this, wp);
      this.recoil=1.4;
      g.burst(this.x+Math.cos(this.aim)*14,this.y+Math.sin(this.aim)*14,10,{color:wp.color,spd:140,life:0.4});
    } else if(wp.skillCd>0){ g.float('技能冷却中',this.x,this.y-26,'#8fa3cc'); }
    else { g.float('能量不足',this.x,this.y-26,'#59b8ff'); }
  }
  /* 大招 */
  if(IN.hit(' ','space') && this.ultCd<=0){
    this.ultCd = this.hero.ult.cd;
    this.hero.ult.fn(g, this);
    g.float(this.hero.ult.name+'!', this.x, this.y-32, '#ffd45e');
  }

  /* --- 持续型 buff --- */
  if(this.buffs.spin){
    this.spinT=(this.spinT||0)-dt;
    if(this.spinT<=0){
      this.spinT=this.buffs.spin.v.rate||0.05;
      this.spinA=(this.spinA||0)+0.42;
      g.spawnBullet({x:this.x,y:this.y,ang:this.spinA,spd:460,dmg:this.buffs.spin.v.dmg,r:4,
        color:this.buffs.spin.v.color,shape:'bolt',team:'player',life:1.1});
    }
  }
  if(this.buffs.firestorm){
    this.fsA=(this.fsA||0)+dt*3.4;
    for(var f=0;f<3;f++){
      var fa=this.fsA+f/3*TAU, fr=42;
      var fx=this.x+Math.cos(fa)*fr, fy=this.y+Math.sin(fa)*fr;
      g.spawnParticle(fx,fy,{color:'#ff8a2a',spd:10,life:0.3,r:5,glow:1});
      var hit=g.enemiesInRadius(fx,fy,20);
      for(var hi=0;hi<hit.length;hi++){
        if(!hit[hi].fsCd || hit[hi].fsCd<=0){
          g.damageEnemy(hit[hi], this.buffs.firestorm.v.dmg*this.dmgMult, {from:this, burn:2});
          hit[hi].fsCd=0.28;
        }
      }
    }
  }
  if(this.buffs.blizzard){
    this.bzT=(this.bzT||0)-dt;
    if(this.bzT<=0){ this.bzT=0.42;
      for(var bi=0;bi<7;bi++) g.spawnBullet({x:this.x,y:this.y,ang:U.rand(0,TAU),spd:U.rand(160,300),dmg:this.buffs.blizzard.v.dmg,
        r:5,color:'#9fe4ff',shape:'ice',team:'player',life:1.4,freeze:2,pierce:1});
    }
  }
  if(this.buffs.bladestorm){
    this.bsA=(this.bsA||0)+dt*11;
    this.swing = {a0:this.bsA, arc:1.4, range:52, dur:1, t:0.5, dmg:this.buffs.bladestorm.v.dmg,
      color:this.buffs.bladestorm.v.color, hits:[], storm:true};
    var hits=g.enemiesInRadius(this.x,this.y,54);
    for(var si=0;si<hits.length;si++){
      var eo=hits[si];
      if(!eo.bsCd || eo.bsCd<=0){
        g.damageEnemy(eo, this.buffs.bladestorm.v.dmg*this.dmgMult, {from:this,kb:100,ang:U.ang(this.x,this.y,eo.x,eo.y),
          crit:Math.random()<this.critChance});
        eo.bsCd=0.22;
      }
    }
  }
  if(this.buffs.beam){
    var bv=this.buffs.beam.v;
    this.beamT=(this.beamT||0)-dt;
    if(this.beamT<=0){ this.beamT=0.06;
      g.beam(this.x,this.y,this.aim,bv.range,bv.dmg,{color:bv.color,width:bv.width,team:'player',dur:0.09,pierceAll:true});
    }
  }
  if(this.buffs.deflectAll){
    for(var bl=0;bl<g.bullets.length;bl++){
      var bb=g.bullets[bl];
      if(bb.team==='enemy' && U.dist(bb.x,bb.y,this.x,this.y)<46){
        bb.team='player'; bb.dmg*=2.2; bb.color='#ffe07a'; bb.homing=2.4;
        var na=U.ang(this.x,this.y,bb.x,bb.y);
        var sp2=Math.sqrt(bb.vx*bb.vx+bb.vy*bb.vy)*1.5;
        bb.vx=Math.cos(na)*sp2; bb.vy=Math.sin(na)*sp2;
        g.burst(bb.x,bb.y,4,{color:'#ffe07a',spd:80,life:0.3});
      }
    }
  }

  /* 激光武器持续光束 */
  if(this.laserT>0){
    this.laserT-=dt;
    var lw=this.wpn();
    if(lw && lw.type==='laser'){
      var beamCost=(lw.beamEnergy||1)*dt;
      if(this.energy<beamCost){ this.laserT=0; }
      else {
        this.energy-=beamCost;
        if(lw.heat>=1){
          lw.overheatT=(lw.overheatT||0)+dt;
          if(lw.overheatT>=(lw.overheatCd||1.5)){ lw.heat=0; lw.overheatT=0; }
        }
        var ldps=(lw.beamDps||30);
        if(this.buffs.beamPower) ldps*=this.buffs.beamPower.v;
        g.laserBeam(this.x,this.y,this.laserAng,lw.beamWidth||6,ldps,{color:lw.color,team:'player'},dt);
      }
    }
  } else {
    var lw2=this.wpn();
    if(lw2 && lw2.type==='laser'){
      var coolRate = lw2.overheatCd ? (1/lw2.overheatCd) : 0.4;
      lw2.heat=Math.max(0,(lw2.heat||0)-dt*coolRate);
    }
  }
  /* 挥砍更新 */
  if(this.swing && !this.swing.storm){
    this.swing.t += dt/this.swing.dur;
    if(this.swing.t>=1) this.swing=null;
    else this.swingHit(g);
  }
  if(this.hp<=0 && !this.dead){ this.dead=true; }
};

Player.prototype.fire = function(g, wp, chargeAmt){
  if(wp.cd>0) return;
  if(wp.type==='laser'){
    /* 激光武器：不发射子弹，标记持续光束；能量按秒消耗（beamEnergy），过热时无法发射 */
    if(wp.heat>=1) return;
    this.laserT=0.1;
    this.laserAng=this.aim;
    wp.cd=0.05;
    if(wp.overheatRate) wp.heat=Math.min(1,(wp.heat||0)+wp.overheatRate*0.05);
    return;
  }
  var tr = wp.trait;
  if(tr==='magazine'){
    if(wp.reload>0) return;
    if(wp.mag===undefined) wp.mag=wp.magSize||5;
  }
  var ps=Wp.partStats(wp);
  var cost = wp.energy*(1+this.up.ammo)*(1-ps.cost);
  if(this.buffs.freeAmmo) cost=0;
  if(cost>0 && this.energy<cost){ 
    if(!this.noEnergyFx || this.t-this.noEnergyFx>0.6){ this.noEnergyFx=this.t; g.float('能量不足',this.x,this.y-26,'#59b8ff'); }
    wp.cd=0.25; return;
  }
  this.energy-=cost;
  var rate = wp.rate/(1+this.up.rate)/(1+ps.rate);
  if(this.buffs.rapid) rate/=this.buffs.rapid.v;
  if(tr==='heat'||tr==='combo'){ rate/=(1+0.55*(wp.heat||0)); }
  else if(tr==='spinup'){ rate/=(1+0.85*(wp.heat||0)); }
  if(tr==='heat'||tr==='combo'||tr==='spinup'){
    wp.heatIdle=0; wp.heat=Math.min(1,(wp.heat||0)+(tr==='spinup'?0.09:0.13));
  }
  wp.cd = rate;
  this.recoil = 1;
  var ang = this.aim;

  var dmgMul=1, superShot=false;
  if(tr==='everyN'){ wp.shots=(wp.shots||0)+1; if(wp.shots%3===0) superShot=true; }
  if(tr==='overload' && this.energy/this.maxEnergy>0.7) dmgMul*=1.55;
  if(tr==='magazine'){
    dmgMul*=1.25; wp.mag--;
    if(wp.mag<=0){ wp.mag=wp.magSize||5; wp.reload=wp.reloadTime||0.95;
      g.float('装填中…',this.x,this.y-30,'#8fa3cc'); G.Audio.sfx.click(); }
  }

  if(wp.type==='melee' && wp.melee){
    this.swing = {a0:ang, arc:wp.melee.arc, range:wp.melee.range*(1+this.up.kb*0.1), dur:wp.melee.dur,
      t:0, dmg:wp.dmg*(1+this.up.melee)*dmgMul*(superShot?2.4:1), hits:[], def:wp, color:wp.color,
      exec:(tr==='execute')};
    G.Audio.sfx.sword();
    g.burst(this.x+Math.cos(ang)*18, this.y+Math.sin(ang)*18, 4, {color:wp.color,spd:90,life:0.25});
    return;
  }
  this.emitShot(g, wp, ang, {dmgMul:dmgMul, superShot:superShot, charge:chargeAmt});
  if(tr==='burst'){
    var self=this;
    for(var k=1;k<3;k++) (function(k){ g.delayed(k*0.07, function(){
      if(!self.dead) self.emitShot(g, wp, self.aim, {dmgMul:dmgMul*0.85, charge:chargeAmt});
    }); })(k);
  }
};
Player.prototype.emitShot = function(g, wp, ang, o){
  o=o||{};
  if(wp.onFire && wp.onFire(g,this,wp,ang)) { this.fireFx(g,wp,ang); return; }
  var tr=wp.trait;
  var cnt = wp.count + this.up.multi;
  var spread = wp.spread * (cnt>1?1:0.6);
  var chargeAmt=o.charge;
  var dmg = wp.dmg * (chargeAmt!==undefined && wp.charge ? (0.55+chargeAmt*1.1) : 1) * (o.dmgMul||1);
  var spd = wp.spd * (wp.charge? (0.7+ (chargeAmt||0)*0.6) : 1);
  var rr = wp.r, pierce = wp.pierce||0, crit;
  var ps2=Wp.partStats(wp);
  pierce += ps2.pierce;
  if(o.superShot){ dmg*=2.4; rr*=1.7; pierce+=2; crit=1; }
  /* 满蓄力（第 3 段）加成 */
  var fullCharge = !!(wp.charge && chargeAmt!==undefined && chargeAmt>=0.66);
  if(fullCharge){
    dmg *= (wp.chargeFullDmg||2.2);
    if(wp.chargeFullPierce) pierce += wp.chargeFullPierce;
    if(wp.chargeFullCrit) crit = 1;
  }
  var lockOn = (tr==='lock' && (this.stillT||0)>0.4);
  for(var i=0;i<cnt;i++){
    var a = ang + (cnt===1? U.rand(-spread*0.5,spread*0.5) : (i/(cnt-1)-0.5)*spread + U.rand(-0.03,0.03));
    var b = g.spawnBullet({ x:this.x+Math.cos(ang)*12, y:this.y+Math.sin(ang)*12, ang:a, spd:spd*U.rand(0.95,1.05),
      dmg:dmg, r:rr, color:wp.color, shape:wp.shape, team:'player', crit:crit,
      pierce:pierce, bounce:wp.bounce||0, homing:(wp.homing||0)+(lockOn?3:0), life:wp.life,
      aoe:(wp.aoe||0)+(ps2.boom&&Math.random()<ps2.boom?32:0), kb:wp.kb, freeze:wp.freeze||0, burn:wp.burn||0, poison:wp.poison||0, shock:wp.shock||0,
      drag:wp.drag||0, sizeGrow:wp.sizeGrow||0 });
    if(b){ b.trait=tr; b.ox=b.x; b.oy=b.y; if(tr==='growing') b.dmg0=b.dmg; }
  }
  if(o.superShot) g.burst(this.x+Math.cos(ang)*16,this.y+Math.sin(ang)*16,9,{color:'#ffffff',spd:160,life:0.32});
  if(lockOn) g.spawnParticle(this.x,this.y-18,{color:'#ffb0e0',life:0.3,r:4,spd:0,glow:1});
  if(fullCharge && wp.chargeFullFn) wp.chargeFullFn(g, this, wp, ang, o);
  this.fireFx(g,wp,ang);
};
Player.prototype.fireFx = function(g,wp,ang){
  var mx=this.x+Math.cos(ang)*16, my=this.y+Math.sin(ang)*16;
  g.spawnParticle(mx,my,{color:wp.color,life:0.12,r:7,glow:1,spd:0,flash:true});
  for(var i=0;i<2;i++) g.spawnParticle(mx,my,{color:wp.color,life:0.22,r:2.5,spd:U.rand(40,120),ang:ang+U.rand(-0.5,0.5)});
  this.vx-=Math.cos(ang)*wp.recoil*12; this.vy-=Math.sin(ang)*wp.recoil*12;
  if(wp.sfx==='laser') G.Audio.sfx.laser();
  else if(wp.sfx==='plasma') G.Audio.sfx.plasma();
  else if(wp.sfx==='heavy') G.Audio.sfx.heavy();
  else G.Audio.sfx.shoot(wp.rarity*0.1);
};
Player.prototype.swingHit = function(g){
  var s=this.swing, g2=g;
  var list=g.enemiesInRadius(this.x,this.y,s.range+16);
  for(var i=0;i<list.length;i++){
    var e=list[i];
    if(s.hits.indexOf(e)>=0) continue;
    var a=U.ang(this.x,this.y,e.x,e.y);
    if(Math.abs(U.angDiff(s.a0,a)) < s.arc*0.5+0.2 && U.dist(this.x,this.y,e.x,e.y)<s.range+e.r){
      s.hits.push(e);
      var crit=Math.random()<this.critChance;
      var sd=s.dmg*this.dmgMult;
      if(s.exec && e.maxHp>0 && e.hp/e.maxHp<0.35){ sd*=2; g.float('处决!',e.x,e.y-e.r-18,'#ff8a3c',14); }
      g.damageEnemy(e, sd, {crit:crit, kb:(s.def?s.def.kb:120)*(1+this.up.kb), ang:a, from:this,
        burn:(s.def&&s.def.burnHit)?s.def.burnHit:0});
      if(s.def && s.def.lifesteal) this.heal(s.dmg*s.def.lifesteal);
      this.energy=Math.min(this.maxEnergy,this.energy+1.2);
    }
  }
  /* 弹反 */
  if(s.def && s.def.deflect){
    for(var b=0;b<g.bullets.length;b++){
      var bu=g.bullets[b];
      if(bu.team!=='enemy') continue;
      if(U.dist(bu.x,bu.y,this.x,this.y)<s.range+12){
        var da=U.angDiff(s.a0, U.ang(this.x,this.y,bu.x,bu.y));
        if(Math.abs(da)<s.arc*0.6){
          bu.team='player'; bu.dmg*=2.0; bu.color='#ffe07a';
          var sp=Math.sqrt(bu.vx*bu.vx+bu.vy*bu.vy)*1.4;
          bu.vx=Math.cos(s.a0)*sp; bu.vy=Math.sin(s.a0)*sp;
          g.burst(bu.x,bu.y,5,{color:'#ffe07a',spd:90,life:0.3});
        }
      }
    }
  }
  /* 破坏道具 */
  for(var p2=0;p2<g.props.length;p2++){
    var pr=g.props[p2];
    if(pr.breakable && !pr.dead && U.dist(pr.x,pr.y,this.x,this.y)<s.range+10) g.hitProp(pr, s.dmg);
  }
};
Player.prototype.heal = function(v){
  if(v<=0) return;
  this.hp=Math.min(this.maxHp,this.hp+v);
};
Player.prototype.hurt = function(dmg, g, src){
  if(this.iframe>0 || this.dead) return;
  if(this.buffs.invuln) return;
  dmg = dmg*(1-(this.hero.dr||0));
  if(this.buffs.shield){
    var sh=this.buffs.shield;
    var use=Math.min(sh.v,dmg); sh.v-=use; dmg-=use;
    if(sh.v<=0) delete this.buffs.shield;
    g.burst(this.x,this.y,8,{color:'#5ee0ff',spd:130,life:0.4});
  }
  if(dmg>0 && this.armor>0){
    var a=Math.min(this.armor,dmg); this.armor-=a; dmg-=a;
    g.burst(this.x,this.y,6,{color:'#7fd4ff',spd:120,life:0.35});
  }
  this.hp-=dmg;
  this.armorT=3.0;
  this.iframe=0.55+this.up.iframe;
  this.hurtFlash=1;
  g.shake(7); g.hitStop(0.07);
  G.Audio.sfx.hurt();
  g.float('-'+Math.round(dmg+0.4), this.x, this.y-20, '#ff5b6e');
  g.burst(this.x,this.y,10,{color:'#ff5b6e',spd:160,life:0.5});
  g.damageVignette=1;
  if(this.up.thorn>0){
    var list=g.enemiesInRadius(this.x,this.y,90);
    for(var i=0;i<list.length;i++) g.damageEnemy(list[i], this.up.thorn, {from:this});
  }
  if(this.hp<=0){ this.hp=0; this.dead=true; }
};
Player.prototype.leapSlam = function(ang, dmg){
  var g=this.g;
  this.dashA=ang; this.dashT=0.28; this.dashSpd=520; this.dashHit=false; this.dashColor='#ffd08a';
  var self=this;
  g.delayed(0.3, function(){
    g.explode(self.x, self.y, 92, dmg*self.dmgMult, '#ffd08a', 'player');
    g.shake(14); G.Audio.sfx.heavy();
    var l=g.enemiesInRadius(self.x,self.y,110);
    for(var i=0;i<l.length;i++) l[i].stun=Math.max(l[i].stun||0,0.7);
  });
};
Player.prototype.dashAttack = function(ang, dist, dmg, color){
  this.dashA=ang; this.dashSpd=760; this.dashT=dist/760; this.dashHit=true;
  this.dashDmg=dmg; this.dashHitSet=[]; this.dashColor=color||'#c8f0ff';
  this.iframe=Math.max(this.iframe,this.dashT+0.1);
  G.Audio.sfx.dash();
};
Player.prototype.shadowStrike = function(n){
  var g=this.g, self=this;
  for(var i=0;i<n;i++){
    (function(i){
      g.delayed(i*0.12, function(){
        var list=g.enemies.filter(function(e){ return !e.dead && e.team!=='ally'; });
        if(!list.length){
          g.spawnBullet({x:self.x,y:self.y,ang:self.aim+U.rand(-0.4,0.4),spd:520,dmg:24*self.dmgMult,r:7,
            color:'#c07aff',shape:'slash',team:'player',pierce:99,life:0.5});
          return;
        }
        var e=U.pick(list);
        var a=U.rand(0,TAU);
        self.x=e.x+Math.cos(a)*26; self.y=e.y+Math.sin(a)*26;
        self.iframe=Math.max(self.iframe,0.25);
        g.burst(self.x,self.y,14,{color:'#c07aff',spd:170,life:0.45});
        g.damageEnemy(e, 32*self.dmgMult, {crit:true, kb:120, ang:U.ang(self.x,self.y,e.x,e.y), from:self});
        g.spawnBullet({x:self.x,y:self.y,ang:U.ang(self.x,self.y,e.x,e.y),spd:400,dmg:14*self.dmgMult,r:8,
          color:'#c07aff',shape:'slash',team:'player',pierce:99,life:0.3});
        G.Audio.sfx.sword(); g.shake(4);
      });
    })(i);
  }
};
Player.prototype.draw = function(ctx, t, g){
  var H=this.hero;
  if(this.dodgeT>0){
    ctx.save(); ctx.translate(this.x,this.y);
    ctx.rotate(Math.atan2(this.vy,this.vx)+ (1-this.dodgeT/0.26)*TAU);
    Art.hero(ctx,0,0,this.r,H,{t:t,face:this.face,moving:1,flash:this.hurtFlash});
    ctx.restore();
  } else {
    Art.hero(ctx,this.x,this.y,this.r,H,{t:t,face:this.face,moving:this.moving,flash:this.hurtFlash});
  }
  var wp=this.wpn();
  if(wp && wp.art && !this.swing){
    var hx=this.x+Math.cos(this.aim)*8, hy=this.y+Math.sin(this.aim)*5+2;
    Art.weapon(ctx,hx,hy,this.aim,wp.art,{t:t,recoil:this.recoil,charge:this.charge,scale:1});
  }
  if(this.swing){
    var s=this.swing, pr=s.storm?((this.bsA||0)):U.ease.outCubic(s.t);
    var a = s.storm? s.a0 : s.a0 - s.arc*0.5 + s.arc*pr;
    if(wp && wp.art) Art.weapon(ctx,this.x+Math.cos(a)*12,this.y+Math.sin(a)*8,a,wp.art,{t:t,scale:1.05});
    ctx.save();
    ctx.strokeStyle=U.alpha(s.color||'#ffffff', s.storm?0.5:0.75*(1-s.t));
    ctx.lineWidth=s.storm?6:9*(1-s.t*0.5);
    ctx.beginPath();
    var a0 = s.storm? a-1.2 : s.a0-s.arc*0.5;
    ctx.arc(this.x,this.y,s.range*0.86, a0, s.storm?a+0.2:a);
    ctx.stroke();
    ctx.restore();
  }
  if(this.buffs.invuln || this.buffs.deflectAll){
    ctx.save();
    ctx.strokeStyle=U.alpha('#ffe07a',0.6+Math.sin(t*10)*0.2); ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r*2.2,0,TAU); ctx.stroke();
    Art.glowDot(ctx,this.x,this.y,this.r*3,'#ffe07a',0.2);
    ctx.restore();
  }
  if(this.buffs.shield){
    ctx.save();
    ctx.strokeStyle=U.alpha('#5ee0ff',0.55); ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r*2.4,0,TAU); ctx.stroke(); ctx.restore();
  }
};

/* ==================================================================
                              怪 物
   ================================================================== */
function Enemy(defId, x, y, g, opts){
  opts=opts||{};
  var base = En.defs[defId];
  var d = opts.elite? En.makeElite(base) : base;
  this.def=d; this.id=defId;
  this.x=x; this.y=y; this.vx=0; this.vy=0;
  this.r=d.r; this.spd=d.spd;
  var scale = opts.hpScale||1;
  this.maxHp=Math.round(d.hp*scale); this.hp=this.maxHp;
  this.dmgScale = opts.dmgScale||1;
  this.t=0; this.seed=Math.random()*10; this.face=1;
  this.atkCd=U.rand(0.4,1.4); this.dir=U.chance(0.5)?1:-1;
  this.flash=0; this.alpha=1; this.dead=false;
  this.team = opts.team||'enemy';
  this.life = opts.life||0;
  this.boss = !!d.boss;
  this.elite = !!opts.elite;
  this.spawnT = opts.spawnFx?0.35:0;
  this.stun=0; this.frozen=0; this.burnT=0; this.poisonT=0; this.vuln=0;
  this.aimA=0;
}
G.Enemy = Enemy;

Enemy.prototype.shoot = function(ang, o){
  o=o||{};
  var g=G.game;
  g.spawnBullet({ x:this.x+Math.cos(ang)*(this.r*0.7), y:this.y+Math.sin(ang)*(this.r*0.7),
    ang:ang, spd:o.spd||260, dmg:(o.dmg||8)*this.dmgScale, r:o.r||4.5,
    color:o.color||'#ff8a5a', shape:o.shape||'ball', team:this.team==='ally'?'ally':'enemy',
    life:o.life||2.4, homing:o.homing||0, freeze:o.freeze||0, burn:o.burn||0,
    poison:o.poison||0, shock:o.shock||0, pierce:o.pierce||0, drag:o.drag||0,
    sizeGrow:o.sizeGrow||0, spin:o.spin||0, aoe:o.aoe||0 });
  G.Audio.sfx.shoot(0.4);
};
Enemy.prototype.update = function(dt, g){
  this.t+=dt;
  this.flash=Math.max(0,this.flash-dt*6);
  this.atkCd-=dt;
  this.stun-=dt; this.frozen-=dt; this.vuln-=dt;
  if(this.iframe>0) this.iframe-=dt;
  if(this.fsCd) this.fsCd-=dt;
  if(this.bsCd) this.bsCd-=dt;
  if(this.spawnT>0){ this.spawnT-=dt; return; }
  if(this.telegraph){ this.telegraph.t-=dt; if(this.telegraph.t<=0) this.telegraph=null; }
  if(this.life>0){ this.life-=dt; if(this.life<=0){ this.hp=-1; this.expire=true; } }

  if(this.burnT>0){ this.burnT-=dt;
    this.burnAcc=(this.burnAcc||0)+dt;
    if(this.burnAcc>=0.42){ this.burnAcc=0; g.damageEnemy(this,this.burnDmg||4,{silent:true,color:'#ff8a2a'});
      g.spawnParticle(this.x+U.rand(-6,6),this.y+U.rand(-6,6),{color:'#ff8a2a',life:0.4,r:4,spd:30,ang:-1.57,glow:1}); } }
  if(this.poisonT>0){ this.poisonT-=dt;
    this.poiAcc=(this.poiAcc||0)+dt;
    if(this.poiAcc>=0.55){ this.poiAcc=0; g.damageEnemy(this,this.poiDmg||3,{silent:true,color:'#9ef04a'});
      g.spawnParticle(this.x+U.rand(-6,6),this.y+U.rand(-6,6),{color:'#9ef04a',life:0.5,r:3,spd:20,ang:-1.57}); } }

  var target = this.team==='ally'? g.nearestEnemyTo(this.x,this.y,600) : g.player;
  if(!target || target.dead){
    if(this.team==='ally'){ E_halt(this,dt); moveEntity(g,this,dt,this.def.phasing||this.fly); this.hp=this.hp; return; }
  }
  if(this.stun>0 || (this.frozen>0 && Math.random()<0.7)){
    this.vx*=Math.pow(0.02,dt); this.vy*=Math.pow(0.02,dt);
  } else if(target){
    var ai = En.AI[this.def.ai] || En.AI.chase;
    if(this.team==='ally' && (this.def.ai==='summoner'||this.def.ai==='healer'||this.def.ai==='boss'||this.def.ai==='bomber')) ai = En.AI.chase;
    ai(this, g, dt, target);
  }
  moveEntity(g, this, dt, this.def.phasing||this.fly);
  if(this.homeRoom && this.team!=='ally'){
    var R=this.homeRoom;
    var nx2=U.clamp(this.x, R.wx+this.r, R.wx+R.ww-this.r);
    var ny2=U.clamp(this.y, R.wy+this.r, R.wy+R.wh-this.r);
    if(nx2!==this.x){ this.x=nx2; this.vx*=-0.3; }
    if(ny2!==this.y){ this.y=ny2; this.vy*=-0.3; }
  }

  /* 分离 */
  if(!this.boss){
    for(var i=0;i<g.enemies.length;i++){
      var o=g.enemies[i];
      if(o===this||o.dead) continue;
      var dx=o.x-this.x, dy=o.y-this.y, d2=dx*dx+dy*dy, mind=(this.r+o.r)*0.9;
      if(d2<mind*mind && d2>0.01){
        var d=Math.sqrt(d2), push=(mind-d)/mind*60*dt*60;
        this.vx-=dx/d*push; this.vy-=dy/d*push;
      }
    }
  }
  /* 接触伤害 */
  if(target && this.def.dmg>0 && this.team!=='ally'){
    var dd=U.dist(this.x,this.y,target.x,target.y);
    if(dd < this.r+target.r+2){
      target.hurt(this.def.dmg*this.dmgScale*(this.charging?1.4:1), g, this);
      var pa=U.ang(this.x,this.y,target.x,target.y);
      target.vx+=Math.cos(pa)*160; target.vy+=Math.sin(pa)*160;
      this.vx-=Math.cos(pa)*90; this.vy-=Math.sin(pa)*90;
    }
  }
  if(this.team==='ally' && target){
    var dd2=U.dist(this.x,this.y,target.x,target.y);
    if(dd2<this.r+target.r+4 && this.atkCd<=0){
      g.damageEnemy(target, this.def.dmg*1.4, {from:this, kb:80, ang:U.ang(this.x,this.y,target.x,target.y)});
      this.atkCd=0.7;
    }
  }
  if(this.def.trailFire && Math.random()<dt*4) g.zone(this.x,this.y,22,2.4,'fire',5,'#ff7a3c','enemy');
  if(this.hp<=0) this.die(g);
};
Enemy.prototype.die = function(g){
  if(this.dead) return;
  this.dead=true;
  var d=this.def;
  g.burst(this.x,this.y, this.boss?70:(12+this.r), {color:d.look.c1,spd:this.boss?340:190,life:0.7,r:this.boss?6:4});
  g.burst(this.x,this.y, 6, {color:d.look.c3||'#ffffff',spd:120,life:0.5});
  if(this.boss){ g.shake(24); G.Audio.sfx.explode(); }
  else G.Audio.sfx.die();
  if(this.expire){ return; }
  if(d.bombR){
    g.explode(this.x,this.y,d.bombR,(d.bombDmg||20)*this.dmgScale,d.bombColor||'#ff8a2a','enemy');
    if(d.bombPoison) g.zone(this.x,this.y,70,5,'poison',6,'#9ef04a','enemy');
  }
  if(this.team==='ally') return;
  if(d.onDeath) d.onDeath(g,this);
  g.onEnemyKilled(this);
};
Enemy.prototype.draw = function(ctx,t,g){
  var d=this.def;
  if(this.spawnT>0){
    var k=1-this.spawnT/0.35;
    ctx.save(); ctx.globalAlpha=k;
    Art.glowDot(ctx,this.x,this.y,this.r*2.4*(1.5-k),d.look.c3||d.look.c1,0.6);
    ctx.restore();
    if(k<0.5) return;
  }
  var mv=Math.min(1,Math.sqrt(this.vx*this.vx+this.vy*this.vy)/Math.max(30,this.spd));
  var flash=this.flash;
  if(this.flashTell && this.state==='wind') flash=Math.max(flash, 0.35+Math.sin(t*30)*0.3);
  var look=d.look;
  if(this.frozen>0){ look = Object.create(d.look); look.c1=U.mix(d.look.c1,'#9fe4ff',0.6); look.c2=U.mix(d.look.c2||'#333','#5a9ac0',0.6); }
  Art.creature(ctx,this.x,this.y,this.r,look,{t:t,face:this.face,moving:mv,flash:flash,alpha:this.alpha,
    seed:this.seed});
  if(this.telegraph){
    ctx.save();
    ctx.strokeStyle=U.alpha('#ff5b6e',0.5+Math.sin(t*25)*0.25); ctx.lineWidth=2;
    ctx.setLineDash([6,6]);
    var n = this.telegraph.cross?4:1;
    for(var i=0;i<n;i++){
      var a=this.telegraph.a + i/n*TAU;
      ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.x+Math.cos(a)*600,this.y+Math.sin(a)*600); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
  }
  if(this.laserSight){
    ctx.save(); ctx.strokeStyle=U.alpha('#ff5b6e',0.45); ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.x+Math.cos(this.aimA)*500,this.y+Math.sin(this.aimA)*500); ctx.stroke(); ctx.restore();
  }
  if(this.blockFront && this.shieldA!==undefined){
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.shieldA);
    ctx.fillStyle=U.alpha(d.look.c3||'#8ef0ff',0.35);
    ctx.beginPath(); ctx.arc(0,0,this.r*1.5,-0.8,0.8); ctx.arc(0,0,this.r*1.15,0.8,-0.8,true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=U.alpha(d.look.c3||'#8ef0ff',0.8); ctx.lineWidth=1.6; ctx.stroke();
    ctx.restore();
  }
  if(this.frozen>0){
    ctx.save(); ctx.globalAlpha=0.35; ctx.fillStyle='#9fe4ff';
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r*1.15,0,TAU); ctx.fill(); ctx.restore();
  }
  if(this.team==='ally'){
    ctx.save(); ctx.strokeStyle=U.alpha('#7dffb0',0.7); ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.ellipse(this.x,this.y+this.r*0.9,this.r*0.8,this.r*0.3,0,0,TAU); ctx.stroke(); ctx.restore();
  }
  /* 血条 */
  if(!this.boss && this.hp<this.maxHp && this.team!=='ally'){
    var w=this.r*2.1, hx=this.x-w/2, hy=this.y-this.r-9;
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(hx-1,hy-1,w+2,4.5);
    ctx.fillStyle=this.elite?'#ffb143':'#ff4d6a'; ctx.fillRect(hx,hy,w*(this.hp/this.maxHp),2.5);
  }
};
function E_halt(e,dt){ e.vx=U.damp(e.vx,0,6,dt); e.vy=U.damp(e.vy,0,6,dt); }

/* ==================================================================
                       物理 / 通用移动
   ================================================================== */
function solidCircle(g,x,y,r){
  if(g.solidAt(x-r,y)||g.solidAt(x+r,y)||g.solidAt(x,y-r)||g.solidAt(x,y+r)) return true;
  var k=r*0.72;
  if(g.solidAt(x-k,y-k)||g.solidAt(x+k,y-k)||g.solidAt(x-k,y+k)||g.solidAt(x+k,y+k)) return true;
  return false;
}
function unstick(g,e){
  if(!solidCircle(g,e.x,e.y,e.r)) return false;
  var dists=[5,10,16,22,30,40], i, k;
  for(i=0;i<dists.length;i++){
    for(k=0;k<12;k++){
      var a=k/12*Math.PI*2;
      var nx=e.x+Math.cos(a)*dists[i], ny=e.y+Math.sin(a)*dists[i];
      if(!solidCircle(g,nx,ny,e.r)){ e.x=nx; e.y=ny; return true; }
    }
  }
  return false;
}
G.unstick = unstick;
function moveEntity(g, e, dt, phasing){
  var nx=e.x+e.vx*dt, ny=e.y+e.vy*dt;
  if(phasing){ e.x=nx; e.y=ny; clampWorld(g,e); return; }
  if(solidCircle(g,e.x,e.y,e.r)) unstick(g,e);
  if(!solidCircle(g,nx,e.y,e.r)) e.x=nx; else { e.vx*=-0.15; }
  if(!solidCircle(g,e.x,ny,e.r)) e.y=ny; else { e.vy*=-0.15; }
  /* 与场景物件碰撞 */
  for(var i=0;i<g.props.length;i++){
    var p=g.props[i];
    if(!p.solid||p.dead) continue;
    var dx=e.x-p.x, dy=e.y-p.y, mind=e.r+p.r*0.8;
    var d2=dx*dx+dy*dy;
    if(d2<mind*mind && d2>0.001){
      var d=Math.sqrt(d2), push=(mind-d);
      e.x+=dx/d*push; e.y+=dy/d*push;
    }
  }
  clampWorld(g,e);
}
function clampWorld(g,e){
  if(!g.map) return;
  e.x=U.clamp(e.x, 8, g.map.w-8);
  e.y=U.clamp(e.y, 8, g.map.h-8);
}
G.moveEntity = moveEntity;
G.solidCircle = solidCircle;

/* ==================================================================
                              子 弹
   ================================================================== */
function Bullet(o){
  this.x=o.x; this.y=o.y;
  var a=o.ang===undefined?0:o.ang;
  this.vx=Math.cos(a)*o.spd; this.vy=Math.sin(a)*o.spd;
  this.dmg=o.dmg; this.r=o.r||3.5; this.color=o.color||'#ffe07a';
  this.shape=o.shape||'ball'; this.team=o.team||'enemy';
  this.pierce=o.pierce||0; this.bounce=o.bounce||0; this.homing=o.homing||0;
  this.life=o.life||1.4; this.maxLife=this.life; this.aoe=o.aoe||0;
  this.kb=o.kb||0; this.freeze=o.freeze||0; this.burn=o.burn||0;
  this.poison=o.poison||0; this.shock=o.shock||0; this.crit=o.crit||0;
  this.drag=o.drag||0; this.sizeGrow=o.sizeGrow||0; this.spin=o.spin||0;
  this.onHit=o.onHit; this.onDie=o.onDie; this.delay=o.delay||0;
  this.seed=Math.random()*10; this.hits=[]; this.dead=false;
  this.boom=o.boom||0; this.noWall=o.noWall;
  this.ang=a;
}
G.Bullet = Bullet;
Bullet.prototype.update=function(dt,g){
  if(this.delay>0){ this.delay-=dt; return; }
  this.life-=dt;
  if(this.life<=0){ this.kill(g,true); return; }
  if(this.sizeGrow) this.r+=this.sizeGrow*dt;
  if(this.trait==='growing'){
    this.r += 5*dt;
    if(this.dmg0) this.dmg = Math.min(this.dmg0*2.6, this.dmg*(1+1.15*dt));
  }
  if(this.drag){ var f=Math.pow(1/(1+this.drag),dt*3); this.vx*=f; this.vy*=f; }
  if(this.spin){
    var ca=Math.cos(this.spin*dt), sa=Math.sin(this.spin*dt);
    var nvx=this.vx*ca-this.vy*sa, nvy=this.vx*sa+this.vy*ca;
    this.vx=nvx; this.vy=nvy;
  }
  if(this.homing>0){
    var tgt = (this.team==='enemy')? g.player : g.nearestEnemyTo(this.x,this.y,260);
    if(tgt && !tgt.dead){
      var ta=U.ang(this.x,this.y,tgt.x,tgt.y);
      var ca2=Math.atan2(this.vy,this.vx);
      var na=U.rotTo(ca2,ta,this.homing*dt*2.4);
      var sp=Math.sqrt(this.vx*this.vx+this.vy*this.vy);
      this.vx=Math.cos(na)*sp; this.vy=Math.sin(na)*sp;
    }
  }
  var steps = Math.max(1, Math.ceil(Math.sqrt(this.vx*this.vx+this.vy*this.vy)*dt/8));
  for(var s=0;s<steps;s++){
    this.x+=this.vx*dt/steps; this.y+=this.vy*dt/steps;
    if(!this.noWall && g.bulletSolidAt(this.x,this.y)){
      if(this.bounce>0){
        this.bounce--;
        /* 反弹方向：沿 vx 反方向退一步为空 → 从水平方向撞墙 → 反弹 vx；
           沿 vy 反方向退一步为空 → 从垂直方向撞墙 → 反弹 vy；都空/都实 → 双反弹 */
        var bx=g.bulletSolidAt(this.x-this.vx*dt/steps*1.2, this.y);
        var by=g.bulletSolidAt(this.x, this.y-this.vy*dt/steps*1.2);
        if(!bx) this.vx=-this.vx;
        else if(!by) this.vy=-this.vy;
        else { this.vx=-this.vx; this.vy=-this.vy; }
        /* 沿反弹方向推回墙外，避免卡墙/穿墙 */
        var pushX=this.vx*dt/steps, pushY=this.vy*dt/steps;
        for(var u=0;u<8;u++){
          this.x+=pushX; this.y+=pushY;
          if(!g.bulletSolidAt(this.x,this.y)) break;
        }
        if(g.bulletSolidAt(this.x,this.y)){
          /* 仍卡墙：螺旋搜索最近空位 */
          for(var d2=2;d2<=14;d2+=2){
            var found=false;
            for(var k2=0;k2<8;k2++){
              var a2=k2/8*Math.PI*2;
              var nx=this.x+Math.cos(a2)*d2, ny=this.y+Math.sin(a2)*d2;
              if(!g.bulletSolidAt(nx,ny)){ this.x=nx; this.y=ny; found=true; break; }
            }
            if(found) break;
          }
        }
        if(this.trait==='ricochet'){ this.dmg*=1.3; this.r*=1.06; }
        g.burst(this.x,this.y,3,{color:this.color,spd:70,life:0.22});
      } else { this.kill(g,true); return; }
    }
    if(this.checkHit(g)) return;
  }
};
Bullet.prototype.checkHit=function(g){
  if(this.team==='enemy'){
    var p=g.player;
    if(p && !p.dead && U.dist(this.x,this.y,p.x,p.y)<this.r+p.r*0.85){
      p.hurt(this.dmg,g,this); this.kill(g); return true;
    }
    for(var ai=0;ai<g.enemies.length;ai++){
      var al=g.enemies[ai];
      if(al.team!=='ally'||al.dead) continue;
      if(U.dist(this.x,this.y,al.x,al.y)<this.r+al.r){ g.damageEnemy(al,this.dmg,{}); this.kill(g); return true; }
    }
  } else {
    for(var i=0;i<g.enemies.length;i++){
      var e=g.enemies[i];
      if(e.dead || e.team==='ally' || e.spawnT>0) continue;
      if(this.hits.indexOf(e)>=0) continue;
      if(U.dist(this.x,this.y,e.x,e.y) < this.r+e.r){
        /* 正面盾牌格挡 */
        if(e.blockFront && e.shieldA!==undefined){
          var ia=U.ang(e.x,e.y,this.x,this.y);
          if(Math.abs(U.angDiff(e.shieldA,ia))<0.85){
            g.burst(this.x,this.y,5,{color:'#8ef0ff',spd:110,life:0.3});
            G.Audio.sfx.hit(); this.kill(g); return true;
          }
        }
        this.hits.push(e);
        var ang=Math.atan2(this.vy,this.vx);
        var dm=this.dmg;
        if(this.trait==='close'||this.trait==='long'){
          var td=U.dist(this.ox===undefined?this.x:this.ox, this.oy===undefined?this.y:this.oy, this.x, this.y);
          dm *= (this.trait==='close') ? (1+0.85*U.clamp(1-td/230,0,1)) : (1+0.9*U.clamp(td/430,0,1));
        }
        g.damageEnemy(e, dm, {crit:this.crit, kb:this.kb, ang:ang, from:g.player, bullet:this});
        var mult=(g.player&&g.player.dmgMult)||1;
        if(this.trait==='split' && !this.noSplit){
          for(var s2=0;s2<3;s2++){
            var fb=g.spawnBullet({x:this.x,y:this.y,ang:ang+U.rand(-1.1,1.1),spd:U.rand(200,340),
              dmg:dm*0.4/mult, r:Math.max(2.5,this.r*0.55), color:this.color, shape:this.shape,
              team:this.team, life:0.55});
            if(fb) fb.noSplit=true;
          }
        }
        if(this.trait==='chain') g.chainLightning(e, dm*0.5, 2, this.color);
        if(this.trait==='frostbite'){
          e.chillStack=(e.chillStack||0)+1;
          if(e.chillStack>=3){ e.chillStack=0; e.frozen=Math.max(e.frozen,2.4);
            g.burst(e.x,e.y,14,{color:'#9fe4ff',spd:140,life:0.5}); G.Audio.sfx.freeze();
            g.float('冻结!',e.x,e.y-e.r-16,'#9fe4ff',13); }
        }
        if(this.freeze) e.frozen=Math.max(e.frozen,this.freeze);
        if(this.burn){ e.burnT=Math.max(e.burnT,this.burn); e.burnDmg=Math.max(e.burnDmg||0,this.dmg*0.22); }
        if(this.poison){ e.poisonT=Math.max(e.poisonT,this.poison); e.poiDmg=Math.max(e.poiDmg||0,this.dmg*0.2); }
        if(this.shock) g.chainLightning(e, this.dmg*0.55, 3, this.color);
        if(this.onHit) this.onHit(g,this,e);
        if(this.pierce>0){ this.pierce--; }
        else { this.kill(g); return true; }
      }
    }
  }
  /* 命中场景物件 */
  for(var pi=0;pi<g.props.length;pi++){
    var pr=g.props[pi];
    if(pr.dead||(!pr.solid&&!pr.breakable)) continue;
    if(U.dist(this.x,this.y,pr.x,pr.y)<this.r+pr.r*0.8){
      if(pr.breakable) g.hitProp(pr,this.dmg);
      if(this.bounce>0){
        this.bounce--; this.vx=-this.vx; this.vy=-this.vy;
        if(this.trait==='ricochet'){ this.dmg*=1.3; this.r*=1.06; }
      }
      else if(this.pierce>0 && pr.breakable){ this.pierce--; }
      else { this.kill(g); return true; }
    }
  }
  return false;
};
Bullet.prototype.kill=function(g,expired){
  if(this.dead) return;
  this.dead=true;
  if(this.aoe>0) g.explode(this.x,this.y,this.aoe,this.dmg*0.8,this.color,this.team);
  else g.burst(this.x,this.y,4,{color:this.color,spd:80,life:0.25,r:2.5});
  if(this.onDie) this.onDie(g,this);
};
Bullet.prototype.draw=function(ctx,t){
  if(this.delay>0) return;
  Art.bullet(ctx,this,t);
};

/* ==================================================================
                        粒子 / 飘字 / 区域
   ================================================================== */
function Particle(x,y,o){
  o=o||{};
  this.x=x; this.y=y;
  var a=o.ang===undefined?U.rand(0,TAU):o.ang;
  var s=o.spd===undefined?U.rand(40,140):o.spd;
  this.vx=Math.cos(a)*s; this.vy=Math.sin(a)*s;
  this.life=o.life||0.5; this.maxLife=this.life;
  this.r=o.r||3; this.color=o.color||'#ffffff';
  this.glow=o.glow||0; this.grav=o.grav||0; this.drag=o.drag===undefined?3:o.drag;
  this.alpha=o.alpha===undefined?1:o.alpha; this.flash=o.flash;
  this.spin=U.rand(-6,6); this.rot=U.rand(0,TAU); this.shape=o.shape;
}
G.Particle=Particle;
Particle.prototype.update=function(dt){
  this.life-=dt;
  this.x+=this.vx*dt; this.y+=this.vy*dt;
  this.vy+=this.grav*dt;
  var f=Math.pow(1/(1+this.drag),dt*3);
  this.vx*=f; this.vy*=f;
  this.rot+=this.spin*dt;
};
Particle.prototype.draw=function(ctx){
  var k=Math.max(0,this.life/this.maxLife);
  ctx.globalAlpha=k*this.alpha;
  if(this.flash){
    Art.glowDot(ctx,this.x,this.y,this.r*3*k,this.color,0.9);
  } else if(this.shape==='square'){
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.rot);
    ctx.fillStyle=this.color; ctx.fillRect(-this.r*k,-this.r*k,this.r*2*k,this.r*2*k); ctx.restore();
  } else {
    ctx.fillStyle=this.color;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r*k,0,TAU); ctx.fill();
  }
  ctx.globalAlpha=1;
};

function Zone(x,y,r,dur,type,dmg,color,team){
  this.x=x; this.y=y; this.r=r; this.life=dur; this.maxLife=dur;
  this.type=type; this.dmg=dmg; this.color=color||'#ff7a3c';
  this.team=team||'player'; this.tick=0; this.seed=Math.random()*10;
}
G.Zone=Zone;
Zone.prototype.update=function(dt,g){
  this.life-=dt; this.tick-=dt;
  if(this.tick<=0){
    this.tick=0.4;
    if(this.team==='player'){
      var list=g.enemiesInRadius(this.x,this.y,this.r);
      for(var i=0;i<list.length;i++){
        var e=list[i];
        g.damageEnemy(e,this.dmg,{silent:true,color:this.color});
        if(this.type==='frost') e.frozen=Math.max(e.frozen,1.6);
        if(this.type==='fire'){ e.burnT=Math.max(e.burnT,2); e.burnDmg=Math.max(e.burnDmg||0,this.dmg*0.3); }
        if(this.type==='poison'){ e.poisonT=Math.max(e.poisonT,2.5); e.poiDmg=Math.max(e.poiDmg||0,this.dmg*0.3); }
      }
    } else {
      var p=g.player;
      if(p&&!p.dead&&U.dist(p.x,p.y,this.x,this.y)<this.r) p.hurt(this.dmg,g,this);
    }
  }
  if(Math.random()<dt*22){
    var a=U.rand(0,TAU), d=Math.sqrt(Math.random())*this.r;
    g.spawnParticle(this.x+Math.cos(a)*d, this.y+Math.sin(a)*d,
      {color:this.color,life:0.6,r:3.5,spd:14,ang:-1.57,glow:1,alpha:0.7});
  }
};
Zone.prototype.draw=function(ctx,t){
  var k=Math.min(1,this.life/0.5);
  ctx.save();
  ctx.globalAlpha=0.2*k;
  var gr=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r);
  gr.addColorStop(0,U.alpha(this.color,0.75));
  gr.addColorStop(0.7,U.alpha(this.color,0.3));
  gr.addColorStop(1,U.alpha(this.color,0));
  ctx.fillStyle=gr;
  ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,TAU); ctx.fill();
  ctx.globalAlpha=0.5*k;
  ctx.strokeStyle=U.alpha(this.color,0.6); ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.arc(this.x,this.y,this.r*(0.9+Math.sin(t*3+this.seed)*0.06),0,TAU); ctx.stroke();
  ctx.restore();
};

function Pickup(x,y,kind,val,g){
  this.x=x; this.y=y; this.kind=kind; this.val=val;
  this.vx=U.rand(-70,70); this.vy=U.rand(-70,70);
  this.t=0; this.dead=false; this.r=7; this.mag=0;
  this.def = (kind==='weapon')? val : null;
  this.seed=Math.random()*10;
}
G.Pickup=Pickup;
Pickup.prototype.update=function(dt,g){
  this.t+=dt;
  var p=g.player;
  var d=U.dist(this.x,this.y,p.x,p.y);
  var auto=(this.kind==='coin'||this.kind==='heart'||this.kind==='energy'||this.kind==='key');
  if(auto && d<80){ this.mag=1; }
  /* 玩家翻滚/冲刺远离时取消磁吸，避免追着旧位置飞出屏幕 */
  if(this.mag && d>160){ this.mag=0; }
  if(this.mag){
    var a=U.ang(this.x,this.y,p.x,p.y);
    /* 速度下限 0：d>97 时 120+(80-d)*7 会变负，导致拾取物被反向推开飞出屏幕 */
    var sp=Math.max(0, Math.min(560, 120+ (80-d)*7));
    this.vx=U.damp(this.vx,Math.cos(a)*sp,10,dt);
    this.vy=U.damp(this.vy,Math.sin(a)*sp,10,dt);
  } else {
    this.vx*=Math.pow(0.05,dt); this.vy*=Math.pow(0.05,dt);
  }
  this.x+=this.vx*dt; this.y+=this.vy*dt;
  /* 边界保护：拾取物永不飞出地图 */
  if(g.map){
    this.x=U.clamp(this.x, 8, g.map.w-8);
    this.y=U.clamp(this.y, 8, g.map.h-8);
  }
  if(auto && d<14){ g.collect(this); }
};
Pickup.prototype.draw=function(ctx,t){
  var bob=Math.sin(t*4+this.seed)*2.5;
  ctx.save(); ctx.translate(this.x,this.y+bob);
  if(this.kind==='coin'){ Art.glowDot(ctx,0,0,10,'#ffc93c',0.32); Art.icon(ctx,0,0,5,'coin'); }
  else if(this.kind==='heart'){ Art.glowDot(ctx,0,0,12,'#ff4d6a',0.35); Art.icon(ctx,0,0,6,'heart'); }
  else if(this.kind==='energy'){ Art.glowDot(ctx,0,0,12,'#59b8ff',0.35); Art.icon(ctx,0,0,6,'energy'); }
  else if(this.kind==='key'){ Art.glowDot(ctx,0,0,12,'#ffd45e',0.35); Art.icon(ctx,0,0,5,'key'); }
  else if(this.kind==='armor'){ Art.glowDot(ctx,0,0,12,'#7fd4ff',0.35); Art.icon(ctx,0,0,6,'shield'); }
  else if(this.kind==='weapon'){
    var c=G.Weapons.RARITY_COLOR[this.def.rarity-1];
    Art.glowDot(ctx,0,0,22+Math.sin(t*3+this.seed)*3,c,0.42);
    Art.weapon(ctx,0,0,-0.5,this.def.art,{t:t,scale:1.15});
    ctx.strokeStyle=U.alpha(c,0.5); ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.ellipse(0,10,15,5,0,0,TAU); ctx.stroke();
  }
  ctx.restore();
};

function FloatText(txt,x,y,color,size){
  this.txt=txt; this.x=x; this.y=y; this.color=color||'#ffffff';
  this.life=0.95; this.maxLife=0.95; this.vy=-46; this.size=size||13;
  this.vx=U.rand(-16,16);
}
G.FloatText=FloatText;
})();
