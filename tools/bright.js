const fs=require('fs'), path=require('path'), vm=require('vm');
const { createCanvas, loadImage } = require(path.join(__dirname,'node_modules','@napi-rs','canvas'));
const ROOT=path.join(__dirname,'..'), OUT=path.join(ROOT,'shots');
const gameCv=createCanvas(640,360), hudCv=createCanvas(1280,720);
function wrap(cv,rect){ return new Proxy(cv,{ get(t,p){ if(p==='style')return{}; if(p==='getBoundingClientRect')return()=>rect;
  if(p==='addEventListener'||p==='removeEventListener')return()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; },
  set(t,p,v){ if(p!=='style') t[p]=v; return true; } }); }
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.document={ readyState:'complete',
  getElementById(id){ if(id==='game')return wrap(gameCv,{left:0,top:0,width:1280,height:720});
                      if(id==='hud')return wrap(hudCv,{left:0,top:0,width:1280,height:720}); return null; },
  createElement:()=>createCanvas(1,1), querySelectorAll:()=>[], addEventListener(){} };
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=()=>{}; global.removeEventListener=()=>{}; global.requestAnimationFrame=()=>0;
for(const f of ['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G;

function measure(biome, light){
  const g=new G.Game(); g.init(); g.start('knight');
  g.onUpgrade=(p)=>{g.applyBuff(p[0]);}; g.onGameOver=()=>{}; g.onWin=()=>{};
  g.opts.light=light;
  if(biome>0) g.newFloor(biome+1);
  const p=g.player; p.hp=1e6; p.maxHp=1e6;
  let room=g.map.rooms.filter(r=>r.type==='normal')[0]||g.map.startRoom;
  p.x=room.cx; p.y=room.cy; g.cam.x=p.x-320; g.cam.y=p.y-180;
  for(let i=0;i<80;i++){ G.Input.keys={}; G.Input.hits={}; p.hp=1e6; p.iframe=1; g.update(1/60); G.Input.end(); }
  g.draw();
  const c=gameCv.getContext('2d');
  // 只统计房间内区域（画面中心 480x260）
  const d=c.getImageData(80,50,480,260).data;
  let sum=0,n=480*260,dark=0;
  for(let i=0;i<n;i++){ const l=d[i*4]*0.3+d[i*4+1]*0.59+d[i*4+2]*0.11; sum+=l; if(l<25) dark++; }
  return {mean:+(sum/n).toFixed(1), darkPct:+(100*dark/n).toFixed(1)};
}
console.log('生物群系'.padEnd(14)+'开启光影'.padEnd(24)+'关闭光影');
for(let b=0;b<6;b++){
  const on=measure(b,true), off=measure(b,false);
  console.log(G.Art.BIOMES[b].name.padEnd(10)+
    ('亮度 '+on.mean+' / 暗部 '+on.darkPct+'%').padEnd(26)+
    ('亮度 '+off.mean+' / 暗部 '+off.darkPct+'%'));
}
