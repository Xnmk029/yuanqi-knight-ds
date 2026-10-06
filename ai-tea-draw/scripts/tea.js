'use strict';
const launcher = require('../src/launcher');
const path = require('node:path');
const drawingCli = require('../src/cli');
const { errorResult } = require('../src/client');
function lifecycleCommand(argv) {
  const valued = new Set(['--session', '--data', '--mode', '--hub', '--guide-url', '--operation-id']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (valued.has(arg)) { i++; continue; }
    if (arg.startsWith('--') || arg === '-h') continue;
    return ['host', 'join'].includes(arg) ? { kind: arg, index: i } : null;
  }
  return null;
}
async function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'setup') return require('./setup').main(argv.slice(1));
  const command = lifecycleCommand(argv);
  if (!command) {
    const help = !argv.length || argv.includes('--help') || argv.includes('-h') || argv[0] === 'help';
    if (help) {
      const result = { ...drawingCli.HELP, session: '--session FILE 或 AI_TEA_SESSION 优先；默认复用本版本 Steam 缓存中的 session.json。', defaultSession: path.join(launcher.defaultData(), 'session.json'), lifecycle: launcher.HELP, commands: { ...drawingCli.HELP.commands, host: launcher.HELP.host, join: launcher.HELP.join, setup: require('./setup').HELP.command }, transport: '默认真实 Steam；mock 仅限显式测试，需使用返回的 sessionFile。' };
      process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`); return;
    }
    const explicitSession = argv.some(arg => arg === '--session' || arg.startsWith('--session='));
    if (!help && !explicitSession && !process.env.AI_TEA_SESSION) argv = ['--session', path.join(launcher.defaultData(), 'session.json'), ...argv];
    return drawingCli.main(argv);
  }
  try {
    const rest = [...argv.slice(0, command.index), ...argv.slice(command.index + 1)];
    const options = await launcher.parseArgs(command.kind, rest);
    const result = options.help ? launcher.HELP : await launcher[command.kind](options);
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(errorResult(error))}\n`); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { main, lifecycleCommand };
