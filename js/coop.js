/* Cooperative gameplay adapter. Connection backends remain replaceable. */
(function(){
'use strict';
var G=window.G, N=G.Net, P=G.Game.prototype, U=G.U;
var denied={owner:1,burnOwner:1,poisonOwner:1,target:1,lastOwner:1,homeRoom:1,room:1,g:1,game:1,def:1,hero:1,netInput:1,hits:1,dashHitSet:1,weapons:1,picked:1,act:1,__proto__:1,constructor:1,prototype:1};
function clean(v,depth){
  if(v===null || typeof v==='string' || typeof v==='boolean') return v;
  if(typeof v==='number') return isFinite(v)?v:0;
  if(!v || typeof v!=='object' || depth<=0) return undefined;
  if(Array.isArray(v)) return v.slice(0,10000).map(function(x){return clean(x,depth-1);});
  var out={}; Object.keys(v).forEach(function(k){if(!denied[k]){var x=clean(v[k],depth-1);if(x!==undefined)out[k]=x;}}); return out;
}
function record(o){return clean(o,4);}
function assign(to,values){ Object.keys(values||{}).forEach(function(k){if(!denied[k])to[k]=values[k];}); return to; }
function identify(g,o,kind){if(!o.netEntityId)o.netEntityId=kind+'-'+(g.netCounter=(g.netCounter||0)+1);return o.netEntityId;}
function weapon(w){
  var out={id:w.id};
  for(var k in w){if(denied[k])continue;if(w[k]===undefined){out[k]=null;continue;}var v=clean(w[k],4);if(v!==undefined)out[k]=v;}
  return out;
}
function restoreWeapon(w){
  var base=G.Weapons.get(w.id); if(!base)return null;
  var inst=Object.create(base); assign(inst,w);
  if(w.skill)inst.skill=Object.assign({},base.skill,w.skill);
  return inst;
}
function player(p){
  var v=record(p); v.hero=p.hero.id; v.netId=p.netId||0;
  v.weapons=p.weapons.map(weapon); v.picked=p.picked.map(function(b){return b.id;});return v;
}
function applyPlayer(p,v,local){
  var aim=p.aim,face=p.face;
  assign(p,v);
  p.weapons=(v.weapons||[]).map(restoreWeapon).filter(Boolean);
  p.picked=(v.picked||[]).map(function(id){return G.Buffs.find(function(b){return b.id===id;});}).filter(Boolean);
  if(local){p.aim=aim;p.face=face;}
}
function entities(g,list,kind){return list.filter(function(o){return !o.dead;}).map(function(o){var v=record(o);v.netEntityId=identify(g,o,kind);return v;});}
function reconcile(old,values,factory){
  var byId={}; old.forEach(function(o){if(o.netEntityId)byId[o.netEntityId]=o;});
  return (values||[]).map(function(v){var o=byId[v.netEntityId]||factory(v);return o?assign(o,v):null;}).filter(Boolean);
}
N.worldTick=0; N.lastWorldTick=-1; N.actionSeq=0;
N.buildSnap=function(g){
  var host=g.actingPlayer?g.localPlayer:g.player;
  var e=entities(g,g.enemies,'enemy'), b=entities(g,g.bullets,'bullet');
  var pickups=entities(g,g.pickups,'pickup');
  g.pickups.filter(function(p){return !p.dead;}).forEach(function(p,i){if(p.kind==='weapon')pickups[i].weapon=weapon(p.def);});
  var inter=g.inter.map(function(it){var v=record(it);v.netEntityId=identify(g,it,'inter');if(it.def)v.weapon=weapon(it.def);return v;});
  var s={t:'snap',tick:++N.worldTick,seed:g.map.seed,floor:g.floorNum,stage:g.state,paused:!!g.panelOpen,
    p:[player(host)].concat(g.guest?[player(g.guest)]:[]),e:e,b:b,pickups:pickups,inter:inter,
    props:entities(g,g.props,'prop'),zones:entities(g,g.zones,'zone'),parts:entities(g,g.parts.slice(-120),'particle'),fx:entities(g,g.fx,'fx'),floats:g.floats.map(record),
    stats:record(g.stats),d:g.map.doors.map(function(d){return d.open?1:0;}),
    r:g.map.rooms.map(function(r){return (r.visited?1:0)|(r.cleared?2:0)|(r.active?4:0);}),
    po:g.portal?record(g.portal):null,boss:g.bossActive?identify(g,g.bossActive,'enemy'):null,
    offer:g.upgradeOffer||null};
  return s;
};
N.applySnap=function(g){
  var s=N.snap;if(!s||!g.map||s.seed!==g.map.seed||s.tick===N.appliedWorldTick)return;
  N.appliedWorldTick=s.tick;
  var local=N.localIndex||0,remote=local===1?0:1;
  if(s.p&&s.p[local])applyPlayer(g.player,s.p[local],true);
  if(s.p&&s.p[remote]){
    if(!g.guest)g.guest=new G.Player(G.Heroes.find(function(h){return h.id===s.p[remote].hero;})||G.Heroes[0],g);
    applyPlayer(g.guest,s.p[remote],false);
  }
  g.players=g.guest?[g.player,g.guest]:[g.player];
  g.enemies=reconcile(g.enemies,s.e,function(v){var e=g.spawnEnemy(v.id,v.x,v.y,{});if(e)e.spawnT=0;return e;});
  g.bullets=reconcile(g.bullets,s.b,function(v){return new G.Bullet(v);});
  g.bullets.forEach(function(b){b.owner=g.players.find(function(p){return p.netId===b.ownerId;})||null;});
  g.pickups=reconcile(g.pickups,s.pickups,function(v){return new G.Pickup(v.x,v.y,v.kind,v.kind==='weapon'?restoreWeapon(v.weapon):v.val,g);});
  g.pickups.forEach(function(p,i){if(s.pickups[i].weapon)p.def=restoreWeapon(s.pickups[i].weapon);});
  g.inter=(s.inter||[]).map(function(v){var it=assign({},v);if(v.weapon)it.def=restoreWeapon(v.weapon);return it;});
  g.props=(s.props||[]).map(function(v){return assign({},v);});
  g.zones=reconcile(g.zones,s.zones,function(v){return new G.Zone(v.x,v.y,v.r,v.life,v.type,v.dmg,v.color,v.team);});
  g.parts=reconcile(g.parts,s.parts,function(v){return new G.Particle(v.x,v.y,v);});
  g.fx=reconcile(g.fx,s.fx,function(v){var fx=G.makeFx(v.type,Object.assign({},v));fx.update=function(dt){this.t+=dt;this.life-=dt;this.dead=this.life<=0;};return fx;});
  g.floats=s.floats||[];
  g.map.doors.forEach(function(d,i){d.open=!!s.d[i];});
  g.map.rooms.forEach(function(r,i){var f=s.r[i]||0;r.visited=!!(f&1);r.cleared=!!(f&2);r.active=!!(f&4);});
  g.portal=s.po;g.bossActive=g.enemies.find(function(e){return e.netEntityId===s.boss;})||null;
  g.stats=s.stats||g.stats;
  var before=g.state;
  if(s.stage)g.state=s.stage;
  if(s.offer && s.offer.id!==g.netUpgradeShown){
    g.upgradeOffer=s.offer;g.netUpgradeShown=s.offer.id;
    if(g.onUpgrade)g.onUpgrade(s.offer.picks.map(function(id){return G.Buffs.find(function(b){return b.id===id;});}).filter(Boolean));
  }
  if(before!==g.state && g.onCoopState)g.onCoopState(g.state,before);
};
var oldFloor=N.applyFloor;
N.applyFloor=function(g,data){
  var fresh=!g.map,before=g.state;N.snap=null;N.lastWorldTick=-1;N.appliedWorldTick=-1;g.difficulty=data.difficulty||0;
  if(!g.guest){g.guest=new G.Player(G.Heroes.find(function(h){return h.id===data.hostHero;})||G.Heroes[0],g);g.guest.netId=0;}
  oldFloor(g,data);g.players=[g.player,g.guest];
  if(g.onCoopState)g.onCoopState('playing',before);
  if(fresh&&N.onReady)N.onReady({role:'client',phase:'playing'});
};
var oldPayload=N.floorPayload;
N.floorPayload=function(g){var value=oldPayload(g);if(value)value.difficulty=g.difficulty||0;return value;};
N.hostUpdate=function(g,dt){
  if(!N.conn||!N.conn.open||!g)return;
  N.snapT+=dt;if(N.snapT<N.snapInterval)return;N.snapT=0;
  if(g.state==='lobby'){
    N.send({t:'lobby',x:g.player.x,y:g.player.y,aim:g.player.aim,face:g.player.face,
      hero:G.Heroes[g.lobbyHeroIdx||0].id,guest:g.guest?player(g.guest):null});return;
  }
  if(g.map)N.send(N.buildSnap(g));
};
var oldInput=N.applyNetInput;
N.applyNetInput=function(p,data){
  if(!p||!data)return;
  if(data.seq!==undefined){if(!Number.isSafeInteger(data.seq)||data.seq<0||data.seq<=(p.lastInputSeq===undefined?-1:p.lastInputSeq))return;p.lastInputSeq=data.seq;}
  data=Object.assign({},data,{mvx:U.clamp(Number(data.mvx)||0,-1,1),mvy:U.clamp(Number(data.mvy)||0,-1,1),aim:Number(data.aim)||0});
  oldInput(p,data);p.lastInputAt=Date.now();
};
N.EDGE_KEYS=N.EDGE_KEYS.concat(['f','l','shiftleft','shiftright']);
var oldData=N.onData;
N.onData=function(g,data){
  if(!data||typeof data!=='object')return;
  var allowed=N.state==='host'?['hello','input','command','hero','ping','pong']:['joined','welcome','floor','snap','panel','over','lobby','toast','reject','ping','pong'];
  if(allowed.indexOf(data.t)<0)return;
  if(data.t==='snap'&&data.tick!==undefined){
    if(!Number.isSafeInteger(data.tick)||data.tick<=N.lastWorldTick||!g.map||data.seed!==g.map.seed)return;
    N.lastWorldTick=data.tick;N.snap=data;N.lastRecv=Date.now();return;
  }
  if(data.t==='command' && N.state==='host'){handleCommand(g,data);return;}
  if(data.t==='panel'&&N.state==='client'){
    if(data.snap){N.snap=data.snap;N.applySnap(g);}
    var fn=g['on'+data.kind];if(fn)fn();return;
  }
  if(data.t==='hero'&&N.state==='host'&&g.state==='lobby'){
    if(G.Heroes.some(function(h){return h.id===data.hero;})){N.createGuest(g,data.hero);N.guestHero=data.hero;}return;
  }
  if(data.t==='over'&&N.state==='client'&&g.state!=='win'&&g.state!=='dead'){
    g.state=data.state||'dead';if(data.stats)g.stats=data.stats;
    if(g.state==='win'){if(g.onWin)g.onWin();}else if(g.onGameOver)g.onGameOver();return;
  }
  oldData(g,data);
  if(data.t==='joined'&&N.state==='client'){
    g.netMode='client';N.onReady&&N.onReady({role:'client',phase:'lobby'});
  }
  if(data.t==='lobby'&&N.state==='client'){
    if(data.guest)applyPlayer(g.player,data.guest,true);
    if(data.hero && g.guest && g.guest.hero.id!==data.hero)g.guest.hero=G.Heroes.find(function(h){return h.id===data.hero;})||g.guest.hero;
  }
};
function command(name,args){N.send({t:'command',id:++N.actionSeq,name:name,args:args});return true;}
var panelKinds={fuseWeapons:'forge',scrapWeapon:'recycle',disassembleWeapon:'disassembler',installModulesTo:'disassembler',buyPart:'gunsmith',detachPart:'gunsmith'};
function handleCommand(g,data){
  var p=g.guest;if(!p||!Number.isSafeInteger(data.id)||data.id<=0||data.id<=(p.lastCommandId||0))return;
  p.lastCommandId=data.id;
  var args=data.args||[];
  if(!Array.isArray(args)||args.length>3)return;
  if(data.name==='buff'){
    var offer=g.upgradeOffer,buff=G.Buffs.find(function(b){return b.id===args[0];});
    if(offer&&offer.id===args[1]&&offer.picks.indexOf(args[0])>=0&&buff)g.chooseCoopBuff(p,buff);return;
  }
  var kind=panelKinds[data.name];
  if(!kind||g.state!=='playing'||p.dead)return;
  if(!g.inter.some(function(it){return it.kind===kind&&U.dist(it.x,it.y,p.x,p.y)<50;}))return;
  if(args.some(function(a){return typeof a!=='string'&&(!Number.isSafeInteger(a)||a<0||a>20);}))return;
  if(data.name==='buyPart'&&!g.inter.some(function(it){return it.kind==='gunsmith'&&U.dist(it.x,it.y,p.x,p.y)<50&&it.parts&&it.parts.indexOf(args[1])>=0;}))return;
  g.withPlayer(p,function(){g[data.name].apply(g,args);});
  N.send({t:'panel',kind:kind==='forge'?'Forge':kind==='recycle'?'Recycle':kind==='gunsmith'?'Gunsmith':'Disasm',snap:N.buildSnap(g)});
}
Object.keys(panelKinds).forEach(function(name){
  if(!P[name])return;var old=P[name];P[name]=function(){if(this.netMode==='client')return command(name,Array.prototype.slice.call(arguments));return old.apply(this,arguments);};
});
P.buyPart=function(index,id){
  if(this.netMode==='client')return command('buyPart',[index,id]);
  var p=this.player,w=p.weapons[index],part=G.Weapons.partInfo(id);
  if(!w||!part||p.coins<part.price||!G.Weapons.attachPart(w,id))return false;p.coins-=part.price;return true;
};
P.detachPart=function(index,id){
  if(this.netMode==='client')return command('detachPart',[index,id]);
  var w=this.player.weapons[index];return !!w&&G.Weapons.detachPart(w,id);
};
var oldInteract=P.updateInteract;
P.updateInteract=function(dt){
  if(this.netMode==='client')return;
  var remote=this.actingPlayer && this.actingPlayer.netId===1;
  if(!remote)return oldInteract.call(this,dt);
  var self=this,callbacks={};
  ['Forge','Recycle','Disasm','Gunsmith'].forEach(function(kind){callbacks[kind]=self['on'+kind];self['on'+kind]=function(){N.send({t:'panel',kind:kind,snap:N.buildSnap(self)});};});
  try{return oldInteract.call(this,dt);}finally{Object.keys(callbacks).forEach(function(kind){self['on'+kind]=callbacks[kind];});}
};
var oldUpgrade=P.showUpgrade, oldBuff=P.applyBuff;
P.showUpgrade=function(){
  if(this.netMode!=='host'||!this.guest)return oldUpgrade.call(this);
  var picks=G.Buffs.slice();U.shuffle(picks);
  this.upgradeOffer={id:++N.worldTick,picks:picks.slice(0,3).map(function(b){return b.id;})};this.upgradeChoices={};this.state='upgrade';
  if(this.onUpgrade)this.onUpgrade(picks.slice(0,3));
  N.send(N.buildSnap(this));
};
P.chooseCoopBuff=function(p,b){
  if(!this.upgradeOffer||this.upgradeChoices[p.netId])return false;
  b.fn(p);p.picked.push(b);this.upgradeChoices[p.netId]=b.id;
  var self=this;
  if(this.players.every(function(p){return p.dead||self.upgradeChoices[p.netId];})){this.state='playing';this.upgradeOffer=null;}
  N.send(N.buildSnap(this));return true;
};
P.applyBuff=function(b){
  if(this.netMode==='client'){if(this.upgradeOffer)command('buff',[b.id,this.upgradeOffer.id]);return;}
  if(this.netMode==='host'&&this.upgradeOffer)return this.chooseCoopBuff(this.player,b);
  return oldBuff.call(this,b);
};
var oldNext=P.nextFloor;
P.nextFloor=function(){var self=this;if(this.actingPlayer&&this.player!==this.localPlayer)return this.withPlayer(this.localPlayer,function(){return self.nextFloor();});var value=oldNext.call(this);if(this.netMode==='host'&&this.state==='win')N.send({t:'over',state:'win',stats:this.stats});return value;};
var oldRooms=P.updateRooms;
var oldActivate=P.activateRoom;
P.activateRoom=function(r){
  if(this.netMode==='host')this.livingPlayers().forEach(function(p){if(p.x<r.wx||p.x>r.wx+r.ww||p.y<r.wy||p.y>r.wy+r.wh){p.x=r.cx;p.y=r.cy;p.vx=p.vy=0;}});
  return oldActivate.call(this,r);
};
P.updateRooms=function(dt){
  if(this.netMode!=='host'||!this.guest)return oldRooms.call(this,dt);
  var self=this,active=this.map.rooms.find(function(r){return r.active&&!r.cleared;});
  if(active){this.curRoom=active;var actor=this.livingPlayers()[0];if(actor)return this.withPlayer(actor,function(){oldRooms.call(self,dt);});return;}
  this.livingPlayers().some(function(p){self.withPlayer(p,function(){oldRooms.call(self,dt);});return self.map.rooms.some(function(r){return r.active&&!r.cleared;});});
};
/* A frozen network stream must not keep a movement/fire button held forever. */
var oldUpdate=P.update;
P.update=function(dt){
  var p=this.guest;
  if(this.netMode==='host'&&p&&p.netInput&&p.lastInputAt&&Date.now()-p.lastInputAt>500){p.netInput.mvx=p.netInput.mvy=0;p.netInput.down=p.netInput.rdown=false;p.netInput.keys={};p.netInput.end();}
  return oldUpdate.call(this,dt);
};
/* Preserve ownership through splash damage, chain hits, lingering effects and summons. */
['checkHit','kill'].forEach(function(name){var old=G.Bullet.prototype[name];G.Bullet.prototype[name]=function(g){var self=this,args=arguments;if(this.owner)return g.withPlayer(this.owner,function(){return old.apply(self,args);});return old.apply(this,args);};});
var oldDamage=P.damageEnemy;
P.damageEnemy=function(e,dmg,o){o=o||{};var owner=o.from||this.actingPlayer||this.player;if(o.burn)e.burnOwner=owner;return oldDamage.call(this,e,dmg,Object.assign({},o,{from:owner}));};
var oldZone=P.zone;
P.zone=function(){oldZone.apply(this,arguments);var z=this.zones[this.zones.length-1];z.owner=this.player;z.ownerId=this.player.netId;};
var oldZoneUpdate=G.Zone.prototype.update;
G.Zone.prototype.update=function(dt,g){var self=this;if(this.owner)return g.withPlayer(this.owner,function(){return oldZoneUpdate.call(self,dt,g);});return oldZoneUpdate.call(this,dt,g);};
var oldSummon=P.summonAlly;
P.summonAlly=function(){var e=oldSummon.apply(this,arguments);if(e){e.owner=this.player;e.ownerId=this.player.netId;}return e;};
var oldEnemyUpdate=G.Enemy.prototype.update;
G.Enemy.prototype.update=function(dt,g){var self=this;if(this.team==='ally'&&this.owner)return g.withPlayer(this.owner,function(){return oldEnemyUpdate.call(self,dt,g);});return oldEnemyUpdate.call(this,dt,g);};
['blackhole','rift','boomerang'].forEach(function(name){var old=P[name];P[name]=function(){old.apply(this,arguments);var fx=this.fx[this.fx.length-1],owner=fx.owner||this.player,update=fx.update;fx.owner=owner;fx.ownerId=owner.netId;fx.update=function(dt,g){var self=this;return g.withPlayer(owner,function(){return update.call(self,dt,g);});};};});
var oldSave=G.Save.auto;
G.Save.auto=function(g){return g.netMode?false:oldSave(g);};
var oldClient=N.clientUpdate;
N.clientUpdate=function(g,dt){
  if(g.state==='lobby'){
    var hero=G.Heroes[g.lobbyHeroIdx||0].id;
    if(g.netLobbyHero!==undefined&&hero!==g.netLobbyHero)N.send({t:'hero',hero:hero});
    g.netLobbyHero=hero;
  }
  return oldClient(g,dt);
};
var oldHost=N.host,oldJoin=N.join,oldLeave=N.leave,oldDisconnect=N.onDisconnect;
function provider(){var el=document.getElementById('net-transport');return el?el.value:(N.bridge?'steam':'peerjs');}
N.connectBridge=function(){
  if(N.bridge)return N.bridge.connect();
  if(typeof SteamBridgeClient==='undefined')return Promise.reject(new Error('请用 Steam 桥接启动脚本打开游戏'));
  N.bridge=new SteamBridgeClient();
  N.bridge.on('packet',function(p){if(N.g)N.onData(N.g,p.data);});
  N.bridge.on('members',function(info){
    var previous=N.bridgeInfo;N.bridgeInfo=info;
    if(N.state==='host'&&previous&&previous.members.length>1&&info.members.length<2&&N.g){N.g.guest=null;N.g.players=[N.g.player];N.log('warn','客机已离开');}
  });
  N.bridge.on('fault',function(e){N.log('error',e.code+': '+e.message);});
  N.bridge.on('closed',function(){N.onDisconnect();});
  return N.bridge.connect();
};
function attachBridge(g,info,role,hero){
  N.g=g;N.bridgeInfo=info;N.state=role;N.roomCode=info.room;N.localIndex=role==='host'?0:1;
  N.hero=hero||'knight';N.snap=null;N.lastWorldTick=-1;N.appliedWorldTick=-1;N.connected=true;N.seq=0;N.actionSeq=0;g.netMode=role;
  if(!g.player||g.state!=='lobby')g.enterLobby();
  g.player.netId=N.localIndex;
  if(role==='client'){var chosen=G.Heroes.find(function(h){return h.id===hero;})||G.Heroes[0];g.player=new G.Player(chosen,g);g.player.netId=1;g.lobbyHeroIdx=G.Heroes.indexOf(chosen);g.netLobbyHero=chosen.id;}
  N.conn={open:true,send:function(data){
    var destinations=role==='host'?N.bridgeInfo.members.filter(function(id){return id!==info.selfId;}):[info.hostId];
    destinations.forEach(function(id){N.bridge.send(id,data).catch(function(e){N.log('error',e.message);});});
  },close:function(){this.open=false;N.bridge.leave().catch(function(){});}};
  if(role==='client')N.send({t:'hello',hero:N.hero});
  N.log('info',(info.transport==='mock'?'模拟桥接':'Steam')+'房间：'+info.room);
  if(N.bridgeHeartbeat)clearInterval(N.bridgeHeartbeat);
  N.lastRecv=Date.now();N.bridgeHeartbeat=setInterval(function(){if(!N.conn||!N.conn.open)return;if(N.bridgeInfo.members.length<2)return;if(Date.now()-N.lastRecv>12000){N.onDisconnect();return;}N.send({t:'ping',ts:Date.now()});},2000);
}
N.host=function(g,room,addr,cb){
  if(provider()!=='steam')return oldHost(g,room,addr,cb);
  if(N.state!=='off'){cb({ok:false,error:'已在联机中'});return;}
  N.connectBridge().then(function(){return N.bridge.createRoom();}).then(function(info){attachBridge(g,info,'host');cb({ok:true,id:info.room});}).catch(function(e){cb({ok:false,error:e.message});});
};
N.join=function(g,room,addr,hero,cb){
  if(provider()!=='steam')return oldJoin(g,room,addr,hero,cb);
  if(N.state!=='off'){cb({ok:false,error:'已在联机中'});return;}
  N.connectBridge().then(function(){return N.bridge.joinRoom(room);}).then(function(info){attachBridge(g,info,'client',hero);cb({ok:true,connected:true});}).catch(function(e){cb({ok:false,error:e.message});});
};
N.leave=function(){var g=N.g;if(N.bridgeHeartbeat){clearInterval(N.bridgeHeartbeat);N.bridgeHeartbeat=null;}oldLeave();if(g){g.netMode=null;g.guest=null;g.players=g.player?[g.player]:[];}if(N.bridge)N.bridge.leave().catch(function(){});};
N.onDisconnect=function(){var client=N.state==='client';if(N.bridgeHeartbeat){clearInterval(N.bridgeHeartbeat);N.bridgeHeartbeat=null;}oldDisconnect();if(N.bridge)N.bridge.leave().catch(function(){});if(client&&N.g){N.g.state='menu';N.g.onCoopState&&N.g.onCoopState('menu');}};
if(typeof location!=='undefined'&&location.search.indexOf('steam=1')>=0){var el=document.getElementById('net-transport');if(el)el.value='steam';}
G.Coop={serializeWeapon:weapon,restoreWeapon:restoreWeapon};
})();
