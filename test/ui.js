/* UI 层测试：模拟 DOM 加载 main.js，验证菜单/图鉴/选人/祝福/结算全流程 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');

function makeCtx(){
  const store={}; const grad={addColorStop(){}};
  return new Proxy({},{ get(t,p){
      if(p in store) return store[p];
      if(p==='canvas') return {width:640,height:360};
      if(p==='measureText') return ()=>({width:20});
      if(p==='createLinearGradient'||p==='createRadialGradient') return ()=>grad;
      if(typeof p==='symbol') return undefined;
      return ()=>{};
    }, set(t,p,v){ store[p]=v; return true; }, has(){return true;} });
}
const ALL=[];
function El(tag,id){
  const e={ tagName:(tag||'div').toUpperCase(), id:id||'', _cls:{}, children:[], style:{}, _attrs:{},
    textContent:'', onclick:null, _parent:null,
    classList:{ add(c){e._cls[c]=1;}, remove(c){delete e._cls[c];}, contains(c){return !!e._cls[c];} },
    appendChild(c){
      if(c._parent) c._parent.removeChild(c);
      e.children.push(c); c._parent=e; return c;
    },
    removeChild(c){ const i=e.children.indexOf(c); if(i>=0){ e.children.splice(i,1); c._parent=null; } },
    setAttribute(k,v){ e._attrs[k]=v; }, getAttribute(k){ return e._attrs[k]===undefined?null:e._attrs[k]; },
    getContext(){ return makeCtx(); },
    getBoundingClientRect(){ return {left:0,top:0,width:1280,height:720,right:1280,bottom:720}; },
    addEventListener(){}, removeEventListener(){},
    width:300, height:150 };
  Object.defineProperty(e,'firstChild',{ get(){ return e.children[0]||null; } });
  Object.defineProperty(e,'innerHTML',{ get(){ return e._html||''; },
    set(v){ e._html=v; e.children.forEach(c=>{c._parent=null;}); e.children=[];
      if(v){ const n=Math.min(4,(String(v).match(/</g)||[]).length||1); for(let i=0;i<n;i++) e.appendChild(El('span')); } } });
  ALL.push(e); return e;
}
const byId={};
['game','hud','ui','toast','hero-cards','codex-body','opts-body','upgrade-cards','over-stats','pause-stats','over-title',
 'scr-title','scr-chars','scr-codex','scr-help','scr-opts','scr-pause','scr-upgrade','scr-over','stage']
 .forEach(id=>{ byId[id]=El(id.indexOf('game')===0||id==='hud'?'canvas':'div',id); });
byId['game'].width=640; byId['game'].height=360;

let docListeners={};
global.window=global;
const ls={};
global.localStorage={getItem:k=>(k in ls?ls[k]:null),setItem:(k,v)=>{ls[k]=v;},removeItem:k=>{delete ls[k];}};
global.location={search:''};
global.document={ readyState:'complete',
  getElementById:id=>byId[id]||null,
  createElement:tag=>El(tag),
  querySelectorAll(sel){
    if(sel==='.screen') return Object.keys(byId).filter(k=>k.indexOf('scr-')===0).map(k=>byId[k]);
    if(sel==='.tab') return [];
    return [];
  },
  addEventListener(t,fn){ docListeners[t]=docListeners[t]||[]; docListeners[t].push(fn); } };
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=()=>{}; global.removeEventListener=()=>{};
let rafCb=null;
global.requestAnimationFrame=fn=>{ rafCb=fn; return 1; };
global.setTimeout=(fn)=>{ try{ fn(); }catch(e){ errors.push('setTimeout: '+e.stack); } return 0; };
global.AudioContext=undefined; global.webkitAudioContext=undefined;

const errors=[];
for(const f of ['util.js','save.js','audio.js','art.js','weapons.js','enemies.js','dungeon.js','entities.js','game.js','lobby.js','main.js']){
  try{ vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),{filename:f}); }
  catch(e){ console.error('加载失败 '+f+': '+e.stack); process.exit(1); }
}
const G=global.G;
function click(el){
  const fns=docListeners['click']||[];
  for(const fn of fns){ try{ fn({target:el}); }catch(e){ errors.push('click: '+e.stack); } }
  if(el.onclick){ try{ el.onclick(); }catch(e){ errors.push('onclick: '+e.stack); } }
}
function btn(act){ const e=El('button'); e.setAttribute('data-act',act); return e; }
function tick(n){ for(let i=0;i<n;i++){ if(!rafCb) break; const fn=rafCb; rafCb=null;
  try{ fn(i*16.7); }catch(e){ errors.push('loop: '+e.stack); break; } } }

console.log('main.js 已加载, 菜单渲染中...');
tick(30);
console.log('  菜单帧 OK');
click(btn('codex'));  tick(3); console.log('  图鉴 OK (条目 '+byId['codex-body'].children.length+')');
click(btn('help'));   tick(3);
click(btn('opts'));   tick(3); console.log('  设置 OK (项 '+byId['opts-body'].children.length+')');
click(btn('back'));   tick(3);
click(btn('chars'));  tick(3); console.log('  选人 OK (卡片 '+byId['hero-cards'].children.length+')');
const heroCard=byId['hero-cards'].children[3];
if(heroCard) click(heroCard);
click(btn('start'));  tick(30);
console.log('  大厅 OK, 状态='+G.game.state);
if(G.game.state!=='lobby'){ errors.push('start 未进入大厅'); }
// 模拟传送门开局
G.game.start(G.Heroes[G.game.lobbyHeroIdx].id); tick(120);
console.log('  开局 OK, 状态='+G.game.state+' 楼层='+G.game.floorNum);
// 触发祝福选择界面
G.game.showUpgrade(); tick(2);
console.log('  祝福界面 OK (卡片 '+byId['upgrade-cards'].children.length+')');
const upCard=byId['upgrade-cards'].children[0];
if(upCard) click(upCard);
console.log('  选择祝福后状态='+G.game.state+' 已获得 '+G.game.player.picked.length+' 个祝福');
// 暂停 / 继续
G.Input.hits={'escape':1}; tick(1);
console.log('  暂停 OK, 状态='+G.game.state);
click(btn('resume')); tick(5);
// 死亡结算
G.game.player.hp=0; G.game.player.dead=true; tick(4);
console.log('  死亡结算 OK, 状态='+G.game.state);
click(btn('retry')); tick(30);
console.log('  重开 OK, 状态='+G.game.state);
click(btn('menu')); tick(10);
console.log('  返回主菜单 OK, 状态='+G.game.state);

if(errors.length){ console.log('\n发现 '+errors.length+' 个错误:'); errors.slice(0,6).forEach(e=>console.log('- '+e)); process.exit(1); }
console.log('\nUI 全流程测试通过 ✔');
