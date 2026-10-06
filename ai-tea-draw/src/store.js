'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {hash}=require('./engine');
class Store {
  constructor(directory,{maxBytes=20*1024*1024}={}) { this.maxBytes=maxBytes;this.directory=path.resolve(directory); fs.mkdirSync(this.directory,{recursive:true}); this.log=path.join(this.directory,'commits.jsonl'); this.snapshot=path.join(this.directory,'canvas.json'); }
  load() {
    let latest=null;
    if (fs.existsSync(this.snapshot)) { const record=JSON.parse(fs.readFileSync(this.snapshot,'utf8')); if(hash(record.data)!==record.hash) throw new Error('ARCHIVE_HASH_MISMATCH'); latest=record.data; }
    if (fs.existsSync(this.log)) {
      const bytes=fs.readFileSync(this.log,'utf8');
      const lines=bytes.split('\n');
      for(let i=0;i<lines.length-1;i++) { if(!lines[i]) continue; const record=JSON.parse(lines[i]); if(hash(record.data)!==record.hash) throw new Error('JOURNAL_HASH_MISMATCH'); latest=record.data; }
      // An incomplete tail was never acknowledged; remove it before appending again.
      if(lines.at(-1)) fs.truncateSync(this.log,Buffer.byteLength(bytes.slice(0,bytes.lastIndexOf('\n')+1)));
    }
    return latest;
  }
  save(data) {
    const record=JSON.stringify({time:new Date().toISOString(),hash:hash(data),data});
    if(Buffer.byteLength(record)>this.maxBytes)throw new Error('ARCHIVE_BUDGET');
    const descriptor=fs.openSync(this.log,'a'); try{fs.writeFileSync(descriptor,record+'\n');fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
    if(fs.statSync(this.log).size>16*1024*1024) {
      const temporary=this.snapshot+'.tmp'; const fd=fs.openSync(temporary,'w');try{fs.writeFileSync(fd,record);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      fs.renameSync(temporary,this.snapshot); fs.truncateSync(this.log,0);
    }
  }
}
module.exports={Store};
