'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { RoomEngine, hash, clone } = require('../src/engine');
const { SessionService } = require('../src/session');
const { startApp } = require('../src/main');
const { Store } = require('../src/store');

const SVG = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="teal"/></svg>';
class FakeTransport extends EventEmitter {
  constructor(selfId='host', hostId='host') { super(); this.state={selfId,hostId,room:'1234',members:['host','guest']}; this.sent=[]; this.closed=false; }
  info() { return {...this.state,members:[...this.state.members]}; }
  async send(to,data) { this.sent.push({to,data}); }
  async close() { this.closed=true; this.state.room=null; }
}
function temporary(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ai-tea-security-'));
  t.after(()=>{assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  return directory;
}
function guestFixture(t) {
  const service=new SessionService({transport:new FakeTransport('guest'),data:temporary(t),mode:'mock'});
  t.after(()=>service.close());
  const engine=new RoomEngine({hostId:'host',maxMembers:8});engine.addMember('guest','画友');
  const p=engine.execute('host','proposal.submit',{svg:SVG});engine.execute('host','proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});
  return {service,state:engine.view('guest',false)};
}
function deliver(service,state,extra={}) {
  const raw=Buffer.from(JSON.stringify(state)),encoded=zlib.deflateRawSync(raw).toString('base64');
  assert(encoded.length<48*1024);
  service.acceptChunk({transferId:randomUUID(),index:0,total:1,hash:hash(raw.toString()),epoch:state.room.epoch,revision:state.scene.revision,chunk:encoded,...extra});
}

test('malformed remote assets cannot replace or persist the last confirmed snapshot', t=>{
  const {service,state}=guestFixture(t);deliver(service,state);const original=hash(service.remote),archive=fs.readFileSync(service.store.log,'utf8');
  const mutations=[
    next=>{next.scene.objects[0].id={injected:true};},
    next=>{next.scene.objects[0].revision=-1;},
    next=>{next.scene.objects[0].region.x=-1;},
    next=>{next.scene.objects[0].width=4097;},
    next=>{next.scene.objects[0].svg='<svg viewBox="0 0 1 1"><script/></svg>';},
    next=>{next.room.members[0].name='x'.repeat(81);},
    next=>{next.events=Array(101).fill({});},
  ];
  for(const mutate of mutations){const next=clone(state);next.scene.revision++;mutate(next);assert.throws(()=>deliver(service,next));assert.equal(hash(service.remote),original);assert.equal(fs.readFileSync(service.store.log,'utf8'),archive);}
  const forged=clone(state);forged.scene.revision++;
  assert.throws(()=>deliver(service,forged,{hash:'0'.repeat(64)}),{code:'SNAPSHOT_HASH_MISMATCH'});
  assert.equal(hash(service.remote),original);
});

test('partial snapshot transfers are limited before decompression', t=>{
  const {service,state}=guestFixture(t);
  for(let i=0;i<10;i++)service.acceptChunk({transferId:'partial-'+i,index:0,total:2,hash:'x',epoch:state.room.epoch,revision:0,chunk:'AAAA'});
  assert.equal(service.parts.size,3);assert.equal(service.remote,null);
});

test('closing rejects snapshot waiters and further commands without accepting new remote state',async t=>{
  const {service,state}=guestFixture(t);
  const waiter=assert.rejects(service.waitForState(999),{code:'SESSION_CLOSED'});
  const started=Date.now();await service.close();await waiter;assert(Date.now()-started<1000);
  const before=fs.existsSync(service.store.log)?fs.readFileSync(service.store.log):null;
  deliver(service,state);assert.equal(service.remote,null);assert.equal(service.parts.size,0);
  assert.deepEqual(fs.existsSync(service.store.log)?fs.readFileSync(service.store.log):null,before);
  await assert.rejects(service.command('draft.validate',{svg:SVG}),{code:'SESSION_CLOSED'});
  await service.receive({from:'host',data:{tea:1,kind:'state-chunk'}});
  assert.equal(service.remote,null);
  await service.close();
});

test('peer queue admission is bounded while another command is still running',async t=>{
  const transport=new FakeTransport(),service=new SessionService({transport,data:temporary(t),mode:'mock'});
  const engine=new RoomEngine({hostId:'host',maxMembers:8});engine.addMember('guest','画友');service.engine=engine;
  t.after(()=>service.close());
  let release;service.serial=new Promise(resolve=>{release=resolve;});
  const requests=Array.from({length:6},(_,n)=>service.receive({from:'guest',data:{tea:1,kind:'command',requestId:'q-'+n,name:'scene.read',args:{},id:'op-'+n}}));
  assert.equal(service.queuedTotal,4);assert.equal(service.queuedBy.get('guest'),4);
  await Promise.resolve();
  assert.equal(transport.sent.filter(p=>p.data.error?.code==='QUEUE_LIMIT').length,2);
  release();await Promise.all(requests);
  assert.equal(service.queuedTotal,0);assert.equal(service.queuedBy.get('guest'),0);
  await service.receive({from:'guest',data:{tea:1,kind:'command',requestId:'oversized',name:'draft.validate',args:{svg:'x'.repeat(601*1024)},id:'big'}});
  assert.equal(service.queuedTotal,0);assert.equal(transport.sent.at(-1).data.error.code,'QUEUE_LIMIT');
});

test('cancelled lease IDs cannot submit again and a live lease restricts its allocated subregion',()=>{
  const engine=new RoomEngine({hostId:'host',maxMembers:8});engine.addMember('guest','画友');const region=engine.member('guest').region;
  const lease=engine.execute('guest','region.reserve',{x:region.x,y:region.y,width:100,height:100});
  assert.throws(()=>engine.execute('guest','proposal.submit',{svg:SVG}),{code:'TASK_ACTIVE'});
  assert.throws(()=>engine.execute('guest','proposal.submit',{svg:SVG,leaseId:lease.id,...region}),{code:'OUTSIDE_REGION'});
  const result=engine.execute('guest','proposal.submit',{svg:SVG,leaseId:lease.id,x:region.x,y:region.y,width:100,height:100});assert.equal(result.status,'pending');
  engine.execute('guest','job.cancel',{leaseId:lease.id});
  assert.equal(engine.quota('guest').pending,0);
  assert.throws(()=>engine.execute('host','proposal.approve',{proposalId:result.proposalId,hash:result.hash},{admin:true}),{code:'PROPOSAL_NOT_PENDING'});
  assert.throws(()=>engine.execute('guest','proposal.submit',{svg:SVG,leaseId:lease.id,x:region.x,y:region.y,width:100,height:100}),{code:'TASK_EXPIRED'});
  assert.equal(engine.data.objects.length,0);
});

test('approval rechecks the task expiry before spending quota or publishing',()=>{
  const engine=new RoomEngine({hostId:'host',maxMembers:4});engine.addMember('guest','画友');const region=engine.member('guest').region;
  const lease=engine.execute('guest','region.reserve',{});
  const p=engine.execute('guest','proposal.submit',{svg:SVG,leaseId:lease.id,...region});
  engine.data.leases.guest.expiresAt=Date.now()-1;
  assert.throws(()=>engine.execute('host','proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true}),{code:'TASK_EXPIRED'});
  assert.equal(engine.data.objects.length,0);assert.equal(engine.data.rates.guest,undefined);
  const replacement=engine.execute('guest','region.reserve',{});
  engine.execute('guest','job.cancel',{leaseId:lease.id});
  assert.equal(engine.data.leases.guest.id,replacement.id);assert.equal(engine.quota('guest').pending,0);
});

test('many tiny works cannot bypass the scene metadata budget; editing remains available',()=>{
  const engine=new RoomEngine({hostId:'host',maxMembers:4});
  const p=engine.execute('host','proposal.submit',{svg:SVG});const accepted=engine.execute('host','proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});
  const first=clone(engine.data.objects[0]);engine.data.objects=Array.from({length:512},(_,i)=>({...clone(first),id:i===0?accepted.objectId:randomUUID()}));
  assert.throws(()=>engine.execute('host','proposal.submit',{svg:SVG}),{code:'SCENE_OBJECT_LIMIT'});
  const edit=engine.execute('host','proposal.submit',{svg:SVG,objectId:accepted.objectId,baseRevision:1});assert.equal(edit.status,'pending');
});

test('oversized serialized state fails before durable acknowledgement and rolls the command back',t=>{
  const service=new SessionService({transport:new FakeTransport(),data:temporary(t),mode:'mock'});t.after(()=>service.close());
  service.engine=new RoomEngine({hostId:'host',maxMembers:4});service.persist();const before=fs.readFileSync(service.store.log);const revision=service.engine.data.revision;
  const original=service.engine.view.bind(service.engine);service.engine.view=(...args)=>({...original(...args),padding:'x'.repeat(16*1024*1024)});
  assert.throws(()=>service.execute('host','region.reserve',{},{}),{code:'STATE_LIMIT'});
  assert.deepEqual(fs.readFileSync(service.store.log),before);assert.equal(service.engine.data.revision,revision);assert.equal(service.engine.data.leases.host,undefined);
});

test('large successful edits keep all retained history within two MiB',()=>{
  const engine=new RoomEngine({hostId:'host',maxMembers:8});engine.addMember('guest','画友');engine.addMember('other','小鲍');const actors=['host','guest','other'];
  const body='<rect x="10" y="10" width="10" height="10" fill="#123456" stroke="#654321" stroke-width="2" stroke-linecap="round" stroke-linejoin="bevel" opacity=".7"/>'.repeat(1400);
  assert(Buffer.byteLength(body)<256*1024);
  for(let iteration=0;iteration<6;iteration++)for(const actor of actors){if(engine.data.rates[actor])engine.data.rates[actor].time-=20000;const old=engine.data.objects.find(o=>o.authorId===actor);const svg=`<svg viewBox="0 0 100 100">${body.replaceAll('#123456','#12345'+iteration)}</svg>`;const p=engine.execute(actor,'proposal.submit',{svg,...(old?{objectId:old.id,baseRevision:old.revision}:{})});engine.execute('host','proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});}
  const retained=engine.data.objects.flatMap(o=>o.history||[]);const bytes=retained.reduce((n,v)=>n+Buffer.byteLength(JSON.stringify(v)),0);
  assert(bytes<=2*1024*1024);assert(retained.length>0);assert(retained.length<15);assert.equal(engine.data.objects.length,3);
});

test('HTTP upload and authentication bounds hold without changing room state',async t=>{
  const directory=temporary(t),transport=new FakeTransport(),app=await startApp({mode:'mock',data:directory,transport});t.after(()=>app.close());
  const denied=await fetch(app.url+'/api/state');assert.equal(denied.status,401);
  const response=await fetch(app.url+'/api/command',{method:'POST',headers:{Authorization:'Bearer '+app.drawToken,'Content-Type':'application/json'},body:JSON.stringify({name:'draft.validate',args:{svg:'x'.repeat(700*1024)}})});
  assert.equal(response.status,413);assert.equal((await response.json()).error.code,'REQUEST_TOO_LARGE');
  assert.equal(app.service.engine,null);assert.equal(app.service.remote,null);
  const good=await fetch(app.url+'/api/command',{method:'POST',headers:{Authorization:'Bearer '+app.drawToken,'Content-Type':'application/json'},body:JSON.stringify({name:'draft.validate',args:{svg:SVG}})});
  assert.equal(good.status,200);assert.equal((await good.json()).ok,true);
});

test('archive byte guard fails before appending a record',t=>{
  const store=new Store(temporary(t));store.save({schema:1,revision:1,objects:[]});const before=fs.readFileSync(store.log);
  assert.throws(()=>store.save({schema:1,large:'x'.repeat(20*1024*1024)}),/ARCHIVE_BUDGET/);
  assert.deepEqual(fs.readFileSync(store.log),before);assert.equal(store.load().revision,1);
});
