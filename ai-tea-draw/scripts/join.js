'use strict';
const launcher = require('../src/launcher');
const { errorResult } = require('../src/client');
async function run(argv = process.argv.slice(2)) {
  const options = await launcher.parseArgs('join', argv);
  return options.help ? launcher.HELP : launcher.join(options);
}
async function main(argv = process.argv.slice(2)) {
  try { process.stdout.write(`${JSON.stringify({ ok: true, result: await run(argv) })}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(errorResult(error))}\n`); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { join: launcher.join, run, main };
