#!/usr/bin/env node
'use strict';
const { setup, CLIENTS } = require('../src/agent-setup');
const HELP = { command: 'tea setup [--agent auto|codex|claude|cursor|vscode|gemini|generic] [--scope user|project] [--config FILE] [--project DIR] [--guide-url HTTPS_URL]', agents: CLIENTS, default: '自动识别当前 Agent，无法唯一识别时返回通用配置。用户范围；先验证 MCP 再写入；保留其他设置并备份。', noRoomRequired: true };
function parseArgs(argv) {
  const result = {}, names = { '--agent': 'agent', '--scope': 'scope', '--config': 'config', '--project': 'project', '--home': 'home', '--guide-url': 'guideUrl' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') { result.help = true; continue; }
    const key = names[argv[i]], value = argv[++i];
    if (!key || !value || value.startsWith('--') || Object.hasOwn(result, key)) throw Object.assign(new Error('启动参数无效或重复。'), { code: 'INVALID_ARGUMENT' });
    result[key] = value;
  }
  return result;
}
async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const result = options.help ? HELP : await setup(options);
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code || 'SETUP_FAILED', message: error.message } }) + '\n'); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { main, parseArgs, HELP };
