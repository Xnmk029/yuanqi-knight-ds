'use strict';
(()=>{
 const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg',token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
 let state,draft,selection=new Set(),pointer,pen=[],zoom=1,pan={x:0,y:0},writeQueue=Promise.resolve(),lastWrite=0,noticeTimer,replayCursor=null,replayEntries=[],lastTask='',lastDraft='',space=false;
 const items=new Map(),elements=new Map();
 $('home').href='/'+location.hash;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 function notice(message){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),5000);}
 async function fetchState(){const response=await fetch('/api/state',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('会话凭据已失效，请重新打开画室');accept(await response.json());}
 async function send(name,args={}){const delay=550-(Date.now()-lastWrite);if(delay>0)await new Promise(r=>setTimeout(r,delay));lastWrite=Date.now();const response=await fetch('/api/command',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name,args,id:crypto.randomUUID()})});const data=await response.json();if(!data.ok)throw Error(data.error?.message||data.error?.code||'操作失败');await fetchState();return data.result;}
 function command(name,args){const job=writeQueue.then(()=>send(name,args));writeQueue=job.catch(()=>{});return job;}
 function run(fn){return Promise.resolve().then(fn).catch(error=>notice(error.message));}
 const bind=(id,fn)=>$(id).addEventListener('click',()=>run(fn));
 const task=()=>state?.game?.task;
 const canDraw=()=>state?.connection?.connected&&(!state.game||task()?.kind==='draw'&&!task().submitted&&!task().paused);
 function accept(next){const wasDrawable=canDraw(),previous=draft;state=next;if(!pointer){draft=state.drawing;if(previous?.id!==draft?.id||previous?.revision!==draft?.revision||wasDrawable!==canDraw())renderArt();}renderGame();}
 function svgNode(tag,attrs={}){const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;}
 function build(node){items.set(node.key,node);const dom=svgNode(node.tag,node.attrs);dom.dataset.key=node.key;elements.set(node.key,dom);if(node.hidden)dom.setAttribute('display','none');for(const child of node.children)dom.append(build(child));return dom;}
 function renderArt(){items.clear();elements.clear();$('art').replaceChildren();$('overlay').replaceChildren();$('layers').replaceChildren();
  if(!draft||!canDraw()){selection.clear();$('draft-status').textContent=state?.game?'等待本人绘画阶段':'尚无本人草稿';$('canvas-note').textContent=state?.game?'按照左侧任务参与，其他人的未揭晓草稿不会出现在这里。':'新建草稿，开始画画。';return;}
  $('drawing').setAttribute('viewBox',draft.root.attrs.viewBox);$('drawing').setAttribute('preserveAspectRatio',draft.root.attrs.preserveAspectRatio||'xMidYMid meet');for(const key of ['fill','stroke','opacity','fill-opacity','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','fill-rule','vector-effect']){if(draft.root.attrs[key]===undefined)$('art').removeAttribute(key);else $('art').setAttribute(key,draft.root.attrs[key]);}for(const child of draft.root.children)$('art').append(build(child));
  for(const id of [...selection])if(!items.has(id))selection.delete(id);
  const layer=(node,depth=0)=>{if(['defs','linearGradient','radialGradient','stop'].includes(node.tag))return;const row=el('div');row.className='layer'+(selection.has(node.key)?' selected':'');for(let i=0;i<depth;i++){const spacer=el('span');spacer.className='depth';row.append(spacer);}
   const name=el('button',node.label||node.tag);name.className='name';name.onclick=e=>select(node.key,e.shiftKey);row.append(name);
   for(const[label,op]of [[node.hidden?'○':'●',{op:'meta',nodeId:node.key,hidden:!node.hidden}],[node.locked?'🔒':'◇',{op:'meta',nodeId:node.key,locked:!node.locked}]]){const b=el('button',label);b.onclick=()=>run(()=>patch([op]));row.append(b);}
   const up=el('button','↑');up.onclick=()=>run(()=>{const parent=findParent(node.key);return patch([{op:'move',nodeId:node.key,parentId:parent.key,index:Math.min(parent.children.length,parent.children.indexOf(node)+1)}]);});row.append(up);$('layers').append(row);for(const child of [...node.children].reverse())layer(child,depth+1);
  };for(const child of [...draft.root.children].reverse())layer(child);
  $('draft-status').textContent=`私有草稿 · v${draft.revision} · ${draft.stats.elements} 个元素 · 序号 ${draft.nextSeq}`;
  $('canvas-note').textContent='每次完整操作确认后保存。Agent 的流式笔画会自动出现在自己的画布。';$('undo').disabled=!draft.undoAvailable;$('redo').disabled=!draft.redoAvailable;renderSelection();
  const chosen=items.get([...selection][0]);if(chosen){$('object-name').value=chosen.label||'';$('opacity').value=chosen.attrs.opacity??1;$('path-data').value=chosen.tag==='path'?chosen.attrs.d:'';}
  lastDraft=draft.id;
 }
 function findParent(id,root=draft.root){if(root.children.some(child=>child.key===id))return root;for(const child of root.children){const found=findParent(id,child);if(found)return found;}return null;}
 function selectedTop(){return [...selection].filter(id=>{let parent=findParent(id);while(parent){if(selection.has(parent.key))return false;parent=findParent(parent.key);}return true;});}
 function select(id,multi=false){if(!multi)selection.clear();if(id){if(multi&&selection.has(id))selection.delete(id);else selection.add(id);}renderArt();}
 function renderSelection(){const overlay=$('overlay');overlay.replaceChildren();for(const id of selection){const dom=elements.get(id);if(!dom)continue;try{const box=dom.getBBox(),matrix=dom.getCTM(),base=$('drawing').getCTM().inverse().multiply(matrix);const rect=svgNode('rect',{x:box.x,y:box.y,width:Math.max(box.width,1),height:Math.max(box.height,1),fill:'none',stroke:'#5a9273','stroke-width':2,'stroke-dasharray':'5 4',transform:`matrix(${base.a} ${base.b} ${base.c} ${base.d} ${base.e} ${base.f})`,'pointer-events':'none'});overlay.append(rect);}catch{}}
  if($('tool').value==='node'&&selection.size===1){const id=[...selection][0],node=items.get(id);if(node?.tag==='path'){const info=pathHandles(node.attrs.d);for(const point of info.points){const matrix=$('drawing').getCTM().inverse().multiply(elements.get(id).getCTM());const dot=svgNode('circle',{cx:point.x,cy:point.y,r:5,fill:'#fff',stroke:'#416d63','stroke-width':2,transform:`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`});dot.dataset.handle=point.index;dot.dataset.key=id;overlay.append(dot);}}}
  $('selection-status').textContent=selection.size?`已选择 ${selection.size} 个对象 · Shift 多选`:'Shift 可多选 · 滚轮缩放 · 空格平移';
 }
 function pathHandles(d){const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[],points=[];let command='',index=0;
  while(index<tokens.length){if(/^[a-zA-Z]$/.test(tokens[index])){command=tokens[index++];if(!['M','L','C','Q','Z'].includes(command))return{tokens,points:[]};}
   if(command==='Z'){command='';continue;}if(!command||index+1>=tokens.length||/^[a-zA-Z]$/.test(tokens[index]))break;
   points.push({index,x:Number(tokens[index]),y:Number(tokens[index+1])});index+=2;
  }return{tokens,points};
 }
 async function patch(operations,base=draft){if(!base||!canDraw())throw Error('当前没有可编辑的本人绘画任务');return command('drawing.patch',{draftId:base.id,seq:base.nextSeq,baseRevision:base.revision,operations});}
 function rootArgs(extra={}){return{replace:true,...(task()?.kind==='draw'?{taskId:task().id,phaseId:task().phaseId}:{}),...extra};}
 function renderGame(){const game=state.game,t=task(),inRoom=state.connection.connected;
  $('connection').textContent=inRoom?`${state.connection.mode==='mock'?'本机演练':'Steam 联机'} · ${state.room?.members.length||0} 位同桌`:'本机服务已准备';$('create').hidden=inRoom;$('join').hidden=inRoom;$('join-invite').parentElement.hidden=inRoom;$('configure').hidden=!inRoom||!state.self.isHost||game&&!['lobby','complete','aborted'].includes(game.status);$('room-setup').hidden=!!game&&!['lobby','complete','aborted'].includes(game.status);
  $('game-title').textContent=game?({telephone:'图文传话',guess_draw:'你画我猜'}[game.mode]+(game.practice?' · 双人练习':'')):'自由茶绘';
  const phases={lobby:'等待准备',seed:'写最初的一句话',draw_private:'私下绘画',describe:'看图写一句话',word_select:'画手选词',review:'主持人审核',guess_window:'看图猜词',round_reveal:'本轮揭晓',complete:'全场结束',aborted:'已结束'};
  $('phase').textContent=game?phases[game.phase.type]||game.phase.type:'在本人区域内提交作品，经房主审核后上公共画布。';
  $('players').replaceChildren();for(const player of game?.players||state.room?.members||[]){const row=el('div'),name=el('span',player.name+(player.id===state.self.id?' · 我':'')),status=el('small',player.connected===false?'离线':player.ready?'已准备':'已入座');row.append(name,status);$('players').append(row);}
  $('ready').hidden=!game||game.status!=='lobby'||game.reviewPolicy==='moderator-strict'&&state.self.isHost;$('source-consent-label').hidden=$('ready').hidden;
  $('host-controls').hidden=!game||!state.self.isHost;$('start').hidden=game?.status!=='lobby';$('pause').hidden=!game||!['active','paused'].includes(game.status);$('pause').textContent=game?.status==='paused'?'继续':'暂停';$('advance').hidden=game?.status!=='active';$('abort').hidden=!game||!['lobby','active','paused'].includes(game.status);
  $('task-panel').hidden=!t;$('task-title').textContent=t?({seed:'写一句话',draw:'根据上文画图',describe:'只看图片，描述内容',guess:'猜出图里的词',select_word:'选一个词来画'}[t.kind]||t.kind):'我的任务';
  $('task-input').textContent=t?.input?.text||t?.input?.message|| (t?.submitted?'已交卷，等待下一阶段。':'');
  const img=t?.input?.image||game?.currentImage;$('task-image').hidden=!img;if(img)$('task-image').src='data:image/png;base64,'+img.png;else $('task-image').removeAttribute('src');
  $('choices').replaceChildren();for(const choice of t?.choices||[]){const button=el('button',choice.text);button.disabled=t.submitted||t.paused;button.onclick=()=>run(()=>command('game.submit',{taskId:t.id,phaseId:t.phaseId,choiceId:choice.id}));$('choices').append(button);}
  $('task-text').hidden=!t||!['seed','describe','guess'].includes(t.kind);$('task-text').maxLength=t?.kind==='guess'?40:80;$('task-text').placeholder=t?.kind==='guess'?'输入你的猜测…':'用一句话描述…';
  $('submit-task').hidden=!t||t.kind==='select_word';$('submit-task').disabled=!t||t.submitted||t.paused;$('submit-task').textContent=t?.kind==='guess'?'提交猜测':t?.kind==='draw'?'交这份草稿':'交卷';if(t?.id!==lastTask){$('task-text').value='';pen=[];lastTask=t?.id||'';}
  $('review-panel').hidden=!(game?.reviewQueue?.length);$('reviews').replaceChildren();for(const item of game?.reviewQueue||[]){const card=el('div'),image=el('img');image.src='data:image/png;base64,'+item.image.png;image.alt='待审核的绘画';card.append(image);for(const[title,decision]of [['批准','approve'],['退回','reject']]){const b=el('button',title);b.onclick=()=>run(()=>command('game.review',{submissionId:item.submissionId,hash:item.hash,decision}));card.append(b);}$('reviews').append(card);}
  $('scores').replaceChildren();for(const[id,score]of Object.entries(game?.scores||{})){const name=game.players.find(p=>p.id===id)?.name||id;$('scores').append(el('p',`${name} · ${Number(score.total).toFixed(2)} 分`));}
  if(game?.revealedRound)$('scores').prepend(el('p','本轮答案：'+(game.revealedRound.answer||'本轮无效')));
  $('replay').disabled=!game?.canReplay;$('new-draft').disabled=!canDraw();$('publish').hidden=!!game;$('publish').disabled=!draft||!inRoom;$('export').disabled=!draft||!canDraw();$('invite').disabled=!state.invite;updateTimer();
 }
 function updateTimer(){const deadline=state?.game?.phase.deadlineAt;$('timer').textContent=state?.game?.status==='paused'?'游戏已暂停':deadline&&state.game.status==='active'?`剩余 ${Math.max(0,Math.ceil((deadline-Date.now())/1000))} 秒`:'';}
 setInterval(updateTimer,1000);
 bind('create',()=>command('room.create',{name:'AI 茶绘',maxMembers:Number($('capacity').value),gameMode:$('mode').value,reviewPolicy:$('review-policy').value}));
 bind('join',()=>command('room.join',{invite:$('join-invite').value.trim()}));
 bind('configure',()=>command('game.create',{mode:$('mode').value,reviewPolicy:$('review-policy').value}));
 bind('ready',()=>command('game.ready',{ready:!state.game.players.find(p=>p.id===state.self.id)?.ready,shareSourceAfterReveal:$('source-consent').checked,controlMode:'assisted'}));
 bind('start',()=>command('game.start',{}));bind('advance',()=>command('game.advance',{phaseId:state.game.phase.id}));bind('pause',()=>command('game.pause',{paused:state.game.status!=='paused'}));bind('abort',()=>command('game.abort',{}));
 bind('submit-task',()=>{const t=task(),args={taskId:t.id,phaseId:t.phaseId};if(t.kind==='draw'){if(!draft)throw Error('先新建或导入一份草稿');Object.assign(args,{draftId:draft.id,revision:draft.revision});}else if(t.kind==='guess')return command('game.guess',{...args,checkpointId:t.checkpointId,guess:$('task-text').value});else args.text=$('task-text').value;return command('game.submit',args);});
 bind('new-draft',()=>command('drawing.open',rootArgs()));bind('continue-draft',()=>command('drawing.open',rootArgs({reuse:true})));
 $('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file)return;if(file.size>262144)throw Error('SVG最多256KiB');await command('drawing.open',rootArgs({svg:await file.text()}));$('import').value='';});
 bind('publish',()=>command('drawing.publish',{draftId:draft.id,baseRevision:draft.revision,name:'我的茶绘作品'}));
 bind('undo',()=>command('drawing.undo',{draftId:draft.id,baseRevision:draft.revision}));bind('redo',()=>command('drawing.redo',{draftId:draft.id,baseRevision:draft.revision}));
 function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 bind('export',async()=>{const result=await command('drawing.export',{draftId:draft.id});download('tea-drawing.svg',result.svg,'image/svg+xml');download('tea-drawing-operations.json',JSON.stringify(result.stream,null,2));});
 bind('invite',async()=>{await navigator.clipboard.writeText('请使用 AI 茶绘加入这个房间：'+state.invite);notice('邀请已复制，可交给朋友的 Agent。');});
 $('review-policy').onchange=()=>{$('policy-help').textContent=$('review-policy').value==='moderator-strict'?'中立房主不参赛。传话至少另有3位玩家，猜画至少另有2位。':'适合熟人。房主参赛，每人确认自己提交的内容；双人传话是练习。';};
 async function loadReplay(reset){if(reset){replayEntries=[];replayCursor=null;$('replay-list').replaceChildren();}const result=await command('game.replay',{...(replayCursor?{cursor:replayCursor}:{}),limit:4});replayEntries.push(...result.entries);replayCursor=result.nextCursor;
  for(const item of result.entries){const card=el('div');card.append(el('p',item.text|| (item.round?'答案：'+item.round.answer:`第 ${item.position+1} 跳 · ${item.status}`)));if(item.image){const image=el('img');image.src='data:image/png;base64,'+item.image.png;image.alt='已揭晓作品';card.append(image);}$('replay-list').append(card);}$('replay-next').hidden=!replayCursor;$('save-replay').hidden=false;
 }
 bind('replay',()=>loadReplay(true));bind('replay-next',()=>loadReplay(false));bind('save-replay',()=>download('tea-replay.json',JSON.stringify({gameId:state.game.id,entries:replayEntries,remainingCursor:replayCursor},null,2)));
 bind('share-technique',()=>command('technique.share',{draftId:draft.id,consent:$('technique-consent').checked,name:$('technique-name').value||'我的SVG手法'}));
 bind('context',async()=>{const result=await command('agent.context',{});$('context-output').textContent=JSON.stringify(result,(key,value)=>key==='png'?'[图片]':value,2);});
 function applySelection(operation){const ids=selectedTop();if(!ids.length)throw Error('请先选择对象');return patch(ids.map(id=>operation(id)));}
 bind('delete',()=>applySelection(id=>({op:'remove',nodeId:id})));bind('duplicate',()=>applySelection(id=>({op:'duplicate',nodeId:id,transform:'translate(16 16) '+(items.get(id).attrs.transform||'')})));
 bind('style',()=>applySelection(id=>({op:'set',nodeId:id,attrs:{stroke:$('stroke').value,fill:$('fill-enabled').checked?$('fill').value:'none','stroke-width':Number($('size').value)}})));
 $('opacity').onchange=()=>run(()=>applySelection(id=>({op:'set',nodeId:id,attrs:{opacity:Number($('opacity').value)}})));
 $('object-name').onchange=()=>run(()=>applySelection(id=>({op:'meta',nodeId:id,label:$('object-name').value})));
 bind('transform',()=>applySelection(id=>({op:'set',nodeId:id,attrs:{transform:`translate(${Number($('move-x').value)} ${Number($('move-y').value)}) rotate(${Number($('rotation').value)}) scale(${Number($('scale').value)}) `+(items.get(id).attrs.transform||'')}})));
 bind('apply-path',()=>{const id=[...selection][0];if(items.get(id)?.tag!=='path')throw Error('请选择路径');return patch([{op:'set',nodeId:id,attrs:{d:$('path-data').value}}]);});
 bind('group',()=>{const ids=selectedTop();if(!ids.length)throw Error('请先选择对象');const parent=findParent(ids[0]);if(ids.some(id=>findParent(id)!==parent))throw Error('请选同一图层中的对象');const id=crypto.randomUUID();return patch([{op:'add',nodeId:id,parentId:parent.key===draft.root.key?undefined:parent.key,tag:'g',attrs:{}},...ids.map((nodeId,index)=>({op:'move',nodeId,parentId:id,index}))]);});
 bind('ungroup',()=>{const id=[...selection][0],node=items.get(id),parent=findParent(id);if(node?.tag!=='g')throw Error('请选择一个编组');if(node.attrs.opacity!==undefined&&Number(node.attrs.opacity)!==1)throw Error('整体透明度会影响叠色，请先将编组透明度调至100%再解组');const inherited=Object.fromEntries(Object.entries(node.attrs).filter(([key])=>!['id','opacity','transform'].includes(key)));return patch([...node.children.flatMap(child=>[{op:'set',nodeId:child.key,attrs:{...inherited,...child.attrs,transform:(node.attrs.transform||'')+' '+(child.attrs.transform||'')}},...(node.hidden?[{op:'meta',nodeId:child.key,hidden:true}]:[])]),...node.children.map((child,index)=>({op:'move',nodeId:child.key,parentId:parent.key,index:parent.children.indexOf(node)+index})),{op:'remove',nodeId:id}]);});
 async function align(axis){const ids=selectedTop();if(ids.length<2)throw Error('至少选择两个同层对象');const parent=findParent(ids[0]);if(ids.some(id=>findParent(id)!==parent))throw Error('对齐需要同层对象');const boxes=ids.map(id=>{const dom=elements.get(id),b=dom.getBBox(),m=dom.parentNode.getCTM().inverse().multiply(dom.getCTM()),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));return{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y))};}),target=Math.min(...boxes.map(b=>b[axis]));return patch(ids.map((id,i)=>({op:'set',nodeId:id,attrs:{transform:`translate(${axis==='x'?target-boxes[i].x:0} ${axis==='y'?target-boxes[i].y:0}) `+(items.get(id).attrs.transform||'')}})));}
 bind('align-left',()=>align('x'));bind('align-top',()=>align('y'));
 function moveDelta(event,gesture,id){const matrix=gesture.parentMatrices.get(id),start=new DOMPoint(gesture.clientStart.x,gesture.clientStart.y).matrixTransform(matrix),end=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);return{x:end.x-start.x,y:end.y-start.y};}
 function point(event){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform($('drawing').getScreenCTM().inverse());return{x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10};}
 function hit(event){let node=event.target;while(node&&node!==$('drawing')){if(node.dataset.key)return node.dataset.key;node=node.parentElement;}return null;}
 function attributes(){return{fill:$('fill-enabled').checked?$('fill').value:'none',stroke:$('stroke').value,'stroke-width':Number($('size').value),'stroke-linecap':'round','stroke-linejoin':'round'};}
 function shape(tool,a,b,shift){let dx=b.x-a.x,dy=b.y-a.y;if(shift&&['rect','ellipse'].includes(tool)){const side=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*side;dy=Math.sign(dy||1)*side;}if(shift&&tool==='line'){if(Math.abs(dx)>Math.abs(dy)*2)dy=0;else if(Math.abs(dy)>Math.abs(dx)*2)dx=0;else dy=Math.sign(dy)*Math.abs(dx);}const x=Math.min(a.x,a.x+dx),y=Math.min(a.y,a.y+dy),w=Math.max(1,Math.abs(dx)),h=Math.max(1,Math.abs(dy));return tool==='rect'?{tag:'rect',attrs:{x,y,width:w,height:h}}:tool==='ellipse'?{tag:'ellipse',attrs:{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}}:{tag:'line',attrs:{x1:a.x,y1:a.y,x2:a.x+dx,y2:a.y+dy}};}
 function viewTransform(){$('drawing').style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;}
 $('viewport').onwheel=event=>{event.preventDefault();zoom=Math.max(.2,Math.min(4,zoom*(event.deltaY<0?1.1:.9)));viewTransform();};bind('fit',()=>{zoom=1;pan={x:0,y:0};viewTransform();});$('tool').onchange=()=>{pen=[];renderSelection();};
 $('drawing').onpointerdown=event=>{if(event.button!==0)return;const p=point(event),tool=space?'pan':$('tool').value,id=hit(event);if(tool==='pan'){pointer={tool,client:{x:event.clientX,y:event.clientY},pan:{...pan}};}
  else{if(!draft||!canDraw())return;if(tool==='picker'){const node=items.get(id);if(node){const color=node.attrs.fill&&node.attrs.fill!=='none'?node.attrs.fill:node.attrs.stroke;if(/^#[0-9a-f]{6}$/i.test(color||'')){$('stroke').value=color;$('fill').value=color;}}return;}
   if(tool==='erase'){if(id)run(()=>patch([{op:'remove',nodeId:id}]));return;}
   if(tool==='pen'){if(pen.length&&Math.hypot(p.x-pen.at(-1).x,p.y-pen.at(-1).y)<1)return;pen.push(p);$('overlay').replaceChildren(svgNode('polyline',{points:pen.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:$('stroke').value,'stroke-width':Number($('size').value)}));return;}
   if(tool==='select'||tool==='node'){if(id&&(event.shiftKey||!selection.has(id)))select(id,event.shiftKey);else if(!id&&!event.shiftKey)select(null);if(!id)return;const item=items.get(id);if(item?.locked)return;pointer={tool:event.target.dataset.handle!==undefined?'handle':'move',id,handle:Number(event.target.dataset.handle),start:p,base:draft,transforms:new Map(selectedTop().map(key=>[key,items.get(key).attrs.transform||''])),parentMatrices:new Map(selectedTop().map(key=>[key,elements.get(key).parentNode.getScreenCTM().inverse()])),clientStart:{x:event.clientX,y:event.clientY}};}
   else{const preview=svgNode('path',attributes());$('overlay').replaceChildren(preview);pointer={tool,start:p,points:[p],preview,base:draft};}
  }$('drawing').setPointerCapture(event.pointerId);};
 $('drawing').onpointermove=event=>{const p=point(event);$('coordinates').textContent=`${p.x}, ${p.y}`;if(!pointer)return;
  if(pointer.tool==='pan'){pan={x:pointer.pan.x+event.clientX-pointer.client.x,y:pointer.pan.y+event.clientY-pointer.client.y};viewTransform();return;}
  if(pointer.tool==='move'){for(const[id,transform]of pointer.transforms){const delta=moveDelta(event,pointer,id);elements.get(id)?.setAttribute('transform',`translate(${delta.x} ${delta.y}) `+transform);}return;}
  if(pointer.tool==='handle'){const node=items.get(pointer.id),info=pathHandles(node.attrs.d);const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(elements.get(pointer.id).getScreenCTM().inverse());info.tokens[pointer.handle]=String(Math.round(local.x*10)/10);info.tokens[pointer.handle+1]=String(Math.round(local.y*10)/10);pointer.d=info.tokens.join(' ');elements.get(pointer.id).setAttribute('d',pointer.d);return;}
  if(pointer.tool==='brush'){const old=pointer.points.at(-1);if(Math.hypot(p.x-old.x,p.y-old.y)>1&&pointer.points.length<3000)pointer.points.push(p);pointer.preview.setAttribute('d',pointer.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' '));}
  else{const s=shape(pointer.tool,pointer.start,p,event.shiftKey);const dom=svgNode(s.tag,{...attributes(),...s.attrs});$('overlay').replaceChildren(dom);pointer.preview=dom;}
 };
 $('drawing').onpointerup=event=>{if(!pointer)return;const done=pointer,p=point(event);pointer=null;try{$('drawing').releasePointerCapture(event.pointerId);}catch{}if(done.tool==='pan')return;
  let ops=[];if(done.tool==='move'){if(Math.hypot(p.x-done.start.x,p.y-done.start.y)>1)ops=[...done.transforms].map(([id,transform])=>{const delta=moveDelta(event,done,id);return{op:'set',nodeId:id,attrs:{transform:`translate(${delta.x} ${delta.y}) `+transform}};});}
  else if(done.tool==='handle'){if(done.d)ops=[{op:'set',nodeId:done.id,attrs:{d:done.d}}];}
  else if(done.tool==='brush'){if(done.points.length===1)done.points.push({x:p.x+.1,y:p.y+.1});ops=[{op:'add',nodeId:crypto.randomUUID(),tag:'path',attrs:{...attributes(),d:done.points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')}}];}
  else{const s=shape(done.tool,done.start,p,event.shiftKey);ops=[{op:'add',nodeId:crypto.randomUUID(),tag:s.tag,attrs:{...attributes(),...s.attrs}}];}
  if(ops.length)run(async()=>{try{await patch(ops,done.base);}finally{draft=state.drawing;renderArt();}});else{draft=state.drawing;renderArt();}
 };
 $('drawing').onpointercancel=()=>{pointer=null;draft=state.drawing;renderArt();};
 async function commitPen(){if(pen.length<2)return;const points=pen;pen=[];let d=`M${points[0].x} ${points[0].y}`;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],before=points[Math.max(0,i-2)],after=points[Math.min(points.length-1,i+1)];d+=` C${a.x+(b.x-before.x)/6} ${a.y+(b.y-before.y)/6} ${b.x-(after.x-a.x)/6} ${b.y-(after.y-a.y)/6} ${b.x} ${b.y}`;}await patch([{op:'add',nodeId:crypto.randomUUID(),tag:'path',attrs:{...attributes(),d}}]);}
 $('drawing').ondblclick=()=>{if($('tool').value==='pen')run(commitPen);};
 document.onkeydown=event=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if(event.code==='Space'){space=true;event.preventDefault();}if(event.key==='Escape'){pen=[];selection.clear();renderArt();}if(event.key==='Enter'&&pen.length)run(commitPen);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}if(event.key==='Delete')$('delete').click();const tools={b:'brush',v:'select',p:'pen',a:'node',r:'rect',o:'ellipse',l:'line',e:'erase',i:'picker',h:'pan'};if(tools[event.key.toLowerCase()]&&!event.ctrlKey){$('tool').value=tools[event.key.toLowerCase()];renderSelection();}};document.onkeyup=event=>{if(event.code==='Space')space=false;};
 function connect(){const ws=new WebSocket(location.origin.replace('http','ws')+'/events?token='+encodeURIComponent(token));ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.type==='state')accept(message.state);};ws.onclose=()=>{notice('连接中断，正在恢复本机会话…');setTimeout(connect,1500);};ws.onerror=()=>{};}
 run(fetchState).then(connect);
})();
