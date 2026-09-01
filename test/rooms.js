/* 多功能房间测试 */
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
const G=global.G, U=G.U;
let errors=0;
function check(cond,msg){ if(!cond){ errors++; console.log('  ✗ '+msg); } else console.log('  ✔ '+msg); }

/* ---------- 1. 房间类型分布（6 层 × 多次生成） ---------- */
console.log('=== 1. 房间类型分布 ===');
const seen={};
for(let trial=0;trial<12;trial++){
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  for(let f=1;f<=6;f++){
    if(f>1) g.newFloor(f);
    for(const r of g.map.rooms){
      seen[r.type]=(seen[r.type]||0)+1;
    }
  }
}
console.log('  分布:', JSON.stringify(seen));
for(const t of ['normal','boss','treasure','shop','shrine','forge','recycle','rest','armory','elite','mentor','smith','wishing','statue','trap','vault']){
  check((seen[t]||0)>0, '房间类型 '+t+' 出现过 ('+(seen[t]||0)+' 次)');
}

/* ---------- 2. 各特殊房交互 ---------- */
function newGame(){
  const g=new G.Game();
  g.init(); g.start('knight');
  g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
  g.onGameOver=()=>{}; g.onWin=()=>{};
  const p=g.player;
  p.maxHp=1e6; p.hp=1e6; p.maxEnergy=1e6; p.energy=1e6;
  return g;
}
const IN=G.Input;

// mentor
{
  const g=newGame();
  const p=g.player; p.coins=100;
  const w=p.wpn();
  const dmgBefore=w.dmg;
  g.makeMentor({cx:100,cy:100});
  const m=g.inter[g.inter.length-1];
  m.act();
  check(p.coins===70, '导师收费 30');
  check(w.dmg!==dmgBefore || w.skill.cd!==G.Weapons.get(w.id).skill.cd, '武器被强化');
}
// smith
{
  const g=newGame();
  const p=g.player;
  const w=p.wpn();
  g.makeSmith({cx:100,cy:100});
  const sm=g.inter[g.inter.length-1];
  sm.act();
  const elem=G.Weapons.elementOf(w);
  check(!!elem, '工匠附魔元素: '+(elem?elem.name:'无'));
}
// wishing（指数费用）
{
  const g=newGame();
  const p=g.player; p.coins=1000;
  g.makeWishing({cx:100,cy:100});
  const wsh=g.inter[g.inter.length-1];
  check(wsh.cost===10, '许愿池初始 10 金币');
  const costs=[];
  for(let wi=0;wi<6;wi++){ costs.push(wsh.cost); wsh.act(); }
  check(costs.join(',')==='10,20,40,80,160,320', '费用指数上升: '+costs.join(','));
  check(wsh.cost===500, '费用封顶 500');
  check(p.coins<=1000-630+200, '累计扣除约 630（含随机奖励）: '+(1000-p.coins));
}
// statue
{
  const g=newGame();
  g.makeStatue({cx:100,cy:100});
  const st=g.inter[g.inter.length-1];
  st.act();
  const hasBuff=Object.keys(g.player.buffs).length>0;
  check(hasBuff, '雕像祝福生效: '+Object.keys(g.player.buffs).join(','));
}
// rest
{
  const g=newGame();
  const p=g.player; p.hp=50;
  g.makeRest({cx:100,cy:100});
  const rs=g.inter[g.inter.length-1];
  rs.act();
  check(p.hp>50, '篝火回血: '+p.hp);
  check(p.energy===p.maxEnergy, '能量回满');
}
// armory
{
  const g=newGame();
  const beforeArmory=g.pickups.filter(x=>x.kind==='weapon').length;
  g.makeArmory({cx:100,cy:100});
  const wpn=g.pickups.filter(x=>x.kind==='weapon');
  check(wpn.length===beforeArmory+1, '武器房新增 1 把武器（共 '+wpn.length+'）');
}
// vault
{
  const g=newGame();
  g.makeVault({cx:100,cy:100});
  const gold=g.props.filter(x=>x.gold);
  check(gold.length===6, '金库房 6 个金币堆');
  // 打碎一个
  g.hitProp(gold[0], 99);
  const coins=g.pickups.filter(x=>x.kind==='coin');
  check(coins.length>=4, '金币堆破碎掉金币 '+coins.length+' 枚');
}
// trap
{
  const g=newGame();
  g.makeTrap({cx:100,cy:100});
  check(g.trapRooms.length===1, '陷阱房注册');
  check(g.inter.some(x=>x.kind==='chest'), '陷阱房有宝箱');
  // 模拟玩家在房间内，弹幕发射
  g.trapRooms[0].room.visited=true;
  g.trapRooms[0].t=0;
  g.update(1/60);
  check(g.bullets.length>0, '陷阱弹幕发射 '+g.bullets.length+' 发');
}
// elite 战斗
{
  const g=newGame();
  const r=g.map.rooms[1];
  r.type='elite'; r.cleared=false; r.active=false;
  g.curRoom=r;
  g.player.x=r.cx; g.player.y=r.cy;
  g.activateRoom(r);
  check(g.enemies.length>=3, '精英房刷怪 '+g.enemies.length+' 只');
  check(g.enemies.every(e=>e.elite), '全部为精英怪');
  // 清空 → 宝箱
  for(const e of g.enemies.slice()) g.damageEnemy(e,1e7,{silent:true});
  g.update(1/60);
  check(g.inter.some(x=>x.kind==='chest'), '精英房清空出宝箱');
}

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n多功能房间测试通过 ✔');
