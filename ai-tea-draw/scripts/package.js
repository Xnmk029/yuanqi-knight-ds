'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {version}=require('../package.json');
function files(directory,relative=''){return fs.readdirSync(path.join(directory,relative),{withFileTypes:true}).flatMap(item=>{const name=path.join(relative,item.name);return item.isDirectory()?files(directory,name):[name];});}
function crc32(buffer){let crc=-1;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^-1)>>>0;}
function zip(directory,output){const body=[],central=[];let offset=0;for(const file of files(directory)){const name=Buffer.from(file.replace(/\\/g,'/')),data=fs.readFileSync(path.join(directory,file)),packed=zlib.deflateRawSync(data,{level:9}),crc=crc32(data),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);body.push(header,name,packed);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(packed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=header.length+name.length+packed.length;}const directoryBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directoryBytes.length,12);end.writeUInt32LE(offset,16);fs.writeFileSync(output,Buffer.concat([...body,directoryBytes,end]));}
function copy(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true});}
function build({portable=false,out=path.join(root,'dist')}={}){
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Windows x64 build requires a Windows x64 workspace');
  fs.mkdirSync(out,{recursive:true});const kind=portable?'portable':'lite',directory=path.join(out,'ai-tea-draw-'+kind+'-'+Date.now());fs.mkdirSync(directory);
  for(const file of ['src','public','package.json','README.md','AGENT-START.md','INSTALL.md','GAMES-AND-STREAM.md','LICENSE'])if(fs.existsSync(path.join(root,file)))copy(path.join(root,file),path.join(directory,file));
  fs.cpSync(path.join(root,'site'),path.join(directory,'site'),{recursive:true,filter:source=>path.basename(source)!=='release-manifest.json'});
  for(const file of ['host.js','join.js','tea.js','setup.js','onboard.js','bootstrap.js','package.js','demo.js','steam-check.js'])if(fs.existsSync(path.join(root,'scripts',file)))copy(path.join(root,'scripts',file),path.join(directory,'scripts',file));
  copy(path.join(root,'transport'),path.join(directory,'transport'));
  copy(path.join(root,'node_modules','ws'),path.join(directory,'node_modules','ws'));
  for(const moduleName of ['@iarna/toml','jsonc-parser','@resvg/resvg-js','@resvg/resvg-js-win32-x64-msvc'])copy(path.join(root,'node_modules',moduleName),path.join(directory,'node_modules',moduleName));
  for(const file of ['index.js','package.json','LICENSE','dist/win64'])copy(path.join(root,'node_modules','steamworks.js',file),path.join(directory,'node_modules','steamworks.js',file));
  const nodeCommand=portable?'"%~dp0runtime\\node.exe"':'node';
  fs.writeFileSync(path.join(directory,'start.cmd'),`@echo off\r\ncd /d "%~dp0"\r\n${nodeCommand} src\\main.js %*\r\n`);
  fs.writeFileSync(path.join(directory,'join.cmd'),`@echo off\r\ncd /d "%~dp0"\r\n${nodeCommand} scripts\\join.js %*\r\n`);
  fs.writeFileSync(path.join(directory,'host.cmd'),`@echo off\r\n${nodeCommand} "%~dp0scripts\\host.js" %*\r\n`);
  fs.writeFileSync(path.join(directory,'tea.cmd'),`@echo off\r\n${nodeCommand} "%~dp0scripts\\tea.js" %*\r\n`);
  fs.writeFileSync(path.join(directory,'mcp.cmd'),`@echo off\r\n${nodeCommand} "%~dp0src\\mcp.js" %*\r\n`);
  fs.writeFileSync(path.join(directory,'setup.cmd'),`@echo off\r\n${nodeCommand} "%~dp0scripts\\setup.js" %*\r\n`);
  fs.writeFileSync(path.join(directory,'steam_appid.txt'),'480\n');
  if(portable){fs.mkdirSync(path.join(directory,'runtime'));copy(process.execPath,path.join(directory,'runtime','node.exe'));const source=process.env.NODE_LICENSE_FILE||path.join(root,'licenses','node-'+process.version+'.txt');if(!fs.existsSync(source))throw new Error('Verified license for this Node version is required; set NODE_LICENSE_FILE');copy(source,path.join(directory,'runtime','NODE-LICENSE.txt'));}
  fs.writeFileSync(path.join(directory,'THIRD-PARTY-NOTICES.txt'),`ws ${require('../package.json').dependencies.ws}: node_modules/ws/LICENSE\nsteamworks.js 0.4.0: node_modules/steamworks.js/LICENSE\n@iarna/toml 2.2.5: node_modules/@iarna/toml/LICENSE\njsonc-parser 3.3.1: node_modules/jsonc-parser/LICENSE.md\n@resvg/resvg-js 2.6.2 (including Windows native binding), MPL-2.0: node_modules/@resvg/resvg-js/LICENSE; corresponding source https://github.com/thx/resvg-js/tree/v2.6.2\nSteam SDK terms: https://partner.steamgames.com/doc/sdk\n${portable?'Node.js '+process.version+': runtime/NODE-LICENSE.txt\n':''}`);
  const manifest={schema:1,version,platform:'windows-x64',kind,node:portable?process.version:'>=20',files:files(directory).map(file=>({path:file.replace(/\\/g,'/'),bytes:fs.statSync(path.join(directory,file)).size,sha256:createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')}))};fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  const archive=path.join(out,`ai-tea-draw-${version}-windows-x64-${kind}.zip`);zip(directory,archive);const sha256=createHash('sha256').update(fs.readFileSync(archive)).digest('hex');fs.writeFileSync(archive+'.sha256',sha256+'  '+path.basename(archive)+'\n');return{kind,directory,archive,bytes:fs.statSync(archive).size,sha256};
}
if(require.main===module)try{console.log(JSON.stringify(build({portable:process.argv.includes('--portable')})));}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={build,zip,crc32};
