/* 用 @napi-rs/canvas 渲染真实游戏帧为 PNG */
const fs=require('fs'), path=require('path'), vm=require('vm');
const { createCanvas } = require(path.join(__dirname,'node_modules','@napi-rs','canvas'));
const ROOT=path.join(__dirname,'..');
const OUT=path.join(ROOT,'shots');
if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});

const VW=1280, VH=720, SC=2;
const gameCv=createCanvas(640,360), hudCv=createCanvas(VW,VH);
function wrap(cv, rect){
  return new Proxy(cv,{
    get(t,p){
      if(p==='style') return {};
      if(p==='getBoundingClientRect') return ()=>rect;
      if(p==='addEventListener'||p==='removeEventListener') return ()=>{};
      const v=t[p];
      return typeof v==='function'? v.bind(t) : v;
    },
    set(t,p,v){ if(p!=='style') t[p]=v; return true; }
  });
}
const store={};
global.window=global;
global.localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}};
global.document={
  readyState:'complete',
  getElementById(id){
    if(id==='game') return wrap(gameCv,{left:0,top:0,width:640*SC,height:360*SC,right:640*SC,bottom:360*SC});
    if(id==='hud') return wrap(hudCv,{left:0,top:0,width:VW,height:VH,right:VW,bottom:VH});
    return null;
  },
  createElement(){ return createCanvas(1,1); },
  querySelectorAll(){ return []; }, addEventListener(){}
};
global.innerWidth=VW; global.innerHeight=VH; global.devicePixelRatio=1;
global.addEventListener=()=>{}; global.removeEventListener=()=>{};
global.requestAnimationFrame=()=>0;
global.AudioContext=undefined; global.webkitAudioContext=undefined;

for(const f of ['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U;

const IN=G.Input;
function compose(name){
  const o=createCanvas(VW,VH), c=o.getContext('2d');
  c.fillStyle='#05060d'; c.fillRect(0,0,VW,VH);
  c.imageSmoothingEnabled=false;
  c.drawImage(gameCv,0,0,VW,VH);
  c.drawImage(hudCv,0,0);
  fs.writeFileSync(path.join(OUT,name+'.png'), o.toBuffer('image/png'));
  console.log('  -> '+name+'.png');
}
function scene(name, heroId, floor, roomType, frames, opts){
  opts=opts||{};
  const g=new G.Game();
  g.init(); g.start(heroId);
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player;
  p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  if(floor>1) g.newFloor(floor);
  if(opts.buffs) opts.buffs.forEach(id=>{ const b=G.Buffs.filter(x=>x.id===id)[0]; if(b) b.fn(p); p.picked.push(b); });
  if(opts.weapons){ p.weapons=[]; opts.weapons.forEach(w=>p.giveWeapon(G.Weapons.get(w),true)); }
  let target=null;
  for(const r of g.map.rooms) if(r.type===roomType){ target=r; break; }
  if(!target) target=g.map.rooms[1]||g.map.startRoom;
  p.x=target.cx; p.y=target.cy+(roomType==='boss'?90:40);
  g.cam.x=p.x-320; g.cam.y=p.y-180;
  for(let i=0;i<frames;i++){
    IN.keys={}; IN.hits={};
    IN.down = i>26;
    if(opts.skill && i===60) IN.rdownHit=true;
    if(opts.ult && i===40) IN.hits[' ']=true;
    IN.mx=640+Math.cos(i*0.06)*420; IN.my=360+Math.sin(i*0.06)*260;
    p.hp=1e6; p.energy=1e6; p.iframe=1;
    g.update(1/60);
    IN.end();
  }
  g.draw(); g.drawHUD();
  compose(name);
  return g;
}
console.log('渲染场景:');
scene('s1_castle','knight',1,'normal',150,{skill:true});
scene('s2_ice','ranger',2,'normal',150,{skill:true,weapons:['bow','frost_cannon','minigun']});
scene('s3_boss_magma','berserker',3,'boss',210,{skill:true,ult:true,weapons:['dragon_fang','rpg']});
scene('s4_jungle','mage',4,'normal',150,{skill:true,weapons:['fire_staff','storm_staff','necro_staff'],buffs:['multi','fireE','crit']});
scene('s5_lab','robot',5,'normal',160,{skill:true,ult:true,weapons:['railgun','plasma','tesla']});
scene('s6_shop','assassin',2,'shop',60,{});
scene('s7_void_boss','knight',6,'boss',230,{skill:true,weapons:['lightsaber','blackhole','prism']});
console.log('完成');
