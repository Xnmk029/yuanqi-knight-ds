/* 元气骑士·深渊回响 —— 地牢生成 */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var TAU = Math.PI*2;
var D = {};
G.Dungeon = D;

D.TS = 20;
var VOID=0, FLOOR=1, WALL=2, DOOR=3, LIQUID=4, PIT=5;
D.VOID=VOID; D.FLOOR=FLOOR; D.WALL=WALL; D.DOOR=DOOR; D.LIQUID=LIQUID; D.PIT=PIT;

var GW=7, GH=7, CW=32, CH=22;

function key(x,y){ return x+','+y; }

D.generate = function(floor, biome, opts){
  opts = opts||{};
  var TS = D.TS;
  /* 种子 RNG：opts.seed 提供时地图可复现（存档/联机用） */
  var R = (opts.seed!==undefined) ? U.rng(opts.seed) : null;
  var rnd = R? R.rand : Math.random;
  var randi = R? R.randi : U.randi;
  var pick = R? R.pick : U.pick;
  var shuffle = R? R.shuffle : U.shuffle;
  var chance = R? R.chance : U.chance;
  var map = {
    tw: GW*CW, th: GH*CH, TS:TS, floor:floor, biome:biome, seed:opts.seed,
    rooms:[], doors:[], doorAt:{}, lights:[], props:[]
  };
  map.w = map.tw*TS; map.h = map.th*TS;
  map.tiles = new Uint8Array(map.tw*map.th);

  /* --- 1. 选格子 --- */
  var used = {}, cells = [];
  var cx0=Math.floor(GW/2), cy0=Math.floor(GH/2);
  used[key(cx0,cy0)] = {gx:cx0,gy:cy0,edges:[],dist:0};
  cells.push(used[key(cx0,cy0)]);
  var target = Math.min(13, 7 + Math.floor(floor*0.9));
  var guard=0;
  var DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  while(cells.length<target && guard++<600){
    var base = cells[randi(0,cells.length)];
    var d = pick(DIRS);
    var nx=base.gx+d[0], ny=base.gy+d[1];
    if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
    if(used[key(nx,ny)]) continue;
    var c = {gx:nx,gy:ny,edges:[],dist:base.dist+1,from:base};
    used[key(nx,ny)]=c; cells.push(c);
    base.edges.push(c); c.edges.push(base);
  }
  /* 额外环路 */
  for(var i=0;i<cells.length;i++){
    for(var k=0;k<DIRS.length;k++){
      var nb = used[key(cells[i].gx+DIRS[k][0], cells[i].gy+DIRS[k][1])];
      if(nb && cells[i].edges.indexOf(nb)<0 && chance(0.16)){
        cells[i].edges.push(nb); nb.edges.push(cells[i]);
      }
    }
  }
  /* BFS 距离 */
  var q=[cells[0]]; cells[0].bfs=0;
  while(q.length){ var c2=q.shift();
    for(var e=0;e<c2.edges.length;e++){ var nb2=c2.edges[e]; if(nb2.bfs===undefined){ nb2.bfs=c2.bfs+1; q.push(nb2); } } }

  /* --- 2. 分配房间类型 --- */
  var sorted = cells.slice(1).sort(function(a,b){ return (b.bfs||0)-(a.bfs||0); });
  var bossCell = sorted[0];
  /* 一大关两小关：小关 1 无 BOSS（关底房 gate），小关 2 为 BOSS 房 */
  if(bossCell) bossCell.type = (opts.minor===2) ? 'boss' : 'gate';
  var deadEnds = cells.filter(function(c){ return c.edges.length===1 && c!==cells[0] && c!==bossCell; });
  shuffle(deadEnds);
  if(deadEnds[0]) deadEnds[0].type='treasure';
  if(deadEnds[1]) deadEnds[1].type='shop';
  else { var alt=cells.filter(function(c){return !c.type&&c!==cells[0];}); if(alt.length) pick(alt).type='shop'; }
  if(deadEnds[2]) deadEnds[2].type='shrine';
  if(deadEnds[3]) deadEnds[3].type='forge';
  if(deadEnds[4]) deadEnds[4].type='recycle';
  var rest = cells.filter(function(c){ return !c.type && c!==cells[0]; });
  shuffle(rest);
  var nChal = floor>=2?1:0;
  for(var ci=0;ci<nChal && ci<rest.length;ci++) rest[ci].type='challenge';
  /* 多功能特殊房：按楼层解锁，从剩余房间中挑选（不覆盖 challenge） */
  var specialPool = ['rest','armory','recycle','forge','gunsmith'];
  if(floor>=2) specialPool = specialPool.concat(['elite','mentor','smith','wishing','statue','trap','vault']);
  shuffle(specialPool);
  /* 难度越高，奖励房越少（specRooms 为负） */
  var specAdj = 0;
  if(opts.difficulty!==undefined && G.DIFFICULTY){
    specAdj = G.DIFFICULTY[U.clamp(opts.difficulty,0,3)].specRooms||0;
  }
  var nSpec = Math.min(specialPool.length, Math.max(0, Math.floor(floor*0.8) + specAdj));
  for(var si=0; si<nSpec && (nChal+si)<rest.length; si++) rest[nChal+si].type = specialPool[si];
  cells[0].type='start';
  for(var cj=0;cj<cells.length;cj++) if(!cells[cj].type) cells[cj].type='normal';

  /* --- 3. 生成房间矩形 --- */
  for(var ri=0;ri<cells.length;ri++){
    var c3=cells[ri];
    var rw, rh;
    if(c3.type==='boss'){ rw=27; rh=18; }
    else if(c3.type==='gate'){ rw=randi(20,25); rh=randi(14,17); }
    else if(c3.type==='shop'||c3.type==='treasure'||c3.type==='shrine'||c3.type==='forge'||c3.type==='recycle'
      ||c3.type==='mentor'||c3.type==='smith'||c3.type==='wishing'||c3.type==='statue'||c3.type==='rest'
      ||c3.type==='trap'||c3.type==='armory'||c3.type==='vault'||c3.type==='gunsmith'){ rw=randi(14,18); rh=randi(10,13); }
    else if(c3.type==='start'){ rw=randi(15,19); rh=randi(11,14); }
    else { rw=randi(15,25); rh=randi(11,17); }
    rw=Math.min(rw,CW-4); rh=Math.min(rh,CH-4);
    var ccx = c3.gx*CW + Math.floor(CW/2);
    var ccy = c3.gy*CH + Math.floor(CH/2);
    var room = {
      idx:ri, gx:c3.gx, gy:c3.gy, type:c3.type, cell:c3,
      x: ccx - Math.floor(rw/2), y: ccy - Math.floor(rh/2), w:rw, h:rh,
      ctx: ccx, cty: ccy,
      cx:(ccx+0.5)*TS, cy:(ccy+0.5)*TS,
      cleared:(c3.type==='start'||c3.type==='treasure'||c3.type==='shop'||c3.type==='shrine'
        ||c3.type==='forge'||c3.type==='recycle'||c3.type==='mentor'||c3.type==='smith'||c3.type==='wishing'
        ||c3.type==='statue'||c3.type==='rest'||c3.type==='trap'||c3.type==='armory'||c3.type==='vault'||c3.type==='gunsmith'),
      visited:false, active:false, doors:[], spawned:false, entities:[]
    };
    room.wx = room.x*TS; room.wy = room.y*TS;
    room.ww = rw*TS; room.wh = rh*TS;
    c3.room = room;
    map.rooms.push(room);
    for(var ty=room.y; ty<room.y+rh; ty++)
      for(var tx=room.x; tx<room.x+rw; tx++)
        map.tiles[ty*map.tw+tx]=FLOOR;
  }
  map.startRoom = cells[0].room;
  map.bossRoom = bossCell? bossCell.room : null;

  /* --- 4. 走廊 + 门 --- */
  var doneEdge = {};
  for(var ei=0;ei<cells.length;ei++){
    var a=cells[ei];
    for(var ee=0;ee<a.edges.length;ee++){
      var b=a.edges[ee];
      var ek = Math.min(a.gx*99+a.gy, b.gx*99+b.gy)+'-'+Math.max(a.gx*99+a.gy,b.gx*99+b.gy);
      if(doneEdge[ek]) continue; doneEdge[ek]=1;
      carveCorridor(map, a.room, b.room);
    }
  }

  /* --- 5. 补墙 --- */
  var t2 = map.tiles;
  for(var y=0;y<map.th;y++){
    for(var x=0;x<map.tw;x++){
      if(t2[y*map.tw+x]!==VOID) continue;
      var near=false;
      for(var dy=-1;dy<=1&&!near;dy++) for(var dx=-1;dx<=1;dx++){
        var nx2=x+dx, ny2=y+dy;
        if(nx2<0||ny2<0||nx2>=map.tw||ny2>=map.th) continue;
        var v=t2[ny2*map.tw+nx2];
        if(v===FLOOR||v===DOOR||v===LIQUID){ near=true; break; }
      }
      if(near) t2[y*map.tw+x]=WALL;
    }
  }

  /* --- 6. 房间装饰 --- */
  var B = G.Art.BIOMES[biome%G.Art.BIOMES.length];
  for(var rr=0;rr<map.rooms.length;rr++) decorate(map, map.rooms[rr], B, floor, R);

  map.startX = map.startRoom.cx;
  map.startY = map.startRoom.cy;
  return map;
};

function setTile(map,x,y,v){
  if(x<0||y<0||x>=map.tw||y>=map.th) return;
  map.tiles[y*map.tw+x]=v;
}
function getTile(map,x,y){
  if(x<0||y<0||x>=map.tw||y>=map.th) return VOID;
  return map.tiles[y*map.tw+x];
}
D.getTile = getTile;

function carveCorridor(map, A, B){
  var TS=D.TS;
  var horiz = (A.gy===B.gy);
  var lo, hi;
  if(horiz){
    lo = A.x<B.x?A:B; hi = A.x<B.x?B:A;
    var row = Math.floor((lo.cty+hi.cty)/2);
    row = U.clamp(row, Math.max(lo.y+2,hi.y+2), Math.min(lo.y+lo.h-3, hi.y+hi.h-3));
    var x0 = lo.x+lo.w, x1 = hi.x-1;
    for(var x=x0;x<=x1;x++) for(var dy=-1;dy<=1;dy++) setTile(map,x,row+dy,FLOOR);
    mkDoor(map, lo, x0, row, true);
    mkDoor(map, hi, x1, row, true);
  } else {
    lo = A.y<B.y?A:B; hi = A.y<B.y?B:A;
    var colc = Math.floor((lo.ctx+hi.ctx)/2);
    colc = U.clamp(colc, Math.max(lo.x+2,hi.x+2), Math.min(lo.x+lo.w-3, hi.x+hi.w-3));
    var y0 = lo.y+lo.h, y1 = hi.y-1;
    for(var y=y0;y<=y1;y++) for(var dx=-1;dx<=1;dx++) setTile(map,colc+dx,y,FLOOR);
    mkDoor(map, lo, colc, y0, false);
    mkDoor(map, hi, colc, y1, false);
  }
}
function mkDoor(map, room, tx, ty, horiz){
  var tiles=[];
  for(var i=-1;i<=1;i++){
    var x = horiz? tx : tx+i;
    var y = horiz? ty+i : ty;
    setTile(map,x,y,DOOR);
    tiles.push({x:x,y:y});
    map.doorAt[x+','+y]=null;
  }
  var d = { tiles:tiles, open:true, room:room, horiz:horiz,
            cx:(tx+0.5)*D.TS, cy:(ty+0.5)*D.TS, anim:0 };
  for(var j=0;j<tiles.length;j++) map.doorAt[tiles[j].x+','+tiles[j].y]=d;
  map.doors.push(d);
  room.doors.push(d);
}

function decorate(map, room, B, floor, R){
  var TS=D.TS;
  var rnd = R? R.rand : Math.random;
  var randi = R? R.randi : U.randi;
  var pick = R? R.pick : U.pick;
  var chance = R? R.chance : U.chance;
  var n, i, tries;
  /* 墙边火把 */
  var torchKind = B.props.indexOf('lamp')>=0?'lamp':'torch';
  for(i=0;i<4;i++){
    var tx2 = room.x + 1 + Math.floor((room.w-2)*(i%2===0?0.18:0.82));
    var ty2 = room.y + 1 + Math.floor((room.h-2)*(i<2?0.1:0.9));
    if(getTile(map,tx2,ty2)!==FLOOR) continue;
    map.props.push({ kind:torchKind, x:(tx2+0.5)*TS, y:(ty2+0.5)*TS, r:8, solid:false, seed:rnd()*10, light:1, room:room, prop:true });
    map.lights.push({ x:(tx2+0.5)*TS, y:(ty2+0.5)*TS-6, r:120, c:B.accent, flicker:1 });
  }
  if(room.type==='boss' || room.type==='shop') return;
  /* 障碍 / 可破坏物 */
  n = room.type==='start'?2:randi(3,8);
  for(i=0;i<n;i++){
    for(tries=0;tries<12;tries++){
      var px = randi(room.x+1, room.x+room.w-1);
      var py = randi(room.y+1, room.y+room.h-1);
      if(getTile(map,px,py)!==FLOOR) continue;
      if(Math.abs(px-room.ctx)<3 && Math.abs(py-room.cty)<3) continue;
      var nearDoor=false;
      for(var d2=0;d2<room.doors.length;d2++){
        if(U.dist((px+0.5)*TS,(py+0.5)*TS,room.doors[d2].cx,room.doors[d2].cy)<70) nearDoor=true;
      }
      if(nearDoor) continue;
      var kind = pick(B.props.filter(function(k){ return k!=='torch'&&k!=='lamp'; }));
      var breakable = (kind==='barrel'||kind==='crate'||kind==='pot'||kind==='ice'||kind==='mushroom');
      map.props.push({ kind:kind, x:(px+0.5)*TS, y:(py+0.5)*TS, r:9,
        solid:!breakable, hp:breakable?12:0, breakable:breakable, seed:rnd()*10, room:room,
        explosive:(kind==='barrel'&&chance(0.45)), prop:true });
      break;
    }
  }
}

/* --- 查询 --- */
D.solidAt = function(map, wx, wy){
  var tx=Math.floor(wx/D.TS), ty=Math.floor(wy/D.TS);
  var v=getTile(map,tx,ty);
  if(v===WALL||v===VOID) return true;
  if(v===DOOR){ var d=map.doorAt[tx+','+ty]; return d? !d.open : false; }
  return false;
};
D.bulletSolidAt = function(map, wx, wy){
  var tx=Math.floor(wx/D.TS), ty=Math.floor(wy/D.TS);
  var v=getTile(map,tx,ty);
  if(v===WALL||v===VOID) return true;
  if(v===DOOR){ var d=map.doorAt[tx+','+ty]; return d? !d.open : false; }
  return false;
};
D.roomAt = function(map, wx, wy){
  for(var i=0;i<map.rooms.length;i++){
    var r=map.rooms[i];
    if(wx>=r.wx-6 && wx<=r.wx+r.ww+6 && wy>=r.wy-6 && wy<=r.wy+r.wh+6) return r;
  }
  return null;
};
D.randFloorIn = function(map, room, marginT){
  marginT = marginT===undefined?2:marginT;
  for(var i=0;i<40;i++){
    var tx=U.randi(room.x+marginT, room.x+room.w-marginT);
    var ty=U.randi(room.y+marginT, room.y+room.h-marginT);
    if(getTile(map,tx,ty)===FLOOR) return {x:(tx+0.5)*D.TS, y:(ty+0.5)*D.TS};
  }
  return {x:room.cx, y:room.cy};
};
D.los = function(map, x1,y1,x2,y2){
  var dx=x2-x1, dy=y2-y1, d=Math.sqrt(dx*dx+dy*dy);
  if(d<1) return true;
  var steps=Math.ceil(d/(D.TS*0.6));
  for(var i=1;i<steps;i++){
    var t=i/steps;
    if(D.bulletSolidAt(map, x1+dx*t, y1+dy*t)) return false;
  }
  return true;
};
})();
