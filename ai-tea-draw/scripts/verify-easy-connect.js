'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { TeaClient } = require('../src/client');
const { kitRoot } = require('../src/main');

const appRoot = path.resolve(__dirname, '..');
const teaFile = path.join(appRoot, 'scripts', 'tea.js');
const cliFile = path.join(appRoot, 'src', 'cli.js');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" rx="18" fill="#e6efe2"/><ellipse cx="76" cy="67" rx="49" ry="30" fill="#7fa8b5"/><path d="M116 61 L145 39 L140 85 Z" fill="#7fa8b5"/><circle cx="48" cy="62" r="4" fill="#344c52"/><path d="M39 74 Q50 82 62 73" fill="none" stroke="#45636a" stroke-width="3"/></svg>';

function redact(error) {
  return String(error?.message || error)
    .replace(/tea:\/\/join\/[A-Za-z0-9_-]+/g, 'tea://join/[redacted]')
    .replace(/([#?&]token=)[^\s'"<>]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [redacted]')
    .replace(/("(?:token|uiToken|secret)"\s*:\s*")[^"]+/g, '$1[redacted]')
    .slice(0, 1400);
}

function verifyTemporaryTarget(directory) {
  const absolute = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!absolute.startsWith(temporaryRoot + path.sep) || !path.basename(absolute).startsWith('ai-tea-easy-connect-')) {
    throw new Error('UNSAFE_PRIVATE_DIRECTORY');
  }
  return absolute;
}

function assertNoAdminCredentials(result) {
  function inspect(value) {
    if (typeof value === 'string') {
      assert.ok(!/[#?&]token=/.test(value), 'Agent launcher result must not expose the human UI capability');
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!/^(?:uiToken|adminToken|browserUrl)$/i.test(key), 'Agent launcher result must not contain admin credential fields');
      inspect(item);
    }
  }
  inspect(result);
}

function privatePreloadSource(captureFile) {
  // This verifier-only preload observes the existing browser launch. It adds no
  // production endpoint or capability; the public launcher still returns draw-only state.
  return `'use strict';
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const nativeSpawn = childProcess.spawn;
const captureFile = ${JSON.stringify(captureFile)};
childProcess.spawn = function (executable, args, options) {
  let openedUrl;
  if (String(executable).toLowerCase() === 'powershell.exe' && Array.isArray(args)) {
    const index = args.indexOf('-EncodedCommand');
    if (index >= 0 && typeof args[index + 1] === 'string') {
      const command = Buffer.from(args[index + 1], 'base64').toString('utf16le');
      const match = /^Start-Process '([^']+)'$/.exec(command);
      if (match) {
        try {
          const candidate = new URL(match[1]);
          if (candidate.protocol === 'http:' && candidate.hostname === '127.0.0.1' && candidate.port && candidate.pathname === '/' && !candidate.search && !candidate.username && !candidate.password && /^#token=[A-Za-z0-9_-]+$/.test(candidate.hash)) openedUrl = match[1];
        } catch {}
      }
    }
  }
  if (openedUrl) {
    fs.appendFileSync(captureFile, JSON.stringify({ pid: process.pid, url: openedUrl }) + ${JSON.stringify('\n')}, { mode: 0o600 });
    const fake = new EventEmitter();
    fake.pid = 0; fake.exitCode = 0; fake.signalCode = null;
    fake.unref = () => fake;
    fake.kill = () => true;
    setImmediate(() => { fake.emit('exit', 0, null); fake.emit('close', 0, null); });
    return fake;
  }
  return nativeSpawn.call(this, executable, args, options);
};
`;
}

function checkPrivatePreload() {
  const captured = [];
  let fallbackCalls = 0;
  const subprocess = { spawn() { fallbackCalls += 1; return { nativeFallback: true }; } };
  vm.runInNewContext(privatePreloadSource('private-capture.jsonl'), {
    require(name) {
      if (name === 'node:fs') return { appendFileSync(file, text) { captured.push({ file, text }); } };
      if (name === 'node:child_process') return subprocess;
      return require(name);
    }, process: { pid: 777 }, Buffer, URL, setImmediate
  });
  const url = 'http://127.0.0.1:45678/#token=verification_sample';
  const fake = subprocess.spawn('powershell.exe', ['-EncodedCommand', Buffer.from(`Start-Process '${url}'`, 'utf16le').toString('base64')]);
  assert.equal(fake.pid, 0);
  assert.equal(fallbackCalls, 0);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, JSON.stringify({ pid: 777, url }) + '\n');
  assert.equal(subprocess.spawn('node.exe', []).nativeFallback, true);
  assert.equal(fallbackCalls, 1);
}

function childRunner({ environment, children }) {
  return function run(script, args = [], { stdin, timeout = 35000, expectSuccess = true, env = {} } = {}) {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: appRoot, windowsHide: true,
      env: { ...environment, ...env }, stdio: ['pipe', 'pipe', 'pipe']
    });
    children.add(child);
    return new Promise((resolve, reject) => {
      let stdout = '', stderr = '', finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(Object.assign(new Error('Launcher or CLI subprocess timed out'), { code: 'SUBPROCESS_TIMEOUT' }));
      }, timeout);
      child.stdout.on('data', bytes => { stdout += bytes.toString(); if (stdout.length > 2 * 1024 * 1024) { child.kill(); finish(new Error('SUBPROCESS_OUTPUT_LIMIT')); } });
      child.stderr.on('data', bytes => { stderr += bytes.toString(); if (stderr.length > 512 * 1024) { child.kill(); finish(new Error('SUBPROCESS_OUTPUT_LIMIT')); } });
      child.once('error', error => finish(error));
      child.once('close', exitCode => {
        let envelope;
        for (const line of [...stdout.split(/\r?\n/), ...stderr.split(/\r?\n/)].filter(Boolean)) {
          try { const value = JSON.parse(line); if (typeof value?.ok === 'boolean') envelope = value; } catch { /* Diagnostics are never copied into the public report. */ }
        }
        if (!envelope) { finish(new Error('SUBPROCESS_INVALID_JSON')); return; }
        if (expectSuccess && (exitCode !== 0 || !envelope.ok)) {
          finish(Object.assign(new Error(envelope.error?.message || 'Launcher or CLI subprocess failed'), { code: envelope.error?.code || 'SUBPROCESS_FAILED' }));
          return;
        }
        finish(null, { exitCode, envelope, result: envelope.result, pid: child.pid });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(stdin === undefined ? undefined : stdin);
    });
  };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2500);
    child.once('close', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function stopDetached(pid) {
  if (!Number.isInteger(pid) || pid < 1 || pid === process.pid) throw new Error('UNSAFE_SERVICE_PID');
  const alive = () => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
  if (!alive()) return;
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && alive()) await pause(60);
  if (alive()) { process.kill(pid, 'SIGKILL'); await pause(100); }
  if (alive()) throw new Error('DETACHED_SERVICE_STILL_ALIVE');
}

async function waitUntil(predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await pause(70);
  }
  throw new Error(`Timed out: ${description}`);
}

function sessionRecord(sessionFile, privateDirectory) {
  const file = path.resolve(sessionFile);
  const relative = path.relative(privateDirectory, file);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Launcher session file stays in verifier-owned private data');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Number.isInteger(value.pid) && value.pid > 0 && value.pid !== process.pid);
  const url = new URL(value.url);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  return value;
}

async function launchHub({ privateDirectory, environment, children }) {
  const entry = path.join(privateDirectory, 'hub.cjs');
  fs.writeFileSync(entry, `'use strict';
const {startHub}=require(${JSON.stringify(path.join(kitRoot(), 'mock-hub'))});
startHub({port:0}).then(hub=>{
  console.log(JSON.stringify({event:'ready',url:hub.url,pid:process.pid}));
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await hub.close();process.exit(0);};
  process.once('SIGTERM',close);process.once('SIGINT',close);
}).catch(()=>process.exit(1));
`, { mode: 0o600 });
  const child = spawn(process.execPath, [entry], { cwd: appRoot, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  const ready = await new Promise((resolve, reject) => {
    let text = '', complete = false;
    const finish = (error, value) => { if (complete) return; complete = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('MOCK_HUB_START_TIMEOUT')); }, 10000);
    child.stdout.on('data', bytes => {
      text += bytes.toString();
      if (text.length > 65536) { child.kill(); finish(new Error('MOCK_HUB_OUTPUT_LIMIT')); return; }
      for (const line of text.split(/\r?\n/)) {
        try { const result = JSON.parse(line); if (result.event === 'ready') finish(null, result); } catch {}
      }
    });
    child.stderr.on('data', () => {});
    child.once('error', error => finish(error));
    child.once('close', () => finish(new Error('MOCK_HUB_EXITED_BEFORE_READY')));
  });
  return { child, ...ready };
}

async function approveThroughHumanUi({ captureFile, host, proposal }) {
  const record = JSON.parse(fs.readFileSync(host.sessionFile, 'utf8'));
  let opened;
  await waitUntil(() => {
    if (!fs.existsSync(captureFile)) return false;
    const events = fs.readFileSync(captureFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    opened = events.find(event => event.pid === record.pid && new URL(event.url).origin === record.url);
    return !!opened;
  }, 'existing human browser capability captured privately');
  const browser = new URL(opened.url);
  const token = new URLSearchParams(browser.hash.slice(1)).get('token');
  assert.ok(token && token !== record.token, 'Human UI and Agent drawing credentials are separate');
  const response = await fetch(`${browser.origin}/api/command`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'easy-connect-human-approval', name: 'proposal.approve', args: { proposalId: proposal.proposalId, hash: proposal.hash } })
  });
  const reply = await response.json();
  assert.equal(reply.ok, true, 'Existing human UI capability approves a proposal');
  assert.equal(reply.result.status, 'accepted');
  return reply.result;
}

async function verifyEasyConnect({ out = path.join(appRoot, 'verification', 'easy-connect') } = {}) {
  const output = path.resolve(out);
  fs.mkdirSync(output, { recursive: true });
  const started = Date.now();
  const report = {
    status: 'passed', mode: 'mock', realSteamVerified: false,
    proof: 'Real, independent Node processes use the actual mock transport and local application API. This is not evidence of cross-account Steam connectivity.',
    startedAt: new Date(started).toISOString(), checks: [], errors: [], cleanupErrors: []
  };
  checkPrivatePreload();
  if (!fs.existsSync(teaFile) || !fs.existsSync(path.join(appRoot, 'src', 'launcher.js'))) {
    report.status = 'blocked';
    report.errors.push({ code: 'LAUNCHER_NOT_READY', message: 'The new host/join launcher API has not been installed yet.' });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  }
  if (process.platform !== 'win32') {
    report.status = 'blocked';
    report.errors.push({ code: 'WINDOWS_BROWSER_LAUNCH_CAPTURE_REQUIRED', message: 'This verifier intercepts the existing Windows browser launch without opening a real browser.' });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  }
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tea-easy-connect-'));
  verifyTemporaryTarget(privateDirectory);
  const captureFile = path.join(privateDirectory, 'human-browser-private.jsonl');
  const preload = path.join(privateDirectory, 'verification-private-preload.cjs');
  fs.writeFileSync(preload, privatePreloadSource(captureFile), { mode: 0o600 });
  const environment = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require="${preload.replace(/\\/g, '/')}"`.trim()
  };
  const children = new Set();
  const servicePids = new Set();
  const dataDirectories = [path.join(privateDirectory, 'host-a'), path.join(privateDirectory, 'guest-b'), path.join(privateDirectory, 'host-c')];
  const run = childRunner({ environment, children });
  const check = (name, details) => report.checks.push({ name, status: 'passed', ...(details ? { details } : {}) });
  try {
    const hub = await launchHub({ privateDirectory, environment, children });
    const hostArgs = ['host', '--name', '茶茶', '--room-name', '一句邀请的画室', '--topic', '深海夜市', '--max-members', '4', '--policy', 'strict', '--mode', 'mock', '--hub', hub.url, '--data', dataDirectories[0]];
    const parallel = await Promise.all([
      run(teaFile, [...hostArgs, '--operation-id', 'easy-connect-create-a-1']),
      run(teaFile, [...hostArgs, '--operation-id', 'easy-connect-create-a-2'])
    ]);
    assert.ok(parallel.every(item => item.envelope.ok && item.exitCode === 0));
    const hosts = parallel.map(item => item.result);
    hosts.forEach(assertNoAdminCredentials);
    assert.equal(hosts[0].sessionFile, hosts[1].sessionFile);
    assert.equal(Number(hosts[0].started) + Number(hosts[1].started), 1);
    const hostRecord = sessionRecord(hosts[0].sessionFile, privateDirectory);
    servicePids.add(hostRecord.pid);
    const hostClient = new TeaClient({ sessionFile: hosts[0].sessionFile });
    const firstState = await hostClient.state();
    assert.ok(firstState.room?.code && firstState.self.isHost);
    assert.equal(firstState.room.members.length, 1);
    assert.ok(firstState.room.epoch);
    assert.equal(firstState.self.name, '茶茶');
    assert.ok(hosts.every(host => host.room === firstState.room.code && host.epoch === firstState.room.epoch));
    assert.ok(hosts.every(host => typeof host.shareMessage === 'string' && host.shareMessage.includes(host.invite)));
    assert.equal(hosts[0].invite, hosts[1].invite);
    check('two-concurrent-host-commands-reuse-one-service-and-one-room-epoch', { startedServices: 1, hostCommands: 2 });
    assert.ok(hostRecord.pid !== hub.pid && parallel.every(item => item.pid !== hostRecord.pid));
    await pause(100);
    assert.equal((await hostClient.state()).room.epoch, firstState.room.epoch);
    check('detached-service-remains-ready-after-both-host-command-processes-exit');

    const inviteFile = path.join(privateDirectory, 'complete-share-message.txt');
    fs.writeFileSync(inviteFile, hosts[0].shareMessage, { mode: 0o600 });
    const guestArgs = ['join', '--invite-file', inviteFile, '--data', dataDirectories[1], '--name', '小鱼朋友', '--no-open', '--operation-id', 'easy-connect-join-b'];
    const joined = (await run(teaFile, guestArgs)).result;
    assertNoAdminCredentials(joined);
    assert.equal(joined.started, true);
    const guestRecord = sessionRecord(joined.sessionFile, privateDirectory);
    servicePids.add(guestRecord.pid);
    assert.notEqual(guestRecord.pid, hostRecord.pid);
    assert.notEqual(guestRecord.pid, hub.pid);
    const guestClient = new TeaClient({ sessionFile: joined.sessionFile });
    const guestState = await guestClient.state();
    assert.equal(guestState.room.code, firstState.room.code);
    assert.equal(guestState.room.epoch, firstState.room.epoch);
    assert.equal(guestState.room.hostId, firstState.room.hostId);
    assert.equal(guestState.room.members.length, 2);
    assert.ok(guestState.quota.region);
    assert.equal(guestState.self.name, '小鱼朋友');
    check('single-join-command-parses-only-the-complete-returned-share-message-and-synchronizes-room');
    assert.ok(joined.mcp && typeof joined.mcp.command === 'string' && Array.isArray(joined.mcp.args));
    assert.ok(joined.mcp.args.includes(joined.sessionFile));
    assert.ok(fs.existsSync(joined.cli || cliFile));
    check('join-returns-real-cli-and-scoped-mcp-entry-points');

    const svgFile = path.join(privateDirectory, 'first-contribution.svg');
    fs.writeFileSync(svgFile, SVG, { mode: 0o600 });
    const proposal = (await run(joined.cli || cliFile, ['--session', joined.sessionFile, 'submit', '--file', svgFile, '--name', '一句邀请后的第一笔', '--width', '160', '--height', '120', '--id', 'easy-connect-submit-b'])).result;
    assert.equal(proposal.status, 'pending');
    assert.equal((await hostClient.state()).scene.objects.length, 0);
    const forbidden = await run(hosts[0].cli || cliFile, ['--session', hosts[0].sessionFile, 'approve', '--proposal-id', proposal.proposalId, '--hash', proposal.hash], { expectSuccess: false });
    assert.equal(forbidden.envelope.ok, false);
    assert.equal(forbidden.envelope.error.code, 'FORBIDDEN');
    check('returned-agent-session-submits-a-private-proposal-and-cannot-approve');
    await approveThroughHumanUi({ captureFile, host: hosts[0], proposal });
    await waitUntil(async () => (await guestClient.state()).scene.objects.length === 1, 'approved contribution synchronized to invited participant');
    const approvedStates = await Promise.all([hostClient.state(), guestClient.state()]);
    assert.equal(hash(approvedStates[0].scene), hash(approvedStates[1].scene));
    const expectedScene = hash(approvedStates[0].scene);
    report.sceneSha256 = expectedScene;
    check('existing-human-ui-capability-approves-and-independent-agent-service-receives-identical-scene');

    const repeatedHost = (await run(teaFile, [...hostArgs, '--operation-id', 'easy-connect-repeat-create-a'])).result;
    assert.equal(repeatedHost.started, false);
    assert.equal(repeatedHost.sessionFile, hosts[0].sessionFile);
    const repeatedGuest = (await run(teaFile, ['join', '--invite-stdin', '--data', dataDirectories[1], '--name', '小鱼朋友', '--no-open', '--operation-id', 'easy-connect-repeat-join-b'], { stdin: hosts[0].shareMessage })).result;
    assert.equal(repeatedGuest.started, false);
    assert.equal(repeatedGuest.sessionFile, joined.sessionFile);
    for (const view of await Promise.all([hostClient.state(), guestClient.state()])) {
      assert.equal(view.room.epoch, firstState.room.epoch);
      assert.equal(view.room.members.length, 2);
      assert.equal(hash(view.scene), expectedScene);
    }
    check('repeated-host-and-share-message-stdin-join-preserve-epoch-members-and-existing-artwork');

    const competing = (await run(teaFile, ['host', '--name', '另一位房主', '--room-name', '另一个画室', '--topic', '另一个主题', '--max-members', '4', '--policy', 'strict', '--mode', 'mock', '--hub', hub.url, '--data', dataDirectories[2], '--no-open', '--operation-id', 'easy-connect-create-c'])).result;
    const competingRecord = sessionRecord(competing.sessionFile, privateDirectory);
    servicePids.add(competingRecord.pid);
    assert.notEqual(competingRecord.pid, hostRecord.pid);
    assert.notEqual(competingRecord.pid, guestRecord.pid);
    fs.writeFileSync(inviteFile, competing.shareMessage, { mode: 0o600 });
    const rejectedSwitch = await run(teaFile, ['join', '--invite-file', inviteFile, '--data', dataDirectories[1], '--name', '小鱼朋友', '--no-open', '--operation-id', 'easy-connect-wrong-room'], { expectSuccess: false });
    assert.equal(rejectedSwitch.envelope.ok, false, 'Joining a different active room must be refused');
    assert.notEqual(rejectedSwitch.exitCode, 0);
    for (const view of await Promise.all([hostClient.state(), guestClient.state()])) {
      assert.equal(view.room.code, firstState.room.code);
      assert.equal(view.room.epoch, firstState.room.epoch);
      assert.equal(hash(view.scene), expectedScene);
    }
    check('different-room-join-is-refused-without-leaving-original-room-or-changing-artwork', { errorCode: rejectedSwitch.envelope.error.code });
    report.detachedServiceProcesses = servicePids.size;
    report.distinctMockHubProcess = true;
    assert.equal(servicePids.size, 3);
    check('all-test-room-services-and-mock-hub-run-in-distinct-node-processes', { roomServices: 3, hubProcesses: 1 });
  } catch (error) {
    report.status = 'failed';
    report.errors.push({ code: error.code || 'EASY_CONNECT_CHECK_FAILED', message: redact(error) });
  } finally {
    // Discover any verifier-started services even when a preceding command failed.
    for (const directory of dataDirectories) {
      const file = path.join(directory, 'session.json');
      if (fs.existsSync(file)) {
        try { servicePids.add(sessionRecord(file, privateDirectory).pid); }
        catch (error) { report.cleanupErrors.push(redact(error)); }
      }
    }
    for (const pid of servicePids) {
      try { await stopDetached(pid); } catch (error) { report.cleanupErrors.push(redact(error)); }
    }
    for (const child of children) {
      try { await stopChild(child); } catch (error) { report.cleanupErrors.push(redact(error)); }
    }
    try { fs.rmSync(verifyTemporaryTarget(privateDirectory), { recursive: true, force: true }); }
    catch (error) { report.cleanupErrors.push(redact(error)); }
    if (report.cleanupErrors.length) report.status = 'failed';
    report.privateDirectoryRemoved = !fs.existsSync(privateDirectory);
    report.ownedBackgroundProcessesTerminated = report.cleanupErrors.length === 0;
    report.durationMs = Date.now() - started;
    report.credentialsPersistedInReport = false;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) {
    console.error('Usage: node scripts/verify-easy-connect.js [--out <directory>]'); process.exitCode = 1;
  } else {
    verifyEasyConnect({ ...(args.length ? { out: args[1] } : {}) })
      .then(report => { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'passed' ? 0 : report.status === 'blocked' ? 2 : 1; })
      .catch(error => { console.error(JSON.stringify({ status: 'failed', error: redact(error) })); process.exitCode = 1; });
  }
}

module.exports = { verifyEasyConnect };
