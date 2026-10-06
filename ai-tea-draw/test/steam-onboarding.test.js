'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { run, cleanupPrivateDirectory } = require('../scripts/verify-steam-onboarding');
test('Steam verifier timeout stops its own process tree before removing only its private directory', { skip: process.platform !== 'win32' }, async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tea-steam-verifier-'));
  const privateRoot = await fs.mkdtemp(path.join(out, '.private-'));
  const script = path.join(privateRoot, 'child.js'), pidFile = path.join(privateRoot, 'grandchild.pid');
  await fs.writeFile(script, `const fs=require('node:fs');const{spawn}=require('node:child_process');if(process.argv[2]==='grandchild'){setInterval(()=>{},100);}else{const child=spawn(process.execPath,[__filename,'grandchild'],{windowsHide:true,stdio:'ignore'});fs.writeFileSync(process.argv[2],String(child.pid));setInterval(()=>{},100);}`);
  try {
    await assert.rejects(run(process.execPath, [script, pidFile], { timeoutMs: 900 }), { code: 'CHILD_TIMEOUT' });
    const pid = Number(await fs.readFile(pidFile, 'utf8')); assert.ok(Number.isInteger(pid) && pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await assert.rejects(cleanupPrivateDirectory({ privateRoot: out, out }), /UNSAFE_PRIVATE_DIRECTORY/);
    const cleaned = await cleanupPrivateDirectory({ privateRoot, out }); assert.equal(cleaned.privateProcessesRemaining, 0); assert.equal(cleaned.privateDirectoryRemoved, true);
    await assert.rejects(fs.access(privateRoot), { code: 'ENOENT' });
  } finally {
    try { await fs.access(privateRoot); await cleanupPrivateDirectory({ privateRoot, out }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rmdir(out);
  }
});
test('verifier uses direct child exit when a detached grandchild keeps inherited output pipes open', { skip: process.platform !== 'win32' }, async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tea-steam-verifier-'));
  const privateRoot = await fs.mkdtemp(path.join(out, '.private-'));
  const script = path.join(privateRoot, 'inherited-pipe.js'), pidFile = path.join(privateRoot, 'grandchild.pid');
  await fs.writeFile(script, `const fs=require('node:fs');const{spawn}=require('node:child_process');if(process.argv[2]==='grandchild'){console.log('fixture descendant output');setInterval(()=>{},100);}else{const child=spawn(process.execPath,[__filename,'grandchild'],{windowsHide:true,detached:true,stdio:['ignore','inherit','inherit']});fs.writeFileSync(process.argv[2],String(child.pid));child.unref();console.log(JSON.stringify({ok:false,error:{code:'PARENT_FIXTURE_EXIT',message:'Synthetic fixture parent exited.'}}));process.exitCode=1;}`);
  try {
    const result = await run(process.execPath, [script, pidFile], { timeoutMs: 2000 });
    assert.equal(result.code, 1); assert.equal(result.processExited, true); assert.equal(result.pipeDrainTimedOut, true);
    const structured = result.stdout.split(/\r?\n/).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.ok === false);
    assert.equal(structured.error.code, 'PARENT_FIXTURE_EXIT');
    const pid = Number(await fs.readFile(pidFile, 'utf8')); process.kill(pid, 0);
    const cleaned = await cleanupPrivateDirectory({ privateRoot, out });
    assert.equal(cleaned.privateProcessesRemaining, 0); assert.equal(cleaned.extraPrivateProcessesStopped, 1); assert.equal(cleaned.privateDirectoryRemoved, true);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    try { await fs.access(privateRoot); await cleanupPrivateDirectory({ privateRoot, out }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rmdir(out);
  }
});
