'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { startApp, kitRoot } = require('../src/main');
const { TeaClient } = require('../src/client');
const mainFile = path.resolve(__dirname, '../src/main.js');
const cliFile = path.resolve(__dirname, '../src/cli.js');
const mcpFile = path.resolve(__dirname, '../src/mcp.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="42" fill="#42a68f"/><path d="M35 64 Q60 91 85 64" fill="none" stroke="#ffffff" stroke-width="7"/></svg>';

function childProcess(script, args = []) {
  return spawn(process.execPath, [script, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: path.resolve(__dirname, '..') });
}

async function launchGuest(data, hub) {
  const child = childProcess(mainFile, ['--mode', 'mock', '--hub', hub, '--data', data, '--no-open']);
  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('GUEST_STARTUP_TIMEOUT')); }, 15000);
    const finish = (error, result) => { clearTimeout(timer); child.stdout.removeListener('data', read); if (error) reject(error); else resolve(result); };
    const read = chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 65536) { finish(new Error('GUEST_INVALID_STARTUP_OUTPUT')); child.kill(); return; }
      for (;;) {
        const lineEnd = buffer.indexOf('\n'); if (lineEnd < 0) break;
        const line = buffer.slice(0, lineEnd); buffer = buffer.slice(lineEnd + 1);
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (value.event === 'ready') finish(null, value);
      }
    };
    child.stdout.on('data', read);
    child.once('error', error => finish(error));
    child.once('exit', () => finish(new Error('GUEST_EXITED_BEFORE_READY')));
    child.stderr.on('data', () => {});
  });
  child.stdout.resume();
  return { child, ready, client: new TeaClient({ sessionFile: ready.sessionFile }) };
}

async function runCli(args) {
  const child = childProcess(cliFile, args);
  return new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI_TIMEOUT')); }, 15000);
    child.stdout.on('data', part => { stdout += part.toString(); if (stdout.length > 65536) child.kill(); });
    child.stderr.on('data', () => {});
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer);
      let value; try { value = JSON.parse(stdout); } catch { reject(new Error('CLI_INVALID_JSON')); return; }
      if (code !== 0 || !value.ok) reject(Object.assign(new Error(value.error?.code || 'CLI_FAILED'), { code: value.error?.code })); else resolve(value.result);
    });
    child.stdin.end();
  });
}

function mcpPeer(sessionFile) {
  const child = childProcess(mcpFile, ['--session', sessionFile]), pending = new Map();
  let buffer = '', seq = 0;
  child.stderr.on('data', () => {});
  child.stdout.on('data', part => {
    buffer += part.toString();
    for (;;) {
      const lineEnd = buffer.indexOf('\n'); if (lineEnd < 0) break;
      const line = buffer.slice(0, lineEnd); buffer = buffer.slice(lineEnd + 1);
      let reply; try { reply = JSON.parse(line); } catch { continue; }
      const waiting = pending.get(reply.id); if (!waiting) continue;
      clearTimeout(waiting.timer); pending.delete(reply.id); waiting.resolve(reply);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP_TIMEOUT')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return { child, request, notify: (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`),
    async tool(name, args = {}) {
      const reply = await request('tools/call', { name, arguments: args });
      if (reply.error) throw new Error('MCP_RPC_FAILED');
      const value = reply.result.structuredContent || JSON.parse(reply.result.content[0].text);
      if (!value.ok) throw Object.assign(new Error(value.error.code), { code: value.error.code });
      return value.result;
    }
  };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
    child.once('close', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function waitForViews(clients, revision, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let views;
  while (Date.now() < deadline) {
    views = await Promise.all(clients.map(client => client.state()));
    if (views.every(view => view.scene.revision === revision && view.scene.objects.length === 8)) return views;
    await pause(80);
  }
  throw new Error('EIGHT_PEER_SYNC_TIMEOUT');
}

async function verifyMultiprocess({ out = path.resolve(__dirname, '../verification/multiprocess') } = {}) {
  out = path.resolve(out); await fs.mkdir(out, { recursive: true });
  const dataRoot = await fs.mkdtemp(path.join(out, 'private-run-'));
  const { startHub } = require(path.join(kitRoot(), 'mock-hub'));
  let hub, host, rpc; const children = [], checks = [];
  const start = Date.now();
  const check = (name, details) => checks.push({ name, status: 'passed', ...(details ? { details } : {}) });
  let report;
  try {
    hub = await startHub();
    host = await startApp({ mode: 'mock', hub: hub.url, data: path.join(dataRoot, 'host') });
    const hostClient = new TeaClient({ sessionFile: host.sessionFile });
    const room = await hostClient.command('room.create', { name: '八人独立进程验证', maxMembers: 8, policy: 'strict' });
    const launches = await Promise.allSettled(Array.from({ length: 7 }, async (_, index) => {
      const guest = await launchGuest(path.join(dataRoot, `guest-${index + 1}`), hub.url);
      children.push(guest.child); return guest;
    }));
    const failedLaunch = launches.find(result => result.status === 'rejected');
    if (failedLaunch) throw failedLaunch.reason;
    const guests = launches.map(result => result.value);
    assert.equal(new Set([process.pid, ...guests.map(guest => guest.child.pid)]).size, 8);
    for (let index = 0; index < guests.length; index++) await guests[index].client.command('room.join', { invite: room.invite, name: `画友 ${index + 1}` });
    const clients = [hostClient, ...guests.map(guest => guest.client)];
    const joined = await Promise.all(clients.map(client => client.state()));
    assert.ok(joined.every(view => view.room.members.length === 8));
    check('eight-independent-node-processes-joined', { processes: 8, mode: 'mock' });

    const svgFile = path.join(dataRoot, 'cli-draft.svg'); await fs.writeFile(svgFile, SVG);
    const cliProposal = await runCli(['--session', guests[0].ready.sessionFile, 'submit', '--file', svgFile, '--name', 'CLI 作品', '--width', '120', '--height', '120', '--id', 'cli-eight-peer-submit']);
    assert.equal(cliProposal.status, 'pending');
    const duplicate = await runCli(['--session', guests[0].ready.sessionFile, 'submit', '--file', svgFile, '--name', 'CLI 作品', '--width', '120', '--height', '120', '--id', 'cli-eight-peer-submit']);
    assert.deepEqual(duplicate, cliProposal);
    check('cli-submit-and-idempotent-retry');

    rpc = mcpPeer(guests[1].ready.sessionFile); children.push(rpc.child);
    const init = await rpc.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'eight-peer-verifier', version: '0.1.0' } });
    assert.equal(init.result.protocolVersion, '2025-11-25'); rpc.notify('notifications/initialized');
    const listed = await rpc.request('tools/list'); assert.ok(listed.result.tools.find(tool => tool.name === 'tea_submit_svg'));
    await rpc.tool('room_get_rules'); await rpc.tool('canvas_get_context');
    const mcpProposal = await rpc.tool('tea_submit_svg', { svg: SVG, name: 'MCP 作品', width: 120, height: 120, operationId: 'mcp-eight-peer-submit' });
    assert.equal(mcpProposal.status, 'pending');
    check('mcp-initialize-list-context-and-submit', { protocolVersion: '2025-11-25', tools: listed.result.tools.length });

    await hostClient.command('proposal.submit', { svg: SVG, name: '房主作品', width: 120, height: 120 });
    for (let index = 2; index < guests.length; index++) await guests[index].client.command('proposal.submit', { svg: SVG, name: `API 作品 ${index + 1}`, width: 120, height: 120 });
    const before = await Promise.all(clients.map(client => client.state()));
    assert.ok(before.every(view => view.scene.objects.length === 0));
    assert.ok(before.every(view => view.proposals.length === 1 && view.proposals[0].authorId === view.self.id));
    await assert.rejects(rpc.tool('tea_approve', { proposalId: mcpProposal.proposalId, hash: mcpProposal.hash }), error => error.code === 'FORBIDDEN');
    check('pending-assets-private-and-agent-management-denied');

    async function approve(proposal) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await fetch(`${host.url}/api/command`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${host.uiToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: `approve-${proposal.id}`, name: 'proposal.approve', args: { proposalId: proposal.id, hash: proposal.hash } }) });
        const value = await response.json();
        if (value.ok) return value.result;
        if (value.error?.code !== 'REQUEST_RATE_LIMIT') throw Object.assign(new Error(value.error?.code || 'APPROVAL_FAILED'), { code: value.error?.code });
        await pause(550);
      }
      throw new Error('APPROVAL_RATE_TIMEOUT');
    }
    for (const proposal of host.service.view(true).proposals) await approve(proposal);
    const revision = host.service.view(true).scene.revision;
    const synchronized = await waitForViews(clients, revision);
    const hashes = synchronized.map(view => digest(view.scene));
    assert.equal(new Set(hashes).size, 1);
    check('eight-approved-artworks-converge', { revision, objects: 8, sceneSha256: hashes[0] });

    const otherObject = synchronized[0].scene.objects.find(object => object.authorId !== synchronized[1].self.id);
    await assert.rejects(guests[0].client.command('proposal.submit', { svg: SVG, objectId: otherObject.id, baseRevision: otherObject.revision, width: 120, height: 120 }), error => error.code === 'NOT_OWNER');
    check('cross-owner-write-rejected');
    const exported = await rpc.tool('tea_export_svg');
    assert.equal(typeof exported.svg, 'string'); assert.equal((exported.svg.match(/data-author=/g) || []).length, 8);
    assert.ok(exported.svg.includes('clip-path="url('));
    const file = path.join(out, 'eight-peer-canvas.svg'); await fs.writeFile(file, exported.svg);
    check('editable-svg-export-integrity', { bytes: Buffer.byteLength(exported.svg), sha256: digest(exported.svg), file });
    report = { status: 'passed', mode: 'mock', endpoints: 8, distinctProcesses: 8, cliAndMcpSubprocesses: true, realSteamVerified: false, durationMs: Date.now() - start, checks };
  } catch (error) {
    report = { status: 'failed', mode: 'mock', durationMs: Date.now() - start, error: { code: error.code || error.message || 'MULTIPROCESS_FAILED' }, checks };
  } finally {
    await Promise.allSettled(children.map(stopChild));
    if (host) await host.close();
    if (hub) await hub.close();
    // Remove only the verifier's checked private temporary directory.
    const relative = path.relative(out, dataRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('UNSAFE_VERIFICATION_CLEANUP');
    await fs.rm(dataRoot, { recursive: true, force: true });
  }
  await fs.writeFile(path.join(out, 'multiprocess-report.json'), JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length && (argv.length !== 2 || argv[0] !== '--out')) { process.stderr.write('Usage: node scripts/verify-multiprocess.js [--out DIRECTORY]\n'); process.exitCode = 1; }
  else verifyMultiprocess({ out: argv[1] }).then(report => { process.stdout.write(`${JSON.stringify(report)}\n`); if (report.status !== 'passed') process.exitCode = 1; }).catch(() => { process.stderr.write('Multiprocess verification could not complete.\n'); process.exitCode = 1; });
}
module.exports = { verifyMultiprocess };
