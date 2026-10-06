'use strict';
const {EventEmitter}=require('node:events');
const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const zlib=require('node:zlib');
const {RoomEngine,composeSvg,hash,fail,clone}=require('./engine');
const {Store}=require('./store');
const Games=require('./games');
const Editor=require('./editor');
const {renderPNG}=require('./raster');
const PROTOCOL=1, MAX_STATE=16*1024*1024, CHUNK=48*1024;
const UI_ONLY=new Set(['proposal.approve','proposal.reject','scene.hide','room.freeze','game.start','game.review','game.advance','game.pause','game.abort']);
class SessionService extends EventEmitter {
  constructor({transport,data,mode='steam',hub}) {
    super(); this.transport=transport; this.mode=mode;this.hub=hub;this.store=new Store(data,{maxBytes:64*1024*1024});this.saved=this.store.load();this.selfId=transport.info().selfId;this.name='画友';this.engine=null;this.remote=null;this.invite=null;this.lifecycle=null;this.pending=new Map();this.waiters=new Set();this.parts=new Map();this.rates=new Map();this.queuedTotal=0;this.queuedBy=new Map();this.serial=Promise.resolve();this.closed=false;this.syncPromise=null;this.syncAgain=false;this.stats={snapshotsReceived:0,repairs:0};
    transport.on('packet',packet=>this.receive(packet).catch(e=>this.fault(e)));
    transport.on('members',info=>{if(this.closed)return;if(this.isHost()){for(const member of this.engine.data.members){if(!info.members.includes(member.id))this.engine.disconnect(member.id);}this.sync().catch(e=>this.fault(e));}this.notify();});
    transport.on('closed',()=>{if(this.closed)return;this.remote=null;this.invite=null;this.notify();});
    transport.on('fault',e=>this.fault(e));
    this.timer=setInterval(()=>this.heartbeat().catch(e=>this.fault(e)),2000);
  }
  isHost(){return !!this.engine && this.transport.info().hostId===this.selfId;}
  fault(e){if(this.closed)return;this.lastError={code:e.code||e.message||'SESSION_ERROR',message:e.message||String(e)};this.notify();}
  notify(){if(!this.closed)this.emit('state');}
  view(admin=false){
    let state=this.engine ? this.engine.view(this.selfId,admin) : this.remote ? clone(this.remote) : this.saved?.game ? this.saved.members ? new RoomEngine({saved:this.saved}).view(this.selfId,admin) : clone(this.saved.safeView) : {room:null,scene:{width:4096,height:2304,revision:this.saved?.revision||0,objects:(this.saved?.objects||[]).map(({history,...o})=>o)},proposals:[],quota:{},events:this.saved?.events||[]};
    const info=this.transport.info();
    if(state.room)state.room.code=info.room;
    return {...state,self:{id:this.selfId,name:this.name,isHost:this.isHost()},invite:this.invite,connection:{mode:this.mode,...(this.mode==='mock'?{hub:this.hub}:{}),connected:!!info.room,syncing:!!this.lifecycle || !!info.room&&!state.room,lastError:this.lastError||null},sync:this.stats};
  }
  canvas(){const objects=this.view().scene.objects;return composeSvg({objects});}
  queue(fn){const next=this.serial.then(()=>{if(this.closed)fail('SESSION_CLOSED');return fn();});this.serial=next.catch(()=>{});return next;}
  runLifecycle(name,fn){
    if(this.lifecycle)fail('SESSION_BUSY','本机会话仍在处理开房、加入或离开，请读取状态并等待完成。');
    let cancel;const cancelled=new Promise((resolve,reject)=>{cancel=()=>reject(Object.assign(new Error('SESSION_CLOSED'),{code:'SESSION_CLOSED'}));});
    const operation={name,cancel};this.lifecycle=operation;this.lastError=null;this.notify();
    const queued=this.queue(async()=>{
      if(name!=='room.leave'&&(this.transport.info().room||this.engine||this.remote))fail('ALREADY_IN_ROOM','本机会话已经在房间中，请先明确离开当前房间。');
      return fn();
    });
    // HTTP timeouts do not cancel native Steam operations. Keep their reservation until settlement.
    return Promise.race([queued,cancelled]).then(result=>{
      if(this.lifecycle===operation)this.lifecycle=null;this.notify();return result;
    },error=>{
      if(this.lifecycle===operation)this.lifecycle=null;this.fault(error);throw error;
    });
  }
  throttle(id){const now=Date.now(),rate=this.rates.get(id)||{time:now,tokens:8};const tokens=Math.min(8,rate.tokens+(now-rate.time)/1000*2);if(tokens<1)fail('REQUEST_RATE_LIMIT','请求过快，请稍后重试');this.rates.set(id,{time:now,tokens:tokens-1});}
  async command(name,args={}, {admin=false,id=randomUUID()}={}){
    if(this.closed)fail('SESSION_CLOSED');
    if(UI_ONLY.has(name)&&!admin)fail('FORBIDDEN','审核管理仅限房主网页；Agent 只有绘图权限');
    if(this.lifecycle&&!['scene.read','room.rules','draft.validate'].includes(name))fail('SESSION_BUSY','本机会话仍在处理房间连接，请读取状态并等待完成。');
    if(name==='session.name'&&!this.transport.info().room){this.name=String(args.name||'画友').slice(0,80);this.notify();return{name:this.name};}
    if(name==='room.create')return this.runLifecycle(name,async()=>{
      const maxMembers=args.maxMembers??8;if(!Number.isInteger(maxMembers)||maxMembers<2||maxMembers>8)fail('INVALID_CAPACITY');
      if(!['strict','trusted'].includes(args.policy||'strict'))fail('INVALID_POLICY');
      const transport=this.transport;
      try{
        transport.maxMembers=maxMembers;const info=await transport.createRoom();if(this.closed)fail('SESSION_CLOSED');this.selfId=info.selfId;this.remote=null;
        this.engine=new RoomEngine({hostId:this.selfId,maxMembers,policy:args.policy||'strict',name:args.name});this.engine.member(this.selfId).name=this.name;
        if(args.gameMode&&args.gameMode!=='free_draw')this.engine.execute(this.selfId,'game.create',{mode:args.gameMode,reviewPolicy:args.reviewPolicy||'moderator-strict'}, {admin:false});
        this.secret=randomBytes(24).toString('base64url');this.expiresAt=Date.now()+24*60*60*1000;
        this.invite=encodeInvite({v:PROTOCOL,project:'ai-tea-draw-v1',room:info.room,hostId:info.hostId,secret:this.secret,expiresAt:this.expiresAt,mode:this.mode,...(this.mode==='mock'?{hub:this.hub}:{})});
        this.persist();this.notify();return{...info,invite:this.invite,epoch:this.engine.data.epoch};
      }catch(error){try{await transport.leave();}catch{}this.engine=null;this.remote=null;this.invite=null;throw error;}
    });
    if(name==='room.join')return this.runLifecycle(name,async()=>{
      const invite=decodeInvite(args.invite);if(invite.mode!==this.mode)fail('TRANSPORT_MISMATCH');if(this.mode==='mock'&&invite.hub!==this.hub)fail('MOCK_HUB_MISMATCH');
      const transport=this.transport;this.engine=null;this.remote=null;this.invite=null;this.name=String(args.name||'画友').slice(0,80);
      try{
        const info=await transport.joinRoom(invite.room);if(this.closed)fail('SESSION_CLOSED');this.selfId=info.selfId;
        if(info.hostId!==invite.hostId)fail('HOST_ID_MISMATCH');
        await this.request({kind:'hello',secret:invite.secret,name:this.name,version:PROTOCOL,feature:'tea-games-v1'});await this.waitForState(0);if(this.closed)fail('SESSION_CLOSED');this.notify();return{status:'joined',room:info.room};
      }catch(error){try{await transport.leave();}catch{}this.remote=null;this.invite=null;throw error;}
    });
    if(name==='room.leave')return this.runLifecycle(name,async()=>{if(this.engine)this.saved=clone(this.engine.data);await this.transport.leave();if(this.closed)fail('SESSION_CLOSED');this.engine=null;this.remote=null;this.invite=null;this.notify();return{status:'left'};});
    if(name==='scene.read'||name==='room.rules')return this.view(admin);
    if(name==='scene.export'&&!this.transport.info().room){if(this.saved?.game)fail('NO_ROOM','游戏回放请在房间结束后读取；离线存档不通过此接口暴露原始任务。');return{svg:this.canvas(),project:this.saved?{...this.saved,drafts:{},techniques:[],dedup:[],rates:{},proposals:[]}:null};}
    if(name==='draft.validate'){const {sanitizeSvg}=require('./svg');return sanitizeSvg(args.svg);}
    if(!this.transport.info().room)fail('NO_ROOM','请先创建或加入房间');
    this.throttle(this.selfId);
    if(this.isHost())return this.queue(async()=>{const options=await this.prepare(this.selfId,name,args,{admin,id});const result=this.execute(this.selfId,name,args,options);await this.sync();return result;});
    const answer=await this.request({kind:'command',name,args,id});await this.waitForState(answer.revision);return answer.result;
  }
  async prepare(actor,name,args,options){
    this.engine.requireMember(actor);
    if(Object.hasOwn(args,'asset')||Object.hasOwn(args,'__asset'))fail('INVALID_ARGUMENT');
    let svg,task;
    if(name==='game.submit'){
      if(Games.findSubmitReceipt(this.engine.data.game,actor,args,this.engine.gameContext(options.admin)))return options;
      task=Games.getTask(this.engine.data.game,actor,this.engine.gameContext(options.admin));
      if(!task||args.taskId!==task.id||args.phaseId!==task.phaseId)fail('STALE_TASK');
      if(task.paused||task.submitted||task.deadlineAt<=Date.now())fail('PHASE_CLOSED');
      if(task.kind==='draw'){
        if(args.draftId){const draft=this.engine.requireDraft(actor,args);if(args.revision!==draft.revision)fail('STALE_DRAFT');svg=Editor.compile(draft).svg;}
        else svg=args.svg;
        if(typeof svg!=='string')fail('SVG_REQUIRED');
      }
    }else if(name==='drawing.preview')svg=Editor.compile(this.engine.requireDraft(actor,args)).svg;
    if(svg){const asset=await renderPNG(svg);return{...options,asset:{...asset,...(task?{taskId:task.id,phaseId:task.phaseId,revision:args.revision}:{})}};}
    return options;
  }
  execute(actor,name,args,options){
    const before=clone(this.engine.data);
    try {const result=this.engine.execute(actor,name,args,options);if(JSON.stringify(before)!==JSON.stringify(this.engine.data))this.persist();this.notify();return result;}
    catch(e){this.engine.data=before;throw e;}
  }
  persist(){if(Buffer.byteLength(JSON.stringify(this.engine.view(this.selfId,true)))>MAX_STATE-16384)fail('STATE_LIMIT','画布及待审内容超过同步预算');this.store.save(this.engine.data);this.saved=clone(this.engine.data);}
  async send(to,data){
    const body=Buffer.from(JSON.stringify(data));
    if(data.kind==='reply'&&body.length>60*1024){if(body.length>MAX_STATE)fail('REPLY_BUDGET');const packed=zlib.deflateRawSync(body).toString('base64'),total=Math.ceil(packed.length/CHUNK),transferId=randomUUID();for(let index=0;index<total;index++)await this.transport.send(to,{tea:PROTOCOL,kind:'reply-chunk',requestId:data.requestId,transferId,index,total,hash:hash(body.toString()),chunk:packed.slice(index*CHUNK,(index+1)*CHUNK)});return;}
    await this.transport.send(to,{tea:PROTOCOL,...data});
  }
  request(data){
    const requestId=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(requestId);reject(Object.assign(new Error('房主响应超时，请重新查询状态'),{code:'HOST_TIMEOUT'}));},12000);this.pending.set(requestId,{resolve,reject,timer});this.send(this.transport.info().hostId,{...data,requestId}).catch(e=>{clearTimeout(timer);this.pending.delete(requestId);reject(e);});});
  }
  async receive({from,data}){
    if(this.closed)return;
    if(!data||data.tea!==PROTOCOL||typeof data.kind!=='string')return;
    if(this.isHost()) {
      if(data.kind==='repair'){if(this.engine.member(from)?.connected){this.stats.repairs++;await this.sendState(from);}return;}
      if(!['hello','command'].includes(data.kind)||typeof data.requestId!=='string'||data.requestId.length>100)return;
      try{this.throttle(from);if(Buffer.byteLength(JSON.stringify(data))>600*1024||this.queuedTotal>=32||(this.queuedBy.get(from)||0)>=4)fail('QUEUE_LIMIT');}catch(e){await this.send(from,{kind:'reply',requestId:data.requestId,error:{code:e.code,message:e.message}});return;}
      this.queuedTotal++;this.queuedBy.set(from,(this.queuedBy.get(from)||0)+1);
      try{return await this.queue(async()=>{
        try{
          let result;
          if(data.kind==='hello'){
            if(data.version!==PROTOCOL||Date.now()>this.expiresAt||typeof data.secret!=='string'||!constantEqual(data.secret,this.secret))fail('INVITE_INVALID','邀请已失效或不匹配');
            if(this.engine.data.game&&data.feature!=='tea-games-v1')fail('UPDATE_REQUIRED','游戏房间需要 0.4 版客户端');
            const previous=clone(this.engine.data);try{this.engine.addMember(from,data.name);this.engine.event(from,'join',data.name);this.persist();}catch(e){this.engine.data=previous;throw e;}result={status:'joined'};
          }else{
            if(UI_ONLY.has(data.name)||['room.create','room.join','room.leave'].includes(data.name))fail('FORBIDDEN');
            const options=await this.prepare(from,data.name,data.args||{},{admin:false,id:data.id});result=this.execute(from,data.name,data.args,options);
          }
          await this.send(from,{kind:'reply',requestId:data.requestId,result:data.kind==='command'?{result,revision:this.engine.view(from,false).scene.revision}:result});
          await this.sync();
        }catch(e){await this.send(from,{kind:'reply',requestId:data.requestId,error:{code:e.code||'COMMAND_FAILED',message:e.message}});}
      });}finally{this.queuedTotal--;this.queuedBy.set(from,Math.max(0,(this.queuedBy.get(from)||1)-1));}
    }
    if(from!==this.transport.info().hostId)return;
    if(data.kind==='reply-chunk'){const reply=this.acceptReplyChunk(data);if(reply)await this.receive({from,data:{tea:PROTOCOL,...reply}});return;}
    if(data.kind==='reply'){
      const pending=this.pending.get(data.requestId);if(!pending)return;this.pending.delete(data.requestId);clearTimeout(pending.timer);if(data.error)pending.reject(Object.assign(new Error(data.error.message),{code:data.error.code}));else pending.resolve(data.result);
    }else if(data.kind==='state-chunk')this.acceptChunk(data);
    else if(data.kind==='head'&&this.remote&&data.digest!==stateDigest(this.remote)){this.stats.repairs++;await this.send(from,{kind:'repair'});}
  }
  async sync(){
    if(!this.isHost()||this.closed)return;
    this.syncAgain=true;if(this.syncPromise)return this.syncPromise;
    this.syncPromise=(async()=>{while(this.syncAgain&&!this.closed){this.syncAgain=false;const info=this.transport.info();for(const member of this.engine.data.members){if(member.id!==this.selfId&&member.connected&&info.members.includes(member.id))await this.sendState(member.id);}this.notify();}})();
    try{await this.syncPromise;}finally{this.syncPromise=null;}
  }
  acceptReplyChunk(data){
    if(!this.pending.has(data.requestId)||typeof data.transferId!=='string'||data.transferId.length>100||!Number.isInteger(data.total)||data.total<1||data.total>512||!Number.isInteger(data.index)||data.index<0||data.index>=data.total||typeof data.chunk!=='string'||data.chunk.length>CHUNK||!/^[A-Za-z0-9+/=]*$/.test(data.chunk))return;
    const key='reply:'+data.transferId,now=Date.now();for(const[id,part]of this.parts)if(part.expires<now)this.parts.delete(id);let part=this.parts.get(key);
    if(!part){if(this.parts.size>=3)return;part={requestId:data.requestId,total:data.total,hash:data.hash,chunks:new Map(),bytes:0,expires:now+10000};this.parts.set(key,part);}
    if(part.requestId!==data.requestId||part.total!==data.total||part.hash!==data.hash)return;
    if(!part.chunks.has(data.index)){part.chunks.set(data.index,data.chunk);part.bytes+=data.chunk.length;}
    if(part.bytes>MAX_STATE*1.4){this.parts.delete(key);return;}if(part.chunks.size!==part.total)return;this.parts.delete(key);
    const raw=zlib.inflateRawSync(Buffer.from(Array.from({length:part.total},(_,i)=>part.chunks.get(i)).join(''),'base64'),{maxOutputLength:MAX_STATE});if(hash(raw.toString())!==part.hash)fail('REPLY_HASH_MISMATCH');const reply=JSON.parse(raw);if(reply.kind!=='reply'||reply.requestId!==part.requestId)fail('REPLY_SCHEMA');return reply;
  }
  async sendState(to){
    const view=this.engine.view(to,false), body=Buffer.from(JSON.stringify(view));if(body.length>MAX_STATE)fail('STATE_LIMIT');
    const zipped=zlib.deflateRawSync(body), encoded=zipped.toString('base64'), total=Math.ceil(encoded.length/CHUNK), transferId=randomUUID();
    for(let index=0;index<total;index++)await this.send(to,{kind:'state-chunk',transferId,index,total,hash:hash(body.toString()),epoch:this.engine.data.epoch,revision:view.scene.revision,chunk:encoded.slice(index*CHUNK,(index+1)*CHUNK)});
  }
  acceptChunk(data){
    if(this.closed)return;
    const now=Date.now();for(const [id,part]of this.parts)if(part.expires<now)this.parts.delete(id);
    if(typeof data.transferId!=='string'||data.transferId.length>100||!Number.isInteger(data.total)||data.total<1||data.total>512||!Number.isInteger(data.index)||data.index<0||data.index>=data.total||typeof data.chunk!=='string'||data.chunk.length>CHUNK||!/^[A-Za-z0-9+/=]*$/.test(data.chunk))return;
    let part=this.parts.get(data.transferId);if(!part){if(this.parts.size>=3)return;part={total:data.total,hash:data.hash,epoch:data.epoch,revision:data.revision,chunks:new Map(),bytes:0,expires:now+10000};this.parts.set(data.transferId,part);}
    if(part.total!==data.total||part.hash!==data.hash||part.epoch!==data.epoch||part.revision!==data.revision)return;
    if(!part.chunks.has(data.index)){part.chunks.set(data.index,data.chunk);part.bytes+=data.chunk.length;}
    if(part.bytes>MAX_STATE*1.4){this.parts.delete(data.transferId);return;}
    if(part.chunks.size!==part.total)return;this.parts.delete(data.transferId);
    const raw=zlib.inflateRawSync(Buffer.from(Array.from({length:part.total},(_,i)=>part.chunks.get(i)).join(''),'base64'),{maxOutputLength:MAX_STATE});
    if(hash(raw.toString())!==part.hash)fail('SNAPSHOT_HASH_MISMATCH');
    const state=JSON.parse(raw.toString());
    if(!state.room||state.room.epoch!==part.epoch||state.scene.revision!==part.revision||state.room.hostId!==this.transport.info().hostId)fail('SNAPSHOT_SCHEMA');
    if(this.remote&&this.remote.room.epoch===part.epoch&&this.remote.scene.revision>part.revision)return;
    // Recheck canonical assets before a remote host can reach the browser renderer.
    const {sanitizeSvg}=require('./svg');
    const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(value);
    if(!Number.isSafeInteger(state.scene.revision)||state.scene.revision<0||!Array.isArray(state.room.members)||state.room.members.length>8||!Array.isArray(state.events)||state.events.length>100||!['strict','trusted'].includes(state.room.policy)||typeof state.room.name!=='string'||state.room.name.length>80)fail('SNAPSHOT_SCHEMA');
    for(const member of state.room.members)if(!identifier(member.id)||typeof member.name!=='string'||member.name.length>80)fail('SNAPSHOT_SCHEMA');
    if(!Array.isArray(state.scene.objects)||state.scene.objects.length>512||!Array.isArray(state.proposals)||state.proposals.length>500)fail('SNAPSHOT_SCHEMA');
    let elements=0,bytes=0,paths=0;
    for(const object of [...state.scene.objects,...state.proposals.filter(p=>p.svg)]){const asset=sanitizeSvg(object.svg);if(asset.svg!==object.svg)fail('SNAPSHOT_NOT_CANONICAL');elements+=asset.stats.elements;bytes+=asset.stats.bytes;paths+=asset.stats.pathCommands;
      for(const key of ['x','y','width','height'])if(!Number.isFinite(object[key]))fail('SNAPSHOT_SCHEMA');
      if(object.width<=0||object.height<=0||object.width>4096||object.height>2304||!identifier(object.id)||!identifier(object.authorId)||typeof object.name!=='string'||object.name.length>80)fail('SNAPSHOT_SCHEMA');
      if(!object.region&&state.scene.objects.includes(object))fail('SNAPSHOT_SCHEMA');
      if(object.region){for(const key of ['x','y','width','height'])if(!Number.isFinite(object.region[key]))fail('SNAPSHOT_SCHEMA');const r=object.region;if(r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>4096||r.y+r.height>2304||object.x<r.x||object.y<r.y||object.x+object.width>r.x+r.width+.001||object.y+object.height>r.y+r.height+.001)fail('SNAPSHOT_SCHEMA');}
      if(state.scene.objects.includes(object)&&(!Number.isInteger(object.revision)||object.revision<1))fail('SNAPSHOT_SCHEMA');
    }
    if(elements>46000||bytes>MAX_STATE||paths>216000)fail('SNAPSHOT_BUDGET');
    validateExtras(state);
    this.remote=state;this.saved={schema:2,epoch:state.room.epoch,revision:state.scene.revision,objects:state.scene.objects,events:state.events,...(state.game?{game:true,safeView:state}:{})};this.store.save(this.saved);this.stats.snapshotsReceived++;this.notify();
  }
  waitForState(revision){
    if(this.closed)return Promise.reject(Object.assign(new Error('SESSION_CLOSED'),{code:'SESSION_CLOSED'}));
    if(this.remote&&this.remote.scene.revision>=revision)return Promise.resolve();
    return new Promise((resolve,reject)=>{const onState=()=>{if(this.remote&&this.remote.scene.revision>=revision){cleanup();resolve();}};const timer=setTimeout(()=>{cleanup();reject(Object.assign(new Error('SNAPSHOT_TIMEOUT'),{code:'SNAPSHOT_TIMEOUT'}));},12000);const waiter={cancel:()=>{cleanup();reject(Object.assign(new Error('SESSION_CLOSED'),{code:'SESSION_CLOSED'}));}};const cleanup=()=>{clearTimeout(timer);this.off('state',onState);this.waiters.delete(waiter);};this.waiters.add(waiter);this.on('state',onState);onState();});
  }
  async heartbeat(){
    if(!this.isHost()||this.closed)return;
    await this.queue(async()=>{if(this.engine?.data.game&&Games.tick(this.engine.data.game,this.engine.gameContext(true))){this.engine.event(this.selfId,'game','clock');this.persist();await this.sync();}});
    for(const member of this.engine.data.members)if(member.connected&&member.id!==this.selfId&&this.transport.info().members.includes(member.id)){const view=this.engine.view(member.id,false);await this.send(member.id,{kind:'head',revision:view.scene.revision,digest:stateDigest(view)});}
  }
  async close(){if(this.closePromise)return this.closePromise;const lifecycle=this.lifecycle;this.closed=true;lifecycle?.cancel();clearInterval(this.timer);for(const waiter of this.waiters)waiter.cancel();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(new Error('SESSION_CLOSED'),{code:'SESSION_CLOSED'}));}this.pending.clear();this.parts.clear();this.closePromise=(async()=>{if(!lifecycle)await this.serial;await this.transport.close();this.removeAllListeners();})();return this.closePromise;}
}
function constantEqual(a,b){const left=Buffer.from(a),right=Buffer.from(b||'');return left.length===right.length&&timingSafeEqual(left,right);}
function stateDigest(state){return hash({room:state.room,scene:state.scene,proposals:state.proposals,events:state.events,game:state.game,drawing:state.drawing});}
function validateExtras(state){
  let images=0;const visit=(value,depth=0)=>{if(depth>40)fail('SNAPSHOT_SCHEMA');if(!value||typeof value!=='object')return;
    if(typeof value.png==='string'){const bytes=Buffer.from(value.png,'base64');if(++images>12||bytes.length>2*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('SNAPSHOT_IMAGE');}
    if(typeof value.svg==='string'){const {sanitizeSvg}=require('./svg');if(sanitizeSvg(value.svg).svg!==value.svg)fail('SNAPSHOT_NOT_CANONICAL');}
    for(const child of Object.values(value))if(typeof child==='object')visit(child,depth+1);
  };visit(state.game);visit(state.drawing);
}
function encodeInvite(data){return 'tea://join/'+Buffer.from(JSON.stringify(data)).toString('base64url');}
function decodeInvite(invite){
  if(typeof invite!=='string'||invite.length>4096)fail('INVITE_INVALID');
  let value=invite.trim();if(/^https:\/\//.test(value)){const url=new URL(value);value=url.hash.slice(1);}
  value=value.replace(/^tea:\/\/join\//,'');if(!/^[A-Za-z0-9_-]+$/.test(value))fail('INVITE_INVALID');
  let data;try{data=JSON.parse(Buffer.from(value,'base64url'));}catch{fail('INVITE_INVALID');}
  if(data.v!==PROTOCOL||data.project!=='ai-tea-draw-v1'||!['steam','mock'].includes(data.mode)||typeof data.room!=='string'||!/^\d{4,21}$/.test(data.room)||typeof data.hostId!=='string'||data.hostId.length>80||typeof data.secret!=='string'||data.secret.length!==32||!Number.isFinite(data.expiresAt)||data.expiresAt<Date.now())fail('INVITE_INVALID','邀请格式错误或已经过期');
  if(data.mode==='mock'){let hub;try{hub=new URL(data.hub);}catch{fail('INVITE_INVALID');}if(hub.protocol!=='ws:'||hub.hostname!=='127.0.0.1'||hub.username||hub.password)fail('INVITE_INVALID');}
  return data;
}
module.exports={SessionService,encodeInvite,decodeInvite,constantEqual,PROTOCOL};
