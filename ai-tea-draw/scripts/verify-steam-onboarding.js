'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { TeaClient, loadSession } = require('../src/client');

const APP_ROOT = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(String(value)).digest('hex');
function redact(value) {
  return String(value?.message || value)
    .replace(/tea:\/\/join\/[A-Za-z0-9_-]+/g, 'tea://join/[redacted]')
    .replace(/([#?&]token=)[^\s'"<>]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [redacted]')
    .replace(/("(?:token|uiToken|secret|invite|shareMessage|hostId|selfId)"\s*:\s*")[^"]+/g, '$1[redacted]')
    .replace(/\b\d{15,21}\b/g, '[Steam ID redacted]').slice(0, 1400);
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function contained(directory, parent) {
  const absolute = path.resolve(directory), root = path.resolve(parent);
  return absolute.toLowerCase().startsWith((root + path.sep).toLowerCase());
}
async function stopTree(pid) {
  if (!alive(pid)) return;
  assert.ok(pid !== process.pid && Number.isInteger(pid) && pid > 0, 'CLEANUP_CANNOT_KILL_VERIFIER');
  if (process.platform !== 'win32') { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } return; }
  await new Promise((resolve, reject) => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { killer.kill(); reject(new Error('CLEANUP_PROCESS_TREE_TIMEOUT')); }, 10000);
    killer.once('error', error => { clearTimeout(timer); reject(error); });
    killer.once('close', () => { clearTimeout(timer); resolve(); });
  });
  const deadline = Date.now() + 5000;
  while (alive(pid) && Date.now() < deadline) await pause(50);
  assert.ok(!alive(pid), 'CLEANUP_PROCESS_TREE_DID_NOT_EXIT');
}
function run(executable, args, { cwd, timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: cwd || APP_ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false, aborting = false, exited = false, exitCode = null, exitSignal = null, drainTimer;
    const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(drainTimer); if (error) reject(error); else resolve(value); };
    const abort = async error => {
      if (finished || aborting) return; aborting = true;
      error.privateOutput = { code: exitCode, stdout, stderr, parentExitedBeforeTimeout: exited, exitSignal };
      try { await stopTree(child.pid); } catch (cleanupError) { error.cleanupCode = cleanupError.code || cleanupError.message; }
      finish(error);
    };
    const timer = setTimeout(() => { void abort(Object.assign(new Error('Verifier child process timed out; its own process tree was stopped.'), { code: 'CHILD_TIMEOUT' })); }, timeoutMs);
    const collect = (target, bytes) => {
      if (finished) return;
      if (target === 'stdout') stdout += bytes.toString('utf8'); else stderr += bytes.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 16 * 1024 * 1024) void abort(Object.assign(new Error('Verifier output exceeded its private bound.'), { code: 'CHILD_OUTPUT_LIMIT' }));
    };
    child.stdout.on('data', bytes => collect('stdout', bytes)); child.stderr.on('data', bytes => collect('stderr', bytes));
    child.once('error', error => finish(error));
    child.once('exit', (code, signal) => {
      exited = true; exitCode = code; exitSignal = signal;
      if (aborting || finished) return;
      clearTimeout(timer);
      // A detached descendant can keep inherited pipes open after the direct child exits.
      // Allow buffered output to arrive, then finish using the observed process exit.
      drainTimer = setTimeout(() => {
        finish(null, { code: exitCode, stdout, stderr, processExited: true, pipeDrainTimedOut: true, exitSignal });
        child.stdout.destroy(); child.stderr.destroy();
      }, 300);
    });
    child.once('close', code => { if (!aborting) finish(null, { code, stdout, stderr, processExited: exited, pipeDrainTimedOut: false, exitSignal }); });
  });
}
async function privateProcesses(privateRoot) {
  const quoted = privateRoot.replace(/'/g, "''");
  const script = `$privateRoot='${quoted}'; Get-CimInstance -ClassName Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.Name -in @('node.exe','powershell.exe') -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($privateRoot+[System.IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) -or ($_.CommandLine -and $_.CommandLine.IndexOf($privateRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0)) } | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeoutMs: 15000 });
  if (result.code !== 0) throw new Error('CLEANUP_PROCESS_INVENTORY_FAILED');
  if (!result.stdout.trim()) return [];
  const value = JSON.parse(result.stdout.trim()); return Array.isArray(value) ? value : [value];
}
async function cleanupPrivateDirectory({ privateRoot, out }) {
  const realOut = await fs.realpath(path.resolve(out)), realPrivate = await fs.realpath(path.resolve(privateRoot));
  assert.ok(contained(realPrivate, realOut) && path.basename(realPrivate).startsWith('.private-'), 'UNSAFE_PRIVATE_DIRECTORY');
  let stopped = 0;
  if (process.platform === 'win32') {
    const records = await privateProcesses(realPrivate);
    for (const record of records) {
      assert.ok(Number.isInteger(record.ProcessId) && record.ProcessId > 0 && record.ProcessId !== process.pid, 'UNSAFE_PRIVATE_PROCESS');
      const executableInside = record.ExecutablePath && contained(record.ExecutablePath, realPrivate);
      const commandMatches = String(record.CommandLine || '').toLowerCase().includes(realPrivate.toLowerCase());
      assert.ok(executableInside || commandMatches, 'PRIVATE_PROCESS_IDENTITY_MISMATCH');
      if (alive(record.ProcessId)) { await stopTree(record.ProcessId); stopped++; }
    }
    assert.equal((await privateProcesses(realPrivate)).length, 0, 'PRIVATE_PROCESS_REMAINS');
  }
  // Windows may release native DLL/executable mappings just after process exit.
  const deadline = Date.now() + 8000;
  for (;;) {
    try { await fs.rm(realPrivate, { recursive: true, force: true }); break; }
    catch (error) { if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || Date.now() >= deadline) throw error; await pause(200); }
  }
  return { stopped: true, privateProcessesRemaining: 0, extraPrivateProcessesStopped: stopped, privateDirectoryRemoved: true };
}
function parseOutput(result) {
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const value = JSON.parse(lines[i]); if (typeof value.ok === 'boolean') return value; } catch { /* Installer diagnostics are not public output. */ }
  }
  throw Object.assign(new Error('Installer did not return a structured lifecycle result.'), { code: 'INVALID_INSTALLER_RESPONSE' });
}
async function stopPrivateService(sessionFile, privateRoot, installed) {
  assert.ok(contained(sessionFile, privateRoot), 'SESSION_PATH_ESCAPE');
  let session;
  try { session = await loadSession(sessionFile); }
  catch (error) { if (error.code === 'SESSION_NOT_FOUND') return { serviceFound: false, stopped: true }; throw error; }
  if (!alive(session.pid)) return { serviceFound: true, stopped: true };
  assert.ok(session.pid !== process.pid, 'VERIFIER_PID_IS_NOT_SERVICE');
  // Check the live process command line before terminating any PID from a file.
  const script = `Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${session.pid}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
  const probe = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeoutMs: 10000 });
  let record; try { record = JSON.parse(probe.stdout.trim()); } catch { throw new Error('CLEANUP_PROCESS_IDENTITY_UNAVAILABLE'); }
  const commandLine = String(record.CommandLine || '').toLowerCase();
  assert.equal(record.ProcessId, session.pid);
  assert.ok(commandLine.includes(path.join(installed, 'src', 'main.js').toLowerCase()), 'CLEANUP_MAIN_PATH_MISMATCH');
  assert.ok(commandLine.includes(path.dirname(sessionFile).toLowerCase()), 'CLEANUP_DATA_PATH_MISMATCH');
  try { await new TeaClient({ sessionFile, timeoutMs: 2500 }).command('room.leave'); } catch { /* Still stop our proven private service if its endpoint failed. */ }
  try { process.kill(session.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  const deadline = Date.now() + 5000;
  while (alive(session.pid) && Date.now() < deadline) await pause(50);
  assert.ok(!alive(session.pid), 'CLEANUP_SERVICE_DID_NOT_EXIT');
  return { serviceFound: true, stopped: true };
}

async function verifySteamOnboarding({ out = path.join(APP_ROOT, 'verification', 'steam-onboarding'), manifestFile = path.join(APP_ROOT, 'dist', 'release-manifest.json') } = {}) {
  out = path.resolve(out); manifestFile = path.resolve(manifestFile);
  await fs.mkdir(out, { recursive: true });
  const privateRoot = await fs.mkdtemp(path.join(out, '.private-'));
  assert.ok(contained(privateRoot, out) && path.basename(privateRoot).startsWith('.private-'), 'UNSAFE_PRIVATE_DIRECTORY');
  const cache = path.join(privateRoot, 'cache'), data = path.join(privateRoot, 'data'), sessionFile = path.join(data, 'session.json');
  const checks = [];
  const report = { schema: 1, time: new Date().toISOString(), mode: 'steam-single-endpoint', status: 'blocked', checks, proof: '只验证当前 Steam 账号单端安装、开房及重复复用，不证明不同 Steam 账号之间的联机。' };
  let installed, phase = 'installation', problem;
  const passed = (name, evidence = {}) => checks.push({ name, status: 'passed', ...evidence });
  try {
    assert.equal(process.platform, 'win32', 'WINDOWS_X64_REQUIRED'); assert.equal(process.arch, 'x64', 'WINDOWS_X64_REQUIRED');
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    assert.equal(manifest.schema, 1); assert.equal(manifest.version, require('../package.json').version); assert.equal(manifest.platform, 'windows-x64');
    const asset = manifest.variants.portable;
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    installed = path.join(cache, `${manifest.version}-portable-${asset.sha256.slice(0, 12)}`);
    assert.ok(contained(installed, privateRoot), 'INSTALL_PATH_ESCAPE');
    report.version = manifest.version; report.assetSha256 = asset.sha256; report.assetBytes = asset.bytes;
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(APP_ROOT, 'site', 'bootstrap.ps1'), '-CreateRoom', '-Topic', `Steam onboarding smoke ${randomUUID()}`, '-Members', '4', '-NoOpen', '-ManifestFile', manifestFile, '-CacheRoot', cache, '-Data', data], { timeoutMs: 90000 });
    const installedPackage = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'));
    assert.equal(installedPackage.version, manifest.version);
    for (const entry of ['host.cmd', 'tea.cmd', 'mcp.cmd', 'scripts/host.js', 'scripts/tea.js', 'src/mcp.js', 'runtime/node.exe']) assert.ok((await fs.stat(path.join(installed, entry))).isFile());
    passed('portable-install-and-entrypoints', { version: installedPackage.version, integrityCheckedByInstaller: true, entrypoints: ['host.cmd', 'tea.cmd', 'mcp.cmd'] });
    const node = path.join(installed, 'runtime', 'node.exe'), tea = path.join(installed, 'scripts', 'tea.js');
    const help = await run(node, [path.join(installed, 'src', 'mcp.js'), '--help'], { cwd: installed, timeoutMs: 10000 });
    assert.match(help.stdout + help.stderr, /Usage: node src\/mcp\.js/);
    passed('mcp-usage-entrypoint', { usageDisplayed: true, helpExitCode: help.code });
    const first = parseOutput(result);
    phase = 'room-creation';
    if (!first.ok) {
      const error = first.error || {};
      problem = { code: /steam|network connection|connect/i.test(error.message || '') ? 'STEAM_ENVIRONMENT_UNAVAILABLE' : error.code || 'ROOM_CREATION_BLOCKED', originalCode: error.code || null, message: redact(error.message || 'Steam room creation was blocked.'), phase };
      checks.push({ name: 'installed-steam-room-creation', status: 'blocked', code: problem.code, originalCode: problem.originalCode, message: problem.message });
    } else {
      assert.equal(result.code, 0); assert.equal(first.result.mode, 'steam'); assert.equal(first.result.roomInfo.maxMembers, 4); assert.equal(first.result.status, 'created');
      assert.equal(path.resolve(first.result.sessionFile), sessionFile); assert.ok(!JSON.stringify(first.result).includes('#token='));
      passed('installed-steam-room-creation', { mode: 'steam', maxMembers: 4, roomCreated: true });
    }
    let session;
    try { session = await loadSession(sessionFile); } catch { /* Native initialization can fail before creating an endpoint. */ }
    if (session) {
      const statusCommand = await run(node, [tea, '--session', sessionFile, 'status'], { cwd: installed, timeoutMs: 10000 });
      const status = parseOutput(statusCommand); assert.equal(statusCommand.code, 0); assert.equal(status.ok, true); assert.equal(status.result.connection.mode, 'steam');
      passed('installed-cli-state-read', { mode: 'steam', roomPresent: !!status.result.room });
      if (first.ok) {
        phase = 'repeated-host';
        const repeatedCommand = await run(node, [tea, 'host', '--session', sessionFile, '--no-open'], { cwd: installed, timeoutMs: 15000 });
        const repeated = parseOutput(repeatedCommand); assert.equal(repeatedCommand.code, 0); assert.equal(repeated.ok, true);
        assert.equal(repeated.result.mode, 'steam'); assert.equal(repeated.result.status, 'already-hosting'); assert.equal(repeated.result.started, false);
        assert.equal(repeated.result.room, first.result.room); assert.equal(repeated.result.epoch, first.result.epoch); assert.equal((await loadSession(sessionFile)).pid, session.pid);
        assert.equal(status.result.room.maxMembers, 4); assert.equal(status.result.room.epoch, first.result.epoch);
        passed('repeat-host-without-topic-preserves-service-and-room', { samePid: true, sameEpoch: true, maxMembers: 4, roomDigest: hash(first.result.room) });
      } else checks.push({ name: 'repeat-host-without-topic-preserves-service-and-room', status: 'not-run', reason: 'Steam room creation was blocked; no second creation attempt was made.' });
    } else checks.push({ name: 'installed-cli-state-read', status: 'not-run', reason: 'Native initialization did not produce a local endpoint.' });
    if (!problem) report.status = 'passed';
  } catch (error) {
    const exists = async file => { try { return (await fs.stat(file)).isFile(); } catch { return false; } };
    report.progress = { installedPackagePresent: !!installed && await exists(path.join(installed, 'package.json')), localSessionCreated: await exists(sessionFile), installerStructuredResultReceived: false };
    if (report.progress.localSessionCreated) phase = 'room-creation';
    if (error.privateOutput) {
      try {
        const partial = parseOutput(error.privateOutput); report.progress.installerStructuredResultReceived = true;
        if (!partial.ok && partial.error?.message) report.installerReason = { code: partial.error.code || 'COMMAND_FAILED', message: redact(partial.error.message) };
      } catch { /* Report bounded stderr only when no structured result was received. */ }
      if (!report.installerReason && error.privateOutput.stderr.trim()) report.installerReason = { code: 'INSTALLER_DIAGNOSTIC', message: redact(error.privateOutput.stderr.trim()).slice(0, 600) };
    }
    problem = { code: error.code || 'STEAM_ONBOARDING_FAILED', message: redact(error), phase };
    report.status = 'blocked'; checks.push({ name: phase, status: 'blocked', code: problem.code, message: problem.message });
  } finally {
    try {
      report.cleanup = installed ? await stopPrivateService(sessionFile, privateRoot, installed) : { serviceFound: false, stopped: true };
      report.cleanup = { ...report.cleanup, ...await cleanupPrivateDirectory({ privateRoot, out }) };
    } catch (error) {
      report.cleanup = { stopped: false, privateDirectoryRemoved: false, code: error.code || 'CLEANUP_FAILED', message: redact(error) };
      report.status = 'blocked'; if (!problem) problem = { code: 'CLEANUP_FAILED', message: redact(error), phase: 'cleanup' };
    }
    if (problem) report.blocked = problem;
    report.elapsedMs = Date.now() - Date.parse(report.time);
    await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

if (require.main === module) {
  const argv = process.argv.slice(2), options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--out', '--manifest-file'].includes(key) || !argv[i + 1]) throw new Error('Usage: node scripts/verify-steam-onboarding.js [--out DIR] [--manifest-file FILE]');
    options[key === '--out' ? 'out' : 'manifestFile'] = argv[++i];
  }
  verifySteamOnboarding(options).then(report => { process.stdout.write(`${JSON.stringify(report)}\n`); if (report.status !== 'passed') process.exitCode = 2; }).catch(error => { process.stderr.write(`${redact(error)}\n`); process.exitCode = 2; });
}
module.exports = { verifySteamOnboarding, cleanupPrivateDirectory, run };
