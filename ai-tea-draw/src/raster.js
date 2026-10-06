'use strict';
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {sanitizeSvg}=require('./svg');
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const hash=data=>createHash('sha256').update(data).digest('hex');
let pending=0,serial=Promise.resolve();
function renderPNG(svg,{width=768,timeoutMs=5000}={}){
  if(!Number.isInteger(width)||width<16||width>1024) return Promise.reject(fail('RENDER_DIMENSIONS'));
  const asset=sanitizeSvg(svg);
  if(pending>=4)return Promise.reject(fail('RENDER_BUSY','图片处理繁忙，请稍后重试'));
  pending++;
  const job=serial.then(()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=128',__filename,'--worker'],{windowsHide:true,stdio:['pipe','pipe','ignore'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
    let output='',done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);child.kill();if(error)reject(error);else resolve(result);};
    const timer=setTimeout(()=>finish(fail('RENDER_TIMEOUT','图片处理超时')),timeoutMs);
    child.on('error',()=>finish(fail('RENDER_UNAVAILABLE')));child.stdin.on('error',()=>{});
    child.stdout.on('data',part=>{output+=part.toString();if(Buffer.byteLength(output)>3*1024*1024)finish(fail('RENDER_BUDGET'));});
    child.on('exit',code=>{if(done)return;try{const result=JSON.parse(output);if(code||result.error)throw fail('RENDER_FAILED');const png=Buffer.from(result.png,'base64');if(png.length>512*1024||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw fail('RENDER_BUDGET');finish(null,{svg:asset.svg,svgHash:asset.hash,png:result.png,pngHash:hash(png),width:result.width,height:result.height});}catch(error){finish(error.code?error:fail('RENDER_FAILED'));}});
    child.stdin.end(JSON.stringify({svg:asset.svg,width}));
  }));
  serial=job.catch(()=>{});return job.finally(()=>{pending--;});
}
async function worker(){try{
  let raw='';for await(const part of process.stdin){raw+=part.toString();if(Buffer.byteLength(raw)>300*1024)throw fail('RENDER_BUDGET');}
  const request=JSON.parse(raw),asset=sanitizeSvg(request.svg),{Resvg}=require('@resvg/resvg-js');
  const zoom=Math.min(request.width/asset.viewBox[2],1024/asset.viewBox[3]);
  const image=new Resvg(asset.svg,{fitTo:{mode:'zoom',value:zoom},background:'#ffffff',font:{loadSystemFonts:false}}).render();
  const png=image.asPng();if(png.length>512*1024)throw fail('RENDER_BUDGET');
  process.stdout.write(JSON.stringify({png:png.toString('base64'),width:image.width,height:image.height}));
}catch(error){process.stdout.write(JSON.stringify({error:error.code||'RENDER_FAILED'}));process.exitCode=1;}}
if(process.argv[2]==='--worker')worker();
module.exports={renderPNG};
