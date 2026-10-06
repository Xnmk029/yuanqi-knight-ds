'use strict';

// Optional verification/context renderer. The normal client only needs a browser and ws;
// this helper additionally needs playwright-core and an installed Chromium browser.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { sanitizeSvg } = require('./svg');

function fail(code, message) { return Object.assign(new Error(message), { code }); }
function playwrightPath() {
  const candidates = [
    'playwright-core',
    path.join(__dirname, '..', '..', 'steam-spacewar-multiplayer-skill', 'node_modules', 'playwright-core'),
  ];
  for (const candidate of candidates) { try { return require.resolve(candidate); } catch {} }
  throw fail('PREVIEW_UNAVAILABLE', 'Optional renderer needs playwright-core; it is not included in the compact player package.');
}
function findBrowser() {
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const result = candidates.find(candidate => fs.existsSync(candidate));
  if (!result) throw fail('PREVIEW_UNAVAILABLE', 'No supported installed Chromium browser was found.');
  return result;
}
function workerEnvironment() {
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH', 'HOME', 'DISPLAY', 'XDG_RUNTIME_DIR', 'LANG']) if (process.env[name]) env[name] = process.env[name];
  return env;
}
async function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' });
      const done = () => { clearTimeout(timer); child.kill('SIGKILL'); resolve(); };
      const timer = setTimeout(() => { killer.kill(); done(); }, 2000);
      killer.once('error', done); killer.once('exit', done);
    });
  } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
}

async function renderPreview(svg, options = {}) {
  const asset = sanitizeSvg(svg);
  const width = options.width ?? 512;
  if (!Number.isSafeInteger(width) || width < 16 || width > 1024) throw fail('PREVIEW_OPTIONS', 'Preview width must be an integer from 16 to 1024.');
  const aspect = asset.viewBox[3] / asset.viewBox[2];
  const height = options.height ?? Math.max(1, Math.min(1024, Math.round(width * aspect)));
  if (!Number.isSafeInteger(height) || height < 1 || height > 1024) throw fail('PREVIEW_OPTIONS', 'Preview height must be an integer from 1 to 1024.');
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 30000) throw fail('PREVIEW_OPTIONS', 'Preview timeout must be from 25 to 30000 ms.');
  const browserPath = options.browserPath ? path.resolve(options.browserPath) : findBrowser();
  if (!fs.existsSync(browserPath)) throw fail('PREVIEW_UNAVAILABLE', 'Browser executable does not exist.');
  const modulePath = playwrightPath();
  const request = JSON.stringify({ svg:asset.svg, width, height, browserPath, modulePath });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=128', __filename, '--preview-worker'], {
      windowsHide:true, detached:process.platform !== 'win32', stdio:['pipe','pipe','pipe'], env:workerEnvironment(),
    });
    let settled = false, out = '', err = '';
    const finish = async (error, value, kill = false) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (kill) await terminateTree(child);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => { finish(fail('PREVIEW_TIMEOUT', 'Preview rendering exceeded its time limit.'), null, true); }, timeoutMs);
    child.once('error', error => finish(fail('PREVIEW_PROCESS', error.message), null, true));
    child.stdin.on('error', () => {});
    child.stdout.on('data', bytes => { out += bytes.toString('utf8'); if (Buffer.byteLength(out) > 8*1024*1024) finish(fail('PREVIEW_OUTPUT', 'Preview output exceeded its limit.'), null, true); });
    child.stderr.on('data', bytes => { err = (err + bytes.toString('utf8')).slice(-8192); });
    child.once('exit', code => {
      if (settled) return;
      let data; try { data = JSON.parse(out); } catch { return finish(fail('PREVIEW_PROCESS', `Renderer did not return valid output (exit ${code}). ${err.slice(-500)}`)); }
      if (code !== 0 || data.error) return finish(fail(data.error?.code || 'PREVIEW_FAILED', data.error?.message || `Renderer exited ${code}.`));
      finish(null, data);
    });
    child.stdin.end(request);
  });
  const png = Buffer.from(result.png, 'base64');
  if (!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.length > 5*1024*1024) throw fail('PREVIEW_OUTPUT', 'Renderer output is not a bounded PNG.');
  if (options.output) { const output = path.resolve(options.output); fs.mkdirSync(path.dirname(output), {recursive:true}); fs.writeFileSync(output,png); result.output = output; }
  return { png, width, height, bytes:png.length, hash:createHash('sha256').update(png).digest('hex'), stats:result.stats, ...(result.output ? {output:result.output} : {}) };
}

async function worker() {
  let request = '', browser;
  try {
    for await (const bytes of process.stdin) { request += bytes.toString('utf8'); if (Buffer.byteLength(request) > 300*1024) throw fail('PREVIEW_INPUT','Preview worker input exceeds limit.'); }
    const input = JSON.parse(request), asset = sanitizeSvg(input.svg);
    const { chromium } = require(input.modulePath);
    const started = Date.now();
    browser = await chromium.launch({ executablePath:input.browserPath, headless:true, timeout:10000, args:[
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--no-first-run', '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=64', '--disk-cache-size=1', '--media-cache-size=1',
    ] });
    const context = await browser.newContext({ viewport:{width:input.width,height:input.height}, javaScriptEnabled:false, serviceWorkers:'block', acceptDownloads:false });
    let networkRequests = 0;
    await context.route('**/*', route => { networkRequests++; return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    // Only known canonical root attributes are resized; submitted markup never enters HTML.
    const imageSvg = asset.svg.replace(/^(<svg\b[^>]*\bwidth=")[^"]+/, `$1${input.width}`).replace(/^(<svg\b[^>]*\bheight=")[^"]+/, `$1${input.height}`);
    const imageSource = 'data:image/svg+xml;base64,' + Buffer.from(imageSvg).toString('base64');
    await page.setContent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;width:${input.width}px;height:${input.height}px;overflow:hidden}img{display:block;width:${input.width}px;height:${input.height}px}</style><img alt="" src="${imageSource}">`, {waitUntil:'load',timeout:3000});
    const decoded = await page.locator('img').evaluate(img => img.complete && img.naturalWidth > 0);
    if (!decoded) throw fail('PREVIEW_FAILED','SVG image did not decode.');
    const png = await page.screenshot({type:'png',omitBackground:true,timeout:3000});
    if (networkRequests) throw fail('PREVIEW_NETWORK','Renderer attempted a blocked request.');
    await context.close(); await browser.close(); browser = null;
    process.stdout.write(JSON.stringify({png:png.toString('base64'),stats:{networkRequests,elapsedMs:Date.now()-started,nodeHeapLimitMiB:128,rendererHeapLimitMiB:64}}));
  } catch (error) {
    if (browser) { try { await browser.close(); } catch {} }
    process.stdout.write(JSON.stringify({error:{code:error.code || 'PREVIEW_FAILED',message:error.message}})); process.exitCode = 1;
  }
}

if (require.main === module && process.argv[2] === '--preview-worker') worker();
module.exports = { renderPreview, findBrowser, playwrightPath };
