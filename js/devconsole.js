/* 元气骑士·深渊回响 —— 开发控制台（游戏内查看日志）
   用法：按 `（反引号）或 ~ 键打开/关闭；主菜单/暂停菜单也有入口。
   拦截 console.log/warn/error/info/debug，游戏内主动记录用 G.DevConsole.log(level, ...args)。 */
(function(){
var G = window.G || (window.G = {});
var D = {};
G.DevConsole = D;

D.logs = [];
D.maxLogs = 500;
D.visible = false;
D.filter = 'all';   /* all | info | warn | error */
D.onToggle = null;

/* ---------- 消息格式化 ---------- */
function fmt(args){
  var out = [];
  for(var i=0;i<args.length;i++){
    var a = args[i];
    if(typeof a === 'string') out.push(a);
    else if(a instanceof Error) out.push(a.message + (a.stack ? '\n' + a.stack : ''));
    else if(a && typeof a === 'object'){
      try{ out.push(JSON.stringify(a)); }catch(e){ out.push(String(a)); }
    }
    else out.push(String(a));
  }
  return out.join(' ');
}

/* ---------- 记录 ---------- */
D.log = function(level, msg){
  var entry = { t: new Date().toLocaleTimeString(), level: level, msg: String(msg) };
  D.logs.push(entry);
  if(D.logs.length > D.maxLogs) D.logs.shift();
  if(D.visible) D.render();
  return entry;
};

/* ---------- 拦截 console ---------- */
D._orig = {};
D.init = function(){
  if(D._inited) return;
  D._inited = true;
  var levels = { log:'info', info:'info', warn:'warn', error:'error', debug:'debug' };
  for(var k in levels){
    (function(k, lv){
      var orig = console[k] ? console[k].bind(console) : function(){};
      D._orig[k] = orig;
      console[k] = function(){
        try{ orig.apply(null, arguments); }catch(e){}
        D.log(lv, fmt(arguments));
      };
    })(k, levels[k]);
  }
  D.log('info', '开发控制台已就绪（按 ` 或 ~ 打开）');
};

/* ---------- 面板 ---------- */
D.toggle = function(){
  D.visible = !D.visible;
  var el = document.getElementById('devconsole');
  if(el) el.style.display = D.visible ? 'flex' : 'none';
  if(D.visible) D.render();
  if(D.onToggle) D.onToggle(D.visible);
  return D.visible;
};
D.open = function(){ if(!D.visible) D.toggle(); };
D.close = function(){ if(D.visible) D.toggle(); };

D.clear = function(){
  D.logs = [];
  D.render();
};
D.setFilter = function(f){
  D.filter = f;
  var btns = document.querySelectorAll('#devconsole .dc-filter');
  for(var i=0;i<btns.length;i++){
    btns[i].className = 'dc-filter' + (btns[i].getAttribute('data-f')===f ? ' on' : '');
  }
  D.render();
};

D.render = function(){
  var box = document.getElementById('dc-logs');
  if(!box) return;
  box.innerHTML = '';
  var shown = 0;
  for(var i=0;i<D.logs.length;i++){
    var e = D.logs[i];
    if(D.filter!=='all' && e.level!==D.filter) continue;
    var div = document.createElement('div');
    div.className = 'dc-line dc-' + e.level;
    var t = document.createElement('span');
    t.className = 'dc-time';
    t.textContent = e.t;
    div.appendChild(t);
    var m = document.createElement('span');
    m.className = 'dc-msg';
    m.textContent = e.msg;
    div.appendChild(m);
    box.appendChild(div);
    shown++;
    if(shown > 300) break;
  }
  if(!shown){
    var empty = document.createElement('div');
    empty.className = 'dc-line dc-info';
    empty.textContent = '（无日志）';
    box.appendChild(empty);
  }
  box.scrollTop = box.scrollHeight;
};
})();
