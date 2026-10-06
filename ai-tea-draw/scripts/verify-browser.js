'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { startApp, kitRoot } = require('../src/main');

const appRoot = path.resolve(__dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const fixtures = [
  {
    name: '鲸鱼的茶摊', person: '茶茶',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"><rect x="0" y="0" width="480" height="320" rx="30" fill="#dce9ed"/><circle cx="367" cy="72" r="27" fill="#f8e5a7"/><path d="M90 185 C70 120 135 94 194 120 C210 65 278 63 316 113 C365 149 387 197 341 226 C298 253 214 243 157 226 C119 237 68 227 61 191 C85 196 95 190 90 185 Z" fill="#7fa8b5"/><path d="M155 129 C126 84 176 79 195 103 C198 70 240 80 227 121 Z" fill="#4f6e70"/><circle cx="296" cy="159" r="5" fill="#344c52"/><path d="M290 175 Q309 191 327 175" fill="none" stroke="#45636a" stroke-width="4"/><ellipse cx="223" cy="219" rx="47" ry="11" fill="#f4edd8"/><path d="M206 254 L206 275 M310 246 L310 275" stroke="#6d7c6d" stroke-width="7"/><path d="M76 70 Q104 42 138 65" fill="none" stroke="#a8c4c1" stroke-width="5"/><circle cx="386" cy="213" r="7" fill="#acc8ca"/><circle cx="406" cy="192" r="4" fill="#acc8ca"/></svg>'
  },
  {
    name: '夜市的小灯笼', person: '灯笼同学',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><rect width="400" height="320" rx="24" fill="#f2e6d2"/><path d="M40 55 Q195 125 360 42" fill="none" stroke="#789184" stroke-width="5"/><path d="M132 82 L132 114 M269 84 L269 116" stroke="#a27c56" stroke-width="3"/><ellipse cx="132" cy="158" rx="41" ry="53" fill="#d59c79"/><ellipse cx="132" cy="158" rx="17" ry="53" fill="none" stroke="#efcfa3" stroke-width="3"/><rect x="111" y="104" width="42" height="10" rx="3" fill="#a36d50"/><rect x="111" y="204" width="42" height="10" rx="3" fill="#a36d50"/><path d="M132 214 L132 252" stroke="#b98056" stroke-width="4"/><ellipse cx="269" cy="156" rx="33" ry="42" fill="#a7bc8d"/><ellipse cx="269" cy="156" rx="14" ry="42" fill="none" stroke="#e0e8b7" stroke-width="3"/><path d="M269 198 L269 231" stroke="#869f68" stroke-width="4"/><circle cx="204" cy="230" r="4" fill="#d8b777"/><circle cx="60" cy="220" r="5" fill="#d8b777"/><circle cx="330" cy="256" r="3" fill="#d8b777"/></svg>'
  },
  {
    name: '珊瑚的屋顶', person: '珊瑚建筑师',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><rect width="400" height="320" rx="24" fill="#e2ebdf"/><path d="M99 220 L99 118 Q161 98 214 118 L214 220 Z" fill="#d3b99b"/><path d="M72 119 Q157 57 240 119 Z" fill="#90a9a0"/><rect x="139" y="164" width="40" height="56" rx="20" fill="#7c9388"/><rect x="190" y="136" width="12" height="23" rx="4" fill="#f5e1ac"/><path d="M269 234 L269 97 M269 149 Q236 142 234 110 M269 127 Q302 130 307 89 M269 188 Q310 182 316 153" fill="none" stroke="#c7927e" stroke-width="12"/><circle cx="234" cy="105" r="10" fill="#d2a28b"/><circle cx="308" cy="84" r="10" fill="#d2a28b"/><path d="M60 236 Q191 252 340 233" fill="none" stroke="#aec0a4" stroke-width="5"/><circle cx="69" cy="73" r="13" fill="#c8d9bd"/></svg>'
  },
  {
    name: '最后一位小鱼顾客', person: '小鱼朋友',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><rect width="400" height="320" rx="24" fill="#e9e2ed"/><path d="M281 157 L337 109 L334 205 Z" fill="#c6a286"/><ellipse cx="190" cy="158" rx="105" ry="69" fill="#e0b992"/><circle cx="129" cy="146" r="6" fill="#6b7072"/><path d="M109 165 Q127 182 145 167" fill="none" stroke="#917c6d" stroke-width="4"/><path d="M199 104 L222 77 L237 112 M195 211 L226 244 L244 202" fill="#b38d83"/><path d="M236 113 Q255 161 236 205" fill="none" stroke="#ebd0ac" stroke-width="5"/><circle cx="66" cy="88" r="7" fill="#c1b4c7"/><circle cx="50" cy="64" r="4" fill="#c1b4c7"/><path d="M51 252 Q110 231 163 252 M268 265 Q308 247 354 262" fill="none" stroke="#c8bfd0" stroke-width="5"/></svg>'
  }
];

function redactedError(error) {
  return String(error?.message || error)
    .replace(/([#?&]token=)[^\s'"<>]+/gi, '$1[redacted]')
    .replace(/tea:\/\/join\/[A-Za-z0-9_-]+/g, 'tea://join/[redacted]')
    .slice(0, 2000);
}

function browserEnvironment() {
  let playwright;
  try {
    const entry = require.resolve('playwright-core', { paths: [appRoot, path.join(appRoot, '..', 'steam-spacewar-multiplayer-skill')] });
    playwright = require(entry);
  } catch {
    return { error: { code: 'PLAYWRIGHT_NOT_AVAILABLE', message: 'Browser verification requires the development verification dependency playwright-core; it is not part of the player package.' } };
  }
  const candidates = [
    process.env.AI_TEA_BROWSER,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
  ].filter(Boolean);
  const executablePath = candidates.find(file => fs.existsSync(file));
  if (!executablePath) return { error: { code: 'BROWSER_NOT_AVAILABLE', message: 'No installed Chrome, Chromium, or Edge was found. Set AI_TEA_BROWSER to the installed browser executable.' } };
  return { playwright, executablePath };
}

async function waitUntil(predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(70);
  }
  throw new Error(`Timed out: ${description}`);
}

async function readState(app) {
  const response = await fetch(`${app.url}/api/state`, { headers: { Authorization: `Bearer ${app.uiToken}` } });
  assert.equal(response.status, 200, 'Authenticated state request succeeds');
  return response.json();
}

async function canvasSvg(app) {
  const response = await fetch(`${app.url}/api/canvas`, { headers: { Authorization: `Bearer ${app.uiToken}` } });
  assert.equal(response.status, 200, 'Authenticated canvas request succeeds');
  return response.text();
}

async function fillDraft(page, fixture) {
  await page.locator('#draft-name').fill(fixture.name);
  await page.locator('#svg-editor').evaluate(node => { node.open = true; });
  await page.locator('#draft-svg').fill(fixture.svg);
  await page.locator('#preview-button').click();
  await page.locator('#draft-preview').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const image = document.getElementById('draft-preview-image');
    return image.complete && image.naturalWidth > 0;
  });
  await page.locator('#submit-button').click();
}

function removeOwnedTemporaryData(directory) {
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(temporaryRoot + path.sep) || !path.basename(resolved).startsWith('ai-tea-browser-')) {
    throw new Error('Temporary cleanup target is outside the owned verification directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

async function verifyBrowser({ out = path.join(appRoot, 'verification', 'frontend') } = {}) {
  const output = path.resolve(out);
  fs.mkdirSync(output, { recursive: true });
  const started = Date.now();
  const environment = browserEnvironment();
  const result = {
    status: 'passed', transport: 'mock', participants: 4, browserContexts: 4, mobileBrowserContexts: 1,
    startedAt: new Date(started).toISOString(),
    checks: [], screenshots: [], artifacts: [], errors: [], cleanupErrors: []
  };
  if (environment.error) {
    Object.assign(result, { status: 'blocked', reason: environment.error });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
    return result;
  }
  const privateData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tea-browser-'));
  const apps = [];
  const contexts = [];
  const pages = [];
  const pageErrors = [];
  const unexpectedRequests = [];
  let hub;
  let browser;
  const check = (name, detail) => result.checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) });
  const capture = async (page, filename, settle = true) => {
    if (settle) await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, undefined, { timeout: 8000 });
    const file = path.join(output, filename);
    await page.screenshot({ path: file, fullPage: true });
    result.screenshots.push(file);
  };
  try {
    const { startHub } = require(path.join(kitRoot(), 'mock-hub'));
    hub = await startHub();
    for (let index = 0; index < 4; index++) {
      apps.push(await startApp({ mode: 'mock', hub: hub.url, data: path.join(privateData, `participant-${index}`) }));
    }
    browser = await environment.playwright.chromium.launch({ executablePath: environment.executablePath, headless: true });
    const allowedOrigins = new Set(apps.map(app => app.url));
    for (let index = 0; index < 4; index++) {
      const context = await browser.newContext({ viewport: { width: 1500, height: 960 }, acceptDownloads: true });
      contexts.push(context);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => pageErrors.push(redactedError(error)));
      page.on('request', request => {
        try {
          const url = new URL(request.url());
          if (!allowedOrigins.has(url.origin) && !['blob:', 'data:'].includes(url.protocol)) unexpectedRequests.push(`${url.protocol}//${url.host}${url.pathname}`);
        } catch { unexpectedRequests.push('Invalid request URL'); }
      });
      pages.push(page);
      await page.goto(apps[index].browserUrl);
      await page.locator('#welcome-overlay').waitFor({ state: 'visible' });
    }
    await capture(pages[0], '01-welcome.png');
    await pages[0].locator('#create-name').fill(fixtures[0].person);
    await pages[0].locator('#room-name').fill('深海夜市');
    await pages[0].locator('#room-members').selectOption('4');
    await pages[0].locator('#create-form [type="submit"]').click();
    await pages[0].locator('#welcome-overlay').waitFor({ state: 'hidden' });
    const created = await readState(apps[0]);
    assert.equal(created.self.name, fixtures[0].person);
    assert.equal(created.room.name, '深海夜市');
    check('Room created through UI; participant name retained');

    await Promise.all(pages.slice(1).map(async (page, offset) => {
      await page.locator('[data-welcome-tab="join"]').click();
      await page.locator('#join-name').fill(fixtures[offset + 1].person);
      await page.locator('#join-invite').fill(`帮我加入这个 AI 茶绘房间：${created.invite}。按接入指引打开画布。`);
      await page.locator('#join-form [type="submit"]').click();
      await page.locator('#welcome-overlay').waitFor({ state: 'hidden' });
    }));
    await waitUntil(async () => (await readState(apps[0])).room.members.length === 4, 'four participants admitted');
    check('Three guests joined through complete natural-language invitations');

    await pages[0].locator('#svg-editor').evaluate(node => { node.open = true; });
    await pages[0].locator('#draft-svg').fill('<svg><script>window.__unsafeTeaSvgExecuted = true</script></svg>');
    await pages[0].locator('#preview-button').click();
    await pages[0].locator('#draft-message.error').waitFor({ state: 'visible' });
    assert.equal(await pages[0].locator('#draft-preview').isVisible(), false);
    assert.equal(await pages[0].evaluate(() => window.__unsafeTeaSvgExecuted), undefined);
    check('Unsafe SVG rejected before preview and script never executes');

    await Promise.all(pages.map((page, index) => fillDraft(page, fixtures[index])));
    await waitUntil(async () => (await readState(apps[0])).proposals.filter(proposal => proposal.status === 'pending').length === 4, 'four simultaneous proposals queued');
    for (let index = 1; index < 4; index++) {
      const state = await readState(apps[index]);
      assert.equal(state.scene.objects.length, 0);
      assert.equal(state.proposals.filter(proposal => proposal.authorId !== state.self.id).some(proposal => typeof proposal.svg === 'string'), false);
    }
    check('Four simultaneous drafts stay off public canvas; other authors do not receive pending SVG');

    await pages[0].locator('[data-workspace-tab="review"]').click();
    await pages[0].locator('.review-card').first().waitFor({ state: 'visible' });
    await capture(pages[0], '02-host-review.png');
    for (let accepted = 1; accepted <= 4; accepted++) {
      await pages[0].locator('.review-actions .primary').first().click();
      await waitUntil(async () => (await readState(apps[0])).scene.objects.length === accepted, `approval ${accepted} committed`);
      await waitUntil(async () => (await readState(apps[1])).scene.objects.length === accepted, `approval ${accepted} synchronized`);
    }
    check('Host proposal remains private until UI approval; guests receive published canvas');
    check('Guest proposals approved from host UI and synchronized');
    const states = await Promise.all(apps.map(readState));
    for (const state of states) assert.equal(state.scene.objects.length, 4);
    assert.equal(new Set(states.map(state => digest(JSON.stringify(state.scene)))).size, 1);
    const canvases = await Promise.all(apps.map(canvasSvg));
    assert.equal(new Set(canvases.map(digest)).size, 1);
    result.canvasHash = digest(canvases[0]);
    result.revision = states[0].scene.revision;
    check('Four independent services and browser contexts agree on scene and composed SVG hash', result.canvasHash);

    for (const page of pages) {
      await page.waitForFunction(() => {
        const images = [document.getElementById('canvas-image'), ...document.querySelectorAll('.layer-thumb')];
        return images.length === 5 && images.every(image => image.complete && image.naturalWidth > 0);
      });
    }
    check('Shared canvas and all four contribution thumbnails load in every browser context');
    await pages[0].locator('[data-workspace-tab="draft"]').click();
    await pages[0].locator('#svg-editor').evaluate(node => { node.open = false; });
    await capture(pages[0], '03-host-canvas.png');
    await capture(pages[1], '04-guest-canvas.png');

    const oldZoom = await pages[0].locator('#zoom-value').innerText();
    await pages[0].locator('#zoom-in').click();
    assert.notEqual(await pages[0].locator('#zoom-value').innerText(), oldZoom);
    await pages[0].locator('#fit-button').click();
    assert.equal(await pages[0].locator('#zoom-value').innerText(), '100%');
    check('Canvas zoom and fit work');

    const downloadPromise = pages[0].waitForEvent('download');
    await pages[0].locator('#export-button').click();
    const download = await downloadPromise;
    const exportFile = path.join(output, 'final.svg');
    await download.saveAs(exportFile);
    result.artifacts.push(exportFile);
    const exported = fs.readFileSync(exportFile, 'utf8');
    assert.equal(digest(exported), result.canvasHash);
    const rendered = await pages[0].evaluate(async svg => {
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('Export is not a valid SVG document');
      const width = Number(parsed.documentElement.getAttribute('width'));
      const height = Number(parsed.documentElement.getAttribute('height'));
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Export failed image decoding')); image.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 288;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, 512, 288);
        context.drawImage(image, 0, 0, 512, 288);
        const pixels = context.getImageData(0, 0, 512, 288).data;
        let coloredPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) coloredPixels++;
        }
        return { width, height, naturalWidth: image.naturalWidth, coloredPixels, png: canvas.toDataURL('image/png') };
      } finally { URL.revokeObjectURL(url); }
    }, exported);
    assert.equal(rendered.width, 4096);
    assert.equal(rendered.height, 2304);
    assert.equal(rendered.naturalWidth, 4096);
    assert.ok(rendered.coloredPixels > 1000, 'Export contains visible colored artwork');
    const exportPng = path.join(output, 'final-preview.png');
    fs.writeFileSync(exportPng, Buffer.from(rendered.png.split(',')[1], 'base64'));
    result.artifacts.push(exportPng);
    check('Editable SVG downloaded from UI, parsed, image-decoded, and rendered with visible artwork', `${rendered.coloredPixels} colored pixels at 512 × 288`);

    await pages[0].reload();
    await pages[0].locator('#welcome-overlay').waitFor({ state: 'hidden' });
    assert.equal((await readState(apps[0])).room.members.length, 4);
    assert.equal((await readState(apps[1])).scene.objects.length, 4);
    check('Browser refresh retains room and confirmed scene');
    await pages[0].locator('#freeze-button').click();
    await waitUntil(async () => (await readState(apps[1])).room.frozen, 'freeze reaches guest');
    assert.equal(await pages[1].locator('#submit-button').isDisabled(), true);
    await pages[0].locator('#freeze-button').click();
    await waitUntil(async () => !(await readState(apps[1])).room.frozen, 'unfreeze reaches guest');
    check('Host freeze reaches guest UI');

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
    contexts.push(mobileContext);
    const mobilePage = await mobileContext.newPage();
    mobilePage.setDefaultTimeout(10000);
    mobilePage.on('pageerror', error => pageErrors.push(redactedError(error)));
    await mobilePage.goto(apps[1].browserUrl);
    await mobilePage.locator('#welcome-overlay').waitFor({ state: 'hidden' });
    await mobilePage.waitForFunction(() => document.getElementById('canvas-image').naturalWidth > 0);
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(mobilePage, '05-mobile.png');
    check('Mobile layout has no horizontal overflow');
    await mobilePage.locator('#open-room-drawer').click();
    await mobilePage.locator('#room-drawer').waitFor({ state: 'visible' });
    assert.equal(await mobilePage.locator('#people-list .person').count(), 4);
    assert.equal(await mobilePage.locator('#layers-list .layer').count(), 4);
    assert.equal(await mobilePage.locator('#leave-button').isVisible(), true);
    await capture(mobilePage, '06-mobile-room.png');
    await mobilePage.locator('#close-room-drawer').click();
    await mobilePage.locator('#room-drawer').waitFor({ state: 'hidden' });
    check('Mobile room drawer retains participants, contributions, and leave access');
    assert.deepEqual(pageErrors, []);
    check('No browser page errors');
    assert.deepEqual(unexpectedRequests, []);
    check('Browser UI makes no requests to external origins');
  } catch (error) {
    result.status = 'failed';
    result.errors.push({ code: error.code || 'BROWSER_CHECK_FAILED', message: redactedError(error) });
    for (let index = 0; index < pages.length; index++) {
      try {
        // Invitation credentials must not enter failure screenshots.
        await pages[index].locator('#join-invite').evaluate(node => { node.value = '[邀请已隐藏]'; });
        await capture(pages[index], `failure-participant-${index}.png`, false);
      } catch { /* Preserve the original failure if the page is already closed. */ }
    }
  } finally {
    try { await browser?.close(); } catch (error) { result.cleanupErrors.push(redactedError(error)); }
    for (const app of apps.slice().reverse()) {
      try { await app.close(); } catch (error) { result.cleanupErrors.push(redactedError(error)); }
    }
    try { await hub?.close(); } catch (error) { result.cleanupErrors.push(redactedError(error)); }
    try { removeOwnedTemporaryData(privateData); } catch (error) { result.cleanupErrors.push(redactedError(error)); }
    if (result.cleanupErrors.length) result.status = 'failed';
    result.durationMs = Date.now() - started;
    result.browser = path.basename(environment.executablePath);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
  }
  return result;
}

if (require.main === module) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== '--out')) {
    console.error('Usage: node scripts/verify-browser.js [--out <directory>]');
    process.exitCode = 1;
  } else {
    verifyBrowser({ ...(arguments_.length ? { out: arguments_[1] } : {}) })
      .then(result => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'passed' ? 0 : result.status === 'blocked' ? 2 : 1; })
      .catch(error => { console.error(JSON.stringify({ status: 'failed', error: redactedError(error) })); process.exitCode = 1; });
  }
}

module.exports = { verifyBrowser };
