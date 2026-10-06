'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { safePath, extractZip, install, download } = require('../scripts/bootstrap');
const { crc32 } = require('../scripts/package');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ai-tea-bootstrap-security-'));
  t.after(()=>{assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  return directory;
}
// Construct archive fixtures directly so unsafe names are never created on the real filesystem.
function archive(entries) {
  const local=[],central=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name),data=Buffer.from(entry.data||''),crc=crc32(data),header=Buffer.alloc(30),directory=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(entry.size??data.length,22);header.writeUInt16LE(name.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(0,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(entry.size??data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(((entry.mode||0)<<16)>>>0,38);directory.writeUInt32LE(offset,42);
    local.push(header,name,data);central.push(directory,name);offset+=header.length+name.length+data.length;
  }
  const listing=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(listing.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,listing,end]);
}
function fixture(t,{brokenFile=false}={}) {
  const directory=temporary(t),code=Buffer.from('module.exports = "verified release";\n');
  const fileManifest={schema:1,version:'0.1.0',platform:'windows-x64',kind:'lite',files:[{path:'src/main.js',bytes:code.length,sha256:sha(code)}]};
  const bytes=archive([{name:'src/main.js',data:brokenFile?'unlisted mutation':code},{name:'manifest.json',data:JSON.stringify(fileManifest,null,2)}]);
  fs.writeFileSync(path.join(directory,'release.zip'),bytes);
  const release={schema:1,version:'0.1.0',platform:'windows-x64',variants:{lite:{file:'release.zip',sha256:sha(bytes),bytes:bytes.length}}};
  const manifestFile=path.join(directory,'release.json');fs.writeFileSync(manifestFile,JSON.stringify(release));
  return {directory,manifestFile,cache:path.join(directory,'cache'),fileManifest,code};
}

test('Windows path validation rejects traversal, aliases and reserved device variants',()=>{
  for(const name of ['../evil','.. /evil','src/../evil','src/.. /evil','/absolute','C:/evil','src\\evil','src//evil','src/./evil','src/main.js.','src/main.js ','src/a:b','src/a\u0000b','CON','src/nul.js','src/COM1.txt','src/LPT9.ext','src/COM¹.txt','src/COM²','src/COM³.log','src/LPT¹.txt','src/LPT²','src/LPT³.log'])assert.equal(safePath(name),false,name);
  for(const name of ['src/main.js','node_modules/steamworks.js/dist/win64/steamworksjs.win32-x64-msvc.node','合法.svg','src/'])assert.equal(safePath(name),true,name);
});

test('ZIP extraction rejects unsafe names, case aliases, symlinks and inflated size before writing outside cache',t=>{
  const directory=temporary(t),target=path.join(directory,'extract');
  for(const name of ['../outside','.. /outside','src/NUL.js','src/main.js.','src/a:b','src/COM¹.txt'])assert.throws(()=>extractZip(archive([{name,data:'evil'}]),target),/ZIP_UNSAFE/,name);
  assert.throws(()=>extractZip(archive([{name:'src/main.js',data:'a'},{name:'SRC/Main.js',data:'b'}]),target),/ZIP_UNSAFE/);
  assert.throws(()=>extractZip(archive([{name:'src/link',data:'outside',mode:0xa1ff}]),target),/ZIP_UNSAFE/);
  assert.throws(()=>extractZip(archive([{name:'src/bomb',size:100*1024*1024+1}]),target),/ZIP_UNSAFE/);
  assert.equal(fs.existsSync(path.join(directory,'outside')),false);
});

test('cached manifest tampering cannot substitute its own expected file hashes',async t=>{
  const f=fixture(t),first=await install(f),again=await install(f);assert.equal(first.status,'installed');assert.equal(again.status,'already-installed');
  const codePath=path.join(first.directory,'src/main.js'),manifestPath=path.join(first.directory,'manifest.json');
  const attackerCode=Buffer.from('module.exports = "tampered";\n');fs.writeFileSync(codePath,attackerCode);
  const edited=JSON.parse(fs.readFileSync(manifestPath));edited.files[0].sha256=sha(attackerCode);edited.files[0].bytes=attackerCode.length;fs.writeFileSync(manifestPath,JSON.stringify(edited,null,2));
  await assert.rejects(install(f),/INSTALL_MANIFEST_CHANGED/);
});

test('cached file mutation is checked against the manifest from the authenticated archive',async t=>{
  const f=fixture(t),first=await install(f);fs.writeFileSync(path.join(first.directory,'src/main.js'),'tampered');
  await assert.rejects(install(f),/INSTALL_HASH_MISMATCH/);
});

test('invalid release contents remove only their own incomplete installation',async t=>{
  const f=fixture(t,{brokenFile:true});fs.mkdirSync(f.cache,{recursive:true});const preserved=path.join(f.cache,'keep.txt');fs.writeFileSync(preserved,'keep');
  await assert.rejects(install(f),/INSTALL_HASH_MISMATCH/);assert.deepEqual(fs.readdirSync(f.cache),['keep.txt']);assert.equal(fs.readFileSync(preserved,'utf8'),'keep');
});

test('HTTPS redirects cannot downgrade to insecure or credential-bearing endpoints',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'http://evil.example/archive.zip'}});});
  await assert.rejects(download('https://release.example/archive.zip',{limit:1024}),/DOWNLOAD_HTTPS_REQUIRED/);assert.equal(calls,1);
  await assert.rejects(download('https://user:secret@release.example/archive.zip',{limit:1024}),/DOWNLOAD_HTTPS_REQUIRED/);assert.equal(calls,1);
});

test('downloads stop when declared or streamed bytes exceed the configured limit',async t=>{
  const server=http.createServer((req,res)=>{if(req.url==='/declared'){res.writeHead(200,{'Content-Length':'100000'});res.end('short');}else{res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(Buffer.alloc(8192));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(download(base+'/declared',{limit:1024,allowLocal:true}),/DOWNLOAD_TOO_LARGE/);
  await assert.rejects(download(base+'/streamed',{limit:1024,allowLocal:true}),/DOWNLOAD_TOO_LARGE/);
  await assert.rejects(download(base+'/streamed',{limit:1024}),/DOWNLOAD_HTTPS_REQUIRED/);
});
