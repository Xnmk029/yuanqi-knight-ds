'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const {crc32}=require('./package');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function safePath(name){return typeof name==='string'&&name.length>0&&!name.startsWith('/')&&!name.includes('\\')&&name.split('/').every((segment,index,list)=>segment===''?index===list.length-1:!/[\x00-\x1f\x7f<>:"|?*]/.test(segment)&&!/[ .]$/.test(segment)&&segment!=='.'&&segment!=='..'&&!/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(segment));}
function extractZip(bytes,directory,{manifestOnly=false}={}){
  let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50){end=at;break;}if(end<0)throw new Error('ZIP_END_MISSING');
  const count=bytes.readUInt16LE(end+10),centralOffset=bytes.readUInt32LE(end+16);if(count>10000)throw new Error('ZIP_ENTRIES_LIMIT');let at=centralOffset,total=0,manifestBytes;const seen=new Set();
  for(let index=0;index<count;index++){
    if(at+46>bytes.length||bytes.readUInt32LE(at)!==0x02014b50)throw new Error('ZIP_INVALID');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),packed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42),unixMode=bytes.readUInt32LE(at+38)>>>16;
    const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');at+=46+nameLength+extra+comment;
    if(flags&1||![0,8].includes(method)||size>100*1024*1024||(total+=size)>200*1024*1024||(unixMode&0xf000)===0xa000||!safePath(name)||seen.has(name.toLowerCase()))throw new Error('ZIP_UNSAFE');seen.add(name.toLowerCase());
    if(manifestOnly&&name!=='manifest.json')continue;
    if(manifestOnly&&size>65536)throw new Error('INSTALL_MANIFEST_TOO_LARGE');
    const target=path.resolve(directory||'.',...name.split('/')),base=path.resolve(directory||'.')+path.sep;if(!target.startsWith(base))throw new Error('ZIP_PATH_ESCAPE');
    if(name.endsWith('/')){fs.mkdirSync(target,{recursive:true});continue;}
    if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('ZIP_LOCAL_INVALID');
    const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);if(start+packed>centralOffset)throw new Error('ZIP_OVERLAP');
    const data=method===8?zlib.inflateRawSync(bytes.subarray(start,start+packed),{maxOutputLength:size+1}):bytes.subarray(start,start+packed);if(data.length!==size||crc32(data)!==crc)throw new Error('ZIP_CRC_MISMATCH');if(name==='manifest.json')manifestBytes=data;if(!manifestOnly){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  }
  return manifestBytes;
}
async function download(url,{limit,allowLocal=false,timeout=60000}){
  for(let redirects=0;redirects<6;redirects++){
    url=new URL(url);if(url.username||url.password||(url.protocol!=='https:'&&!(allowLocal&&url.protocol==='http:'&&url.hostname==='127.0.0.1')))throw new Error('DOWNLOAD_HTTPS_REQUIRED');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(timeout)});
    if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url);continue;}
    if(!response.ok)throw new Error('DOWNLOAD_FAILED');if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('DOWNLOAD_TOO_LARGE');}
    const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>limit){await response.body?.cancel().catch(()=>{});throw new Error('DOWNLOAD_TOO_LARGE');}chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
  }throw new Error('DOWNLOAD_REDIRECT_LIMIT');
}
async function install({manifest,manifestFile,kind='lite',cache,allowLocal=false}={}){
  let release,origin;
  if(manifestFile){if(fs.statSync(manifestFile).size>32768)throw new Error('MANIFEST_TOO_LARGE');release=JSON.parse(fs.readFileSync(manifestFile));origin=path.dirname(path.resolve(manifestFile));}
  else {const url=new URL(manifest);release=JSON.parse(await download(url,{limit:32768,allowLocal,timeout:20000}));origin=new URL('.',url).href;}
  if(release.schema!==1||!/^\d+\.\d+\.\d+$/.test(release.version)||release.platform!=='windows-x64'||!release.variants?.[kind])throw new Error('RELEASE_MANIFEST_INVALID');
  const asset=release.variants[kind];if(!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isInteger(asset.bytes)||asset.bytes>100*1024*1024||asset.bytes<1)throw new Error('ASSET_MANIFEST_INVALID');
  let bytes;
  if(manifestFile&&!asset.url){if(typeof asset.file!=='string'||path.basename(asset.file)!==asset.file)throw new Error('ASSET_PATH_INVALID');bytes=fs.readFileSync(path.join(origin,asset.file));}
  else {if(release.status==='local-build'&&!asset.url)throw new Error('RELEASE_NOT_PUBLISHED');bytes=await download(new URL(asset.url||asset.file,origin),{limit:asset.bytes,allowLocal});}
  if(bytes.length!==asset.bytes||digest(bytes)!==asset.sha256)throw new Error('ASSET_HASH_MISMATCH');
  cache=path.resolve(cache||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'AI-Tea-Draw','releases'));const target=path.join(cache,release.version+'-'+kind+'-'+asset.sha256.slice(0,12));fs.mkdirSync(cache,{recursive:true});
  const manifestBytes=extractZip(bytes,null,{manifestOnly:true});if(!manifestBytes)throw new Error('INSTALL_MANIFEST_MISSING');const trusted=JSON.parse(manifestBytes);
  const verify=directory=>{if(digest(fs.readFileSync(path.join(directory,'manifest.json')))!==digest(manifestBytes))throw new Error('INSTALL_MANIFEST_CHANGED');const info=trusted;if(info.version!==release.version||!Array.isArray(info.files)||info.files.length>10000)throw new Error('INSTALL_MANIFEST_INVALID');for(const entry of info.files){if(!safePath(entry.path)||entry.path.endsWith('/'))throw new Error('INSTALL_PATH_INVALID');const file=path.resolve(directory,entry.path);if(!file.startsWith(path.resolve(directory)+path.sep)||digest(fs.readFileSync(file))!==entry.sha256)throw new Error('INSTALL_HASH_MISMATCH');}return info;};
  if(fs.existsSync(target)){verify(target);return{status:'already-installed',directory:target,version:release.version,kind};}
  const temporary=target+'.partial-'+process.pid+'-'+Date.now();fs.mkdirSync(temporary);try{extractZip(bytes,temporary);verify(temporary);try{fs.renameSync(temporary,target);}catch(e){if(!fs.existsSync(target))throw e;verify(target);}}finally{if(fs.existsSync(temporary)){if(!path.resolve(temporary).startsWith(cache+path.sep))throw new Error('CACHE_PATH_ESCAPE');fs.rmSync(temporary,{recursive:true,force:true});}}return{status:'installed',directory:target,version:release.version,kind};
}
async function run(argv=process.argv.slice(2)){
  const options={},launch={},setupOptions={};let action,configure=false;
  const values={'--manifest':'manifest','--manifest-file':'manifestFile','--cache':'cache','--kind':'kind'};
  const launchValues={'--topic':'topic','--room-name':'roomName','--name':'name','--max-members':'maxMembers','--policy':'policy','--invite-file':'inviteFile','--guide-url':'guideUrl','--data':'data'};
  const setupValues={'--agent':'agent','--scope':'scope','--config':'config','--project':'project','--home':'home'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--setup')configure=true;
    else if(arg==='--allow-local')options.allowLocal=true;
    else if(arg==='--no-open')launch.open=false;
    else if(arg==='--host'||arg==='--join'){if(action)throw new Error('ACTION_CONFLICT');action=arg.slice(2);}
    else{const key=values[arg]||launchValues[arg]||setupValues[arg],value=argv[++i];if(!key||!value||value.startsWith('--'))throw new Error('INVALID_ARGUMENT');const target=values[arg]?options:setupValues[arg]?setupOptions:launch;if(Object.hasOwn(target,key))throw new Error('DUPLICATE_ARGUMENT');target[key]=key==='maxMembers'?Number(value):value;if(setupValues[arg])configure=true;}
  }
  if(action==='host'&&launch.inviteFile)throw new Error('ACTION_CONFLICT');
  if(action==='join'&&!launch.inviteFile)throw new Error('INVITE_REQUIRED');
  const installed=await install(options);
  if(!launch.guideUrl&&options.manifest)launch.guideUrl=new URL('AGENT-START.md',options.manifest).href;
  const configured=configure?await require(path.join(installed.directory,'src','agent-setup.js')).setup({...setupOptions,root:installed.directory,guideUrl:launch.guideUrl}):undefined;
  if(!action)return{...installed,...(configured?{setup:configured}:{})};
  const launcher=require(path.join(installed.directory,'src','launcher.js'));
  try{return{...installed,...(configured?{setup:configured}:{}),connection:await launcher[action](launch)};}catch(error){if(configured)error.setup=configured;throw error;}
}
if(require.main===module)run().then(result=>console.log(JSON.stringify({ok:true,result}))).catch(e=>{console.error(JSON.stringify({ok:false,...(e.setup?{result:{setup:e.setup}}:{}),error:{code:e.code||e.message,message:e.message}}));process.exitCode=2;});
module.exports={install,extractZip,safePath,download,run};
