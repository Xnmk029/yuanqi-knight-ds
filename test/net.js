/* 联机协议层测试（不依赖真实 WebRTC，验证消息处理、大厅开局与快照索引） */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');
function makeCtx(){
  const store={};
  const grad={addColorStop(){}};
  return new Proxy({},{
    get(t,p){
      if(p in store) return store[p];
      if(p==='canvas') return {width:640,height:360};
      if(p==='measureText') return ()=>({width:20});
      if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern') return ()=>grad;
      if(p==='getImageData') return ()=>({data:new Uint8ClampedArray(4)});
      if(typeof p==='symbol') return undefined;
      return ()=>{};
    },
    set(t,p,v){ store[p]=v; return true; },
    has(){ return true; }
  });
}
function makeCanvas(w,h){
  return { width:w||300, height:h||150, style:{},
    getContext(){ return makeCtx(); },
    getBoundingClientRect(){ return {left:0,top:0,width:640,height:360,right:640,bottom:360}; },
    addEventListener(){}, removeEventListener(){} };
}
const store={};
global.window=global;
global.localStorage={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=v;}, removeItem:k=>{delete store[k];} };
global.document={
  readyState:'complete',
  getElementById(id){
    if(id==='game') return makeCanvas(640,360);
    if(id==='hud') return makeCanvas(1280,720);
    return null;
  },
  createElement(t){ return makeCanvas(); },
  querySelectorAll(){ return []; },
  addEventListener(){}
};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=function(){}; global.removeEventListener=function(){};
global.requestAnimationFrame=function(){ return 0; };
global.AudioContext=undefined; global.webkitAudioContext=undefined;
global.Peer=function(id, opts){ this.id=id; this.opts=opts; this.on=function(){}; this.connect=function(){ return {on:function(){},open:false}; }; this.destroy=function(){}; };
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','net.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

function freshGame(hero){
  const g=new G.Game();
  g.init(); g.start(hero||'knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  return g;
}

/* 1. 快照构建 */
console.log('=== 1. 快照构建 ===');
const g=freshGame('knight');
g.players=[g.player];
g.spawnEnemy('slime', 200, 200, {});
g.spawnBullet({x:100,y:100,ang:0,spd:100,dmg:1,r:3,color:'#fff',team:'player'});
const snap=G.Net.buildSnap(g);
check(snap.t==='snap', '快照类型');
check(snap.p.length===1 && snap.p[0].x===g.player.x, '玩家快照');
check(snap.p[0].hero==='knight', '快照含主机英雄');
check(snap.e.length===1 && snap.e[0].id==='slime', '敌人快照');
check(snap.b.length===1, '子弹快照');
check(typeof g.map.seed==='number', '开局自动分配地图种子');

/* 2. 大厅 hello 不得读 map.seed，只发 joined */
console.log('=== 2. 大厅 hello（开局延迟同步） ===');
const lobby=new G.Game();
lobby.init();
lobby.enterLobby();
G.Net.state='host';
G.Net.g=lobby;
G.Net.conn={open:true, send:function(){}};
let sent=null;
G.Net.send=function(msg){ sent=msg; };
let threw=false;
try{ G.Net.onData(lobby, {t:'hello', hero:'mage'}); }catch(e){ threw=true; console.log('  抛错', e.message); }
check(!threw, '大厅 hello 不抛 TypeError');
check(!!lobby.guest, '大厅创建客机玩家');
check(lobby.guest.hero.id==='mage', '客机英雄=法师');
check(lobby.players.length===2, '大厅 players 数组 2 人');
check(sent && sent.t==='joined', '大厅只发 joined');
check(sent && sent.t!=='welcome' && sent.t!=='floor', '大厅不发楼层同步');
check(!G.Net.floorPayload(lobby), '无地图时 floorPayload 为空');
G.Net.onData(lobby, {t:'input', mvx:1, mvy:0, aim:0.5, down:false, keys:{}});
const gxL=lobby.guest.x;
G.Lobby.update(lobby, 1/30);
check(lobby.guest.x>gxL, '大厅客机可由网络输入移动');

/* 2b. 心跳 */
console.log('=== 2b. 心跳 ===');
G.Net.send=function(msg){ sent=msg; };
sent=null;
G.Net.onData(lobby, {t:'ping', ts:Date.now()-50});
check(sent && sent.t==='pong' && sent.ts, 'ping → pong 回显时间戳');
const rtt0=G.Net.rtt;
sent=null;
G.Net.onData(lobby, {t:'pong', ts:Date.now()-30});
check(G.Net.rtt>=0 && sent===null, 'pong 更新 rtt 且不回发');

/* 3. start(keepGuest) 开局后由 newFloor 自动广播 floor */
console.log('=== 3. 开局保留客机（自动 floor 同步） ===');
lobby.start('knight', {keepGuest:true});
check(!!lobby.guest, 'start(keepGuest) 后 guest 仍在');
check(lobby.players.length===2, '开局后仍是 2 名玩家');
check(lobby.guest.hero.id==='mage', '开局后客机仍是法师');
check(lobby.netMode==='host', '开局后 netMode=host');
check(lobby.guest.x===lobby.map.startX+40, '客机出生在 startX+40');
const ok=G.Net.sendFloor(lobby);
check(ok===true, 'sendFloor 成功');
check(sent && sent.t==='floor', 'floor 消息类型');
check(sent.seed===lobby.map.seed, 'floor 含种子');
check(sent.floor===lobby.floorNum, 'floor 含层数');
check(sent.you===1, 'floor.you=1（客机本地索引）');
check(sent.guestHero==='mage' && sent.hostHero==='knight', 'floor 含双方英雄');

/* 3b. 换层自动广播 floor */
console.log('=== 3b. 换层同步 ===');
sent=null;
const oldSeed=lobby.map.seed;
lobby.nextFloor();
check(sent && sent.t==='floor', 'nextFloor 自动发送 floor');
check(sent.seed!==undefined && sent.seed!==oldSeed, '新层新种子');
check(sent.floor===2, 'floor=2');
check(!lobby.guest.dead, '换层复活客机');
check(lobby.guest.x===lobby.map.startX+40, '换层客机回到出生点');

/* 4. 对局中 hello 被拒绝 */
console.log('=== 4. 对局中拒绝加入 ===');
const mid=freshGame('knight');
G.Net.state='host';
G.Net.g=mid;
sent=null;
G.Net.onData(mid, {t:'hello', hero:'assassin'});
check(sent && sent.t==='reject', '对局中 hello 返回 reject');
check(!mid.guest, '对局中不创建客机');

/* 5. 客机输入驱动（用 createGuest 直建，绕过大厅流程） */
console.log('=== 5. 客机输入 ===');
G.Net.state='host';
G.Net.g=g;
G.Net.createGuest(g, 'mage');
const gx0=g.guest.x;
G.Net.onData(g, {t:'input', mvx:1, mvy:0, aim:0, down:false, keys:{}});
const IN=G.Input;
IN.keys={}; IN.hits={}; IN.down=false;
g.update(1/60);
check(g.guest.x!==gx0, '客机玩家移动 x='+g.guest.x.toFixed(1)+' (原 '+gx0.toFixed(1)+')');

/* 5b. 边沿输入语义：事件帧只触发一次；按住不连发 */
console.log('=== 5b. 输入边沿 ===');
const gEdge=freshGame('knight');
G.Net.createGuest(gEdge, 'mage');
gEdge.guest.weapons=[Object.create(G.Weapons.list[0])];
gEdge.guest.weapons[0].cd=0; gEdge.guest.weapons[0].auto=false; gEdge.guest.weapons[0].energy=0;
gEdge.guest.weapons[0].type='gun'; gEdge.guest.weapons[0].count=1; gEdge.guest.weapons[0].spread=0;
gEdge.guest.wi=0;
gEdge.enemies.length=0;
G.Net.onData(gEdge, {t:'input', mvx:0, mvy:0, aim:0, down:true, keys:{}, ev:{atk:1}});
gEdge.update(1/60);
const bulletsAfterEdge=gEdge.bullets.length;
check(bulletsAfterEdge>0, '事件帧 atk 触发一次射击（子弹 '+bulletsAfterEdge+'）');
G.Net.onData(gEdge, {t:'input', mvx:0, mvy:0, aim:0, down:false, keys:{}});
const bBefore=gEdge.bullets.length;
gEdge.update(1/60);
check(gEdge.bullets.length===bBefore, '无事件帧不射击（非自动武器）');
/* 按住 shift 不应反复翻滚（hits 边沿语义而非 keys 级联） */
G.Net.onData(gEdge, {t:'input', mvx:0, mvy:0, aim:0, down:false, keys:{shift:1}});
gEdge.update(1/60);
const dodged=gEdge.guest.dodgeT>0;
gEdge.guest.dodgeT=0; gEdge.guest.dodgeCd=-1;
G.Net.onData(gEdge, {t:'input', mvx:0, mvy:0, aim:0, down:false, keys:{shift:1}});
gEdge.update(1/60);
check(!dodged, '按住 shift 无边沿不触发翻滚');
check(gEdge.guest.dodgeT===0, '持续按住不连发翻滚');
/* wheel 边沿切枪 */
gEdge.guest.weapons.push(Object.create(G.Weapons.list[1]));
G.Net.onData(gEdge, {t:'input', mvx:0, mvy:0, aim:0, down:false, keys:{}, ev:{wheel:1}});
gEdge.update(1/60);
check(gEdge.guest.wi===1, '滚轮事件帧切枪 wi=1');

/* 6. 客机 floor → 重建地图 */
console.log('=== 6. 客机楼层同步 ===');
const g2=freshGame('knight');
G.Net.state='client';
G.Net.g=g2;
G.Net.hero='mage';
G.Net.localIndex=1;
G.Net.conn={open:true, send:function(){}};
G.Net.onData(g2, {t:'floor', hostHero:'knight', guestHero:'mage', seed:12345, floor:1, you:1});
check(g2.netMode==='client', '客机 netMode=client');
check(g2.state==='playing', '客机进入游戏');
check(g2.map.seed===12345, '客机地图种子一致');
check(G.Net.localIndex===1, '客机 localIndex=1');
check(g2.player.hero.id==='mage', '客机本地玩家是自己选的英雄');
check(g2.guest && g2.guest.hero.id==='knight', '客机远端玩家是主机');
/* 换层：seed 变化后地图重建、玩家复用 */
g2.player.hp=33;
G.Net.onData(g2, {t:'floor', hostHero:'knight', guestHero:'mage', seed:777, floor:2, you:1});
check(g2.map.seed===777, '换层地图种子更新');
check(g2.floorNum===2, '换层楼层数更新');
check(g2.player.hero.id==='mage', '换层保留本地玩家英雄');
check(g2.guest && g2.guest.hero.id==='knight', '换层保留远端玩家');

/* 6b. 快照同步门/房间/传送门 */
console.log('=== 6b. 门/房间/传送门同步 ===');
const gSnap=freshGame('knight');
G.Net.createGuest(gSnap, 'mage');
gSnap.map.doors.forEach(function(d){ d.open=false; });
gSnap.map.doors[0].open=true;
gSnap.map.rooms[1].cleared=true;
gSnap.portal={x:555, y:444};
const snap2=G.Net.buildSnap(gSnap);
check(snap2.d && snap2.d.length===gSnap.map.doors.length, '快照含门状态');
check(snap2.d[0]===1 && snap2.d[1]===0, '门开合位正确');
check(snap2.r && snap2.r.length===gSnap.map.rooms.length, '快照含房间进度');
check((snap2.r[1]&2)!==0, '房间 cleared 位正确');
check(snap2.po && snap2.po.x===555, '快照含传送门');
/* 客机应用 */
const gc=freshGame('knight');
G.Net.state='client'; G.Net.g=gc; G.Net.localIndex=1;
gc.netMode='client';
gc.newFloor(1, gSnap.map.seed);
gc.inter=[];
G.Net.snap=snap2;
G.Net.applySnap(gc);
check(gc.map.doors[0].open===true, '客机门状态同步');
check(gc.map.rooms[1].cleared===true, '客机房间进度同步');
const cPortal=gc.inter.find(function(it){ return it.kind==='portal'; });
check(cPortal && cPortal.x===555 && cPortal.y===444, '客机生成传送门');

/* 7. 客机快照应用（本地吃 p[1]） */
console.log('=== 7. 快照索引 ===');
G.Net.localIndex=1;
G.Net.snap={t:'snap', p:[
  {x:111,y:222,hp:80,armor:20,energy:30,wi:0,aim:1,dead:false,hero:'knight'},
  {x:500,y:400,hp:70,armor:10,energy:40,wi:0,aim:2,dead:false,hero:'mage'}
], e:[{x:300,y:300,hp:10,mh:26,id:'slime'}], b:[{x:150,y:150,vx:100,vy:0,tm:'player'}]};
G.Net.applySnap(g2);
check(g2.player.x===500 && g2.player.y===400, '客机本地吃 p[1]');
check(g2.player.hp===70, '客机本地血量同步');
check(g2.guest && g2.guest.x===111 && g2.guest.y===222, '客机远端吃 p[0]');
check(g2.guest.aim===1, '远端玩家同步瞄准角');
check(g2.enemies.length===1 && g2.enemies[0].hp===10, '敌人同步');
check(g2.bullets.length===1 && g2.bullets[0].x===150, '子弹同步');

/* 8. 客机模式 update 不跑敌人 AI */
console.log('=== 8. 客机模式 ===');
const e0=g2.enemies[0];
const ex0=e0.x;
const IN2=G.Input;
IN2.keys={}; IN2.hits={}; IN2.down=false;
g2.update(1/60);
check(e0.x===ex0, '客机模式敌人不移动（快照驱动）');

/* 9. Peer 配置 */
console.log('=== 9. Peer 配置 ===');
const id=G.Net.randomPeerId('yqksg-');
check(/^yqksg-[a-z0-9]{10}$/.test(id), '客机随机 ID 格式 '+id);
const optsLan=G.Net.peerOpts('127.0.0.1:9000');
check(optsLan.host==='127.0.0.1' && optsLan.port===9000 && optsLan.path==='/yqks', '解析 host/port/path');
check(optsLan.secure===false, '局域网默认 insecure');
check(optsLan.config && optsLan.config.iceServers && optsLan.config.iceServers.length>=2, '含 STUN iceServers');
const optsWss=G.Net.peerOpts('wss://frp-off.com:44330');
check(optsWss.secure===true && optsWss.host==='frp-off.com' && optsWss.port===44330, 'wss:// 前缀强制 TLS');
const optsWs=G.Net.peerOpts('ws://example.com:9000');
check(optsWs.secure===false, 'ws:// 前缀强制明文');
const oldLoc=global.location;
global.location={protocol:'https:'};
const optsHttps=G.Net.peerOpts('frp-off.com:44330');
check(optsHttps.secure===true, 'https 页面默认 secure');
global.location={protocol:'https:'};
const optsHttpsLocal=G.Net.peerOpts('127.0.0.1:9000');
check(optsHttpsLocal.secure===false, 'https 页面连 localhost 仍明文');
global.location=oldLoc;
store.yqks_turn=JSON.stringify({urls:'turn:example.com:3478', username:'u', credential:'p'});
const optsTurn=G.Net.peerOpts('127.0.0.1:9000');
check(optsTurn.config.iceServers.some(function(s){ return s.urls==='turn:example.com:3478'; }), '可注入 TURN');
delete store.yqks_turn;

/* 10. 断开清理 */
console.log('=== 10. 断开 ===');
G.Net.state='host';
G.Net.g=g;
G.Net.conn={open:true, close:function(){}};
G.Net.onDisconnect();
check(G.Net.state==='off', '断开后状态 off');
check(!g.guest, '客机玩家移除');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n联机协议层测试通过 ✔');
