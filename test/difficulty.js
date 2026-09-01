/* 难度系统测试 */
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
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 难度表 */
console.log('=== 1. 难度配置 ===');
check(G.DIFFICULTY.length===4, '4 级难度');
check(G.DIFFICULTY[0].name==='简单' && G.DIFFICULTY[0].hp===1.0, '简单=当前配置');
check(G.DIFFICULTY[3].hp>G.DIFFICULTY[2].hp && G.DIFFICULTY[2].hp>G.DIFFICULTY[1].hp, '血量递增');
check(G.DIFFICULTY[3].specRooms<G.DIFFICULTY[0].specRooms, '噩梦奖励房更少');

/* 2. 房间分配差异 */
console.log('=== 2. 房间分配 ===');
function countSpec(diff, trials){
  let spec=0, total=0;
  for(let t=0;t<trials;t++){
    const m=G.Dungeon.generate(3,0,{seed:1000+t, difficulty:diff});
    for(const r of m.rooms){
      total++;
      if(['rest','armory','recycle','forge','mentor','smith','wishing','statue','trap','vault','treasure','shop','shrine'].indexOf(r.type)>=0) spec++;
    }
  }
  return spec/total;
}
const easySpec=countSpec(0, 20);
const nightmareSpec=countSpec(3, 20);
console.log('  简单奖励房比例:', easySpec.toFixed(3), ' 噩梦:', nightmareSpec.toFixed(3));
check(nightmareSpec<easySpec, '噩梦奖励房比例低于简单');

/* 3. 敌人缩放 */
console.log('=== 3. 敌人缩放 ===');
function enemyHp(diff){
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  g.difficulty=diff;
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  const e=g.spawnEnemy('slime', 100,100,{});
  return e.maxHp;
}
const hpEasy=enemyHp(0), hpNight=enemyHp(3);
console.log('  简单史莱姆血量:', hpEasy, ' 噩梦:', hpNight);
check(hpNight>hpEasy*1.8, '噩梦血量显著高于简单');

/* 4. 金币缩放 */
console.log('=== 4. 金币缩放 ===');
function killCoins(diff){
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  g.difficulty=diff;
  const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  const e=g.spawnEnemy('slime', 100,100,{});
  e.hp=1;
  g.damageEnemy(e, 99, {silent:true});
  return p.coins;
}
const cEasy=killCoins(0), cNight=killCoins(3);
console.log('  简单击杀金币:', cEasy, ' 噩梦:', cNight);
check(cNight<=cEasy, '噩梦金币不高于简单');

/* 5. 存档包含难度 */
console.log('=== 5. 难度存档 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
g.difficulty=2;
G.Save.auto(g);
const g2=new G.Game();
g2.init();
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
G.Save.restore(g2, G.Save.loadAuto());
check(g2.difficulty===2, '读档恢复难度 '+g2.difficulty);

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n难度系统测试通过 ✔');
