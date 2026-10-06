'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TeaClient, loadSession } = require('../src/client');
const cli = path.resolve(__dirname, '../src/cli.js');
const mcp = path.resolve(__dirname, '../src/mcp.js');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="#48b8a7"/></svg>';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '茶绘 adapter '));
  const requests = [];
  const token = 'fixture-drawing-token-00000000001';
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No token' } })); return; }
    if (req.method === 'GET' && req.url === '/api/state') { res.end(JSON.stringify({ ok: true, result: { room: { name: '测试' }, self: { region: { x: 0, y: 0, width: 400, height: 300 } } } })); return; }
    const parts = []; for await (const part of req) parts.push(part);
    const command = JSON.parse(Buffer.concat(parts).toString('utf8'));
    requests.push(command);
    if (['proposal.approve', 'proposal.reject', 'room.freeze'].includes(command.name)) {
      res.writeHead(403); res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: '绘图凭据没有管理权限。' } })); return;
    }
    const result = command.name === 'scene.export' ? { svg: SVG, hash: 'export-hash' } : command.name === 'proposal.submit' ? { status: 'pending', proposalId: 'proposal-1', contentHash: 'content-hash', received: command.args } : { command: command.name, args: command.args };
    res.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const session = path.join(dir, '绘图会话.json'), svg = path.join(dir, '鲸鱼.svg');
  await fs.writeFile(session, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token, pid: process.pid }));
  await fs.writeFile(svg, SVG);
  return { dir, session, svg, requests, close: async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); } };
}

function run(script, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('adapter child timed out')); }, 10000);
    child.stdout.on('data', chunk => stdout += chunk.toString());
    child.stderr.on('data', chunk => stderr += chunk.toString());
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
    child.stdin.end(input);
  });
}

function mcpClient(session) {
  const child = spawn(process.execPath, [mcp, '--session', session], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 0, buffer = '', stderr = '';
  child.stderr.on('data', chunk => stderr += chunk.toString());
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    for (;;) {
      const newline = buffer.indexOf('\n'); if (newline < 0) break;
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      const message = JSON.parse(line); const operation = pending.get(message.id);
      if (operation) { clearTimeout(operation.timer); pending.delete(message.id); operation.resolve(message); }
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
  });
  return { child, request, notify: (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`), stderr: () => stderr,
    close: () => new Promise(resolve => { child.once('close', resolve); child.stdin.end(); setTimeout(() => child.kill(), 1000).unref(); }) };
}

test('CLI real subprocess reads files, submits a pending proposal, exports, and keeps management denied', async () => {
  const f = await fixture();
  try {
    const status = await run(cli, ['--session', f.session, 'status', '--json']);
    assert.equal(status.code, 0); assert.equal(status.stderr, ''); assert.equal(JSON.parse(status.stdout).result.room.name, '测试');
    const result = await run(cli, ['submit', '--session', f.session, '--file', f.svg, '--name', '小鲸鱼', '--x', '10', '--y', '20', '--width', '100', '--height', '100', '--id', 'stable-operation']);
    assert.equal(result.code, 0); const value = JSON.parse(result.stdout); assert.equal(value.result.status, 'pending');
    assert.equal(f.requests[0].id, 'stable-operation'); assert.equal(f.requests[0].args.svg, SVG); assert.equal(f.requests[0].args.x, 10); assert.equal(f.requests[0].args.filePath, undefined);
    const deny = await run(cli, ['approve', '--session', f.session, '--proposal-id', 'p1', '--hash', 'h1']);
    assert.equal(deny.code, 1); assert.equal(JSON.parse(deny.stdout).error.code, 'FORBIDDEN');
    const output = path.join(f.dir, '共同画布.svg');
    const exported = await run(cli, ['--session', f.session, 'export', '--out', output]);
    assert.equal(exported.code, 0); assert.equal(await fs.readFile(output, 'utf8'), SVG);
    const invalid = await run(cli, ['--session', f.session, 'submit', '--file', f.svg, '--x', 'NaN']);
    assert.equal(invalid.code, 1); assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_ARGUMENT');
  } finally { await f.close(); }
});

test('MCP real stdio initializes, lists, reads context, validates and submits with same API, and returns typed denials', async () => {
  const f = await fixture(), rpc = mcpClient(f.session);
  try {
    const premature = await rpc.request('tools/list'); assert.equal(premature.error.code, -32002);
    const init = await rpc.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'adapter-test', version: '1.0' } });
    assert.equal(init.result.protocolVersion, '2025-11-25'); assert.deepEqual(init.result.capabilities.tools, { listChanged: false });
    rpc.notify('notifications/initialized');
    const listed = await rpc.request('tools/list');
    assert.equal(listed.result.tools.length, require('../src/mcp').TOOLS.length); assert.ok(listed.result.tools.find(tool => tool.name === 'draft_validate')); assert.ok(listed.result.tools.find(tool => tool.name === 'tea_create_room'));
    const context = await rpc.request('tools/call', { name: 'canvas_get_context', arguments: {} });
    assert.equal(context.result.structuredContent.result.command, 'scene.read');
    const checked = await rpc.request('tools/call', { name: 'draft_validate', arguments: { filePath: f.svg } });
    assert.equal(checked.result.isError, false); assert.equal(checked.result.structuredContent.result.args.svg, SVG);
    const submitted = await rpc.request('tools/call', { name: 'tea_submit_svg', arguments: { svg: SVG, operationId: 'mcp-stable-id', width: 100, height: 100 } });
    assert.equal(submitted.result.isError, false); assert.equal(submitted.result.structuredContent.result.status, 'pending');
    assert.equal(f.requests.at(-1).id, 'mcp-stable-id');
    const deny = await rpc.request('tools/call', { name: 'tea_freeze', arguments: { frozen: true } });
    assert.equal(deny.result.isError, true); assert.equal(deny.result.structuredContent.error.code, 'FORBIDDEN');
    const wrong = await rpc.request('tools/call', { name: 'tea_submit_svg', arguments: { svg: SVG, x: 'NaN' } });
    assert.equal(wrong.error.code, -32602);
    const unknown = await rpc.request('tools/call', { name: 'arbitrary_shell', arguments: {} });
    assert.equal(unknown.error.code, -32602);
    assert.equal(rpc.stderr(), '');
  } finally { await rpc.close(); await f.close(); }
});

test('session client refuses non-loopback endpoints and missing credentials before sending', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(f.session, JSON.stringify({ url: 'https://evil.example', token: 'secret-secret-secret' }));
    await assert.rejects(loadSession(f.session), error => error.code === 'INVALID_SESSION');
    await fs.writeFile(f.session, JSON.stringify({ url: 'http://127.0.0.1:9999', token: 'tiny' }));
    await assert.rejects(new TeaClient({ sessionFile: f.session }).state(), error => error.code === 'INVALID_SESSION');
    assert.equal(f.requests.length, 0);
  } finally { await f.close(); }
});

test('MCP negotiates fallback version without claiming unsupported features', async () => {
  const f = await fixture(), rpc = mcpClient(f.session);
  try {
    const init = await rpc.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'old-test', version: '1.0' } });
    assert.equal(init.result.protocolVersion, '2024-11-05'); rpc.notify('notifications/initialized');
    const listed = await rpc.request('tools/list'); assert.equal(listed.result.tools[0].outputSchema, undefined);
    const status = await rpc.request('tools/call', { name: 'tea_status' });
    assert.equal(status.result.structuredContent, undefined); assert.equal(JSON.parse(status.result.content[0].text).ok, true);
  } finally { await rpc.close(); await f.close(); }
});

test('CLI and MCP independently join and submit through the real application while only UI approval publishes', async () => {
  const { startApp, kitRoot } = require('../src/main');
  const { startHub } = require(path.join(kitRoot(), 'mock-hub'));
  const hub = await startHub(), dir = await fs.mkdtemp(path.join(os.tmpdir(), '茶绘 real adapters '));
  const apps = []; let rpc;
  try {
    const host = await startApp({ mode: 'mock', hub: hub.url, data: path.join(dir, '房主') }); apps.push(host);
    const guest = await startApp({ mode: 'mock', hub: hub.url, data: path.join(dir, '画友') }); apps.push(guest);
    const hostClient = new TeaClient({ sessionFile: host.sessionFile });
    const created = await hostClient.command('room.create', { name: '独立接入验证', maxMembers: 4, policy: 'strict' });
    const inviteFile = path.join(dir, '私有邀请.txt'), svgFile = path.join(dir, '作品.svg');
    await fs.writeFile(inviteFile, created.invite); await fs.writeFile(svgFile, SVG);
    const joined = await run(cli, ['join', '--session', guest.sessionFile, '--invite-file', inviteFile, '--name', 'CLI 画友']);
    assert.equal(joined.code, 0, joined.stdout); assert.equal(JSON.parse(joined.stdout).result.status, 'joined');
    const reserved = await run(cli, ['reserve', '--session', guest.sessionFile, '--width', '100', '--height', '100']);
    assert.equal(reserved.code, 0, reserved.stdout); const lease = JSON.parse(reserved.stdout).result;
    const missingLease = await run(cli, ['submit', '--session', guest.sessionFile, '--file', svgFile, '--width', '100', '--height', '100']);
    assert.equal(missingLease.code, 1); assert.equal(JSON.parse(missingLease.stdout).error.code, 'TASK_ACTIVE');
    const submitted = await run(cli, ['submit', '--session', guest.sessionFile, '--file', svgFile, '--width', '100', '--height', '100', '--lease-id', lease.id]);
    assert.equal(submitted.code, 0, submitted.stdout); const proposal = JSON.parse(submitted.stdout).result;
    assert.equal(proposal.status, 'pending'); assert.equal((await hostClient.state()).scene.objects.length, 0);
    const forbidden = await run(cli, ['approve', '--session', host.sessionFile, '--proposal-id', proposal.proposalId, '--hash', proposal.hash]);
    assert.equal(forbidden.code, 1); assert.equal(JSON.parse(forbidden.stdout).error.code, 'FORBIDDEN');
    const response = await fetch(`${host.url}/api/command`, { method: 'POST', headers: { authorization: `Bearer ${host.uiToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'ui-approve-adapter-test', name: 'proposal.approve', args: { proposalId: proposal.proposalId, hash: proposal.hash } }) });
    const approved = await response.json(); assert.equal(approved.ok, true, JSON.stringify(approved));
    rpc = mcpClient(guest.sessionFile);
    await rpc.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'real-app-test', version: '1' } }); rpc.notify('notifications/initialized');
    const status = await rpc.request('tools/call', { name: 'tea_status' });
    assert.equal(status.result.structuredContent.result.scene.objects.length, 1);
    const checked = await rpc.request('tools/call', { name: 'draft_validate', arguments: { svg: SVG } });
    assert.equal(checked.result.isError, false, JSON.stringify(checked));
    const cancelled = await rpc.request('tools/call', { name: 'job_cancel', arguments: { leaseId: lease.id } });
    assert.equal(cancelled.result.isError, false, JSON.stringify(cancelled));
    const expired = await rpc.request('tools/call', { name: 'tea_submit_svg', arguments: { svg: SVG, leaseId: lease.id, width: 90, height: 90 } });
    assert.equal(expired.result.structuredContent.error.code, 'TASK_EXPIRED');
    const proposalTwo = await rpc.request('tools/call', { name: 'tea_submit_svg', arguments: { svg: SVG, name: 'MCP 草稿', width: 90, height: 90, operationId: 'mcp-real-proposal' } });
    assert.equal(proposalTwo.result.isError, false, JSON.stringify(proposalTwo));
    assert.equal(proposalTwo.result.structuredContent.result.status, 'pending');
    const output = path.join(dir, '已发布画布.svg');
    const exported = await rpc.request('tools/call', { name: 'tea_export_svg', arguments: { outputPath: output } });
    assert.equal(exported.result.isError, false, JSON.stringify(exported));
    const scene = await fs.readFile(output, 'utf8'); assert.ok(scene.includes('data-author=')); assert.ok(scene.includes('<circle'));
  } finally {
    if (rpc) await rpc.close();
    for (const app of apps.reverse()) await app.close();
    await hub.close(); await fs.rm(dir, { recursive: true, force: true });
  }
});
