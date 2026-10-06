#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { TeaClient, TeaError, readBoundedText, errorResult, MAX_SVG_BYTES } = require('./client');

const HELP = {
  name: 'ai-tea', version: require('../package.json').version, session: '--session FILE 或 AI_TEA_SESSION；默认为 data/session.json',
  output: '所有结果为 JSON，成功退出 0，错误退出 1。Agent 默认仅有本人绘图权限。',
  commands: {
    status: '读取房间、本人区域、预算和已发布作品。',
    create: '--name NAME [--max-members 4] [--policy strict|trusted] [--game-mode telephone|guess_draw] [--review-policy moderator-strict|participant-confirm] 开房；需要已启动的本机会话。',
    join: '--invite-file FILE 或 --invite STRING [--name NAME] 加入。邀请默认通过文件或 stdin 传入。',
    validate: '--file SVG 检查草稿，不提交。--file - 从 stdin 读取。',
    reserve: '[--x N --y N --width N --height N] 预留本人区域内的五分钟绘制任务。',
    cancel: '[--lease-id ID] 释放本人当前绘制任务，不删除作品。',
    submit: '--file SVG [--name NAME] [--x N --y N --width N --height N] [--lease-id ID] [--object-id ID --base-revision N]；有任务预留时必须附相应 lease-id，返回待审不代表发布。',
    proposals: '读取自己可见的提案。',
    approve: '--proposal-id ID --hash HASH；要求独立管理权限，默认 Agent 凭据会被拒绝。',
    reject: '--proposal-id ID [--reason TEXT]；要求管理权限。',
    export: '--out FILE 导出安全 SVG。',
    undo: '--object-id ID --base-revision N 撤销本人作品的最新版本。',
    freeze: '冻结绘图；要求管理权限。',
    unfreeze: '恢复绘图；要求管理权限。',
    leave: '退出当前房间。',
    name: '--name NAME 修改显示名。',
    rules: '读取房规和额度。',
    context: '读取公共画布与本人区域。',
    game: '--action create|ready|status|task|submit|guess|replay [--args-file JSON] [--out FILE]；交卷/猜测携带当前 taskId+phaseId，猜测另需 checkpointId。',
    draw: '--action open|read|patch|undo|redo|preview|publish|export [--args-file JSON] [--out FILE]；游戏草稿须绑定当前绘画任务。',
    stream: '--file NDJSON 或 --file - [--draft-id ID]；完整行即时提交，收到回执后继续，自动填写 seq/baseRevision。',
    'agent-context': '[--source true] [--out FILE]；当前任务、获准 PNG、本人节点与公开技法。'
  },
  options: '--session FILE、--json、--id ID（指定幂等键）。不初始化第二份 Steam。'
};

function parseArgs(argv) {
  const options = Object.create(null); let command;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg.startsWith('--')) {
      const equal = arg.indexOf('=');
      const key = equal >= 0 ? arg.slice(2, equal) : arg.slice(2);
      const value = equal >= 0 ? arg.slice(equal + 1) : argv[++i];
      if (!key || value === undefined || value.startsWith('--')) throw new TeaError('INVALID_ARGUMENT', `参数 --${key} 缺少值。`);
      if (Object.hasOwn(options, key)) throw new TeaError('INVALID_ARGUMENT', `参数 --${key} 重复。`);
      options[key] = value;
    } else if (!command) command = arg;
    else throw new TeaError('INVALID_ARGUMENT', '不接受额外的位置参数。');
  }
  return { command, options };
}

function required(options, key) {
  if (typeof options[key] !== 'string' || !options[key]) throw new TeaError('INVALID_ARGUMENT', `必须提供 --${key}。`);
  return options[key];
}
function numberOption(options, key, fallback) {
  if (options[key] === undefined) return fallback;
  const value = Number(options[key]);
  if (!Number.isFinite(value)) throw new TeaError('INVALID_ARGUMENT', `--${key} 必须是有限数字。`);
  return value;
}
async function readInput(file, stream = process.stdin, maxBytes = MAX_SVG_BYTES) {
  if (file !== '-') return readBoundedText(file, maxBytes);
  const parts = []; let bytes = 0;
  for await (const part of stream) {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new TeaError('FILE_TOO_LARGE', 'stdin 内容超出大小限制。');
    parts.push(buffer);
  }
  return Buffer.concat(parts).toString('utf8');
}

function assertOptions(command, options) {
  const allowed = {
    status: [], create: ['name', 'max-members', 'policy','game-mode','review-policy'], join: ['invite-file', 'invite', 'name'],
    validate: ['file'], reserve: ['x', 'y', 'width', 'height'], cancel: ['lease-id'], submit: ['file', 'name', 'x', 'y', 'width', 'height', 'lease-id', 'object-id', 'base-revision'],
    proposals: [], approve: ['proposal-id', 'hash'], reject: ['proposal-id', 'reason'], export: ['out'],
    undo: ['object-id', 'base-revision'], freeze: [], unfreeze: [], leave: [], name: ['name'], rules: [], context: [],
    game:['action','args-file','out'],draw:['action','args-file','out'],stream:['file','draft-id'], 'agent-context':['source','out']
  };
  if (!Object.hasOwn(allowed, command)) throw new TeaError('UNKNOWN_COMMAND', '未知命令，请使用 --help。');
  const keys = new Set(['session', 'json', 'help', 'id', ...allowed[command]]);
  for (const key of Object.keys(options)) if (!keys.has(key)) throw new TeaError('INVALID_ARGUMENT', `此命令不接受 --${key}。`);
}

async function execute(command, options, { client = new TeaClient({ sessionFile: options.session }), stdin = process.stdin } = {}) {
  assertOptions(command, options);
  const operation = options.id ? { id: options.id } : {};
  const call = (name, args) => client.command(name, args, operation);
  switch (command) {
    case 'status': return client.state();
    case 'rules': return call('room.rules', {});
    case 'context': return call('scene.read', {});
    case 'create': return call('room.create', { name: options.name || 'AI 茶绘', maxMembers: numberOption(options, 'max-members', 4), policy: options.policy === 'familiar' ? 'trusted' : options.policy || 'strict',...(options['game-mode']?{gameMode:options['game-mode'],reviewPolicy:options['review-policy']||'moderator-strict'}:{}) });
    case 'agent-context':return writeResult(await call('agent.context',{includeSource:options.source==='true'}),options.out);
    case 'game':case 'draw':{
      const prefix=command==='game'?'game':'drawing',action=required(options,'action');
      const actions=command==='game'?['create','ready','status','task','submit','guess','replay']:['open','read','patch','undo','redo','preview','publish','export'];
      if(!actions.includes(action))throw new TeaError('INVALID_ARGUMENT','此动作不可由Agent使用。');
      const args=options['args-file']?JSON.parse(await readInput(options['args-file'],stdin,300*1024)):{};
      return writeResult(await call(prefix+'.'+action,args),options.out);
    }
    case 'stream':return streamOperations(client,options,{stdin});
    case 'join': {
      if (Boolean(options.invite) === Boolean(options['invite-file'])) throw new TeaError('INVALID_ARGUMENT', '--invite 与 --invite-file 必须且只能选一个。');
      const invite = options.invite || (await readInput(options['invite-file'], stdin, 16 * 1024)).trim();
      return call('room.join', { invite, ...(options.name ? { name: options.name } : {}) });
    }
    case 'validate': return call('draft.validate', { svg: await readInput(required(options, 'file'), stdin) });
    case 'reserve': {
      const args = {};
      for (const key of ['x', 'y', 'width', 'height']) if (options[key] !== undefined) args[key] = numberOption(options, key);
      return call('region.reserve', args);
    }
    case 'cancel': return call('job.cancel', options['lease-id'] ? { leaseId: options['lease-id'] } : {});
    case 'submit': {
      const args = { svg: await readInput(required(options, 'file'), stdin) };
      if (options.name) args.name = options.name;
      for (const key of ['x', 'y', 'width', 'height']) if (options[key] !== undefined) args[key] = numberOption(options, key);
      if (options['object-id']) args.objectId = options['object-id'];
      if (options['lease-id']) args.leaseId = options['lease-id'];
      if (options['base-revision'] !== undefined) args.baseRevision = numberOption(options, 'base-revision');
      return call('proposal.submit', args);
    }
    case 'proposals': return call('proposals.list', {});
    case 'approve': return call('proposal.approve', { proposalId: required(options, 'proposal-id'), hash: required(options, 'hash') });
    case 'reject': return call('proposal.reject', { proposalId: required(options, 'proposal-id'), reason: options.reason || '' });
    case 'freeze': return call('room.freeze', { frozen: true });
    case 'unfreeze': return call('room.freeze', { frozen: false });
    case 'leave': return call('room.leave', {});
    case 'name': return call('session.name', { name: required(options, 'name') });
    case 'undo': {
      required(options, 'base-revision');
      const baseRevision = numberOption(options, 'base-revision');
      if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new TeaError('INVALID_ARGUMENT', '--base-revision 必须是非负整数。');
      return call('scene.undo', { objectId: required(options, 'object-id'), baseRevision });
    }
    case 'export': {
      const file = path.resolve(required(options, 'out'));
      const result = await call('scene.export', {});
      const svg = typeof result === 'string' ? result : result?.svg;
      if (typeof svg !== 'string') throw new TeaError('INVALID_RESPONSE', '服务未返回可导出的 SVG。');
      await fs.writeFile(file, svg, 'utf8');
      return { path: file, bytes: Buffer.byteLength(svg), ...(result?.hash ? { hash: result.hash } : {}) };
    }
  }
}
async function writeResult(result,out){if(!out)return result;const file=path.resolve(out);
  const bytes=result.png?Buffer.from(result.png,'base64'):Buffer.from(result.svg||JSON.stringify(result,null,2));await fs.writeFile(file,bytes);return{path:file,bytes:bytes.length,revision:result.revision};}
async function streamOperations(client,options,{stdin=process.stdin,output=process.stdout}={}){
  const file=required(options,'file'),input=file==='-'?stdin:require('node:fs').createReadStream(file);
  const decoder=new (require('node:string_decoder').StringDecoder)('utf8');let draft=await client.command('drawing.read',options['draft-id']?{draftId:options['draft-id']}:{}),buffer='',count=0,last=0;
  const processLine=async line=>{if(!line.trim())return;if(Buffer.byteLength(line)>65536)throw new TeaError('OPERATION_BUDGET','每行最多64KiB。');
    const frame=JSON.parse(line);if(!frame||typeof frame!=='object'||Array.isArray(frame))throw new TeaError('INVALID_ARGUMENT','每行须为操作对象。');
    const args={draftId:draft.id,seq:draft.nextSeq,baseRevision:draft.revision,...frame};
    if(args.draftId!==draft.id)throw new TeaError('DRAFT_NOT_FOUND','不能在流中切换草稿。');
    const delay=550-(Date.now()-last);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    const result=await client.command('drawing.patch',args,{id:'stream-'+draft.id+'-'+args.seq});last=Date.now();
    draft.revision=Math.max(draft.revision,result.revision);draft.nextSeq=Math.max(draft.nextSeq,result.nextSeq);count++;if(!output.destroyed)output.write(JSON.stringify({ok:true,ack:result})+'\n');
  };
  for await(const chunk of input){buffer+=decoder.write(chunk);let index;while((index=buffer.indexOf('\n'))>=0){await processLine(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(Buffer.byteLength(buffer)>65536)throw new TeaError('OPERATION_BUDGET','缺少换行或操作行过长。');}
  buffer+=decoder.end();if(buffer.trim())await processLine(buffer);return{status:'stream_complete',draftId:draft.id,revision:draft.revision,nextSeq:draft.nextSeq,batches:count};
}
HELP.commands.game='--action create|ready|status|task|submit|guess|replay [--args-file JSON] [--out FILE]';
HELP.commands.draw='--action open|read|patch|undo|redo|preview|publish|export [--args-file JSON] [--out FILE]；preview可写PNG。';
HELP.commands.stream='--file NDJSON或- [--draft-id ID]；每行{operations:[...]}，每批即时发送和ack，需生产方即时刷新stdout。';
HELP.commands['agent-context']='[--source true] [--out FILE] 读取当前任务与获准公开的SVG技法。';

async function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseArgs(argv);
    if (options.help || !command || command === 'help') { process.stdout.write(`${JSON.stringify({ ok: true, result: HELP })}\n`); return; }
    const result = await execute(command, options);
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorResult(error))}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { main, execute, parseArgs, HELP, readInput,streamOperations };
