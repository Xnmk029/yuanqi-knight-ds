/* 联机协议层测试（不依赖真实 WebRTC，验证消息处理与快照逻辑） */
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
global.Peer=function(){ this.on=function(){}; this.connect=function(){ return {on:function(){},open:false}; }; this.destroy=function(){}; };
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','net.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 快照构建 */
console.log('=== 1. 快照构建 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
g.players=[g.player];
g.spawnEnemy('slime', 200, 200, {});
g.spawnBullet({x:100,y:100,ang:0,spd:100,dmg:1,r:3,color:'#fff',team:'player'});
const snap=G.Net.buildSnap(g);
check(snap.t==='snap', '快照类型');
check(snap.p.length===1 && snap.p[0].x===p.x, '玩家快照');
check(snap.e.length===1 && snap.e[0].id==='slime', '敌人快照');
check(snap.b.length===1, '子弹快照');

/* 2. 主机收到 hello → 创建客机玩家 */
console.log('=== 2. 客机玩家创建 ===');
G.Net.state='host';
G.Net.g=g;
G.Net.conn={open:true, send:function(){}};
let sent=null;
G.Net.send=function(msg){ sent=msg; };
G.Net.onData(g, {t:'hello', hero:'mage'});
check(!!g.guest, '客机玩家创建');
check(g.guest.hero.id==='mage', '客机英雄=法师');
check(g.players.length===2, 'players 数组 2 人');
check(sent && sent.t==='welcome', '发送 welcome');
check(sent.seed===g.map.seed, 'welcome 含种子');

/* 3. 客机输入驱动 */
console.log('=== 3. 客机输入 ===');
const gx0=g.guest.x;
G.Net.onData(g, {t:'input', mvx:1, mvy:0, aim:0, down:false, keys:{}});
const IN=G.Input;
IN.keys={}; IN.hits={}; IN.down=false;
g.update(1/60);
check(g.guest.x!==gx0, '客机玩家移动 x='+g.guest.x.toFixed(1)+' (原 '+gx0.toFixed(1)+')');

/* 4. 客机 welcome → 重建地图 */
console.log('=== 4. 客机 welcome ===');
const g2=new G.Game();
g2.init(); g2.start('knight');
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
G.Net.state='client';
G.Net.g=g2;
G.Net.conn={open:true, send:function(){}};
G.Net.onData(g2, {t:'welcome', hero:'knight', seed:12345, floor:1});
check(g2.netMode==='client', '客机 netMode=client');
check(g2.state==='playing', '客机进入游戏');
check(g2.map.seed===12345, '客机地图种子一致');

/* 5. 客机快照应用 */
console.log('=== 5. 快照应用 ===');
G.Net.snap={t:'snap', p:[{x:500,y:400,hp:80,armor:20,energy:30,wi:0,aim:1,dead:false}],
  e:[{x:300,y:300,hp:10,mh:26,id:'slime'}],
  b:[{x:150,y:150,vx:100,vy:0,tm:'player'}]};
G.Net.applySnap(g2);
check(g2.player.x===500 && g2.player.y===400, '玩家位置同步');
check(g2.player.hp===80, '玩家血量同步');
check(g2.enemies.length===1 && g2.enemies[0].hp===10, '敌人同步');
check(g2.bullets.length===1 && g2.bullets[0].x===150, '子弹同步');

/* 6. 客机模式 update 不跑敌人 AI */
console.log('=== 6. 客机模式 ===');
const e0=g2.enemies[0];
const ex0=e0.x;
const IN2=G.Input;
IN2.keys={}; IN2.hits={}; IN2.down=false;
g2.update(1/60);
check(e0.x===ex0, '客机模式敌人不移动（快照驱动）');

/* 7. 断开清理 */
console.log('=== 7. 断开 ===');
G.Net.state='host';
G.Net.g=g;
G.Net.conn={open:true, close:function(){}};
G.Net.onDisconnect();
check(G.Net.state==='off', '断开后状态 off');
check(!g.guest, '客机玩家移除');

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n联机协议层测试通过 ✔');
