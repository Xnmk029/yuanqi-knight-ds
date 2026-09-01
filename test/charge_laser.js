/* 蓄力武器 + 激光武器测试 */
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
const G=global.G, U=G.U, Wp=G.Weapons;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 1. 新武器存在 */
console.log('=== 1. 武器注册 ===');
for(const id of ['charge_sniper','charge_staff','charge_crossbow','charge_hammer','photon_cutter','annihilator']){
  check(!!Wp.get(id), id+' 已注册');
}
check(Wp.list.length===48, '武器总数 48 (42+6), got '+Wp.list.length);

/* 2. 蓄力机制 */
console.log('=== 2. 蓄力机制 ===');
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
p.weapons=[]; p.wi=0;
p.giveWeapon(Wp.get('charge_sniper'),true);
p.giveWeapon(Wp.get('pistol'),true); /* 第二把武器用于切枪测试 */
const IN=G.Input;
IN.mx=640; IN.my=360;
// 蓄力 1.0s
IN.down=true;
for(let i=0;i<70;i++){ IN.hits={}; g.update(1/60); }
check(p.charge>=0.99, '蓄力满 charge='+p.charge.toFixed(2));
// 松开发射
IN.down=false;
g.update(1/60);
check(p.charge<0.1, '发射后蓄力清零');
// 检查子弹属性（满蓄力：穿透+3 必暴）
const b=g.bullets[g.bullets.length-1];
check(!!b, '发射了子弹');
if(b){
  check(b.pierce>=4, '满蓄力穿透+3 pierce='+b.pierce);
  check(b.crit===1, '满蓄力必暴');
}
// 切枪中断蓄力
IN.down=true;
for(let i=0;i<30;i++){ IN.hits={}; g.update(1/60); }
const cBefore=p.charge;
IN.hits['q']=true;
g.update(1/60);
check(p.charge===0, '切枪中断蓄力');
IN.down=false;

/* 3. 激光武器 */
console.log('=== 3. 激光武器 ===');
const g2=new G.Game();
g2.init(); g2.start('knight');
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
const p2=g2.player; p2.maxHp=1e6; p2.hp=1e6; p2.maxEnergy=20; p2.energy=20;
p2.weapons=[]; p2.wi=0;
p2.giveWeapon(Wp.get('photon_cutter'),true);
// 放一个敌人
const room=g2.map.startRoom;
const e=g2.spawnEnemy('slime', p2.x+20, p2.y, {});
// 按住攻击 1 秒
IN.down=true;
IN.mx=640; IN.my=360;
for(let i=0;i<60;i++){ IN.hits={}; g2.update(1/60); }
IN.down=false;
check(e.hp<e.maxHp, '激光对敌人造成伤害 hp='+e.hp+'/'+e.maxHp);
check(g2.fx.some(f=>f.type==='beam'), '光束特效出现');
check(p2.energy<p2.maxEnergy-0.2, '激光消耗能量 (剩 '+p2.energy.toFixed(1)+')');

// 过热
const g3=new G.Game();
g3.init(); g3.start('knight');
g3.onUpgrade=(p)=>{ g3.applyBuff(p[0]); };
g3.onGameOver=()=>{}; g3.onWin=()=>{};
const p3=g3.player; p3.maxHp=1e6; p3.hp=1e6; p3.maxEnergy=20; p3.energy=20;
p3.weapons=[]; p3.wi=0;
p3.giveWeapon(Wp.get('annihilator'),true);
const aw=p3.weapons[0];
IN.down=true;
IN.mx=640; IN.my=360;
for(let i=0;i<240;i++){ IN.hits={}; g3.update(1/60); } // 4 秒
IN.down=false;
check(aw.heat>=0.95, '湮灭射线过热 heat='+aw.heat.toFixed(2));
// 冷却
for(let i=0;i<120;i++){ IN.hits={}; g3.update(1/60); } // 2 秒
check(aw.heat<1, '冷却后恢复 heat='+aw.heat.toFixed(2));

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n蓄力/激光武器测试通过 ✔');
