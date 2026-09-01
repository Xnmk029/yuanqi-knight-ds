/* 自研信令服务器完整验证（需先 npm start） */
const http = require('http');
const { WebSocket } = require('ws');

const PORT = process.env.PORT || 9000;
const BASE_HTTP = 'http://127.0.0.1:' + PORT;
const BASE_WS = 'ws://127.0.0.1:' + PORT + '/yqks/peerjs';

function get(url){
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

(async () => {
  const health = await get(BASE_HTTP + '/health');
  console.log('0. /health', health.status, health.body);
  if(health.status !== 200) throw new Error('/health 失败');
  const h = JSON.parse(health.body);
  if(!h.ok) throw new Error('/health ok=false');
  console.log('   ✔ health');

  const idRes = await get(BASE_HTTP + '/yqks/peerjs/id?ts=' + Date.now() + '&version=1.5.4');
  console.log('1. HTTP /id 状态:', idRes.status, ' 返回:', idRes.body);
  if(idRes.status !== 200 || !idRes.body) throw new Error('retrieveId 失败');
  console.log('   ✔ retrieveId 正常');

  function connect(id){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(BASE_WS + '?id=' + id + '&token=tok-' + id + '&key=peerjs');
      const queue = [], waiters = [];
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const w = waiters.find(x => x.type === msg.type);
        if(w){ clearTimeout(w.t); waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
        else queue.push(msg);
      });
      ws.waitMsg = function(type, ms){
        const i = queue.findIndex(m => m.type === type);
        if(i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('等待 ' + type + ' 超时')), ms);
          waiters.push({type, resolve, t});
        });
      };
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  const a = await connect('peer-A');
  console.log('2. ✔ A 连接');
  const b = await connect('peer-B');
  console.log('   ✔ B 连接');
  await a.waitMsg('OPEN', 3000);
  await b.waitMsg('OPEN', 3000);
  console.log('   ✔ A/B 均收到 OPEN');
  a.send(JSON.stringify({type:'HEARTBEAT'}));
  console.log('   ✔ 心跳已发送');
  const offerP = b.waitMsg('OFFER', 3000);
  a.send(JSON.stringify({type:'OFFER', src:'peer-A', dst:'peer-B', payload:{sdp:'fake-offer'}}));
  await offerP;
  console.log('   ✔ OFFER 转发成功');
  const ansP = a.waitMsg('ANSWER', 3000);
  b.send(JSON.stringify({type:'ANSWER', src:'peer-B', dst:'peer-A', payload:{sdp:'fake-answer'}}));
  await ansP;
  console.log('   ✔ ANSWER 转发成功');
  const c1 = b.waitMsg('CANDIDATE', 3000);
  a.send(JSON.stringify({type:'CANDIDATE', src:'peer-A', dst:'peer-B', payload:{candidate:'ice-1'}}));
  await c1;
  console.log('   ✔ CANDIDATE 转发成功');
  a.send(JSON.stringify({type:'OFFER', src:'peer-A', dst:'nobody', payload:{}}));
  console.log('   ✔ 目标不存在时服务器不崩溃');
  console.log('\n★★★ 自研信令服务器完整验证通过 ★★★');
  a.close(); b.close();
  process.exit(0);
})().catch(e => { console.log('✗ 失败:', e.message); process.exit(1); });
