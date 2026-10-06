'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {WebSocketServer,WebSocket}=require('ws');
const {SessionService,constantEqual}=require('./session');
function kitRoot(){return path.join(__dirname,'..','transport');}
async function makeTransport({mode='steam',hub,maxMembers=8}){
  if(mode==='mock'){if(!hub)throw new Error('MOCK_HUB_REQUIRED');const{MockTransport}=require(path.join(kitRoot(),'runtime','mock-transport'));return new MockTransport({project:'ai-tea-draw-v1',hub,maxMembers}).connect();}
  if(mode!=='steam')throw new Error('INVALID_MODE');const{SteamTransport}=require(path.join(kitRoot(),'runtime','steam-transport'));return new SteamTransport({project:'ai-tea-draw-v1',appId:480,maxMembers,lobbyType:2});
}
async function startApp({mode='steam',hub,data=path.join(__dirname,'..','data'),port=0,transport,open=false,guideUrl=process.env.AI_TEA_GUIDE_URL}={}){
  if(guideUrl){const guide=new URL(guideUrl);if(guide.protocol!=='https:'||guide.username||guide.password)throw new Error('GUIDE_HTTPS_REQUIRED');guideUrl=guide.href;}
  transport=transport||await makeTransport({mode,hub});
  const service=new SessionService({transport,data,mode,hub});const uiToken=randomBytes(32).toString('base64url'),drawToken=randomBytes(32).toString('base64url');const tokens=new Map([[uiToken,true],[drawToken,false]]);
  const readState=admin=>({...service.view(admin),onboarding:{guideUrl:guideUrl||null}});
  const publicRoot=path.join(__dirname,'..','public');const sockets=new Map();let base;
  const response=(res,status,content,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(typeof content==='string'?content:JSON.stringify(content));};
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.headers.host!==new URL(base).host)return response(res,403,{ok:false,error:{code:'INVALID_HOST'}});
      if(req.headers.origin&&req.headers.origin!==base)return response(res,403,{ok:false,error:{code:'INVALID_ORIGIN'}});
      const url=new URL(req.url,base);
      if(url.pathname.startsWith('/api/')){
        const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!tokens.has(token))return response(res,401,{ok:false,error:{code:'UNAUTHORIZED'}});const admin=tokens.get(token);
        if(req.method==='GET'&&url.pathname==='/api/state')return response(res,200,readState(admin));
        if(req.method==='GET'&&url.pathname==='/api/canvas')return response(res,200,service.canvas(),'image/svg+xml');
        if(req.method!=='POST'||url.pathname!=='/api/command')return response(res,404,{ok:false,error:{code:'NOT_FOUND'}});
        let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>600*1024)return response(res,413,{ok:false,error:{code:'REQUEST_TOO_LARGE'}});chunks.push(chunk);}const body=Buffer.concat(chunks).toString('utf8');
        let command;try{command=JSON.parse(body);}catch{return response(res,400,{ok:false,error:{code:'INVALID_JSON'}});}
        service.throttle('api:'+token);
        if(command.name==='session.open'){openBrowser(browserUrl);return response(res,200,{ok:true,result:{status:'opened'}});}
        const result=await service.command(command.name,command.args||{},{id:command.id||randomUUID(),admin});return response(res,200,{ok:true,result});
      }
      if(req.method!=='GET')return response(res,405,'Method not allowed','text/plain');
      const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/studio.html':'studio.html','/studio.js':'studio.js','/studio.css':'studio.css'};const file=files[url.pathname];if(!file)return response(res,404,'Not found','text/plain');
      response(res,200,fs.readFileSync(path.join(publicRoot,file),'utf8'),file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
    }catch(e){response(res,400,{ok:false,error:{code:e.code||'COMMAND_FAILED',message:e.message}});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=24;
  const wss=new WebSocketServer({noServer:true,maxPayload:1024});
  server.on('upgrade',(req,socket,head)=>{
    try{const url=new URL(req.url,base);const token=url.searchParams.get('token');if(req.headers.host!==new URL(base).host||url.pathname!=='/events'||!tokens.has(token)||(req.headers.origin&&req.headers.origin!==base)||sockets.size>=8){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req,tokens.get(token)));}catch{socket.destroy();}
  });
  wss.on('connection',(ws,req,admin)=>{sockets.set(ws,admin);ws.send(JSON.stringify({type:'state',state:readState(admin)}));ws.on('message',()=>ws.close(1008,'Read only'));ws.on('close',()=>sockets.delete(ws));});
  service.on('state',()=>{for(const[ws,admin]of sockets)if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>16*1024*1024){ws.close(1013,'Slow viewer');continue;}ws.send(JSON.stringify({type:'state',state:readState(admin)}));}});
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){await service.close();throw e;}
  base=`http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(data,{recursive:true});const sessionFile=path.join(data,'session.json');fs.writeFileSync(sessionFile,JSON.stringify({url:base,token:drawToken,pid:process.pid,protocol:1,mode},null,2),{mode:0o600});
  const browserUrl=`${base}/#token=${uiToken}`;
  if(open)openBrowser(browserUrl);
  return{service,url:base,browserUrl,uiToken,drawToken,sessionFile,server,async close(){for(const ws of sockets.keys())ws.terminate();await new Promise(resolve=>wss.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();try{const existing=JSON.parse(fs.readFileSync(sessionFile));if(existing.pid===process.pid)fs.unlinkSync(sessionFile);}catch{}}};
}
function openBrowser(url){if(process.platform==='win32'){const encoded=Buffer.from(`Start-Process '${url.replace(/'/g,"''")}'`,'utf16le').toString('base64');const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',encoded],{windowsHide:true,stdio:'ignore',detached:true});child.unref();}else{const child=spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore',detached:true});child.unref();}}
function parseArgs(argv){const options={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--no-open')options.open=false;else if(key==='--open')options.open=true;else if(['--mode','--hub','--data','--port','--guide-url'].includes(key)){options[key==='--guide-url'?'guideUrl':key.slice(2)]=argv[++i];}else throw new Error(`Unknown option ${key}`);}if(options.port!==undefined)options.port=Number(options.port);return options;}
if(require.main===module){let app;startApp({open:true,...parseArgs(process.argv.slice(2))}).then(value=>{app=value;console.log(JSON.stringify({event:'ready',url:app.url,sessionFile:app.sessionFile,mode:app.service.mode}));let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);}).catch(e=>{console.error(JSON.stringify({status:'blocked',code:'STARTUP_FAILED',message:e.message}));process.exit(2);});}
module.exports={startApp,makeTransport,kitRoot,openBrowser,parseArgs};
