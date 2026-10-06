'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { setup, detect, destination, parse, SERVER, CLIENTS, probe } = require('../src/agent-setup');
const { parseArgs } = require('../scripts/setup');
const { onboard } = require('../scripts/onboard');
const { startHub } = require('../transport/mock-hub');
const { startApp } = require('../src/main');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '茶绘 setup '));
  t.after(() => { assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { home: dir, project: path.join(dir, 'project'), env: {} };
}
for (const agent of CLIENTS) test(agent + ' setup preserves unrelated config, probes real MCP, repeats and backs up', async t => {
  const options = { ...fixture(t), agent };
  const target = destination(agent, options);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  const original = agent === 'codex' ? '# 用户注释\nmodel = "custom"\n[mcp_servers.other]\ncommand = "other"\nargs = []\n' : '\uFEFF{\n  // 用户注释\n  "custom": "keep",\n  "mcpServers": { "other": { "command": "other", "args": [] }, },\n}\n';
  fs.writeFileSync(target.file, original);
  const first = await setup(options);
  assert.equal(first.status, 'configured'); assert.equal(first.configured, true);
  assert.equal(first.verification.status, 'passed'); assert.equal(first.verification.tools, require('../src/mcp').TOOLS.length); assert.equal(first.verification.steam, 'not-checked');
  assert.equal(fs.readFileSync(first.backup, 'utf8'), original);
  const changed = fs.readFileSync(target.file, 'utf8'), parsed = parse(changed, target.format);
  assert.ok(changed.includes('用户注释')); assert.equal(parsed[target.key].other.command, 'other');
  assert.ok(path.isAbsolute(parsed[target.key][SERVER].command));
  assert.ok(path.isAbsolute(parsed[target.key][SERVER].args[0]));
  const again = await setup(options); assert.equal(again.status, 'already-configured');
  assert.equal(fs.readFileSync(target.file, 'utf8'), changed); assert.equal(again.backup, undefined);
  assert.equal(fs.existsSync(target.file + '.ai-tea-draw.lock'), false);
  // A managed version can update its trusted guide without touching other entries.
  const updated = await setup({ ...options, guideUrl: 'https://tea.example/AGENT-START.md' });
  assert.equal(updated.status, 'updated');
  assert.equal(parse(fs.readFileSync(target.file, 'utf8'), target.format)[target.key].other.command, 'other');
});

test('auto detection selects active Agent, never installs into all ambiguous clients', async t => {
  const options = fixture(t);
  assert.equal(detect({ ...options, env: { CODEX_THREAD_ID: 'active', TERM_PROGRAM: 'vscode' } }).agent, 'codex');
  assert.equal(detect({ ...options, env: { CLAUDECODE: '1' } }).agent, 'claude');
  assert.equal(detect({ ...options, env: { CURSOR_AGENT: '1' } }).agent, 'cursor');
  assert.equal(detect({ ...options, env: { GEMINI_CLI: '1' } }).agent, 'gemini');
  const first = await setup(options); assert.equal(first.configured, false); assert.equal(first.status, 'manual-configuration');
  assert.deepEqual(fs.readdirSync(options.home), []);
  for (const agent of ['codex', 'cursor']) {
    const target = destination(agent, options); fs.mkdirSync(path.dirname(target.file), { recursive: true }); fs.writeFileSync(target.file, '{}');
  }
  const ambiguous = await setup(options); assert.equal(ambiguous.configured, false);
  assert.deepEqual(ambiguous.detected.candidates.sort(), ['codex', 'cursor']);
  assert.equal(fs.readFileSync(destination('cursor', options).file, 'utf8'), '{}');
});

test('existing conflicting, invalid and duplicate-key configs remain byte-for-byte unchanged', async t => {
  const options = { ...fixture(t), agent: 'cursor' }, target = destination('cursor', options);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  for (const [text, code] of [
    ['{"mcpServers":{"ai-tea-draw":{"command":"custom"}}}', 'CONFIG_CONFLICT'],
    ['{"broken":', 'CONFIG_INVALID'],
    ['{"mcpServers":{},"mcpServers":{}}', 'CONFIG_DUPLICATE_KEY'],
    ['{"mcpServers":[]}', 'CONFIG_INVALID']
  ]) {
    fs.writeFileSync(target.file, text); await assert.rejects(setup(options), error => error.code === code);
    assert.equal(fs.readFileSync(target.file, 'utf8'), text);
    assert.equal(fs.existsSync(target.file + '.ai-tea-draw.lock'), false);
  }
});

test('user modifications to managed entries are not replaced; inline TOML is not corrupted', async t => {
  const options = { ...fixture(t), agent: 'cursor' }, target = destination('cursor', options);
  await setup(options);
  const modified = JSON.parse(fs.readFileSync(target.file, 'utf8')); modified.mcpServers[SERVER].env = { PERSONAL: 'do-not-replace' };
  const original = JSON.stringify(modified); fs.writeFileSync(target.file, original);
  await assert.rejects(setup({ ...options, guideUrl: 'https://tea.example/guide.md' }), error => error.code === 'CONFIG_CONFLICT');
  assert.equal(fs.readFileSync(target.file, 'utf8'), original);
  const codex = destination('codex', options); fs.mkdirSync(path.dirname(codex.file), { recursive: true });
  const inline = 'mcp_servers = { other = { command = "other" } }\n'; fs.writeFileSync(codex.file, inline);
  await assert.rejects(setup({ ...options, agent: 'codex' }), error => ['CONFIG_INVALID', 'CONFIG_CONFLICT'].includes(error.code));
  assert.equal(fs.readFileSync(codex.file, 'utf8'), inline);
});

test('Gemini allowed/excluded policy is respected, not loosened by setup', async t => {
  const options = { ...fixture(t), agent: 'gemini' }, target = destination('gemini', options);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  for (const mcp of [{ allowed: ['other'] }, { excluded: [SERVER] }]) {
    const original = JSON.stringify({ mcp }); fs.writeFileSync(target.file, original);
    await assert.rejects(setup(options), error => error.code === 'CLIENT_POLICY_BLOCKED');
    assert.equal(fs.readFileSync(target.file, 'utf8'), original);
  }
});

test('scope and explicit directories stay in chosen user/project profile', t => {
  const options = fixture(t);
  for (const agent of CLIENTS) {
    const user = destination(agent, options), project = destination(agent, { ...options, scope: 'project' });
    assert.ok(user.file.startsWith(options.home + path.sep)); assert.ok(project.file.startsWith(options.project + path.sep));
  }
  const custom = path.join(options.home, 'profile', 'mcp.json');
  assert.equal(destination('vscode', { ...options, config: custom }).file, custom);
  assert.throws(() => destination('codex', { scope: 'all' }), /scope/);
  assert.throws(() => destination('claude', { env: { CLAUDE_CONFIG_DIR: 'custom' } }), error => error.code === 'CONFIG_PATH_REQUIRED');
});

test('probe failure and invalid guide cannot write a client configuration', async t => {
  const options = { ...fixture(t), agent: 'codex' };
  const root = path.join(options.home, 'fake'); fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'mcp.js'), 'process.exit(1)');
  await assert.rejects(setup({ ...options, root }), error => error.code === 'MCP_PROBE_FAILED');
  assert.equal(fs.existsSync(destination('codex', options).file), false);
  for (const guideUrl of ['http://evil.example/guide', 'https://user:password@evil.example/guide', 'https://tea.example/guide#token']) {
    await assert.rejects(setup({ ...options, guideUrl }), error => error.code === 'GUIDE_URL_INVALID');
  }
  await assert.rejects(probe({ command: process.execPath, args: ['-e', 'setInterval(()=>{},100)'] }, { timeout: 150 }), error => error.code === 'MCP_PROBE_FAILED');
});

test('live configuration lock is respected and dead owner is recovered', async t => {
  const options = { ...fixture(t), agent: 'cursor' }, target = destination('cursor', options);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  const lock = target.file + '.ai-tea-draw.lock'; fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  await assert.rejects(setup(options), error => error.code === 'CONFIG_BUSY');
  assert.ok(fs.existsSync(lock));
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483647 }));
  const result = await setup(options); assert.equal(result.configured, true); assert.equal(fs.existsSync(lock), false);
});

test('setup arguments reject duplicates and real tea setup subprocess produces usable configuration', async t => {
  assert.throws(() => parseArgs(['--agent', 'codex', '--agent', 'cursor']), /参数/);
  const options = fixture(t);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/tea.js'), 'setup', '--agent', 'codex', '--home', options.home], { shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(stderr + stdout)));
  });
  const result = JSON.parse(output); assert.equal(result.ok, true); assert.equal(result.result.configured, true);
  assert.equal(result.result.verification.tools, require('../src/mcp').TOOLS.length);
});

test('combined onboarding configures then hosts and joins, preserving setup on native action failure', async t => {
  const options = fixture(t);
  const hub = await startHub();
  const apps = [];
  t.after(async () => { for (const app of apps.reverse()) await app.close(); await hub.close(); });
  const host = await startApp({ mode: 'mock', hub: hub.url, data: path.join(options.home, 'host'), open: false }); apps.push(host);
  const guest = await startApp({ mode: 'mock', hub: hub.url, data: path.join(options.home, 'guest'), open: false }); apps.push(guest);
  const result = await onboard(['--agent', 'codex', '--home', options.home, '--host', '--session', path.join(options.home, 'host/session.json'), '--topic', '一键配置茶会', '--no-open']);
  assert.equal(result.setup.configured, true); assert.equal(result.connection.status, 'created');
  const invite = path.join(options.home, 'invite.txt'); fs.writeFileSync(invite, result.connection.invite);
  const joined = await onboard(['--agent', 'cursor', '--home', options.home, '--join', '--session', path.join(options.home, 'guest/session.json'), '--invite-file', invite, '--no-open']);
  assert.equal(joined.setup.configured, true); assert.equal(joined.connection.room, result.connection.room); assert.equal(joined.connection.connection.connected, true);
  await assert.rejects(onboard(['--agent', 'codex', '--home', options.home, '--host', '--session', path.join(options.home, 'missing-session.json'), '--no-open']), error => error.code === 'SESSION_UNAVAILABLE' && error.setup.configured === true);
  const helpHome = path.join(options.home, 'help-only');
  const help = await onboard(['--home', helpHome, '--help']); assert.ok(help.help); assert.equal(fs.existsSync(helpHome), false);
});

test('another program changing configuration during MCP probe cannot lose its changes', async t => {
  const options = { ...fixture(t), agent: 'cursor' }, target = destination('cursor', options);
  fs.mkdirSync(path.dirname(target.file), { recursive: true }); fs.writeFileSync(target.file, '{"custom":"before"}');
  const root = path.join(options.home, 'probe-fixture'); fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const modified = '{"custom":"changed-by-another-program"}';
  const realMcp = path.resolve(__dirname, '../src/mcp.js');
  fs.writeFileSync(path.join(root, 'src', 'mcp.js'), `require('node:fs').writeFileSync(${JSON.stringify(target.file)}, ${JSON.stringify(modified)});require(${JSON.stringify(realMcp)}).startServer({});`);
  await assert.rejects(setup({ ...options, root }), error => error.code === 'CONFIG_CHANGED');
  assert.equal(fs.readFileSync(target.file, 'utf8'), modified);
  assert.equal(fs.existsSync(target.file + '.ai-tea-draw.json'), false);
});
