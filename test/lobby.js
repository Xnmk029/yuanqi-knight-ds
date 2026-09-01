/* 大厅全流程测试 */
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

const g=new G.Game();
g.init();
g.onUpgrade=(p)=>{ g.applyBuff(p[0]); };
g.onGameOver=()=>{}; g.onWin=()=>{};
let forgeOpened=false, questOpened=false;
g.onForge=function(){ forgeOpened=true; };
g.onQuest=function(){ questOpened=true; };
const IN=G.Input;

// 1. 进入大厅
g.enterLobby();
check(g.state==='lobby', '进入大厅 state=lobby');
check(g.player.coins===50, '初始 50 金币');
check(g.lobbyQuests && g.lobbyQuests.list.length===3, '任务板 3 个任务');

// 2. 大厅渲染不报错
try{ g.draw(); g.drawHUD(); check(true,'大厅渲染正常'); }
catch(e){ check(false,'大厅渲染异常: '+e.message); }

// 3. 移动
g.player.x=320; g.player.y=300;
IN.keys['d']=true;
for(let i=0;i<30;i++){ IN.hits={}; g.update(1/60); }
check(g.player.x>330, '玩家可移动 x='+g.player.x.toFixed(0));

// 4. 切换英雄（走到立牌按 E）
g.player.x=G.Lobby.LAYOUT.heroes.x; g.player.y=G.Lobby.LAYOUT.heroes.y;
IN.hits['e']=true;
g.update(1/60);
check(g.lobbyHeroIdx===1, 'E 切换英雄 → '+G.Heroes[g.lobbyHeroIdx].name);

// 5. 扭蛋
g.player.x=G.Lobby.LAYOUT.gacha.x; g.player.y=G.Lobby.LAYOUT.gacha.y;
IN.hits['e']=true;
g.update(1/60);
check(g.player.weapons.length===1, '扭蛋获得武器: '+g.player.weapons[0].name);
check(g.player.coins===20, '金币扣除 30 → '+g.player.coins);

// 6. 锻造台打开面板
g.player.x=G.Lobby.LAYOUT.forge.x; g.player.y=G.Lobby.LAYOUT.forge.y;
IN.hits['e']=true;
g.update(1/60);
check(forgeOpened, '锻造台触发 onForge');

// 7. 任务板
g.player.x=G.Lobby.LAYOUT.quest.x; g.player.y=G.Lobby.LAYOUT.quest.y;
IN.hits['e']=true;
g.update(1/60);
check(questOpened, '任务板触发 onQuest');

// 8. 花园浇水
g.player.x=G.Lobby.LAYOUT.garden.x; g.player.y=G.Lobby.LAYOUT.garden.y;
IN.hits['e']=true;
g.update(1/60);
check(g.lobbyGarden.watered, '花园已浇水');
check(g.player.coins>20, '浇水收获金币 '+g.player.coins);

// 9. 任务进度钩子
G.Lobby.addProgress('kill', 30);
check(g.lobbyQuests.list[0].done, '击杀任务完成');
G.Lobby.addProgress('chest', 3);
check(g.lobbyQuests.list[2].done, '开箱任务完成');

// 10. 传送门开局
g.player.x=G.Lobby.LAYOUT.portal.x; g.player.y=G.Lobby.LAYOUT.portal.y;
IN.hits['e']=true;
g.update(1/60);
check(g.state==='playing', '传送门进入地牢 state=playing');
check(g.floorNum===1, '第 1 层');
check(g.player.hero.id===G.Heroes[g.lobbyHeroIdx].id, '使用大厅选择的英雄');

// 11. 木桩攻击
{
  const g2=new G.Game();
  g2.init();
  g2.onUpgrade=(p)=>{ g2.applyBuff(p[0]); };
  g2.onGameOver=()=>{}; g2.onWin=()=>{};
  g2.enterLobby();
  g2.player.weapons=[]; g2.player.wi=0;
  g2.player.giveWeapon(G.Weapons.get('pistol'),true);
  g2.player.x=G.Lobby.LAYOUT.dummy.x-120; g2.player.y=G.Lobby.LAYOUT.dummy.y;
  IN.mx=640; IN.my=360;
  IN.down=true;
  let dmgSeen=false;
  const origFloat=g2.float.bind(g2);
  g2.float=function(txt){ if(/^\d+$/.test(txt)) dmgSeen=true; return origFloat(txt); };
  for(let i=0;i<40;i++){ IN.hits={}; g2.update(1/60); }
  IN.down=false;
  check(dmgSeen, '木桩显示伤害数字');
}

if(errors){ console.log('\n失败 '+errors+' 项'); process.exit(1); }
else console.log('\n大厅全流程测试通过 ✔');
