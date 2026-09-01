/* 完整信令服务器测试 */
const WebSocket = require('ws');
const url = 'ws://127.0.0.1:9000/yqks/peerjs?id=test-client-1&token=testtoken&key=peerjs';
const ws = new WebSocket(url);
let gotOpen = false;
const timeout = setTimeout(() => {
  console.log(gotOpen ? '（超时但已收到 OPEN）' : '连接超时，未收到 OPEN');
  process.exit(gotOpen ? 0 : 1);
}, 6000);
ws.on('open', () => { console.log('✔ 连接成功'); });
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('收到:', JSON.stringify(msg).slice(0, 150));
  if (msg.type === 'OPEN') {
    gotOpen = true;
    console.log('✔ 信令服务器握手成功');
    // 模拟 peerjs 客户端注册
    ws.send(JSON.stringify({type:'OPEN', src:'test-client-1'}));
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  }
});
ws.on('close', () => { console.log('连接关闭'); if (!gotOpen) process.exit(1); });
ws.on('error', (e) => { console.log('✗ 错误:', e.message); process.exit(1); });
