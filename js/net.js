/* 元气骑士·深渊回响 —— P2P 联机模块（WebRTC DataChannel + 主机权威快照同步）
   信令：本地自研 PeerJS 兼容服务器（配合 SakuraFrp TCP 隧道打通公网）
   协议：客机发输入(30Hz)，主机广播快照(15Hz)
   快照约定：p[0]=主机，p[1]=客机 */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var N = {};
G.Net = N;

N.state = 'off';      /* off | host | client */
N.peer = null;
N.conn = null;
N.roomCode = '';
N.serverAddr = '';
N.snap = null;
N.connected = false;
N.localIndex = 0;     /* 0=主机本地玩家，1=客机本地玩家 */
N.guestHero = null;
N.pendingHello = null;
N.snapT = 0;
N.inputT = 0;
N.snapInterval = 0.066;
N.inputInterval = 0.033;
N.connectTimeoutMs = 12000;
N.onStatus = null;
N.onLog = null;
N.onReady = null;     /* 客机收到 welcome / 主机客机加入 */
N.logs = [];
N.log = function(type, msg){
  var entry = { t: new Date().toLocaleTimeString(), type: type, msg: msg };
  N.logs.push(entry);
  if(N.logs.length > 100) N.logs.shift();
  try{ console.log('[联机]', entry.t, type, msg); }catch(e){}
  if(N.onLog) N.onLog(entry);
};

function onceCb(cb){
  var called=false;
  return function(res){
    if(called) return;
    called=true;
    if(cb) cb(res);
  };
}
function randomPeerId(prefix){
  var chars='abcdefghijklmnopqrstuvwxyz0123456789';
  var s=prefix||'yqksg-';
  for(var i=0;i<10;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
N.randomPeerId = randomPeerId;
function findHero(id){
  if(!G.Heroes) return null;
  for(var i=0;i<G.Heroes.length;i++) if(G.Heroes[i].id===id) return G.Heroes[i];
  return G.Heroes[0]||null;
}
function isLocalHost(host){
  if(!host) return true;
  host=String(host).toLowerCase();
  return host==='localhost' || host==='127.0.0.1' || host==='::1' || host==='[::1]';
}
function parseTurnConfig(){
  var raw=null;
  try{
    if(typeof window!=='undefined' && window.YQKS_TURN) raw=window.YQKS_TURN;
    else if(typeof localStorage!=='undefined') raw=localStorage.getItem('yqks_turn');
  }catch(e){}
  if(!raw) return [];
  try{
    if(typeof raw==='string') raw=JSON.parse(raw);
    if(Array.isArray(raw)) return raw;
    if(raw && typeof raw==='object') return [raw];
  }catch(e){}
  return [];
}
function iceServers(){
  var list=[
    { urls:'stun:stun.l.google.com:19302' },
    { urls:'stun:stun1.l.google.com:19302' },
    { urls:'stun:stun.cloudflare.com:3478' }
  ];
  var extra=parseTurnConfig();
  for(var i=0;i<extra.length;i++) list.push(extra[i]);
  return list;
}
N.peerOpts = function(serverAddr){
  var opts={
    debug:1,
    config:{ iceServers: iceServers() }
  };
  if(!serverAddr) return opts;
  var addr=String(serverAddr).trim();
  var secure=false;
  var explicit=false;
  if(addr.indexOf('wss://')===0){ secure=true; explicit=true; addr=addr.slice(6); }
  else if(addr.indexOf('https://')===0){ secure=true; explicit=true; addr=addr.slice(8); }
  else if(addr.indexOf('ws://')===0){ secure=false; explicit=true; addr=addr.slice(5); }
  else if(addr.indexOf('http://')===0){ secure=false; explicit=true; addr=addr.slice(7); }
  if(addr.indexOf('/')>=0) addr=addr.split('/')[0];
  var parts=addr.split(':');
  var host=parts[0];
  var port=parseInt(parts[1],10)||9000;
  opts.host=host;
  opts.port=port;
  opts.path='/yqks';
  if(!explicit){
    try{
      if(typeof location!=='undefined' && location.protocol==='https:' && !isLocalHost(host))
        secure=true;
    }catch(e){}
  }
  opts.secure=!!secure;
  return opts;
};
function status(msg){ N.log('状态', msg); if(N.onStatus) N.onStatus(msg); }

function attachConn(g, conn, cb){
  N.conn=conn;
  var opened=false;
  var timer=setTimeout(function(){
    if(opened) return;
    N.log('error', '数据通道超时（'+N.connectTimeoutMs+'ms）');
    status('连接超时：DataChannel 未打开（检查信令/NAT/TURN）');
    if(cb) cb({ok:false, error:'timeout'});
    try{ if(conn) conn.close(); }catch(e){}
  }, N.connectTimeoutMs);
  conn.on('open', function(){
    opened=true;
    clearTimeout(timer);
    N.connected=true;
    N.log('info', '数据通道已建立');
    if(N.state==='client'){
      N.send({t:'hello', hero:N.hero});
      status('已连接，等待主机开局...');
    } else {
      status('客机已加入！');
    }
    if(cb) cb({ok:true, connected:true});
  });
  conn.on('data', function(data){ N.onData(g, data); });
  conn.on('close', function(){
    clearTimeout(timer);
    N.log('warn', '数据通道关闭');
    N.onDisconnect();
  });
  conn.on('error', function(e){
    N.log('error', '数据通道错误：'+(e&&e.message||e));
  });
  if(conn.on){
    conn.on('iceStateChanged', function(st){
      N.log('info', 'ICE 状态：'+st);
    });
  }
}

function attachPeerEvents(g, cb){
  N.peer.on('error', function(err){
    N.log('error', 'Peer 错误：'+(err.type||'unknown')+' '+(err.message||''));
    status('信令错误：'+(err.type||err.message));
    if(cb) cb({ok:false, error:err.type||err.message});
  });
  N.peer.on('disconnected', function(){ N.log('warn', 'Peer 与信令服务器断开'); });
  N.peer.on('close', function(){ N.log('warn', 'Peer 已销毁'); });
}

N.host = function(g, roomCode, serverAddr, cb){
  cb=onceCb(cb);
  if(N.state!=='off'){ cb({ok:false, error:'已在联机中'}); return; }
  N.state='host';
  N.roomCode=roomCode;
  N.serverAddr=serverAddr;
  N.g=g;
  N.localIndex=0;
  N.connected=false;
  if(g) g.netMode='host';
  try{
    N.peer=new Peer('yqks-'+roomCode, N.peerOpts(serverAddr));
  }catch(e){ N.state='off'; if(g) g.netMode=null; cb({ok:false, error:'Peer 初始化失败'}); return; }
  N.peer.on('open', function(id){
    N.log('info', 'Peer 已就绪，房间码：'+roomCode+' id='+id);
    status('房间已创建：'+roomCode+'（等待客机加入）');
    cb({ok:true, id:id});
  });
  N.peer.on('connection', function(conn){
    N.log('info', '收到客机连接');
    attachConn(g, conn, function(res){
      if(res && res.ok) status('客机数据通道已打开');
      else if(res && !res.ok) status('客机连接失败：'+(res.error||''));
    });
  });
  attachPeerEvents(g, cb);
};

N.join = function(g, roomCode, serverAddr, heroId, cb){
  cb=onceCb(cb);
  if(N.state!=='off'){ cb({ok:false, error:'已在联机中'}); return; }
  N.state='client';
  N.roomCode=roomCode;
  N.serverAddr=serverAddr;
  N.g=g;
  N.hero=heroId;
  N.localIndex=1;
  N.connected=false;
  var myId=randomPeerId('yqksg-');
  try{
    N.peer=new Peer(myId, N.peerOpts(serverAddr));
  }catch(e){ N.state='off'; cb({ok:false, error:'Peer 初始化失败'}); return; }
  N.peer.on('open', function(id){
    N.log('info', 'Peer 已就绪 id='+id+'，连接房间 '+roomCode+'...');
    status('正在连接房间 '+roomCode+'...');
    try{
      N.conn=N.peer.connect('yqks-'+roomCode, {reliable:true});
    }catch(e){ N.log('error', '连接失败：'+e.message); N.state='off'; cb({ok:false, error:'连接失败'}); return; }
    attachConn(g, N.conn, cb);
  });
  attachPeerEvents(g, cb);
};

N.send = function(msg){
  try{ if(N.conn && N.conn.open) N.conn.send(msg); }catch(e){}
};

N.createGuest = function(g, heroId){
  if(!g) return null;
  var hero=findHero(heroId) || (G.Heroes && G.Heroes[0]);
  if(!hero) return null;
  if(g.guest){ g.guest.dead=true; }
  var guest=new G.Player(hero, g);
  guest.netId=1;
  if(g.map){
    guest.x=(g.player?g.player.x:g.map.startX)+40;
    guest.y=g.player?g.player.y:g.map.startY;
  } else {
    var L=G.Lobby && G.Lobby.LAYOUT;
    guest.x=(g.player?g.player.x:(L?L.spawn.x:320))+40;
    guest.y=g.player?g.player.y:(L?L.spawn.y:300);
  }
  g.guest=guest;
  g.players=[g.player, guest];
  N.guestHero=hero.id;
  return guest;
};

N.welcomePayload = function(g){
  if(!g || !g.map) return null;
  return {
    t:'welcome',
    seed:g.map.seed,
    floor:g.floorNum||1,
    hostHero:g.player && g.player.hero ? g.player.hero.id : 'knight',
    guestHero:g.guest && g.guest.hero ? g.guest.hero.id : (N.guestHero||'knight'),
    you:1
  };
};

N.sendWelcome = function(g){
  var msg=N.welcomePayload(g);
  if(!msg){
    N.log('warn', '地图尚未创建，welcome 延后');
    return false;
  }
  N.send(msg);
  N.log('info', '已发送 welcome seed='+msg.seed+' floor='+msg.floor);
  return true;
};

N.onData = function(g, data){
  if(!data || typeof data!=='object') return;
  if(data.t==='hello'){
    if(N.state!=='host' || !g) return;
    N.guestHero=data.hero;
    N.createGuest(g, data.hero);
    if(g.map){
      N.sendWelcome(g);
      status('客机加入：'+(g.guest && g.guest.hero ? g.guest.hero.name : data.hero)+'（已同步地牢）');
    } else {
      N.hostHero=g.player && g.player.hero ? g.player.hero.id : 'knight';
      N.send({t:'joined', hero:N.hostHero});
      status('客机已在大厅：'+(g.guest && g.guest.hero ? g.guest.hero.name : data.hero)+'，去传送门开局');
    }
    if(N.onReady) N.onReady({role:'host', phase:g.map?'playing':'lobby'});
  } else if(data.t==='joined'){
    if(N.state!=='client') return;
    N.connected=true;
    N.hostHero=data.hero;
    status('已进入主机大厅，等待主机开局...');
  } else if(data.t==='input'){
    if(N.state!=='host' || !g || !g.guest) return;
    g.guest.netInput = N.makeNetInput(data);
  } else if(data.t==='welcome'){
    if(N.state!=='client' || !g) return;
    N.applyWelcome(g, data);
  } else if(data.t==='lobby'){
    if(N.state!=='client' || !g) return;
    if(!g.guest){
      var hostHero=findHero(N.hostHero || 'knight');
      if(hostHero){
        g.guest=new G.Player(hostHero, g);
        g.guest.netId=0;
      }
    }
    if(g.guest){
      g.guest.x=data.x; g.guest.y=data.y;
      if(data.aim!==undefined) g.guest.aim=data.aim;
      if(data.face!==undefined) g.guest.face=data.face;
    }
  } else if(data.t==='snap'){
    N.snap=data;
  } else if(data.t==='toast'){
    if(g) g.toast(data.msg);
  }
};

N.applyWelcome = function(g, data){
  g.netMode='client';
  N.localIndex = (data.you===0 || data.you===1) ? data.you : 1;
  N.connected=true;
  var myHero=findHero(data.guestHero || N.hero);
  var hostHero=findHero(data.hostHero);
  if(myHero){
    g.player = new G.Player(myHero, g);
    g.player.netId=1;
  }
  g.newFloor(data.floor||1, data.seed);
  if(g.map){
    g.player.x=g.map.startX+40;
    g.player.y=g.map.startY;
  }
  if(hostHero){
    var host=new G.Player(hostHero, g);
    host.netId=0;
    if(g.map){ host.x=g.map.startX; host.y=g.map.startY; }
    g.guest=host;
  }
  g.players=[g.guest||g.player, g.player];
  g.state='playing';
  g.panelOpen=false;
  status('已进入主机地牢！');
  if(N.onReady) N.onReady({role:'client', phase:'playing'});
};

N.makeNetInput = function(data){
  var keys=data.keys||{};
  return {
    keys:keys, hits:keys,
    down:!!data.down, downHit:!!data.downHit, rdown:!!data.rdown, rdownHit:!!data.rdownHit,
    mx:0, my:0, wheel:0, hasTouch:false,
    stickR:{on:false,dx:0,dy:0},
    aim:data.aim,
    moveVec:function(){ return {x:data.mvx||0, y:data.mvy||0, len:Math.min(1,Math.sqrt((data.mvx||0)*(data.mvx||0)+(data.mvy||0)*(data.mvy||0)))}; },
    hit:function(){ for(var i=0;i<arguments.length;i++) if(this.keys[arguments[i]]) return true; return false; },
    key:function(){ for(var i=0;i<arguments.length;i++) if(this.keys[arguments[i]]) return true; return false; },
    end:function(){}
  };
};
N.onDisconnect = function(){
  var was=N.state;
  N.log('warn', '联机断开（原状态：'+was+'）');
  N.state='off';
  N.conn=null;
  N.connected=false;
  if(N.g){
    if(was==='host' && N.g.guest){ N.g.guest.dead=true; N.g.guest=null; N.g.players=[N.g.player]; }
    N.g.netMode=null;
    N.g.toast('联机已断开');
  }
  status('联机已断开');
};

N.update = function(g, dt){
  if(N.state==='host') N.hostUpdate(g, dt);
  else if(N.state==='client') N.clientUpdate(g, dt);
};
N.hostUpdate = function(g, dt){
  if(!N.conn || !N.conn.open) return;
  if(!g) return;
  if(g.state==='lobby'){
    N.snapT+=dt;
    if(N.snapT>=N.snapInterval){
      N.snapT=0;
      N.send({t:'lobby', x:g.player?g.player.x:0, y:g.player?g.player.y:0, aim:g.player?g.player.aim:0, face:g.player?g.player.face:1, moving:g.player?g.player.moving:0});
    }
    return;
  }
  if(!g.map || g.state!=='playing') return;
  N.snapT+=dt;
  if(N.snapT>=N.snapInterval){
    N.snapT=0;
    N.send(N.buildSnap(g));
  }
};
N.packPlayer = function(p){
  if(!p) return null;
  return {
    x:p.x,y:p.y,hp:p.hp,armor:p.armor,energy:p.energy,wi:p.wi,aim:p.aim,dead:!!p.dead,
    hero:p.hero && p.hero.id, face:p.face, moving:p.moving||0
  };
};
N.buildSnap = function(g){
  var host=g.player, guest=g.guest;
  var players=[N.packPlayer(host)];
  if(guest) players.push(N.packPlayer(guest));
  var enemies=[];
  for(var j=0;j<g.enemies.length;j++){
    var e=g.enemies[j];
    enemies.push({x:e.x,y:e.y,hp:e.hp,mh:e.maxHp,id:e.id});
  }
  var bullets=[];
  for(var k=0;k<g.bullets.length && k<60;k++){
    var b=g.bullets[k];
    bullets.push({x:b.x,y:b.y,vx:b.vx,vy:b.vy,tm:b.team});
  }
  return {t:'snap', p:players, e:enemies, b:bullets};
};
N.clientUpdate = function(g, dt){
  if(!N.conn || !N.conn.open) return;
  var IN=G.Input;
  if(g && g.player && IN){
    if(IN.stickR && IN.stickR.on && (Math.abs(IN.stickR.dx)+Math.abs(IN.stickR.dy))>0.25){
      g.player.aim=Math.atan2(IN.stickR.dy, IN.stickR.dx);
    } else if(!IN.hasTouch && g.screenToWorld){
      var w=g.screenToWorld(IN.mx, IN.my);
      g.player.aim=U.ang(g.player.x,g.player.y,w.x,w.y);
    }
    g.player.face=Math.cos(g.player.aim)>=0?1:-1;
  }
  N.inputT+=dt;
  if(N.inputT>=N.inputInterval){
    N.inputT=0;
    var mv=IN.moveVec();
    var keys={};
    if(IN.key('q')) keys.q=1;
    if(IN.key(' ')) keys[' ']=1;
    if(IN.key('shift')) keys.shift=1;
    if(IN.key('e')) keys.e=1;
    if(IN.key('k')) keys.k=1;
    if(IN.key('j')) keys.j=1;
    if(IN.key('1')) keys['1']=1;
    if(IN.key('2')) keys['2']=1;
    if(IN.key('3')) keys['3']=1;
    N.send({t:'input', mvx:mv.x, mvy:mv.y, aim:g.player.aim, down:IN.down, downHit:IN.downHit,
      rdown:IN.rdown, rdownHit:IN.rdownHit, keys:keys});
  }
  N.applySnap(g);
};
function applyPlayerSnap(p, data){
  if(!p || !data) return;
  p.x=data.x; p.y=data.y;
  p.hp=data.hp; p.armor=data.armor; p.energy=data.energy;
  p.wi=data.wi; p.aim=data.aim;
  if(data.face!==undefined) p.face=data.face;
  if(data.moving!==undefined) p.moving=data.moving;
  if(data.dead && !p.dead) p.dead=true;
  if(!data.dead) p.dead=false;
}
N.applySnap = function(g){
  var s=N.snap;
  if(!s) return;
  var local=N.localIndex||0;
  var remote=local===1?0:1;
  if(s.p && s.p[local]) applyPlayerSnap(g.player, s.p[local]);
  if(s.p && s.p[remote]){
    if(!g.guest && s.p[remote].hero){
      var hero=findHero(s.p[remote].hero);
      if(hero){
        g.guest=new G.Player(hero, g);
        g.guest.netId=remote;
      }
    }
    if(g.guest) applyPlayerSnap(g.guest, s.p[remote]);
  }
  var alive=[];
  for(var i=0;(s.e||[]).length && i<s.e.length;i++){
    var ed=s.e[i];
    var e=g.enemies[i];
    if(!e){
      e=g.spawnEnemy(ed.id, ed.x, ed.y, {});
      if(e) e.spawnT=0;
    }
    if(e){
      e.x=ed.x; e.y=ed.y; e.hp=ed.hp; e.maxHp=ed.mh;
      e.dead=false;
      alive.push(e);
    }
  }
  g.enemies=alive;
  var bullets=[];
  for(var j=0;j<(s.b||[]).length;j++){
    var bd=s.b[j];
    var b=g.bullets[j];
    if(!b){
      b=new G.Bullet({x:bd.x,y:bd.y,ang:Math.atan2(bd.vy,bd.vx),spd:Math.sqrt(bd.vx*bd.vx+bd.vy*bd.vy)||1,
        dmg:1,r:3,color:'#ffffff',team:bd.tm});
    }
    b.x=bd.x; b.y=bd.y; b.vx=bd.vx; b.vy=bd.vy; b.team=bd.tm;
    b.dead=false;
    bullets.push(b);
  }
  g.bullets=bullets;
};

N.leave = function(){
  try{ if(N.conn) N.conn.close(); }catch(e){}
  try{ if(N.peer) N.peer.destroy(); }catch(e){}
  N.state='off'; N.conn=null; N.peer=null; N.snap=null; N.connected=false; N.localIndex=0; N.guestHero=null;
};
})();
