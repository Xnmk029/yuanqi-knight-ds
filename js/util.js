/* 元气骑士·深渊回响 —— 基础工具库 / 输入系统 */
(function(){
var G = window.G || (window.G = {});
var U = {};
G.U = U;
var TAU = Math.PI * 2;
U.TAU = TAU;
U.clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
U.lerp  = function(a,b,t){ return a+(b-a)*t; };
U.rand  = function(a,b){ if(b===undefined){ b=a; a=0; } return a+Math.random()*(b-a); };
U.randi = function(a,b){ if(b===undefined){ b=a; a=0; } return Math.floor(a+Math.random()*(b-a)); };
U.pick  = function(a){ return a[Math.floor(Math.random()*a.length)]; };
U.chance= function(p){ return Math.random()<p; };
U.sign  = function(v){ return v<0?-1:(v>0?1:0); };
U.dist  = function(x1,y1,x2,y2){ var dx=x2-x1, dy=y2-y1; return Math.sqrt(dx*dx+dy*dy); };
U.dist2 = function(x1,y1,x2,y2){ var dx=x2-x1, dy=y2-y1; return dx*dx+dy*dy; };
U.ang   = function(x1,y1,x2,y2){ return Math.atan2(y2-y1,x2-x1); };
U.approach = function(v,t,d){ return v<t?Math.min(v+d,t):Math.max(v-d,t); };
U.damp  = function(a,b,rate,dt){ return b+(a-b)*Math.exp(-rate*dt); };
U.shuffle = function(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; };
U.wpick = function(list,key){
  key = key || 'w'; var t=0,i;
  for(i=0;i<list.length;i++) t += (list[i][key]||1);
  var r = Math.random()*t;
  for(i=0;i<list.length;i++){ r -= (list[i][key]||1); if(r<=0) return list[i]; }
  return list[list.length-1];
};
U.angDiff = function(a,b){ var d=(b-a)%TAU; if(d>Math.PI)d-=TAU; if(d<-Math.PI)d+=TAU; return d; };
U.rotTo = function(a,b,max){ return a + U.clamp(U.angDiff(a,b),-max,max); };
U.hsl   = function(h,s,l,a){ return 'hsla('+h+','+s+'%,'+l+'%,'+(a===undefined?1:a)+')'; };
U.rgba  = function(r,g,b,a){ return 'rgba('+(r|0)+','+(g|0)+','+(b|0)+','+(a===undefined?1:a)+')'; };
U.hex   = function(c){
  if(typeof c!=='string') return [255,255,255];
  if(c.charAt(0)==='#'){
    if(c.length===4) return [parseInt(c.charAt(1)+c.charAt(1),16),parseInt(c.charAt(2)+c.charAt(2),16),parseInt(c.charAt(3)+c.charAt(3),16)];
    return [parseInt(c.substr(1,2),16),parseInt(c.substr(3,2),16),parseInt(c.substr(5,2),16)];
  }
  return [255,255,255];
};
U.shade = function(c,f){ var p=U.hex(c); return U.rgba(U.clamp(p[0]*f,0,255),U.clamp(p[1]*f,0,255),U.clamp(p[2]*f,0,255),1); };
U.alpha = function(c,a){ var p=U.hex(c); return U.rgba(p[0],p[1],p[2],a); };
U.mix   = function(c1,c2,t){ var a=U.hex(c1), b=U.hex(c2); return U.rgba(U.lerp(a[0],b[0],t),U.lerp(a[1],b[1],t),U.lerp(a[2],b[2],t),1); };
U.ease = {
  outCubic: function(t){ return 1-Math.pow(1-t,3); },
  inCubic:  function(t){ return t*t*t; },
  outBack:  function(t){ return 1+2.7*Math.pow(t-1,3)+1.7*Math.pow(t-1,2); },
  outElastic: function(t){ return t===0||t===1?t:Math.pow(2,-9*t)*Math.sin((t*10-0.75)*2.094)+1; },
  inOut: function(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
};
U.roundRect = function(ctx,x,y,w,h,r){
  if(r>w/2) r=w/2; if(r>h/2) r=h/2;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
};
U.poly = function(ctx,x,y,r,n,rot,squash){
  squash = squash===undefined?1:squash;
  ctx.beginPath();
  for(var i=0;i<n;i++){
    var a = rot + i/n*TAU;
    var px = x + Math.cos(a)*r, py = y + Math.sin(a)*r*squash;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
};
U.star = function(ctx,x,y,r1,r2,n,rot){
  ctx.beginPath();
  for(var i=0;i<n*2;i++){
    var a = rot + i/(n*2)*TAU, r = (i%2)?r2:r1;
    var px = x+Math.cos(a)*r, py = y+Math.sin(a)*r;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
};
/* 可复现随机数（种子 RNG，用于存档/联机地图一致性） */
U.mulberry32 = function(seed){
  var a = seed>>>0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a>>>15, 1 | a);
    t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
};
U.rng = function(seed){
  var r = U.mulberry32(seed);
  return {
    rand: function(a,b){ if(b===undefined){ b=a; a=0; } return a+r()*(b-a); },
    randi: function(a,b){ if(b===undefined){ b=a; a=0; } return Math.floor(a+r()*(b-a)); },
    pick: function(arr){ return arr[Math.floor(r()*arr.length)]; },
    chance: function(p){ return r()<p; },
    shuffle: function(arr){
      for(var i=arr.length-1;i>0;i--){
        var j=Math.floor(r()*(i+1)), t=arr[i]; arr[i]=arr[j]; arr[j]=t;
      }
      return arr;
    }
  };
};
U.save = function(k,v){ try{ localStorage.setItem('yqks_'+k, JSON.stringify(v)); }catch(e){} };
U.load = function(k,d){ try{ var v=localStorage.getItem('yqks_'+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } };

/* ============ 输入系统 ============ */
var IN = {
  keys:{}, hits:{},
  mx:0, my:0, wx:0, wy:0,
  down:false, downHit:false, rdown:false, rdownHit:false,
  wheel:0, hasTouch:false, anyInput:false,
  stickL:{on:false,ox:0,oy:0,x:0,y:0,dx:0,dy:0,id:-1},
  stickR:{on:false,ox:0,oy:0,x:0,y:0,dx:0,dy:0,id:-1}
};
G.Input = IN;
IN.init = function(el){
  var W = window;
  W.addEventListener('keydown', function(e){
    var t = e.target;
    var tag = (t && t.tagName) ? t.tagName.toUpperCase() : '';
    /* 输入框/文本域内打字：不拦截、不记录到游戏输入 */
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return;
    var k = (e.key||'').toLowerCase();
    if(!IN.keys[k]) IN.hits[k] = true;
    IN.keys[k] = true;
    var c = (e.code||'').toLowerCase();
    if(!IN.keys[c]) IN.hits[c] = true;
    IN.keys[c] = true;
    IN.anyInput = true;
    if(k===' '||k==='tab'||(k.indexOf('arrow')===0)) e.preventDefault();
  });
  W.addEventListener('keyup', function(e){
    var k=(e.key||'').toLowerCase(); IN.keys[k]=false;
    var c=(e.code||'').toLowerCase(); IN.keys[c]=false;
  });
  W.addEventListener('blur', function(){ IN.keys={}; IN.down=false; IN.rdown=false; });
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  el.addEventListener('mousemove', function(e){ IN.setMouse(e.clientX, e.clientY); });
  el.addEventListener('mousedown', function(e){
    var t = e.target;
    var tag = (t && t.tagName) ? t.tagName.toUpperCase() : '';
    /* 表单控件（输入框等）：放行默认行为，允许聚焦输入 */
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return;
    IN.setMouse(e.clientX,e.clientY); IN.anyInput=true;
    if(e.button===0){ IN.down=true; IN.downHit=true; }
    if(e.button===2){ IN.rdown=true; IN.rdownHit=true; }
    e.preventDefault();
  });
  W.addEventListener('mouseup', function(e){
    if(e.button===0) IN.down=false;
    if(e.button===2) IN.rdown=false;
  });
  W.addEventListener('wheel', function(e){ IN.wheel += (e.deltaY>0?1:-1); }, {passive:true});

  function touchPos(t){ return {x:t.clientX, y:t.clientY}; }
  el.addEventListener('touchstart', function(e){
    var t = e.target;
    var tag = (t && t.tagName) ? t.tagName.toUpperCase() : '';
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return;
    IN.hasTouch = true; IN.anyInput = true;
    for(var i=0;i<e.changedTouches.length;i++){
      var t = e.changedTouches[i], p = touchPos(t);
      var st = (p.x < window.innerWidth*0.45) ? IN.stickL : IN.stickR;
      if(st.on) continue;
      st.on=true; st.id=t.identifier; st.ox=p.x; st.oy=p.y; st.x=p.x; st.y=p.y; st.dx=0; st.dy=0;
    }
    e.preventDefault();
  }, {passive:false});
  function moveTouch(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i], p=touchPos(t);
      [IN.stickL,IN.stickR].forEach(function(st){
        if(st.on && st.id===t.identifier){
          st.x=p.x; st.y=p.y;
          var dx=p.x-st.ox, dy=p.y-st.oy, d=Math.sqrt(dx*dx+dy*dy), max=58;
          if(d>max){ st.ox += dx*(1-max/d); st.oy += dy*(1-max/d); dx*=max/d; dy*=max/d; d=max; }
          st.dx=dx/max; st.dy=dy/max;
        }
      });
    }
    e.preventDefault();
  }
  el.addEventListener('touchmove', moveTouch, {passive:false});
  function endTouch(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      [IN.stickL,IN.stickR].forEach(function(st){
        if(st.on && st.id===t.identifier){ st.on=false; st.id=-1; st.dx=0; st.dy=0; }
      });
    }
  }
  el.addEventListener('touchend', endTouch);
  el.addEventListener('touchcancel', endTouch);
};
IN.setMouse = function(cx,cy){ IN.mx=cx; IN.my=cy; };
IN.key = function(){ for(var i=0;i<arguments.length;i++) if(IN.keys[arguments[i]]) return true; return false; };
IN.hit = function(){ for(var i=0;i<arguments.length;i++) if(IN.hits[arguments[i]]) return true; return false; };
IN.moveVec = function(){
  var x=0,y=0;
  if(IN.key('a','arrowleft','keya')) x-=1;
  if(IN.key('d','arrowright','keyd')) x+=1;
  if(IN.key('w','arrowup','keyw')) y-=1;
  if(IN.key('s','arrowdown','keys')) y+=1;
  if(IN.stickL.on){ x+=IN.stickL.dx; y+=IN.stickL.dy; }
  var d=Math.sqrt(x*x+y*y);
  if(d>1){ x/=d; y/=d; }
  return {x:x, y:y, len:Math.min(d,1)};
};
IN.end = function(){ IN.hits={}; IN.wheel=0; IN.downHit=false; IN.rdownHit=false; };
})();
