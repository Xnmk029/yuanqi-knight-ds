'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {release}=require('./release');
const {install}=require('./bootstrap');
const {startApp,kitRoot}=require('../src/main');
const {TeaClient}=require('../src/client');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function run(executable,args,{timeout=30000,cwd=path.resolve(__dirname,'..'),env=process.env}={}){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('INSTALL_CHECK_TIMEOUT'));},timeout);child.stdout.on('data',data=>{stdout+=data.toString();if(stdout.length>16*1024*1024)child.kill();});child.stderr.on('data',data=>stderr+=data.toString());child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error('EXTRACTED_COMMAND_FAILED '+stderr.slice(-300)+' '+stdout.slice(-300)));return;}try{resolve(JSON.parse(stdout.trim()));}catch{reject(new Error('EXTRACTED_COMMAND_INVALID_JSON'));}});});}
async function verifyInstall({out=path.resolve(__dirname,'../verification/install')}={}){
  fs.mkdirSync(out,{recursive:true});const built=release(),checks=[],directory=fs.mkdtempSync(path.join(out,'private-')),apps=[];let hub,guestPid;
  const check=(name,detail)=>checks.push({name,status:'passed',detail});
  try{
    const manifest=JSON.parse(fs.readFileSync(built.manifest));
    const installed=await install({manifestFile:built.manifest,cache:path.join(directory,'cache')});
    const again=await install({manifestFile:built.manifest,cache:path.join(directory,'cache')});assert.equal(again.status,'already-installed');assert.equal(again.directory,installed.directory);check('zip-sha256-extraction-and-idempotent-install',{liteBytes:manifest.variants.lite.bytes,portableBytes:manifest.variants.portable.bytes});
    const cachedMain=path.join(installed.directory,'src','main.js'),cachedManifest=path.join(installed.directory,'manifest.json'),originalMain=fs.readFileSync(cachedMain),originalManifest=fs.readFileSync(cachedManifest);fs.appendFileSync(cachedMain,'\n// tampered\n');const altered=JSON.parse(originalManifest);altered.files.find(f=>f.path==='src/main.js').sha256=hash(fs.readFileSync(cachedMain));fs.writeFileSync(cachedManifest,JSON.stringify(altered));await assert.rejects(install({manifestFile:built.manifest,cache:path.join(directory,'cache')}),/INSTALL_MANIFEST_CHANGED/);fs.writeFileSync(cachedMain,originalMain);fs.writeFileSync(cachedManifest,originalManifest);check('tampered-cache-and-self-reported-manifest-rejected');
    const wrongManifest=path.join(directory,'wrong-manifest.json');fs.writeFileSync(wrongManifest,JSON.stringify({...manifest,variants:{lite:{...manifest.variants.lite,sha256:'0'.repeat(64),url:undefined}}}));fs.copyFileSync(built.assets.find(a=>a.kind==='lite').archive,path.join(directory,manifest.variants.lite.file));await assert.rejects(install({manifestFile:wrongManifest,cache:path.join(directory,'wrong-cache')}),/ASSET_HASH_MISMATCH/);check('wrong-release-digest-rejected-before-install');
    const {startHub}=require(path.join(kitRoot(),'mock-hub'));hub=await startHub();const host=await startApp({mode:'mock',hub:hub.url,data:path.join(directory,'host')});apps.push(host);const room=await host.service.command('room.create',{name:'便携安装验证',maxMembers:4});const inviteFile=path.join(directory,'invite.txt');fs.writeFileSync(inviteFile,room.invite,{mode:0o600});const guestData=path.join(directory,'guest');
    const joinArgs=[path.join(installed.directory,'scripts','join.js'),'--invite-file',inviteFile,'--data',guestData,'--no-open'];const [joinedA,joinedB]=await Promise.all([run(process.execPath,joinArgs),run(process.execPath,joinArgs)]);assert.equal(joinedA.ok,true);assert.equal(joinedB.ok,true);assert.equal(joinedA.result.sessionFile,joinedB.result.sessionFile);assert.equal(Number(joinedA.result.started)+Number(joinedB.result.started),1);guestPid=JSON.parse(fs.readFileSync(joinedA.result.sessionFile)).pid;const guest=new TeaClient({sessionFile:joinedA.result.sessionFile});assert.equal((await guest.state()).room.members.length,2);check('concurrent-one-command-join-reuses-one-native-service');
    const cli=path.join(installed.directory,'src','cli.js'),svgFile=path.join(directory,'tiny.svg');fs.writeFileSync(svgFile,'<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>');const submission=await run(process.execPath,[cli,'--session',joinedA.result.sessionFile,'submit','--file',svgFile,'--name','安装后第一笔']);assert.equal(submission.result.status,'pending');await host.service.command('proposal.approve',{proposalId:submission.result.proposalId,hash:submission.result.hash},{admin:true});const state=await guest.state();assert.equal(state.scene.objects.length,1);check('extracted-package-cli-submit-review-and-sync');
    const portable=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'..','site','bootstrap.ps1'),'-ManifestFile',built.manifest,'-CacheRoot',path.join(directory,'ps-cache'),'-InstallOnly'],{timeout:60000});assert.equal(portable.ok,true);const portableVersion=await new Promise((resolve,reject)=>{const child=spawn(path.join(portable.directory,'runtime','node.exe'),['--version'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',d=>text+=d);child.once('error',reject);child.once('close',code=>code===0?resolve(text.trim()):reject(new Error('PORTABLE_NODE_FAILED')));});assert.equal(portableVersion,process.version);const help=await run(path.join(portable.directory,'runtime','node.exe'),[path.join(portable.directory,'src','cli.js'),'--help']);assert.equal(help.ok,true);check('no-node-powershell-installer-and-bundled-runtime',{node:portableVersion});
    for(const entry of ['tea.cmd','host.cmd','join.cmd','mcp.cmd','scripts/tea.js','scripts/host.js','src/launcher.js','src/mcp.js'])assert.ok(fs.existsSync(path.join(portable.directory,entry)),entry+' missing from portable package');
    const teaHelp=await run('cmd.exe',['/d','/c','tea.cmd host --help'],{cwd:portable.directory});
    const hostHelp=await run('cmd.exe',['/d','/c','host.cmd --help'],{cwd:portable.directory});
    const joinHelp=await run('cmd.exe',['/d','/c','join.cmd --help'],{cwd:portable.directory});
    for(const help of [teaHelp,hostHelp,joinHelp])assert.equal(help.ok,true);
    assert.equal(require(path.join(portable.directory,'src','mcp.js')).TOOLS.some(tool=>tool.name==='tea_create_room'),true);
    check('portable-one-command-host-join-and-mcp-entries',{version:manifest.version,wrappers:3,mcpCreateRoom:true});
    const renderProbe="require('./src/raster').renderPNG('<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"teal\"/></svg>',{width:64}).then(asset=>console.log(JSON.stringify({width:asset.width,height:asset.height,pngHash:asset.pngHash,signature:Buffer.from(asset.png,'base64').subarray(0,8).toString('hex')}))).catch(error=>{console.error(error.stack);process.exitCode=1;});";
    for(const [kind,directory,node]of [['lite',installed.directory,process.execPath],['portable',portable.directory,path.join(portable.directory,'runtime','node.exe')]]){const rendered=await run(node,['-e',renderProbe],{cwd:directory});assert.equal(rendered.width,64);assert.equal(rendered.height,64);assert.equal(rendered.signature,'89504e470d0a1a0a');assert.match(rendered.pngHash,/^[a-f0-9]{64}$/);}
    check('extracted-lite-and-portable-native-png-render-workers');
    const codexHome=path.join(directory,'codex-home');
    const setupArgs=['/d','/c','tea.cmd setup --agent codex'];
    const setupEnv={...process.env,CODEX_HOME:path.join(codexHome,'.codex')};
    const configured=await run('cmd.exe',setupArgs,{cwd:portable.directory,env:setupEnv});
    assert.equal(configured.result.configured,true);assert.equal(configured.result.verification.tools,require('../src/mcp').TOOLS.length);assert.equal(configured.result.verification.steam,'not-checked');
    const repeat=await run('cmd.exe',setupArgs,{cwd:portable.directory,env:setupEnv});assert.equal(repeat.result.status,'already-configured');
    assert.equal(configured.result.mcp.command,path.join(portable.directory,'runtime','node.exe'));
    check('extracted-portable-setup-real-mcp-probe-and-repeat',{agent:'codex',tools:require('../src/mcp').TOOLS.length});
    const cursorHome=path.join(directory,'cursor-home');
    const psSetup=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'..','site','bootstrap.ps1'),'-ManifestFile',built.manifest,'-CacheRoot',path.join(directory,'ps-cache'),'-Setup','-Agent','cursor','-AgentHome',cursorHome],{timeout:60000});
    assert.equal(psSetup.result.setup.configured,true);assert.equal(psSetup.result.setup.verification.status,'passed');
    assert.equal(fs.existsSync(path.join(cursorHome,'.cursor','mcp.json')),true);
    check('no-node-powershell-install-and-configure-single-call',{agent:'cursor'});
    const jsSetup=await require('./bootstrap').run(['--manifest-file',built.manifest,'--cache',path.join(directory,'cache'),'--setup','--agent','gemini','--home',path.join(directory,'gemini-home')]);
    assert.equal(jsSetup.setup.configured,true);assert.equal(jsSetup.setup.verification.tools,require('../src/mcp').TOOLS.length);
    check('node-bootstrap-installs-and-configures-in-one-call',{agent:'gemini'});
    const codexBin=path.join(process.env.APPDATA||'','npm','node_modules','@openai','codex','bin','codex.js');
    if(fs.existsSync(codexBin)){
      const recognized=await run(process.execPath,[codexBin,'mcp','get','ai-tea-draw','--json'],{env:setupEnv});
      assert.equal(recognized.name,'ai-tea-draw');assert.equal(recognized.transport.command,configured.result.mcp.command);
      check('installed-codex-cli-recognizes-generated-isolated-config',{client:'Codex CLI',profile:'temporary',persistentUserConfigChanged:false});
    }
    const report={status:'passed',checks,artifacts:built.assets.map(({kind,archive,bytes,sha256})=>({kind,archive,bytes,sha256})),manifest:built.manifest};fs.writeFileSync(path.join(out,'install-report.json'),JSON.stringify(report,null,2));return report;
  }finally{
    if(guestPid){try{process.kill(guestPid,'SIGTERM');}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
    for(const app of apps.reverse())await app.close();await hub?.close();
    if(path.resolve(directory).startsWith(path.resolve(out)+path.sep))fs.rmSync(directory,{recursive:true,force:true});
  }
}
if(require.main===module)verifyInstall().then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={verifyInstall};
