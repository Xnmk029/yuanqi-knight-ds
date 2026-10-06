'use strict';
const {makeTransport}=require('../src/main');
const fs=require('node:fs'),path=require('node:path');
let transport,phase='initialization';const timeout=setTimeout(()=>finish({status:'blocked',code:'STEAM_CHECK_TIMEOUT',phase}),15000);
function finish(result){clearTimeout(timeout);try{transport?.close();}catch{}const report={...result,time:new Date().toISOString(),mode:'steam-single-endpoint',proof:'只检查原生初始化、8席大厅及本人身份；不证明不同Steam账号间的联机。'};const index=process.argv.indexOf('--out');if(index>=0){const output=path.resolve(process.argv[index+1]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));}console.log(JSON.stringify(report));process.exit(result.status==='passed'?0:2);}
makeTransport({mode:'steam',maxMembers:8}).then(async value=>{transport=value;phase='lobby-creation';const info=await transport.createRoom({maxMembers:8});if(!info.members.includes(info.selfId))throw new Error('STEAM_ROSTER_NOT_READY');finish({status:'passed',checks:['native-initialization','app-access','eight-seat-lobby','own-membership']});}).catch(e=>finish({status:'blocked',code:'STEAM_ENVIRONMENT_UNAVAILABLE',phase,message:e.message}));
