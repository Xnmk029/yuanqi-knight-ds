/* 回归测试：障碍物可见性 + 满背包武器掉落 */
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

const files=['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js'];
for(const f of files){
  const code=fs.readFileSync(path.join(ROOT,'js',f),'utf8');
  try{ vm.runInThisContext(code,{filename:f}); }
  catch(e){ console.error('LOAD FAIL '+f+': '+e.stack); process.exit(1); }
}
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* ---------- 1. 障碍物可见性：6 个生物群系逐一验证 ---------- */
console.log('=== 1. 障碍物可见性（Art.prop 必须被调用） ===');
for(let biome=0;biome<6;biome++){
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  if(biome>0) g.newFloor(biome+1);
  // 找一个 solid 障碍物，把玩家放过去
  const sp=g.props.filter(pr=>pr.solid)[0];
  if(!sp){ check(false,'biome '+biome+' 没有 solid 障碍物'); continue; }
  p.x=sp.x; p.y=sp.y+30;
  g.cam.x=p.x-320; g.cam.y=p.y-180;
  const IN=G.Input;
  for(let i=0;i<8;i++){ IN.keys={}; IN.hits={}; IN.down=false; g.update(1/60); IN.end(); }
  let propCalls=0, spCalls=0;
  const origProp=G.Art.prop;
  G.Art.prop=function(ctx,o,t,B){ propCalls++; if(o===sp) spCalls++; return origProp(ctx,o,t,B); };
  try{ g.draw(); }catch(e){ check(false,'biome '+biome+' draw 异常: '+e.message); }
  G.Art.prop=origProp;
  check(spCalls>0, 'biome '+biome+' ('+G.Art.BIOMES[biome].name+') solid 障碍物被绘制 (propCalls='+propCalls+')');
  // 同时验证所有 props 都有 prop 标记
  const noFlag=g.props.filter(pr=>!pr.prop);
  check(noFlag.length===0, 'biome '+biome+' 所有 props 带 prop 标记');
}

/* ---------- 2. 满背包拾取武器 → 旧武器掉落地面 ---------- */
console.log('=== 2. 满背包武器替换掉落 ===');
{
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  p.weapons=[]; p.wi=0;
  p.giveWeapon(G.Weapons.get('sword'),true);
  p.giveWeapon(G.Weapons.get('pistol'),true);
  p.giveWeapon(G.Weapons.get('shotgun'),true);
  p.wi=0;
  g.pickups=[]; // 清空地图随机生成的拾取物（如 armory 房武器）
  const def=G.Weapons.get('sniper');
  g.pickups.push(new G.Pickup(p.x+10, p.y, 'weapon', def, g));
  const IN=G.Input;
  IN.hits['e']=true;
  g.update(1/60); IN.end();
  g.update(1/60); IN.end(); // 第二帧移除已消费拾取物
  const ground=g.pickups.filter(x=>x.kind==='weapon');
  check(ground.length===1 && ground[0].def.id==='sword', '旧武器 sword 掉落到地面');
  check(p.weapons.map(w=>w.id).indexOf('sword')<0, '背包中 sword 已被替换');
  check(p.weapons[0].id==='sniper', '新武器 sniper 进入当前槽');
}

/* ---------- 3. 切换武器不影响地面拾取物 ---------- */
console.log('=== 3. 切换武器不删除地面拾取物 ===');
{
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  p.weapons=[]; p.wi=0;
  p.giveWeapon(G.Weapons.get('sword'),true);
  p.giveWeapon(G.Weapons.get('pistol'),true);
  p.giveWeapon(G.Weapons.get('shotgun'),true);
  g.pickups=[]; // 清空地图随机拾取物
  g.pickups.push(new G.Pickup(p.x+40, p.y, 'weapon', G.Weapons.get('sniper'), g));
  const IN=G.Input;
  IN.hits['q']=true; g.update(1/60); IN.end();
  IN.hits['2']=true; g.update(1/60); IN.end();
  IN.wheel=1; g.update(1/60); IN.end();
  const ground=g.pickups.filter(x=>x.kind==='weapon');
  check(ground.length===1, 'Q/数字键/滚轮切换后地面武器仍在');
}

/* ---------- 4. floor URL 正则 ---------- */
console.log('=== 4. floor URL 参数 ===');
{
  const m='?auto=knight&floor=3&room=boss'.match(/floor=(\d+)/);
  check(!!m && m[1]==='3', 'floor=3 可被解析');
}

if(errors){
  console.log('\n===== 发现 '+errors+' 个失败 =====');
  process.exit(1);
} else {
  console.log('\n全部回归测试通过 ✔');
}
