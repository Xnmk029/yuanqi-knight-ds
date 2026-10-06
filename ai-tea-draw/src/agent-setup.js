'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const toml = require('@iarna/toml');
const jsonc = require('jsonc-parser');
const { version } = require('../package.json');

const SERVER = 'ai-tea-draw';
const CLIENTS = ['codex', 'claude', 'cursor', 'vscode', 'gemini'];
const BEGIN = '# BEGIN AI-TEA-DRAW MANAGED';
const END = '# END AI-TEA-DRAW MANAGED';
const LIMIT = 2 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => sha(JSON.stringify(canonical(value)));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function read(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) fail('CONFIG_UNSAFE', '配置目标必须是普通文件。');
    if (stat.size > LIMIT) fail('CONFIG_TOO_LARGE', '配置文件超出读取限制。');
    return fs.readFileSync(file, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function parse(text, format) {
  const source = (text || '').replace(/^\uFEFF/, '');
  if (!source.trim()) return {};
  if (format === 'toml') {
    try { return toml.parse(source); } catch { fail('CONFIG_INVALID', '现有 TOML 无法解析，保留原文件。'); }
  }
  const errors = [];
  const tree = jsonc.parseTree(source, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || tree?.type !== 'object') fail('CONFIG_INVALID', '现有 JSON 配置无法解析，保留原文件。');
  // A duplicate key can make a client read a different entry than the installer.
  function unique(node) {
    if (node.type === 'object') {
      const keys = new Set();
      for (const property of node.children || []) {
        const key = property.children[0].value;
        if (keys.has(key)) fail('CONFIG_DUPLICATE_KEY', '配置包含重复键，保留原文件。');
        keys.add(key);
      }
    }
    for (const child of node.children || []) unique(child);
  }
  unique(tree);
  return jsonc.getNodeValue(tree);
}

function destination(agent, options = {}) {
  const env = options.env || process.env;
  const home = path.resolve(options.home || os.homedir());
  const project = path.resolve(options.project || process.cwd());
  const scope = options.scope || 'user';
  if (!['user', 'project'].includes(scope)) fail('INVALID_ARGUMENT', 'scope 必须是 user 或 project。');
  let file;
  if (agent === 'codex') file = path.join(scope === 'project' ? path.join(project, '.codex') : (!options.home && env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(home, '.codex')), 'config.toml');
  if (agent === 'claude') {
    if (!options.home && env.CLAUDE_CONFIG_DIR && scope === 'user' && !options.config) fail('CONFIG_PATH_REQUIRED', 'Claude 使用了自定义配置目录，请由 Agent 传入 --config 确认实际文件。');
    file = scope === 'project' ? path.join(project, '.mcp.json') : path.join(home, '.claude.json');
  }
  if (agent === 'cursor') file = path.join(scope === 'project' ? project : home, '.cursor', 'mcp.json');
  if (agent === 'gemini') file = path.join(scope === 'project' ? project : home, '.gemini', 'settings.json');
  // Use Microsoft's portable format so both VS Code and its Agent Host can read it.
  if (agent === 'vscode') file = scope === 'project' ? path.join(project, '.mcp.json') : path.join(!options.home && env.COPILOT_HOME ? path.resolve(env.COPILOT_HOME) : path.join(home, '.copilot'), 'mcp-config.json');
  if (!file) fail('INVALID_AGENT', '请选择受支持的 Agent，或使用 generic 获取通用配置。');
  return { agent, scope, file: path.resolve(options.config || file), format: agent === 'codex' ? 'toml' : 'jsonc', key: agent === 'codex' ? 'mcp_servers' : 'mcpServers' };
}

function detect(options = {}) {
  const env = options.env || process.env;
  const strong = [];
  if (env.CODEX_THREAD_ID || env.CODEX_HOME) strong.push('codex');
  if (env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID) strong.push('claude');
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID) strong.push('cursor');
  if (env.GEMINI_CLI) strong.push('gemini');
  if (strong.length === 1) return { agent: strong[0], source: 'active-agent-environment' };
  if (strong.length > 1) return { agent: 'generic', source: 'ambiguous-environment', candidates: strong };
  const candidates = CLIENTS.filter(agent => {
    try { return fs.existsSync(destination(agent, options).file); } catch { return false; }
  });
  return candidates.length === 1 ? { agent: candidates[0], source: 'single-existing-configuration' } : { agent: 'generic', source: candidates.length ? 'multiple-existing-clients' : 'client-not-detected', candidates };
}

function launchConfig(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const bundled = path.join(root, 'runtime', 'node.exe');
  const command = fs.existsSync(bundled) ? bundled : process.execPath;
  const args = [path.join(root, 'src', 'mcp.js')];
  if (!fs.existsSync(args[0])) fail('APPLICATION_MISSING', '安装目录缺少 MCP 程序。');
  if (Number(process.versions.node.split('.')[0]) < 20) fail('NODE_VERSION_UNSUPPORTED', '需要 Node.js 20 或更新版本。');
  if (options.guideUrl) {
    let url;
    try { url = new URL(options.guideUrl); } catch { fail('GUIDE_URL_INVALID', '接入指引必须使用有效 HTTPS 地址。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('GUIDE_URL_INVALID', '接入指引必须使用不含凭据的 HTTPS 地址。');
    args.push('--guide-url', url.href);
  }
  return { command, args };
}

// Probe the actual bundled program. This does not create a room or initialize Steam.
async function probe(config, { timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', received = 0, initialized, tools, finished = false;
    const timer = setTimeout(() => finish(new Error('MCP_PROBE_TIMEOUT')), timeout);
    function finish(error) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      child.stdin.destroy();
      if (child.exitCode === null) child.kill();
      if (error) { error.code = 'MCP_PROBE_FAILED'; reject(error); }
      else resolve({ status: 'passed', protocolVersion: initialized.protocolVersion, serverVersion: initialized.serverInfo.version, tools: tools.length, steam: 'not-checked', clientReload: 'required' });
    }
    function send(message) { child.stdin.write(JSON.stringify(message) + '\n'); }
    child.stdin.on('error', error => { if (!finished) finish(error); });
    child.on('error', finish);
    child.stderr.on('data', bytes => { received += bytes.length; if (received > LIMIT) finish(new Error('MCP_OUTPUT_LIMIT')); });
    child.stdout.on('data', bytes => {
      received += bytes.length; if (received > LIMIT) { finish(new Error('MCP_OUTPUT_LIMIT')); return; }
      buffer += bytes.toString('utf8');
      while (!finished && buffer.includes('\n')) {
        const at = buffer.indexOf('\n'), line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { finish(new Error('MCP_INVALID_OUTPUT')); return; }
        if (message.error) { finish(new Error('MCP_RPC_ERROR')); return; }
        if (message.id === 1) {
          initialized = message.result;
          if (initialized?.serverInfo?.name !== SERVER || !initialized.capabilities?.tools) { finish(new Error('MCP_WRONG_SERVER')); return; }
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (message.id === 2) {
          tools = message.result?.tools;
          if (!Array.isArray(tools) || !['tea_create_room', 'tea_join_room', 'draft_validate', 'tea_submit_svg'].every(name => tools.some(tool => tool.name === name))) { finish(new Error('MCP_TOOLS_MISSING')); return; }
          child.stdin.end();
        }
      }
    });
    child.once('exit', code => { if (!finished) finish(code === 0 && initialized && tools ? null : new Error('MCP_EXITED_BEFORE_READY')); });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'ai-tea-draw-setup', version } } });
  });
}

function edit(original, target, entry, oldEntry) {
  const bom = original?.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = (original || '').replace(/^\uFEFF/, '');
  if (target.format === 'jsonc') {
    const source = text.trim() ? text : '{}\n';
    return bom + jsonc.applyEdits(source, jsonc.modify(source, [target.key, SERVER], entry, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' } }));
  }
  let source = text;
  if (oldEntry) {
    const start = source.indexOf(BEGIN), end = source.indexOf(END);
    if (start < 0 || end < start || source.indexOf(BEGIN, start + BEGIN.length) !== -1 || source.indexOf(END, end + END.length) !== -1) fail('CONFIG_CONFLICT', '现有茶绘 TOML 不属于安装器管理，保留原配置。');
    const block = source.slice(start + BEGIN.length, end);
    const parsed = parse(block, 'toml');
    if (fingerprint(parsed) !== fingerprint({ mcp_servers: { [SERVER]: oldEntry } })) fail('CONFIG_CONFLICT', '管理区块包含其他配置，不能自动覆盖。');
    source = source.slice(0, start) + source.slice(end + END.length).replace(/^\r?\n/, '');
  } else if (source.includes(BEGIN) || source.includes(END)) fail('CONFIG_CONFLICT', '管理标记不一致，保留原配置。');
  const block = `${BEGIN}\n[mcp_servers.${SERVER}]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n${END}\n`;
  const next = bom + source + (source.endsWith('\n') || !source ? '' : '\n') + '\n' + block;
  const parsed = parse(next, 'toml');
  if (fingerprint(parsed.mcp_servers?.[SERVER]) !== fingerprint(entry)) fail('CONFIG_CONFLICT', '无法安全追加 TOML 服务配置。');
  return next;
}

function atomicWrite(file, bytes) {
  const temporary = file + '.tmp-' + randomUUID();
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

async function setup(options = {}) {
  const config = launchConfig(options);
  const detected = options.agent && options.agent !== 'auto' ? { agent: options.agent, source: 'explicit' } : detect(options);
  if (![...CLIENTS, 'generic'].includes(detected.agent)) fail('INVALID_AGENT', '不支持该 Agent；可用 generic 导出通用配置。');
  if (detected.agent === 'generic') {
    const verification = await probe(config);
    return { status: 'manual-configuration', configured: false, detected, server: SERVER, mcp: { mcpServers: { [SERVER]: config } }, verification, nextStep: '当前客户端未唯一识别。Agent 可使用 --agent 指定客户端；其他客户端请导入返回的 stdio 配置，当前任务也可直接使用 tea CLI。' };
  }
  const target = destination(detected.agent, options);
  // Create only the selected client's directory; do not install into all detected clients.
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  const lock = target.file + '.ai-tea-draw.lock';
  let fd;
  for (let attempt = 0; attempt < 2 && fd === undefined; attempt++) {
    try { fd = fs.openSync(lock, 'wx', 0o600); fs.writeSync(fd, JSON.stringify({ pid: process.pid })); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const bytes = read(lock);
      let pid;
      try { pid = JSON.parse(bytes)?.pid; } catch {}
      if (!Number.isSafeInteger(pid) || pid < 1) fail('CONFIG_BUSY', '配置锁无效，请由 Agent 检查锁文件。');
      try { process.kill(pid, 0); fail('CONFIG_BUSY', '另一个配置任务正在运行，请稍后重试。'); }
      catch (active) { if (active.code !== 'ESRCH') throw active; }
      if (read(lock) !== bytes) fail('CONFIG_BUSY', '配置锁已变化，请稍后重试。');
      fs.unlinkSync(lock);
    }
  }
  if (fd === undefined) fail('CONFIG_BUSY', '无法取得配置锁，请稍后重试。');
  try {
    const original = read(target.file), parsed = parse(original, target.format);
    if (parsed[target.key] !== undefined && !object(parsed[target.key])) fail('CONFIG_INVALID', 'MCP 服务集合必须是对象，保留原配置。');
    const entry = detected.agent === 'codex' || detected.agent === 'gemini' ? config : { type: 'stdio', ...config };
    const current = parsed[target.key]?.[SERVER];
    const receiptFile = target.file + '.ai-tea-draw.json';
    const receiptText = read(receiptFile);
    let receipt;
    try { receipt = receiptText ? JSON.parse(receiptText) : null; } catch { fail('CONFIG_RECEIPT_INVALID', '茶绘配置记录无效，保留原配置。'); }
    const same = current !== undefined && fingerprint(current) === fingerprint(entry);
    if (current !== undefined && !same && (!receipt || receipt.entryHash !== fingerprint(current))) fail('CONFIG_CONFLICT', '已有同名 MCP 与安装器记录不符，保留原配置；请由 Agent 检查现有 ai-tea-draw 条目。');
    if (detected.agent === 'gemini' && (parsed.mcp?.excluded?.includes(SERVER) || (Array.isArray(parsed.mcp?.allowed) && !parsed.mcp.allowed.includes(SERVER)))) fail('CLIENT_POLICY_BLOCKED', 'Gemini 设置限制了该 MCP，请由用户调整允许列表。');
    const next = same ? original : edit(original, target, entry, current);
    const expected = parse(next, target.format);
    const verification = await probe(config);
    if (read(target.file) !== original) fail('CONFIG_CHANGED', '连接检查期间配置被其他程序修改，保留最新配置。');
    let backup;
    if (!same) {
      if (original !== null) { backup = target.file + '.ai-tea-backup-' + Date.now() + '-' + randomUUID(); fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 }); }
      atomicWrite(target.file, next);
      if (fingerprint(parse(read(target.file), target.format)) !== fingerprint(expected)) fail('CONFIG_VERIFY_FAILED', '写入后的配置校验失败。');
    }
    atomicWrite(receiptFile, JSON.stringify({ schema: 1, server: SERVER, version, entryHash: fingerprint(entry), configHash: sha(next), ...(backup ? { backup } : {}) }, null, 2));
    return { status: same ? 'already-configured' : current ? 'updated' : 'configured', configured: true, agent: detected.agent, scope: target.scope, configFile: target.file, ...(backup ? { backup } : {}), server: SERVER, mcp: entry, verification, nextStep: 'MCP 程序握手及工具发现已通过。请重新加载 MCP 或重开 Agent 会话；Steam 登录和联机在实际开房/加入时另行检查。当前任务可直接使用 tea CLI，无需等待重载。' };
  } finally { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lock); } }
}

module.exports = { setup, detect, destination, launchConfig, probe, parse, SERVER, CLIENTS };
