'use strict';
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { TeaClient, TeaError, loadSession, readBoundedText } = require('./client');
const { decodeInvite } = require('./session');
const { version } = require('../package.json');
const APP_ROOT = path.resolve(__dirname, '..');
const MAX_INVITE_BYTES = 16384, LOCK_WAIT_MS = 25000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const digest = value => createHash('sha256').update(value).digest('hex');
function checkCancelled(signal) {
  if (signal?.aborted) throw new TeaError('CANCELLED', '操作已取消；已经完成的本机启动或房间动作会保留。');
}
function pause(ms, signal) {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new TeaError('CANCELLED', '等待已取消。')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function textOption(value, name, fallback, max = 80) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new TeaError('INVALID_ARGUMENT', `${name} 必须是 1 到 ${max} 字符的非空文本。`);
  return value.trim();
}
function guideOption(value) {
  if (value === undefined || value === null || value === '') return undefined;
  let url;
  try { url = new URL(value); } catch { throw new TeaError('GUIDE_HTTPS_REQUIRED', '接入指引必须使用可信的 HTTPS URL。'); }
  if (typeof value !== 'string' || value.length > 2048 || url.protocol !== 'https:' || url.username || url.password) throw new TeaError('GUIDE_HTTPS_REQUIRED', '接入指引必须使用可信的 HTTPS URL，且不能带账号凭据。');
  return url.href;
}
function hubOption(value) {
  let url;
  try { url = new URL(value); } catch { throw new TeaError('MOCK_HUB_REQUIRED', '测试模式必须明确提供本机 mock hub。'); }
  if (typeof value !== 'string' || url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new TeaError('INVALID_HUB', 'mock hub 必须是本机 127.0.0.1 WebSocket URL。');
  return value;
}
function modeOptions(options) {
  const mode = options.mode === undefined ? 'steam' : options.mode;
  if (!['steam', 'mock'].includes(mode)) throw new TeaError('INVALID_MODE', 'mode 只能是 steam 或显式测试使用的 mock。');
  if (mode === 'steam' && options.hub !== undefined) throw new TeaError('INVALID_ARGUMENT', 'Steam 模式不能设置 mock hub。');
  return { mode, ...(mode === 'mock' ? { hub: hubOption(options.hub) } : {}) };
}
function defaultData(options = {}) {
  const { mode, hub } = modeOptions(options);
  const instance = mode === 'mock' ? `mock-${digest(new URL(hub).href).slice(0, 12)}` : 'steam';
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'AI-Tea-Draw', version, instance);
}
function location(options, connection) {
  if (options.data !== undefined && options.sessionFile !== undefined) throw new TeaError('INVALID_ARGUMENT', 'data 和 sessionFile 不能同时设置。');
  if (options.sessionFile !== undefined) {
    const sessionFile = path.resolve(textOption(options.sessionFile, 'sessionFile', undefined, 32768));
    return { sessionFile, data: path.dirname(sessionFile), explicit: true };
  }
  const data = path.resolve(options.data === undefined ? defaultData(connection) : textOption(options.data, 'data', undefined, 32768));
  return { data, sessionFile: path.join(data, 'session.json'), explicit: false };
}
function checkEndpoint(endpoint, expected) {
  const actualMode = endpoint.state.connection?.mode;
  if (expected.mode && actualMode !== expected.mode) throw new TeaError('SESSION_MODE_MISMATCH', '这个会话目录已经连接另一种联机模式，请使用独立的会话目录。');
  if (expected.mode === 'mock') {
    const actualHub = endpoint.state.connection?.hub;
    if (!actualHub || new URL(actualHub).href !== new URL(expected.hub).href) throw new TeaError('SESSION_MODE_MISMATCH', '这个会话目录已经连接另一个 mock hub，请使用独立的会话目录。');
  }
}
async function readEndpoint(file) {
  let session;
  try { session = await loadSession(file); }
  catch (error) { if (error.code === 'SESSION_NOT_FOUND') return null; throw new TeaError('SESSION_UNAVAILABLE', '本机会话文件无效，无法安全复用。'); }
  if (!Number.isInteger(session.pid) || session.pid < 1) throw new TeaError('SESSION_UNAVAILABLE', '会话文件没有有效的服务进程 ID。');
  if (!processAlive(session.pid)) return null;
  const client = new TeaClient({ sessionFile: file, timeoutMs: 1800 });
  let state;
  try { state = await client.state(); } catch { throw new TeaError('SESSION_UNAVAILABLE', '会话服务进程仍在运行，但端点无法访问；请先检查本机服务。'); }
  if (!state || typeof state !== 'object' || !state.connection || !['steam', 'mock'].includes(state.connection.mode)) throw new TeaError('SESSION_UNAVAILABLE', '本机端点没有返回有效的茶绘服务状态。');
  client.timeoutMs = 20000;
  return { session, client, state, sessionFile: path.resolve(file), url: session.url };
}
async function withLock(directory, name, action, signal) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, name), id = randomUUID(), deadline = Date.now() + LOCK_WAIT_MS;
  let owned = false;
  while (!owned) {
    checkCancelled(signal);
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, id, time: Date.now() })); } finally { await handle.close(); }
      owned = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const record = JSON.parse(await readBoundedText(file, 4096));
        if (Number.isInteger(record.pid) && record.pid > 0 && typeof record.id === 'string' && Number.isFinite(record.time) && !processAlive(record.pid) && Date.now() - record.time > 1000) {
          // Serialize stale-lock recovery too, so two waiters cannot delete a new owner's lock.
          const recovery = `${file}.recovery`;
          let recovering = false;
          try {
            await fs.mkdir(recovery); recovering = true;
            if (JSON.parse(await fs.readFile(file, 'utf8')).id === record.id) await fs.unlink(file);
          } finally { if (recovering) await fs.rmdir(recovery); }
        }
      } catch { /* A newly written or malformed lock stays locked until its owner resolves it. */ }
      if (Date.now() >= deadline) throw new TeaError('LIFECYCLE_LOCKED', '另一个 Agent 正在准备或操作同一本机会话，请稍后重试。');
      await pause(100, signal);
    }
  }
  try { checkCancelled(signal); return await action(); }
  finally { try { if (JSON.parse(await fs.readFile(file, 'utf8')).id === id) await fs.unlink(file); } catch { /* Only remove our own lock. */ } }
}
async function ensureEndpoint(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TeaError('INVALID_ARGUMENT', '启动参数必须是对象。');
  const guideUrl = guideOption(options.guideUrl === undefined ? process.env.AI_TEA_GUIDE_URL : options.guideUrl);
  // An explicit session selects its actual service unless transport constraints are also supplied.
  const constrained = !options.sessionFile || own(options, 'mode') || own(options, 'hub');
  const connection = constrained ? modeOptions(options) : {};
  const place = location(options, constrained ? connection : { mode: 'steam' });
  checkCancelled(options.signal);
  if (place.explicit) {
    const endpoint = await readEndpoint(place.sessionFile);
    if (!endpoint) throw new TeaError('SESSION_UNAVAILABLE', '明确指定的本机会话不存在或已经停止；不会启动另一个服务。');
    checkEndpoint(endpoint, connection);
    return { ...endpoint, ...place, started: false };
  }
  return withLock(place.data, 'startup.lock', async () => {
    // Re-read under the startup lock: another Agent may already have prepared the service.
    const existing = await readEndpoint(place.sessionFile);
    if (existing) { checkEndpoint(existing, connection); return { ...existing, ...place, started: false }; }
    checkCancelled(options.signal);
    const args = [path.join(APP_ROOT, 'src/main.js'), '--mode', connection.mode, '--data', place.data, '--no-open'];
    if (connection.mode === 'mock') args.push('--hub', connection.hub);
    if (guideUrl) args.push('--guide-url', guideUrl);
    const log = syncFs.openSync(path.join(place.data, 'runtime.log'), 'a');
    let child;
    try { child = spawn(process.execPath, args, { cwd: APP_ROOT, detached: true, windowsHide: true, stdio: ['ignore', log, log] }); } finally { syncFs.closeSync(log); }
    let spawnError, exited = false;
    child.once('error', error => { spawnError = error; });
    child.once('exit', () => { exited = true; });
    child.unref();
    const deadline = Date.now() + 18000;
    // Finish service discovery after spawning; cancelling cannot undo a process already started.
    while (Date.now() < deadline) {
      if (spawnError || exited) break;
      await pause(120);
      let endpoint;
      try { endpoint = await readEndpoint(place.sessionFile); }
      catch (error) { if (error.code !== 'SESSION_UNAVAILABLE') throw error; }
      if (endpoint) { checkEndpoint(endpoint, connection); return { ...endpoint, ...place, started: true }; }
    }
    if (child.pid && processAlive(child.pid)) child.kill();
    throw new TeaError('STARTUP_BLOCKED', '本机茶绘服务未启动。请检查 Steam 是否登录，以及会话目录中的 runtime.log。');
  }, options.signal);
}
function operationId(value) { return textOption(value, 'operationId', randomUUID(), 100); }
function commonOptions(options, fallbackName) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TeaError('INVALID_ARGUMENT', '生命周期参数必须是对象。');
  const name = textOption(options.name, 'name', fallbackName);
  const open = options.open === undefined ? true : options.open;
  if (typeof open !== 'boolean') throw new TeaError('INVALID_ARGUMENT', 'open 必须是布尔值。');
  const guideUrl = guideOption(options.guideUrl === undefined ? process.env.AI_TEA_GUIDE_URL : options.guideUrl);
  return { name, open, guideUrl, operationId: operationId(options.operationId) };
}
function selectedGuide(explicitGuide, state) { return explicitGuide || guideOption(state.onboarding?.guideUrl); }
function shareMessage(invite, guideUrl) {
  if (guideUrl) return `请按 AI 茶绘接入指引 ${guideUrl} 校验并准备本机程序，加入房间 ${invite}，打开画布、读取房规，然后等待我安排绘图。`;
  return `请加入 AI 茶绘房间 ${invite}，使用你本机已取得的 AI 茶绘程序，按包内 AGENT-START.md 准备并打开画布、读取房规，然后等待我安排绘图；如果还没有程序，请先向房主取得安装包。`;
}
function verifyHostInvite(invite) {
  try { decodeInvite(invite); }
  catch {
    let expiresAt;
    try { expiresAt = JSON.parse(Buffer.from(String(invite).replace(/^tea:\/\/join\//, ''), 'base64url').toString('utf8')).expiresAt; } catch { /* Malformed service response. */ }
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) throw new TeaError('INVITE_EXPIRED', '本场邀请已经过期。请明确结束旧场，再创建新场取得有效邀请。');
    throw new TeaError('INVALID_RESPONSE', '房主服务没有返回有效邀请。');
  }
}
function publicResult(endpoint, state, status, guideUrl, extra = {}) {
  return {
    sessionFile: endpoint.sessionFile, url: endpoint.url,
    mode: state.connection.mode,
    connection: { mode: state.connection.mode, connected: !!state.connection.connected, syncing: !!state.connection.syncing, ...(state.connection.mode === 'mock' ? { hub: state.connection.hub } : {}) },
    cli: path.join(APP_ROOT, 'scripts/tea.js'),
    mcp: { command: process.execPath, args: [path.join(APP_ROOT, 'src/mcp.js'), '--session', endpoint.sessionFile] },
    started: endpoint.started, status, room: state.room?.code || null, epoch: state.room?.epoch || null, roomInfo: state.room || null,
    installationRequired: true, friendNeedsProgram: true, publicGuideAvailable: !!guideUrl, guideUrl: guideUrl || null,
    installationHint: guideUrl ? '本机程序已准备；分享给朋友后，首次使用的朋友需要按可信 HTTPS 指引准备自己的本机程序。' : '本机程序已准备；首次使用的朋友需要先取得安装包，包内 AGENT-START.md 是本机使用入口，不能作为跨机器下载链接。',
    next: '使用返回的 CLI 或 MCP 入口及 sessionFile 读取房规与本人区域；提交 SVG 后等待房主在网页审核。', ...extra
  };
}
async function currentEndpoint(endpoint, expected) {
  const fresh = await readEndpoint(endpoint.sessionFile);
  if (!fresh) throw new TeaError('SESSION_UNAVAILABLE', '本机会话已经停止。');
  checkEndpoint(fresh, expected);
  return { ...fresh, data: endpoint.data, explicit: endpoint.explicit, started: endpoint.started };
}
async function host(options = {}) {
  const common = commonOptions(options, '房主');
  const roomName = textOption(options.roomName, 'roomName', textOption(options.topic, 'topic', '今天一起画画'));
  const maxMembers = options.maxMembers === undefined ? 4 : options.maxMembers;
  if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 8) throw new TeaError('INVALID_CAPACITY', 'maxMembers 必须是 2 到 8 的整数。');
  const policy = options.policy === undefined ? 'strict' : options.policy;
  if (!['strict', 'trusted'].includes(policy)) throw new TeaError('INVALID_POLICY', 'policy 只能是 strict 或 trusted。');
  if(options.gameMode&&!['free_draw','telephone','guess_draw'].includes(options.gameMode))throw new TeaError('INVALID_GAME_MODE');
  if(options.reviewPolicy&&!['moderator-strict','participant-confirm'].includes(options.reviewPolicy))throw new TeaError('INVALID_GAME_POLICY');
  const endpoint = await ensureEndpoint(options);
  const expected = options.sessionFile && !own(options, 'mode') && !own(options, 'hub') ? {} : modeOptions(options);
  return withLock(endpoint.data, 'room.lock', async () => {
    const fresh = await currentEndpoint(endpoint, expected);
    let state = fresh.state, status;
    if (state.connection.syncing) throw new TeaError('SESSION_BUSY', '本机会话仍在处理房间连接或离开，请读取状态并等待完成。');
    if (state.room) {
      const sameName = (options.roomName === undefined && options.topic === undefined) || state.room.name === roomName;
      const sameCapacity = options.maxMembers === undefined || state.room.maxMembers === maxMembers;
      const samePolicy = options.policy === undefined || state.room.policy === policy;
      const sameGame=!options.gameMode|| (state.game?.mode||'free_draw')===options.gameMode;
      const sameReview=!options.reviewPolicy||state.game?.reviewPolicy===options.reviewPolicy;
      if (!state.self?.isHost || !sameName || !sameCapacity || !samePolicy||!sameGame||!sameReview) throw new TeaError('ALREADY_IN_ROOM', '本机会话已在另一个房间或使用不同房规；请先明确离开当前房间。');
      status = 'already-hosting';
    } else {
      if (state.connection.connected || state.connection.syncing) throw new TeaError('SESSION_BUSY', '本机会话正在连接房间，请等待同步完成。');
      checkCancelled(options.signal);
      await fresh.client.command('session.name', { name: common.name }, { id: digest(`${common.operationId}:name`) });
      checkCancelled(options.signal);
      await fresh.client.command('room.create', { name: roomName, maxMembers, policy,...(options.gameMode?{gameMode:options.gameMode}:{}),...(options.reviewPolicy?{reviewPolicy:options.reviewPolicy}:{}) }, { id: common.operationId });
      state = await fresh.client.state(); status = 'created';
    }
    const guideUrl = selectedGuide(common.guideUrl, state);
    if (!state.invite || !state.room || !state.self?.isHost) throw new TeaError('INVALID_RESPONSE', '房间创建后没有返回房主邀请。');
    verifyHostInvite(state.invite);
    if (common.open) await fresh.client.command('session.open', {}, { id: digest(`${common.operationId}:open`) });
    return publicResult(fresh, state, status, guideUrl, { invite: state.invite, shareMessage: shareMessage(state.invite, guideUrl) });
  }, options.signal);
}
function extractInvite(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_INVITE_BYTES) throw new TeaError('INVITE_INVALID', '邀请或分享消息格式无效。');
  const invites = value.match(/tea:\/\/join\/[A-Za-z0-9_-]+/g);
  if (invites) {
    const unique = [...new Set(invites)];
    if (unique.length !== 1) throw new TeaError('INVITE_INVALID', '分享消息包含多个房间邀请，请只提供一个。');
    return unique[0];
  }
  // Legacy page fragments are accepted only as invitations, never as installation sources.
  return value.trim();
}
async function join(options = {}) {
  const common = commonOptions(options, '画友');
  if (options.invite !== undefined && options.inviteFile !== undefined) throw new TeaError('INVALID_ARGUMENT', 'invite 和 inviteFile 不能同时设置。');
  let invitation = options.invite;
  if (options.inviteFile !== undefined) invitation = await readBoundedText(textOption(options.inviteFile, 'inviteFile', undefined, 32768), MAX_INVITE_BYTES);
  if (invitation === undefined) throw new TeaError('INVITE_REQUIRED', '请提供房主的邀请或完整分享消息。');
  const invite = extractInvite(invitation), parsed = decodeInvite(invite);
  const expected = { mode: parsed.mode, ...(parsed.mode === 'mock' ? { hub: parsed.hub } : {}) };
  if (own(options, 'mode') || own(options, 'hub')) {
    const constrained = modeOptions(options);
    if (constrained.mode !== expected.mode || (constrained.mode === 'mock' && new URL(constrained.hub).href !== new URL(expected.hub).href)) throw new TeaError('SESSION_MODE_MISMATCH', '邀请与明确指定的本机联机配置不一致。');
  }
  const endpoint = await ensureEndpoint({ ...options, ...expected });
  return withLock(endpoint.data, 'room.lock', async () => {
    const fresh = await currentEndpoint(endpoint, expected);
    let state = fresh.state, status;
    if (state.connection.syncing) throw new TeaError('SESSION_BUSY', '本机会话仍在处理房间连接或离开，请读取状态并等待完成。');
    if (state.room) {
      if (state.room.code !== parsed.room || state.room.hostId !== parsed.hostId) throw new TeaError('ALREADY_IN_ROOM', '本机会话已在另一个房间；请先明确离开当前房间。');
      status = 'already-joined';
    } else {
      if (state.connection.connected || state.connection.syncing) throw new TeaError('SESSION_BUSY', '本机会话正在连接房间，请等待同步完成。');
      checkCancelled(options.signal);
      await fresh.client.command('room.join', { invite, name: common.name }, { id: common.operationId });
      state = await fresh.client.state(); status = 'joined';
    }
    const guideUrl = selectedGuide(common.guideUrl, state);
    if (common.open) await fresh.client.command('session.open', {}, { id: digest(`${common.operationId}:open`) });
    return publicResult(fresh, state, status, guideUrl);
  }, options.signal);
}
async function readInviteInput(stream = process.stdin) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
    if (size > MAX_INVITE_BYTES) throw new TeaError('INVITE_TOO_LARGE', '邀请或分享消息不能超过 16 KiB。');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}
async function parseArgs(kind, argv, input = process.stdin) {
  const options = {}, common = { '--name': 'name', '--data': 'data', '--session': 'sessionFile', '--guide-url': 'guideUrl', '--operation-id': 'operationId', '--mode': 'mode', '--hub': 'hub' };
  const valued = { ...common, ...(kind === 'host' ? { '--room-name': 'roomName', '--topic': 'topic', '--max-members': 'maxMembers', '--policy': 'policy','--game-mode':'gameMode','--review-policy':'reviewPolicy' } : { '--invite': 'invite', '--invite-file': 'inviteFile' }) };
  let stdin = false;
  for (let i = 0; i < argv.length; i++) {
    let key = argv[i], inline;
    if (typeof key !== 'string') throw new TeaError('INVALID_ARGUMENT', 'CLI 参数必须是文本。');
    const equal = key.indexOf('='); if (equal >= 0) { inline = key.slice(equal + 1); key = key.slice(0, equal); }
    if (key === '--json' && inline === undefined) continue;
    if ((key === '--help' || key === '-h') && inline === undefined) { options.help = true; continue; }
    if ((key === '--open' || key === '--no-open') && inline === undefined) {
      if (own(options, 'open')) throw new TeaError('INVALID_ARGUMENT', 'open 参数不能重复设置。'); options.open = key === '--open'; continue;
    }
    if (kind === 'join' && key === '--invite-stdin' && inline === undefined) {
      if (stdin) throw new TeaError('INVALID_ARGUMENT', 'invite-stdin 参数不能重复设置。'); stdin = true; continue;
    }
    const target = valued[key];
    if (!target) throw new TeaError('INVALID_ARGUMENT', `未知参数 ${key}。`);
    if (own(options, target)) throw new TeaError('INVALID_ARGUMENT', `${key} 参数不能重复设置。`);
    const value = inline === undefined ? argv[++i] : inline;
    if (typeof value !== 'string' || !value || value.startsWith('--')) throw new TeaError('INVALID_ARGUMENT', `${key} 缺少参数值。`);
    options[target] = target === 'maxMembers' ? (/^\d+$/.test(value) ? Number(value) : NaN) : value;
  }
  if (options.data !== undefined && options.sessionFile !== undefined) throw new TeaError('INVALID_ARGUMENT', '--data 和 --session 不能同时设置。');
  if (stdin) {
    if (options.invite !== undefined || options.inviteFile !== undefined) throw new TeaError('INVALID_ARGUMENT', '三种邀请输入方式只能选择一种。');
    if (!options.help) options.invite = await readInviteInput(input);
  }
  return options;
}
const HELP = {
  host: 'tea host [--name 房主] [--room-name 房间名 | --topic 主题] [--max-members 4] [--policy strict|trusted] [--game-mode free_draw|telephone|guess_draw] [--review-policy moderator-strict|participant-confirm] [--guide-url HTTPS_URL] [--data DIR | --session FILE] [--no-open]',
  join: 'tea join (--invite 邀请或分享消息 | --invite-file FILE | --invite-stdin) [--name 画友] [--data DIR | --session FILE] [--no-open]',
  other: '其余绘图命令与原 CLI 一致，例如 tea status --session FILE 和 tea submit --session FILE --file SVG。'
};
module.exports = { ensureEndpoint, host, join, defaultData, extractInvite, parseArgs, readInviteInput, HELP };
