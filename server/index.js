/* 元气骑士·深渊回响 —— P2P 联机信令服务器（自研版，兼容 peerjs 1.5.4）
   功能：
   - HTTP  GET /yqks/peerjs/id?ts=..&version=..  -> 200 + 纯文本随机 id（客机 retrieveId 用）
   - WS    /yqks/peerjs?id=..&token=..&key=..   -> OPEN + OFFER/ANSWER/CANDIDATE/LEAVE 转发
   - 心跳 HEARTBEAT 忽略（不刷日志）
   - 所有日志实时输出到控制台（cmd 窗口）
   启动：npm install && npm start   （默认端口 9000，配合 SakuraFrp TCP 隧道） */
const http = require('http');
const WebSocketServer = require('ws').Server;  /* ws 1.x API */

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

/* ---------- HTTP：获取随机 id ---------- */
const server = http.createServer(function(req, res){
  var url = req.url || '';
  if(url.indexOf('/yqks/peerjs/id') === 0){
    var id = genId();
    log('HTTP 分配 id: ' + id + '  (' + req.socket.remoteAddress + ')');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(id);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

/* ---------- WebSocket：信令转发 ---------- */
const wss = new WebSocketServer({ server: server, path: '/yqks/peerjs' });

wss.on('connection', function(socket){
  var req = socket.upgradeReq;  /* ws 1.x：upgradeReq 挂在 socket 上 */
  var u = new URL(req.url, 'http://localhost');
  var id = u.searchParams.get('id');
  var token = u.searchParams.get('token');
  var key = u.searchParams.get('key');
  var ip = req.socket.remoteAddress;

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
    try{ msg = JSON.parse(data); }catch(e){ return; }
    if(!msg || !msg.type) return;
    if(msg.type === 'HEARTBEAT'){
      /* 心跳：忽略（peerjs 1.5.4 不检测响应） */
      return;
    }
    if(msg.type === 'OPEN'){
      /* 客户端注册确认 */
      return;
    }
    if(['OFFER','ANSWER','CANDIDATE','LEAVE'].indexOf(msg.type) >= 0){
      var dst = msg.dst;
      var target = peers[dst];
      if(target && target.socket.readyState === 1){
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

server.listen(PORT, function(){
  console.log('==============================================');
  console.log('  元气骑士 P2P 联机信令服务器（自研版）');
  console.log('  本地端口: ' + PORT);
  console.log('  兼容 peerjs 1.5.4（HTTP /id + WebSocket 转发）');
  console.log('  配合 SakuraFrp TCP 隧道映射到公网');
  console.log('  按 Ctrl+C 停止');
  console.log('==============================================');
});
