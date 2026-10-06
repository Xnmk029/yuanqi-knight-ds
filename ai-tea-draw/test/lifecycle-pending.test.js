'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {startApp,kitRoot}=require('../src/main');
const {startHub}=require(path.join(kitRoot(),'mock-hub'));
const {TeaClient}=require('../src/client');
const launcher=require('../src/launcher');
const SVG='<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="teal"/></svg>';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function directory(){return fs.mkdtempSync(path.join(os.tmpdir(),'tea-pending-'));}
function remove(dir){assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
async function fixture(t,count=1){const dir=directory(),hub=await startHub(),apps=[];t.after(async()=>{for(const app of apps.reverse())await app.close();await hub.close();remove(dir);});for(let i=0;i<count;i++)apps.push(await startApp({mode:'mock',hub:hub.url,data:path.join(dir,String(i)),open:false}));return{dir,hub,apps};}
function delayFirst(transport,method){const gate=deferred(),entered=deferred(),original=transport[method].bind(transport);let calls=0;transport[method]=async(...args)=>{calls++;if(calls===1){entered.resolve();await gate.promise;}return original(...args);};return{gate,entered:entered.promise,calls:()=>calls};}
function whenState(service,predicate){return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);service.off('state',check);};const check=()=>{const state=service.view();if(predicate(state)){cleanup();resolve(state);}};const timer=setTimeout(()=>{cleanup();reject(new Error('state did not settle'));},3000);service.on('state',check);check();});}

test('a real HTTP create timeout keeps the native operation busy and cannot queue another room', {timeout:10000},async t=>{
  const{apps}=await fixture(t),app=apps[0],delay=delayFirst(app.service.transport,'createRoom');
  const client=new TeaClient({sessionFile:app.sessionFile,timeoutMs:120});
  const timedOut=assert.rejects(client.command('room.create',{name:'超时仍在建房',maxMembers:4,policy:'strict'},{id:'create-that-times-out'}),{code:'SERVICE_TIMEOUT'});
  await delay.entered;await timedOut;client.timeoutMs=5000;
  const busy=await client.state();assert.equal(busy.connection.syncing,true);assert.equal(busy.connection.connected,false);
  assert.equal((await client.command('room.rules')).connection.syncing,true);
  await assert.rejects(launcher.host({sessionFile:app.sessionFile,open:false}),{code:'SESSION_BUSY'});
  await assert.rejects(client.command('room.create',{maxMembers:4},{id:'create-that-times-out'}),{code:'SESSION_BUSY'});
  await assert.rejects(client.command('room.leave'),{code:'SESSION_BUSY'});
  assert.equal(delay.calls(),1);
  const completed=whenState(app.service,state=>state.room&&!state.connection.syncing);delay.gate.resolve();const ready=await completed;
  const epoch=ready.room.epoch,proposal=await app.service.command('proposal.submit',{svg:SVG});
  await app.service.command('proposal.approve',{proposalId:proposal.proposalId,hash:proposal.hash},{admin:true});
  const objectId=app.service.view().scene.objects[0].id;
  const reused=await launcher.host({sessionFile:app.sessionFile,open:false});assert.equal(reused.epoch,epoch);assert.equal(reused.status,'already-hosting');
  await assert.rejects(app.service.command('room.create',{name:'不能重置当前画布',maxMembers:4}),{code:'ALREADY_IN_ROOM'});
  assert.equal(delay.calls(),1);assert.equal(app.service.view().room.epoch,epoch);assert.equal(app.service.view().scene.objects[0].id,objectId);
});

test('a real HTTP join timeout exposes busy state and cannot queue a second join or host', {timeout:10000},async t=>{
  const{apps}=await fixture(t,2),host=apps[0],guest=apps[1];
  const created=await host.service.command('room.create',{name:'延迟加入',maxMembers:4});
  const delay=delayFirst(guest.service.transport,'joinRoom'),client=new TeaClient({sessionFile:guest.sessionFile,timeoutMs:120});
  const timedOut=assert.rejects(client.command('room.join',{invite:created.invite},{id:'join-that-times-out'}),{code:'SERVICE_TIMEOUT'});
  await delay.entered;await timedOut;client.timeoutMs=5000;
  assert.equal((await client.state()).connection.syncing,true);
  assert.equal((await client.command('scene.read')).connection.syncing,true);
  await assert.rejects(launcher.join({sessionFile:guest.sessionFile,invite:created.invite,open:false}),{code:'SESSION_BUSY'});
  await assert.rejects(client.command('room.join',{invite:created.invite},{id:'join-that-times-out'}),{code:'SESSION_BUSY'});
  await assert.rejects(client.command('room.create',{maxMembers:4}),{code:'SESSION_BUSY'});
  assert.equal(delay.calls(),1);
  const completed=whenState(guest.service,state=>state.room&&!state.connection.syncing);delay.gate.resolve();await completed;
  assert.equal(guest.service.view().room.epoch,created.epoch);
  const proposal=await client.command('proposal.submit',{svg:SVG});assert.equal(proposal.status,'pending');
  const again=await launcher.join({sessionFile:guest.sessionFile,invite:created.invite,open:false});assert.equal(again.status,'already-joined');assert.equal(again.epoch,created.epoch);
  await assert.rejects(guest.service.command('room.join',{invite:created.invite}),{code:'ALREADY_IN_ROOM'});
  assert.equal(delay.calls(),1);assert.equal(guest.service.view().proposals[0].id,proposal.proposalId);
});

test('native create and join failures clear busy state, retain the actual error, and allow retry', {timeout:10000},async t=>{
  const{apps}=await fixture(t,3),host=apps[2];const created=await host.service.command('room.create',{maxMembers:4});
  for(const[app,method,name,args]of[[apps[0],'createRoom','room.create',{maxMembers:4}],[apps[1],'joinRoom','room.join',{invite:created.invite}]]){
    const delay=delayFirst(app.service.transport,method),client=new TeaClient({sessionFile:app.sessionFile,timeoutMs:120});
    const timedOut=assert.rejects(client.command(name,args),{code:'SERVICE_TIMEOUT'});await delay.entered;await timedOut;client.timeoutMs=5000;
    const failed=whenState(app.service,state=>!state.connection.syncing&&state.connection.lastError?.code==='NATIVE_NETWORK_FAILED');
    delay.gate.reject(Object.assign(new Error('native network failed'),{code:'NATIVE_NETWORK_FAILED'}));await failed;
    const state=await client.state();assert.equal(state.connection.connected,false);assert.equal(state.connection.lastError.message,'native network failed');
    const retried=await client.command(name,args);assert.ok(retried.invite||retried.status==='joined');assert.equal(delay.calls(),2);
    assert.equal((await client.state()).connection.lastError,null);assert.equal((await client.state()).connection.syncing,false);
  }
});

class ControlledTransport extends EventEmitter{
  constructor(gate){super();this.gate=gate;this.room=null;this.createCalls=0;this.leaveCalls=0;this.closeCalls=0;this.maxMembers=4;}
  info(){return{room:this.room,selfId:'controlled-self',hostId:this.room?'controlled-self':null,members:this.room?['controlled-self']:[],maxMembers:this.maxMembers};}
  async createRoom(){this.createCalls++;if(this.gate)await this.gate.promise;this.room='123456789012345';return this.info();}
  leave(){this.leaveCalls++;this.room=null;}
  close(){this.closeCalls++;this.leave();}
}

test('close does not wait for native settlement and late results cannot mutate a replacement service or archive', {timeout:10000},async t=>{
  for(const rejected of[false,true]){
    const dir=directory(),gate=deferred(),oldTransport=new ControlledTransport(gate);let old,next;
    try{
      old=await startApp({transport:oldTransport,data:dir,mode:'steam',open:false});
      const pending=assert.rejects(old.service.command('room.create',{maxMembers:4}),{code:'SESSION_CLOSED'});
      await new Promise(resolve=>setImmediate(resolve));assert.equal(oldTransport.createCalls,1);
      await old.close();await pending;assert.equal(oldTransport.closeCalls,1);assert.equal(old.service.lifecycle,null);
      const newTransport=new ControlledTransport();next=await startApp({transport:newTransport,data:dir,mode:'steam',open:false});
      const created=await next.service.command('room.create',{maxMembers:4}),before=fs.readFileSync(next.service.store.log,'utf8');
      if(rejected)gate.reject(new Error('late native rejection'));else gate.resolve();
      await old.service.serial;await new Promise(resolve=>setImmediate(resolve));
      assert.equal(old.service.engine,null);assert.equal(oldTransport.room,null);assert.equal(oldTransport.leaveCalls,2);
      assert.equal(next.service.view().room.epoch,created.epoch);assert.equal(newTransport.leaveCalls,0);
      assert.equal(fs.readFileSync(next.service.store.log,'utf8'),before);
    }finally{if(next)await next.close();if(old)await old.close();remove(dir);}
  }
});

test('queued lifecycle execution rechecks occupancy before touching the transport',async t=>{
  const dir=directory(),transport=new ControlledTransport(),app=await startApp({transport,data:dir,mode:'steam',open:false});
  t.after(async()=>{await app.close();remove(dir);});
  const gate=deferred();const earlier=app.service.queue(async()=>{await gate.promise;transport.room='123456789012345';});
  const rejected=assert.rejects(app.service.command('room.create',{maxMembers:4}),{code:'ALREADY_IN_ROOM'});
  assert.equal(app.service.view().connection.syncing,true);gate.resolve();await earlier;await rejected;
  assert.equal(transport.createCalls,0);assert.equal(transport.room,'123456789012345');assert.equal(app.service.lifecycle,null);
  assert.equal(app.service.view().connection.lastError.code,'ALREADY_IN_ROOM');
});
