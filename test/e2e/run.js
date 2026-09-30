/* 虚拟双浏览器 P2P 端到端测试
   每个虚拟浏览器 = 独立 vm 世界：加载真实 js/vendor/peerjs.min.js + 全部游戏脚本，
   WebSocket 用真实 ws 客户端、WebRTC 用真实 @roamhq/wrtc（本机 DataChannel）。
   场景A：信令在线，主机建房 + 客机加入 + 大厅 joined + welcome + 快照同步。
   场景B：信令离线，复现 "network Lost connection to server." 报错（用户原始故障）。
   用法：node run.js   （自动拉起独立信令实例于 9100 端口，不动用户 9000） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');
const WsClient = require('ws');
const wrtc = require('@roamhq/wrtc');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server');
const JSDIR = path.join(ROOT, 'js');
const PORT = 9100;   // 独立端口，避免与用户 9000 冲突

let passed = 0, failed = 0;
function ok(cond, msg){
  if(cond){ passed++; console.log('  ✔ ' + msg); }
  else{ failed++; console.log('  ✗ ' + msg); }
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function until(fn, ms, what){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){
    try{ const v = fn(); if(v) return v; }catch(e){}
    await sleep(50);
  }
  throw new Error('超时等待: ' + what);
}

/* ---------- 浏览器 WebSocket 适配层（真实 ws 客户端） ---------- */
class BrowserWebSocket {
  constructor(url){
    this.readyState = 0;
    this.binaryType = 'arraybuffer';
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    const w = new WsClient(url);
    this._w = w;
    w.on('open', () => { this.readyState = 1; if(this.onopen) this.onopen({}); });
    w.on('message', (data) => { if(this.onmessage) this.onmessage({ data: data.toString() }); });
    w.on('close', (code, reason) => {
      this.readyState = 3;
      if(this.onclose) this.onclose({ code: code, reason: reason && reason.toString ? reason.toString() : String(reason||'') });
    });
    w.on('error', (e) => { if(this.onerror) this.onerror(e instanceof Error ? e : new Error(String(e && e.message || e))); });
  }
  send(data){ this._w.send(data); }
  close(){ try{ this._w.close(); }catch(e){} }
}
BrowserWebSocket.CONNECTING = 0;
BrowserWebSocket.OPEN = 1;
BrowserWebSocket.CLOSING = 2;
BrowserWebSocket.CLOSED = 3;

/* ---------- 虚拟浏览器工厂 ---------- */
function createWorld(){
  const store = {};
  const grad = { addColorStop(){} };
  const sandbox = {
    console: console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, Blob, ArrayBuffer, Uint8Array, Uint8ClampedArray,
    Date, Math, JSON,
    WebSocket: BrowserWebSocket,
    RTCPeerConnection: wrtc.RTCPeerConnection,
    RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate,
    navigator: {},
    location: { protocol:'http:', hostname:'127.0.0.1' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    document: {
      readyState: 'complete',
      getElementById(id){
        if(id === 'game') return makeCanvas(640,360);
        if(id === 'hud') return makeCanvas(1280,720);
        return null;
      },
      createElement(){ return makeCanvas(); },
      querySelectorAll(){ return []; },
      addEventListener(){}
    },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(){}, removeEventListener(){},
    requestAnimationFrame(){ return 0; },
    AudioContext: undefined, webkitAudioContext: undefined
  };
  function makeCanvas(w,h){
    return {
      width: w||300, height: h||150, style:{},
      getContext(){ return ctxProxy(); },
      getBoundingClientRect(){ return {left:0,top:0,width:640,height:360,right:640,bottom:360}; },
      addEventListener(){}, removeEventListener(){}
    };
  }
  function ctxProxy(){
    return new Proxy({}, {
      get(t,p){
        if(p in store) return store[p];
        if(p === 'canvas') return {width:640,height:360};
        if(p === 'measureText') return () => ({width:20});
        if(p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
        if(p === 'getImageData') return () => ({data:new Uint8ClampedArray(4)});
        if(typeof p === 'symbol') return undefined;
        return () => {};
      },
      set(t,p,v){ store[p] = v; return true; },
      has(){ return true; }
    });
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const files = [
    'vendor/peerjs.min.js', 'util.js', 'save.js', 'audio.js', 'art.js',
    'weapons.js', 'enemies.js', 'dungeon.js', 'entities.js', 'game.js',
    'lobby.js', 'net.js'
  ];
  for(const f of files){
    const code = fs.readFileSync(path.join(JSDIR, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

/* ---------- 信令服务器管理 ---------- */
function startServer(){
  const child = spawn(process.execPath, ['index.js'], {
    cwd: SERVER_DIR,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore','pipe','pipe'],
    windowsHide: true
  });
  let logs = '';
  child.stdout.on('data', d => logs += d.toString());
  child.stderr.on('data', d => logs += d.toString());
  return { child, logs: () => logs };
}
async function waitHealth(ms){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){
    const okBody = await new Promise((resolve) => {
      try{
        http.get('http://127.0.0.1:' + PORT + '/health', res => {
          let body=''; res.on('data',d=>body+=d); res.on('end',()=>{
            resolve(res.statusCode===200 && body.indexOf('"ok":true')>=0);
          });
        }).on('error', () => resolve(false));
      }catch(e){ resolve(false); }
    });
    if(okBody) return true;
    await sleep(120);
  }
  throw new Error('超时等待: 信令 /health');
}

/* ---------- 场景 A：在线联机全链路 ---------- */
async function scenarioOnline(){
  console.log('=== 场景A：信令在线，主机+客机全链路 ===');
  const server = startServer();
  try{
    await waitHealth(10000);
    ok(true, '信令 ' + PORT + ' /health 就绪');

    const A = createWorld();
    const B = createWorld();
    const gA = new A.G.Game(); gA.init(); gA.enterLobby();
    gA.onUpgrade=()=>{}; gA.onGameOver=()=>{}; gA.onWin=()=>{};
    const gB = new B.G.Game(); gB.init(); gB.enterLobby();
    gB.onUpgrade=()=>{}; gB.onGameOver=()=>{}; gB.onWin=()=>{};

    /* 主机创建房间 */
    const hostRes = await new Promise((resolve) => {
      A.G.Net.host(gA, 'ABCD12', '127.0.0.1:' + PORT, resolve);
    });
    ok(hostRes && hostRes.ok, '主机创建房间: ' + JSON.stringify(hostRes||{}));

    /* 客机加入 */
    const joinRes = await new Promise((resolve) => {
      B.G.Net.join(gB, 'ABCD12', '127.0.0.1:' + PORT, 'mage', resolve);
    });
    ok(joinRes && joinRes.ok, '客机加入成功: ' + JSON.stringify(joinRes||{}));

    /* 主机大厅登记客机（无 map，不发 welcome） */
    await until(() => A.G.Net.g && A.G.Net.g.guest && A.G.Net.g.players && A.G.Net.g.players.length===2, 5000, '主机大厅登记客机');
    ok(A.G.Net.g.map === undefined || !A.G.Net.g.map, '大厅阶段尚无地图');
    ok(A.G.Net.g.players.length === 2, '大厅 players=2（主机+客机）');
    ok(A.G.Net.g.guest.hero.id === 'mage', '大厅客机英雄=法师');

    /* 主机传送门开局 → keepGuest，newFloor 自动广播 floor 消息 */
    gA.start('knight', { keepGuest: true });
    ok(gA.players.length === 2, '开局后 players 仍是 2');
    ok(gA.guest.hero.id === 'mage', '开局保留法师客机');
    ok(gA.netMode === 'host', '主机 netMode=host');

    /* 客机收到 floor → 重建地图 */
    await until(() => B.G.Net.g && B.G.Net.g.netMode==='client' && B.G.Net.g.map, 8000, '客机收到 floor 同步');
    ok(gB.netMode === 'client', '客机 netMode=client');
    ok(gB.map && gB.map.seed === gA.map.seed, '客机地图种子一致 seed=' + gA.map.seed);
    ok(gB.player.hero.id === 'mage', '客机本地玩家=自己的法师');
    ok(gB.guest && gB.guest.hero.id === 'knight', '客机远端玩家=主机骑士');

    /* 快照同步：主机发快照，客机应用（本地吃 p[1]） */
    await until(() => A.G.Net.conn && A.G.Net.conn.open && B.G.Net.conn && B.G.Net.conn.open, 5000, '双方 DataChannel');
    A.G.Net.snapT = A.G.Net.snapInterval;   /* 跳过 0.066s 节流 */
    A.G.Net.update(gA, 1/30);   /* 主机发一帧快照 */
    await sleep(200);
    B.G.Net.update(gB, 1/30);   /* 客机应用快照并回发输入 */
    await sleep(200);
    ok(B.G.Net.snap && B.G.Net.snap.p && B.G.Net.snap.p.length===2, '客机收到 p[0..1] 双玩家快照');
    if(B.G.Net.snap && B.G.Net.snap.p){
      ok(B.G.Net.snap.p[0].hero==='knight' && B.G.Net.snap.p[1].hero==='mage', '快照 p[0]=主机 p[1]=客机');
    }
    ok(Math.abs(gB.player.x - gA.guest.x) < 0.001 && Math.abs(gB.player.y - gA.guest.y) < 0.001,
      '客机本地位置=主机侧客机位置 (' + gB.player.x.toFixed(1) + ',' + gB.player.y.toFixed(1) + ')');

    /* 客机输入（真实 DataChannel）→ 主机客机移动 → 快照回传 */
    const gx0 = gA.guest.x;
    B.G.Input.keys = {}; B.G.Input.hits = {}; B.G.Input.down = false;
    B.G.Input.keys.d = true;                     /* 客机按 D 向右走 */
    B.G.Net.inputT = B.G.Net.inputInterval;      /* 跳过 0.033s 节流 */
    B.G.Net.update(gB, 1/30);                    /* 客机经真实 DC 发出 input */
    await until(() => {
      if(gA.guest && gA.guest.netInput && gA.guest.netInput.mvx === 1) return true;
      return false;
    }, 5000, '主机收到客机 mvx=1 输入');
    ok(!!(gA.guest && gA.guest.netInput && gA.guest.netInput.mvx === 1), '主机侧收到客机 mvx=1 输入（真实 DataChannel）');
    gA.update(1/60);                             /* 主机模拟一帧：客机玩家使用 netInput 移动 */
    const gxAfter = gA.guest.x;
    ok(gxAfter !== gx0, '主机侧客机收到输入并移动 (' + gx0.toFixed(1) + ' → ' + gxAfter.toFixed(1) + ')');

    /* 断开清理 */
    B.G.Net.leave(); A.G.Net.leave();
    ok(B.G.Net.state==='off' && A.G.Net.state==='off', '双方断开后状态 off');
    console.log('场景A 通过 ✔');
  } finally {
    try{ server.child.kill(); }catch(e){}
  }
}

/* ---------- 场景 B：信令离线，复现用户报错 ---------- */
async function scenarioOffline(){
  console.log('=== 场景B：信令离线，复现 network 报错 ===');
  const C = createWorld();
  const gC = new C.G.Game(); gC.init(); gC.enterLobby();
  gC.onUpgrade=()=>{}; gC.onGameOver=()=>{}; gC.onWin=()=>{};
  /* 指向一个无人监听的端口（模拟信令未启动 / 隧道端口错） */
  const res = await new Promise((resolve) => {
    C.G.Net.host(gC, 'XXXX22', '127.0.0.1:' + (PORT + 1), resolve);
    setTimeout(() => resolve({ ok:false, error:'test-timeout' }), 15000);
  });
  const logJoin = C.G.Net.logs.map(l => l.type + ' ' + l.msg).join(' | ');
  ok(!res.ok, '创建房间失败（期望失败）: ' + JSON.stringify(res));
  ok(res.error === 'network', '错误类型=network（实际: ' + res.error + '）');
  ok(logJoin.indexOf('Lost connection to server') >= 0, '错误文案含 "Lost connection to server."');
  console.log('  联机日志: ' + logJoin);
  console.log('场景B 通过 ✔（这就是用户 22:41:39 报错：信令连接被拒/不可达）');
}

(async () => {
  console.log('虚拟双浏览器 P2P 端到端测试（' + new Date().toISOString() + '）');
  console.log('Node ' + process.version + ', wrtc ' + (require('@roamhq/wrtc/package.json').version || '?'));
  await scenarioOnline();
  await scenarioOffline();
  console.log('\n结果: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('测试异常: ' + (e && e.stack || e));
  process.exit(1);
});
