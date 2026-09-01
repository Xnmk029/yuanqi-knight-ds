/* 元气骑士·深渊回响 —— 开局大厅（仿原版客厅） */
(function(){
var G = window.G || (window.G = {});
var U = G.U, Art = G.Art, Wp = G.Weapons;
var TAU = Math.PI*2;
var L = {};
G.Lobby = L;

/* 设施布局（640x360 世界坐标） */
L.LAYOUT = {
  spawn:{x:320,y:300},
  portal:{x:320,y:88},
  heroes:{x:96,y:150},
  forge:{x:544,y:150},
  gacha:{x:96,y:268},
  dummy:{x:544,y:268},
  quest:{x:320,y:196},
  garden:{x:320,y:318}
};

L.enter = function(g){
  g.state='lobby';
  g.lobbyT=0;
  var p=g.player;
  if(!p){ p=new G.Player(G.Heroes[0], g); g.player=p; }
  p.x=L.LAYOUT.spawn.x; p.y=L.LAYOUT.spawn.y; p.vx=p.vy=0;
  p.weapons=[]; p.wi=0;
  p.coins=50; p.keys=0;
  p.hp=p.maxHp; p.armor=p.maxArmor; p.energy=p.maxEnergy;
  p.buffs={}; p.dead=false; p.iframe=0;
  g.lobbyHeroIdx=0;
  g.lobbyDummyT=0; g.lobbyDummyDps=0; g.lobbyDummyDpsT=0;
  var today=new Date().getDate();
  var gd=U.load('garden',null);
  if(!gd || gd.day!==today) gd={day:today, watered:false};
  g.lobbyGarden=gd;
  var qd=U.load('quests',null);
  if(!qd || qd.day!==today){
    qd={day:today, list:[
      {id:'kill', name:'击杀 30 只怪物', target:30, prog:0, done:false, claimed:false, reward:40},
      {id:'floor', name:'通关 2 层地牢', target:2, prog:0, done:false, claimed:false, reward:50},
      {id:'chest', name:'开启 3 个宝箱', target:3, prog:0, done:false, claimed:false, reward:30}
    ]};
    U.save('quests',qd);
  }
  g.lobbyQuests=qd;
  G.Audio.music.stop();
};

/* 地牢内任务进度钩子 */
L.addProgress = function(kind, n){
  var g=G.game;
  if(!g || !g.lobbyQuests) return;
  var qd=g.lobbyQuests;
  for(var i=0;i<qd.list.length;i++){
    var q=qd.list[i];
    if(q.id===kind && !q.done){
      q.prog=Math.min(q.target, q.prog+n);
      if(q.prog>=q.target) q.done=true;
    }
  }
  U.save('quests',qd);
};

L.update = function(g, dt){
  g.lobbyT+=dt;
  var IN=G.Input;
  var p=g.player;
  /* 移动 */
  var mv=IN.moveVec();
  var sp=150;
  p.vx=U.damp(p.vx, mv.x*sp, 12, dt);
  p.vy=U.damp(p.vy, mv.y*sp, 12, dt);
  p.x=U.clamp(p.x+p.vx*dt, 30, 610);
  p.y=U.clamp(p.y+p.vy*dt, 30, 340);
  p.moving=Math.min(1,Math.sqrt(mv.x*mv.x+mv.y*mv.y));
  /* 瞄准 */
  var w=g.screenToWorld(IN.mx, IN.my);
  p.aim=U.ang(p.x,p.y,w.x,w.y);
  p.face=Math.cos(p.aim)>=0?1:-1;
  /* 木桩攻击测试 */
  if(IN.down && p.weapons.length){
    g.lobbyDummyT-=dt;
    if(g.lobbyDummyT<=0){
      g.lobbyDummyT=0.22;
      var dx=Math.cos(p.aim), dy=Math.sin(p.aim);
      var d=U.dist(p.x,p.y,L.LAYOUT.dummy.x,L.LAYOUT.dummy.y);
      var dot=(L.LAYOUT.dummy.x-p.x)*dx+(L.LAYOUT.dummy.y-p.y)*dy;
      if(dot>0 && d<280){
        var wq=p.wpn();
        var dmg=Math.round(wq.dmg*(0.8+Math.random()*0.4));
        g.float(dmg, L.LAYOUT.dummy.x+U.rand(-6,6), L.LAYOUT.dummy.y-30, '#ffd45e', 13);
        g.burst(L.LAYOUT.dummy.x,L.LAYOUT.dummy.y,4,{color:'#c8a878',spd:80,life:0.3});
        g.lobbyDummyDps+=dmg; g.lobbyDummyDpsT+=0.22;
        if(g.lobbyDummyDpsT>=1){
          g.float('DPS '+Math.round(g.lobbyDummyDps), L.LAYOUT.dummy.x, L.LAYOUT.dummy.y-46, '#8ef0ff', 12);
          g.lobbyDummyDps=0; g.lobbyDummyDpsT=0;
        }
      }
    }
  }
  /* 互动 */
  var spots=[
    {key:'portal', x:L.LAYOUT.portal.x, y:L.LAYOUT.portal.y, label:'进入地牢（E）'},
    {key:'heroes', x:L.LAYOUT.heroes.x, y:L.LAYOUT.heroes.y, label:'英雄：'+G.Heroes[g.lobbyHeroIdx].name+'（E 切换）'},
    {key:'forge', x:L.LAYOUT.forge.x, y:L.LAYOUT.forge.y, label:'锻造台（E）'},
    {key:'gacha', x:L.LAYOUT.gacha.x, y:L.LAYOUT.gacha.y, label:'扭蛋机 30金（E）'},
    {key:'dummy', x:L.LAYOUT.dummy.x, y:L.LAYOUT.dummy.y, label:'训练木桩（攻击测试）'},
    {key:'quest', x:L.LAYOUT.quest.x, y:L.LAYOUT.quest.y, label:'任务板（E）'},
    {key:'garden', x:L.LAYOUT.garden.x, y:L.LAYOUT.garden.y, label:g.lobbyGarden.watered?'花园（今日已浇水）':'花园（E 浇水收获）'},
    {key:'net', x:320, y:150, label:'联机石碑（E）'}
  ];
  var best=null, bd=46;
  for(var i=0;i<spots.length;i++){
    var s2=spots[i];
    var d2=U.dist(p.x,p.y,s2.x,s2.y);
    if(d2<bd){ bd=d2; best=s2; }
  }
  g.lobbyHint=null;
  if(best){
    g.lobbyHint={x:best.x,y:best.y-30,text:best.label,color:'#ffe07a'};
    if(IN.hit('e','f')){
      if(best.key==='portal'){
        g.start(G.Heroes[g.lobbyHeroIdx].id);
        if(G.Net && G.Net.state==='host') g.netMode='host';
      }
      else if(best.key==='heroes'){ g.lobbyHeroIdx=(g.lobbyHeroIdx+1)%G.Heroes.length; G.Audio.sfx.click(); }
      else if(best.key==='forge'){ if(g.onForge) g.onForge(); }
      else if(best.key==='gacha'){ L.gacha(g); }
      else if(best.key==='quest'){ if(g.onQuest) g.onQuest(); }
      else if(best.key==='garden'){ L.waterGarden(g); }
      else if(best.key==='net'){ if(g.onNet) g.onNet(); }
    }
  }
  IN.end();
};

L.gacha = function(g){
  var p=g.player;
  if(p.coins<30){ g.float('需要 30 金币',p.x,p.y-24,'#ff5b6e'); return; }
  p.coins-=30;
  var def=Wp.roll(1, 0.8);
  p.giveWeapon(def);
  g.toast('扭蛋机：'+def.name+' ['+Wp.RARITY_NAME[def.rarity-1]+']');
  g.burst(L.LAYOUT.gacha.x,L.LAYOUT.gacha.y,20,{color:Wp.RARITY_COLOR[def.rarity-1],spd:150,life:0.6});
  G.Audio.sfx.power();
};

L.waterGarden = function(g){
  if(g.lobbyGarden.watered){ g.float('今天已经浇过水了',g.player.x,g.player.y-24,'#8fa3cc'); return; }
  g.lobbyGarden.watered=true;
  U.save('garden',g.lobbyGarden);
  var gold=U.randi(15,30);
  g.player.coins+=gold;
  g.toast('花园收获：+'+gold+' 金币');
  g.burst(L.LAYOUT.garden.x,L.LAYOUT.garden.y,16,{color:'#8ef07a',spd:120,life:0.6});
  G.Audio.sfx.heal();
};

L.draw = function(g, ctx){
  var t=g.lobbyT;
  ctx.setTransform(1,0,0,1,0,0);
  var gr=ctx.createLinearGradient(0,0,0,360);
  gr.addColorStop(0,'#1a2038'); gr.addColorStop(1,'#0e1224');
  ctx.fillStyle=gr; ctx.fillRect(0,0,640,360);
  /* 地板 */
  ctx.fillStyle='#2a2438';
  ctx.fillRect(20,20,600,320);
  ctx.strokeStyle='rgba(90,80,140,0.22)'; ctx.lineWidth=1;
  for(var x=20;x<620;x+=40){ ctx.beginPath(); ctx.moveTo(x,20); ctx.lineTo(x,340); ctx.stroke(); }
  for(var y=20;y<340;y+=40){ ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(620,y); ctx.stroke(); }
  /* 中央地毯 */
  ctx.fillStyle='rgba(120,60,80,0.3)';
  ctx.fillRect(250,60,140,110);
  ctx.strokeStyle='rgba(255,200,120,0.28)'; ctx.lineWidth=2;
  ctx.strokeRect(250,60,140,110);
  /* 墙壁装饰 */
  ctx.fillStyle='rgba(90,80,140,0.3)';
  for(var wx=40;wx<620;wx+=80){
    ctx.beginPath(); ctx.arc(wx,32,6,0,TAU); ctx.fill();
  }
  /* 设施 */
  Art.portal(ctx, L.LAYOUT.portal.x, L.LAYOUT.portal.y, t, '#8ef0ff');
  Art.forge(ctx, L.LAYOUT.forge.x, L.LAYOUT.forge.y, t, false);
  Art.gacha(ctx, L.LAYOUT.gacha.x, L.LAYOUT.gacha.y, t);
  Art.dummy(ctx, L.LAYOUT.dummy.x, L.LAYOUT.dummy.y, t);
  Art.questboard(ctx, L.LAYOUT.quest.x, L.LAYOUT.quest.y, t);
  Art.garden(ctx, L.LAYOUT.garden.x, L.LAYOUT.garden.y, t, g.lobbyGarden.watered);
  /* 难度显示 */
  ctx.save();
  ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
  var D=G.DIFFICULTY[U.clamp(g.difficulty||0,0,3)];
  ctx.fillStyle='rgba(8,10,22,0.7)';
  U.roundRect(ctx,320-70,44,140,18,9); ctx.fill();
  ctx.fillStyle='#ffd06a';
  ctx.fillText('难度：'+D.name,320,57);
  ctx.restore();
  /* 英雄立牌 */
  for(var hi=0;hi<G.Heroes.length;hi++){
    var H=G.Heroes[hi];
    var hx=60+(hi%3)*36, hy=128+Math.floor(hi/3)*40;
    var sel=(hi===g.lobbyHeroIdx);
    ctx.save();
    if(sel){
      ctx.fillStyle='rgba(255,208,106,0.18)';
      U.roundRect(ctx,hx-16,hy-22,32,44,6); ctx.fill();
      ctx.strokeStyle='#ffd06a'; ctx.lineWidth=1.6;
      U.roundRect(ctx,hx-16,hy-22,32,44,6); ctx.stroke();
    }
    Art.hero(ctx,hx,hy,9,H,{t:t+hi*0.3,face:1,moving:0});
    ctx.fillStyle=sel?'#ffd06a':'#8fa3cc';
    ctx.font='bold 8px sans-serif'; ctx.textAlign='center';
    ctx.fillText(H.name,hx,hy+20);
    ctx.restore();
  }
  /* 玩家 */
  var p=g.player;
  Art.hero(ctx,p.x,p.y,10,p.hero,{t:t,face:p.face,moving:p.moving});
  /* 提示 */
  if(g.lobbyHint){
    ctx.save();
    ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
    var tw=ctx.measureText(g.lobbyHint.text).width;
    ctx.fillStyle='rgba(8,10,22,0.85)';
    U.roundRect(ctx,g.lobbyHint.x-tw/2-8,g.lobbyHint.y-12,tw+16,22,11); ctx.fill();
    ctx.strokeStyle=U.alpha(g.lobbyHint.color,0.6); ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=g.lobbyHint.color;
    ctx.fillText(g.lobbyHint.text,g.lobbyHint.x,g.lobbyHint.y+3);
    ctx.restore();
  }
};
})();
