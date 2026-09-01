/* 元气骑士·深渊回响 —— 存档系统（持久化缓存 + 实时存档） */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var S = {};
G.Save = S;

S.ver = 1;
S.AUTO = 'yqks_save_auto';
S.MANUAL = ['yqks_save_1','yqks_save_2','yqks_save_3'];

/* ---------- 序列化 ---------- */
S.capture = function(g){
  if(!g || !g.player || !g.map) return null;
  var p=g.player;
  return {
    ver:S.ver, t:Date.now(),
    floorNum:g.floorNum, loop:g.loop||0, biome:g.biome,
    seed:g.map.seed,
    difficulty:g.difficulty||0,
    stats:g.stats,
    quests:g.lobbyQuests||null,
    player:{
      hero:p.hero.id,
      hp:p.hp, maxHp:p.maxHp,
      armor:p.armor, maxArmor:p.maxArmor,
      energy:p.energy, maxEnergy:p.maxEnergy,
      coins:p.coins, keys:p.keys, mats:p.mats||0,
      wi:p.wi, kills:p.kills||0,
      modules:p.modules||null,
      weapons:p.weapons.map(function(w){
        var s=G.Weapons.snapshot(w);
        s.id=w.id; /* id 是继承属性，需显式保存 */
        return s;
      }),
      picked:p.picked.map(function(b){ return b.id; })
    },
    cleared: g.map.rooms.filter(function(r){return r.cleared;}).map(function(r){return r.idx;})
  };
};

/* ---------- 写入 / 读取 ---------- */
S.save = function(key, g){
  try{
    var data=S.capture(g);
    if(!data) return false;
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  }catch(e){ return false; }
};
S.auto = function(g){ return S.save(S.AUTO, g); };
S.manual = function(g, slot){ return S.save(S.MANUAL[slot]||S.MANUAL[0], g); };
S.load = function(key){
  try{
    var raw=localStorage.getItem(key);
    if(!raw) return null;
    var d=JSON.parse(raw);
    if(!d || d.ver!==S.ver) return null;
    return d;
  }catch(e){ return null; }
};
S.loadAuto = function(){ return S.load(S.AUTO); };
S.loadManual = function(slot){ return S.load(S.MANUAL[slot]||S.MANUAL[0]); };
S.hasAuto = function(){ try{ return !!localStorage.getItem(S.AUTO); }catch(e){ return false; } };
S.manualInfo = function(slot){
  try{
    var raw=localStorage.getItem(S.MANUAL[slot]||S.MANUAL[0]);
    if(!raw) return null;
    var d=JSON.parse(raw);
    return {t:d.t, floor:d.floorNum, hero:d.player.hero};
  }catch(e){ return null; }
};
S.clear = function(key){ try{ localStorage.removeItem(key); }catch(e){} };
S.clearAuto = function(){ S.clear(S.AUTO); };

/* ---------- 恢复 ---------- */
S.restore = function(g, data){
  if(!data || data.ver!==S.ver) return false;
  var p=data.player;
  var hero=null;
  for(var i=0;i<G.Heroes.length;i++) if(G.Heroes[i].id===p.hero) hero=G.Heroes[i];
  if(!hero) hero=G.Heroes[0];
  var pl=new G.Player(hero, g);
  pl.hp=p.hp; pl.maxHp=p.maxHp;
  pl.armor=p.armor; pl.maxArmor=p.maxArmor;
  pl.energy=p.energy; pl.maxEnergy=p.maxEnergy;
  pl.coins=p.coins; pl.keys=p.keys; pl.mats=p.mats||0;
  pl.kills=p.kills||0;
  pl.weapons=[]; pl.wi=p.wi||0;
  pl.modules=p.modules||null;
  for(var j=0;j<(p.weapons||[]).length;j++) pl.giveWeapon(p.weapons[j], true);
  pl.picked=[];
  for(var k=0;k<(p.picked||[]).length;k++){
    for(var b=0;b<G.Buffs.length;b++){
      if(G.Buffs[b].id===p.picked[k]){ G.Buffs[b].fn(pl); pl.picked.push(G.Buffs[b]); break; }
    }
  }
  g.player=pl;
  g.floorNum=data.floorNum||1;
  g.loop=data.loop||0;
  g.difficulty=data.difficulty||0;
  g.stats=data.stats||{kills:0,coins:0,time:0,floor:1,dmg:0};
  g.lobbyQuests=data.quests||null;
  /* 用存档种子重建同一地图，cleared 标记才能正确对应 */
  g.newFloor(g.floorNum, data.seed);
  var cleared=data.cleared||[];
  for(var r=0;r<g.map.rooms.length;r++){
    var rr=g.map.rooms[r];
    if(cleared.indexOf(rr.idx)>=0){ rr.cleared=true; rr.active=false; }
  }
  g.player.x=g.map.startX; g.player.y=g.map.startY;
  g.state='playing';
  return true;
};
})();
