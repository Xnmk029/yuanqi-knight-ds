/* 元气骑士·深渊回响 —— UI 与启动 */
(function(){
var G = window.G || (window.G = {});
var U = G.U, Art = G.Art, Wp = G.Weapons, En = G.Enemies;
var TAU = Math.PI*2;
var game, selHero='knight', screenStack=[];

function $(id){ return document.getElementById(id); }
function qa(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }

function show(id){
  qa('.screen').forEach(function(s){ s.classList.remove('active'); });
  if(id) $(id).classList.add('active');
  cur=id;
}
var cur='scr-title';

function toastDom(txt){
  var d=document.createElement('div');
  d.className='tst'; d.textContent=txt;
  $('toast').appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 2000);
}

/* ---------- 迷你渲染 ---------- */
function mini(w,h,fn){
  var c=document.createElement('canvas');
  c.width=w; c.height=h;
  c.style.width=w+'px'; c.style.height=h+'px';
  var x=c.getContext('2d');
  if(x) fn(x,w,h);
  return c;
}

/* ---------- 英雄选择 ---------- */
function buildHeroes(){
  var box=$('hero-cards');
  box.innerHTML='';
  G.Heroes.forEach(function(H){
    var card=document.createElement('div');
    card.className='card'+(H.id===selHero?' sel':'');
    var cv=mini(76,84,function(x,w,h){
      x.clearRect(0,0,w,h);
      Art.hero(x,w/2,h*0.62,17,H,{t:0.4,face:1,moving:0});
    });
    card.appendChild(cv);
    var html='<h3>'+H.name+'</h3><span class="tag">'+H.tag+'</span>'+
      '<p>'+H.desc+'</p>'+
      '<div class="skill"><b>被动</b> '+H.passive+'<br><b>大招</b> '+H.ult.name+'：'+H.ult.desc+'</div>';
    var div=document.createElement('div');
    div.innerHTML=html;
    while(div.firstChild) card.appendChild(div.firstChild);
    card.onclick=function(){
      selHero=H.id;
      G.Audio.init(); G.Audio.sfx.click();
      qa('#hero-cards .card').forEach(function(c2){ c2.classList.remove('sel'); });
      card.classList.add('sel');
    };
    box.appendChild(card);
  });
}

/* ---------- 图鉴 ---------- */
function buildCodex(tab){
  var box=$('codex-body');
  box.innerHTML='';
  if(tab==='weapons'){
    Wp.list.slice().sort(function(a,b){ return a.rarity-b.rarity; }).forEach(function(w){
      var e=document.createElement('div');
      e.className='entry';
      e.appendChild(mini(40,40,function(x){ x.clearRect(0,0,40,40); Art.weapon(x,20,20,-0.4,w.art,{t:0.5,scale:1.05}); }));
      var info=document.createElement('div');
      info.className='info';
      info.innerHTML='<div class="nm r'+w.rarity+'">'+w.name+' <span class="pill">'+Wp.RARITY_NAME[w.rarity-1]+'</span></div>'+
        '<div class="ds">'+w.desc+'　伤害 '+w.dmg+'</div>'+
        (w.skill?('<div class="sk">技能 · '+w.skill.name+'：'+w.skill.desc+'</div>'):'')+
        (w.trait&&Wp.TRAITS[w.trait]?('<div class="tr">特性 · '+Wp.TRAITS[w.trait].name+'：'+Wp.TRAITS[w.trait].desc+'</div>'):'');
      e.appendChild(info);
      box.appendChild(e);
    });
  } else if(tab==='enemies'){
    En.list.forEach(function(d){
      if(d.spawnable===false && !d.boss && d.id!=='slime_small' && d.id!=='nano_small') return;
      var e=document.createElement('div');
      e.className='entry';
      e.appendChild(mini(40,40,function(x){
        x.clearRect(0,0,40,40);
        Art.creature(x,20,22,d.boss?12:13,d.look,{t:0.6,face:1,moving:0});
      }));
      var info=document.createElement('div');
      info.className='info';
      info.innerHTML='<div class="nm '+(d.boss?'r5':'r2')+'">'+d.name+(d.boss?' <span class="pill">BOSS</span>':'')+'</div>'+
        '<div class="ds">'+(d.desc||'')+'</div>'+
        '<div class="sk">生命 '+d.hp+'　伤害 '+d.dmg+'</div>';
      e.appendChild(info);
      box.appendChild(e);
    });
  } else {
    G.Buffs.forEach(function(b){
      var e=document.createElement('div');
      e.className='entry';
      e.appendChild(mini(40,40,function(x){
        x.clearRect(0,0,40,40);
        var gr=x.createRadialGradient(20,20,2,20,20,16);
        gr.addColorStop(0,b.icon); gr.addColorStop(1,U.alpha(b.icon,0));
        x.fillStyle=gr; x.beginPath(); x.arc(20,20,16,0,TAU); x.fill();
        x.fillStyle=b.icon; x.beginPath(); x.arc(20,20,8,0,TAU); x.fill();
        x.fillStyle='#101828'; x.font='bold 11px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
        x.fillText(b.name.charAt(0),20,20);
      }));
      var info=document.createElement('div');
      info.className='info';
      info.innerHTML='<div class="nm r4">'+b.name+'</div><div class="ds">'+b.desc+'</div>';
      e.appendChild(info);
      box.appendChild(e);
    });
  }
}

/* ---------- 设置 ---------- */
function buildOpts(){
  var box=$('opts-body');
  box.innerHTML='';
  function row(label, node){
    var d=document.createElement('div'); d.className='opt';
    var s=document.createElement('span'); s.textContent=label;
    d.appendChild(s); d.appendChild(node); box.appendChild(d);
  }
  function slider(val,fn){
    var i=document.createElement('input');
    i.type='range'; i.min=0; i.max=100; i.value=Math.round(val*100);
    i.oninput=function(){ fn(i.value/100); };
    return i;
  }
  function toggle(on,fn){
    var b=document.createElement('button');
    b.className='sw'+(on?' on':'');
    b.textContent=on?'开启':'关闭';
    b.onclick=function(){ on=!on; b.className='sw'+(on?' on':''); b.textContent=on?'开启':'关闭'; fn(on); };
    return b;
  }
  row('音效音量', slider(G.Audio.sfxVol,function(v){ G.Audio.init(); G.Audio.setSfx(v); U.save('sfx',v); }));
  row('音乐音量', slider(G.Audio.musVol,function(v){ G.Audio.init(); G.Audio.setMus(v); U.save('mus',v); }));
  row('动态光影', toggle(game.opts.light,function(v){ game.opts.light=v; U.save('light',v); }));
  row('屏幕震动', toggle(game.opts.shake,function(v){ game.opts.shake=v; U.save('shake',v); }));
  row('高密度粒子', toggle(game.opts.particles,function(v){ game.opts.particles=v; U.save('parts',v); }));
  /* 难度选择 */
  var diffSel=U.load('difficulty',0);
  var dbtn=document.createElement('button');
  dbtn.className='sw on'; dbtn.style.minWidth='120px';
  function refreshDiff(){
    var D=G.DIFFICULTY[diffSel];
    dbtn.textContent=D.name+'（'+D.desc+'）';
  }
  refreshDiff();
  dbtn.onclick=function(){
    diffSel=(diffSel+1)%G.DIFFICULTY.length;
    U.save('difficulty',diffSel);
    if(game) game.difficulty=diffSel;
    refreshDiff();
  };
  row('难度', dbtn);
}

/* ---------- 合成 / 回收面板 ---------- */
var forgeSel={main:-1,sub:-1}, forgePreview=null, fromGamePanel=false;
function buildForge(){
  var box=$('forge-body');
  box.innerHTML='';
  var p=game.player;
  if(!p) return;
  p.weapons.forEach(function(w,i){
    var e=document.createElement('div');
    e.className='entry craft-entry'+(forgeSel.main===i?' main':'')+(forgeSel.sub===i?' sub':'');
    e.appendChild(mini(40,40,function(x){ x.clearRect(0,0,40,40); Art.weapon(x,20,20,-0.4,w.art,{t:0.5,scale:1.05}); }));
    var info=document.createElement('div');
    info.className='info';
    info.innerHTML='<div class="nm r'+w.rarity+'">'+w.name+' <span class="pill">'+Wp.RARITY_NAME[w.rarity-1]+'</span></div>'+
      '<div class="ds">伤害 '+w.dmg+(w.skill?(' · 技能 '+w.skill.name):'')+
      (Wp.elementOf(w)?(' · '+Wp.elementOf(w).name):'')+'</div>';
    e.appendChild(info);
    e.onclick=function(){
      if(forgeSel.main===i){ forgeSel.main=-1; }
      else if(forgeSel.main<0){ forgeSel.main=i; }
      else if(forgeSel.sub===i){ forgeSel.sub=-1; }
      else if(forgeSel.sub<0 && i!==forgeSel.main){ forgeSel.sub=i; }
      buildForge();
    };
    box.appendChild(e);
  });
  var prev=$('forge-preview');
  if(forgeSel.main>=0 && forgeSel.sub>=0){
    var m=p.weapons[forgeSel.main], su=p.weapons[forgeSel.sub];
    forgePreview=Wp.fuse(m,su);
    var cost=Math.max(5, Wp.fuseCost(m,su)-(p.mats||0)*3);
    var gainHtml='';
    if(su.skill) gainHtml+='<div class="sk">技能 ← '+su.skill.name+'</div>';
    if(su.trait && Wp.TRAITS[su.trait]) gainHtml+='<div class="tr">特性 ← '+Wp.TRAITS[su.trait].name+'</div>';
    var elemGain=Wp.elementOf(su);
    if(elemGain) gainHtml+='<div class="tr" style="color:'+elemGain.color+'">元素 ← '+elemGain.name+'</div>';
    if(!gainHtml) gainHtml='<div class="ds">（副武器无技能/特性，继承弹道）</div>';
    prev.innerHTML='<div class="nm r'+forgePreview.rarity+'">'+forgePreview.name+' <span class="pill">'+Wp.RARITY_NAME[forgePreview.rarity-1]+'</span></div>'+
      '<div class="ds">'+forgePreview.desc+'</div>'+
      '<div class="ds">伤害 '+forgePreview.dmg+' · 稀有度 '+forgePreview.rarity+'</div>'+
      gainHtml+
      '<div class="sk">费用 '+cost+' 金币（材料抵扣 '+(p.mats||0)*3+'）</div>';
    $('forge-confirm').style.display='';
  } else {
    forgePreview=null;
    prev.innerHTML='<div class="ds">点击选择 <b>主武器</b>（保留形态与数值）与 <b>副武器</b>（提供技能/特性/元素）</div>';
    $('forge-confirm').style.display='none';
  }
}
function buildRecycle(){
  var box=$('recycle-body');
  box.innerHTML='';
  var p=game.player;
  if(!p) return;
  p.weapons.forEach(function(w,i){
    var e=document.createElement('div');
    e.className='entry'+(scrapSel===i?' sel':'');
    e.appendChild(mini(40,40,function(x){ x.clearRect(0,0,40,40); Art.weapon(x,20,20,-0.4,w.art,{t:0.5,scale:1.05}); }));
    var v=Wp.scrapValue(w);
    var info=document.createElement('div');
    info.className='info';
    info.innerHTML='<div class="nm r'+w.rarity+'">'+w.name+' <span class="pill">'+Wp.RARITY_NAME[w.rarity-1]+'</span></div>'+
      '<div class="ds">回收：+'+v.gold+' 金币 +'+v.mats+' 材料</div>';
    e.appendChild(info);
    e.onclick=function(){ scrapSel=scrapSel===i?-1:i; buildRecycle(); };
    box.appendChild(e);
  });
  $('recycle-confirm').style.display = scrapSel>=0?'':'none';
}
var scrapSel=-1;

/* ---------- 拆解机面板 ---------- */
var disasmSel=0;
function buildDisasm(){
  var p=game.player;
  if(!p) return;
  var wbox=$('disasm-weapons');
  wbox.innerHTML='';
  p.weapons.forEach(function(w,i){
    var e=document.createElement('div');
    e.className='entry'+(i===disasmSel?' sel':'');
    e.appendChild(mini(40,40,function(x){ x.clearRect(0,0,40,40); Art.weapon(x,20,20,-0.4,w.art,{t:0.5,scale:1.05}); }));
    var info=document.createElement('div');
    info.className='info';
    info.innerHTML='<div class="nm r'+w.rarity+'">'+w.name+(w.modded?' <span class="pill" style="color:#8ef0ff">改装</span>':'')+' <span class="pill">'+Wp.RARITY_NAME[w.rarity-1]+'</span></div>'+
      '<div class="ds">伤害 '+w.dmg+' · '+w.type+' · '+(w.trait&&Wp.TRAITS[w.trait]?Wp.TRAITS[w.trait].name:'无特性')+'</div>';
    e.appendChild(info);
    e.onclick=function(){ disasmSel=i; buildDisasm(); };
    wbox.appendChild(e);
  });
  if(!p.weapons.length) wbox.innerHTML='<div class="ds">背包为空</div>';
  /* 已拆解部件 */
  var mbox=$('disasm-modules');
  var mods=p.modules||{};
  var html='<div class="nm">已拆解部件</div>';
  if(mods.shape){
    html+='<div class="ds" style="color:#8ef0ff">射弹类型 ← '+mods.shape.shape+'（'+(mods.shape.count||1)+' 发）</div>';
  } else html+='<div class="ds" style="opacity:0.5">射弹类型：无</div>';
  if(mods.stats){
    html+='<div class="ds" style="color:#ffd45e">武器属性 ← 伤害 '+mods.stats.dmg+' · 射速 '+mods.stats.rate+'</div>';
  } else html+='<div class="ds" style="opacity:0.5">武器属性：无</div>';
  if(mods.mode){
    html+='<div class="ds" style="color:#ff8ac0">攻击方式 ← '+mods.mode.type+(mods.mode.trait&&Wp.TRAITS[mods.mode.trait]?' · '+Wp.TRAITS[mods.mode.trait].name:'')+'</div>';
  } else html+='<div class="ds" style="opacity:0.5">攻击方式：无</div>';
  mbox.innerHTML=html;
}

/* ---------- 武器改装面板 ---------- */
var partsSel=0, partsShop=[];
function buildParts(){
  var p=game.player;
  if(!p) return;
  /* 武器选择 */
  var wbox=$('parts-weapons');
  wbox.innerHTML='';
  p.weapons.forEach(function(w,i){
    var e=document.createElement('div');
    e.className='entry'+(i===partsSel?' sel':'');
    e.appendChild(mini(40,40,function(x){ x.clearRect(0,0,40,40); Art.weapon(x,20,20,-0.4,w.art,{t:0.5,scale:1.05}); }));
    var info=document.createElement('div');
    info.className='info';
    info.innerHTML='<div class="nm r'+w.rarity+'">'+w.name+' <span class="pill">'+Wp.RARITY_NAME[w.rarity-1]+'</span></div>'+
      '<div class="ds">伤害 '+w.dmg+(w.parts&&w.parts.length?(' · 配件 '+w.parts.length+'/2'):'')+'</div>';
    e.appendChild(info);
    e.onclick=function(){ partsSel=i; buildParts(); };
    wbox.appendChild(e);
  });
  if(!p.weapons.length){ wbox.innerHTML='<div class="ds">背包为空</div>'; }
  /* 配件槽 */
  var w=p.weapons[partsSel];
  var sbox=$('parts-slots');
  if(w){
    var html='<div class="nm r'+w.rarity+'">'+w.name+' 配件槽</div>';
    for(var s=0;s<2;s++){
      var pid=w.parts&&w.parts[s];
      if(pid){
        var info2=Wp.partInfo(pid);
        html+='<div class="entry" style="margin-top:6px"><div class="info"><div class="nm">'+info2.name+' Lv.'+info2.level+'</div><div class="ds">'+info2.desc+'</div></div>'+
          '<button class="btn danger" style="min-width:70px;padding:5px 10px;font-size:12px" data-part="'+pid+'">卸下</button></div>';
      } else {
        html+='<div class="entry" style="margin-top:6px;opacity:0.5"><div class="info"><div class="ds">空配件槽</div></div></div>';
      }
    }
    sbox.innerHTML=html;
    /* 卸下按钮 */
    var btns=sbox.querySelectorAll('[data-part]');
    for(var b=0;b<btns.length;b++){
      (function(btn){
        btn.onclick=function(){
          var pid2=btn.getAttribute('data-part');
          if(Wp.detachPart(w,pid2)){ G.Audio.sfx.click(); buildParts(); }
        };
      })(btns[b]);
    }
  } else sbox.innerHTML='<div class="ds">请先选择武器</div>';
  /* 商店配件 */
  var shop=$('parts-shop');
  shop.innerHTML='<div class="ds" style="grid-column:1/-1;color:#ffd58a">武器商配件（点击购买并安装）</div>';
  partsShop.forEach(function(pid,i){
    var info3=Wp.partInfo(pid);
    if(!info3) return;
    var e=document.createElement('div');
    e.className='entry';
    var d=document.createElement('div');
    d.className='info';
    d.innerHTML='<div class="nm">'+info3.name+' <span class="pill">Lv.'+info3.level+'</span></div>'+
      '<div class="ds">'+info3.desc+'</div><div class="sk">'+info3.price+' 金币</div>';
    e.appendChild(d);
    var btn=document.createElement('button');
    btn.className='btn primary'; btn.style.minWidth='80px'; btn.style.padding='5px 10px'; btn.style.fontSize='12px';
    btn.textContent='购买';
    btn.onclick=function(){
      var w2=p.weapons[partsSel];
      if(!w2){ toastDom('请先选择武器'); return; }
      if(p.coins<info3.price){ toastDom('金币不足'); return; }
      if(!Wp.attachPart(w2,pid)){ toastDom('配件槽已满或已安装'); return; }
      p.coins-=info3.price;
      G.Audio.sfx.coin();
      buildParts();
    };
    e.appendChild(btn);
    shop.appendChild(e);
  });
}

/* ---------- 存档槽位 ---------- */
function fmtTime(t){
  var d=new Date(t);
  return (d.getMonth()+1)+'月'+d.getDate()+'日 '+d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
}
function buildSaveSlots(){
  var box=$('save-body');
  box.innerHTML='';
  for(var i=0;i<3;i++){
    var info=G.Save.manualInfo(i);
    var e=document.createElement('div');
    e.className='entry';
    var d=document.createElement('div');
    d.className='info';
    d.innerHTML='<div class="nm">存档槽 '+(i+1)+'</div>'+
      '<div class="ds">'+(info?('第 '+info.floor+' 层 · '+info.hero+' · '+fmtTime(info.t)):'（空）')+'</div>';
    e.appendChild(d);
    var btn=document.createElement('button');
    btn.className='btn primary'; btn.style.minWidth='90px'; btn.style.padding='6px 14px'; btn.style.fontSize='13px';
    btn.textContent='保存';
    btn.onclick=function(slot){
      return function(){
        if(G.Save.manual(game, slot)){
          toastDom('已保存到槽 '+(slot+1));
          buildSaveSlots();
        } else toastDom('保存失败');
      };
    }(i);
    e.appendChild(btn);
    box.appendChild(e);
  }
}
function buildLoadSlots(){
  var box=$('load-body');
  box.innerHTML='';
  for(var i=0;i<3;i++){
    var info=G.Save.manualInfo(i);
    var e=document.createElement('div');
    e.className='entry';
    var d=document.createElement('div');
    d.className='info';
    d.innerHTML='<div class="nm">存档槽 '+(i+1)+'</div>'+
      '<div class="ds">'+(info?('第 '+info.floor+' 层 · '+info.hero+' · '+fmtTime(info.t)):'（空）')+'</div>';
    e.appendChild(d);
    if(info){
      var btn=document.createElement('button');
      btn.className='btn primary'; btn.style.minWidth='90px'; btn.style.padding='6px 14px'; btn.style.fontSize='13px';
      btn.textContent='读取';
      btn.onclick=function(slot){
        return function(){
          var data=G.Save.loadManual(slot);
          if(data && G.Save.restore(game, data)){
            fromGamePanel=false; game.panelOpen=false;
            show(null);
            G.Audio.init(); G.Audio.resume();
            toastDom('已读取存档');
          } else toastDom('读取失败');
        };
      }(i);
      e.appendChild(btn);
    }
    box.appendChild(e);
  }
}

/* ---------- 任务板 ---------- */
function buildQuest(){
  var box=$('quest-body');
  box.innerHTML='';
  var qd=game.lobbyQuests;
  if(!qd) return;
  qd.list.forEach(function(q,i){
    var e=document.createElement('div');
    e.className='entry';
    var info=document.createElement('div');
    info.className='info';
    info.innerHTML='<div class="nm">'+q.name+' <span class="pill">'+q.prog+'/'+q.target+'</span></div>'+
      '<div class="ds">奖励 '+q.reward+' 金币</div>';
    e.appendChild(info);
    if(q.done && !q.claimed){
      var btn=document.createElement('button');
      btn.className='btn primary'; btn.style.minWidth='80px'; btn.style.padding='6px 14px'; btn.style.fontSize='13px';
      btn.textContent='领取';
      btn.onclick=function(){
        if(q.done && !q.claimed){
          game.player.coins+=q.reward;
          q.claimed=true;
          U.save('quests',qd);
          buildQuest();
          G.Audio.sfx.coin();
        }
      };
      e.appendChild(btn);
    } else if(q.claimed){
      var done=document.createElement('span');
      done.className='pill'; done.style.color='#6ee27f'; done.textContent='已领取';
      e.appendChild(done);
    }
    box.appendChild(e);
  });
}

/* ---------- 祝福选择 ---------- */
function showUpgrade(picks){
  var box=$('upgrade-cards');
  box.innerHTML='';
  picks.forEach(function(b){
    var card=document.createElement('div');
    card.className='card';
    card.appendChild(mini(64,64,function(x){
      x.clearRect(0,0,64,64);
      var gr=x.createRadialGradient(32,32,2,32,32,28);
      gr.addColorStop(0,b.icon); gr.addColorStop(1,U.alpha(b.icon,0));
      x.fillStyle=gr; x.beginPath(); x.arc(32,32,28,0,TAU); x.fill();
      x.fillStyle=b.icon; x.beginPath(); x.arc(32,32,14,0,TAU); x.fill();
      x.strokeStyle='rgba(255,255,255,0.6)'; x.lineWidth=2; x.stroke();
      x.fillStyle='#101828'; x.font='bold 16px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
      x.fillText(b.name.charAt(0),32,32);
    }));
    var d=document.createElement('div');
    d.innerHTML='<h3>'+b.name+'</h3><p>'+b.desc+'</p>';
    while(d.firstChild) card.appendChild(d.firstChild);
    card.onclick=function(){
      game.applyBuff(b);
      show(null);
    };
    box.appendChild(card);
  });
  show('scr-upgrade');
}

/* ---------- 结算 ---------- */
function statRow(el, list){
  el.innerHTML='';
  list.forEach(function(s){
    var d=document.createElement('div');
    d.className='stat';
    d.innerHTML=s[0]+'<b>'+s[1]+'</b>';
    el.appendChild(d);
  });
}
function gameOver(win){
  var s=game.stats, p=game.player;
  var mm=Math.floor(s.time/60), ss=Math.floor(s.time%60);
  $('over-title').textContent = win?'胜 利 通 关':'你 倒 下 了';
  $('over-title').className = 'scr-title '+(win?'glow':'dead');
  statRow($('over-stats'), [
    ['抵达层数', s.floor], ['击杀数', s.kills], ['金币', s.coins],
    ['用时', mm+':'+(ss<10?'0':'')+ss], ['总伤害', Math.round(s.dmg)],
    ['祝福', p?p.picked.length:0]
  ]);
  show('scr-over');
  var best=U.load('best',0);
  if(s.kills>best) U.save('best',s.kills);
}

/* ---------- 按钮 ---------- */
function bindButtons(){
  document.addEventListener('click', function(ev){
    var t=ev.target;
    if(t.classList && t.classList.contains('tab')){
      qa('.tab').forEach(function(x){ x.classList.remove('active'); });
      t.classList.add('active');
      buildCodex(t.getAttribute('data-tab'));
      G.Audio.init(); G.Audio.sfx.click();
      return;
    }
    var act = t.getAttribute && t.getAttribute('data-act');
    if(!act) return;
    G.Audio.init(); G.Audio.resume(); G.Audio.sfx.click();
    if(act==='chars'){ buildHeroes(); show('scr-chars'); }
    else if(act==='codex'){ buildCodex('weapons'); show('scr-codex'); }
    else if(act==='help'){ show('scr-help'); }
    else if(act==='opts'){ buildOpts(); prevScreen=cur; show('scr-opts'); }
    else if(act==='back'){
      if(fromGamePanel){ fromGamePanel=false; game.panelOpen=false; show(null); }
      else { show(prevScreen&&prevScreen!=='scr-opts'?prevScreen:'scr-title'); prevScreen=null; }
    }
    else if(act==='start'){ show(null); game.enterLobby(); }
    else if(act==='continue'){
      var data=G.Save.loadAuto();
      if(data && G.Save.restore(game, data)){
        show(null);
        G.Audio.init(); G.Audio.resume();
        toastDom('已继续冒险');
      } else toastDom('没有可用的存档');
    }
    else if(act==='load'){ buildLoadSlots(); show('scr-load'); }
    else if(act==='save'){ buildSaveSlots(); show('scr-save'); }
    else if(act==='net-host'){
      var addr=$('net-server').value.trim()||'127.0.0.1:9000';
      var room=($('net-room').value.trim()||genRoom()).toUpperCase();
      $('net-room').value=room;
      G.Net.onStatus=function(msg){ $('net-status').textContent=msg; };
      G.Net.host(game, room, addr, function(res){
        if(res.ok && res.connected){ toastDom('客机已加入，去传送门开局吧'); }
        else if(!res.ok){ toastDom('创建失败：'+res.error); }
      });
    }
    else if(act==='net-join'){
      var addr=$('net-server').value.trim()||'127.0.0.1:9000';
      var room=($('net-room').value.trim()||'').toUpperCase();
      if(!room){ toastDom('请输入房间码'); return; }
      G.Net.onStatus=function(msg){ $('net-status').textContent=msg; };
      G.Net.join(game, room, addr, selHero, function(res){
        if(!res.ok) toastDom('加入失败：'+res.error);
      });
    }
    else if(act==='disasm-do'){
      if(game.disassembleWeapon(disasmSel)){ disasmSel=0; buildDisasm(); }
    }
    else if(act==='disasm-install'){
      if(game.installModulesTo(disasmSel)){ buildDisasm(); }
    }
    else if(act==='net-leave'){
      G.Net.leave();
      game.netMode=null;
      toastDom('已断开联机');
    }
    else if(act==='forge-confirm'){
      if(forgeSel.main>=0 && forgeSel.sub>=0 && game.fuseWeapons(forgeSel.main, forgeSel.sub)){
        forgeSel={main:-1,sub:-1}; buildForge();
      }
    }
    else if(act==='recycle-confirm'){
      if(scrapSel>=0 && game.scrapWeapon(scrapSel)){ scrapSel=-1; buildRecycle(); }
    }
    else if(act==='resume'){ show(null); game.state='playing'; }
    else if(act==='quit'){ game.state='menu'; G.Audio.music.stop(); show('scr-title'); }
    else if(act==='retry'){ show(null); game.start(selHero); }
    else if(act==='menu'){ game.state='menu'; G.Audio.music.stop(); show('scr-title'); }
    else if(act==='play'){ buildHeroes(); show('scr-chars'); }
  });
}
var prevScreen=null;
function genRoom(){
  var chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s='';
  for(var i=0;i<6;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

/* ---------- 主循环 ---------- */
var last=0;
function loop(ts){
  requestAnimationFrame(loop);
  var dt=Math.min(0.05,(ts-last)/1000)||0;
  last=ts;
  var IN=G.Input;
  if(game.state==='playing'){
    if(IN.hit('escape','p')){ game.state='paused'; buildPauseStats(); show('scr-pause'); }
    if(IN.hit('m')){ var on=G.Audio.toggle(); toastDom(on?'音效开启':'音效静音'); }
  } else if(game.state==='paused'){
    if(IN.hit('escape','p')){ game.state='playing'; show(null); }
  }
  if(game.msgT>0) game.msgT-=dt;
  game.update(dt);
  if(game.state!=='menu') game.draw();
  else drawMenuBg();
  game.drawHUD();
  IN.end();
}
function buildPauseStats(){
  var s=game.stats, p=game.player;
  statRow($('pause-stats'), [
    ['层数',s.floor], ['击杀',s.kills], ['金币',p?p.coins:0], ['祝福',p?p.picked.length:0]
  ]);
}

/* 菜单背景：漂浮的怪物剪影 */
var menuMobs=[];
function drawMenuBg(){
  var ctx=game.ctx;
  ctx.setTransform(1,0,0,1,0,0);
  var gr=ctx.createLinearGradient(0,0,0,360);
  gr.addColorStop(0,'#141a33'); gr.addColorStop(1,'#070a15');
  ctx.fillStyle=gr; ctx.fillRect(0,0,640,360);
  if(!menuMobs.length){
    for(var i=0;i<9;i++){
      var d=U.pick(En.list.filter(function(q){ return !q.boss; }));
      menuMobs.push({ look:d.look, x:U.rand(0,640), y:U.rand(40,330), r:U.rand(9,17),
        vx:U.rand(-16,16), vy:U.rand(-9,9), t:U.rand(0,10) });
    }
  }
  game.t+=0.016;
  for(var j=0;j<menuMobs.length;j++){
    var m=menuMobs[j];
    m.x+=m.vx*0.016; m.y+=m.vy*0.016;
    if(m.x<-30) m.x=670; if(m.x>670) m.x=-30;
    if(m.y<20) m.vy=Math.abs(m.vy); if(m.y>340) m.vy=-Math.abs(m.vy);
    ctx.globalAlpha=0.32;
    Art.creature(ctx,m.x,m.y,m.r,m.look,{t:game.t+m.t,face:m.vx>0?1:-1,moving:0.5});
    ctx.globalAlpha=1;
  }
  var vg=ctx.createRadialGradient(320,180,90,320,180,340);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.7)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,640,360);
}

/* ---------- 启动 ---------- */
function boot(){
  game = new G.Game();
  G.game = game;
  game.init();
  game.opts.light = U.load('light',true);
  game.opts.shake = U.load('shake',true);
  game.opts.particles = U.load('parts',true);
  G.Audio.sfxVol = U.load('sfx',0.55);
  G.Audio.musVol = U.load('mus',0.34);
  game.onUpgrade = showUpgrade;
  game.onForge = function(){ fromGamePanel=true; game.panelOpen=true; forgeSel={main:-1,sub:-1}; buildForge(); show('scr-forge'); };
  game.onRecycle = function(){ fromGamePanel=true; game.panelOpen=true; scrapSel=-1; buildRecycle(); show('scr-recycle'); };
  game.onQuest = function(){ fromGamePanel=true; game.panelOpen=true; buildQuest(); show('scr-quest'); };
  game.onDisasm = function(){ fromGamePanel=true; game.panelOpen=true; disasmSel=0; buildDisasm(); show('scr-disasm'); };
  game.onNet = function(){ fromGamePanel=true; game.panelOpen=true; show('scr-net'); };
  game.onGunsmith = function(){
    fromGamePanel=true; game.panelOpen=true;
    partsSel=0;
    /* 从当前房间的武器商取配件 */
    var gs=null;
    for(var i=0;i<game.inter.length;i++) if(game.inter[i].kind==='gunsmith') gs=game.inter[i];
    partsShop = gs? gs.parts : [];
    buildParts(); show('scr-parts');
  };
  game.onGameOver = function(){ setTimeout(function(){ gameOver(false); }, 900); };
  game.onWin = function(){ G.Audio.music.stop(); gameOver(true); };
  bindButtons();
  buildHeroes();
  /* 存档入口：有自动存档显示"继续冒险"，有手动存档显示"读取存档" */
  if(G.Save.hasAuto()) $('btn-continue').style.display='';
  var anyManual=false;
  for(var si=0;si<3;si++) if(G.Save.manualInfo(si)) anyManual=true;
  if(anyManual) $('btn-load').style.display='';
  var once=function(){ G.Audio.init(); G.Audio.resume(); window.removeEventListener('pointerdown',once); window.removeEventListener('keydown',once); };
  window.addEventListener('pointerdown',once);
  window.addEventListener('keydown',once);
  /* 调试/演示入口: ?auto=knight&floor=3&room=combat  |  ?screen=chars */
  try{
    var q=(window.location&&window.location.search)||'';
    var sm=q.match(/screen=([a-z]+)/);
    if(sm){ if(sm[1]==='chars'){ buildHeroes(); show('scr-chars'); }
            else if(sm[1]==='codex'){ buildCodex('weapons'); show('scr-codex'); }
            else if(sm[1]==='help'){ show('scr-help'); } }
    var am=q.match(/auto=([a-z]+)/);
    if(am){
      show(null); game.start(am[1]);
      var fm=q.match(/floor=(\d+)/);
      if(fm){ var fn=Math.max(1,Math.min(6,parseInt(fm[1],10))); if(fn>1) game.newFloor(fn); }
      var rm=q.match(/room=([a-z]+)/);
      if(rm){
        var want=rm[1]==='boss'?'boss':(rm[1]==='shop'?'shop':'normal');
        for(var ri=0;ri<game.map.rooms.length;ri++){
          var rr=game.map.rooms[ri];
          if(rr.type===want){ game.player.x=rr.cx; game.player.y=rr.cy+ (want==='boss'?70:0);
            game.cam.x=game.player.x-320; game.cam.y=game.player.y-180; break; }
        }
      }
    }
  }catch(e){}
  requestAnimationFrame(loop);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();
})();
