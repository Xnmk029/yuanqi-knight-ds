const fs=require('fs'), path=require('path');
const { createCanvas, loadImage } = require(path.join(__dirname,'node_modules','@napi-rs','canvas'));
const OUT=path.join(__dirname,'..','shots');
const REG={ '血条HUD':[10,10,320,90], '武器槽':[10,620,240,90], '小地图':[1110,10,160,120], '画面中心':[420,200,440,320] };
(async()=>{
  console.log('=== 场景帧分析 ===');
  for(const f of fs.readdirSync(OUT).filter(x=>x.endsWith('.png')&&!x.startsWith('_'))){
    const img=await loadImage(path.join(OUT,f));
    const w=img.width,h=img.height;
    const cv=createCanvas(w,h), c=cv.getContext('2d');
    c.drawImage(img,0,0);
    const d=c.getImageData(0,0,w,h).data;
    let sum=0,lit=0,bright=0; const cols=new Set(); const hues=new Set();
    for(let i=0;i<w*h;i++){
      const r=d[i*4],g=d[i*4+1],b=d[i*4+2];
      const l=r*0.3+g*0.59+b*0.11;
      sum+=l; if(l>20) lit++; if(l>150) bright++;
      if(i%5===0){ cols.add((r>>4)+','+(g>>4)+','+(b>>4));
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
        if(mx-mn>30){ let hu=0; if(mx===r)hu=((g-b)/(mx-mn))%6; else if(mx===g)hu=(b-r)/(mx-mn)+2; else hu=(r-g)/(mx-mn)+4; hues.add(Math.round(hu*60/20)); }
      }
    }
    let line=f.padEnd(20)+' 平均亮度='+(sum/(w*h)).toFixed(1).padStart(5)
      +' 有效像素='+(100*lit/(w*h)).toFixed(1).padStart(5)+'%'
      +' 高光='+(100*bright/(w*h)).toFixed(2).padStart(5)+'%'
      +' 色块数='+String(cols.size).padStart(4)+' 色相数='+String(hues.size).padStart(3);
    if(f.startsWith('s')&&!f.startsWith('sheet')){
      const parts=[];
      for(const k in REG){ const [x,y,rw,rh]=REG[k];
        const rd=c.getImageData(x,y,rw,rh).data; let ink=0;
        for(let i=0;i<rw*rh;i++){ if(rd[i*4]*0.3+rd[i*4+1]*0.59+rd[i*4+2]*0.11>34) ink++; }
        parts.push(k+' '+(100*ink/(rw*rh)).toFixed(0)+'%');
      }
      line+='  ['+parts.join(' / ')+']';
    }
    console.log(line);
  }
})();
