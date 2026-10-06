'use strict';
const fs=require('node:fs'),path=require('node:path');
const {build}=require('./package');
const root=path.resolve(__dirname,'..');
const {version}=require('../package.json');
function release({baseUrl,out=path.join(root,'dist')}={}){
  if(baseUrl&&new URL(baseUrl).protocol!=='https:')throw new Error('RELEASE_HTTPS_REQUIRED');
  const guide=fs.readFileSync(path.join(root,'AGENT-START.md'),'utf8');fs.writeFileSync(path.join(root,'site','AGENT-START.md'),guide+'\n发布入口清单：[release-manifest.json](release-manifest.json)。\n无 Node 安装器：[bootstrap.ps1](bootstrap.ps1)。\n一句话配置：[INSTALL.md](INSTALL.md)。\n');
  fs.copyFileSync(path.join(root,'INSTALL.md'),path.join(root,'site','INSTALL.md'));fs.copyFileSync(path.join(root,'GAMES-AND-STREAM.md'),path.join(root,'site','GAMES-AND-STREAM.md'));
  const assets=[build({out}),build({portable:true,out})];
  const manifest={schema:1,version,platform:'windows-x64',status:baseUrl?'ready-for-upload':'local-build',variants:{}};
  for(const asset of assets)manifest.variants[asset.kind]={file:path.basename(asset.archive),bytes:asset.bytes,sha256:asset.sha256,...(baseUrl?{url:new URL(path.basename(asset.archive),baseUrl.endsWith('/')?baseUrl:baseUrl+'/').href}:{})};
  fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(root,'site','release-manifest.json'),JSON.stringify(manifest,null,2));
  return{status:manifest.status,assets,manifest:path.join(out,'release-manifest.json'),site:path.join(root,'site')};
}
if(require.main===module){const index=process.argv.indexOf('--base-url');try{console.log(JSON.stringify(release({baseUrl:index>=0?process.argv[index+1]:undefined})));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={release};
