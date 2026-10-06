'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {verifyMultiprocess}=require('./verify-multiprocess');
const {verifyBrowser}=require('./verify-browser');
const {verifyStudio}=require('./verify-studio');
const {verifyInstall}=require('./verify-install');
const {verifyEasyConnect}=require('./verify-easy-connect');
const {version}=require('../package.json');
const root=path.resolve(__dirname,'..');
async function child(script,args=[],timeoutMs=30000){return new Promise(resolve=>{const processChild=spawn(process.execPath,[script,...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';processChild.stdout.on('data',bytes=>stdout+=bytes.toString());processChild.stderr.on('data',bytes=>stderr+=bytes.toString());const timer=setTimeout(()=>processChild.kill(),timeoutMs);processChild.once('error',e=>{clearTimeout(timer);resolve({code:2,stderr:e.message,stdout});});processChild.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});});}
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function parseSteamReport(output){
  for(const line of output.stdout.trim().split(/\r?\n/).reverse())try{const report=JSON.parse(line);if(report.mode==='steam-single-endpoint'&&['passed','blocked'].includes(report.status))return report;}catch{}
  return{status:'blocked',code:'STEAM_CHECK_UNAVAILABLE',message:output.stderr.slice(-300)};
}
async function verify({out=path.join(root,'verification'),packages=true,steamReport}={}){
  fs.mkdirSync(out,{recursive:true});const started=Date.now(),results=[];
  let steam;
  if(steamReport){steam=JSON.parse(fs.readFileSync(steamReport));if(steam.mode!=='steam-single-endpoint'||!steam.time||Math.abs(Date.now()-Date.parse(steam.time))>3600000)throw new Error('STEAM_REPORT_EXPIRED');steam={...steam,source:'单独执行的近期 Steam 原生检查',report:path.resolve(steamReport)};}
  for(const [name,run]of [['easy-agent-host-and-join',()=>verifyEasyConnect({out:path.join(out,'easy-connect')})],['eight-process-endpoints',()=>verifyMultiprocess({out:path.join(out,'multiprocess')})],['four-browser-ui',()=>verifyBrowser({out:path.join(out,'frontend')})],['games-and-svg-studio',()=>verifyStudio({out:path.join(out,'studio')})],...(packages?[['package-install-onboarding',()=>verifyInstall({out:path.join(out,'install')})]]:[])]){try{const result=await run();results.push({name,...result});}catch(e){results.push({name,status:'failed',message:e.message});}}
  if(!steam)steam=parseSteamReport(await child(path.join(__dirname,'steam-check.js'),[],20000));results.push({name:'steam-single-endpoint',...steam});
  results.push({name:'steam-distinct-accounts',status:'blocked',code:'SECOND_STEAM_ENDPOINT_REQUIRED',message:'当前没有第二台已登录不同 Steam 账号的自动化执行端；未执行真实跨账号验收。'});
  const status=results.some(r=>r.status==='failed')?'failed':results.some(r=>r.status==='blocked')?'partial':'passed';
  const report={schema:1,version,time:new Date().toISOString(),status,elapsedMs:Date.now()-started,results,proof:'模拟验证与真实 Steam 结果分开记录；partial 不表示真实 Steam 多账号已通过。'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));const cases=results.map(r=>`<testcase name="${xml(r.name)}">${r.status==='failed'?`<failure message="${xml(r.message||'failed')}"/>`:r.status==='blocked'?`<skipped message="${xml(r.message||r.code)}"/>`:''}</testcase>`).join('');fs.writeFileSync(path.join(out,'junit.xml'),`<?xml version="1.0" encoding="UTF-8"?><testsuite name="AI tea drawing" tests="${results.length}" failures="${results.filter(r=>r.status==='failed').length}" skipped="${results.filter(r=>r.status==='blocked').length}">${cases}</testsuite>`);return report;
}
if(require.main===module){const index=process.argv.indexOf('--steam-report');verify({packages:!process.argv.includes('--skip-packages'),steamReport:index>=0?process.argv[index+1]:undefined}).then(result=>{console.log(JSON.stringify(result));process.exitCode=result.status==='failed'?1:result.status==='partial'?2:0;}).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={verify,parseSteamReport};
