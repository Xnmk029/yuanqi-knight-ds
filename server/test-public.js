/* 公网信令验证工具：node test-public.js <host:port>
   用于验证 SakuraFrp 隧道是否支持 WebSocket（TCP 隧道应握手成功，HTTP 隧道会报 501） */
const WebSocket = require('ws');
const addr = process.argv[2] || '127.0.0.1:9000';
let proto = 'ws';
let hostPort = addr;
if (addr.indexOf('wss://') === 0) { proto = 'wss'; hostPort = addr.slice(6); }
else if (addr.indexOf('ws://') === 0) { hostPort = addr.slice(5); }
const parts = hostPort.split(':');
const host = parts[0], port = parseInt(parts[1], 10) || 9000;
const url = proto + '://' + host + ':' + port + '/yqks/peerjs?id=pub-test-' + Date.now() + '&token=testtoken&key=peerjs';
const wsOpts = { handshakeTimeout: 8000 };
if (proto === 'wss') wsOpts.rejectUnauthorized = false; /* 自签证书：跳过验证（仅测试） */
console.log('测试地址:', url);
const ws = new WebSocket(url, wsOpts);
const timeout = setTimeout(() => { console.log('✗ 连接超时'); process.exit(1); }, 10000);
ws.on('open', () => { console.log('✔ WebSocket 连接成功'); });
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('收到:', JSON.stringify(msg).slice(0, 120));
  if (msg.type === 'OPEN') { clearTimeout(timeout); console.log('✔ 信令握手成功（隧道正常）'); ws.close(); process.exit(0); }
});
ws.on('close', (code, reason) => { clearTimeout(timeout); console.log('连接关闭 code=' + code + ' reason=' + reason.toString()); process.exit(1); });
ws.on('error', (e) => { clearTimeout(timeout); console.log('✗ 错误:', e.message); process.exit(1); });
