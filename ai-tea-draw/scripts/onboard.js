#!/usr/bin/env node
'use strict';
const { setup } = require('../src/agent-setup');
const { parseArgs, HELP } = require('./setup');
const launcher = require('../src/launcher');

async function onboard(argv) {
  const actionAt = argv.findIndex(arg => arg === '--host' || arg === '--join');
  const setupArgs = actionAt < 0 ? argv : argv.slice(0, actionAt);
  const options = parseArgs(setupArgs);
  if (options.help) return { help: HELP, action: '配置参数后可追加 --host 或 --join，再提供对应开房/加入参数。' };
  const configured = await setup(options);
  if (actionAt < 0) return { setup: configured };
  const action = argv[actionAt].slice(2);
  const launch = await launcher.parseArgs(action, argv.slice(actionAt + 1));
  if (options.guideUrl && !launch.guideUrl) launch.guideUrl = options.guideUrl;
  try { return { setup: configured, connection: await launcher[action](launch) }; }
  catch (error) {
    // A native Steam failure must not erase evidence that setup completed.
    error.setup = configured;
    throw error;
  }
}
async function main(argv = process.argv.slice(2)) {
  try { process.stdout.write(JSON.stringify({ ok: true, result: await onboard(argv) }) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify({ ok: false, ...(error.setup ? { result: { setup: error.setup } } : {}), error: { code: error.code || 'ONBOARDING_FAILED', message: error.message } }) + '\n'); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { onboard, main };
