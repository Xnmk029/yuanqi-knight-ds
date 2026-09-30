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
N.seq = 0;            /* 输入包序号 */
N.evBuf = {};         /* 待发送的边沿事件（本帧按下的一次性动作） */
N.rtt = 0;            /* 最近一次心跳往返延迟 ms */
N.lastRecv = 0;       /* 最后收到对端数据的时间戳 */
/* 边沿按键集合：客户端采集、主机按"本帧刚按下"语义消费 */
N.EDGE_KEYS = ['q',' ','shift','e','k','j','1','2','3'];
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

/* ---------- 心跳：独立于游戏主循环（主机开面板/暂停时也保活） ---------- */
var hbTimer=null;
function stopHeartbeat(){
  if(hbTimer){ clearInterval(hbTimer); hbTimer=null; }
}
function startHeartbeat(){
  stopHeartbeat();
  N.lastRecv=Date.now();
  hbTimer=setInterval(function(){
    if(!N.conn || !N.conn.open) return;
    var now=Date.now();
    if(N.lastRecv && now-N.lastRecv>10000){
      N.log('error','超过 10s 未收到对端数据，判定断线');
      try{ N.conn.close(); }catch(e){}
      N.onDisconnect();
      return;
    }
    N.send({t:'ping', ts:now});
  }, 2000);
}

function attachConn(g, conn, cb){
  N.conn=conn;
  var opened=false;
  var timer=setTimeout(function(){
    if(opened) return;
    N.log('error', '数据通道超时（'+N.connectTimeoutMs+'ms）');
    status('连接超时：DataChannel 未打开（检查信令/NAT/TURN）');
    if(cb) cb({ok:false, error:'timeout'});
    try{ if(conn) conn.close(); }catch(e){}
    /* 客机超时：复位状态便于重试 */
    if(N.state==='client' && !N.connected){
      try{ if(N.peer) N.peer.destroy(); }catch(e){}
      N.state='off'; N.conn=null; N.peer=null;
      if(N.g) N.g.netMode=null;
    }
  }, N.connectTimeoutMs);
  conn.on('open', function(){
    opened=true;
    clearTimeout(timer);
    N.connected=true;
    N.log('info', '数据通道已建立');
    startHeartbeat();
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
    stopHeartbeat();
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
    /* 客机尚未连通就出错（如房间不存在）：清理状态以便重试 */
    if(N.state==='client' && !N.connected){
      stopHeartbeat();
      try{ if(N.peer) N.peer.destroy(); }catch(e){}
      N.state='off'; N.conn=null; N.peer=null;
      N.g && (N.g.netMode=null);
    }
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

N.onData = function(g, data){
  if(!data || typeof data!=='object') return;
  N.lastRecv=Date.now();
  if(data.t==='ping'){
    N.send({t:'pong', ts:data.ts});
    return;
  }
  if(data.t==='pong'){
    if(data.ts) N.rtt=Math.max(0, Date.now()-data.ts);
    return;
  }
  if(data.t==='reject'){
    if(N.state!=='client') return;
    N.log('warn', '主机拒绝：'+(data.reason||''));
    status('加入失败：'+(data.reason||''));
    if(g) g.toast(data.reason||'加入被拒绝');
    N.leave();
    return;
  }
  if(data.t==='hello'){
    if(N.state!=='host' || !g) return;
    /* 只允许在主机大厅加入；对局中/换层后加入会导致状态错乱，直接拒绝 */
    if(g.map || g.state!=='lobby'){
      N.log('warn', '拒绝客机加入：主机已开局');
      N.send({t:'reject', reason:'主机已开局，请在大厅阶段加入'});
      return;
    }
    N.guestHero=data.hero;
    N.createGuest(g, data.hero);
    N.hostHero=g.player && g.player.hero ? g.player.hero.id : 'knight';
    N.send({t:'joined', hero:N.hostHero});
    status('客机已在大厅：'+(g.guest && g.guest.hero ? g.guest.hero.name : data.hero)+'，去传送门开局');
    if(N.onReady) N.onReady({role:'host', phase:'lobby'});
  } else if(data.t==='joined'){
    if(N.state!=='client') return;
    N.connected=true;
    N.hostHero=data.hero;
    status('已进入主机大厅，等待主机开局...');
  } else if(data.t==='input'){
    if(N.state!=='host' || !g || !g.guest) return;
    N.applyNetInput(g.guest, data);
  } else if(data.t==='welcome' || data.t==='floor'){
    if(N.state!=='client' || !g) return;
    N.applyFloor(g, data);
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
  } else if(data.t==='over'){
    if(N.state!=='client' || !g) return;
    if(g.state==='playing'){
      g.toast('主机已倒下，对局结束');
      g.state='dead';
      if(g.onGameOver) g.onGameOver();
    }
  } else if(data.t==='toast'){
    if(g) g.toast(data.msg);
  }
};

N.floorPayload = function(g){
  if(!g || !g.map) return null;
  return {
    t:'floor',
    seed:g.map.seed,
    floor:g.floorNum||1,
    hostHero:g.player && g.player.hero ? g.player.hero.id : 'knight',
    guestHero:g.guest && g.guest.hero ? g.guest.hero.id : (N.guestHero||'knight'),
    you:1
  };
};

N.sendFloor = function(g){
  var msg=N.floorPayload(g);
  if(!msg){
    N.log('warn', '地图尚未创建，floor 同步延后');
    return false;
  }
  N.send(msg);
  N.log('info', '已同步楼层 floor='+msg.floor+' seed='+msg.seed);
  return true;
};

/* 兼容旧调用名：开局同步已统一为 floor 消息 */
N.sendWelcome = N.sendFloor;
N.welcomePayload = N.floorPayload;

/* 客机应用楼层同步：首次进入（重建双方玩家）与换层（复用玩家对象）共用 */
N.applyFloor = function(g, data){
  var fresh = !g.player || g.netMode!=='client';
  if(fresh){
    g.netMode='client';
    N.localIndex = (data.you===0 || data.you===1) ? data.you : 1;
    var myHero=findHero(data.guestHero || N.hero);
    if(myHero){
      g.player = new G.Player(myHero, g);
      g.player.netId=1;
    }
    var hostHero=findHero(data.hostHero);
    if(hostHero){
      var host=new G.Player(hostHero, g);
      host.netId=0;
      g.guest=host;
    }
  }
  N.connected=true;
  g.newFloor(data.floor||1, data.seed);
  /* newFloor 默认把 g.player 放主机出生位；客机视角里 player 是客机，需对调 */
  if(g.map){
    if(g.player){ g.player.x=g.map.startX+40; g.player.y=g.map.startY; g.player.vx=g.player.vy=0; }
    if(g.guest){ g.guest.x=g.map.startX; g.guest.y=g.map.startY; g.guest.vx=g.guest.vy=0; }
  }
  g.state='playing';
  g.panelOpen=false;
  g.spectateTold=false;
  status(fresh ? '已进入主机地牢！' : '已同步到第 '+(data.floor||1)+' 层');
  if(N.onReady && fresh) N.onReady({role:'client', phase:'playing'});
};

/* 网络输入对象：与 G.Input 同构。
   - keys/down/rdown 为持续状态；hits/downHit/rdownHit/wheel 为一次性边沿，
     由主机在客机玩家每帧更新后调用 end() 消费，避免"按住=连发" */
N.makeNetInput = function(){
  return {
    keys:{}, hits:{},
    down:false, rdown:false, downHit:false, rdownHit:false,
    wheel:0, mvx:0, mvy:0, aim:0, hasTouch:false,
    stickR:{on:false,dx:0,dy:0},
    moveVec:function(){
      var x=this.mvx||0, y=this.mvy||0;
      var d=Math.sqrt(x*x+y*y);
      return {x:x, y:y, len:Math.min(1,d)};
    },
    hit:function(){ for(var i=0;i<arguments.length;i++) if(this.hits[arguments[i]]) return true; return false; },
    key:function(){ for(var i=0;i<arguments.length;i++) if(this.keys[arguments[i]]) return true; return false; },
    end:function(){ this.hits={}; this.downHit=false; this.rdownHit=false; this.wheel=0; }
  };
};
/* 主机：应用客机输入包。状态直接覆写；边沿事件做 OR 累积，帧末统一消费 */
N.applyNetInput = function(p, data){
  if(!p) return;
  var inp=p.netInput;
  if(!inp) inp=p.netInput=N.makeNetInput();
  inp.mvx=data.mvx||0; inp.mvy=data.mvy||0;
  if(data.aim!==undefined) inp.aim=data.aim;
  inp.down=!!data.down; inp.rdown=!!data.rdown;
  inp.keys=data.keys||{};
  var ev=data.ev||{}, i, k;
  if(ev.atk) inp.downHit=true;
  if(ev.skill) inp.rdownHit=true;
  if(ev.wheel) inp.wheel+=ev.wheel;
  var ek=N.EDGE_KEYS;
  for(i=0;i<ek.length;i++){ k=ek[i]; if(ev[k]) inp.hits[k]=true; }
};
N.onDisconnect = function(){
  if(N.state==='off') return; /* 已处理过（如静默超时主动关闭） */
  var was=N.state;
  stopHeartbeat();
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
  /* 门开合 / 房间进度 / 传送门：客机渲染与本地观感一致（地图同种子，顺序一致） */
  var doors=[], rooms=[], po=null;
  if(g.map){
    for(var d2=0;d2<g.map.doors.length;d2++) doors.push(g.map.doors[d2].open?1:0);
    for(var r2=0;r2<g.map.rooms.length;r2++){
      var rr=g.map.rooms[r2];
      rooms.push((rr.visited?1:0)|(rr.cleared?2:0)|(rr.active?4:0));
    }
    if(g.portal) po={x:g.portal.x, y:g.portal.y};
  }
  return {t:'snap', p:players, e:enemies, b:bullets, d:doors, r:rooms, po:po};
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
    /* 每帧收集边沿事件，随下一包输入发送（30Hz 采样会丢掉帧内瞬按） */
    var ev=N.evBuf, i, k;
    if(IN.downHit) ev.atk=1;
    if(IN.rdownHit) ev.skill=1;
    if(IN.wheel) ev.wheel=(ev.wheel||0)+IN.wheel;
    for(i=0;i<N.EDGE_KEYS.length;i++){ k=N.EDGE_KEYS[i]; if(IN.hit(k)) ev[k]=1; }
  }
  N.inputT+=dt;
  if(N.inputT>=N.inputInterval){
    N.inputT=0;
    var mv=IN.moveVec();
    var keys={};
    for(var ki=0;ki<N.EDGE_KEYS.length;ki++){
      var kk=N.EDGE_KEYS[ki];
      if(IN.key(kk)) keys[kk]=1;
    }
    N.seq++;
    N.send({t:'input', seq:N.seq, mvx:mv.x, mvy:mv.y, aim:g.player?g.player.aim:0,
      down:IN.down, rdown:IN.rdown, keys:keys, ev:N.evBuf});
    N.evBuf={};
  }
  N.applySnap(g);
};
function applyPlayerSnap(p, data, isLocal){
  if(!p || !data) return;
  p.x=data.x; p.y=data.y;
  p.hp=data.hp; p.armor=data.armor; p.energy=data.energy;
  p.wi=Math.min(data.wi||0, Math.max(0,p.weapons.length-1));
  /* 本地玩家瞄准由客户端每帧根据鼠标计算，不回写快照的过期瞄准角 */
  if(!isLocal){
    p.aim=data.aim;
    if(data.face!==undefined) p.face=data.face;
  }
  if(data.moving!==undefined) p.moving=data.moving;
  if(data.dead && !p.dead) p.dead=true;
  if(!data.dead) p.dead=false;
}
N.applySnap = function(g){
  var s=N.snap;
  if(!s) return;
  var local=N.localIndex||0;
  var remote=local===1?0:1;
  if(s.p && s.p[local]) applyPlayerSnap(g.player, s.p[local], true);
  if(s.p && s.p[remote]){
    if(!g.guest && s.p[remote].hero){
      var hero=findHero(s.p[remote].hero);
      if(hero){
        g.guest=new G.Player(hero, g);
        g.guest.netId=remote;
      }
    }
    if(g.guest) applyPlayerSnap(g.guest, s.p[remote], false);
  }
  /* 门 / 房间进度 / 传送门同步 */
  if(g.map){
    var i;
    if(s.d){
      for(i=0;i<g.map.doors.length && i<s.d.length;i++) g.map.doors[i].open=!!s.d[i];
    }
    if(s.r){
      for(i=0;i<g.map.rooms.length && i<s.r.length;i++){
        var f=s.r[i], rr=g.map.rooms[i];
        if(!rr) continue;
        rr.visited=!!(f&1); rr.cleared=!!(f&2); rr.active=!!(f&4);
      }
    }
    var poIdx=-1;
    for(i=0;i<g.inter.length;i++) if(g.inter[i].kind==='portal') poIdx=i;
    if(s.po){
      if(poIdx<0){
        g.inter.push({ kind:'portal', x:s.po.x, y:s.po.y, r:20,
          label:'传送门（由主机开启）',
          act:(function(pg){ return function(){ if(pg.toast) pg.toast('由主机操作进入下一层'); }; })(g) });
      } else { g.inter[poIdx].x=s.po.x; g.inter[poIdx].y=s.po.y; }
    } else if(poIdx>=0){
      g.inter.splice(poIdx,1);
    }
  }
  var alive=[];
  for(var i2=0;(s.e||[]).length && i2<s.e.length;i2++){
    var ed=s.e[i2];
    var e=g.enemies[i2];
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
  stopHeartbeat();
  try{ if(N.conn) N.conn.close(); }catch(e){}
  try{ if(N.peer) N.peer.destroy(); }catch(e){}
  N.state='off'; N.conn=null; N.peer=null; N.snap=null; N.connected=false; N.localIndex=0; N.guestHero=null;
  N.evBuf={}; N.seq=0; N.rtt=0;
};
})();
