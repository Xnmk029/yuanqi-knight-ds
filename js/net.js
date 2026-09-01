/* 元气骑士·深渊回响 —— P2P 联机模块（WebRTC DataChannel + 主机权威快照同步）
   信令：本地 peerjs-server（配合 SakuraFrp TCP 隧道打通公网）
   协议：客机发输入(30Hz)，主机广播快照(15Hz) */
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
N.snapT = 0;
N.inputT = 0;
N.snapInterval = 0.066;
N.inputInterval = 0.033;
N.onStatus = null;    /* 状态回调 (msg) */
N.logs = [];          /* 联机日志（游戏内可见，最多 100 条） */
N.log = function(type, msg){
  var entry = { t: new Date().toLocaleTimeString(), type: type, msg: msg };
  N.logs.push(entry);
  if(N.logs.length > 100) N.logs.shift();
  try{ console.log('[联机]', entry.t, type, msg); }catch(e){}
  if(N.onLog) N.onLog(entry);
};

function peerOpts(serverAddr){
  var opts={};
  if(serverAddr){
    var addr=String(serverAddr).trim();
    var secure=false;
    /* 支持协议前缀：wss:// 走 TLS（SakuraFrp 国内节点自动 HTTPS 必需），ws:// 明文 */
    if(addr.indexOf('wss://')===0){ secure=true; addr=addr.slice(6); }
    else if(addr.indexOf('ws://')===0){ addr=addr.slice(5); }
    var parts=addr.split(':');
    opts.host=parts[0];
    opts.port=parseInt(parts[1],10)||9000;
    opts.path='/yqks';
    opts.secure=secure;
  }
  return opts;
}
function status(msg){ N.log('状态', msg); if(N.onStatus) N.onStatus(msg); }

/* ---------- 主机：创建房间 ---------- */
N.host = function(g, roomCode, serverAddr, cb){
  if(N.state!=='off'){ if(cb) cb({ok:false, error:'已在联机中'}); return; }
  N.state='host';
  N.roomCode=roomCode;
  N.serverAddr=serverAddr;
  N.g=g;
  try{
    N.peer=new Peer('yqks-'+roomCode, peerOpts(serverAddr));
  }catch(e){ N.state='off'; if(cb) cb({ok:false, error:'Peer 初始化失败'}); return; }
  N.peer.on('open', function(id){ N.log('info', 'Peer 已就绪，房间码：'+roomCode); status('房间已创建：'+roomCode); if(cb) cb({ok:true, id:id}); });
  N.peer.on('error', function(err){
    N.log('error', 'Peer 错误：'+(err.type||'unknown')+' '+(err.message||''));
    status('信令错误：'+(err.type||err.message));
    if(cb) cb({ok:false, error:err.type||err.message});
  });
  N.peer.on('connection', function(conn){
    N.conn=conn;
    N.log('info', '收到客机连接');
    conn.on('data', function(data){ N.onData(g, data); });
    conn.on('close', function(){ N.log('warn', '客机连接关闭'); N.onDisconnect(); });
    conn.on('error', function(e){ N.log('error', '数据通道错误：'+(e&&e.message||e)); });
    status('客机已加入！');
    if(cb) cb({ok:true, connected:true});
  });
  /* 记录底层 WebSocket 状态 */
  N.peer.on('socket', function(sock){
    N.log('info', 'WebSocket 已建立（信令通道）');
    if(sock && sock.on){
      sock.on('error', function(e){ N.log('error', 'WebSocket 错误：'+(e&&e.message||e)); });
      sock.on('close', function(){ N.log('warn', 'WebSocket 关闭'); });
    }
  });
  N.peer.on('disconnected', function(){ N.log('warn', 'Peer 与信令服务器断开'); });
  N.peer.on('close', function(){ N.log('warn', 'Peer 已销毁'); });
};

/* ---------- 客机：加入房间 ---------- */
N.join = function(g, roomCode, serverAddr, heroId, cb){
  if(N.state!=='off'){ if(cb) cb({ok:false, error:'已在联机中'}); return; }
  N.state='client';
  N.roomCode=roomCode;
  N.serverAddr=serverAddr;
  N.g=g;
  N.hero=heroId;
  try{
    N.peer=new Peer(undefined, peerOpts(serverAddr));
  }catch(e){ N.state='off'; if(cb) cb({ok:false, error:'Peer 初始化失败'}); return; }
  N.peer.on('open', function(){
    N.log('info', 'Peer 已就绪，连接房间 '+roomCode+'...');
    status('正在连接房间 '+roomCode+'...');
    try{
      N.conn=N.peer.connect('yqks-'+roomCode, {reliable:true});
    }catch(e){ N.log('error', '连接失败：'+e.message); N.state='off'; if(cb) cb({ok:false, error:'连接失败'}); return; }
    N.conn.on('open', function(){
      N.log('info', '数据通道已建立，发送握手');
      N.send({t:'hello', hero:heroId});
      status('已连接，等待主机开局...');
      if(cb) cb({ok:true});
    });
    N.conn.on('data', function(data){ N.onData(g, data); });
    N.conn.on('close', function(){ N.log('warn', '数据通道关闭'); N.onDisconnect(); });
    N.conn.on('error', function(e){ N.log('error', '数据通道错误：'+(e&&e.message||e)); });
  });
  N.peer.on('error', function(err){
    N.log('error', 'Peer 错误：'+(err.type||'unknown')+' '+(err.message||''));
    status('信令错误：'+(err.type||err.message));
    if(cb) cb({ok:false, error:err.type||err.message});
  });
  N.peer.on('socket', function(sock){
    N.log('info', 'WebSocket 已建立（信令通道）');
    if(sock && sock.on){
      sock.on('error', function(e){ N.log('error', 'WebSocket 错误：'+(e&&e.message||e)); });
      sock.on('close', function(){ N.log('warn', 'WebSocket 关闭'); });
    }
  });
  N.peer.on('disconnected', function(){ N.log('warn', 'Peer 与信令服务器断开'); });
  N.peer.on('close', function(){ N.log('warn', 'Peer 已销毁'); });
};

N.send = function(msg){
  try{ if(N.conn && N.conn.open) N.conn.send(msg); }catch(e){}
};

/* ---------- 消息处理 ---------- */
N.onData = function(g, data){
  if(!data || typeof data!=='object') return;
  if(data.t==='hello'){
    /* 主机：创建客机玩家 */
    if(N.state!=='host' || !g) return;
    var hero=null;
    for(var i=0;i<G.Heroes.length;i++) if(G.Heroes[i].id===data.hero) hero=G.Heroes[i];
    if(!hero) hero=G.Heroes[0];
    if(g.guest){ g.guest.dead=true; }
    var guest=new G.Player(hero, g);
    guest.netId=1;
    guest.x=g.player.x+40; guest.y=g.player.y;
    g.guest=guest;
    g.players=[g.player, guest];
    N.send({t:'welcome', hero:g.player.hero.id, seed:g.map.seed, floor:g.floorNum});
    status('客机加入：'+hero.name);
  } else if(data.t==='input'){
    if(N.state!=='host' || !g || !g.guest) return;
    g.guest.netInput = N.makeNetInput(data);
  } else if(data.t==='welcome'){
    /* 客机：用种子重建地图 */
    if(N.state!=='client' || !g) return;
    g.netMode='client';
    g.newFloor(data.floor, data.seed);
    g.player.x=g.map.startX; g.player.y=g.map.startY;
    g.state='playing';
    N.connected=true;
    status('已进入主机地牢！');
  } else if(data.t==='snap'){
    N.snap=data;
  } else if(data.t==='toast'){
    if(g) g.toast(data.msg);
  }
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
  if(N.g){
    if(was==='host' && N.g.guest){ N.g.guest.dead=true; N.g.guest=null; N.g.players=[N.g.player]; }
    N.g.netMode=null;
    N.g.toast('联机已断开');
  }
  status('联机已断开');
};

/* ---------- 每帧更新 ---------- */
N.update = function(g, dt){
  if(N.state==='host') N.hostUpdate(g, dt);
  else if(N.state==='client') N.clientUpdate(g, dt);
};
N.hostUpdate = function(g, dt){
  if(!N.conn || !N.conn.open) return;
  N.snapT+=dt;
  if(N.snapT>=N.snapInterval){
    N.snapT=0;
    N.send(N.buildSnap(g));
  }
};
N.buildSnap = function(g){
  var players=[];
  var list=g.players||[g.player];
  for(var i=0;i<list.length;i++){
    var p=list[i];
    if(!p) continue;
    players.push({x:p.x,y:p.y,hp:p.hp,armor:p.armor,energy:p.energy,wi:p.wi,aim:p.aim,dead:!!p.dead});
  }
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
  N.inputT+=dt;
  if(N.inputT>=N.inputInterval){
    N.inputT=0;
    var IN=G.Input;
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
N.applySnap = function(g){
  var s=N.snap;
  if(!s) return;
  /* 玩家 0 = 主机玩家 */
  if(s.p && s.p[0]){
    var hp=s.p[0];
    g.player.x=hp.x; g.player.y=hp.y;
    g.player.hp=hp.hp; g.player.armor=hp.armor; g.player.energy=hp.energy;
    g.player.wi=hp.wi; g.player.aim=hp.aim;
    if(hp.dead && !g.player.dead){ g.player.dead=true; }
  }
  /* 敌人：按索引更新 */
  var alive=[];
  for(var i=0;i<(s.e||[]).length;i++){
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
  /* 子弹 */
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

/* ---------- 断开 ---------- */
N.leave = function(){
  try{ if(N.conn) N.conn.close(); }catch(e){}
  try{ if(N.peer) N.peer.destroy(); }catch(e){}
  N.state='off'; N.conn=null; N.peer=null; N.snap=null; N.connected=false;
};
})();
