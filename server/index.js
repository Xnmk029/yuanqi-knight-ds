/* 元气骑士·深渊回响 —— P2P 联机信令服务器（自研版，兼容 peerjs 1.5.4）
   功能：
   - HTTP  GET /yqks/peerjs/id?ts=..&version=..  -> 200 + 纯文本随机 id（兼容 retrieveId）
   - HTTP  GET /health                           -> JSON {ok, port, peers}
   - WS    /yqks/peerjs?id=..&token=..&key=..    -> OPEN + OFFER/ANSWER/CANDIDATE/LEAVE 转发
   - 心跳 HEARTBEAT 忽略（不刷日志）
   启动：npm install && npm start   （默认端口 9000，配合 SakuraFrp TCP 隧道）
   注意：游戏数据走 WebRTC DataChannel，本进程只做信令，不是 TURN 中继。 */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 9000;
const KEY = 'peerjs';
const peers = {};   /* id -> { socket, token, ip } */

function log(msg){
  console.log('[' + new Date().toLocaleTimeString() + '] ' + msg);
}
function genId(){
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var s = '';
  for(var i=0;i<10;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function pathnameOf(url){
  var q = (url || '').split('?')[0];
  return q || '/';
}

const server = http.createServer(function(req, res){
  var url = req.url || '/';
  var path = pathnameOf(url);
  cors(res);
  if(req.method === 'OPTIONS'){
    res.writeHead(204);
    res.end();
    return;
  }
  if(path === '/yqks/peerjs/id' || path === '/yqks/peerjs/id/'){
    var id = genId();
    log('HTTP 分配 id: ' + id + '  (' + (req.socket && req.socket.remoteAddress) + ')');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(id);
    return;
  }
  if(path === '/health' || path === '/yqks/health'){
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      port: Number(PORT),
      peers: Object.keys(peers).length,
      ids: Object.keys(peers)
    }));
    return;
  }
  if(path === '/' || path === '/yqks' || path === '/yqks/' || path === '/yqks/peerjs' || path === '/yqks/peerjs/'){
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('yqks signaling ok\nGET /health\nGET /yqks/peerjs/id\nWS  /yqks/peerjs?id=&token=&key=peerjs\n');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server: server });

wss.on('connection', function(socket, req){
  var u;
  try{ u = new URL(req.url || '/', 'http://localhost'); }
  catch(e){
    socket.close();
    return;
  }
  if(u.pathname !== '/yqks/peerjs' && u.pathname !== '/yqks/peerjs/'){
    log('拒绝非信令路径: ' + u.pathname);
    socket.close();
    return;
  }
  var id = u.searchParams.get('id');
  var token = u.searchParams.get('token');
  var key = u.searchParams.get('key');
  var ip = req.socket && req.socket.remoteAddress;

  log('连接: ' + id + '  (' + ip + ')');
  if(!id || !token || !key){
    socket.send(JSON.stringify({ type:'ERROR', payload:{ msg:'No id, token, or key supplied to websocket server' } }));
    socket.close();
    return;
  }
  if(key !== KEY){
    socket.send(JSON.stringify({ type:'INVALID-KEY', payload:{ msg:'API KEY "' + key + '" is invalid' } }));
    socket.close();
    return;
  }
  if(peers[id]){
    socket.send(JSON.stringify({ type:'ID-TAKEN', payload:{ msg:'ID is taken' } }));
    socket.close();
    return;
  }
  peers[id] = { socket: socket, token: token, ip: ip };
  socket.send(JSON.stringify({ type:'OPEN' }));
  log('✔ 已注册: ' + id + '  （当前在线 ' + Object.keys(peers).length + '）');

  socket.on('message', function(data){
    var msg;
    try{ msg = JSON.parse(data.toString()); }catch(e){ return; }
    if(!msg || !msg.type) return;
    if(msg.type === 'HEARTBEAT' || msg.type === 'OPEN') return;
    if(['OFFER','ANSWER','CANDIDATE','LEAVE'].indexOf(msg.type) >= 0){
      var dst = msg.dst;
      var target = peers[dst];
      if(target && target.socket && target.socket.readyState === 1){
        target.socket.send(JSON.stringify({ type: msg.type, src: id, dst: dst, payload: msg.payload }));
        log('转发 ' + msg.type + ': ' + id + ' -> ' + dst);
      } else {
        log('⚠ 目标不存在或离线: ' + dst + '  （' + msg.type + ' from ' + id + '）');
      }
      return;
    }
    log('未知消息类型: ' + msg.type);
  });

  socket.on('close', function(){
    if(peers[id] && peers[id].socket === socket){
      delete peers[id];
      log('断开: ' + id + '  （剩余在线 ' + Object.keys(peers).length + '）');
    }
  });
  socket.on('error', function(e){
    log('socket 错误 (' + id + '): ' + (e && e.message || e));
  });
});

/* ws 库会把底层 server 的 error 转发到 WebSocketServer 实例上，必须挂在这里 */
wss.on('error', function(err){
  if(err && err.code === 'EADDRINUSE'){
    console.error('==============================================');
    console.error('  端口 ' + PORT + ' 已被占用！');
    console.error('  常见占用者：网易 UU 加速器（uu.exe，占用 9000 做本地代理）、');
    console.error('  或已有一个信令实例在运行（start-server.ps1 弹的 cmd 窗口）。');
    console.error('  处理：');
    console.error('    1) 退出 UU 加速器后重试；或换端口：');
    console.error('       set YQKS_PORT=9001 && npm start   （SakuraFrp 隧道本地端口同步改）');
    console.error('    2) 或先结束占用进程再启动：');
    console.error('       netstat -ano | findstr :' + PORT);
    console.error('       taskkill /PID <占用进程PID> /F');
    console.error('==============================================');
  } else {
    console.error('服务器错误: ' + (err && err.message || err));
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', function(){
  console.log('==============================================');
  console.log('  元气骑士 P2P 联机信令服务器（自研版）');
  console.log('  本地端口: ' + PORT);
  console.log('  兼容 peerjs 1.5.4（HTTP /id + WebSocket 转发）');
  console.log('  健康检查: http://127.0.0.1:' + PORT + '/health');
  console.log('  配合 SakuraFrp TCP 隧道映射到公网（本地端口必须是 ' + PORT + '）');
  console.log('  按 Ctrl+C 停止');
  console.log('==============================================');
});
