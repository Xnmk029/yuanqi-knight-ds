'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { startServer, callTool, parseOptions, TOOLS, validateArguments } = require('../src/mcp');
const { TeaClient, TeaError } = require('../src/client');

const SVG = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="teal"/></svg>';

function rpc(options) {
  const input = new PassThrough(), output = new PassThrough(), diagnostics = new PassThrough();
  const pending = new Map(); let buffer = '', nextId = 0, errors = '';
  diagnostics.on('data', bytes => { errors += bytes.toString(); });
  output.on('data', bytes => {
    buffer += bytes.toString();
    for (;;) {
      const newline = buffer.indexOf('\n'); if (newline < 0) break;
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      const operation = pending.get(message.id);
      if (operation) { pending.delete(message.id); clearTimeout(operation.timer); operation.resolve(message); }
    }
  });
  const server = startServer({ ...options, input, output, diagnostics });
  const notify = (method, params) => input.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
  return {
    request, notify,
    lastRequestId: () => nextId,
    initialize: async () => { const value = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'launcher-test', version: '1' } }); notify('notifications/initialized'); return value; },
    call: async (name, args = {}) => { const response = await request('tools/call', { name, arguments: args }); return response.error ? response : response.result.structuredContent; },
    close: () => { server.close(); input.end(); for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new Error('test RPC closed')); } pending.clear(); },
    diagnostics: () => errors
  };
}

async function endpoint(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tea-mcp-launcher-'));
  const token = 'mcp-launcher-drawing-token-00001', requests = [];
  const server = http.createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.headers.authorization !== 'Bearer ' + token) { response.writeHead(401); response.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } })); return; }
    if (request.url === '/api/state') { response.end(JSON.stringify({ ok: true, result: { room: { name: '测试茶绘' }, scene: { objects: [] } } })); return; }
    const parts = []; for await (const bytes of request) parts.push(bytes);
    const command = JSON.parse(Buffer.concat(parts).toString()); requests.push(command);
    response.end(JSON.stringify({ ok: true, result: command.name === 'proposal.submit' ? { status: 'pending', proposalId: 'draft-1' } : { command: command.name, args: command.args } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const sessionFile = path.join(directory, 'session.json');
  await fs.writeFile(sessionFile, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token, pid: process.pid }));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, sessionFile, requests };
}

function processRpc(argv) {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/mcp.js'), ...argv], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 0, buffer = '', stderr = '', exited = false;
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  child.stdout.on('data', bytes => {
    buffer += bytes.toString();
    for (;;) {
      const newline = buffer.indexOf('\n'); if (newline < 0) break;
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      const operation = pending.get(message.id);
      if (operation) { pending.delete(message.id); clearTimeout(operation.timer); operation.resolve(message); }
    }
  });
  child.once('close', code => { exited = true; for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new Error(`MCP exited ${code}: ${stderr}`)); } pending.clear(); });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out: ${stderr}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
  return {
    child, request,
    initialize: async () => { await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'real-launcher-test', version: '1' } }); notify('notifications/initialized'); },
    call: async (name, args = {}) => { const result = await request('tools/call', { name, arguments: args }); assert.equal(result.error, undefined, JSON.stringify(result)); return result.result.structuredContent; },
    close: async () => { if (exited) return; await new Promise(resolve => { child.once('close', resolve); child.stdin.end(); setTimeout(() => child.kill(), 1000).unref(); }); },
    stderr: () => stderr
  };
}

async function stopTestService(directory) {
  let record;
  try { record = JSON.parse(await fs.readFile(path.join(directory, 'session.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.ok(Number.isInteger(record.pid) && record.pid > 0 && record.pid !== process.pid);
  try { process.kill(record.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  for (let attempt = 0; attempt < 60; attempt++) {
    try { process.kill(record.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('owned test service did not exit');
}

test('MCP without a session launches a host then uses its returned session for status and SVG submission', async t => {
  const f = await endpoint(t), launches = [];
  const launcher = {
    host: async options => { launches.push(options); return { sessionFile: f.sessionFile, invite: 'tea://private-invite', shareText: '加入测试茶绘' }; },
    join: async () => { throw new Error('unexpected join'); }
  };
  const channel = rpc({ data: f.directory, guideUrl: 'https://example.test/tea/', open: false, launcher }); t.after(channel.close);
  const initialized = await channel.initialize();
  assert.equal(initialized.result.serverInfo.version, require('../package.json').version);
  const created = await channel.call('tea_create_room', { name: '灯下画友', roomName: '灯下茶绘', topic: '鲸鱼喝茶', maxMembers: 4, policy: 'strict', operationId: 'stable-create' });
  assert.equal(created.ok, true); assert.equal(created.result.sessionFile, f.sessionFile);
  assert.equal(launches.length, 1); assert.equal(launches[0].sessionFile, undefined);
  assert.equal(launches[0].mode, 'steam'); assert.equal(launches[0].hub, undefined);
  assert.equal(launches[0].data, f.directory); assert.equal(launches[0].guideUrl, 'https://example.test/tea/');
  assert.equal(launches[0].open, false); assert.equal(launches[0].operationId, 'stable-create');
  assert.equal(launches[0].roomName, '灯下茶绘'); assert.equal(launches[0].topic, '鲸鱼喝茶');
  assert.ok(launches[0].signal instanceof AbortSignal);
  assert.equal((await channel.call('tea_status')).result.room.name, '测试茶绘');
  const submitted = await channel.call('tea_submit_svg', { svg: SVG, operationId: 'first-draft' });
  assert.equal(submitted.result.status, 'pending'); assert.equal(f.requests.at(-1).id, 'first-draft');
  assert.equal(f.requests.at(-1).args.svg, SVG); assert.equal(channel.diagnostics(), '');
});

test('default MCP joins through the launcher and reads the new session; invitation sources are exclusive', async t => {
  const f = await endpoint(t), joins = [];
  const launcher = { join: async options => { joins.push(options); return { sessionFile: f.sessionFile, status: 'joined' }; } };
  const channel = rpc({ data: f.directory, mode: 'mock', hub: 'ws://127.0.0.1:9999', launcher, open: false }); t.after(channel.close);
  await channel.initialize();
  const inviteFile = path.join(f.directory, '私有邀请.txt'); await fs.writeFile(inviteFile, 'tea://private-invite');
  const joined = await channel.call('tea_join_room', { inviteFile, name: '画友', operationId: 'stable-join', open: true });
  assert.equal(joined.ok, true); assert.equal(joined.result.status, 'joined');
  assert.equal(joins.length, 1); assert.equal(joins[0].inviteFile, inviteFile); assert.equal(joins[0].mode, 'mock');
  assert.equal(joins[0].hub, 'ws://127.0.0.1:9999'); assert.equal(joins[0].open, true);
  assert.equal(joins[0].operationId, 'stable-join');
  assert.equal((await channel.call('tea_status')).result.room.name, '测试茶绘');
  assert.equal((await channel.call('tea_join_room', {})).error.code, 'INVALID_ARGUMENT');
  assert.equal((await channel.call('tea_join_room', { invite: 'tea://invite', inviteFile })).error.code, 'INVALID_ARGUMENT');
  const forbiddenMode = await channel.call('tea_join_room', { invite: 'tea://invite', mode: 'mock' });
  assert.equal(forbiddenMode.error.code, -32602); assert.equal(joins.length, 1);
});

test('a fresh MCP process discovers the existing version cache session without launching another service', async t => {
  const f = await endpoint(t), discovered = [];
  const launcher = {
    defaultData: options => { discovered.push(options); return f.directory; },
    host: async () => { throw new Error('status must not launch a host'); },
    join: async () => { throw new Error('status must not join a room'); }
  };
  const channel = rpc({ launcher, open: false }); t.after(channel.close); await channel.initialize();
  assert.deepEqual(discovered, [{ mode: 'steam', hub: undefined }]);
  assert.equal((await channel.call('tea_status')).result.room.name, '测试茶绘');
});

test('real explicit sessions use the launcher for both joining and hosting without changing transport', async t => {
  const f = await endpoint(t), hosts = [], joins = [];
  const launcher = {
    join: async options => { joins.push(options); return { sessionFile: f.sessionFile, status: 'joined' }; },
    host: async options => { hosts.push(options); return { sessionFile: f.sessionFile, status: 'hosting' }; }
  };
  const channel = rpc({ sessionFile: f.sessionFile, launcher, open: false }); t.after(channel.close); await channel.initialize();
  const joined = await channel.call('tea_join_room', { invite: 'fixture-invite', name: '原会话画友', operationId: 'explicit-join' });
  assert.equal(joined.ok, true); assert.equal(joined.result.status, 'joined');
  assert.equal(joins.length, 1); assert.equal(joins[0].sessionFile, f.sessionFile);
  assert.equal(joins[0].operationId, 'explicit-join'); assert.equal(joins[0].mode, undefined);
  assert.equal(f.requests.length, 0, 'join must not bypass the launcher concurrency and room checks');
  assert.equal((await channel.call('tea_create_room', { roomName: '原会话开房' })).ok, true);
  assert.equal(hosts.length, 1); assert.equal(hosts[0].sessionFile, f.sessionFile); assert.equal(hosts[0].data, undefined); assert.equal(hosts[0].mode, undefined);
});

test('injected legacy clients keep their direct join interface', async t => {
  const commands = [];
  const client = { command: async (name, args, options) => { commands.push({ name, args, options }); return { status: 'joined' }; } };
  const channel = rpc({ client, launcher: { join: () => { throw new Error('legacy client must not launch a service'); } } }); t.after(channel.close); await channel.initialize();
  assert.equal((await channel.call('tea_join_room', { invite: 'legacy-invite', operationId: 'legacy-id' })).ok, true);
  assert.equal(commands[0].name, 'room.join'); assert.equal(commands[0].options.id, 'legacy-id');
});

test('launcher failures and cancellation never fabricate a session or downgrade Steam to mock', async t => {
  const f = await endpoint(t), client = new TeaClient({ sessionFile: f.sessionFile }); let calls = 0;
  const lifecycle = { explicitSession: false, options: { mode: 'steam' }, launcher: { host: async options => { calls++; assert.equal(options.mode, 'steam'); throw new TeaError('STEAM_UNAVAILABLE', 'Steam 未运行'); } } };
  await assert.rejects(callTool('tea_create_room', {}, client, undefined, lifecycle), { code: 'STEAM_UNAVAILABLE' });
  assert.equal(client.sessionFile, f.sessionFile); assert.equal(calls, 1);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(callTool('tea_create_room', {}, client, cancelled.signal, lifecycle), { code: 'CANCELLED' });
  assert.equal(calls, 1);
  lifecycle.launcher.host = async () => ({ status: 'hosting' });
  await assert.rejects(callTool('tea_create_room', {}, client, undefined, lifecycle), { code: 'INVALID_RESPONSE' });
  assert.equal(client.sessionFile, f.sessionFile);
});

test('MCP cancellation notifications reach a pending lifecycle operation', async t => {
  const f = await endpoint(t); let enteredResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const launcher = {
    host: options => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new TeaError('CANCELLED', '开房操作已取消。')), { once: true });
      enteredResolve();
    })
  };
  const channel = rpc({ data: f.directory, launcher, open: false }); t.after(channel.close); await channel.initialize();
  const opening = channel.request('tools/call', { name: 'tea_create_room', arguments: {} });
  const requestId = channel.lastRequestId();
  await entered; channel.notify('notifications/cancelled', { requestId });
  const result = (await opening).result.structuredContent;
  assert.equal(result.ok, false); assert.equal(result.error.code, 'CANCELLED');
});

test('real stdio MCP starts two services, hosts and joins from one call, draws, and reconnects to the same session', { timeout: 30000 }, async t => {
  const { kitRoot } = require('../src/main');
  const { startHub } = require(path.join(kitRoot(), 'mock-hub'));
  const hub = await startHub(), directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tea-mcp-live-'));
  const hostData = path.join(directory, 'host'), guestData = path.join(directory, 'guest'), channels = [];
  t.after(async () => {
    for (const channel of channels) await channel.close();
    await stopTestService(hostData); await stopTestService(guestData); await hub.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const args = data => ['--data', data, '--mode', 'mock', '--hub', hub.url, '--no-open'];
  const host = processRpc(args(hostData)), guest = processRpc(args(guestData)); channels.push(host, guest);
  await Promise.all([host.initialize(), guest.initialize()]);
  const roomArgs = { roomName: '一键 MCP 茶绘', maxMembers: 4, policy: 'strict', operationId: 'live-mcp-room' };
  const created = await host.call('tea_create_room', roomArgs);
  assert.equal(created.ok, true, JSON.stringify(created)); assert.equal(created.result.status, 'created'); assert.equal(created.result.started, true);
  assert.equal(created.result.sessionFile, path.join(hostData, 'session.json'));
  assert.equal(created.result.uiToken, undefined); assert.equal(created.result.browserUrl, undefined);
  const joined = await guest.call('tea_join_room', { invite: created.result.shareMessage, name: '一句话画友', operationId: 'live-mcp-join' });
  assert.equal(joined.ok, true, JSON.stringify(joined)); assert.equal(joined.result.status, 'joined'); assert.equal(joined.result.started, true);
  assert.equal(joined.result.room, created.result.room); assert.equal(joined.result.epoch, created.result.epoch);
  const state = await guest.call('tea_status'); assert.equal(state.result.self.name, '一句话画友'); assert.equal(state.result.connection.connected, true);
  assert.equal((await guest.call('draft_validate', { svg: SVG })).ok, true);
  const proposal = await guest.call('tea_submit_svg', { svg: SVG, name: '茶杯鲸鱼', operationId: 'live-mcp-proposal' });
  assert.equal(proposal.ok, true, JSON.stringify(proposal)); assert.equal(proposal.result.status, 'pending');
  assert.equal((await host.call('tea_approve', { proposalId: proposal.result.proposalId, hash: proposal.result.hash })).error.code, 'FORBIDDEN');
  const repeated = await host.call('tea_create_room', roomArgs);
  assert.equal(repeated.result.status, 'already-hosting'); assert.equal(repeated.result.started, false); assert.equal(repeated.result.epoch, created.result.epoch);
  const alreadyJoined = await guest.call('tea_join_room', { invite: created.result.invite });
  assert.equal(alreadyJoined.result.status, 'already-joined'); assert.equal(alreadyJoined.result.epoch, created.result.epoch);
  assert.equal((await guest.call('tea_create_room')).error.code, 'ALREADY_IN_ROOM');
  const before = JSON.parse(await fs.readFile(joined.result.sessionFile, 'utf8'));
  await guest.close();
  const restarted = processRpc(['--session', joined.result.sessionFile, '--no-open']); channels.push(restarted); await restarted.initialize();
  const restored = await restarted.call('tea_status');
  assert.equal(restored.ok, true); assert.equal(restored.result.room.epoch, created.result.epoch);
  assert.equal(restored.result.proposals[0].id, proposal.result.proposalId);
  const explicitJoin = await restarted.call('tea_join_room', { invite: created.result.invite });
  assert.equal(explicitJoin.ok, true, JSON.stringify(explicitJoin)); assert.equal(explicitJoin.result.status, 'already-joined');
  assert.equal(JSON.parse(await fs.readFile(joined.result.sessionFile, 'utf8')).pid, before.pid);
  const explicitHost = processRpc(['--session', created.result.sessionFile, '--no-open']); channels.push(explicitHost); await explicitHost.initialize();
  const explicitCreate = await explicitHost.call('tea_create_room', roomArgs);
  assert.equal(explicitCreate.ok, true, JSON.stringify(explicitCreate)); assert.equal(explicitCreate.result.status, 'already-hosting');
  assert.equal(explicitCreate.result.epoch, created.result.epoch);
  for (const channel of channels) assert.equal(channel.stderr(), '');
});

test('MCP accepts only bounded room options and explicit trusted process configuration', () => {
  assert.deepEqual(parseOptions(['--data', '茶绘数据', '--guide-url', 'https://example.test/tea/', '--no-open']), { data: '茶绘数据', guideUrl: 'https://example.test/tea/', open: false });
  assert.deepEqual(parseOptions(['--mode', 'mock', '--hub', 'ws://127.0.0.1:1234']), { mode: 'mock', hub: 'ws://127.0.0.1:1234' });
  for (const argv of [['--hub', 'ws://127.0.0.1:1234'], ['--mode', 'automatic'], ['--data', 'x', '--session', 'y'], ['--data'], ['--session', 'a', '--session', 'b'], ['--unknown', 'x']]) assert.throws(() => parseOptions(argv), { code: 'INVALID_ARGUMENT' });
  const host = TOOLS.find(tool => tool.name === 'tea_create_room');
  for (const args of [{ maxMembers: 9 }, { maxMembers: 1 }, { maxMembers: 4.5 }, { policy: 'public' }, { roomName: 'x'.repeat(81) }, { topic: 'x'.repeat(81) }, { operationId: 'x'.repeat(101) }, { mode: 'mock' }]) assert.throws(() => validateArguments(host, args), { code: 'INVALID_ARGUMENT' });
  validateArguments(host, { maxMembers: 4, policy: 'strict', open: false });
  assert.throws(() => startServer({ sessionFile: 'session.json', data: 'data' }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => startServer({ hub: 'ws://127.0.0.1:1234' }), { code: 'INVALID_ARGUMENT' });
});
