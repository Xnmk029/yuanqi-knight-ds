'use strict';
const launcher = require('../src/launcher');
const { errorResult } = require('../src/client');
async function run(argv = process.argv.slice(2)) {
  const options = await launcher.parseArgs('host', argv);
  return options.help ? launcher.HELP : launcher.host(options);
}
async function main(argv = process.argv.slice(2)) {
  try { process.stdout.write(`${JSON.stringify({ ok: true, result: await run(argv) })}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(errorResult(error))}\n`); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { host: launcher.host, run, main };
