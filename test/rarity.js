const fs=require('fs'),path=require('path'),vm=require('vm');
global.window=global; global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.document={readyState:'complete',getElementById:()=>null,createElement:()=>({getContext:()=>null}),querySelectorAll:()=>[],addEventListener(){}};
global.addEventListener=()=>{};
for(const f of ['util.js','audio.js','art.js','weapons.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),{filename:f});
const W=global.G.Weapons;
console.log('各稀有度武器数量: '+W.pools.map((p,i)=>W.RARITY_NAME[i]+' '+p.length).join(' / '));
let noTrait=W.list.filter(w=>!w.trait).map(w=>w.id);
console.log('无特性武器: '+(noTrait.length?noTrait.join(','):'无'));
function run(floor,boost,n){
  const cnt=[0,0,0,0,0];
  for(let i=0;i<n;i++) cnt[W.roll(floor,boost).rarity-1]++;
  return cnt.map(c=>(100*c/n).toFixed(1)+'%');
}
console.log('\n普通掉落 (boost=0)');
console.log('楼层   普通    精良    稀有    史诗    传说');
for(let f=1;f<=6;f++) console.log((''+f).padEnd(6)+run(f,0,40000).map(s=>s.padStart(6)).join('  '));
console.log('\nBOSS 宝箱 (boost=1.5)');
console.log('楼层   普通    精良    稀有    史诗    传说');
for(let f=1;f<=6;f++) console.log((''+f).padEnd(6)+run(f,1.5,40000).map(s=>s.padStart(6)).join('  '));
