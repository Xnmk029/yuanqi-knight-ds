/* 元气骑士·深渊回响 —— 程序化音效与音乐 (WebAudio) */
(function(){
var G = window.G || (window.G = {});
var A = {
  ctx:null, master:null, sfxGain:null, musGain:null,
  enabled:true, sfxVol:0.55, musVol:0.34, ready:false, noiseBuf:null
};
G.Audio = A;

A.init = function(){
  if(A.ctx) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  try{
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = 1; A.master.connect(A.ctx.destination);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = A.sfxVol; A.sfxGain.connect(A.master);
    A.musGain = A.ctx.createGain(); A.musGain.gain.value = A.musVol; A.musGain.connect(A.master);
    var len = A.ctx.sampleRate*1.0;
    A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var d = A.noiseBuf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
    A.ready = true;
  }catch(e){ A.ctx=null; }
};
A.resume = function(){ if(A.ctx && A.ctx.state==='suspended') A.ctx.resume(); };
A.setSfx = function(v){ A.sfxVol=v; if(A.sfxGain) A.sfxGain.gain.value=v; };
A.setMus = function(v){ A.musVol=v; if(A.musGain) A.musGain.gain.value=v; };
A.toggle = function(){ A.enabled=!A.enabled; if(A.master) A.master.gain.value=A.enabled?1:0; return A.enabled; };

A.tone = function(o){
  if(!A.ready || !A.enabled) return;
  var c=A.ctx, t=c.currentTime;
  var osc=c.createOscillator(), g=c.createGain();
  osc.type = o.type||'square';
  var f0 = o.f||440, f1 = (o.f1===undefined?f0:o.f1), dur = o.d||0.12;
  osc.frequency.setValueAtTime(f0, t);
  if(f1!==f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  var vol = (o.v===undefined?0.3:o.v);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol, t+(o.atk||0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  var node = osc;
  if(o.filter){
    var bp=c.createBiquadFilter(); bp.type='lowpass'; bp.frequency.value=o.filter;
    osc.connect(bp); node=bp;
  }
  node.connect(g); g.connect(o.mus?A.musGain:A.sfxGain);
  osc.start(t); osc.stop(t+dur+0.02);
};
A.noise = function(o){
  if(!A.ready || !A.enabled) return;
  var c=A.ctx, t=c.currentTime;
  var s=c.createBufferSource(); s.buffer=A.noiseBuf;
  var f=c.createBiquadFilter(); f.type=o.type||'lowpass';
  f.frequency.setValueAtTime(o.f||900,t);
  if(o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40,o.f1), t+(o.d||0.2));
  f.Q.value=o.q||1;
  var g=c.createGain(); var vol=(o.v===undefined?0.3:o.v), dur=o.d||0.2;
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(A.sfxGain);
  s.start(t); s.stop(t+dur+0.02);
};

var last = {};
function throttle(k, ms){
  var n = (A.ctx? A.ctx.currentTime*1000 : Date.now());
  if(last[k] && n-last[k] < ms) return false;
  last[k]=n; return true;
}
A.sfx = {
  shoot: function(p){ if(!throttle('sh',28))return; A.tone({type:'square',f:520+ (p||0)*120,f1:150,d:0.07,v:0.16}); A.noise({f:2600,f1:600,d:0.06,v:0.1}); },
  laser: function(){ if(!throttle('ls',34))return; A.tone({type:'sawtooth',f:1200,f1:320,d:0.13,v:0.13}); },
  plasma:function(){ if(!throttle('pl',40))return; A.tone({type:'sine',f:180,f1:820,d:0.16,v:0.16}); },
  heavy: function(){ A.tone({type:'square',f:180,f1:60,d:0.2,v:0.24}); A.noise({f:900,f1:120,d:0.24,v:0.24}); },
  sword: function(){ if(!throttle('sw',60))return; A.noise({type:'bandpass',f:1800,f1:500,d:0.14,v:0.22,q:2}); },
  hit:   function(){ if(!throttle('hi',22))return; A.noise({f:1800,f1:400,d:0.07,v:0.16}); A.tone({type:'square',f:300,f1:120,d:0.05,v:0.09}); },
  crit:  function(){ A.tone({type:'square',f:900,f1:1400,d:0.09,v:0.16}); A.noise({f:3000,f1:800,d:0.1,v:0.14}); },
  hurt:  function(){ A.tone({type:'sawtooth',f:320,f1:90,d:0.24,v:0.3}); A.noise({f:700,f1:120,d:0.2,v:0.2}); },
  die:   function(){ A.tone({type:'square',f:420,f1:60,d:0.34,v:0.2}); A.noise({f:1400,f1:80,d:0.34,v:0.22}); },
  explode:function(){ A.noise({f:1200,f1:60,d:0.55,v:0.4}); A.tone({type:'sine',f:120,f1:30,d:0.5,v:0.3}); },
  coin:  function(){ if(!throttle('co',40))return; A.tone({type:'square',f:1050,d:0.05,v:0.13}); A.tone({type:'square',f:1560,d:0.11,v:0.11}); },
  pickup:function(){ A.tone({type:'triangle',f:660,f1:1320,d:0.14,v:0.2}); },
  heal:  function(){ A.tone({type:'sine',f:520,f1:1040,d:0.3,v:0.2}); A.tone({type:'sine',f:780,f1:1560,d:0.34,v:0.13}); },
  dash:  function(){ A.noise({f:2200,f1:300,d:0.16,v:0.18}); },
  door:  function(){ A.tone({type:'square',f:120,f1:52,d:0.36,v:0.24}); A.noise({f:400,f1:80,d:0.4,v:0.2}); },
  unlock:function(){ A.tone({type:'triangle',f:800,d:0.08,v:0.16}); A.tone({type:'triangle',f:1200,d:0.16,v:0.14}); },
  power: function(){ [0,4,7,12].forEach(function(n,i){ setTimeout(function(){ A.tone({type:'triangle',f:440*Math.pow(2,n/12),d:0.24,v:0.17}); }, i*72); }); },
  boss:  function(){ A.tone({type:'sawtooth',f:110,f1:55,d:1.2,v:0.3}); A.noise({f:300,f1:60,d:1.4,v:0.25}); },
  freeze:function(){ A.tone({type:'sine',f:2400,f1:700,d:0.3,v:0.14}); A.noise({type:'highpass',f:3000,d:0.3,v:0.12}); },
  thunder:function(){ A.noise({type:'highpass',f:1200,f1:200,d:0.4,v:0.32}); A.tone({type:'sawtooth',f:90,f1:40,d:0.34,v:0.22}); },
  click: function(){ A.tone({type:'square',f:760,d:0.04,v:0.12}); },
  level: function(){ [0,7,12,19].forEach(function(n,i){ setTimeout(function(){ A.tone({type:'square',f:330*Math.pow(2,n/12),d:0.3,v:0.16}); }, i*95); }); }
};

/* ---- 程序化 BGM：低音线 + 琶音 + 打击 ---- */
var MUS = {
  on:false, step:0, acc:0, bpm:104, scaleIdx:0, root:55,
  scales:[[0,3,5,7,10],[0,2,3,7,9],[0,2,4,7,9],[0,1,5,7,8],[0,3,7,10,14]],
  intensity:0
};
A.music = MUS;
MUS.start = function(biome){
  MUS.on = true; MUS.scaleIdx = (biome||0)%MUS.scales.length;
  MUS.root = [55,58,49,52,46][(biome||0)%5];
  MUS.bpm = 100 + (biome||0)*6;
};
MUS.stop = function(){ MUS.on=false; };
MUS.setIntensity = function(v){ MUS.intensity = v; };
MUS.update = function(dt){
  if(!MUS.on || !A.ready || !A.enabled) return;
  var spb = 60/MUS.bpm/2;
  MUS.acc += dt;
  while(MUS.acc >= spb){
    MUS.acc -= spb;
    var s = MUS.step++, sc = MUS.scales[MUS.scaleIdx];
    var bar = Math.floor(s/8)%4;
    if(s%4===0){
      var bn = MUS.root + [0,0,-2,3][bar];
      A.tone({type:'triangle',f:16.35*Math.pow(2,bn/12),d:0.34,v:0.2,mus:true,filter:520});
    }
    if(s%2===0){
      var n = sc[(s/2 + bar)%sc.length] + MUS.root + 24;
      A.tone({type:'square',f:16.35*Math.pow(2,n/12),d:0.13,v:0.055+MUS.intensity*0.04,mus:true,filter:2200});
    }
    if(MUS.intensity>0.3 && s%8===4){
      var n2 = sc[(s+3)%sc.length]+MUS.root+36;
      A.tone({type:'sine',f:16.35*Math.pow(2,n2/12),d:0.4,v:0.05,mus:true});
    }
    if(s%8===0 || s%8===6){ A.noise({f:180,f1:60,d:0.12,v:0.1*(0.6+MUS.intensity)}); }
    if(s%4===2){ A.noise({type:'highpass',f:6000,d:0.05,v:0.045*(0.6+MUS.intensity)}); }
  }
};
})();
