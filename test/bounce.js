/* 子弹反弹回归测试（确定性：手工构造墙/障碍物场景） */
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
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, Dn=G.Dungeon;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 构造确定性场景：20x20 地图，x=10 列是墙 */
function makeMap(){
  const map={ tw:20, th:20, TS:20, tiles:new Uint8Array(400), doorAt:{}, doors:[] };
  for(let y=0;y<20;y++) for(let x=0;x<20;x++) map.tiles[y*20+x]=1;
  for(let y=0;y<20;y++) map.tiles[y*20+10]=2; /* 垂直墙 */
  for(let x=0;x<20;x++) map.tiles[10*20+x]=2; /* 水平墙 */
  return map;
}
const g={ map:makeMap(), props:[], enemies:[], bullets:[], parts:[], fx:[], floats:[],
  bulletSolidAt:function(x,y){ return Dn.bulletSolidAt(this.map,x,y); },
  burst:function(){}, spawnParticle:function(){}, damageEnemy:function(){}, player:{dmgMult:1} };

function runBullet(x,y,ang,spd,bounce){
  const b=new G.Bullet({x:x,y:y,ang:ang,spd:spd,dmg:5,r:3,color:'#fff',shape:'ball',team:'player',bounce:bounce,life:5});
  g.bullets=[b];
  let bounced=false, killed=false;
  const vx0=b.vx, vy0=b.vy;
  for(let i=0;i<600;i++){
    b.update(1/60, g);
    if(b.dead){ killed=true; break; }
    if(b.vx*vx0+b.vy*vy0<0){ bounced=true; break; }
  }
  return {b, bounced, killed};
}

console.log('=== 1. 水平撞墙（bounce=1） ===');
{
  const r=runBullet(100,100,0,400,1); /* 从 (100,100) 向右，墙在 x=200 */
  check(r.bounced, '反弹成功');
  check(!r.killed, '未消失');
  check(r.b.x<200, '反弹位置在墙外 x='+r.b.x.toFixed(0));
  check(r.b.vx<0, '反弹方向向左 vx='+r.b.vx.toFixed(0));
}
console.log('=== 2. 垂直撞墙（bounce=1） ===');
{
  const r=runBullet(100,100,Math.PI/2,400,1); /* 向下，墙在 y=200 */
  check(r.bounced, '反弹成功');
  check(!r.killed, '未消失');
  check(r.b.y<200, '反弹位置在墙外 y='+r.b.y.toFixed(0));
  check(r.b.vy<0, '反弹方向向上 vy='+r.b.vy.toFixed(0));
}
console.log('=== 3. 慢速撞墙（bounce=1） ===');
{
  const r=runBullet(100,100,0,100,1);
  check(r.bounced, '慢速反弹成功');
  check(!r.killed, '慢速未消失');
  check(r.b.x<200, '慢速反弹位置在墙外 x='+r.b.x.toFixed(0));
}
console.log('=== 4. 无 bounce 撞墙消失 ===');
{
  const r=runBullet(100,100,0,400,0);
  check(r.killed, '无 bounce 撞墙消失（正确行为）');
}
console.log('=== 5. 斜角撞墙（bounce=2） ===');
{
  const r=runBullet(100,100,Math.PI/4,400,2);
  check(r.bounced, '斜角反弹成功');
  check(!r.killed, '斜角未消失');
}
console.log('=== 6. 障碍物反弹（props） ===');
{
  /* 在墙前放一个 solid prop */
  g.props=[{x:180,y:100,r:9,solid:true,breakable:false,dead:false}];
  const r=runBullet(100,100,0,400,1);
  check(r.bounced, '障碍物反弹成功');
  check(!r.killed, '障碍物未消失');
  g.props=[];
}

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n子弹反弹回归测试通过 ✔');
