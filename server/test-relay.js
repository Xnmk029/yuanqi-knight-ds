/* 双客户端信令转发测试（消息队列版） */
const WebSocket = require('ws');
const BASE = 'ws://127.0.0.1:9000/yqks/peerjs';
function connect(id){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE + '?id=' + id + '&token=tok-' + id + '&key=peerjs');
    const queue = [];
    const waiters = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const w = waiters.find(x => x.type === msg.type);
      if (w) { clearTimeout(w.t); waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
      else queue.push(msg);
    });
    ws.waitMsg = function(type, timeoutMs){
      const i = queue.findIndex(m => m.type === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { const j = waiters.findIndex(x => x.type === type); if (j>=0) waiters.splice(j,1); reject(new Error('等待 '+type+' 超时')); }, timeoutMs);
        waiters.push({type, resolve, t});
      });
    };
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
(async () => {
  const a = await connect('peer-A');
  console.log('✔ A 连接');
  const b = await connect('peer-B');
  console.log('✔ B 连接');
  await a.waitMsg('OPEN', 3000);
  await b.waitMsg('OPEN', 3000);
  console.log('✔ A/B 均收到 OPEN');
  const offerP = b.waitMsg('OFFER', 3000);
  a.send(JSON.stringify({type:'OFFER', src:'peer-A', dst:'peer-B', payload:{sdp:'fake-offer'}}));
  const offer = await offerP;
  console.log('✔ B 收到 OFFER:', JSON.stringify(offer.payload));
  const ansP = a.waitMsg('ANSWER', 3000);
  b.send(JSON.stringify({type:'ANSWER', src:'peer-B', dst:'peer-A', payload:{sdp:'fake-answer'}}));
  const ans = await ansP;
  console.log('✔ A 收到 ANSWER:', JSON.stringify(ans.payload));
  const c1 = b.waitMsg('CANDIDATE', 3000);
  a.send(JSON.stringify({type:'CANDIDATE', src:'peer-A', dst:'peer-B', payload:{candidate:'ice-1'}}));
  await c1;
  console.log('✔ CANDIDATE 转发成功');
  console.log('\n★★★ 信令服务器端到端测试通过 ★★★');
  a.close(); b.close();
  process.exit(0);
})().catch(e => { console.log('✗ 失败:', e.message); process.exit(1); });
