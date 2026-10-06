'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startApp,kitRoot}=require('../src/main');
const {startHub}=require(path.join(kitRoot(),'mock-hub'));
const {Store}=require('../src/store');
const {hash}=require('../src/engine');
const SVG='<svg viewBox="0 0 100 100"><path d="M10 50 Q50 0 90 50 Q50 100 10 50 Z" fill="teal"/></svg>';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function temporary(){return fs.mkdtempSync(path.join(os.tmpdir(),'ai-tea-test-'));}
function cleanup(directory){assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
async function fixture(t,count=2){const directory=temporary(),hub=await startHub(),apps=[];t.after(async()=>{for(const app of apps.reverse())await app.close();await hub.close();cleanup(directory);});for(let i=0;i<count;i++)apps.push(await startApp({mode:'mock',hub:hub.url,data:path.join(directory,String(i))}));const host=apps[0];const created=await host.service.command('room.create',{maxMembers:8,policy:'strict',name:'深海夜市'});for(const app of apps.slice(1))await app.service.command('room.join',{invite:created.invite,name:'画友'});return{directory,hub,apps,host,invite:created.invite};}
test('eight peers synchronize accepted art; pending drafts never reach other participants; late join gets scene',async t=>{const f=await fixture(t,7),guest=f.apps[1],other=f.apps[2];const p=await guest.service.command('proposal.submit',{svg:SVG,name:'鲸鱼'});assert.equal(other.service.view().proposals.length,0);assert.equal(f.host.service.view(true).proposals.length,1);assert.equal(f.host.service.view().proposals.length,0);await assert.rejects(f.host.service.command('proposal.approve',{proposalId:p.proposalId,hash:p.hash}),{code:'FORBIDDEN'});await f.host.service.command('proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});for(const app of f.apps.slice(1))await app.service.waitForState(f.host.service.engine.data.revision);const sceneHash=hash(f.host.service.view().scene);for(const app of f.apps.slice(1))assert.equal(hash(app.service.view().scene),sceneHash);const last=await startApp({mode:'mock',hub:f.hub.url,data:path.join(f.directory,'late')});f.apps.push(last);await last.service.command('room.join',{invite:f.invite,name:'后来者'});assert.equal(last.service.view().scene.objects.length,1);assert.ok(last.service.stats.snapshotsReceived>0);});
test('HTTP capabilities and origins protect moderation and browser disconnect preserves room',async t=>{const{host}=await fixture(t,1);const response=await fetch(host.url+'/api/command',{method:'POST',headers:{Authorization:'Bearer '+host.drawToken,'Content-Type':'application/json'},body:JSON.stringify({name:'room.freeze',args:{frozen:true}})});assert.equal((await response.json()).error.code,'FORBIDDEN');assert.equal((await fetch(host.url+'/api/state')).status,401);assert.equal((await fetch(host.url+'/api/state',{headers:{Authorization:'Bearer '+host.drawToken,Origin:'https://bad.example'}})).status,403);const{WebSocket}=require('ws');const ws=new WebSocket(host.url.replace('http','ws')+'/events?token='+host.uiToken,{headers:{Origin:host.url}});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.close();await pause(50);assert.ok(host.service.transport.info().room);assert.equal(host.service.view().self.isHost,true);});
test('lost last state is repaired by heartbeat without requiring another edit',async t=>{const{host,apps}=await fixture(t,2),guest=apps[1];const original=host.service.sendState.bind(host.service);let drop=true;host.service.sendState=async to=>{if(!drop)return original(to);};const p=await host.service.command('proposal.submit',{svg:SVG});await host.service.command('proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});assert.equal(guest.service.view().scene.objects.length,0);drop=false;await host.service.heartbeat();await guest.service.waitForState(host.service.engine.data.revision);assert.equal(guest.service.view().scene.objects.length,1);assert.ok(guest.service.stats.repairs>0);});
test('two peers confirm reserve and cancel; heartbeat repairs a lost final cancellation', {timeout:15000}, async t=>{
  const{host,apps}=await fixture(t,2),guest=apps[1],guestId=guest.service.selfId;
  const initialRevision=guest.service.view().scene.revision;
  const firstLease=await guest.service.command('region.reserve',{});
  assert.equal(host.service.engine.quota(guestId).lease.id,firstLease.id);
  assert.equal(guest.service.view().quota.lease.id,firstLease.id);
  assert.equal(guest.service.view().scene.revision,host.service.engine.data.revision);
  assert.ok(guest.service.view().scene.revision>initialRevision);
  const reservedRevision=guest.service.view().scene.revision;
  await guest.service.command('job.cancel',{leaseId:firstLease.id});
  assert.equal(host.service.engine.quota(guestId).lease,null);
  assert.equal(guest.service.view().quota.lease,null);
  assert.equal(guest.service.view().scene.revision,host.service.engine.data.revision);
  assert.ok(guest.service.view().scene.revision>reservedRevision);

  const secondLease=await guest.service.command('region.reserve',{});
  assert.equal(guest.service.view().quota.lease.id,secondLease.id);
  const beforeCancelRevision=guest.service.view().scene.revision;
  const repairsBefore=guest.service.stats.repairs;
  const original=host.service.sendState.bind(host.service);
  let droppedResolve, cancelling, settled=false;
  const dropped=new Promise(resolve=>{droppedResolve=resolve;});
  host.service.sendState=async to=>{
    if(to===guestId&&host.service.engine.data.revision>beforeCancelRevision){droppedResolve();return;}
    return original(to);
  };
  try{
    cancelling=guest.service.command('job.cancel',{leaseId:secondLease.id});
    cancelling.then(()=>{settled=true;},()=>{settled=true;});
    await dropped;
    assert.equal(host.service.engine.quota(guestId).lease,null);
    assert.equal(guest.service.view().quota.lease.id,secondLease.id);
    assert.equal(guest.service.view().scene.revision,beforeCancelRevision);
    assert.ok(host.service.engine.data.revision>beforeCancelRevision);
    assert.equal(settled,false,'command must wait until the cancellation state is confirmed');
    const finalRevision=host.service.engine.data.revision;
    host.service.sendState=original;
    await host.service.heartbeat();
    assert.equal((await cancelling).status,'cancelled');
    assert.equal(host.service.engine.data.revision,finalRevision,'repair must not require a new operation');
    assert.equal(guest.service.view().scene.revision,finalRevision);
    assert.equal(guest.service.view().quota.lease,null);
    assert.ok(guest.service.stats.repairs>repairsBefore);
  }finally{
    host.service.sendState=original;
    if(cancelling)await cancelling.catch(()=>{});
  }
});
test('durability failure rolls back an operation and accepted archive reopens offline',async t=>{const{host,directory,hub,apps}=await fixture(t,1);const save=host.service.store.save.bind(host.service.store);host.service.store.save=()=>{throw new Error('disk full');};await assert.rejects(host.service.command('proposal.submit',{svg:SVG}),/disk full/);assert.equal(host.service.engine.data.proposals.length,0);host.service.store.save=save;const p=await host.service.command('proposal.submit',{svg:SVG});await host.service.command('proposal.approve',{proposalId:p.proposalId,hash:p.hash},{admin:true});const savedSvg=host.service.canvas();await host.close();apps.splice(apps.indexOf(host),1);const reopened=await startApp({mode:'mock',hub:hub.url,data:path.join(directory,'0')});apps.push(reopened);assert.equal((await reopened.service.command('scene.export',{})).svg,savedSvg);assert.equal(reopened.service.view().connection.connected,false);});
test('journal recovery discards only unacknowledged tail and detects corrupted full records',()=>{const directory=temporary();try{const store=new Store(directory);store.save({schema:1,objects:[],revision:1});fs.appendFileSync(store.log,'{"incomplete":');assert.equal(store.load().revision,1);store.save({schema:1,objects:[],revision:2});assert.equal(store.load().revision,2);fs.appendFileSync(store.log,JSON.stringify({hash:'bad',data:{revision:3}})+'\n');assert.throws(()=>store.load(),/JOURNAL_HASH_MISMATCH/);}finally{cleanup(directory);}});
