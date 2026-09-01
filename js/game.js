/* 元气骑士·深渊回响 —— 主游戏逻辑 */
(function(){
var G = window.G || (window.G = {});
var U = G.U, Art = G.Art, Dn = G.Dungeon, En = G.Enemies, Wp = G.Weapons;
var TAU = Math.PI*2;
var LW = 640, LH = 360;
var TOTAL_FLOORS = 12; /* 6 大关 × 2 小关 */
/* 难度配置：0 简单（当前默认）/ 1 普通 / 2 困难 / 3 噩梦 */
G.DIFFICULTY = [
  { id:'easy', name:'简单', desc:'奖励房多，怪物温和', hp:1.0, dmg:1.0, count:1.0, gold:1.0, specRooms:0, rarityBoost:0 },
  { id:'normal', name:'普通', desc:'奖励房减少，怪物更强', hp:1.25, dmg:1.15, count:1.15, gold:0.9, specRooms:-1, rarityBoost:0 },
  { id:'hard', name:'困难', desc:'奖励房大幅减少，怪物凶悍', hp:1.6, dmg:1.35, count:1.3, gold:0.8, specRooms:-2, rarityBoost:0.5 },
  { id:'nightmare', name:'噩梦', desc:'奖励房稀缺，怪物成群', hp:2.1, dmg:1.6, count:1.5, gold:0.65, specRooms:-3, rarityBoost:1 }
];
G.diff = function(g){ return G.DIFFICULTY[U.clamp((g&&g.difficulty)||0,0,3)]; };

function Game(){
  this.state='menu';
  this.t=0; this.frame=0;
  this.cam={x:0,y:0,tx:0,ty:0,shake:0,shakeA:0};
  this.enemies=[]; this.bullets=[]; this.parts=[]; this.pickups=[];
  this.props=[]; this.zones=[]; this.fx=[]; this.floats=[]; this.timers=[];
  this.inter=[]; this.hitStopT=0; this.slowT=0; this.slowScale=1;
  this.damageVignette=0; this.opts={ light:true, shake:true, particles:true, autoAim:true };
  this.stats={kills:0,coins:0,time:0,floor:1,dmg:0};
  this.difficulty=U.load('difficulty',0);
  this.msg=null;
}
G.Game = Game;

Game.prototype.init = function(){
  this.canvas = document.getElementById('game');
  this.ctx = this.canvas.getContext('2d');
  this.hud = document.getElementById('hud');
  this.hctx = this.hud.getContext('2d');
  this.lightC = document.createElement('canvas');
  this.lightC.width=Math.floor(LW/2); this.lightC.height=Math.floor(LH/2);
  this.lctx = this.lightC.getContext('2d');
  var self=this;
  this.resize();
  window.addEventListener('resize', function(){ self.resize(); });
  G.Input.init(document.getElementById('stage') || this.canvas);
  G.game = this;
};
Game.prototype.resize = function(){
  var w=window.innerWidth, h=window.innerHeight;
  var s=Math.min(w/LW, h/LH);
  this.scale=s;
  this.canvas.style.width=Math.floor(LW*s)+'px';
  this.canvas.style.height=Math.floor(LH*s)+'px';
  this.canvas.style.left=Math.floor((w-LW*s)/2)+'px';
  this.canvas.style.top=Math.floor((h-LH*s)/2)+'px';
  var dpr=Math.min(2, window.devicePixelRatio||1);
  this.hud.width=Math.floor(w*dpr); this.hud.height=Math.floor(h*dpr);
  this.hdpr=dpr;
  this.vw=w; this.vh=h;
};

/* ================= 开局 ================= */
Game.prototype.start = function(heroId){
  var hero=null;
  for(var i=0;i<G.Heroes.length;i++) if(G.Heroes[i].id===heroId) hero=G.Heroes[i];
  hero = hero||G.Heroes[0];
  this.player = new G.Player(hero, this);
  this.players=[this.player];
  this.guest=null;
  this.stats={kills:0,coins:0,time:0,floor:1,dmg:0};
  this.floorNum=1; this.loop=0;
  this.state='playing';
  this.newFloor(1);
  G.Audio.init(); G.Audio.resume();
  G.Audio.music.start(this.biome);
};
Game.prototype.enterLobby = function(){
  G.Lobby.enter(this);
};
Game.prototype.newFloor = function(n, seed){
  this.floorNum=n;
  this.stats.floor=n;
  /* 一大关两小关：大关 = ceil(n/2)，小关 = 1 或 2 */
  this.major = Math.ceil(n/2);
  this.minor = (n-1)%2+1;
  this.biome = (this.major-1)%6;
  this.loop = Math.floor((this.major-1)/6);
  this.map = Dn.generate(n, this.biome, {seed:seed, difficulty:this.difficulty||0, minor:this.minor});
  this.tileset = Art.buildTileset(this.biome, Dn.TS);
  this.B = Art.BIOMES[this.biome];
  this.enemies=[]; this.bullets=[]; this.parts=[]; this.pickups=[];
  this.zones=[]; this.fx=[]; this.floats=[]; this.timers=[]; this.inter=[];
  this.props = this.map.props.slice();
  var p=this.player;
  p.x=this.map.startX; p.y=this.map.startY; p.vx=p.vy=0;
  this.cam.x=p.x-LW/2; this.cam.y=p.y-LH/2;
  this.curRoom=this.map.startRoom;
  this.curRoom.visited=true;
  this.bossActive=null;
  this.buildRoomContent();
  G.Audio.music.start(this.biome);
  this.toast('第 '+this.major+' 大关 · '+this.minor+' 小关 · '+this.B.name + (this.loop>0?(' (轮回 '+this.loop+')'):''));
  if(G.Save) G.Save.auto(this);
};
Game.prototype.buildRoomContent = function(){
  var m=this.map, self=this;
  for(var i=0;i<m.rooms.length;i++){
    var r=m.rooms[i];
    if(r.type==='treasure'){
      this.addChest(r.cx, r.cy, 2+Math.floor(Math.random()*2)+ (this.floorNum>3?1:0));
    } else if(r.type==='shop'){
      this.makeShop(r);
    } else if(r.type==='shrine'){
      this.addShrine(r.cx, r.cy);
    } else if(r.type==='forge'){
      this.makeForge(r);
    } else if(r.type==='recycle'){
      this.makeRecycle(r);
    } else if(r.type==='mentor'){
      this.makeMentor(r);
    } else if(r.type==='smith'){
      this.makeSmith(r);
    } else if(r.type==='wishing'){
      this.makeWishing(r);
    } else if(r.type==='statue'){
      this.makeStatue(r);
    } else if(r.type==='rest'){
      this.makeRest(r);
    } else if(r.type==='trap'){
      this.makeTrap(r);
    } else if(r.type==='armory'){
      this.makeArmory(r);
    } else if(r.type==='vault'){
      this.makeVault(r);
    } else if(r.type==='gunsmith'){
      this.makeGunsmith(r);
    }
  }
};
Game.prototype.addChest = function(x,y,rarity,locked){
  var self=this;
  var c={ kind:'chest', x:x, y:y, r:12, open:false, rarity:rarity||2, locked:!!locked,
    label:locked?'开启 (需要钥匙)':'打开宝箱',
    act:function(){ self.openChest(c); } };
  this.inter.push(c);
  return c;
};
Game.prototype.addShrine = function(x,y){
  var self=this;
  var s={ kind:'shrine', x:x, y:y, r:14, used:false, label:'献祭 15% 生命换取祝福',
    act:function(){
      if(s.used) return;
      s.used=true;
      var p=self.player;
      p.hp=Math.max(1, p.hp-p.maxHp*0.15);
      self.grantRandomBuff();
      self.burst(x,y,40,{color:'#ffd45e',spd:220,life:0.8});
      G.Audio.sfx.power(); self.shake(8);
    } };
  this.inter.push(s);
  return s;
};
Game.prototype.makeShop = function(r){
  var self=this;
  var m=this.map;
  var kinds=['weapon','heal','armor','key'];
  U.shuffle(kinds);
  for(var i=0;i<3;i++){
    var kind=kinds[i];
    var x=r.cx + (i-1)*58, y=r.cy+6;
    var price, def=null, label;
    if(kind==='weapon'){ def=Wp.roll(this.floorNum+1,1); price=28+def.rarity*20; label=def.name+' ['+Wp.RARITY_NAME[def.rarity-1]+']'; }
    else if(kind==='heal'){ price=22; label='治疗药水 (+45 生命)'; }
    else if(kind==='armor'){ price=26; label='护甲强化 (+20 最大护甲)'; }
    else { price=18; label='钥匙'; }
    (function(kind,def,price,label,x,y){
      var it={ kind:'shopitem', itemKind:kind, def:def, price:price, x:x, y:y, r:13, sold:false,
        label:label+' - '+price+'金',
        act:function(){
          var p=self.player;
          if(it.sold) return;
          if(p.coins<it.price){ self.float('金币不足',x,y-24,'#ff5b6e'); return; }
          p.coins-=it.price; it.sold=true;
          if(kind==='weapon'){ p.giveWeapon(it.def); self.toast('获得武器：'+it.def.name); }
          else if(kind==='heal'){ p.heal(45); G.Audio.sfx.heal(); }
          else if(kind==='armor'){ p.maxArmor+=20; p.armor=p.maxArmor; }
          else { p.keys++; }
          G.Audio.sfx.coin();
          self.burst(x,y,18,{color:'#ffd45e',spd:150,life:0.6});
        } };
      self.inter.push(it);
    })(kind,def,price,label,x,y);
  }
  this.inter.push({ kind:'shopkeeper', x:r.cx, y:r.cy-58, r:14, label:null, act:null,
    look:{shape:'humanoid',c1:'#c8a05a',c2:'#6a4a20',c3:'#ffd45e',c4:'#f0d0b0',eye:'#2a1a10',helm:1} });
};

/* ================= 合成 / 回收 / 多功能房间 ================= */
Game.prototype.makeForge = function(r){
  var self=this;
  this.inter.push({ kind:'forge', x:r.cx, y:r.cy, r:16, used:false, label:'合成台（E）',
    act:function(){ if(self.onForge) self.onForge(); } });
};
Game.prototype.makeRecycle = function(r){
  var self=this;
  this.inter.push({ kind:'recycle', x:r.cx, y:r.cy, r:16, label:'回收机（E）',
    act:function(){ if(self.onRecycle) self.onRecycle(); } });
};
Game.prototype.makeMentor = function(r){
  var self=this;
  var m={ kind:'mentor', x:r.cx, y:r.cy, r:16, used:false, label:'导师（E）',
    act:function(){
      var p=self.player, w=p.wpn();
      if(m.used){ self.float('导师已离开',p.x,p.y-24,'#8fa3cc'); return; }
      if(!w){ return; }
      var cost=30;
      if(p.coins<cost){ self.float('金币不足',p.x,p.y-24,'#ff5b6e'); return; }
      p.coins-=cost; m.used=true;
      if(Math.random()<0.5){
        w.dmg=Math.round(w.dmg*1.4);
        self.toast('导师强化了 '+w.name+'：伤害 +40%');
      } else if(w.skill){
        w.skill=Object.create(w.skill);
        w.skill.cd=Math.max(1, Math.round(w.skill.cd*0.75));
        self.toast('导师强化了 '+w.name+'：技能冷却 -25%');
      } else {
        w.dmg=Math.round(w.dmg*1.4);
        self.toast('导师强化了 '+w.name+'：伤害 +40%');
      }
      self.burst(m.x,m.y,20,{color:'#ffd45e',spd:150,life:0.6});
      G.Audio.sfx.power();
    } };
  this.inter.push(m);
};
Game.prototype.makeSmith = function(r){
  var self=this;
  var sm={ kind:'smith', x:r.cx, y:r.cy, r:16, used:false, label:'工匠（E）',
    act:function(){
      var p=self.player, w=p.wpn();
      if(sm.used){ self.float('工匠已离开',p.x,p.y-24,'#8fa3cc'); return; }
      if(!w){ return; }
      sm.used=true;
      var e=U.pick(Wp.ELEMENTS);
      w[e.k]=Math.max(w[e.k]||0, 1.5);
      w.color=e.color;
      if(w.art) w.art=Object.create(w.art);
      if(w.art) w.art.c3=e.color;
      self.toast('工匠为 '+w.name+' 附魔：'+e.name);
      self.burst(sm.x,sm.y,20,{color:e.color,spd:150,life:0.6});
      G.Audio.sfx.power();
    } };
  this.inter.push(sm);
};
Game.prototype.makeWishing = function(r){
  var self=this;
  /* 许愿池：金币消耗指数级上升（10/20/40/80/160/320，上限 500），奖励随投入提升 */
  var wsh={ kind:'wishing', x:r.cx, y:r.cy, r:16, label:'许愿池（E）· 10金', cost:10, uses:0,
    act:function(){
      var p=self.player;
      if(p.coins<wsh.cost){ self.float('需要 '+wsh.cost+' 金币',p.x,p.y-24,'#ff5b6e'); return; }
      p.coins-=wsh.cost;
      wsh.uses++;
      var tier=Math.min(5, wsh.uses); /* 投入越多奖励越好 */
      wsh.cost=Math.min(500, wsh.cost*2);
      wsh.label='许愿池（E）· '+wsh.cost+'金';
      var roll=Math.random();
      if(roll<0.3){ var v=U.randi(15,30)+tier*8; p.coins+=v; self.float('许愿池赐予金币 +'+v,p.x,p.y-24,'#ffc93c'); }
      else if(roll<0.5){ p.heal(25+tier*5); self.float('许愿池回复 '+(25+tier*5)+' 生命',p.x,p.y-24,'#7dffb0'); }
      else if(roll<0.75){ var def=Wp.roll(self.floorNum,0.5+tier*0.2); self.pickups.push(new G.Pickup(wsh.x,wsh.y-10,'weapon',def,self)); self.float('许愿池回应了你！',p.x,p.y-24,'#c88bff'); }
      else { self.grantRandomBuff(); self.float('获得祝福！',p.x,p.y-24,'#ffd45e'); }
      self.burst(wsh.x,wsh.y,24,{color:'#8ef0ff',spd:160,life:0.7});
      G.Audio.sfx.coin();
    } };
  this.inter.push(wsh);
};
Game.prototype.makeStatue = function(r){
  var self=this;
  var st={ kind:'statue', x:r.cx, y:r.cy, r:16, used:false, label:'雕像（E）',
    act:function(){
      if(st.used) return;
      st.used=true;
      var pool=[
        {name:'力量雕像', fn:function(p){ p.addBuff('power',9999,1.25); }},
        {name:'疾风雕像', fn:function(p){ p.addBuff('haste',9999,1.2); }},
        {name:'守护雕像', fn:function(p){ p.addBuff('shield',30,9999); }}
      ];
      var b=U.pick(pool);
      b.fn(self.player);
      self.toast('获得 '+b.name+' 的祝福（本层生效）');
      self.burst(st.x,st.y,26,{color:'#ffd45e',spd:180,life:0.7});
      G.Audio.sfx.power();
    } };
  this.inter.push(st);
};
Game.prototype.makeRest = function(r){
  var self=this;
  var rs={ kind:'rest', x:r.cx, y:r.cy, r:16, used:false, label:'篝火（E）',
    act:function(){
      if(rs.used) return;
      rs.used=true;
      var p=self.player;
      p.heal(Math.round(p.maxHp*0.3));
      p.energy=p.maxEnergy;
      self.float('+'+Math.round(p.maxHp*0.3)+' 生命',p.x,p.y-24,'#7dffb0');
      self.burst(rs.x,rs.y,18,{color:'#ff9a3c',spd:120,life:0.6});
      G.Audio.sfx.heal();
    } };
  this.inter.push(rs);
};
Game.prototype.makeTrap = function(r){
  var self=this;
  this.trapRooms=this.trapRooms||[];
  this.trapRooms.push({x:r.cx,y:r.cy,room:r,t:1.2});
  this.addChest(r.cx, r.cy+40, 3);
};
Game.prototype.makeArmory = function(r){
  var self=this;
  var def=Wp.roll(this.floorNum+1, 0.5);
  this.pickups.push(new G.Pickup(r.cx, r.cy, 'weapon', def, this));
  this.inter.push({ kind:'armory', x:r.cx, y:r.cy-30, r:14, label:'武器架', act:null });
};
Game.prototype.makeGunsmith = function(r){
  var self=this;
  var pool=Object.keys(Wp.PARTS);
  var parts=[];
  for(var i=0;i<3;i++){
    var kind=U.pick(pool);
    var lv=U.randi(1, Math.min(3, 1+Math.floor(this.floorNum/2)));
    parts.push(Wp.partId(kind, lv));
  }
  this.inter.push({ kind:'gunsmith', x:r.cx, y:r.cy, r:16, parts:parts, label:'武器商（E）',
    act:function(){ if(self.onGunsmith) self.onGunsmith(); } });
};
Game.prototype.makeVault = function(r){
  var self=this;
  for(var i=0;i<6;i++){
    this.props.push({ kind:'crate', x:r.cx+U.rand(-50,50), y:r.cy+U.rand(-30,30), r:9,
      solid:false, hp:8, breakable:true, seed:Math.random()*10, room:r, prop:true,
      explosive:false, gold:true });
  }
};
/* 合成 / 回收操作 */
Game.prototype.fuseWeapons = function(mainIdx, subIdx){
  var p=this.player;
  var main=p.weapons[mainIdx], sub=p.weapons[subIdx];
  if(!main||!sub||main===sub) return false;
  var cost=Wp.fuseCost(main, sub);
  var mats=p.mats||0;
  cost=Math.max(5, cost - mats*3);
  if(p.coins<cost){ this.float('金币不足',p.x,p.y-24,'#ff5b6e'); return false; }
  p.coins-=cost;
  /* 用快照合成，保留双方实例属性（附魔/强化/配件） */
  var fused=Wp.fuse(Wp.snapshot(main), Wp.snapshot(sub));
  var keep=[];
  for(var i=0;i<p.weapons.length;i++) if(i!==mainIdx&&i!==subIdx) keep.push(p.weapons[i]);
  keep.push(fused);
  p.weapons=keep; p.wi=keep.length-1;
  this.toast('合成成功：'+fused.name);
  this.burst(p.x,p.y,26,{color:Wp.RARITY_COLOR[fused.rarity-1],spd:180,life:0.7});
  G.Audio.sfx.power();
  return true;
};
Game.prototype.scrapWeapon = function(idx){
  var p=this.player;
  var w=p.weapons[idx];
  if(!w) return false;
  var v=Wp.scrapValue(w);
  p.coins+=v.gold;
  p.mats=(p.mats||0)+v.mats;
  p.weapons.splice(idx,1);
  if(p.wi>=p.weapons.length) p.wi=Math.max(0,p.weapons.length-1);
  this.toast('回收 '+w.name+'：+'+v.gold+' 金币 +'+v.mats+' 材料');
  this.burst(p.x,p.y,16,{color:'#ffc93c',spd:140,life:0.5});
  G.Audio.sfx.coin();
  return true;
};

/* ================= 房间流程 ================= */
Game.prototype.updateRooms = function(dt){
  var p=this.player;
  var r=Dn.roomAt(this.map, p.x, p.y);
  if(r && r!==this.curRoom){
    this.curRoom=r;
    if(!r.visited){ r.visited=true; }
  }
  /* 必须完全走进房间（离门框至少一格）才会封锁大门，否则玩家会被关在门里 */
  var R=this.curRoom;
  if(R && !R.cleared && !R.active){
    var pad=Dn.TS*0.9;
    if(p.x>R.wx+pad && p.x<R.wx+R.ww-pad && p.y>R.wy+pad && p.y<R.wy+R.wh-pad) this.activateRoom(R);
  }
  if(this.curRoom && this.curRoom.active){
    var alive=0;
    for(var i=0;i<this.enemies.length;i++){
      var e=this.enemies[i];
      if(!e.dead && e.team!=='ally') alive++;
    }
    if(alive===0 && this.spawnQueue<=0){
      var r2=this.curRoom;
      if(r2.wavesLeft>0){
        r2.wavesLeft--;
        this.spawnWave(r2, 0.7);
        this.toast('增援出现！');
        G.Audio.sfx.boss();
      } else this.clearRoom(r2);
    }
  }
};
Game.prototype.activateRoom = function(r){
  var m=this.map;
  r.active=true; this.spawnQueue=0;
  for(var i=0;i<r.doors.length;i++){ r.doors[i].open=false; }
  /* 兜底：关门后如果有实体正卡在门框里，立刻推进房间 */
  var p0=this.player;
  if(G.solidCircle(this,p0.x,p0.y,p0.r)){
    var a0=U.ang(p0.x,p0.y,r.cx,r.cy);
    for(var s0=0;s0<26 && G.solidCircle(this,p0.x,p0.y,p0.r);s0++){ p0.x+=Math.cos(a0)*4; p0.y+=Math.sin(a0)*4; }
    G.unstick(this,p0);
  }
  G.Audio.sfx.door();
  G.Audio.music.setIntensity(1);
  var floor=this.floorNum, loopMul=1+this.loop*0.9;
  var D=G.diff(this);
  var hpScale=(1+(floor-1)*0.34)*loopMul*D.hp;
  var dmgScale=(1+(floor-1)*0.2)*loopMul*D.dmg;
  if(r.type==='boss'){
    var bid=En.bossFor(this.biome);
    var b=this.spawnEnemy(bid, r.cx, r.cy-40, {hpScale:hpScale*1.0, dmgScale:dmgScale, spawnFx:true});
    this.bossActive=b;
    this.toast('BOSS：'+b.def.name);
    G.Audio.sfx.boss();
    G.Audio.music.setIntensity(1.5);
    return;
  }
  if(r.type==='gate'){
    r.wavesLeft=0;
    var gcount=Math.max(5, Math.round((6+Math.floor(floor*1.5))*1.3));
    for(var gk=0;gk<gcount;gk++){
      var gpos=Dn.randFloorIn(m,r,2);
      if(U.dist(gpos.x,gpos.y,this.player.x,this.player.y)<70) gpos=Dn.randFloorIn(m,r,2);
      this.spawnEnemy(En.pick(this.biome,floor),gpos.x,gpos.y,
        {hpScale:hpScale*1.5,dmgScale:dmgScale*1.3,spawnFx:true,room:r,elite:true});
    }
    this.toast('关底守卫！');
    G.Audio.sfx.boss();
    return;
  }
  if(r.type==='elite'){
    r.wavesLeft=0;
    var count=Math.max(3, Math.round((5+Math.floor(floor*1.2))*1.2));
    for(var ek=0;ek<count;ek++){
      var epos=Dn.randFloorIn(m,r,2);
      if(U.dist(epos.x,epos.y,this.player.x,this.player.y)<70) epos=Dn.randFloorIn(m,r,2);
      this.spawnEnemy(En.pick(this.biome,floor),epos.x,epos.y,
        {hpScale:hpScale*1.3,dmgScale:dmgScale*1.2,spawnFx:true,room:r,elite:true});
    }
    this.toast('精英房！');
    G.Audio.sfx.boss();
    return;
  }
  r.wavesLeft = (floor>=2 && r.type!=='boss' && Math.random()<0.4)?1:0;
  this.spawnWave(r, 1);
};
Game.prototype.spawnWave = function(r, mul){
  var m=this.map, floor=this.floorNum, loopMul=1+this.loop*0.9;
  var D=G.diff(this);
  var hpScale=(1+(floor-1)*0.34)*loopMul*D.hp, dmgScale=(1+(floor-1)*0.2)*loopMul*D.dmg;
  var count = Math.max(2, Math.round((4 + Math.floor(floor*1.4) + U.randi(0,3))*mul*D.count));
  if(r.type==='challenge') count = Math.floor(count*1.2);
  var eliteChance = r.type==='challenge'?0.7:(0.06+floor*0.035);
  for(var k=0;k<count;k++){
    var pos=Dn.randFloorIn(m,r,2);
    if(U.dist(pos.x,pos.y,this.player.x,this.player.y)<70) pos=Dn.randFloorIn(m,r,2);
    var id=En.pick(this.biome, floor);
    this.spawnEnemy(id,pos.x,pos.y,{hpScale:hpScale,dmgScale:dmgScale,spawnFx:true,
      room:r, elite: Math.random()<eliteChance});
  }
};
Game.prototype.clearRoom = function(r){
  r.active=false; r.cleared=true;
  for(var i=0;i<r.doors.length;i++) r.doors[i].open=true;
  G.Audio.sfx.unlock();
  G.Audio.music.setIntensity(0.2);
  var p=this.player;
  if(p.up.regen>0) { p.heal(p.up.regen); this.float('+'+p.up.regen,p.x,p.y-24,'#7dffb0'); }
  if(r.type==='boss'){
    this.onBossDefeated(r);
    return;
  }
  if(r.type==='gate'){
    this.onGateCleared(r);
    return;
  }
  var pos={x:r.cx,y:r.cy};
  if(r.type==='challenge'){
    this.addChest(pos.x,pos.y,4);
    this.toast('挑战完成！稀有宝箱出现');
  } else if(r.type==='elite'){
    this.addChest(pos.x,pos.y,4);
    this.toast('精英房清空！稀有宝箱出现');
  } else if(Math.random()<0.12){
    this.addChest(pos.x,pos.y, 5, true);
    this.toast('发现上锁的黄金宝箱（需要钥匙）');
  } else if(Math.random()<0.34+p.up.luck*0.12){
    this.addChest(pos.x,pos.y, 1+ (Math.random()<0.3?1:0));
  }
  var D=G.diff(this);
  for(var c=0;c<U.randi(3,7);c++) this.dropPickup(r.cx+U.rand(-30,30), r.cy+U.rand(-30,30),'coin',Math.max(1,Math.round(U.randi(1,4)*D.gold)));
  if(Math.random()<0.3) this.dropPickup(r.cx+U.rand(-20,20),r.cy+U.rand(-20,20),'heart',18);
  if(Math.random()<0.3) this.dropPickup(r.cx+U.rand(-20,20),r.cy+U.rand(-20,20),'energy',14);
  this.toast('房间已清空');
  if(G.Save) G.Save.auto(this);
};
Game.prototype.onBossDefeated = function(r){
  var self=this;
  this.bossActive=null;
  this.toast('BOSS 已被击败！');
  for(var c=0;c<16;c++) this.dropPickup(r.cx+U.rand(-60,60), r.cy+U.rand(-60,60),'coin',U.randi(3,8));
  this.dropPickup(r.cx-30,r.cy+20,'heart',40);
  this.dropPickup(r.cx+30,r.cy+20,'armor',30);
  this.addChest(r.cx, r.cy+50, 5);
  this.portal={ x:r.cx, y:r.cy-60, r:18 };
  this.inter.push({ kind:'portal', x:this.portal.x, y:this.portal.y, r:20,
    label: this.floorNum>=TOTAL_FLOORS?'进入下一轮回':(this.minor===1?'前往本大关 BOSS 关':'前往下一大关'),
    act:function(){ self.nextFloor(); } });
  this.delayed(1.0, function(){ self.showUpgrade(); });
};
Game.prototype.onGateCleared = function(r){
  var self=this;
  this.toast('关底已突破！');
  this.addChest(r.cx, r.cy+30, 4);
  for(var c=0;c<10;c++) this.dropPickup(r.cx+U.rand(-50,50), r.cy+U.rand(-50,50),'coin',U.randi(2,6));
  this.portal={ x:r.cx, y:r.cy-60, r:18 };
  this.inter.push({ kind:'portal', x:this.portal.x, y:this.portal.y, r:20,
    label: this.floorNum>=TOTAL_FLOORS?'进入下一轮回':'前往本大关 BOSS 关',
    act:function(){ self.nextFloor(); } });
};
Game.prototype.nextFloor = function(){
  if(G.Lobby) G.Lobby.addProgress('floor', 1);
  if(this.floorNum>=TOTAL_FLOORS && this.loop===0){
    this.state='win';
    if(this.onWin) this.onWin();
    return;
  }
  this.newFloor(this.floorNum+1);
};
Game.prototype.showUpgrade = function(){
  var pool=G.Buffs.slice();
  U.shuffle(pool);
  var picks=pool.slice(0,3);
  this.state='upgrade';
  if(this.onUpgrade) this.onUpgrade(picks);
};
Game.prototype.applyBuff = function(b){
  b.fn(this.player);
  this.player.picked.push(b);
  this.state='playing';
  G.Audio.sfx.power();
  this.toast('获得祝福：'+b.name);
};
Game.prototype.grantRandomBuff = function(){
  var b=U.pick(G.Buffs);
  b.fn(this.player);
  this.player.picked.push(b);
  this.toast('祝福：'+b.name+' — '+b.desc);
};
Game.prototype.openChest = function(c){
  if(c.open) return;
  if(G.Lobby) G.Lobby.addProgress('chest', 1);
  if(c.locked){
    if(this.player.keys<=0){ this.float('需要钥匙',c.x,c.y-24,'#ff5b6e'); return; }
    this.player.keys--;
  }
  c.open=true;
  var D=G.diff(this);
  var def=Wp.roll(this.floorNum, (c.rarity-2)*0.5 + this.player.up.luck*0.3 + D.rarityBoost);
  this.pickups.push(new G.Pickup(c.x, c.y-10, 'weapon', def, this));
  for(var i=0;i<U.randi(3,8);i++) this.dropPickup(c.x+U.rand(-18,18), c.y+U.rand(-10,18),'coin',U.randi(2,6));
  if(Math.random()<0.4) this.dropPickup(c.x,c.y,'heart',20);
  this.burst(c.x,c.y-6,26,{color:Wp.RARITY_COLOR[def.rarity-1],spd:190,life:0.8});
  G.Audio.sfx.unlock(); this.shake(4);
};

/* ================= 主循环 ================= */
Game.prototype.update = function(dt){
  var IN=G.Input;
  this.frame++;
  if(this.state==='lobby'){ G.Lobby.update(this, dt); return; }
  if(this.netMode==='client'){
    /* 客机：实体由快照驱动，只更新表现层 */
    this.t+=dt; this.stats.time+=dt;
    var i2;
    for(i2=this.parts.length-1;i2>=0;i2--){ this.parts[i2].update(dt); if(this.parts[i2].life<=0) this.parts.splice(i2,1); }
    for(i2=this.fx.length-1;i2>=0;i2--){ var fx2=this.fx[i2]; fx2.update(dt,this); if(fx2.dead) this.fx.splice(i2,1); }
    for(i2=this.floats.length-1;i2>=0;i2--){ var ft2=this.floats[i2]; ft2.life-=dt; ft2.y+=ft2.vy*dt; ft2.x+=ft2.vx*dt; ft2.vy+=90*dt; if(ft2.life<=0) this.floats.splice(i2,1); }
    this.updateCamera(dt);
    if(G.Net) G.Net.update(this, dt);
    if(this.player.dead && this.state==='playing'){
      this.state='dead';
      if(this.onGameOver) this.onGameOver();
    }
    IN.end();
    return;
  }
  if(this.state!=='playing' || this.panelOpen){ IN.end(); return; }
  if(this.hitStopT>0){ this.hitStopT-=dt; IN.end(); this.t+=dt*0.15; return; }
  if(this.slowT>0){ this.slowT-=dt; dt*=this.slowScale; }
  this.t+=dt; this.stats.time+=dt;
  G.Audio.music.update(dt);

  var i;
  for(i=this.timers.length-1;i>=0;i--){
    this.timers[i].t-=dt;
    if(this.timers[i].t<=0){ var f=this.timers[i].fn; this.timers.splice(i,1); f(); }
  }
  var p=this.player;
  p.update(dt,this);
  /* 联机：客机玩家由网络输入驱动 */
  if(this.guest && !this.guest.dead){
    this.guest.update(dt,this);
    if(this.guest.hp<=0 && !this.guest.dead){ this.guest.dead=true; }
  }
  if(G.Net && this.netMode==='host') G.Net.update(this, dt);
  if(p.dead && this.state==='playing'){
    this.state='dead';
    this.burst(p.x,p.y,50,{color:'#ff5b6e',spd:260,life:1.0});
    G.Audio.sfx.explode(); G.Audio.music.stop();
    if(this.onGameOver) this.onGameOver();
    return;
  }
  for(i=this.enemies.length-1;i>=0;i--){
    var e=this.enemies[i];
    e.update(dt,this);
    if(e.dead) this.enemies.splice(i,1);
  }
  for(i=this.bullets.length-1;i>=0;i--){
    var b=this.bullets[i];
    b.update(dt,this);
    if(b.dead) this.bullets.splice(i,1);
  }
  for(i=this.parts.length-1;i>=0;i--){
    this.parts[i].update(dt);
    if(this.parts[i].life<=0) this.parts.splice(i,1);
  }
  for(i=this.zones.length-1;i>=0;i--){
    this.zones[i].update(dt,this);
    if(this.zones[i].life<=0) this.zones.splice(i,1);
  }
  for(i=this.pickups.length-1;i>=0;i--){
    this.pickups[i].update(dt,this);
    if(this.pickups[i].dead) this.pickups.splice(i,1);
  }
  for(i=this.fx.length-1;i>=0;i--){
    var fx=this.fx[i];
    fx.update(dt,this);
    if(fx.dead) this.fx.splice(i,1);
  }
  for(i=this.floats.length-1;i>=0;i--){
    var ft=this.floats[i];
    ft.life-=dt; ft.y+=ft.vy*dt; ft.x+=ft.vx*dt; ft.vy+=90*dt;
    if(ft.life<=0) this.floats.splice(i,1);
  }
  for(i=this.props.length-1;i>=0;i--){
    var pr=this.props[i];
    if(pr.hit>0) pr.hit-=dt*3;
    if(pr.dead) this.props.splice(i,1);
  }
  for(i=0;i<this.map.doors.length;i++){
    var d=this.map.doors[i];
    d.anim=U.damp(d.anim, d.open?0:1, 9, dt);
  }
  /* 陷阱房机关 */
  if(this.trapRooms){
    for(var tr=0;tr<this.trapRooms.length;tr++){
      var tp=this.trapRooms[tr];
      if(!tp.room.visited) continue;
      tp.t-=dt;
      if(tp.t<=0){
        tp.t=1.6;
        var ta=U.rand(0,TAU);
        for(var tk=0;tk<4;tk++){
          var tang=ta+tk/4*TAU;
          this.spawnBullet({x:tp.x+Math.cos(tang)*80,y:tp.y+Math.sin(tang)*80,
            ang:tang+Math.PI,spd:210,dmg:8,r:4,color:'#ff5b6e',shape:'ball',team:'enemy',life:3});
        }
      }
    }
  }
  this.updateRooms(dt);
  this.updateInteract(dt);
  this.updateCamera(dt);
  /* 实时存档：每 30 秒自动保存 */
  this.saveT=(this.saveT||0)-dt;
  if(this.saveT<=0){ this.saveT=30; if(G.Save) G.Save.auto(this); }
  this.damageVignette=Math.max(0,this.damageVignette-dt*2);
  this.shakeV=Math.max(0,(this.shakeV||0)-dt*26);
  IN.end();
};
Game.prototype.updateInteract = function(dt){
  var p=this.player, best=null, bd=44;
  for(var i=0;i<this.inter.length;i++){
    var it=this.inter[i];
    if(!it.label||it.sold||it.open||it.used) continue;
    var d=U.dist(p.x,p.y,it.x,it.y);
    if(d<bd){ bd=d; best=it; }
  }
  var bestPick=null, pd=30;
  for(var j=0;j<this.pickups.length;j++){
    var pu=this.pickups[j];
    if(pu.kind!=='weapon') continue;
    var d2=U.dist(p.x,p.y,pu.x,pu.y);
    if(d2<pd){ pd=d2; bestPick=pu; }
  }
  this.hint=null;
  if(bestPick){
    this.hint={x:bestPick.x,y:bestPick.y-24,
      text:'拾取 '+bestPick.def.name+' ['+Wp.RARITY_NAME[bestPick.def.rarity-1]+']　伤害'+bestPick.def.dmg+
           (bestPick.def.skill?('　技能:'+bestPick.def.skill.name):'')+
           (bestPick.def.trait&&Wp.TRAITS[bestPick.def.trait]?('　特性:'+Wp.TRAITS[bestPick.def.trait].name):''),
      color:Wp.RARITY_COLOR[bestPick.def.rarity-1]};
    if(G.Input.hit('e','f')){
      this.player.giveWeapon(bestPick.def);
      this.toast('装备：'+bestPick.def.name);
      bestPick.dead=true;
      if(G.Save) G.Save.auto(this);
    }
  } else if(best){
    this.hint={x:best.x,y:best.y-26,text:best.label,color:'#ffe07a'};
    if(G.Input.hit('e','f') && typeof best.act==='function') best.act();
  }
};
Game.prototype.updateCamera = function(dt){
  var p=this.player;
  var ax=Math.cos(p.aim)*26, ay=Math.sin(p.aim)*26;
  this.cam.tx = p.x - LW/2 + ax;
  this.cam.ty = p.y - LH/2 + ay;
  this.cam.x = U.damp(this.cam.x, this.cam.tx, 7, dt);
  this.cam.y = U.damp(this.cam.y, this.cam.ty, 7, dt);
  if(this.map){
    this.cam.x=U.clamp(this.cam.x, 0, Math.max(0,this.map.w-LW));
    this.cam.y=U.clamp(this.cam.y, 0, Math.max(0,this.map.h-LH));
  }
};

/* ================= 渲染 ================= */
Game.prototype.draw = function(){
  var ctx=this.ctx, t=this.t;
  if(this.state==='lobby'){ G.Lobby.draw(this, ctx); return; }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle= this.B? this.B.fog : '#06070f';
  ctx.fillRect(0,0,LW,LH);
  if(!this.map) return;
  var sx=0, sy=0;
  if(this.shakeV>0 && this.opts.shake){
    sx=U.rand(-1,1)*this.shakeV; sy=U.rand(-1,1)*this.shakeV;
  }
  var camx=Math.round(this.cam.x-sx), camy=Math.round(this.cam.y-sy);
  this.drawCamX=camx; this.drawCamY=camy;
  ctx.save();
  ctx.translate(-camx,-camy);

  this.drawTiles(ctx,camx,camy);
  for(var z=0;z<this.zones.length;z++) this.zones[z].draw(ctx,t);
  this.drawDoors(ctx);

  /* 深度排序绘制 */
  var list=[];
  for(var i=0;i<this.props.length;i++){ var pr=this.props[i]; if(!pr.dead && this.vis(pr.x,pr.y,60)) list.push(pr); }
  for(i=0;i<this.enemies.length;i++){ if(this.vis(this.enemies[i].x,this.enemies[i].y,80)) list.push(this.enemies[i]); }
  for(i=0;i<this.inter.length;i++){ if(this.vis(this.inter[i].x,this.inter[i].y,60)) list.push(this.inter[i]); }
  list.push(this.player);
  if(this.guest && !this.guest.dead) list.push(this.guest);
  list.sort(function(a,b){ return a.y-b.y; });
  for(i=0;i<this.pickups.length;i++){ var pu=this.pickups[i]; if(this.vis(pu.x,pu.y,40)) pu.draw(ctx,t); }
  for(i=0;i<list.length;i++){
    var o=list[i];
    if(o===this.player || o===this.guest) o.draw(ctx,t,this);
    else if(o.def && o.update) o.draw(ctx,t,this);
    else if(o.kind && !o.prop) this.drawInter(ctx,o,t);
    else Art.prop(ctx,o,t,this.B);
  }
  for(i=0;i<this.bullets.length;i++){ var b=this.bullets[i]; if(this.vis(b.x,b.y,40)) b.draw(ctx,t); }
  for(i=0;i<this.fx.length;i++) this.fx[i].draw(ctx,t,this);
  for(i=0;i<this.parts.length;i++){ var pa=this.parts[i]; if(this.vis(pa.x,pa.y,30)) pa.draw(ctx); }
  this.drawFloats(ctx);
  ctx.restore();

  if(this.opts.light) this.drawLighting(camx,camy);
  this.drawOverlay(ctx);
};
Game.prototype.vis = function(x,y,pad){
  pad=pad||0;
  return x>this.drawCamX-pad && x<this.drawCamX+LW+pad && y>this.drawCamY-pad && y<this.drawCamY+LH+pad;
};
Game.prototype.drawTiles = function(ctx,camx,camy){
  var m=this.map, TS=Dn.TS, ts=this.tileset;
  var x0=Math.max(0,Math.floor(camx/TS)-1), x1=Math.min(m.tw-1,Math.floor((camx+LW)/TS)+1);
  var y0=Math.max(0,Math.floor(camy/TS)-1), y1=Math.min(m.th-1,Math.floor((camy+LH)/TS)+2);
  for(var y=y0;y<=y1;y++){
    for(var x=x0;x<=x1;x++){
      var v=m.tiles[y*m.tw+x];
      if(v===0) continue;
      var px=x*TS, py=y*TS;
      if(v===1||v===3){
        var idx=((x*7+y*13)>>1)%4;
        ctx.drawImage(ts.floors[idx], px,py);
        var up=m.tiles[(y-1)*m.tw+x];
        if(up===2){ ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fillRect(px,py,TS,5); }
      } else if(v===2){
        var below=(y+1<m.th)? m.tiles[(y+1)*m.tw+x] : 0;
        if(below===1||below===3) ctx.drawImage(ts.wallFace, px,py);
        else ctx.drawImage(ts.wallTop, px,py);
      } else if(v===4){
        ctx.drawImage(ts.liquid, px,py);
      }
    }
  }
};
Game.prototype.drawDoors = function(ctx){
  var TS=Dn.TS, m=this.map;
  for(var i=0;i<m.doors.length;i++){
    var d=m.doors[i];
    if(!this.vis(d.cx,d.cy,60)) continue;
    var a=d.anim;
    ctx.save();
    var w=d.horiz?TS:TS*3, h=d.horiz?TS*3:TS;
    var x=d.cx-w/2, y=d.cy-h/2;
    ctx.fillStyle=U.alpha(this.B.accent,0.25);
    ctx.fillRect(x,y,w,h);
    if(a>0.02){
      ctx.fillStyle=U.shade(this.B.wall,0.85);
      if(d.horiz){
        ctx.fillRect(x, d.cy-h/2, w, h/2*a);
        ctx.fillRect(x, d.cy+h/2-h/2*a, w, h/2*a);
        ctx.fillStyle=U.alpha('#ff5b6e',0.5*a);
        ctx.fillRect(x, d.cy-h/2+h/2*a-1.5, w, 1.5);
        ctx.fillRect(x, d.cy+h/2-h/2*a, w, 1.5);
      } else {
        ctx.fillRect(d.cx-w/2, y, w/2*a, h);
        ctx.fillRect(d.cx+w/2-w/2*a, y, w/2*a, h);
        ctx.fillStyle=U.alpha('#ff5b6e',0.5*a);
        ctx.fillRect(d.cx-w/2+w/2*a-1.5, y, 1.5, h);
        ctx.fillRect(d.cx+w/2-w/2*a, y, 1.5, h);
      }
    }
    ctx.restore();
  }
};
Game.prototype.drawInter = function(ctx,o,t){
  if(o.kind==='chest') Art.chest(ctx,o.x,o.y,t,o.open,o.rarity);
  else if(o.kind==='shrine') Art.shrine(ctx,o.x,o.y,t,'#ffd45e',o.used);
  else if(o.kind==='portal') Art.portal(ctx,o.x,o.y,t,this.B.accent);
  else if(o.kind==='forge') Art.forge(ctx,o.x,o.y,t,o.used);
  else if(o.kind==='recycle') Art.recycle(ctx,o.x,o.y,t);
  else if(o.kind==='mentor') Art.mentor(ctx,o.x,o.y,t);
  else if(o.kind==='smith') Art.smith(ctx,o.x,o.y,t);
  else if(o.kind==='wishing') Art.wishing(ctx,o.x,o.y,t);
  else if(o.kind==='statue') Art.statue(ctx,o.x,o.y,t,o.used);
  else if(o.kind==='rest') Art.rest(ctx,o.x,o.y,t,o.used);
  else if(o.kind==='armory') Art.armory(ctx,o.x,o.y,t);
  else if(o.kind==='gunsmith') Art.smith(ctx,o.x,o.y,t);
  else if(o.kind==='shopkeeper'){
    Art.creature(ctx,o.x,o.y,14,o.look,{t:t,face:1,moving:0});
    ctx.save();
    ctx.fillStyle=U.alpha('#ffd45e',0.5+Math.sin(t*2)*0.15);
    ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
    ctx.fillText('SHOP',o.x,o.y-26); ctx.restore();
  }
  else if(o.kind==='shopitem'){
    if(o.sold) return;
    ctx.save();
    Art.shadow(ctx,o.x,o.y+8,10,4,0.3);
    ctx.fillStyle=U.shade(this.B.wall,1.1);
    U.roundRect(ctx,o.x-11,o.y-2,22,10,2); ctx.fill();
    var bob=Math.sin(t*3+o.x)*2;
    if(o.itemKind==='weapon'){
      Art.glowDot(ctx,o.x,o.y-12+bob,20,Wp.RARITY_COLOR[o.def.rarity-1],0.4);
      Art.weapon(ctx,o.x,o.y-12+bob,-0.4,o.def.art,{t:t,scale:1.1});
    } else if(o.itemKind==='heal'){ Art.glowDot(ctx,o.x,o.y-12+bob,16,'#ff4d6a',0.4); Art.icon(ctx,o.x,o.y-12+bob,7,'heart'); }
    else if(o.itemKind==='armor'){ Art.glowDot(ctx,o.x,o.y-12+bob,16,'#7fd4ff',0.4); Art.icon(ctx,o.x,o.y-12+bob,7,'shield'); }
    else { Art.glowDot(ctx,o.x,o.y-12+bob,16,'#ffd45e',0.4); Art.icon(ctx,o.x,o.y-12+bob,6,'key'); }
    ctx.restore();
  }
};
Game.prototype.drawFloats = function(ctx){
  ctx.save();
  ctx.textAlign='center';
  for(var i=0;i<this.floats.length;i++){
    var f=this.floats[i];
    if(!this.vis(f.x,f.y,40)) continue;
    var k=Math.min(1,f.life/0.35);
    ctx.globalAlpha=k;
    ctx.font='bold '+f.size+'px sans-serif';
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,0.8)';
    ctx.strokeText(f.txt,f.x,f.y);
    ctx.fillStyle=f.color;
    ctx.fillText(f.txt,f.x,f.y);
  }
  ctx.globalAlpha=1;
  ctx.restore();
};
Game.prototype.drawLighting = function(camx,camy){
  var lc=this.lctx, S=0.5;
  if(!lc) return;
  lc.setTransform(1,0,0,1,0,0);
  lc.globalCompositeOperation='source-over';
  lc.fillStyle=this.B.amb;
  lc.fillRect(0,0,this.lightC.width,this.lightC.height);
  lc.globalCompositeOperation='lighter';
  var self=this;
  function light(x,y,r,c,a){
    var lx=(x-camx)*S, ly=(y-camy)*S, lr=r*S;
    if(lx< -lr||ly< -lr||lx>self.lightC.width+lr||ly>self.lightC.height+lr) return;
    var g2=lc.createRadialGradient(lx,ly,0,lx,ly,lr);
    g2.addColorStop(0,U.alpha(c,a));
    g2.addColorStop(0.5,U.alpha(c,a*0.4));
    g2.addColorStop(1,U.alpha(c,0));
    lc.fillStyle=g2;
    lc.fillRect(lx-lr,ly-lr,lr*2,lr*2);
  }
  var p=this.player;
  light(p.x,p.y,190,'#ffeccc',0.85);
  for(var i=0;i<this.map.lights.length;i++){
    var L=this.map.lights[i];
    if(!this.vis(L.x,L.y,160)) continue;
    light(L.x,L.y,L.r*(0.9+Math.sin(this.t*7+L.x)*0.08),L.c,0.75);
  }
  var blim=Math.min(this.bullets.length,70);
  for(i=0;i<blim;i++){
    var b=this.bullets[i];
    if(!this.vis(b.x,b.y,40)) continue;
    light(b.x,b.y,b.r*7+16,b.color,0.5);
  }
  for(i=0;i<this.zones.length;i++){ var z=this.zones[i]; light(z.x,z.y,z.r*1.4,z.color,0.5); }
  for(i=0;i<this.parts.length;i++){
    var pa=this.parts[i];
    if(pa.glow && this.vis(pa.x,pa.y,20)) light(pa.x,pa.y,pa.r*5,pa.color,0.4*(pa.life/pa.maxLife));
  }
  for(i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];
    if(e.def.look.aura && this.vis(e.x,e.y,80)) light(e.x,e.y,e.r*4,e.def.look.aura,0.5);
  }
  var ctx=this.ctx;
  ctx.save();
  ctx.globalCompositeOperation='multiply';
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(this.lightC,0,0,LW,LH);
  ctx.restore();
  ctx.imageSmoothingEnabled=false;
};
Game.prototype.drawOverlay = function(ctx){
  if(this.damageVignette>0){
    var g2=ctx.createRadialGradient(LW/2,LH/2,LH*0.25,LW/2,LH/2,LH*0.78);
    g2.addColorStop(0,'rgba(255,40,60,0)');
    g2.addColorStop(1,'rgba(255,30,50,'+(0.55*this.damageVignette)+')');
    ctx.fillStyle=g2; ctx.fillRect(0,0,LW,LH);
  }
  var p=this.player;
  if(p && p.hp/p.maxHp<0.3 && this.state==='playing'){
    var pulse=0.16+Math.sin(this.t*5)*0.08;
    var g3=ctx.createRadialGradient(LW/2,LH/2,LH*0.3,LW/2,LH/2,LH*0.8);
    g3.addColorStop(0,'rgba(255,0,40,0)');
    g3.addColorStop(1,'rgba(255,0,40,'+pulse+')');
    ctx.fillStyle=g3; ctx.fillRect(0,0,LW,LH);
  }
};

/* ================= HUD ================= */
Game.prototype.drawHUD = function(){
  var c=this.hctx, dpr=this.hdpr, W=this.vw, H=this.vh;
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,W,H);
  if(this.state==='menu'||this.state==='lobby'||!this.player) return;
  var p=this.player;
  c.textBaseline='middle';

  /* 生命 / 护甲 */
  var bx=18, by=20, bw=Math.min(230, W*0.3);
  c.fillStyle='rgba(8,10,22,0.72)';
  U.roundRect(c,bx-8,by-13,bw+70,58,10); c.fill();
  c.strokeStyle='rgba(120,150,220,0.3)'; c.lineWidth=1; c.stroke();
  Art.icon(c,bx+6,by+1,8,'heart');
  var hp01=Math.max(0,p.hp/p.maxHp);
  c.fillStyle='rgba(0,0,0,0.5)'; U.roundRect(c,bx+20,by-6,bw,13,6); c.fill();
  var hg=c.createLinearGradient(bx+20,0,bx+20+bw,0);
  hg.addColorStop(0,'#ff2d55'); hg.addColorStop(1,'#ff7a8a');
  c.fillStyle=hg; U.roundRect(c,bx+20,by-6,Math.max(4,bw*hp01),13,6); c.fill();
  c.fillStyle='#fff'; c.font='bold 11px sans-serif'; c.textAlign='left';
  c.fillText(Math.ceil(p.hp)+' / '+p.maxHp, bx+26, by+1);

  if(p.maxArmor>0){
    Art.icon(c,bx+6,by+22,7,'shield');
    var ar01=Math.max(0,p.armor/p.maxArmor);
    c.fillStyle='rgba(0,0,0,0.5)'; U.roundRect(c,bx+20,by+16,bw,9,4); c.fill();
    var ag=c.createLinearGradient(bx+20,0,bx+20+bw,0);
    ag.addColorStop(0,'#4aa8ff'); ag.addColorStop(1,'#a8e0ff');
    c.fillStyle=ag; U.roundRect(c,bx+20,by+16,Math.max(3,bw*ar01),9,4); c.fill();
  }
  /* 能量 */
  var ey=by+38;
  Art.icon(c,bx+6,ey+4,7,'energy');
  var en01=p.energy/p.maxEnergy;
  c.fillStyle='rgba(0,0,0,0.5)'; U.roundRect(c,bx+20,ey,bw*0.8,10,5); c.fill();
  var eg=c.createLinearGradient(bx+20,0,bx+20+bw*0.8,0);
  eg.addColorStop(0,'#2f7ad0'); eg.addColorStop(1,'#8ee0ff');
  c.fillStyle=eg; U.roundRect(c,bx+20,ey,Math.max(3,bw*0.8*en01),10,5); c.fill();

  /* 金币 / 钥匙 / 层数 */
  c.font='bold 14px sans-serif'; c.textAlign='left';
  Art.icon(c,bx+8,ey+30,7,'coin');
  c.fillStyle='#ffd45e'; c.fillText(p.coins, bx+20, ey+30);
  if(p.keys>0){ Art.icon(c,bx+64,ey+30,6,'key'); c.fillStyle='#ffe08a'; c.fillText('x'+p.keys, bx+76, ey+30); }

  /* 武器槽 */
  var slotY=H-64, slotX=18;
  for(var i=0;i<p.weapons.length;i++){
    var w=p.weapons[i], sel=(i===p.wi);
    var sw=sel?58:46, sh=sel?58:46;
    var x=slotX, y=slotY+ (sel?0:6);
    c.fillStyle=sel?'rgba(30,40,80,0.9)':'rgba(14,18,36,0.75)';
    U.roundRect(c,x,y,sw,sh,10); c.fill();
    c.strokeStyle=sel?Wp.RARITY_COLOR[w.rarity-1]:'rgba(90,110,170,0.5)';
    c.lineWidth=sel?2.4:1.2; c.stroke();
    c.save(); c.translate(x+sw/2,y+sh/2);
    var s=sel?1.25:1.0; c.scale(s,s);
    Art.weapon(c,0,0,-0.45,w.art,{t:this.t,scale:1.0});
    c.restore();
    c.font='bold 9px sans-serif'; c.textAlign='center'; c.fillStyle='#93a6cc';
    c.fillText((i+1),x+sw/2,y+sh-7);
    if(w.skillCd>0){
      c.fillStyle='rgba(0,0,0,0.6)';
      var k=w.skillCd/(w.skill.cd*(1+p.up.skillCd));
      U.roundRect(c,x,y+sh*(1-k),sw,sh*k,8); c.fill();
    }
    slotX += sw+8;
  }
  /* 当前武器名 + 技能 */
  var cw=p.wpn();
  if(cw){
    var tx=18, ty=H-106;
    c.textAlign='left';
    c.font='bold 13px sans-serif';
    c.fillStyle=Wp.RARITY_COLOR[cw.rarity-1];
    c.fillText(cw.name+' ',tx,ty);
    var nw=c.measureText(cw.name+' ').width;
    c.font='10px sans-serif'; c.fillStyle='#8fa3cc';
    c.fillText('['+Wp.RARITY_NAME[cw.rarity-1]+']',tx+nw,ty);
    if(cw.skill){
      c.font='11px sans-serif';
      var ready=cw.skillCd<=0 && p.energy>=cw.skill.cost*(p.hero.skillCostMult||1);
      c.fillStyle= ready?'#ffd45e':'#5a6b91';
      c.fillText('[右键] '+cw.skill.name + (cw.skillCd>0? (' '+cw.skillCd.toFixed(1)+'s'):' 就绪'), tx, ty+16);
    }
    if(cw.trait && Wp.TRAITS[cw.trait]){
      c.font='11px sans-serif';
      var tinfo=Wp.TRAITS[cw.trait].name, tcol='#8ef0ff';
      if(cw.trait==='magazine'){
        if(cw.reload>0){ tinfo+=' · 装填中 '+cw.reload.toFixed(1)+'s'; tcol='#ff8a8a'; }
        else tinfo+=' · 弹夹 '+(cw.mag===undefined?(cw.magSize||5):cw.mag)+'/'+(cw.magSize||5);
      } else if(cw.trait==='heat'||cw.trait==='spinup'||cw.trait==='combo'){
        tinfo+=' · 增速 '+Math.round((cw.heat||0)*(cw.trait==='spinup'?85:55))+'%';
      } else if(cw.trait==='everyN'){
        tinfo+=' · 蓄能 '+((cw.shots||0)%3)+'/3';
      } else if(cw.trait==='lock'){
        tinfo+=(p.stillT>0.4?' · 已锁定':' · 静止蓄势');
        tcol=(p.stillT>0.4)?'#ffb0e0':'#5a6b91';
      } else if(cw.trait==='overload'){
        var ov=p.energy/p.maxEnergy>0.7; tinfo+=ov?' · 过载中':' · 待充能'; tcol=ov?'#ffd45e':'#5a6b91';
      }
      c.fillStyle=tcol;
      c.fillText('◆ '+tinfo, tx, ty+32);
    }
  }
  /* 蓄力条 */
  var cwq=p.wpn();
  if(cwq && cwq.charge && p.charge>0.05){
    var cw3=Math.min(1,p.charge);
    var cbx=W/2-60, cby=H-30;
    c.fillStyle='rgba(8,10,22,0.8)'; U.roundRect(c,cbx-2,cby-2,124,14,7); c.fill();
    var cfull=cw3>=0.66;
    var cg2=c.createLinearGradient(cbx,0,cbx+120,0);
    cg2.addColorStop(0,'#59b8ff'); cg2.addColorStop(1,cfull?'#ffd45e':'#8ee0ff');
    c.fillStyle=cg2; U.roundRect(c,cbx,cby,Math.max(4,120*cw3),10,5); c.fill();
    c.fillStyle=cfull?'#ffd45e':'#c8d4ea';
    c.font='bold 9px sans-serif'; c.textAlign='center';
    c.fillText(cfull?'满蓄力！':'蓄力中', W/2, cby+7);
  }
  /* 激光武器过热条 */
  if(cwq && cwq.type==='laser' && (cwq.heat||0)>0.02){
    var ohx=W/2-60, ohy=H-44;
    c.fillStyle='rgba(8,10,22,0.8)'; U.roundRect(c,ohx-2,ohy-2,124,12,6); c.fill();
    c.fillStyle=(cwq.heat>=1)?'#ff5b6e':'#ff9a3c';
    U.roundRect(c,ohx,ohy,Math.max(4,120*(cwq.heat||0)),8,4); c.fill();
    c.fillStyle='#ff8a8a'; c.font='bold 9px sans-serif'; c.textAlign='center';
    c.fillText(cwq.heat>=1?'过热冷却中':'过热 '+(Math.round((cwq.heat||0)*100))+'%', W/2, ohy+6);
  }
  /* 大招 */
  var ux=W-84, uy=H-64;
  var ur=26;
  c.beginPath(); c.arc(ux+ur,uy+ur,ur,0,TAU);
  c.fillStyle='rgba(14,18,36,0.8)'; c.fill();
  c.strokeStyle=p.ultCd<=0?'#ffd45e':'rgba(90,110,170,0.5)'; c.lineWidth=p.ultCd<=0?2.6:1.4; c.stroke();
  if(p.ultCd>0){
    var uk=p.ultCd/p.hero.ult.cd;
    c.beginPath(); c.moveTo(ux+ur,uy+ur);
    c.arc(ux+ur,uy+ur,ur,-Math.PI/2,-Math.PI/2+TAU*uk); c.closePath();
    c.fillStyle='rgba(0,0,0,0.62)'; c.fill();
    c.fillStyle='#c8d4ea'; c.font='bold 15px sans-serif'; c.textAlign='center';
    c.fillText(Math.ceil(p.ultCd), ux+ur, uy+ur);
  } else {
    c.fillStyle='#ffd45e'; c.font='bold 12px sans-serif'; c.textAlign='center';
    c.fillText('空格', ux+ur, uy+ur-6);
    c.font='bold 10px sans-serif'; c.fillStyle='#ffe9b0';
    c.fillText(p.hero.ult.name, ux+ur, uy+ur+9);
  }

  /* 小地图 */
  this.drawMinimap(c, W-152, 16, 136, 100);

  /* 层数 */
  c.textAlign='center'; c.font='bold 13px sans-serif'; c.fillStyle='rgba(220,232,255,0.85)';
  c.fillText('第 '+this.major+' 大关 · '+this.minor+' 小关 · '+this.B.name, W/2, 22);
  if(this.curRoom && this.curRoom.active){
    var alive=0;
    for(var q=0;q<this.enemies.length;q++) if(!this.enemies[q].dead&&this.enemies[q].team!=='ally') alive++;
    c.font='bold 11px sans-serif'; c.fillStyle='#ff8a8a';
    c.fillText('房间封锁中 · 剩余敌人 '+alive, W/2, 40);
  }

  /* 客机玩家状态 */
  if(this.guest && !this.guest.dead){
    var gx=W-190, gy=H-30;
    c.fillStyle='rgba(8,10,22,0.72)';
    U.roundRect(c,gx-8,gy-12,180,24,8); c.fill();
    c.fillStyle='rgba(0,0,0,0.5)'; U.roundRect(c,gx,gy-6,160,8,4); c.fill();
    c.fillStyle='#6ee27f'; U.roundRect(c,gx,gy-6,Math.max(3,160*Math.max(0,this.guest.hp/this.guest.maxHp)),8,4); c.fill();
    c.fillStyle='#c8d4ea'; c.font='bold 10px sans-serif'; c.textAlign='left';
    c.fillText('P2 '+this.guest.hero.name, gx, gy+10);
  }
  /* BOSS 血条 */
  if(this.bossActive && !this.bossActive.dead){
    var b=this.bossActive;
    var bw2=Math.min(460,W*0.62), bx2=(W-bw2)/2, by2=H-46;
    c.fillStyle='rgba(8,10,22,0.8)'; U.roundRect(c,bx2-6,by2-16,bw2+12,32,8); c.fill();
    c.strokeStyle='rgba(255,90,90,0.5)'; c.lineWidth=1.2; c.stroke();
    c.fillStyle='rgba(0,0,0,0.6)'; U.roundRect(c,bx2,by2,bw2,13,6); c.fill();
    var bg=c.createLinearGradient(bx2,0,bx2+bw2,0);
    bg.addColorStop(0,'#ff2d3d'); bg.addColorStop(1,'#ff9a5a');
    c.fillStyle=bg; U.roundRect(c,bx2,by2,Math.max(3,bw2*Math.max(0,b.hp/b.maxHp)),13,6); c.fill();
    c.fillStyle='#fff'; c.font='bold 12px sans-serif'; c.textAlign='center';
    c.fillText(b.def.name+'   第 '+(b.phase||1)+' 阶段', W/2, by2-6);
  }

  /* 交互提示 */
  if(this.hint){
    var s2=this.worldToScreen(this.hint.x,this.hint.y);
    c.font='bold 13px sans-serif'; c.textAlign='center';
    var tw=c.measureText(this.hint.text).width;
    c.fillStyle='rgba(8,10,22,0.82)';
    U.roundRect(c,s2.x-tw/2-26,s2.y-14,tw+52,26,13); c.fill();
    c.strokeStyle=U.alpha(this.hint.color,0.6); c.lineWidth=1.2; c.stroke();
    c.fillStyle='#ffd45e'; c.textAlign='left'; c.fillText('E',s2.x-tw/2-17,s2.y);
    c.fillStyle=this.hint.color; c.textAlign='left';
    c.fillText(this.hint.text, s2.x-tw/2+2, s2.y);
  }

  /* 祝福图标 */
  var px2=W-18, py2=H-104;
  c.textAlign='right';
  for(var bi=0;bi<p.picked.length;bi++){
    var bb=p.picked[bi];
    var col2=bi%8, row=Math.floor(bi/8);
    var ix=W-24-col2*22, iy=H-110-row*22;
    c.fillStyle=U.alpha(bb.icon,0.85);
    c.beginPath(); c.arc(ix,iy,8,0,TAU); c.fill();
    c.strokeStyle='rgba(0,0,0,0.5)'; c.lineWidth=1; c.stroke();
    c.fillStyle='#101828'; c.font='bold 9px sans-serif'; c.textAlign='center';
    c.fillText(bb.name.charAt(0),ix,iy+0.5);
  }

  /* 触屏摇杆 */
  var IN=G.Input;
  if(IN.hasTouch){
    [IN.stickL,IN.stickR].forEach(function(st){
      if(!st.on) return;
      c.beginPath(); c.arc(st.ox,st.oy,52,0,TAU);
      c.fillStyle='rgba(255,255,255,0.07)'; c.fill();
      c.strokeStyle='rgba(255,255,255,0.25)'; c.lineWidth=2; c.stroke();
      c.beginPath(); c.arc(st.ox+st.dx*40, st.oy+st.dy*40, 22,0,TAU);
      c.fillStyle='rgba(255,255,255,0.28)'; c.fill();
    });
  }
  /* toast */
  if(this.msg && this.msgT>0){
    c.globalAlpha=Math.min(1,this.msgT);
    c.textAlign='center'; c.font='bold 17px sans-serif';
    var mw=c.measureText(this.msg).width;
    c.fillStyle='rgba(8,10,22,0.85)';
    U.roundRect(c,W/2-mw/2-20,H*0.16-18,mw+40,36,18); c.fill();
    c.strokeStyle='rgba(255,200,90,0.5)'; c.lineWidth=1.4; c.stroke();
    c.fillStyle='#ffe9b0'; c.fillText(this.msg,W/2,H*0.16);
    c.globalAlpha=1;
  }
};
Game.prototype.drawMinimap = function(c,x,y,w,h){
  var m=this.map;
  c.fillStyle='rgba(8,10,22,0.7)';
  U.roundRect(c,x,y,w,h,8); c.fill();
  c.strokeStyle='rgba(120,150,220,0.3)'; c.lineWidth=1; c.stroke();
  var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  for(var i=0;i<m.rooms.length;i++){
    var r=m.rooms[i];
    minx=Math.min(minx,r.gx); maxx=Math.max(maxx,r.gx);
    miny=Math.min(miny,r.gy); maxy=Math.max(maxy,r.gy);
  }
  var cols=maxx-minx+1, rows=maxy-miny+1;
  var cell=Math.min((w-14)/cols,(h-14)/rows);
  var ox=x+(w-cell*cols)/2, oy=y+(h-cell*rows)/2;
  for(i=0;i<m.rooms.length;i++){
    var r2=m.rooms[i];
    var rx=ox+(r2.gx-minx)*cell, ry=oy+(r2.gy-miny)*cell;
    var pad=cell*0.14;
    var col='rgba(60,74,120,0.55)';
    if(r2.visited){
      col='rgba(110,132,190,0.85)';
      if(r2.type==='boss') col='rgba(220,70,80,0.9)';
      else if(r2.type==='shop') col='rgba(240,190,70,0.9)';
      else if(r2.type==='treasure') col='rgba(120,220,140,0.9)';
      else if(r2.type==='shrine') col='rgba(190,130,240,0.9)';
      else if(r2.type==='challenge') col='rgba(240,140,80,0.9)';
      if(!r2.cleared && r2.type!=='start') col=U.alpha('#ff8a5a',0.75);
    } else {
      var adj=false;
      for(var e2=0;e2<r2.cell.edges.length;e2++) if(r2.cell.edges[e2].room && r2.cell.edges[e2].room.visited) adj=true;
      if(!adj) continue;
      col='rgba(50,62,100,0.5)';
    }
    c.fillStyle=col;
    U.roundRect(c,rx+pad,ry+pad,cell-pad*2,cell-pad*2,2); c.fill();
    if(r2.visited && r2.type==='boss'){ c.fillStyle='#fff'; c.font='bold 8px sans-serif'; c.textAlign='center';
      c.fillText('B',rx+cell/2,ry+cell/2); }
  }
  if(this.curRoom){
    var cr=this.curRoom;
    var cx2=ox+(cr.gx-minx)*cell+cell/2, cy2=oy+(cr.gy-miny)*cell+cell/2;
    c.fillStyle='#ffffff';
    c.beginPath(); c.arc(cx2,cy2,2.6,0,TAU); c.fill();
  }
};

/* ================= 通用 API ================= */
Game.prototype.toast = function(txt){ this.msg=txt; this.msgT=2.2; var self=this;
  this.delayed(2.2,function(){ if(self.msg===txt) self.msg=null; }); };
Game.prototype.delayed = function(t,fn){ this.timers.push({t:t,fn:fn}); };
Game.prototype.shake = function(v){ this.shakeV=Math.min(16,(this.shakeV||0)+v*0.45); };
Game.prototype.hitStop = function(t){ this.hitStopT=Math.max(this.hitStopT,t); };
Game.prototype.timeStop = function(dur){ this.slowT=dur; this.slowScale=0.12; var self=this;
  this.delayed(dur,function(){ self.slowScale=1; }); };
Game.prototype.float = function(txt,x,y,color,size){ this.floats.push(new G.FloatText(txt,x,y,color,size)); };
Game.prototype.spawnParticle = function(x,y,o){
  if(!this.opts.particles && this.parts.length>120) return;
  if(this.parts.length>800) return;
  this.parts.push(new G.Particle(x,y,o));
};
Game.prototype.burst = function(x,y,n,o){
  o=o||{};
  var lim = this.opts.particles?n:Math.ceil(n*0.4);
  for(var i=0;i<lim;i++){
    this.spawnParticle(x,y,{ color:o.color, spd:U.rand(0.3,1)*(o.spd||140), life:(o.life||0.5)*U.rand(0.6,1.2),
      r:(o.r||3)*U.rand(0.6,1.3), glow:o.glow===undefined?1:o.glow, alpha:o.alpha, ang:o.ang===undefined?undefined:o.ang+U.rand(-0.5,0.5) });
  }
};
Game.prototype.spawnBullet = function(o){
  var p=this.player;
  if(o.team==='player' && p){
    o.dmg = o.dmg * p.dmgMult;
    if(o.crit===undefined && Math.random()<p.critChance){ o.crit=1; o.dmg*=p.critMult; }
    o.pierce=(o.pierce||0)+p.up.pierce;
    o.bounce=(o.bounce||0)+p.up.bounce;
    o.homing=(o.homing||0)+p.up.homing;
    if(p.up.frost>0 && Math.random()<p.up.frost) o.freeze=Math.max(o.freeze||0,1.5);
    if(p.up.fire>0 && Math.random()<p.up.fire) o.burn=Math.max(o.burn||0,2);
    if(p.up.shock>0 && Math.random()<p.up.shock) o.shock=1;
    if(p.up.poison>0 && Math.random()<p.up.poison) o.poison=Math.max(o.poison||0,2.4);
    if(p.up.boom>0 && Math.random()<p.up.boom) o.aoe=Math.max(o.aoe||0,32);
    o.kb=(o.kb||0)*(1+p.up.kb);
  }
  var b=new G.Bullet(o);
  this.bullets.push(b);
  return b;
};
Game.prototype.solidAt = function(x,y){ return Dn.solidAt(this.map,x,y); };
Game.prototype.bulletSolidAt = function(x,y){ return Dn.bulletSolidAt(this.map,x,y); };
Game.prototype.los = function(x1,y1,x2,y2){ return Dn.los(this.map,x1,y1,x2,y2); };
Game.prototype.screenToWorld = function(cx,cy){
  var r=this.canvas.getBoundingClientRect();
  var lx=(cx-r.left)/Math.max(1,r.width)*LW;
  var ly=(cy-r.top)/Math.max(1,r.height)*LH;
  return {x:lx+this.cam.x, y:ly+this.cam.y};
};
Game.prototype.worldToScreen = function(wx,wy){
  var r=this.canvas.getBoundingClientRect();
  return { x:r.left + (wx-(this.drawCamX===undefined?this.cam.x:this.drawCamX))/LW*r.width,
           y:r.top  + (wy-(this.drawCamY===undefined?this.cam.y:this.drawCamY))/LH*r.height };
};
Game.prototype.enemiesInRadius = function(x,y,r){
  var out=[];
  for(var i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];
    if(e.dead||e.team==='ally'||e.spawnT>0) continue;
    if(U.dist(x,y,e.x,e.y)<r+e.r) out.push(e);
  }
  return out;
};
Game.prototype.nearestEnemy = function(x,y,maxR){
  var best=null, bd=maxR||1e9;
  for(var i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];
    if(e.dead||e.team==='ally') continue;
    var d=U.dist(x,y,e.x,e.y);
    if(d<bd){ bd=d; best=e; }
  }
  return best;
};
Game.prototype.nearestEnemyTo = Game.prototype.nearestEnemy;
Game.prototype.mostHurtEnemy = function(self){
  var best=null, bv=1;
  for(var i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];
    if(e.dead||e===self||e.team==='ally') continue;
    var v=e.hp/e.maxHp;
    if(v<bv){ bv=v; best=e; }
  }
  return best;
};
Game.prototype.countEnemiesOfKind = function(id){
  var n=0;
  for(var i=0;i<this.enemies.length;i++) if(!this.enemies[i].dead && this.enemies[i].id===id) n++;
  return n;
};
Game.prototype.spawnEnemy = function(id,x,y,opts){
  opts=opts||{};
  if(!En.defs[id]) return null;
  if(opts.hpScale===undefined){
    var D=G.diff(this);
    opts.hpScale=(1+(this.floorNum-1)*0.34)*(1+this.loop*0.9)*D.hp;
    opts.dmgScale=(1+(this.floorNum-1)*0.2)*(1+this.loop*0.9)*D.dmg;
  }
  var e=new G.Enemy(id,x,y,this,opts);
  if(opts.team!=='ally') e.homeRoom = opts.room || this.curRoom;
  this.enemies.push(e);
  if(opts.spawnFx) this.burst(x,y,10,{color:e.def.look.c3||e.def.look.c1,spd:110,life:0.5});
  return e;
};
Game.prototype.summonAlly = function(id,x,y,dur){
  var e=this.spawnEnemy(id==='turret_ally'?'flame_turret':(id==='skeleton'?'skeleton_ally':id), x,y,
    {team:'ally', life:dur||15, spawnFx:true, hpScale:1.6, dmgScale:1});
  if(e){ e.team='ally'; e.life=dur||15; }
  return e;
};
Game.prototype.damageEnemy = function(e,dmg,o){
  o=o||{};
  if(!e||e.dead) return;
  if(e.iframe>0) return;
  if(e.vuln>0) dmg*=1.35;
  dmg=Math.max(1,dmg);
  e.hp-=dmg; e.flash=1;
  this.stats.dmg+=dmg;
  if(o.burn){ e.burnT=Math.max(e.burnT,o.burn); e.burnDmg=Math.max(e.burnDmg||0,dmg*0.2); }
  if(o.kb && !e.boss){
    var a=o.ang===undefined?0:o.ang;
    e.vx+=Math.cos(a)*o.kb; e.vy+=Math.sin(a)*o.kb;
  }
  if(!o.silent){
    this.float((o.crit?'':'')+Math.round(dmg), e.x+U.rand(-6,6), e.y-e.r-4,
      o.crit?'#ffd45e':(o.color||'#ffffff'), o.crit?17:12);
    if(o.crit){ G.Audio.sfx.crit(); this.hitStop(0.035); this.shake(2.5); }
    else G.Audio.sfx.hit();
    this.burst(e.x,e.y,o.crit?9:4,{color:o.color||e.def.look.c1,spd:110,life:0.3,r:2.5});
  }
  var p=this.player;
  if(p && p.up.vamp>0) p.heal(dmg*p.up.vamp);
  if(p && p.buffs.vamp) p.heal(dmg*p.buffs.vamp.v);
  if(e.hp<=0) e.die(this);
};
Game.prototype.explode = function(x,y,r,dmg,color,team){
  color=color||'#ff9a4a';
  this.fx.push(makeFx('boom',{x:x,y:y,r:r,color:color,life:0.42}));
  this.burst(x,y,Math.min(40,14+r*0.3),{color:color,spd:r*3.2,life:0.6,r:4});
  this.shake(Math.min(12,r*0.09));
  G.Audio.sfx.explode();
  if(team==='enemy'){
    var p=this.player;
    if(p&&!p.dead&&U.dist(p.x,p.y,x,y)<r) p.hurt(dmg,this,null);
  } else {
    var list=this.enemiesInRadius(x,y,r);
    for(var i=0;i<list.length;i++){
      var e=list[i];
      var f=1-U.clamp(U.dist(x,y,e.x,e.y)/r,0,1)*0.5;
      this.damageEnemy(e,dmg*f,{kb:120,ang:U.ang(x,y,e.x,e.y),color:color});
    }
  }
  for(var pi=0;pi<this.props.length;pi++){
    var pr=this.props[pi];
    if(pr.breakable&&!pr.dead&&U.dist(pr.x,pr.y,x,y)<r) this.hitProp(pr,dmg);
  }
};
Game.prototype.zone = function(x,y,r,dur,type,dmg,color,team){
  this.zones.push(new G.Zone(x,y,r,dur,type,dmg,color,team));
};
Game.prototype.beam = function(x,y,ang,len,dmg,o){
  o=o||{};
  var dx=Math.cos(ang), dy=Math.sin(ang);
  var end=len;
  for(var s=8;s<len;s+=8){
    if(this.bulletSolidAt(x+dx*s,y+dy*s)){ end=s; break; }
  }
  this.fx.push(makeFx('beam',{x1:x,y1:y,x2:x+dx*end,y2:y+dy*end,color:o.color||'#8ef0ff',
    width:o.width||8,life:o.dur||0.25}));
  if(o.team==='enemy'){
    var p=this.player;
    if(p&&!p.dead){
      var pd=pointLineDist(p.x,p.y,x,y,x+dx*end,y+dy*end);
      if(pd<p.r+(o.width||8)*0.5) p.hurt(dmg,this,null);
    }
  } else {
    for(var i=0;i<this.enemies.length;i++){
      var e=this.enemies[i];
      if(e.dead||e.team==='ally') continue;
      var d=pointLineDist(e.x,e.y,x,y,x+dx*end,y+dy*end);
      if(d<e.r+(o.width||8)*0.5){
        this.damageEnemy(e,dmg,{kb:60,ang:ang,color:o.color});
        if(o.stun) e.stun=Math.max(e.stun||0,o.stun);
      }
    }
  }
  this.shake(3);
};
Game.prototype.laserBeam = function(x,y,ang,width,dps,o,dt){
  o=o||{};
  var dx=Math.cos(ang), dy=Math.sin(ang);
  var end=600;
  for(var s=8;s<end;s+=8){
    if(this.bulletSolidAt(x+dx*s,y+dy*s)){ end=s; break; }
  }
  this.fx.push(makeFx('beam',{x1:x,y1:y,x2:x+dx*end,y2:y+dy*end,color:o.color||'#ff5b6e',width:width,life:0.08}));
  /* 每 0.1s 对光束路径上的敌人造成伤害 */
  this.laserAcc=(this.laserAcc||0)+(dt||0.016);
  if(this.laserAcc>=0.1-1e-6){
    this.laserAcc-=0.1;
    for(var i=0;i<this.enemies.length;i++){
      var e=this.enemies[i];
      if(e.dead||e.team==='ally') continue;
      var d=pointLineDist(e.x,e.y,x,y,x+dx*end,y+dy*end);
      if(d<e.r+width*0.5){
        this.damageEnemy(e, dps*0.1, {color:o.color, from:this.player});
      }
    }
  }
};
Game.prototype.beamFx = function(x1,y1,x2,y2,color,dur){
  this.fx.push(makeFx('beam',{x1:x1,y1:y1,x2:x2,y2:y2,color:color,width:3,life:dur||0.25}));
};
Game.prototype.chainLightning = function(from,dmg,jumps,color){
  var cur=from, hit=[from];
  for(var j=0;j<jumps;j++){
    var best=null,bd=140;
    for(var i=0;i<this.enemies.length;i++){
      var e=this.enemies[i];
      if(e.dead||e.team==='ally'||hit.indexOf(e)>=0) continue;
      var d=U.dist(cur.x,cur.y,e.x,e.y);
      if(d<bd){ bd=d; best=e; }
    }
    if(!best) break;
    this.fx.push(makeFx('lightning',{x1:cur.x,y1:cur.y,x2:best.x,y2:best.y,color:color||'#a8d8ff',life:0.2}));
    this.damageEnemy(best,dmg,{color:color||'#a8d8ff'});
    hit.push(best); cur=best;
  }
};
Game.prototype.lightningStrike = function(x,y,dmg,color){
  this.fx.push(makeFx('bolt',{x:x,y:y,color:color||'#a8d8ff',life:0.34}));
  var list=this.enemiesInRadius(x,y,44);
  for(var i=0;i<list.length;i++) this.damageEnemy(list[i],dmg,{color:color,kb:60,ang:U.rand(0,TAU)});
  this.burst(x,y,14,{color:color||'#a8d8ff',spd:180,life:0.4});
  this.shake(3);
};
Game.prototype.skyStrike = function(x,y,dmg,color,kind,aoe){
  var self=this;
  aoe=aoe||44;
  this.fx.push(makeFx('marker',{x:x,y:y,r:aoe,color:color||'#ff7a3c',life:0.62,kind:kind}));
  this.delayed(0.62,function(){
    if(kind==='spike'){
      self.fx.push(makeFx('spike',{x:x,y:y,r:aoe,color:color,life:0.4}));
      var l=self.enemiesInRadius(x,y,aoe);
      if(self.player && U.dist(self.player.x,self.player.y,x,y)<aoe) self.player.hurt(dmg,self,null);
      self.shake(5);
    } else {
      self.explode(x,y,aoe,dmg,color,'enemy');
    }
  });
};
Game.prototype.meteor = function(x,y,dmg,r,color){
  var self=this;
  this.fx.push(makeFx('meteor',{x:x,y:y,r:r,color:color||'#ff7a3c',life:0.7}));
  this.delayed(0.7,function(){ self.explode(x,y,r,dmg,color||'#ff7a3c','player'); });
};
Game.prototype.blackhole = function(x,y,r,dur,dmg,team){
  this.fx.push(makeFx('hole',{x:x,y:y,r:r,life:dur,dmg:dmg,team:team||'player',color:'#c07aff'}));
  G.Audio.sfx.plasma();
};
Game.prototype.rift = function(x,y,dur,dmg){
  this.fx.push(makeFx('rift',{x:x,y:y,life:dur,dmg:dmg,color:'#d07aff'}));
};
Game.prototype.boomerang = function(p,ang,dmg,color){
  this.fx.push(makeFx('boomer',{x:p.x,y:p.y,ang:ang,dmg:dmg,color:color||'#8ef0ff',life:2.2,owner:p}));
  G.Audio.sfx.sword();
};
Game.prototype.healPlayer = function(v){
  this.player.heal(v);
  this.float('+'+Math.round(v),this.player.x,this.player.y-26,'#7dffb0');
  this.burst(this.player.x,this.player.y,16,{color:'#7dffb0',spd:120,life:0.6});
};
Game.prototype.hitProp = function(p,dmg){
  if(!p.breakable||p.dead) return;
  p.hp-=dmg; p.hit=1;
  this.burst(p.x,p.y,4,{color:'#c8a878',spd:80,life:0.3,r:2.5,glow:0});
  if(p.hp<=0){
    p.dead=true;
    this.burst(p.x,p.y,14,{color:'#c8a878',spd:150,life:0.5,r:3,glow:0});
    G.Audio.sfx.hit();
    if(p.explosive){ this.explode(p.x,p.y,72,26,'#ff9a4a','player'); }
    if(p.gold){ for(var gc=0;gc<U.randi(4,8);gc++) this.dropPickup(p.x+U.rand(-8,8),p.y+U.rand(-8,8),'coin',U.randi(2,5)); }
    if(Math.random()<0.42) this.dropPickup(p.x,p.y,'coin',U.randi(1,4));
    if(Math.random()<0.1) this.dropPickup(p.x,p.y,'heart',12);
    if(Math.random()<0.1) this.dropPickup(p.x,p.y,'energy',10);
  }
};
Game.prototype.dropPickup = function(x,y,kind,val){
  this.pickups.push(new G.Pickup(x,y,kind,val,this));
};
Game.prototype.collect = function(pu){
  var p=this.player;
  pu.dead=true;
  if(pu.kind==='coin'){ var v=Math.round(pu.val*(1+p.up.gold)); p.coins+=v; this.stats.coins+=v; G.Audio.sfx.coin(); }
  else if(pu.kind==='heart'){ p.heal(pu.val); G.Audio.sfx.heal(); this.float('+'+pu.val,p.x,p.y-24,'#ff8a9a'); }
  else if(pu.kind==='energy'){ p.energy=Math.min(p.maxEnergy,p.energy+pu.val); G.Audio.sfx.pickup(); }
  else if(pu.kind==='armor'){ p.armor=Math.min(p.maxArmor,p.armor+pu.val); G.Audio.sfx.pickup(); }
  else if(pu.kind==='key'){ p.keys++; G.Audio.sfx.unlock(); }
};
Game.prototype.onEnemyKilled = function(e){
  this.stats.kills++;
  if(G.Lobby) G.Lobby.addProgress('kill', 1);
  this.player.kills++;
  var cw=this.player.wpn();
  if(cw && cw.trait==='killCharge'){
    this.player.energy=Math.min(this.player.maxEnergy,this.player.energy+7);
    this.player.addBuff('haste',1.6,1.18);
    this.burst(this.player.x,this.player.y,6,{color:'#8ef0ff',spd:110,life:0.35});
  }
  if(cw && cw.trait==='harvest'){
    this.player.heal(8);
    this.float('+8',this.player.x,this.player.y-28,'#7dffb0');
  }
  var D=G.diff(this);
  var n=Math.max(1,Math.round(e.def.coins*(0.6+Math.random()*0.8)*D.gold));
  for(var i=0;i<Math.min(8,n);i++) this.dropPickup(e.x+U.rand(-10,10),e.y+U.rand(-10,10),'coin',Math.ceil(n/Math.min(8,n)));
  if(Math.random()<0.06+this.player.up.luck*0.03) this.dropPickup(e.x,e.y,'heart',14);
  if(Math.random()<0.09) this.dropPickup(e.x,e.y,'energy',10);
  if(e.elite && Math.random()<0.5) this.addChest(e.x,e.y,3);
  this.player.energy=Math.min(this.player.maxEnergy,this.player.energy+1.5);
};

/* ================= 特效对象 ================= */
function pointLineDist(px,py,x1,y1,x2,y2){
  var dx=x2-x1, dy=y2-y1, L=dx*dx+dy*dy;
  if(L<0.001) return U.dist(px,py,x1,y1);
  var t=U.clamp(((px-x1)*dx+(py-y1)*dy)/L,0,1);
  return U.dist(px,py,x1+dx*t,y1+dy*t);
}
function makeFx(type,o){
  o.type=type; o.t=0; o.maxLife=o.life; o.dead=false;
  o.update=function(dt,g){
    this.t+=dt; this.life-=dt;
    if(this.life<=0) this.dead=true;
    if(this.type==='hole'){
      var list=g.enemiesInRadius(this.x,this.y,this.r);
      for(var i=0;i<list.length;i++){
        var e=list[i];
        if(e.boss) continue;
        var a=U.ang(e.x,e.y,this.x,this.y);
        e.vx+=Math.cos(a)*420*dt; e.vy+=Math.sin(a)*420*dt;
      }
      this.tick=(this.tick||0)-dt;
      if(this.tick<=0){
        this.tick=0.3;
        if(this.team==='player'){
          var l2=g.enemiesInRadius(this.x,this.y,this.r*0.45);
          for(var j=0;j<l2.length;j++) g.damageEnemy(l2[j],this.dmg,{color:'#c07aff'});
        } else {
          var p=g.player;
          if(p&&U.dist(p.x,p.y,this.x,this.y)<this.r){
            var a2=U.ang(p.x,p.y,this.x,this.y);
            p.vx+=Math.cos(a2)*220; p.vy+=Math.sin(a2)*220;
            if(U.dist(p.x,p.y,this.x,this.y)<this.r*0.35) p.hurt(this.dmg,g,null);
          }
        }
      }
      if(Math.random()<dt*30){
        var ang=U.rand(0,TAU), d=this.r*U.rand(0.4,1);
        g.spawnParticle(this.x+Math.cos(ang)*d,this.y+Math.sin(ang)*d,
          {color:'#c07aff',life:0.4,r:3,spd:0,glow:1});
      }
    } else if(this.type==='rift'){
      this.tick=(this.tick||0)-dt;
      if(this.tick<=0){
        this.tick=0.14;
        var tgt=g.nearestEnemy(this.x,this.y,400);
        var a3=tgt?U.ang(this.x,this.y,tgt.x,tgt.y):U.rand(0,TAU);
        g.spawnBullet({x:this.x,y:this.y,ang:a3+U.rand(-0.3,0.3),spd:380,dmg:this.dmg,r:5,
          color:'#d07aff',shape:'orb',team:'player',life:1.6,pierce:1,homing:1.2});
      }
    } else if(this.type==='boomer'){
      var own=this.owner;
      var back=this.t>this.maxLife*0.42;
      if(!back){
        this.x+=Math.cos(this.ang)*380*dt;
        this.y+=Math.sin(this.ang)*380*dt;
        if(g.bulletSolidAt(this.x,this.y)){ this.ang+=Math.PI; }
      } else {
        var a4=U.ang(this.x,this.y,own.x,own.y);
        this.x+=Math.cos(a4)*440*dt; this.y+=Math.sin(a4)*440*dt;
        if(U.dist(this.x,this.y,own.x,own.y)<16) this.dead=true;
      }
      this.hits=this.hits||[];
      var hl=g.enemiesInRadius(this.x,this.y,12);
      for(var k=0;k<hl.length;k++){
        var he=hl[k];
        if(this.hits.indexOf(he)>=0) continue;
        this.hits.push(he);
        g.damageEnemy(he,this.dmg*g.player.dmgMult,{kb:90,ang:this.ang,from:own,
          crit:Math.random()<g.player.critChance});
        if(this.hits.length>3) this.hits.shift();
      }
      g.spawnParticle(this.x,this.y,{color:this.color,life:0.3,r:3,spd:0,glow:1});
    }
  };
  o.draw=function(ctx,t){
    var k=U.clamp(this.life/this.maxLife,0,1);
    ctx.save();
    if(this.type==='boom'){
      var rr=this.r*(1.05-k*0.55);
      var gr=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,rr);
      gr.addColorStop(0,U.alpha('#ffffff',k*0.9));
      gr.addColorStop(0.35,U.alpha(this.color,k*0.75));
      gr.addColorStop(1,U.alpha(this.color,0));
      ctx.fillStyle=gr;
      ctx.beginPath(); ctx.arc(this.x,this.y,rr,0,TAU); ctx.fill();
      ctx.strokeStyle=U.alpha('#ffffff',k*0.6); ctx.lineWidth=2.5*k;
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r*(1.15-k*0.35),0,TAU); ctx.stroke();
    } else if(this.type==='beam'){
      ctx.lineCap='round';
      ctx.strokeStyle=U.alpha(this.color,0.3*k); ctx.lineWidth=this.width*2.2;
      ctx.beginPath(); ctx.moveTo(this.x1,this.y1); ctx.lineTo(this.x2,this.y2); ctx.stroke();
      ctx.strokeStyle=U.alpha(this.color,0.85*k); ctx.lineWidth=this.width;
      ctx.beginPath(); ctx.moveTo(this.x1,this.y1); ctx.lineTo(this.x2,this.y2); ctx.stroke();
      ctx.strokeStyle=U.alpha('#ffffff',0.9*k); ctx.lineWidth=this.width*0.35;
      ctx.beginPath(); ctx.moveTo(this.x1,this.y1); ctx.lineTo(this.x2,this.y2); ctx.stroke();
      Art.glowDot(ctx,this.x2,this.y2,this.width*2.5,this.color,k*0.7);
      ctx.lineCap='butt';
    } else if(this.type==='lightning'){
      ctx.strokeStyle=U.alpha(this.color,k); ctx.lineWidth=2.2;
      ctx.beginPath();
      var n=6;
      ctx.moveTo(this.x1,this.y1);
      for(var i=1;i<n;i++){
        var f=i/n;
        ctx.lineTo(U.lerp(this.x1,this.x2,f)+U.rand(-7,7), U.lerp(this.y1,this.y2,f)+U.rand(-7,7));
      }
      ctx.lineTo(this.x2,this.y2); ctx.stroke();
    } else if(this.type==='bolt'){
      ctx.strokeStyle=U.alpha(this.color,k); ctx.lineWidth=3.4;
      ctx.beginPath();
      ctx.moveTo(this.x+U.rand(-4,4),this.y-200);
      for(var j=1;j<7;j++) ctx.lineTo(this.x+U.rand(-12,12), this.y-200+j*(200/7));
      ctx.lineTo(this.x,this.y); ctx.stroke();
      Art.glowDot(ctx,this.x,this.y,44*k,this.color,0.7);
    } else if(this.type==='marker'){
      var pr=1-k;
      ctx.strokeStyle=U.alpha(this.color,0.85);
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(this.x,this.y,this.r,this.r*0.55,0,0,TAU); ctx.stroke();
      ctx.fillStyle=U.alpha(this.color,0.2+pr*0.25);
      ctx.beginPath(); ctx.ellipse(this.x,this.y,this.r*pr,this.r*0.55*pr,0,0,TAU); ctx.fill();
    } else if(this.type==='meteor'){
      var fall=1-k;
      var my=this.y-260*(1-fall);
      Art.glowDot(ctx,this.x,my,26,this.color,0.7);
      ctx.fillStyle=this.color;
      ctx.beginPath(); ctx.arc(this.x,my,9,0,TAU); ctx.fill();
      ctx.strokeStyle=U.alpha(this.color,0.5); ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(this.x,my-40); ctx.lineTo(this.x,my); ctx.stroke();
      ctx.strokeStyle=U.alpha(this.color,0.8); ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(this.x,this.y,this.r*0.7,this.r*0.4,0,0,TAU); ctx.stroke();
    } else if(this.type==='spike'){
      ctx.fillStyle=U.alpha(this.color||'#8fc06a',0.9*k);
      for(var s=0;s<7;s++){
        var a=s/7*TAU+this.x, d=this.r*0.5;
        ctx.beginPath();
        ctx.moveTo(this.x+Math.cos(a)*d,this.y+Math.sin(a)*d*0.6);
        ctx.lineTo(this.x+Math.cos(a)*d*0.6,this.y+Math.sin(a)*d*0.35-26*(1-k*0.4));
        ctx.lineTo(this.x+Math.cos(a)*d*1.35,this.y+Math.sin(a)*d*0.8);
        ctx.closePath(); ctx.fill();
      }
    } else if(this.type==='hole'){
      var pulse=0.9+Math.sin(t*8)*0.1;
      var gr2=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r);
      gr2.addColorStop(0,'rgba(0,0,0,0.95)');
      gr2.addColorStop(0.3,U.alpha('#5a2a8a',0.7));
      gr2.addColorStop(1,U.alpha('#c07aff',0));
      ctx.fillStyle=gr2;
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r*pulse,0,TAU); ctx.fill();
      ctx.strokeStyle=U.alpha('#c07aff',0.7);
      ctx.lineWidth=2;
      for(var q=0;q<3;q++){
        ctx.beginPath();
        ctx.ellipse(this.x,this.y,this.r*(0.3+q*0.22),this.r*(0.12+q*0.1),t*(1+q),0,TAU);
        ctx.stroke();
      }
    } else if(this.type==='rift'){
      Art.glowDot(ctx,this.x,this.y,50,this.color,0.5);
      ctx.strokeStyle=U.alpha(this.color,0.8); ctx.lineWidth=3;
      ctx.beginPath();
      ctx.ellipse(this.x,this.y,10,34,Math.sin(t*2)*0.4,0,TAU); ctx.stroke();
      ctx.fillStyle=U.alpha('#200a30',0.8);
      ctx.beginPath(); ctx.ellipse(this.x,this.y,8,30,Math.sin(t*2)*0.4,0,TAU); ctx.fill();
    } else if(this.type==='boomer'){
      ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(t*18);
      Art.glowDot(ctx,0,0,16,this.color,0.5);
      ctx.strokeStyle=this.color; ctx.lineWidth=3.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-6,6); ctx.quadraticCurveTo(2,-6,10,4); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };
  return o;
}
G.makeFx = makeFx;
})();
