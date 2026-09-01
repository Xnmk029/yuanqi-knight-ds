/* P0 回归：属性武器掉落不丢失 */
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
for(const f of ['util.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f});
const G=global.G, U=G.U, Wp=G.Weapons;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* 场景：工匠附魔 + 导师强化 → 满背包拾取新武器 → 旧武器掉落 → 拾回 → 属性保留 */
const g=new G.Game();
g.init(); g.start('knight');
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
const p=g.player; p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
p.weapons=[]; p.wi=0;
p.giveWeapon(Wp.get('shotgun'),true);
p.giveWeapon(Wp.get('pistol'),true);
p.giveWeapon(Wp.get('sword'),true);
p.wi=0;
g.pickups=[];

// 1. 给当前武器（shotgun）附魔 + 强化
const w=p.wpn();
const origDmg=w.dmg;
w.freeze=1.5;            // 模拟工匠附魔
w.dmg=Math.round(w.dmg*1.4); // 模拟导师强化
w.parts=['scope1'];      // 模拟配件（P6 预留）
console.log('  附魔后: dmg='+w.dmg+' freeze='+w.freeze+' parts='+w.parts);

// 2. 满背包拾取新武器 → shotgun 掉落
const def=Wp.get('sniper');
g.pickups.push(new G.Pickup(p.x+10, p.y, 'weapon', def, g));
const IN=G.Input;
IN.hits['e']=true;
g.update(1/60); IN.end();
g.update(1/60); IN.end();
const ground=g.pickups.filter(x=>x.kind==='weapon');
check(ground.length===1, '旧武器掉落到地面');
check(ground[0].def.id==='shotgun', '掉落的是 shotgun');

// 3. 拾回掉落武器（满背包 → 替换当前槽 wi=0）
const pu=ground[0];
p.giveWeapon(pu.def);
const back=p.weapons[0];
check(back.id==='shotgun', '拾回 shotgun (槽0)');
check(back.freeze===1.5, '冻结附魔保留 freeze='+back.freeze);
check(back.dmg===Math.round(origDmg*1.4), '导师强化保留 dmg='+back.dmg+' (期望 '+Math.round(origDmg*1.4)+')');
check(back.parts && back.parts.length===1, '配件保留 parts='+JSON.stringify(back.parts));

// 4. W.snapshot 直接测试
const snap=Wp.snapshot(back);
check(snap.freeze===1.5 && snap.dmg===Math.round(origDmg*1.4), 'snapshot 保留属性');
check(Object.getPrototypeOf(snap)===Wp.get('shotgun'), 'snapshot 原型为原 def');

// 5. 合成保留属性
const g2=new G.Game();
g2.init(); g2.start('knight');
g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
g2.onGameOver=()=>{}; g2.onWin=()=>{};
const p2=g2.player; p2.maxHp=1e6; p2.hp=1e6; p2.maxEnergy=1e6; p2.energy=1e6;
p2.weapons=[]; p2.wi=0;
p2.giveWeapon(Wp.get('shotgun'),true);
p2.giveWeapon(Wp.get('ice_staff'),true);
p2.giveWeapon(Wp.get('pistol'),true);
p2.coins=200;
p2.weapons[0].dmg=50; // 强化
const ok=g2.fuseWeapons(0,1);
check(ok, '合成成功');
const fused=p2.weapons[p2.weapons.length-1];
check(fused.dmg>=50*1.15, '合成继承强化后伤害 '+fused.dmg);

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\nP0 回归测试通过 ✔');
