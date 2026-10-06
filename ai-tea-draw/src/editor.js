'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {sanitizeSvg,parseSvgTree}=require('./svg');
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const TYPES=new Set(['g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop']);
const SAFE_ID=/^[A-Za-z0-9_-]{1,80}$/;
function walk(root,fn,parent=null){fn(root,parent);for(const child of root.children||[])walk(child,fn,root);}
function find(root,id){let found;walk(root,(node,parent)=>{if(node.key===id)found={node,parent};});return found;}
function node(tag,attrs={},key=randomUUID(),children=[]){return{key,tag,attrs:clone(attrs),children};}
function xml(root,visibleOnly=false){
  if(visibleOnly&&root.hidden)return '';
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  return `<${root.tag}${Object.entries(root.attrs).map(([key,value])=>` ${key}="${escape(value)}"`).join('')}>${root.children.map(child=>xml(child,visibleOnly)).join('')}</${root.tag}>`;
}
function compile(draft){sanitizeSvg(xml(draft.root));return sanitizeSvg(xml(draft.root,true));}
function makeDraft(actor,args={}){
  const width=args.width??1024,height=args.height??768;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>2048||height>2048)fail('INVALID_DIMENSIONS');
  let root=args.svg?parseSvgTree(args.svg).root:{tag:'svg',attrs:{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${width} ${height}`,width,height},children:[]};
  walk(root,item=>{item.key=randomUUID();});
  const draft={id:randomUUID(),authorId:actor,revision:0,nextSeq:1,taskId:args.taskId||null,phaseId:args.phaseId||null,root,history:[],redo:[],receipts:[],publishedRevision:null,createdAt:Date.now()};
  draft.initialRoot=clone(root);draft.operations=[];draft.logComplete=true;compile(draft);return draft;
}
function applyOperation(draft,operation){
  if(!operation||typeof operation!=='object'||Array.isArray(operation))fail('INVALID_OPERATION');
  const target=operation.nodeId?find(draft.root,operation.nodeId):null;
  const requireNode=()=>{if(!target||!target.parent)fail('NODE_NOT_FOUND');return target;};
  const ancestry=target|| (operation.parentId?find(draft.root,operation.parentId):null);
  if(operation.op!=='meta'&&ancestry){let current=ancestry.node;while(current){if(current.locked)fail('LAYER_LOCKED');current=find(draft.root,current.key)?.parent;}}
  if(operation.op==='move'&&operation.parentId){let current=find(draft.root,operation.parentId)?.node;while(current){if(current.locked)fail('LAYER_LOCKED');current=find(draft.root,current.key)?.parent;}}
  if(operation.op==='add'){
    if(!TYPES.has(operation.tag)||!operation.attrs||typeof operation.attrs!=='object'||Array.isArray(operation.attrs))fail('INVALID_OPERATION');
    const key=operation.nodeId||randomUUID();if(!SAFE_ID.test(key)||find(draft.root,key))fail('NODE_ID_CONFLICT');
    const parent=operation.parentId?find(draft.root,operation.parentId)?.node:draft.root;
    if(!parent||!['svg','g','defs','linearGradient','radialGradient'].includes(parent.tag))fail('INVALID_PARENT');
    parent.children.push(node(operation.tag,operation.attrs,key));
  }else if(operation.op==='meta'){
    const item=requireNode().node;
    if(operation.hidden!==undefined){if(typeof operation.hidden!=='boolean')fail('INVALID_OPERATION');item.hidden=operation.hidden;}
    if(operation.locked!==undefined){if(typeof operation.locked!=='boolean')fail('INVALID_OPERATION');item.locked=operation.locked;}
    if(operation.label!==undefined){if(typeof operation.label!=='string'||operation.label.length>60)fail('INVALID_OPERATION');item.label=operation.label;}
  }else if(operation.op==='set'){
    const item=requireNode().node;
    if(!operation.attrs||typeof operation.attrs!=='object'||Array.isArray(operation.attrs)||Object.keys(operation.attrs).length>30)fail('INVALID_OPERATION');
    for(const [key,value]of Object.entries(operation.attrs)){if(['__proto__','constructor','prototype','id'].includes(key))fail('INVALID_OPERATION');if(value===null)delete item.attrs[key];else if(typeof value==='string'||typeof value==='number')item.attrs[key]=value;else fail('INVALID_OPERATION');}
  }else if(operation.op==='append'){
    const item=requireNode().node;if(item.tag!=='path'||typeof operation.d!=='string'||operation.d.length>16384||!/^[LCQZlcqz]/.test(operation.d.trim()))fail('INVALID_PATH_APPEND');
    item.attrs.d=(item.attrs.d||'')+' '+operation.d;
  }else if(operation.op==='remove'){
    const item=requireNode();item.parent.children.splice(item.parent.children.indexOf(item.node),1);
  }else if(operation.op==='move'){
    const item=requireNode(),parent=operation.parentId?find(draft.root,operation.parentId)?.node:item.parent;
    if(!parent||!['svg','g'].includes(parent.tag))fail('INVALID_PARENT');
    let cycle=false;walk(item.node,current=>{if(current===parent)cycle=true;});if(cycle)fail('INVALID_PARENT');
    if(!Number.isInteger(operation.index)||operation.index<0||operation.index>parent.children.length)fail('INVALID_INDEX');
    item.parent.children.splice(item.parent.children.indexOf(item.node),1);parent.children.splice(Math.min(operation.index,parent.children.length),0,item.node);
  }else if(operation.op==='duplicate'){
    const item=requireNode(),copy=clone(item.node);walk(copy,current=>{current.key=randomUUID();});
    const remap=new Map();walk(copy,current=>{if(current.attrs.id){const next='copy-'+randomUUID();remap.set(current.attrs.id,next);current.attrs.id=next;}});
    walk(copy,current=>{for(const key of ['fill','stroke'])if(typeof current.attrs[key]==='string')current.attrs[key]=current.attrs[key].replace(/url\(#([^)]+)\)/g,(all,id)=>remap.has(id)?`url(#${remap.get(id)})`:all);});
    if(operation.transform)copy.attrs.transform=operation.transform;
    item.parent.children.splice(item.parent.children.indexOf(item.node)+1,0,copy);
  }else fail('UNKNOWN_OPERATION');
}
function patchDraft(draft,args){
  if(args.draftId!==draft.id)fail('DRAFT_NOT_FOUND');
  const hash=digest({baseRevision:args.baseRevision,operations:args.operations});
  const previous=draft.receipts.find(item=>item.seq===args.seq);
  if(previous){if(previous.hash!==hash)fail('IDEMPOTENCY_CONFLICT');return clone(previous.result);}
  if(!Number.isInteger(args.seq)||args.seq!==draft.nextSeq)fail('STREAM_SEQUENCE',`expectedSeq=${draft.nextSeq}`);
  if(args.baseRevision!==draft.revision)fail('STALE_DRAFT');
  if(!Array.isArray(args.operations)||args.operations.length<1||args.operations.length>64||Buffer.byteLength(JSON.stringify(args.operations))>65536)fail('OPERATION_BUDGET');
  const candidate=clone(draft),operations=clone(args.operations);for(const operation of operations){if(operation.op==='add'&&!operation.nodeId)operation.nodeId=randomUUID();applyOperation(candidate,operation);}
  const asset=compile(candidate);
  if(Buffer.byteLength(JSON.stringify(candidate.root))>512*1024)fail('DOCUMENT_BUDGET');
  candidate.history.push(clone(draft.root));candidate.history=candidate.history.slice(-10);candidate.redo=[];
  while(Buffer.byteLength(JSON.stringify(candidate.history))>512*1024)candidate.history.shift();
  candidate.revision++;candidate.nextSeq++;
  log(candidate,operations.some(op=>op.op==='duplicate')?{revision:candidate.revision,restoreRoot:clone(candidate.root)}:{revision:candidate.revision,seq:args.seq,operations});
  const result={draftId:draft.id,revision:candidate.revision,acceptedSeq:args.seq,nextSeq:candidate.nextSeq,nodeIds:operations.filter(op=>op.op==='add').map(op=>op.nodeId),hash:asset.hash,stats:asset.stats};
  candidate.receipts.push({seq:args.seq,hash,result});candidate.receipts=candidate.receipts.slice(-64);
  Object.assign(draft,candidate);return result;
}
function undoDraft(draft,args,redo=false){
  if(args.draftId!==draft.id)fail('DRAFT_NOT_FOUND');if(args.baseRevision!==draft.revision)fail('STALE_DRAFT');
  const source=redo?draft.redo:draft.history,target=redo?draft.history:draft.redo;
  if(!source.length)fail('HISTORY_EMPTY');target.push(clone(draft.root));draft.root=source.pop();draft.revision++;
  log(draft,{revision:draft.revision,restoreRoot:clone(draft.root)});
  return{draftId:draft.id,revision:draft.revision,nextSeq:draft.nextSeq};
}
function draftView(draft){const asset=compile(draft);return{id:draft.id,revision:draft.revision,nextSeq:draft.nextSeq,taskId:draft.taskId,phaseId:draft.phaseId,root:clone(draft.root),svg:asset.svg,stats:asset.stats,undoAvailable:!!draft.history.length,redoAvailable:!!draft.redo.length,publishedRevision:draft.publishedRevision};}
function log(draft,entry){draft.operations||=[];draft.operations.push(entry);if(Buffer.byteLength(JSON.stringify(draft.operations))>1024*1024||draft.operations.length>1000){draft.operations=[];draft.initialRoot=clone(draft.root);draft.logComplete=false;}}
module.exports={makeDraft,patchDraft,undoDraft,draftView,compile,xml,walk,find};
