/* 元气骑士·深渊回响 —— 程序化美术渲染层 */
(function(){
var G = window.G || (window.G = {});
var U = G.U;
var TAU = Math.PI*2;
var Art = {};
G.Art = Art;

/* ================= 生物群系调色板 ================= */
Art.BIOMES = [
  { name:'古堡地牢', floorA:'#3a3450', floorB:'#332e47', floorC:'#443c5e', wall:'#605677', wallTop:'#7a6f98', wallDark:'#2b2540',
    edge:'#1d1930', amb:'#5d5a8e', fog:'#0e0c1c', accent:'#9d8cf0', liquid:'#2a4a6e', props:['barrel','crate','torch','statue','pot','banner'] },
  { name:'霜寒冰窟', floorA:'#2f4a63', floorB:'#28405a', floorC:'#37566f', wall:'#4e7392', wallTop:'#6d9ab8', wallDark:'#23384d',
    edge:'#152535', amb:'#4c7a9e', fog:'#08131f', accent:'#8ee7ff', liquid:'#3f7fb0', props:['ice','crate','torch','crystal','pot'] },
  { name:'熔火深渊', floorA:'#4a2b28', floorB:'#3e2422', floorC:'#5a3430', wall:'#7a4034', wallTop:'#95513f', wallDark:'#361c19',
    edge:'#22100e', amb:'#8e4c2e', fog:'#1a0705', accent:'#ff9040', liquid:'#e05a1a', props:['barrel','skullpile','torch','rock','pot'] },
  { name:'幽茂丛林', floorA:'#2f4a33', floorB:'#28402c', floorC:'#39573c', wall:'#3f6b45', wallTop:'#578a57', wallDark:'#20351f',
    edge:'#14220f', amb:'#568c55', fog:'#08160a', accent:'#8ef07a', liquid:'#3a7a5a', props:['plant','crate','torch','rock','mushroom'] },
  { name:'源能实验室', floorA:'#2b3350', floorB:'#252c46', floorC:'#333d60', wall:'#3f4c74', wallTop:'#56679a', wallDark:'#1c2238',
    edge:'#101426', amb:'#4a6ba0', fog:'#060a16', accent:'#5ee0ff', liquid:'#28c0d0', props:['machine','crate','lamp','pipe','pot'] },
  { name:'虚空回响', floorA:'#33284a', floorB:'#2b2140', floorC:'#3e3059', wall:'#4a3670', wallTop:'#634a91', wallDark:'#241a38',
    edge:'#120d1f', amb:'#634394', fog:'#07040f', accent:'#e07aff', liquid:'#7a3ad0', props:['crystal','statue','torch','rock','pot'] }
];

/* ================= 基础工具 ================= */
function col(c, flash){
  if(!flash) return c;
  return U.mix(c, '#ffffff', Math.min(1,flash));
}
Art.shadow = function(ctx,x,y,rx,ry,a){
  ctx.globalAlpha = a===undefined?0.32:a;
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,TAU); ctx.fill();
  ctx.globalAlpha = 1;
};
function grad(ctx,x,y,r,cTop,cBot){
  var g = ctx.createLinearGradient(x,y-r,x,y+r);
  g.addColorStop(0,cTop); g.addColorStop(1,cBot);
  return g;
}
function blob(ctx,x,y,rx,ry,c1,c2,ol,olw){
  ctx.fillStyle = grad(ctx,x,y,ry,c1,c2);
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,TAU); ctx.fill();
  if(ol){ ctx.strokeStyle=ol; ctx.lineWidth=olw||2; ctx.stroke(); }
}
function rrect(ctx,x,y,w,h,r){ U.roundRect(ctx,x,y,w,h,r); }

Art.glowDot = function(ctx,x,y,r,c,a){
  var g = ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0, U.alpha(c, a===undefined?0.95:a));
  g.addColorStop(0.45, U.alpha(c, (a===undefined?0.95:a)*0.35));
  g.addColorStop(1, U.alpha(c,0));
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
};

/* 眼睛 */
function eyes(ctx,n,cx,cy,spread,r,ec,face,t,seed,flash,pupil){
  var blink = (Math.sin(t*2.1+seed*7.3)>0.975)?0.12:1;
  var offs;
  if(n===1) offs=[0];
  else if(n===2) offs=[-spread,spread];
  else if(n===3) offs=[-spread,0,spread];
  else offs=[-spread*1.5,-spread*0.5,spread*0.5,spread*1.5];
  ctx.fillStyle = col(ec,flash);
  for(var i=0;i<offs.length;i++){
    var ex = cx+offs[i]+face*r*0.35, ey=cy;
    ctx.beginPath(); ctx.ellipse(ex,ey,r,r*blink,0,0,TAU); ctx.fill();
  }
  if(pupil!==false && blink>0.5){
    ctx.fillStyle='rgba(10,6,18,0.85)';
    for(var j=0;j<offs.length;j++){
      var px = cx+offs[j]+face*r*0.6, py=cy+r*0.12;
      ctx.beginPath(); ctx.ellipse(px,py,r*0.4,r*0.5,0,0,TAU); ctx.fill();
    }
  }
}
function hornsF(ctx,x,y,r,c,flash){
  ctx.fillStyle=col(c,flash);
  ctx.beginPath(); ctx.moveTo(x-r*0.72,y-r*0.45); ctx.lineTo(x-r*1.15,y-r*1.35); ctx.lineTo(x-r*0.24,y-r*0.78); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+r*0.72,y-r*0.45); ctx.lineTo(x+r*1.15,y-r*1.35); ctx.lineTo(x+r*0.24,y-r*0.78); ctx.closePath(); ctx.fill();
}
function spikesF(ctx,x,y,r,c,n,rot,flash){
  ctx.fillStyle=col(c,flash);
  for(var i=0;i<n;i++){
    var a = rot+i/n*TAU;
    ctx.beginPath();
    ctx.moveTo(x+Math.cos(a-0.2)*r*0.9, y+Math.sin(a-0.2)*r*0.9);
    ctx.lineTo(x+Math.cos(a)*r*1.42, y+Math.sin(a)*r*1.42);
    ctx.lineTo(x+Math.cos(a+0.2)*r*0.9, y+Math.sin(a+0.2)*r*0.9);
    ctx.closePath(); ctx.fill();
  }
}

/* ================= 怪物绘制 =================
   look: {shape,c1,c2,c3,eye,eyes,horn,wing,arms,legs,spike,crown,aura,bob}
   o:    {face, moving, flash, t, scale, alpha, angle, hp01}
*/
Art.creature = function(ctx,x,y,r,L,o){
  o = o||{};
  var t = o.t||0, face = o.face||1, flash = o.flash||0, mv = o.moving||0;
  var seed = (o.seed!==undefined? o.seed : (L.seed||0));
  var sq = 1 + Math.sin(t*(6+mv*7)+seed)*0.05*(0.5+mv);
  var bob = Math.sin(t*(3.4+mv*4)+seed*2)*(L.bob===undefined?0.12:L.bob)*r*(0.6+mv);
  ctx.save();
  if(o.alpha!==undefined) ctx.globalAlpha = o.alpha;
  Art.shadow(ctx,x,y+r*0.86,r*0.82,r*0.32, 0.3*(L.shape==='ghost'?0.5:1));
  ctx.translate(x, y+bob);
  if(o.scale) ctx.scale(o.scale,o.scale);
  var ol = U.shade(L.c2||L.c1, 0.45);
  var c1 = col(L.c1,flash), c2 = col(L.c2||U.shade(L.c1,0.6),flash), c3 = col(L.c3||L.eye||'#ffffff',flash);
  var S = L.shape||'slime';

  if(L.aura){
    Art.glowDot(ctx,0,0,r*2.1,L.aura,0.24+Math.sin(t*4+seed)*0.06);
  }

  if(S==='slime'){
    var ry = r*(0.92/sq), rx = r*sq;
    ctx.fillStyle = grad(ctx,0,0,ry,c1,c2);
    ctx.beginPath();
    ctx.moveTo(-rx, ry*0.85);
    ctx.bezierCurveTo(-rx*1.15,-ry*0.65, -rx*0.62,-ry*1.28, 0,-ry*1.1);
    ctx.bezierCurveTo(rx*0.62,-ry*1.28, rx*1.15,-ry*0.65, rx, ry*0.85);
    ctx.quadraticCurveTo(0, ry*1.24, -rx, ry*0.85);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
    ctx.globalAlpha=0.4; ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.ellipse(-rx*0.36,-ry*0.5,rx*0.24,ry*0.18,-0.5,0,TAU); ctx.fill();
    ctx.globalAlpha=1;
    if(L.spike) spikesF(ctx,0,-r*0.1,r*0.95,c2,6,-1.2,flash);
    eyes(ctx,L.eyes||2,0,-r*0.18,r*0.36,r*0.2,L.eye||'#ffffff',face,t,seed,flash);
  }
  else if(S==='blob' || S==='orb'){
    if(S==='orb'){
      Art.glowDot(ctx,0,0,r*1.9,L.c3||L.c1,0.3);
      ctx.strokeStyle=U.alpha(L.c3||L.c1,0.7); ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(0,0,r*1.35,r*0.42,Math.sin(t*1.3+seed)*0.7,0,TAU); ctx.stroke();
    }
    blob(ctx,0,0,r*sq,r/sq,c1,c2,ol,2);
    ctx.globalAlpha=0.35; ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.ellipse(-r*0.34,-r*0.4,r*0.26,r*0.18,-0.5,0,TAU); ctx.fill();
    ctx.globalAlpha=1;
    eyes(ctx,L.eyes||1,0,-r*0.05,r*0.4,r*0.24,L.eye||'#ffffff',face,t,seed,flash);
    if(L.horn) hornsF(ctx,0,-r*0.3,r,c2,flash);
  }
  else if(S==='humanoid' || S==='knight'){
    var lw = Math.sin(t*(8+mv*8)+seed)*r*0.26*(0.35+mv);
    ctx.fillStyle=c2;
    ctx.beginPath(); rrect(ctx,-r*0.44+lw*0.5,r*0.32,r*0.34,r*0.62,r*0.14); ctx.fill();
    ctx.beginPath(); rrect(ctx, r*0.1-lw*0.5,r*0.32,r*0.34,r*0.62,r*0.14); ctx.fill();
    ctx.fillStyle=grad(ctx,0,0,r,c1,U.shade(L.c1,0.62));
    ctx.beginPath(); rrect(ctx,-r*0.62,-r*0.34,r*1.24,r*0.96,r*0.3); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=c3;
    ctx.beginPath(); rrect(ctx,-r*0.62,-r*0.06,r*1.24,r*0.2,r*0.08); ctx.fill();
    var ax = Math.cos(t*7+seed)*r*0.12*mv;
    ctx.fillStyle=c2;
    ctx.beginPath(); ctx.ellipse(-r*0.78+ax,r*0.16,r*0.2,r*0.3,0.2,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.78-ax,r*0.16,r*0.2,r*0.3,-0.2,0,TAU); ctx.fill();
    ctx.fillStyle=grad(ctx,0,-r*0.8,r*0.5,col(L.c4||'#e8c9a0',flash),col(U.shade(L.c4||'#e8c9a0',0.75),flash));
    ctx.beginPath(); ctx.ellipse(0,-r*0.78,r*0.52,r*0.5,0,0,TAU); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=1.6; ctx.stroke();
    if(S==='knight' || L.helm){
      ctx.fillStyle=c3;
      ctx.beginPath(); ctx.ellipse(0,-r*0.92,r*0.56,r*0.42,0,Math.PI,TAU); ctx.fill();
      ctx.fillStyle=U.shade(L.c3||'#888',0.7);
      ctx.fillRect(-r*0.56,-r*0.98,r*1.12,r*0.16);
      if(L.crown){ ctx.fillStyle=col('#ffd45e',flash); U.star(ctx,0,-r*1.34,r*0.3,r*0.13,5,-Math.PI/2); ctx.fill(); }
    }
    if(L.horn) hornsF(ctx,0,-r*1.0,r*0.8,c2,flash);
    eyes(ctx,L.eyes||2,0,-r*0.78,r*0.2,r*0.13,L.eye||'#1b1030',face,t,seed,flash, L.eye?false:true);
  }
  else if(S==='bat'){
    var fl = Math.sin(t*13+seed)*0.7;
    ctx.fillStyle=c2; ctx.strokeStyle=ol; ctx.lineWidth=1.6;
    for(var w=-1;w<=1;w+=2){
      ctx.save(); ctx.scale(w,1); ctx.rotate(fl*0.4);
      ctx.beginPath();
      ctx.moveTo(r*0.4,-r*0.1);
      ctx.quadraticCurveTo(r*1.5,-r*0.85-fl*r*0.3, r*2.0, r*0.1);
      ctx.quadraticCurveTo(r*1.45, r*0.05, r*1.3, r*0.5);
      ctx.quadraticCurveTo(r*1.0, r*0.05, r*0.8, r*0.45);
      ctx.quadraticCurveTo(r*0.6, r*0.1, r*0.4, r*0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    blob(ctx,0,0,r*0.85,r*0.78,c1,U.shade(L.c1,0.6),ol,2);
    ctx.fillStyle=c2;
    ctx.beginPath(); ctx.moveTo(-r*0.62,-r*0.5); ctx.lineTo(-r*0.34,-r*1.12); ctx.lineTo(-r*0.1,-r*0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo( r*0.62,-r*0.5); ctx.lineTo( r*0.34,-r*1.12); ctx.lineTo( r*0.1,-r*0.55); ctx.closePath(); ctx.fill();
    eyes(ctx,2,0,-r*0.05,r*0.3,r*0.17,L.eye||'#ff5d6e',face,t,seed,flash,false);
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.moveTo(-r*0.2,r*0.35); ctx.lineTo(-r*0.1,r*0.6); ctx.lineTo(0,r*0.35); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r*0.2,r*0.35); ctx.lineTo(r*0.1,r*0.6); ctx.lineTo(0,r*0.35); ctx.closePath(); ctx.fill();
  }
  else if(S==='bug' || S==='spider'){
    var legN = S==='spider'?4:3, sw = Math.sin(t*10+seed)*0.35;
    ctx.strokeStyle=c2; ctx.lineWidth=Math.max(1.6,r*0.14); ctx.lineCap='round';
    for(var s=-1;s<=1;s+=2){
      for(var i2=0;i2<legN;i2++){
        var la = (-0.5 + i2/(legN-1||1))*1.3 + sw*(i2%2?1:-1);
        ctx.beginPath();
        ctx.moveTo(s*r*0.4, r*0.1);
        ctx.quadraticCurveTo(s*r*(1.1), r*0.1+la*r*0.3, s*r*1.5, r*0.65+Math.abs(la)*r*0.2);
        ctx.stroke();
      }
    }
    ctx.lineCap='butt';
    blob(ctx,0,r*0.05,r*0.95,r*0.8,c1,c2,ol,2);
    if(L.spike) spikesF(ctx,0,0,r*0.9,c3,7,t*0.6,flash);
    ctx.fillStyle=col(L.c3||L.c1,flash);
    ctx.beginPath(); ctx.ellipse(0,-r*0.2,r*0.55,r*0.42,0,0,TAU); ctx.fill();
    eyes(ctx,L.eyes||2,0,-r*0.28,r*0.26,r*0.15,L.eye||'#fff',face,t,seed,flash);
  }
  else if(S==='ghost'){
    ctx.globalAlpha=(o.alpha===undefined?0.85:o.alpha);
    ctx.fillStyle=grad(ctx,0,0,r,c1,U.alpha(L.c2||L.c1,0.25));
    ctx.beginPath();
    ctx.moveTo(-r,r*0.3);
    ctx.bezierCurveTo(-r*1.05,-r*1.35, r*1.05,-r*1.35, r, r*0.3);
    var wob=Math.sin(t*4+seed)*r*0.14;
    ctx.lineTo(r, r*0.62+wob);
    ctx.quadraticCurveTo(r*0.62,r*1.1-wob, r*0.33,r*0.62+wob);
    ctx.quadraticCurveTo(0,r*1.14+wob, -r*0.33,r*0.62-wob);
    ctx.quadraticCurveTo(-r*0.62,r*1.1+wob, -r,r*0.62-wob);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=U.alpha(L.c3||'#ffffff',0.5); ctx.lineWidth=1.6; ctx.stroke();
    eyes(ctx,L.eyes||2,0,-r*0.28,r*0.36,r*0.2,L.eye||'#8ef0ff',face,t,seed,flash,false);
    ctx.globalAlpha=1;
  }
  else if(S==='skull'){
    ctx.fillStyle=grad(ctx,0,0,r,c1,c2);
    ctx.beginPath(); ctx.ellipse(0,-r*0.12,r*0.92,r*0.86,0,0,TAU); ctx.fill();
    ctx.beginPath(); rrect(ctx,-r*0.44,r*0.4,r*0.88,r*0.5,r*0.14); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,-r*0.12,r*0.92,r*0.86,0,0,TAU); ctx.stroke();
    ctx.fillStyle='#100a1c';
    ctx.beginPath(); ctx.ellipse(-r*0.36,-r*0.14,r*0.28,r*0.32,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.36,-r*0.14,r*0.28,r*0.32,0,0,TAU); ctx.fill();
    Art.glowDot(ctx,-r*0.36,-r*0.14,r*0.4,L.eye||'#ff5522',0.9);
    Art.glowDot(ctx, r*0.36,-r*0.14,r*0.4,L.eye||'#ff5522',0.9);
    ctx.strokeStyle=ol; ctx.lineWidth=1.4;
    for(var k=-1;k<=1;k++){ ctx.beginPath(); ctx.moveTo(k*r*0.24,r*0.42); ctx.lineTo(k*r*0.24,r*0.86); ctx.stroke(); }
    if(L.horn) hornsF(ctx,0,-r*0.5,r,c2,flash);
    if(L.crown){ ctx.fillStyle=col('#ffd45e',flash); U.star(ctx,0,-r*1.25,r*0.34,r*0.15,5,-Math.PI/2); ctx.fill(); }
  }
  else if(S==='mech' || S==='turret'){
    ctx.fillStyle=c2;
    ctx.beginPath(); rrect(ctx,-r*0.9,r*0.35,r*1.8,r*0.55,r*0.14); ctx.fill();
    if(S==='turret'){
      ctx.fillStyle=c3;
      ctx.beginPath(); rrect(ctx,-r*0.78,r*0.42,r*1.56,r*0.18,r*0.08); ctx.fill();
    }
    ctx.fillStyle=grad(ctx,0,0,r,c1,U.shade(L.c1,0.6));
    ctx.beginPath(); rrect(ctx,-r*0.82,-r*0.72,r*1.64,r*1.2,r*0.24); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#10131f';
    ctx.beginPath(); rrect(ctx,-r*0.58,-r*0.5,r*1.16,r*0.44,r*0.12); ctx.fill();
    var pulse = 0.55+Math.sin(t*4+seed)*0.3;
    ctx.fillStyle=col(L.eye||'#5ee0ff',flash);
    ctx.globalAlpha=pulse;
    ctx.beginPath(); rrect(ctx,-r*0.48,-r*0.42,r*0.96,r*0.26,r*0.1); ctx.fill();
    ctx.globalAlpha=1;
    Art.glowDot(ctx,0,-r*0.3,r*1.1,L.eye||'#5ee0ff',0.35*pulse);
    ctx.fillStyle=c3;
    ctx.fillRect(-r*0.06,-r*1.15,r*0.12,r*0.45);
    ctx.beginPath(); ctx.arc(0,-r*1.2,r*0.14,0,TAU); ctx.fill();
    if(L.arms!==false){
      ctx.fillStyle=c2;
      ctx.beginPath(); rrect(ctx,-r*1.25,-r*0.35,r*0.4,r*0.75,r*0.12); ctx.fill();
      ctx.beginPath(); rrect(ctx, r*0.85,-r*0.35,r*0.4,r*0.75,r*0.12); ctx.fill();
    }
  }
  else if(S==='plant'){
    ctx.strokeStyle=c2; ctx.lineWidth=Math.max(2,r*0.24);
    ctx.beginPath(); ctx.moveTo(0,r*0.85);
    ctx.quadraticCurveTo(Math.sin(t*2+seed)*r*0.3,r*0.1,0,-r*0.35); ctx.stroke();
    ctx.fillStyle=c3;
    for(var lf=-1;lf<=1;lf+=2){
      ctx.beginPath(); ctx.ellipse(lf*r*0.5,r*0.35,r*0.42,r*0.2,lf*0.6,0,TAU); ctx.fill();
    }
    var open = 0.7+Math.sin(t*3+seed)*0.3;
    ctx.fillStyle=grad(ctx,0,-r*0.5,r*0.7,c1,U.shade(L.c1,0.65));
    ctx.beginPath(); ctx.ellipse(0,-r*0.45,r*0.82,r*0.72,0,0,TAU); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#2a0a12';
    ctx.beginPath(); ctx.ellipse(0,-r*0.35,r*0.5*open,r*0.42*open,0,0,TAU); ctx.fill();
    ctx.fillStyle=col('#fff5f0',flash);
    for(var ti=0;ti<5;ti++){
      var ta=-Math.PI/2+(ti-2)*0.36;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ta)*r*0.46,-r*0.35+Math.sin(ta)*r*0.4);
      ctx.lineTo(Math.cos(ta)*r*0.3,-r*0.35+Math.sin(ta)*r*0.18);
      ctx.lineTo(Math.cos(ta+0.2)*r*0.42,-r*0.35+Math.sin(ta+0.2)*r*0.36);
      ctx.closePath(); ctx.fill();
    }
  }
  else if(S==='crystal'){
    var rot = t*0.6+seed;
    Art.glowDot(ctx,0,0,r*1.8,L.c3||L.c1,0.3);
    ctx.fillStyle=grad(ctx,0,0,r,c1,c2);
    ctx.beginPath();
    ctx.moveTo(0,-r*1.3); ctx.lineTo(r*0.8,-r*0.2); ctx.lineTo(r*0.5,r*1.0);
    ctx.lineTo(-r*0.5,r*1.0); ctx.lineTo(-r*0.8,-r*0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=U.alpha(L.c3||'#fff',0.8); ctx.lineWidth=1.6; ctx.stroke();
    ctx.globalAlpha=0.4; ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.moveTo(0,-r*1.25); ctx.lineTo(-r*0.3,-r*0.1); ctx.lineTo(0,r*0.9); ctx.lineTo(-r*0.05,-r*0.1); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=1;
    eyes(ctx,L.eyes||2,0,0,r*0.3,r*0.16,L.eye||'#fff',face,t,seed,flash,false);
    ctx.strokeStyle=U.alpha(L.c3||'#fff',0.45); ctx.lineWidth=1.4;
    for(var ci=0;ci<3;ci++){
      var ca=rot+ci*2.09;
      ctx.beginPath(); ctx.arc(Math.cos(ca)*r*1.5,Math.sin(ca)*r*0.7,r*0.16,0,TAU); ctx.stroke();
    }
  }
  else if(S==='worm'){
    var segs=L.segs||4;
    for(var si=segs-1;si>=0;si--){
      var sy = si*r*0.5, srr = r*(1-si*0.13);
      var wx = Math.sin(t*5+seed+si*0.7)*r*0.3;
      blob(ctx,wx,sy*0.7,srr*0.9,srr*0.8,si===0?c1:U.mix(L.c1,L.c2||'#000',si/segs*0.6),c2,ol,1.6);
    }
    eyes(ctx,2,0,-r*0.2,r*0.3,r*0.17,L.eye||'#fff',face,t,seed,flash);
    if(L.horn) hornsF(ctx,0,-r*0.4,r*0.8,c3,flash);
  }
  else if(S==='wisp'){
    var pulse2=0.8+Math.sin(t*5+seed)*0.2;
    Art.glowDot(ctx,0,0,r*2.4*pulse2,L.c1,0.55);
    ctx.fillStyle=col('#ffffff',flash*0.5);
    ctx.beginPath(); ctx.arc(0,0,r*0.5*pulse2,0,TAU); ctx.fill();
    ctx.fillStyle=U.alpha(L.c1,0.9);
    ctx.beginPath(); ctx.arc(0,0,r*0.85*pulse2,0,TAU); ctx.fill();
    ctx.strokeStyle=U.alpha(L.c3||L.c1,0.7); ctx.lineWidth=1.4;
    for(var wi=0;wi<3;wi++){
      var wa=t*(1.4+wi*0.5)+wi*2.1+seed;
      ctx.beginPath(); ctx.arc(Math.cos(wa)*r*1.5, Math.sin(wa*1.3)*r*1.1, r*0.18,0,TAU); ctx.stroke();
    }
    eyes(ctx,2,0,-r*0.05,r*0.28,r*0.13,'#0a0618',face,t,seed,0,false);
  }
  else if(S==='golem'){
    ctx.fillStyle=c2;
    ctx.beginPath(); rrect(ctx,-r*0.95,r*0.3,r*0.7,r*0.65,r*0.14); ctx.fill();
    ctx.beginPath(); rrect(ctx, r*0.25,r*0.3,r*0.7,r*0.65,r*0.14); ctx.fill();
    ctx.fillStyle=grad(ctx,0,0,r,c1,c2);
    ctx.beginPath(); rrect(ctx,-r*1.05,-r*0.85,r*2.1,r*1.35,r*0.3); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2.4; ctx.stroke();
    ctx.fillStyle=U.alpha(L.c3||L.c1,0.5);
    ctx.beginPath(); rrect(ctx,-r*0.7,-r*0.6,r*0.5,r*0.45,r*0.1); ctx.fill();
    ctx.beginPath(); rrect(ctx, r*0.3,-r*0.2,r*0.42,r*0.5,r*0.1); ctx.fill();
    var ax2=Math.sin(t*5+seed)*r*0.16*(0.3+mv);
    ctx.fillStyle=c2;
    ctx.beginPath(); rrect(ctx,-r*1.6,-r*0.6+ax2,r*0.55,r*1.1,r*0.18); ctx.fill();
    ctx.beginPath(); rrect(ctx, r*1.05,-r*0.6-ax2,r*0.55,r*1.1,r*0.18); ctx.fill();
    eyes(ctx,L.eyes||2,0,-r*0.35,r*0.36,r*0.17,L.eye||'#ffb14a',face,t,seed,flash,false);
    Art.glowDot(ctx,0,-r*0.35,r*1.2,L.eye||'#ffb14a',0.28);
  }
  else if(S==='dragon'){
    var fl2=Math.sin(t*5+seed)*0.5;
    ctx.fillStyle=U.alpha(L.c2||L.c1,0.92); ctx.strokeStyle=ol; ctx.lineWidth=2;
    for(var dw=-1;dw<=1;dw+=2){
      ctx.save(); ctx.scale(dw,1); ctx.rotate(fl2*0.22);
      ctx.beginPath();
      ctx.moveTo(r*0.5,-r*0.4);
      ctx.quadraticCurveTo(r*2.3,-r*1.7-fl2*r*0.4, r*2.9,-r*0.1);
      ctx.quadraticCurveTo(r*2.0,-r*0.3, r*1.9, r*0.6);
      ctx.quadraticCurveTo(r*1.4,-r*0.25, r*1.15, r*0.5);
      ctx.quadraticCurveTo(r*0.85,-r*0.2, r*0.55, r*0.3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle=c2;
    ctx.beginPath(); ctx.moveTo(0,r*0.4);
    ctx.quadraticCurveTo(-r*1.6, r*0.9+Math.sin(t*3+seed)*r*0.4, -r*2.3, r*0.2);
    ctx.quadraticCurveTo(-r*1.5, r*1.3, 0, r*0.9); ctx.closePath(); ctx.fill();
    blob(ctx,0,r*0.1,r*1.0,r*0.95,c1,c2,ol,2.2);
    ctx.fillStyle=U.alpha(L.c3||'#ffcf6a',0.85);
    ctx.beginPath(); ctx.ellipse(0,r*0.3,r*0.55,r*0.6,0,0,TAU); ctx.fill();
    ctx.fillStyle=grad(ctx,0,-r*0.9,r*0.6,c1,c2);
    ctx.beginPath(); ctx.ellipse(face*r*0.25,-r*0.85,r*0.72,r*0.6,0,0,TAU); ctx.fill();
    ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=c1;
    ctx.beginPath(); ctx.ellipse(face*r*0.85,-r*0.72,r*0.42,r*0.3,0.1*face,0,TAU); ctx.fill();
    hornsF(ctx,face*r*0.2,-r*1.2,r*0.9,col(L.c3||'#ffcf6a',flash),0);
    eyes(ctx,2,face*r*0.35,-r*0.95,r*0.24,r*0.14,L.eye||'#ffee66',face,t,seed,flash,false);
    spikesF(ctx,0,r*0.1,r*1.0,c3,5,-1.6,flash);
  }
  else if(S==='fish'){
    ctx.fillStyle=c2;
    ctx.beginPath(); ctx.moveTo(-r*0.8,0); ctx.lineTo(-r*1.6,-r*0.6+Math.sin(t*9+seed)*r*0.25); ctx.lineTo(-r*1.6,r*0.6-Math.sin(t*9+seed)*r*0.25); ctx.closePath(); ctx.fill();
    blob(ctx,0,0,r*1.0,r*0.72,c1,c2,ol,2);
    ctx.fillStyle=c3;
    ctx.beginPath(); ctx.moveTo(-r*0.2,-r*0.6); ctx.lineTo(0,-r*1.25); ctx.lineTo(r*0.35,-r*0.55); ctx.closePath(); ctx.fill();
    eyes(ctx,1,r*0.4,-r*0.12,0,r*0.2,L.eye||'#fff',face,t,seed,flash);
  }
  else { /* fallback */
    blob(ctx,0,0,r*sq,r/sq,c1,c2,ol,2);
    eyes(ctx,L.eyes||2,0,-r*0.1,r*0.34,r*0.19,L.eye||'#fff',face,t,seed,flash);
  }

  if(L.crown && S!=='humanoid' && S!=='skull' && S!=='knight'){
    ctx.fillStyle=col('#ffd45e',flash);
    U.star(ctx,0,-r*1.45,r*0.32,r*0.14,5,-Math.PI/2); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha=1;
};

/* ================= 英雄绘制 ================= */
Art.hero = function(ctx,x,y,r,H,o){
  o=o||{};
  var t=o.t||0, face=o.face||1, mv=o.moving||0, flash=o.flash||0, aim=o.aim||0;
  var bob = Math.sin(t*(4+mv*9))*r*0.08*(0.5+mv);
  ctx.save();
  Art.shadow(ctx,x,y+r*0.95,r*0.7,r*0.26,0.34);
  ctx.translate(x,y+bob);
  var c1=col(H.c1,flash), c2=col(H.c2,flash), c3=col(H.c3,flash), skin=col(H.skin||'#f2c9a0',flash);
  var ol=U.shade(H.c2,0.42);

  if(H.cape){
    var sw2=Math.sin(t*5)*0.25*(0.4+mv);
    ctx.fillStyle=col(H.cape,flash*0.6);
    ctx.beginPath();
    ctx.moveTo(-r*0.5,-r*0.4); ctx.lineTo(r*0.5,-r*0.4);
    ctx.quadraticCurveTo(r*(0.7+sw2), r*0.6, r*(0.35+sw2*1.4), r*1.05);
    ctx.lineTo(-r*(0.35-sw2*1.4), r*1.05);
    ctx.quadraticCurveTo(-r*(0.7-sw2), r*0.6, -r*0.5,-r*0.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=U.shade(H.cape,0.55); ctx.lineWidth=1.4; ctx.stroke();
  }
  var lw2=Math.sin(t*(9+mv*6))*r*0.24*(0.2+mv);
  ctx.fillStyle=c2;
  ctx.beginPath(); rrect(ctx,-r*0.42+lw2*0.5, r*0.42, r*0.34, r*0.5, r*0.14); ctx.fill();
  ctx.beginPath(); rrect(ctx, r*0.08-lw2*0.5, r*0.42, r*0.34, r*0.5, r*0.14); ctx.fill();
  ctx.fillStyle='#25202f';
  ctx.beginPath(); rrect(ctx,-r*0.46+lw2*0.5, r*0.8, r*0.42, r*0.2, r*0.08); ctx.fill();
  ctx.beginPath(); rrect(ctx, r*0.04-lw2*0.5, r*0.8, r*0.42, r*0.2, r*0.08); ctx.fill();

  ctx.fillStyle=grad(ctx,0,0,r,c1,U.shade(H.c1,0.62));
  ctx.beginPath(); rrect(ctx,-r*0.58,-r*0.3,r*1.16,r*0.86,r*0.28); ctx.fill();
  ctx.strokeStyle=ol; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=c3;
  ctx.beginPath(); rrect(ctx,-r*0.58,r*0.16,r*1.16,r*0.18,r*0.07); ctx.fill();
  ctx.fillStyle=c2;
  ctx.beginPath(); ctx.ellipse(-r*0.62,-r*0.12,r*0.22,r*0.26,0.3,0,TAU); ctx.fill();

  ctx.fillStyle=grad(ctx,0,-r*0.75,r*0.55,skin,U.shade(H.skin||'#f2c9a0',0.8));
  ctx.beginPath(); ctx.ellipse(0,-r*0.72,r*0.5,r*0.48,0,0,TAU); ctx.fill();
  ctx.strokeStyle=U.shade(H.skin||'#f2c9a0',0.5); ctx.lineWidth=1.4; ctx.stroke();

  var hm=H.helm||'none';
  if(hm==='knight'){
    ctx.fillStyle=c3;
    ctx.beginPath(); ctx.ellipse(0,-r*0.8,r*0.56,r*0.5,0,Math.PI*0.98,TAU*1.02); ctx.fill();
    ctx.fillStyle=U.shade(H.c3,0.75); ctx.fillRect(-r*0.56,-r*0.86,r*1.12,r*0.14);
    ctx.fillStyle=col('#ff5b5b',flash);
    ctx.beginPath(); ctx.moveTo(-r*0.08,-r*1.28); ctx.quadraticCurveTo(r*0.05,-r*1.75,r*0.3,-r*1.5);
    ctx.quadraticCurveTo(r*0.1,-r*1.35,r*0.1,-r*1.2); ctx.closePath(); ctx.fill();
  } else if(hm==='hood'){
    ctx.fillStyle=c2;
    ctx.beginPath();
    ctx.moveTo(-r*0.62,-r*0.55);
    ctx.quadraticCurveTo(0,-r*1.6, r*0.62,-r*0.55);
    ctx.quadraticCurveTo(r*0.3,-r*0.72, 0,-r*0.7);
    ctx.quadraticCurveTo(-r*0.3,-r*0.72,-r*0.62,-r*0.55);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#15111f';
    ctx.beginPath(); ctx.ellipse(0,-r*0.72,r*0.42,r*0.34,0,0,TAU); ctx.fill();
  } else if(hm==='hat'){
    ctx.fillStyle=c3;
    ctx.beginPath(); ctx.ellipse(0,-r*1.02,r*0.86,r*0.2,0,0,TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r*0.5,-r*1.04);
    ctx.quadraticCurveTo(-r*0.2,-r*2.1, r*0.42,-r*1.9);
    ctx.quadraticCurveTo(r*0.1,-r*1.35, r*0.5,-r*1.04);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=col(H.c1,flash);
    ctx.beginPath(); ctx.arc(r*0.42,-r*1.9,r*0.14,0,TAU); ctx.fill();
  } else if(hm==='visor'){
    ctx.fillStyle=c3;
    ctx.beginPath(); rrect(ctx,-r*0.56,-r*1.14,r*1.12,r*0.62,r*0.2); ctx.fill();
    ctx.fillStyle='#0d1220';
    ctx.beginPath(); rrect(ctx,-r*0.46,-r*0.98,r*0.92,r*0.3,r*0.1); ctx.fill();
    ctx.fillStyle=col(H.eye||'#5ee0ff',flash);
    ctx.beginPath(); rrect(ctx,-r*0.4,-r*0.92,r*0.8,r*0.14,r*0.06); ctx.fill();
    Art.glowDot(ctx,0,-r*0.85,r*1.0,H.eye||'#5ee0ff',0.3);
  } else if(hm==='crown'){
    ctx.fillStyle=col('#ffd45e',flash);
    ctx.beginPath();
    ctx.moveTo(-r*0.52,-r*1.02); ctx.lineTo(-r*0.52,-r*1.42); ctx.lineTo(-r*0.26,-r*1.18);
    ctx.lineTo(0,-r*1.55); ctx.lineTo(r*0.26,-r*1.18); ctx.lineTo(r*0.52,-r*1.42); ctx.lineTo(r*0.52,-r*1.02);
    ctx.closePath(); ctx.fill();
  }
  if(hm!=='visor' && hm!=='hood'){
    ctx.fillStyle='#20182e';
    ctx.beginPath(); ctx.ellipse(-r*0.18+face*r*0.08,-r*0.7,r*0.075,r*0.11,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.18+face*r*0.08,-r*0.7,r*0.075,r*0.11,0,0,TAU); ctx.fill();
  } else if(hm==='hood'){
    ctx.fillStyle=col(H.eye||'#ff5b7a',flash);
    ctx.beginPath(); ctx.ellipse(-r*0.16+face*r*0.06,-r*0.72,r*0.09,r*0.07,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse( r*0.16+face*r*0.06,-r*0.72,r*0.09,r*0.07,0,0,TAU); ctx.fill();
  }
  ctx.restore();
};

/* ================= 武器绘制 ================= */
Art.weapon = function(ctx,x,y,ang,A,o){
  o=o||{};
  var sc = (o.scale||1) * (A.len||1);
  var recoil = o.recoil||0, charge=o.charge||0, t=o.t||0;
  ctx.save();
  ctx.translate(x,y); ctx.rotate(ang);
  var flip = (Math.abs(ang)>Math.PI/2)?-1:1;
  ctx.scale(sc, sc*flip);
  ctx.translate(-recoil*4,0);
  var k = A.kind||'pistol', c1=A.c1||'#8a93b5', c2=A.c2||'#4a5170', c3=A.c3||'#ffd45e';
  ctx.lineJoin='round';
  function metal(x0,y0,w,h,r,cc){
    var g=ctx.createLinearGradient(0,y0,0,y0+h);
    g.addColorStop(0,U.shade(cc,1.35)); g.addColorStop(0.5,cc); g.addColorStop(1,U.shade(cc,0.62));
    ctx.fillStyle=g; ctx.beginPath(); rrect(ctx,x0,y0,w,h,r===undefined?1:r); ctx.fill();
  }
  function edge(pts,cc){
    ctx.fillStyle=cc; ctx.beginPath();
    ctx.moveTo(pts[0],pts[1]);
    for(var i=2;i<pts.length;i+=2) ctx.lineTo(pts[i],pts[i+1]);
    ctx.closePath(); ctx.fill();
  }
  if(k==='pistol'){ metal(-3,-2,13,4.4,1.4,c1); metal(-3,1,4.5,6,1,c2); metal(9,-1.4,3,3,0.6,c3); }
  else if(k==='smg'){ metal(-4,-2.4,17,4.6,1.4,c1); metal(-2,2,4,6,1,c2); metal(2,1.6,3.5,5,1,c3); metal(12,-1.2,5,2.6,0.6,c2); }
  else if(k==='rifle'){ metal(-8,-2,25,4,1.2,c1); metal(-8,1.4,6,4.5,1,c2); metal(1,-3.6,5,2,0.5,c3); metal(16,-1.2,7,2.4,0.5,c2); }
  else if(k==='shotgun'){ metal(-8,-3,26,3,1,c1); metal(-8,0.4,26,3,1,U.shade(c1,0.8)); metal(-9,1.6,7,5,1.2,c2); metal(2,-1,6,5,1,c3); }
  else if(k==='sniper'){ metal(-10,-1.8,32,3.6,1,c1); metal(-10,1,7,5,1.2,c2); metal(-1,-5,10,2.6,0.8,c3); metal(20,-1.4,6,2.8,0.6,c2); ctx.fillStyle=U.alpha('#8ef0ff',0.9); ctx.fillRect(7.5,-4.6,1.6,1.8); }
  else if(k==='minigun'){ for(var mi=-2;mi<=2;mi++){ var mr=Math.cos(t*14+mi)*2.2; metal(0,-1.1+mr,22,2.2,1,U.shade(c1,1-Math.abs(mr)*0.08)); } metal(-8,-4.6,10,9.2,2,c2); metal(-9,3,5,5,1,c3); }
  else if(k==='launcher'){ metal(-8,-4,26,8,3,c1); metal(-9,2,7,6,1.2,c2); ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(18,0,4.2,-1.6,1.6); ctx.fill(); metal(-2,-6.4,9,2.6,1,c3); }
  else if(k==='cannon'){ metal(-9,-5.4,24,10.8,4,c1); metal(-10,3,8,7,1.4,c2); ctx.fillStyle=U.alpha(c3,0.9); ctx.beginPath(); ctx.arc(16,0,5.4,0,TAU); ctx.fill(); Art.glowDot(ctx,16,0,10,c3,0.5+charge*0.5); }
  else if(k==='laser'){ metal(-7,-2.6,20,5.2,2,c1); metal(-8,1.6,6,5.5,1.2,c2); ctx.fillStyle=U.alpha(c3,0.85); ctx.beginPath(); rrect(ctx,-2,-4.4,12,1.8,0.8); ctx.fill(); Art.glowDot(ctx,15,0,9,c3,0.55+charge*0.45); ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(14,0,2.2,0,TAU); ctx.fill(); }
  else if(k==='tesla'){ metal(-6,-2.4,16,4.8,2,c1); metal(-7,1.6,6,5.5,1.2,c2); ctx.strokeStyle=c3; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(13,0,4.4,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(13,0,2.2,0,TAU); ctx.stroke(); Art.glowDot(ctx,13,0,11,c3,0.5+Math.sin(t*11)*0.2); }
  else if(k==='bow'){
    ctx.strokeStyle=c1; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(-2,0,11,-1.15,1.15); ctx.stroke();
    ctx.strokeStyle=c3; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(-2,0,11.6,-1.15,-0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(-2,0,11.6,0.8,1.15); ctx.stroke();
    ctx.strokeStyle='#e8e2d0'; ctx.lineWidth=0.9;
    var pull=-3-charge*4;
    ctx.beginPath(); ctx.moveTo(2.4,-10.1); ctx.lineTo(pull,0); ctx.lineTo(2.4,10.1); ctx.stroke();
    if(charge>0.05){ ctx.strokeStyle=c3; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(pull,0); ctx.lineTo(pull+11,0); ctx.stroke(); }
  }
  else if(k==='crossbow'){ metal(-6,-1.6,20,3.2,1,c2); ctx.strokeStyle=c1; ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(6,-9); ctx.quadraticCurveTo(11,0,6,9); ctx.stroke(); ctx.strokeStyle='#e8e2d0'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(6,-9); ctx.lineTo(-2-charge*3,0); ctx.lineTo(6,9); ctx.stroke(); metal(-7,0.8,6,5,1,c2); ctx.fillStyle=c3; ctx.fillRect(4,-0.9,10,1.8); }
  else if(k==='staff'){
    ctx.strokeStyle=U.shade(c2,0.9); ctx.lineWidth=2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-9,3); ctx.lineTo(9,-3); ctx.stroke(); ctx.lineCap='butt';
    var pf=0.85+Math.sin(t*4)*0.15+charge*0.5;
    Art.glowDot(ctx,12,-4,12*pf,c3,0.6);
    ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(12,-4,3.6*pf,0,TAU); ctx.fill();
    ctx.fillStyle=U.alpha('#ffffff',0.7); ctx.beginPath(); ctx.arc(11,-5,1.3,0,TAU); ctx.fill();
    ctx.strokeStyle=U.alpha(c1,0.9); ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.arc(12,-4,6.2,t*2,t*2+4.2); ctx.stroke();
  }
  else if(k==='book'){
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-6,-7,13,14,1.6); ctx.fill();
    ctx.fillStyle='#f0e6cf'; ctx.beginPath(); rrect(ctx,-4.4,-5.6,10,11.2,1); ctx.fill();
    ctx.fillStyle=c1; ctx.fillRect(0.2,-7,1.6,14);
    Art.glowDot(ctx,4,0,11,c3,0.45+Math.sin(t*3)*0.12);
    ctx.fillStyle=c3; U.star(ctx,2,0,3.2,1.3,5,t); ctx.fill();
  }
  else if(k==='sword'){
    edge([-4,-1.6,14,-2.4,18,0,14,2.4,-4,1.6],c1);
    edge([-4,-0.6,15,-0.9,17,0,15,0.9,-4,0.6],U.shade(c1,1.4));
    metal(-8,-3.4,4.4,6.8,1.2,c3);
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-13,-1.7,6,3.4,1.2); ctx.fill();
    ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(-13.6,0,1.9,0,TAU); ctx.fill();
  }
  else if(k==='greatsword'){
    edge([-4,-3.6,18,-4.6,24,0,18,4.6,-4,3.6],c1);
    edge([-4,-1.4,20,-1.8,22,0,20,1.8,-4,1.4],U.shade(c1,1.35));
    metal(-9,-6,5,12,1.6,c3);
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-16,-2.4,8,4.8,1.6); ctx.fill();
  }
  else if(k==='dagger'){ edge([-2,-1.4,8,-2,11,0,8,2,-2,1.4],c1); metal(-5,-2.6,3.4,5.2,1,c3); ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-9,-1.3,4.4,2.6,1); ctx.fill(); }
  else if(k==='saber'){
    ctx.strokeStyle=U.alpha(c3,0.35); ctx.lineWidth=8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-1,0); ctx.lineTo(19,0); ctx.stroke();
    ctx.strokeStyle=U.alpha(c3,0.85); ctx.lineWidth=4.4; ctx.beginPath(); ctx.moveTo(-1,0); ctx.lineTo(19,0); ctx.stroke();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.8; ctx.beginPath(); ctx.moveTo(-1,0); ctx.lineTo(18,0); ctx.stroke(); ctx.lineCap='butt';
    metal(-9,-2.2,9,4.4,1.4,c2); ctx.fillStyle=c1; ctx.fillRect(-2.4,-3,2,6);
  }
  else if(k==='spear'){
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-13,-1.1,26,2.2,1); ctx.fill();
    edge([12,-2.8,22,0,12,2.8],c1); edge([13,-1.2,20,0,13,1.2],U.shade(c1,1.4));
    ctx.fillStyle=c3; ctx.fillRect(9,-2.4,2.2,4.8);
  }
  else if(k==='hammer'){
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-12,-1.4,20,2.8,1.2); ctx.fill();
    metal(7,-6.4,10,12.8,2.4,c1);
    ctx.fillStyle=U.shade(c1,1.3); ctx.fillRect(9,-5,2.4,10);
    ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(-12,0,2.2,0,TAU); ctx.fill();
  }
  else if(k==='scythe'){
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-14,-1.3,26,2.6,1.2); ctx.fill();
    ctx.fillStyle=c1;
    ctx.beginPath(); ctx.moveTo(10,-1);
    ctx.quadraticCurveTo(24,-4, 22,-14);
    ctx.quadraticCurveTo(17,-5, 9,-3.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=U.shade(c1,1.4); ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=c3; ctx.beginPath(); ctx.arc(11,0,2.2,0,TAU); ctx.fill();
  }
  else if(k==='fist'){
    metal(-4,-4.6,11,9.2,3,c1);
    ctx.fillStyle=c3;
    for(var fi=0;fi<3;fi++){ ctx.beginPath(); ctx.arc(7,-2.6+fi*2.6,1.5,0,TAU); ctx.fill(); }
    ctx.fillStyle=c2; ctx.beginPath(); rrect(ctx,-8,-3,5,6,1.4); ctx.fill();
  }
  else if(k==='boomerang'){
    ctx.strokeStyle=c1; ctx.lineWidth=3.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-6,6); ctx.quadraticCurveTo(2,-6,10,4); ctx.stroke();
    ctx.strokeStyle=c3; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(-6,6); ctx.quadraticCurveTo(2,-6,10,4); ctx.stroke(); ctx.lineCap='butt';
  }
  else if(k==='shield'){
    ctx.fillStyle=c1; ctx.beginPath();
    ctx.moveTo(0,-9); ctx.lineTo(8,-6); ctx.lineTo(8,4); ctx.quadraticCurveTo(0,11,-8,4); ctx.lineTo(-8,-6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=c3; ctx.lineWidth=1.6; ctx.stroke();
    ctx.fillStyle=c3; U.star(ctx,0,0,3.4,1.5,4,0); ctx.fill();
  }
  else { metal(-4,-2,14,4,1.2,c1); }
  ctx.restore();
};

/* ================= 子弹 / 特效 ================= */
Art.bullet = function(ctx,b,t){
  var s=b.shape||'ball', r=b.r||3, c=b.color||'#ffe07a', ang=Math.atan2(b.vy,b.vx);
  ctx.save(); ctx.translate(b.x,b.y);
  if(s==='ball'){
    Art.glowDot(ctx,0,0,r*3.2,c,0.45);
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
    ctx.fillStyle=U.alpha('#ffffff',0.85); ctx.beginPath(); ctx.arc(-r*0.25,-r*0.25,r*0.42,0,TAU); ctx.fill();
  } else if(s==='bolt'){
    ctx.rotate(ang);
    Art.glowDot(ctx,0,0,r*3.4,c,0.4);
    ctx.fillStyle=c; ctx.beginPath(); ctx.ellipse(0,0,r*2.1,r*0.85,0,0,TAU); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.ellipse(r*0.5,0,r*0.85,r*0.34,0,0,TAU); ctx.fill();
  } else if(s==='laser'){
    ctx.rotate(ang);
    ctx.strokeStyle=U.alpha(c,0.35); ctx.lineWidth=r*2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-r*4,0); ctx.lineTo(r*4,0); ctx.stroke();
    ctx.strokeStyle=c; ctx.lineWidth=r*1.2;
    ctx.beginPath(); ctx.moveTo(-r*4,0); ctx.lineTo(r*4,0); ctx.stroke();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=r*0.45;
    ctx.beginPath(); ctx.moveTo(-r*3.4,0); ctx.lineTo(r*3.4,0); ctx.stroke(); ctx.lineCap='butt';
  } else if(s==='arrow'){
    ctx.rotate(ang);
    ctx.fillStyle='#c9a878'; ctx.fillRect(-r*3,-r*0.28,r*4.4,r*0.56);
    ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(r*3.2,0); ctx.lineTo(r*1.1,-r*0.95); ctx.lineTo(r*1.1,r*0.95); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f0e0c0'; ctx.beginPath(); ctx.moveTo(-r*3,0); ctx.lineTo(-r*1.6,-r*0.9); ctx.lineTo(-r*1.6,r*0.9); ctx.closePath(); ctx.fill();
  } else if(s==='flame'){
    var f=(b.life/(b.maxLife||1));
    Art.glowDot(ctx,0,0,r*3.6,c,0.5*f);
    ctx.fillStyle=U.alpha(c,0.75*f); ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
    ctx.fillStyle=U.alpha('#ffe9a0',0.8*f); ctx.beginPath(); ctx.arc(0,0,r*0.5,0,TAU); ctx.fill();
  } else if(s==='ice'){
    ctx.rotate(t*4+ (b.seed||0));
    Art.glowDot(ctx,0,0,r*3,c,0.4);
    ctx.fillStyle=c; U.star(ctx,0,0,r*1.6,r*0.6,6,0); ctx.fill();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=0.8; ctx.stroke();
  } else if(s==='missile'){
    ctx.rotate(ang);
    ctx.fillStyle=U.shade(c,0.7); ctx.beginPath(); rrect(ctx,-r*2.4,-r*0.8,r*4,r*1.6,r*0.5); ctx.fill();
    ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(r*2.4,0); ctx.lineTo(r*1.2,-r*0.9); ctx.lineTo(r*1.2,r*0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff9a3c'; ctx.beginPath(); ctx.moveTo(-r*2.4,0); ctx.lineTo(-r*4.2-Math.random()*r,0); ctx.lineTo(-r*2.4,-r*0.7); ctx.closePath(); ctx.fill();
  } else if(s==='orb'){
    var pl=0.85+Math.sin(t*9+(b.seed||0))*0.15;
    Art.glowDot(ctx,0,0,r*3.6*pl,c,0.55);
    ctx.fillStyle=U.alpha(c,0.85); ctx.beginPath(); ctx.arc(0,0,r*pl,0,TAU); ctx.fill();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,r*0.55*pl,0,TAU); ctx.stroke();
  } else if(s==='slash'){
    ctx.rotate(ang);
    ctx.strokeStyle=U.alpha(c,0.9); ctx.lineWidth=r*0.9;
    ctx.beginPath(); ctx.arc(-r*1.6,0,r*2.4,-1.1,1.1); ctx.stroke();
    ctx.strokeStyle=U.alpha('#ffffff',0.7); ctx.lineWidth=r*0.32;
    ctx.beginPath(); ctx.arc(-r*1.6,0,r*2.4,-0.9,0.9); ctx.stroke();
  } else if(s==='star'){
    ctx.rotate(t*7+(b.seed||0));
    Art.glowDot(ctx,0,0,r*3,c,0.4);
    ctx.fillStyle=c; U.star(ctx,0,0,r*1.7,r*0.7,5,0); ctx.fill();
  } else if(s==='skull'){
    Art.glowDot(ctx,0,0,r*3,c,0.45);
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(0,-r*0.2,r,0,TAU); ctx.fill();
    ctx.fillRect(-r*0.5,r*0.4,r,r*0.5);
    ctx.fillStyle='#100818'; ctx.beginPath(); ctx.arc(-r*0.36,-r*0.2,r*0.28,0,TAU); ctx.fill(); ctx.beginPath(); ctx.arc(r*0.36,-r*0.2,r*0.28,0,TAU); ctx.fill();
  } else if(s==='wave'){
    ctx.rotate(ang);
    ctx.strokeStyle=U.alpha(c,0.75); ctx.lineWidth=r*0.8;
    ctx.beginPath(); ctx.arc(0,0,r*2.2,-1.3,1.3); ctx.stroke();
    ctx.strokeStyle=U.alpha(c,0.35); ctx.lineWidth=r*1.6;
    ctx.beginPath(); ctx.arc(0,0,r*2.2,-1.3,1.3); ctx.stroke();
  } else {
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
  }
  ctx.restore();
};

/* ================= 场景物件 ================= */
Art.prop = function(ctx,p,t,B){
  var x=p.x, y=p.y, r=p.r||8, k=p.kind, hit=p.hit||0;
  ctx.save();
  Art.shadow(ctx,x,y+r*0.6,r*0.9,r*0.34,0.3);
  ctx.translate(x,y);
  if(hit>0){ ctx.translate(U.rand(-1,1)*hit*2, 0); }
  if(k==='barrel'){
    var g=ctx.createLinearGradient(-r,0,r,0);
    g.addColorStop(0,'#5a3a22'); g.addColorStop(0.4,'#8a5c33'); g.addColorStop(1,'#4a2f1c');
    ctx.fillStyle=g; ctx.beginPath(); rrect(ctx,-r*0.8,-r*1.1,r*1.6,r*2.0,r*0.3); ctx.fill();
    ctx.fillStyle='#3a2716'; ctx.fillRect(-r*0.82,-r*0.65,r*1.64,r*0.24); ctx.fillRect(-r*0.82,r*0.35,r*1.64,r*0.24);
    ctx.fillStyle='#a06c3c'; ctx.beginPath(); ctx.ellipse(0,-r*1.05,r*0.8,r*0.26,0,0,TAU); ctx.fill();
  } else if(k==='crate'){
    ctx.fillStyle='#8a6033'; ctx.beginPath(); rrect(ctx,-r*0.9,-r*0.9,r*1.8,r*1.8,r*0.14); ctx.fill();
    ctx.strokeStyle='#5a3c1e'; ctx.lineWidth=r*0.16;
    ctx.beginPath(); ctx.moveTo(-r*0.9,-r*0.9); ctx.lineTo(r*0.9,r*0.9); ctx.moveTo(r*0.9,-r*0.9); ctx.lineTo(-r*0.9,r*0.9); ctx.stroke();
    ctx.strokeRect(-r*0.9,-r*0.9,r*1.8,r*1.8);
  } else if(k==='pot'){
    ctx.fillStyle='#9a7a55'; ctx.beginPath(); ctx.ellipse(0,0,r*0.75,r*0.9,0,0,TAU); ctx.fill();
    ctx.fillStyle='#7a5c3c'; ctx.beginPath(); ctx.ellipse(0,-r*0.8,r*0.5,r*0.2,0,0,TAU); ctx.fill();
    ctx.strokeStyle='#5f4630'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.ellipse(0,0,r*0.75,r*0.9,0,0,TAU); ctx.stroke();
  } else if(k==='torch'){
    ctx.fillStyle='#4a3a2a'; ctx.fillRect(-r*0.16,-r*0.4,r*0.32,r*1.4);
    var fh=1+Math.sin(t*9+p.seed)*0.22;
    Art.glowDot(ctx,0,-r*0.9,r*4.2*fh,B?B.accent:'#ffa040',0.4);
    ctx.fillStyle='#ff9a2e';
    ctx.beginPath(); ctx.moveTo(0,-r*2.0*fh); ctx.quadraticCurveTo(r*0.55,-r*0.9,0,-r*0.5); ctx.quadraticCurveTo(-r*0.55,-r*0.9,0,-r*2.0*fh); ctx.fill();
    ctx.fillStyle='#ffe066';
    ctx.beginPath(); ctx.moveTo(0,-r*1.5*fh); ctx.quadraticCurveTo(r*0.28,-r*0.85,0,-r*0.6); ctx.quadraticCurveTo(-r*0.28,-r*0.85,0,-r*1.5*fh); ctx.fill();
  } else if(k==='lamp'){
    ctx.fillStyle='#3a4468'; ctx.fillRect(-r*0.18,-r*0.2,r*0.36,r*1.2);
    var lp=0.8+Math.sin(t*3+p.seed)*0.2;
    Art.glowDot(ctx,0,-r*0.7,r*4*lp,B?B.accent:'#5ee0ff',0.42);
    ctx.fillStyle=U.alpha(B?B.accent:'#5ee0ff',0.9);
    ctx.beginPath(); ctx.arc(0,-r*0.7,r*0.5,0,TAU); ctx.fill();
  } else if(k==='statue'){
    ctx.fillStyle='#6a6480'; ctx.beginPath(); rrect(ctx,-r*0.85,r*0.5,r*1.7,r*0.6,r*0.1); ctx.fill();
    ctx.fillStyle='#8a84a0'; ctx.beginPath(); rrect(ctx,-r*0.55,-r*0.9,r*1.1,r*1.5,r*0.2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-r*1.2,r*0.44,0,TAU); ctx.fill();
    ctx.fillStyle='#3a3550'; ctx.beginPath(); ctx.arc(-r*0.16,-r*1.24,r*0.09,0,TAU); ctx.fill(); ctx.beginPath(); ctx.arc(r*0.16,-r*1.24,r*0.09,0,TAU); ctx.fill();
  } else if(k==='crystal' || k==='ice'){
    var cc = k==='ice'?'#9fe4ff':(B?B.accent:'#c08cff');
    Art.glowDot(ctx,0,-r*0.4,r*3,cc,0.32);
    ctx.fillStyle=U.alpha(cc,0.85);
    ctx.beginPath(); ctx.moveTo(0,-r*1.7); ctx.lineTo(r*0.7,-r*0.2); ctx.lineTo(r*0.4,r*0.9); ctx.lineTo(-r*0.4,r*0.9); ctx.lineTo(-r*0.7,-r*0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=1; ctx.stroke();
  } else if(k==='rock' || k==='skullpile'){
    ctx.fillStyle= k==='rock'?'#6b6470':'#cfc6b0';
    ctx.beginPath(); ctx.ellipse(-r*0.3,r*0.2,r*0.6,r*0.5,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r*0.35,r*0.05,r*0.5,r*0.45,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,-r*0.35,r*0.55,r*0.5,0,0,TAU); ctx.fill();
    if(k==='skullpile'){ ctx.fillStyle='#3a3040'; ctx.beginPath(); ctx.arc(-r*0.15,-r*0.4,r*0.13,0,TAU); ctx.fill(); ctx.beginPath(); ctx.arc(r*0.2,-r*0.4,r*0.13,0,TAU); ctx.fill(); }
  } else if(k==='plant' || k==='mushroom'){
    if(k==='plant'){
      ctx.strokeStyle='#3f7a45'; ctx.lineWidth=r*0.2;
      for(var pi=-1;pi<=1;pi++){
        ctx.beginPath(); ctx.moveTo(0,r*0.8);
        ctx.quadraticCurveTo(pi*r*0.7, 0, pi*r*0.9+Math.sin(t*2+pi)*r*0.15, -r*0.9); ctx.stroke();
      }
      ctx.fillStyle='#6fbf6a';
      for(var pj=-1;pj<=1;pj++){ ctx.beginPath(); ctx.ellipse(pj*r*0.9,-r*0.9,r*0.35,r*0.2,pj*0.5,0,TAU); ctx.fill(); }
    } else {
      ctx.fillStyle='#e8dcc0'; ctx.fillRect(-r*0.22,-r*0.2,r*0.44,r*1.0);
      ctx.fillStyle='#d0524a'; ctx.beginPath(); ctx.ellipse(0,-r*0.3,r*0.75,r*0.55,0,Math.PI,TAU); ctx.fill();
      ctx.fillStyle='#f5e6d0'; ctx.beginPath(); ctx.arc(-r*0.25,-r*0.45,r*0.12,0,TAU); ctx.fill(); ctx.beginPath(); ctx.arc(r*0.3,-r*0.55,r*0.1,0,TAU); ctx.fill();
    }
  } else if(k==='machine' || k==='pipe'){
    ctx.fillStyle='#404c72'; ctx.beginPath(); rrect(ctx,-r*0.85,-r*1.0,r*1.7,r*2.0,r*0.2); ctx.fill();
    ctx.fillStyle='#232a44'; ctx.beginPath(); rrect(ctx,-r*0.55,-r*0.75,r*1.1,r*0.7,r*0.1); ctx.fill();
    var bl=Math.sin(t*4+p.seed)>0?1:0.3;
    ctx.fillStyle=U.alpha('#5ee0ff',bl); ctx.beginPath(); ctx.arc(-r*0.25,-r*0.4,r*0.13,0,TAU); ctx.fill();
    ctx.fillStyle=U.alpha('#ff6a6a',1-bl*0.7); ctx.beginPath(); ctx.arc(r*0.25,-r*0.4,r*0.13,0,TAU); ctx.fill();
    ctx.fillStyle='#5a668c'; ctx.fillRect(-r*0.7,r*0.25,r*1.4,r*0.2);
  } else if(k==='banner'){
    ctx.fillStyle=B?B.accent:'#8f7fd0';
    ctx.beginPath(); ctx.moveTo(-r*0.6,-r*1.6); ctx.lineTo(r*0.6,-r*1.6); ctx.lineTo(r*0.6,r*0.7); ctx.lineTo(0,r*0.3); ctx.lineTo(-r*0.6,r*0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle=U.alpha('#ffffff',0.8); U.star(ctx,0,-r*0.6,r*0.32,r*0.14,5,0); ctx.fill();
  }
  ctx.restore();
};

/* ================= 拆解机 ================= */
Art.disassembler = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,9,15,5,0.34);
  ctx.fillStyle='#3a4468'; ctx.beginPath(); rrect(ctx,-15,-10,30,20,4); ctx.fill();
  ctx.fillStyle='#232a44'; ctx.beginPath(); rrect(ctx,-11,-6,22,12,3); ctx.fill();
  /* 传送带 */
  ctx.fillStyle='#2a3048';
  ctx.beginPath(); rrect(ctx,-13,4,26,4,2); ctx.fill();
  ctx.fillStyle='#5ee0ff';
  for(var i=-1;i<=1;i++){
    ctx.beginPath(); ctx.arc(i*8,6,1.6,0,TAU); ctx.fill();
  }
  /* 分解光束 */
  var pulse=0.5+Math.sin(t*5)*0.2;
  Art.glowDot(ctx,0,-8,14*pulse,'#8ef0ff',0.5);
  ctx.strokeStyle=U.alpha('#8ef0ff',0.7); ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(-6,-12); ctx.lineTo(6,-12); ctx.moveTo(-6,-4); ctx.lineTo(6,-4); ctx.stroke();
  ctx.fillStyle='#8ef0ff';
  ctx.beginPath(); ctx.arc(0,-8,2.4,0,TAU); ctx.fill();
  ctx.restore();
};

/* ================= 大厅设施 ================= */
Art.gacha = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,10,14,5,0.34);
  ctx.fillStyle='#3a4468'; ctx.beginPath(); rrect(ctx,-12,-14,24,24,6); ctx.fill();
  ctx.fillStyle='#232a44'; ctx.beginPath(); rrect(ctx,-8,-10,16,16,4); ctx.fill();
  ctx.fillStyle='#5ee0ff';
  ctx.beginPath(); ctx.arc(0,-6,5,0,TAU); ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.beginPath(); ctx.arc(-1.6,-7.4,1.4,0,TAU); ctx.fill();
  ctx.fillStyle='#ffd45e';
  ctx.beginPath(); ctx.arc(0,4,2.6,0,TAU); ctx.fill();
  ctx.fillStyle='#ff5b6e';
  ctx.beginPath(); ctx.arc(0,4,1.2,0,TAU); ctx.fill();
  ctx.strokeStyle='#5ee0ff'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(0,-6,8,0,TAU); ctx.stroke();
  ctx.restore();
};
Art.questboard = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,8,16,4,0.3);
  ctx.fillStyle='#5a3a2a'; ctx.beginPath(); rrect(ctx,-16,-10,32,20,3); ctx.fill();
  ctx.fillStyle='#7a5230'; ctx.beginPath(); rrect(ctx,-13,-7,26,14,2); ctx.fill();
  ctx.fillStyle='#e8dcc0';
  ctx.beginPath(); rrect(ctx,-10,-5,9,7,1); ctx.fill();
  ctx.beginPath(); rrect(ctx,1,-5,9,7,1); ctx.fill();
  ctx.fillStyle='#5a3a2a';
  ctx.fillRect(-10,-2,9,1); ctx.fillRect(1,-2,9,1);
  ctx.fillStyle='#c8b090';
  ctx.beginPath(); rrect(ctx,-10,2,20,2,1); ctx.fill();
  ctx.restore();
};
Art.garden = function(ctx,x,y,t,watered){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,8,20,4,0.3);
  ctx.fillStyle='#3a2a1c'; ctx.beginPath(); rrect(ctx,-22,-4,44,10,3); ctx.fill();
  ctx.fillStyle='#4a3a24'; ctx.beginPath(); rrect(ctx,-19,-1,38,5,2); ctx.fill();
  for(var i=-1;i<=1;i++){
    var gx=i*13;
    ctx.fillStyle='#2e2418'; ctx.beginPath(); rrect(ctx,gx-5,-8,10,8,2); ctx.fill();
    ctx.fillStyle=watered?'#3f7a45':'#5a4a30';
    ctx.beginPath(); rrect(ctx,gx-4,-7,8,6,1); ctx.fill();
    ctx.fillStyle=watered?'#6fbf6a':'#8a7a50';
    ctx.beginPath(); ctx.ellipse(gx,-9,3,2.4,0,0,TAU); ctx.fill();
    if(watered){
      ctx.fillStyle='#ffd45e';
      ctx.beginPath(); ctx.arc(gx,-12,1.2,0,TAU); ctx.fill();
    }
  }
  ctx.restore();
};
Art.dummy = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,12,10,4,0.3);
  ctx.fillStyle='#5a3a2a'; ctx.beginPath(); rrect(ctx,-3,6,6,10,2); ctx.fill();
  ctx.fillStyle='#8a6a44'; ctx.beginPath(); rrect(ctx,-8,-2,16,10,3); ctx.fill();
  ctx.fillStyle='#c8b090'; ctx.beginPath(); ctx.arc(0,-8,6,0,TAU); ctx.fill();
  ctx.fillStyle='#2a1c10';
  ctx.beginPath(); ctx.arc(-2.2,-9,1.1,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2.2,-9,1.1,0,TAU); ctx.fill();
  ctx.strokeStyle='#ff5b6e'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.arc(0,-8,8,0,TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,-8,11,0,TAU); ctx.stroke();
  ctx.restore();
};

/* ================= 多功能房间设施 ================= */
Art.forge = function(ctx,x,y,t,used){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,8,16,5,0.34);
  ctx.fillStyle='#4a3a2a'; ctx.beginPath(); rrect(ctx,-16,-6,32,14,3); ctx.fill();
  ctx.fillStyle='#6a5238'; ctx.beginPath(); rrect(ctx,-13,-3,26,8,2); ctx.fill();
  ctx.fillStyle='#8a6a44'; ctx.beginPath(); rrect(ctx,-9,-9,18,5,2); ctx.fill();
  var hf=0.7+Math.sin(t*5)*0.3;
  Art.glowDot(ctx,0,-14,16*hf,'#ff9a3c',0.5);
  ctx.fillStyle='#ffb43c';
  ctx.beginPath(); ctx.moveTo(0,-18*hf); ctx.quadraticCurveTo(5,-10,0,-6); ctx.quadraticCurveTo(-5,-10,0,-18*hf); ctx.fill();
  ctx.fillStyle='#ffe066';
  ctx.beginPath(); ctx.moveTo(0,-13*hf); ctx.quadraticCurveTo(2.5,-9,0,-7); ctx.quadraticCurveTo(-2.5,-9,0,-13*hf); ctx.fill();
  ctx.strokeStyle='#2a1c10'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-16,6); ctx.lineTo(16,6); ctx.stroke();
  ctx.restore();
};
Art.recycle = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,8,15,5,0.34);
  ctx.fillStyle='#3a4468'; ctx.beginPath(); rrect(ctx,-15,-8,30,16,4); ctx.fill();
  ctx.fillStyle='#232a44'; ctx.beginPath(); rrect(ctx,-11,-4,22,8,2); ctx.fill();
  ctx.strokeStyle='#5ee0ff'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(0,0,7,0,TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4,-4); ctx.lineTo(4,4); ctx.moveTo(4,-4); ctx.lineTo(-4,4); ctx.stroke();
  ctx.fillStyle='#5ee0ff';
  ctx.beginPath(); ctx.arc(0,-14,2.4,0,TAU); ctx.fill();
  ctx.fillStyle='#ff5b6e';
  ctx.beginPath(); ctx.arc(0,-14,1.2,0,TAU); ctx.fill();
  ctx.restore();
};
Art.mentor = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,10,12,4,0.3);
  ctx.fillStyle='#5a3a8a'; ctx.beginPath(); rrect(ctx,-9,-16,18,26,5); ctx.fill();
  ctx.fillStyle='#3a2458'; ctx.beginPath(); rrect(ctx,-6,-12,12,18,3); ctx.fill();
  ctx.fillStyle='#c07aff';
  ctx.beginPath(); ctx.arc(0,-20,3,0,TAU); ctx.fill();
  Art.glowDot(ctx,0,-20,10,'#c07aff',0.4+Math.sin(t*4)*0.15);
  ctx.fillStyle='#e0c8a0'; ctx.beginPath(); ctx.arc(0,-6,4.5,0,TAU); ctx.fill();
  ctx.fillStyle='#2a1a3a';
  ctx.beginPath(); ctx.arc(-1.6,-6.5,1,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(1.6,-6.5,1,0,TAU); ctx.fill();
  ctx.fillStyle='#c07aff'; ctx.beginPath(); rrect(ctx,-10,2,20,4,2); ctx.fill();
  ctx.restore();
};
Art.smith = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,9,13,4,0.3);
  ctx.fillStyle='#6a5238'; ctx.beginPath(); rrect(ctx,-12,-4,24,12,3); ctx.fill();
  ctx.fillStyle='#8a6a44'; ctx.beginPath(); rrect(ctx,-9,-1,18,6,2); ctx.fill();
  ctx.fillStyle='#4a3a2a'; ctx.beginPath(); rrect(ctx,-14,-8,6,6,2); ctx.fill();
  ctx.fillStyle='#c8b090'; ctx.beginPath(); rrect(ctx,-11,-14,4,8,1); ctx.fill();
  ctx.fillStyle='#ffd45e'; ctx.beginPath(); rrect(ctx,-13,-16,8,3,1); ctx.fill();
  var sp=Math.sin(t*6)*2;
  ctx.fillStyle='#e8e2d0'; ctx.beginPath(); rrect(ctx,6,-12+sp,3,10,1); ctx.fill();
  ctx.fillStyle='#9aa4c4'; ctx.beginPath(); rrect(ctx,4,-16+sp,7,4,1); ctx.fill();
  ctx.restore();
};
Art.wishing = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle='#2a3450'; ctx.beginPath(); rrect(ctx,-14,-8,28,16,6); ctx.fill();
  ctx.strokeStyle='#8ef0ff'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(0,-8,12,4,0,0,TAU); ctx.stroke();
  ctx.fillStyle='#1a2038'; ctx.beginPath(); ctx.ellipse(0,-8,10,3,0,0,TAU); ctx.fill();
  var gl=0.5+Math.sin(t*3)*0.2;
  Art.glowDot(ctx,0,-8,14,'#8ef0ff',gl);
  ctx.fillStyle='#ffd45e';
  ctx.beginPath(); ctx.arc(-4,-10,1.4,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3,-7,1.1,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0,-12,0.9,0,TAU); ctx.fill();
  ctx.restore();
};
Art.statue = function(ctx,x,y,t,used){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,10,13,4,0.32);
  ctx.fillStyle='#6a6480'; ctx.beginPath(); rrect(ctx,-12,4,24,6,2); ctx.fill();
  ctx.fillStyle='#8a84a0'; ctx.beginPath(); rrect(ctx,-7,-14,14,20,3); ctx.fill();
  ctx.fillStyle='#a09ab8'; ctx.beginPath(); ctx.arc(0,-18,5,0,TAU); ctx.fill();
  ctx.fillStyle='#3a3550';
  ctx.beginPath(); ctx.arc(-2,-19,1.2,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2,-19,1.2,0,TAU); ctx.fill();
  if(used){
    ctx.fillStyle='#ffd45e'; U.star(ctx,0,-26,4,1.8,5,t*0.5); ctx.fill();
  } else {
    Art.glowDot(ctx,0,-18,16,'#ffd45e',0.3+Math.sin(t*3)*0.1);
  }
  ctx.restore();
};
Art.rest = function(ctx,x,y,t,used){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,8,14,4,0.3);
  ctx.fillStyle='#5a3a2a'; ctx.beginPath(); rrect(ctx,-12,-4,24,10,3); ctx.fill();
  ctx.fillStyle='#7a4a30'; ctx.beginPath(); rrect(ctx,-9,-1,18,5,2); ctx.fill();
  var fh=0.8+Math.sin(t*7)*0.2;
  Art.glowDot(ctx,0,-12,20*fh,'#ff8a2a',0.5);
  ctx.fillStyle='#ff9a3c';
  ctx.beginPath(); ctx.moveTo(0,-16*fh); ctx.quadraticCurveTo(6,-8,0,-4); ctx.quadraticCurveTo(-6,-8,0,-16*fh); ctx.fill();
  ctx.fillStyle='#ffe066';
  ctx.beginPath(); ctx.moveTo(0,-11*fh); ctx.quadraticCurveTo(3,-7,0,-5); ctx.quadraticCurveTo(-3,-7,0,-11*fh); ctx.fill();
  ctx.fillStyle='#8a5a3a'; ctx.beginPath(); rrect(ctx,-14,4,28,3,1); ctx.fill();
  ctx.restore();
};
Art.armory = function(ctx,x,y,t){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle='#3a4468'; ctx.beginPath(); rrect(ctx,-16,-4,32,10,2); ctx.fill();
  ctx.fillStyle='#232a44'; ctx.beginPath(); rrect(ctx,-13,-1,26,5,1); ctx.fill();
  ctx.strokeStyle='#5ee0ff'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-10,-4); ctx.lineTo(-10,-14); ctx.moveTo(0,-4); ctx.lineTo(0,-14); ctx.moveTo(10,-4); ctx.lineTo(10,-14); ctx.stroke();
  ctx.fillStyle='#9aa4c4'; ctx.beginPath(); rrect(ctx,-12,-16,4,3,1); ctx.fill();
  ctx.fillStyle='#ffd45e'; ctx.beginPath(); rrect(ctx,-2,-16,4,3,1); ctx.fill();
  ctx.fillStyle='#c8b090'; ctx.beginPath(); rrect(ctx,8,-16,4,3,1); ctx.fill();
  ctx.restore();
};

Art.chest = function(ctx,x,y,t,open,rarity){
  var cols=['#9aa3bd','#5fd07a','#5aa8ff','#c07aff','#ffb43c'];
  var c=cols[U.clamp((rarity||1)-1,0,4)];
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,9,12,4,0.34);
  var lid = open?1:0;
  ctx.fillStyle='#7a5230'; ctx.beginPath(); rrect(ctx,-11,-3,22,13,2.4); ctx.fill();
  ctx.fillStyle='#5c3c22'; ctx.fillRect(-11,3,22,2.4);
  ctx.save();
  ctx.translate(0,-3); ctx.rotate(-lid*1.15);
  ctx.fillStyle='#8f5f37'; ctx.beginPath();
  ctx.moveTo(-11,0); ctx.lineTo(-11,-4); ctx.quadraticCurveTo(0,-13,11,-4); ctx.lineTo(11,0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=c; ctx.lineWidth=1.6; ctx.stroke();
  ctx.restore();
  ctx.fillStyle=c; ctx.beginPath(); rrect(ctx,-3,-1,6,6,1.4); ctx.fill();
  if(!open){ Art.glowDot(ctx,0,0,20+Math.sin(t*3)*3,c,0.28); }
  else { Art.glowDot(ctx,0,-4,26,c,0.4); }
  ctx.restore();
};

Art.portal = function(ctx,x,y,t,c){
  ctx.save(); ctx.translate(x,y);
  Art.glowDot(ctx,0,0,42+Math.sin(t*2)*6,c||'#7ad0ff',0.4);
  ctx.strokeStyle=U.alpha(c||'#7ad0ff',0.85);
  for(var i=0;i<3;i++){
    ctx.lineWidth=2.2-i*0.5;
    ctx.beginPath(); ctx.ellipse(0,0,20-i*4,9-i*1.6,t*(0.7+i*0.4),0,TAU); ctx.stroke();
  }
  ctx.fillStyle=U.alpha(c||'#7ad0ff',0.32);
  ctx.beginPath(); ctx.ellipse(0,0,15,7,0,0,TAU); ctx.fill();
  for(var j=0;j<6;j++){
    var a=t*2+j*1.05, rr=13+Math.sin(t*3+j)*5;
    ctx.fillStyle=U.alpha('#ffffff',0.6);
    ctx.beginPath(); ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr*0.45,1.5,0,TAU); ctx.fill();
  }
  ctx.restore();
};

Art.shrine = function(ctx,x,y,t,c,used){
  ctx.save(); ctx.translate(x,y);
  Art.shadow(ctx,0,10,13,4.6,0.34);
  ctx.fillStyle='#5c5876'; ctx.beginPath(); rrect(ctx,-10,2,20,9,2); ctx.fill();
  ctx.fillStyle='#7a748f'; ctx.beginPath(); rrect(ctx,-6,-8,12,11,2); ctx.fill();
  if(!used){
    var b=0.7+Math.sin(t*3)*0.3;
    Art.glowDot(ctx,0,-12,24*b,c,0.5);
    ctx.fillStyle=c; U.star(ctx,0,-12,5.5,2.4,4,t*0.9); ctx.fill();
  }
  ctx.restore();
};

/* ================= 瓦片贴图生成 ================= */
Art.buildTileset = function(biome, TS){
  var B = Art.BIOMES[biome % Art.BIOMES.length];
  function mk(w,h,fn){
    var c=document.createElement('canvas'); c.width=w; c.height=h;
    var x=c.getContext('2d'); if(x) fn(x,w,h); return c;
  }
  var floors=[];
  for(var v=0; v<4; v++){
    floors.push(mk(TS,TS,function(x,w,h){
      var base = v===0?B.floorA:(v===1?B.floorB:(v===2?B.floorC:B.floorA));
      x.fillStyle=base; x.fillRect(0,0,w,h);
      x.fillStyle=U.alpha(B.floorC,0.5);
      x.fillRect(0,0,w,1); x.fillRect(0,0,1,h);
      x.fillStyle=U.alpha(B.edge,0.42);
      x.fillRect(0,h-1,w,1); x.fillRect(w-1,0,1,h);
      for(var i=0;i<10;i++){
        x.fillStyle=U.alpha(i%2?B.edge:B.floorC, 0.16+Math.random()*0.14);
        var sx=Math.floor(Math.random()*(w-2))+1, sy=Math.floor(Math.random()*(h-2))+1;
        x.fillRect(sx,sy,1+Math.floor(Math.random()*2),1);
      }
      if(v===3){
        x.strokeStyle=U.alpha(B.accent,0.16); x.lineWidth=1;
        x.beginPath(); x.moveTo(3,h-4); x.lineTo(w-4,4); x.stroke();
      }
    }));
  }
  var wallTop = mk(TS,TS,function(x,w,h){
    var g=x.createLinearGradient(0,0,0,h);
    g.addColorStop(0,U.shade(B.wallTop,1.1)); g.addColorStop(1,B.wall);
    x.fillStyle=g; x.fillRect(0,0,w,h);
    x.fillStyle=U.alpha(B.edge,0.5); x.fillRect(0,h-2,w,2);
    for(var i=0;i<8;i++){
      x.fillStyle=U.alpha(B.edge,0.12+Math.random()*0.12);
      x.fillRect(Math.floor(Math.random()*w),Math.floor(Math.random()*h),2,1);
    }
  });
  var wallFace = mk(TS,TS,function(x,w,h){
    var g=x.createLinearGradient(0,0,0,h);
    g.addColorStop(0,B.wall); g.addColorStop(0.7,U.shade(B.wall,0.72)); g.addColorStop(1,U.shade(B.wallDark,0.9));
    x.fillStyle=g; x.fillRect(0,0,w,h);
    x.fillStyle=U.alpha(B.wallTop,0.35); x.fillRect(0,0,w,1);
    x.fillStyle=U.alpha(B.edge,0.6);
    x.fillRect(0,Math.floor(h*0.55),w,1);
    for(var i=0;i<5;i++){
      x.fillStyle=U.alpha(B.edge,0.18);
      x.fillRect(Math.floor(Math.random()*w),Math.floor(Math.random()*h),3,1);
    }
  });
  var liquid = mk(TS,TS,function(x,w,h){
    x.fillStyle=B.liquid; x.fillRect(0,0,w,h);
    x.fillStyle=U.alpha('#ffffff',0.1);
    x.fillRect(0,Math.floor(h*0.3),w,1); x.fillRect(0,Math.floor(h*0.7),w,1);
  });
  return {B:B, floors:floors, wallTop:wallTop, wallFace:wallFace, liquid:liquid};
};

/* 小图标（HUD/图鉴） */
Art.icon = function(ctx,x,y,s,kind,c){
  ctx.save(); ctx.translate(x,y);
  if(kind==='heart'){
    ctx.fillStyle=c||'#ff4d6a';
    ctx.beginPath();
    ctx.moveTo(0,s*0.95);
    ctx.bezierCurveTo(-s*1.35,s*0.05,-s*0.7,-s*0.95,0,-s*0.28);
    ctx.bezierCurveTo(s*0.7,-s*0.95,s*1.35,s*0.05,0,s*0.95);
    ctx.fill();
    ctx.fillStyle=U.alpha('#ffffff',0.45);
    ctx.beginPath(); ctx.ellipse(-s*0.38,-s*0.3,s*0.2,s*0.13,-0.5,0,TAU); ctx.fill();
  } else if(kind==='shield'){
    ctx.fillStyle=c||'#7fd4ff';
    ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.85,-s*0.6); ctx.lineTo(s*0.85,s*0.3);
    ctx.quadraticCurveTo(0,s*1.15,-s*0.85,s*0.3); ctx.lineTo(-s*0.85,-s*0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle=U.alpha('#ffffff',0.5); ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(-s*0.6,-s*0.5); ctx.lineTo(-s*0.6,s*0.2); ctx.closePath(); ctx.fill();
  } else if(kind==='energy'){
    ctx.fillStyle=c||'#59b8ff';
    ctx.beginPath(); ctx.moveTo(s*0.25,-s); ctx.lineTo(-s*0.55,s*0.15); ctx.lineTo(-s*0.05,s*0.15); ctx.lineTo(-s*0.3,s); ctx.lineTo(s*0.6,-s*0.2); ctx.lineTo(s*0.05,-s*0.2); ctx.closePath(); ctx.fill();
  } else if(kind==='coin'){
    ctx.fillStyle=c||'#ffc93c'; ctx.beginPath(); ctx.arc(0,0,s,0,TAU); ctx.fill();
    ctx.fillStyle='#e09a1a'; ctx.beginPath(); ctx.arc(0,0,s*0.62,0,TAU); ctx.fill();
    ctx.fillStyle='#ffe89a'; ctx.font='bold '+(s*1.1)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('G',0,s*0.06);
  } else if(kind==='key'){
    ctx.fillStyle=c||'#ffd45e';
    ctx.beginPath(); ctx.arc(-s*0.4,0,s*0.45,0,TAU); ctx.fill();
    ctx.fillRect(-s*0.1,-s*0.16,s*1.1,s*0.32);
    ctx.fillRect(s*0.6,0,s*0.18,s*0.42); ctx.fillRect(s*0.9,0,s*0.18,s*0.42);
    ctx.fillStyle='#2a2140'; ctx.beginPath(); ctx.arc(-s*0.4,0,s*0.18,0,TAU); ctx.fill();
  } else if(kind==='skull'){
    ctx.fillStyle=c||'#e8e2f0';
    ctx.beginPath(); ctx.arc(0,-s*0.1,s*0.8,0,TAU); ctx.fill();
    ctx.fillRect(-s*0.42,s*0.35,s*0.84,s*0.45);
    ctx.fillStyle='#22182e';
    ctx.beginPath(); ctx.arc(-s*0.3,-s*0.1,s*0.22,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.3,-s*0.1,s*0.22,0,TAU); ctx.fill();
  }
  ctx.restore();
};
})();
