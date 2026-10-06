'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { startHub } = require('../transport/mock-hub');
const { startApp } = require('../src/main');
const { TeaClient } = require('../src/client');
const launcher = require('../src/launcher');
const { decodeInvite, encodeInvite } = require('../src/session');
const { version } = require('../package.json');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="#4ab59f"/></svg>';
async function fixture(count = 1) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '茶绘 lifecycle '));
  const hub = await startHub(); const apps = [];
  try { for (let i = 0; i < count; i++) apps.push(await startApp({ mode: 'mock', hub: hub.url, data: path.join(dir, String(i)), open: false })); }
  catch (error) { for (const app of apps) await app.close(); await hub.close(); await fs.rm(dir, { recursive: true, force: true }); throw error; }
  return { dir, hub, apps, close: async () => { for (const app of [...apps].reverse()) await app.close(); await hub.close(); await fs.rm(dir, { recursive: true, force: true }); } };
}
function child(argv) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, [path.resolve(__dirname, '../scripts/tea.js'), ...argv], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { processChild.kill(); reject(new Error('CLI_TIMEOUT')); }, 10000);
    processChild.stdout.on('data', bytes => stdout += bytes.toString());
    processChild.stderr.on('data', bytes => stderr += bytes.toString());
    processChild.once('error', error => { clearTimeout(timer); reject(error); });
    processChild.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
test('launcher validates options and derives a versioned, transport-specific default cache', async () => {
  assert.equal(path.basename(launcher.defaultData()), 'steam');
  assert.equal(path.basename(path.dirname(launcher.defaultData())), version);
  assert.notEqual(launcher.defaultData({ mode: 'mock', hub: 'ws://127.0.0.1:10001' }), launcher.defaultData({ mode: 'mock', hub: 'ws://127.0.0.1:10002' }));
  assert.throws(() => launcher.defaultData({ mode: 'mock' }), { code: 'MOCK_HUB_REQUIRED' });
  assert.throws(() => launcher.defaultData({ mode: 'steam', hub: 'ws://127.0.0.1:10001' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.host({ guideUrl: 'http://example.test/' }), { code: 'GUIDE_HTTPS_REQUIRED' });
  await assert.rejects(launcher.host({ maxMembers: '4' }), { code: 'INVALID_CAPACITY' });
  await assert.rejects(launcher.host({ policy: 'familiar' }), { code: 'INVALID_POLICY' });
  await assert.rejects(launcher.host({ topic: 'x'.repeat(81) }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.host({ open: 'false' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.parseArgs('host', ['--name']), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.parseArgs('host', ['--name', 'A', '--name', 'B']), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.parseArgs('host', ['--data', 'A', '--session', 'B']), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.parseArgs('join', ['--invite', 'A', '--invite-stdin']), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(launcher.readInviteInput(Readable.from(['x'.repeat(16385)])), { code: 'INVITE_TOO_LARGE' });
  const options = await launcher.parseArgs('host', ['--topic=海边', '--max-members', '6', '--no-open']);
  assert.deepEqual(options, { topic: '海边', maxMembers: 6, open: false });
});
test('explicit host sessions reuse custom room and pending scene without returning UI capability', async () => {
  const f = await fixture();
  try {
    const app = f.apps[0], options = { sessionFile: app.sessionFile, topic: '一起画海边', maxMembers: 6, policy: 'strict', name: '房主 A', open: false };
    const first = await launcher.host(options);
    assert.equal(first.status, 'created'); assert.equal(first.started, false); assert.equal(first.roomInfo.name, options.topic);
    const client = new TeaClient({ sessionFile: app.sessionFile });
    await client.command('proposal.submit', { svg: SVG, name: '贝壳', x: 5, y: 5, width: 100, height: 100 });
    const before = await client.state();
    const reused = await launcher.host({ sessionFile: app.sessionFile, open: false });
    assert.equal(reused.status, 'already-hosting'); assert.equal(reused.epoch, first.epoch); assert.equal(reused.room, first.room);
    const changedGuide = await launcher.host({ sessionFile: app.sessionFile, guideUrl: 'https://example.test/AGENT-START.md', open: false });
    assert.equal(changedGuide.epoch, first.epoch); assert.equal(changedGuide.publicGuideAvailable, true);
    assert.match(changedGuide.shareMessage, /https:\/\/example\.test\/AGENT-START\.md/);
    assert.equal(first.publicGuideAvailable, false); assert.equal(first.installationRequired, true); assert.match(first.shareMessage, /先向房主取得安装包/);
    assert.equal(first.mode, 'mock'); assert.equal(first.connection.hub, f.hub.url); assert.match(first.installationHint, /本机程序已准备/);
    assert.equal(launcher.extractInvite(first.shareMessage), first.invite);
    const serialized = JSON.stringify(first);
    assert.ok(!serialized.includes(app.uiToken)); assert.ok(!serialized.includes(app.drawToken)); assert.ok(!serialized.includes('#token='));
    assert.equal(first.mcp.args.at(-1), app.sessionFile);
    assert.equal(first.cli, path.resolve(__dirname, '../scripts/tea.js'));
    for (const conflicting of [{ roomName: '另一主题' }, { maxMembers: 4 }, { policy: 'trusted' }]) {
      await assert.rejects(launcher.host({ sessionFile: app.sessionFile, open: false, ...conflicting }), { code: 'ALREADY_IN_ROOM' });
    }
    const after = await client.state(); assert.equal(after.room.epoch, first.epoch); assert.deepEqual(after.proposals, before.proposals);
    await assert.rejects(client.command('proposal.approve', { proposalId: before.proposals[0].id, hash: before.proposals[0].contentHash }), { code: 'FORBIDDEN' });
    await assert.rejects(fs.access(path.join(path.dirname(app.sessionFile), 'room.lock')), { code: 'ENOENT' });
    app.service.invite = encodeInvite({ ...decodeInvite(first.invite), expiresAt: Date.now() - 1000 });
    await assert.rejects(launcher.host({ sessionFile: app.sessionFile, open: false }), { code: 'INVITE_EXPIRED' });
    assert.equal(app.service.view().room.epoch, first.epoch);
  } finally { await f.close(); }
});
test('join accepts a complete share sentence, reuses same room, and rejects room or transport replacement', async () => {
  const f = await fixture(3);
  try {
    const a = await launcher.host({ sessionFile: f.apps[0].sessionFile, topic: '同一画布', open: false });
    const b = await launcher.host({ sessionFile: f.apps[1].sessionFile, topic: '另一画布', open: false });
    const guest = f.apps[2], invitationFile = path.join(f.dir, '分享消息.txt');
    await fs.writeFile(invitationFile, a.shareMessage);
    const joined = await launcher.join({ sessionFile: guest.sessionFile, inviteFile: invitationFile, name: 'B', open: false });
    assert.equal(joined.status, 'joined'); assert.equal(joined.room, a.room); assert.equal(joined.epoch, a.epoch);
    const again = await launcher.join({ sessionFile: guest.sessionFile, invite: a.shareMessage, open: false });
    assert.equal(again.status, 'already-joined'); assert.equal(again.epoch, a.epoch);
    await assert.rejects(launcher.join({ sessionFile: guest.sessionFile, invite: b.shareMessage, open: false }), { code: 'ALREADY_IN_ROOM' });
    await assert.rejects(launcher.host({ sessionFile: guest.sessionFile, open: false }), { code: 'ALREADY_IN_ROOM' });
    const before = await fs.readFile(guest.sessionFile, 'utf8');
    await assert.rejects(launcher.ensureEndpoint({ sessionFile: guest.sessionFile, mode: 'steam' }), { code: 'SESSION_MODE_MISMATCH' });
    await assert.rejects(launcher.ensureEndpoint({ data: path.dirname(guest.sessionFile), mode: 'mock', hub: 'ws://127.0.0.1:1' }), { code: 'SESSION_MODE_MISMATCH' });
    assert.equal(await fs.readFile(guest.sessionFile, 'utf8'), before);
    assert.equal((await new TeaClient({ sessionFile: guest.sessionFile }).state()).room.epoch, a.epoch);
  } finally { await f.close(); }
});
test('same-room host and join refuse reuse while the existing room is still leaving', async () => {
  const f = await fixture(); let release, leaving;
  try {
    const app = f.apps[0], first = await launcher.host({ sessionFile: app.sessionFile, open: false });
    const gate = new Promise(resolve => { release = resolve; }), original = app.service.transport.leave.bind(app.service.transport);
    app.service.transport.leave = async () => { await gate; return original(); };
    leaving = app.service.command('room.leave');
    assert.equal((await new TeaClient({ sessionFile: app.sessionFile }).state()).connection.syncing, true);
    await assert.rejects(launcher.host({ sessionFile: app.sessionFile, open: false }), { code: 'SESSION_BUSY' });
    await assert.rejects(launcher.join({ sessionFile: app.sessionFile, invite: first.shareMessage, open: false }), { code: 'SESSION_BUSY' });
    release(); await leaving;
    assert.equal(app.service.view().room, null); assert.equal(app.service.view().connection.syncing, false);
  } finally { release?.(); await leaving?.catch(() => {}); await f.close(); }
});

test('invalid explicit session and cancellation never start or overwrite another endpoint', async () => {
  const f = await fixture();
  try {
    const missing = path.join(f.dir, 'not-started', 'session.json');
    await assert.rejects(launcher.host({ sessionFile: missing, open: false }), { code: 'SESSION_UNAVAILABLE' });
    await assert.rejects(fs.access(path.dirname(missing)), { code: 'ENOENT' });
    const invalid = path.join(f.dir, 'invalid-session.json'); await fs.writeFile(invalid, '{}');
    await assert.rejects(launcher.ensureEndpoint({ sessionFile: invalid }), { code: 'SESSION_UNAVAILABLE' });
    assert.equal(await fs.readFile(invalid, 'utf8'), '{}');
    const blocked = path.join(f.dir, 'blocked'); await fs.mkdir(blocked);
    const blockedSession = path.join(blocked, 'session.json');
    const sessionText = JSON.stringify({ url: 'http://127.0.0.1:1', token: 'valid-but-offline-draw-token', pid: process.pid, mode: 'steam' });
    await fs.writeFile(blockedSession, sessionText);
    await assert.rejects(launcher.ensureEndpoint({ data: blocked }), { code: 'SESSION_UNAVAILABLE' });
    assert.equal(await fs.readFile(blockedSession, 'utf8'), sessionText);
    const app = f.apps[0], lock = path.join(path.dirname(app.sessionFile), 'room.lock');
    const lockText = JSON.stringify({ pid: process.pid, id: 'owned-by-another-request', time: Date.now() }); await fs.writeFile(lock, lockText);
    await assert.rejects(launcher.host({ sessionFile: app.sessionFile, open: false, signal: AbortSignal.timeout(75) }), { code: 'CANCELLED' });
    assert.equal(await fs.readFile(lock, 'utf8'), lockText); assert.equal(app.service.view().room, null);
    await fs.unlink(lock);
    await fs.writeFile(lock, JSON.stringify({ pid: 2147483647, id: 'stale-dead-request', time: Date.now() - 5000 }));
    const recovered = await Promise.all([launcher.host({ sessionFile: app.sessionFile, open: false }), launcher.host({ sessionFile: app.sessionFile, open: false })]);
    assert.equal(recovered[0].epoch, recovered[1].epoch); assert.deepEqual(recovered.map(value => value.status).sort(), ['already-hosting', 'created']);
    await assert.rejects(fs.access(lock), { code: 'ENOENT' });
    await assert.rejects(fs.access(`${lock}.recovery`), { code: 'ENOENT' });
    const cancelledDirectory = path.join(f.dir, 'cancelled-before-start');
    await assert.rejects(launcher.ensureEndpoint({ data: cancelledDirectory, signal: AbortSignal.abort() }), { code: 'CANCELLED' });
    await assert.rejects(fs.access(cancelledDirectory), { code: 'ENOENT' });
  } finally { await f.close(); }
});
test('tea wrapper keeps drawing CLI compatibility and emits structured lifecycle errors on stdout', async () => {
  const f = await fixture();
  try {
    const status = await child(['--session', f.apps[0].sessionFile, 'status']);
    assert.equal(status.code, 0); assert.equal(status.stderr, ''); assert.equal(JSON.parse(status.stdout).result.connection.mode, 'mock');
    const bad = await child(['host', '--max-members', 'abc']);
    assert.equal(bad.code, 1); assert.equal(bad.stderr, ''); assert.equal(JSON.parse(bad.stdout).error.code, 'INVALID_CAPACITY');
    const badJoin = await child(['join', '--invite-file']);
    assert.equal(badJoin.code, 1); assert.equal(JSON.parse(badJoin.stdout).error.code, 'INVALID_ARGUMENT');
    const help = await child(['--help']);
    assert.equal(help.code, 0); assert.equal(help.stderr, '');
    const helpValue = JSON.parse(help.stdout).result;
    assert.equal(helpValue.version, version); assert.match(helpValue.commands.host, /tea host/); assert.match(helpValue.commands.join, /invite-stdin/);
    assert.equal(helpValue.defaultSession, path.join(launcher.defaultData(), 'session.json')); assert.match(helpValue.session, /Steam 缓存/);
  } finally { await f.close(); }
});
