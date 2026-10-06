'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const appRoot = path.resolve(__dirname, '..');
const siteRoot = path.join(appRoot, 'site');
const sampleInvite = 'tea://join/STATIC_VERIFICATION_ONLY_NOT_A_ROOM';
const hash = value => createHash('sha256').update(value).digest('hex');
const errorText = error => String(error?.message || error).replace(/tea:\/\/join\/[A-Za-z0-9_-]+/g, 'tea://join/[redacted]').slice(0, 1000);

async function staticServer(requests) {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown', '.ps1': 'text/plain' };
  const server = http.createServer(async (req, res) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      requests.push({ method: req.method, pathname });
      file = path.resolve(siteRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(siteRoot + path.sep)) { res.writeHead(403); res.end(); return; }
      const bytes = await fs.promises.readFile(file);
      res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function verifySite({ out = path.join(appRoot, 'verification/site-v03') } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const started = Date.now();
  const report = { status: 'passed', surface: 'static-site', startedAt: new Date(started).toISOString(), checks: [], screenshots: [], errors: [], cleanupErrors: [] };
  const requests = [], externalRequests = [], pageErrors = [], contexts = [];
  let server, browser;
  const check = (name, detail) => report.checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) });
  const capture = async (page, file) => { const destination = path.join(out, file); await page.screenshot({ path: destination, fullPage: true }); report.screenshots.push(destination); };
  try {
    const playwright = require(require.resolve('playwright-core', { paths: [appRoot, path.join(appRoot, '..', 'steam-spacewar-multiplayer-skill')] }));
    const candidates = [
      process.env.AI_TEA_BROWSER,
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')
    ].filter(Boolean);
    const executablePath = candidates.find(candidate => fs.existsSync(candidate));
    assert.ok(executablePath, 'Installed Chrome or Edge required');
    const service = await staticServer(requests); server = service.server;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
    report.browser = path.basename(executablePath);
    const makePage = async mobile => {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write']
      });
      contexts.push(context);
      await context.route('**/*', route => {
        const request = route.request();
        if (new URL(request.url()).origin !== service.url) { externalRequests.push(new URL(request.url()).origin); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(errorText(error)));
      await page.goto(service.url, { waitUntil: 'networkidle' });
      return page;
    };
    const desktop = await makePage(false);
    await desktop.getByRole('heading', { level: 1 }).waitFor();
    await desktop.locator('#create').waitFor();
    assert.equal(await desktop.locator('#topic').inputValue(), '深海夜市');
    await capture(desktop, '01-desktop-welcome.png');
    check('static-page-loads-real-local-html-css-and-javascript');

    const clipboard = page => page.evaluate(() => navigator.clipboard.readText());
    await desktop.locator('#install').click();
    await desktop.waitForFunction(() => document.getElementById('install-notice').textContent.startsWith('已复制'));
    const installCommand = await clipboard(desktop);
    assert.ok(installCommand.includes(service.url + '/INSTALL.md'));
    assert.ok(installCommand.includes('安装并配置到当前 Agent') && installCommand.includes('验证连接'));
    assert.ok(!installCommand.includes('#'));
    check('install-button-copies-real-clipboard-command-for-current-agent');
    const copyHost = async (page, topic) => {
      await page.locator('#create').click();
      await page.waitForFunction(() => document.getElementById('host-notice').textContent.startsWith('已复制'));
      const text = await clipboard(page);
      assert.ok(text.includes(`主题为「${topic}」的四人房`));
      assert.ok(text.includes(`${service.url}/AGENT-START.md`));
      assert.ok(text.includes('自动准备程序') && text.includes('打开画布') && text.includes('加入邀请'));
      assert.ok(!text.includes('#'));
      return text;
    };
    const defaultCommand = await copyHost(desktop, '深海夜市');
    await desktop.locator('#topic').fill('雨后竹林茶会');
    const customCommand = await copyHost(desktop, '雨后竹林茶会');
    assert.notEqual(hash(defaultCommand), hash(customCommand));
    check('create-button-copies-real-clipboard-command-with-default-and-custom-topic');
    await desktop.locator('#topic').fill('   ');
    await copyHost(desktop, '今天一起画画');
    check('empty-host-topic-uses-visible-product-default');

    await desktop.locator('#copy').click();
    assert.equal(await desktop.locator('#notice').textContent(), '请先粘贴房主提供的完整邀请。');
    await desktop.locator('#invite').fill('不是邀请码');
    await desktop.locator('#copy').click();
    assert.equal(await desktop.locator('#notice').textContent(), '请先粘贴房主提供的完整邀请。');
    check('join-button-rejects-empty-or-invalid-invitation-with-clear-local-message');
    await desktop.locator('#invite').fill(`请加入 AI 茶绘房间 ${sampleInvite}，然后等我安排。`);
    await desktop.locator('#copy').click();
    await desktop.waitForFunction(() => document.getElementById('notice').textContent.startsWith('已复制'));
    const joinCommand = await clipboard(desktop);
    assert.ok(joinCommand.includes(`加入房间 ${sampleInvite}`));
    assert.ok(joinCommand.includes(`${service.url}/AGENT-START.md`));
    assert.ok(joinCommand.includes('校验安装') && joinCommand.includes('打开画布') && joinCommand.includes('读取房规'));
    check('join-button-extracts-full-share-message-and-copies-agent-install-join-command');

    await desktop.goto(`${service.url}#${sampleInvite}`, { waitUntil: 'networkidle' });
    await desktop.reload({ waitUntil: 'networkidle' });
    assert.equal(await desktop.locator('#invite').inputValue(), sampleInvite);
    await copyHost(desktop, '深海夜市');
    await desktop.goto(`${service.url}#STATIC_VERIFICATION_ONLY_NOT_A_ROOM`, { waitUntil: 'networkidle' });
    await desktop.reload({ waitUntil: 'networkidle' });
    assert.equal(await desktop.locator('#invite').inputValue(), sampleInvite);
    await desktop.locator('#copy').click();
    await desktop.waitForFunction(() => document.getElementById('notice').textContent.startsWith('已复制'));
    assert.ok((await clipboard(desktop)).includes(sampleInvite));
    assert.ok(requests.every(request => !request.pathname.includes('STATIC_VERIFICATION')));
    check('full-and-short-fragments-fill-join-input-without-sending-invite-to-server');

    await desktop.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw new DOMException('denied', 'NotAllowedError'); }, configurable: true });
    });
    await desktop.locator('#topic').fill('<img src=x onerror=alert(1)>夏日池塘');
    await desktop.locator('#create').click();
    await desktop.waitForFunction(() => document.getElementById('host-notice').textContent.startsWith('按照'));
    assert.ok((await desktop.locator('#host-notice').textContent()).includes('<img src=x onerror=alert(1)>夏日池塘'));
    assert.equal(await desktop.locator('img').count(), 0);
    await desktop.locator('#copy').click();
    await desktop.waitForFunction(() => document.getElementById('notice').textContent.startsWith('按照'));
    assert.ok((await desktop.locator('#notice').textContent()).includes(sampleInvite));
    await desktop.locator('#install').click();
    await desktop.waitForFunction(() => document.getElementById('install-notice').textContent.startsWith('按照'));
    assert.ok((await desktop.locator('#install-notice').textContent()).includes(service.url + '/INSTALL.md'));
    check('clipboard-denial-shows-selectable-command-as-text-without-inserting-user-html');

    await desktop.goto(service.url, { waitUntil: 'networkidle' });
    await desktop.locator('#topic').fill('雨后竹林茶会');
    await copyHost(desktop, '雨后竹林茶会');
    await capture(desktop, '02-desktop-create-ready.png');
    const mobile = await makePage(true);
    await mobile.locator('#topic').fill('雨后竹林茶会');
    await copyHost(mobile, '雨后竹林茶会');
    await mobile.locator('#copy').click();
    assert.equal(await mobile.locator('#notice').textContent(), '请先粘贴房主提供的完整邀请。');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const selector of ['#install', '#create', '#copy', '#topic', '#invite']) {
      const box = await mobile.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    }
    await capture(mobile, '03-mobile-create-and-join.png');
    check('mobile-390px-layout-keeps-both-flows-operable-without-horizontal-overflow');

    const guide = await desktop.getByRole('link', { name: 'Agent 接入说明' }).getAttribute('href');
    const manifestLink = await desktop.getByRole('link', { name: '版本与下载清单' }).getAttribute('href');
    assert.equal(guide, 'AGENT-START.md'); assert.equal(manifestLink, 'release-manifest.json');
    const metadata = await desktop.evaluate(async () => {
      const guide = await fetch('AGENT-START.md'); const guideText = await guide.text();
      const manifest = await fetch('release-manifest.json');
      return { guideStatus: guide.status, mentionsHost: guideText.includes('tea_create_room'), manifestStatus: manifest.status, manifest: await manifest.json() };
    });
    assert.equal(metadata.guideStatus, 200); assert.equal(metadata.mentionsHost, true); assert.equal(metadata.manifestStatus, 200);
    assert.equal(metadata.manifest.version, require('../package.json').version); assert.equal(metadata.manifest.status, 'local-build');
    assert.ok(Object.values(metadata.manifest.variants).every(variant => !variant.url));
    report.release = { version: metadata.manifest.version, status: metadata.manifest.status, publicAssetsConfigured: false };
    check('fresh-guide-and-local-build-manifest-links-resolve-without-fabricated-public-assets');
    const installLink = await desktop.getByRole('link', { name: '一句话安装说明' }).getAttribute('href');
    assert.equal(installLink, 'INSTALL.md');
    const installGuide = await desktop.evaluate(async () => { const response = await fetch('INSTALL.md'); return { status: response.status, text: await response.text() }; });
    assert.equal(installGuide.status, 200);
    assert.ok(installGuide.text.includes('-Setup -Agent codex') && installGuide.text.includes('MCP 程序和 15 个工具'));
    check('installation-guide-link-resolves-to-actionable-five-client-instructions');
    assert.equal(pageErrors.length, 0); assert.equal(externalRequests.length, 0);
    assert.ok(requests.every(request => request.method === 'GET'));
    check('no-browser-errors-external-requests-or-invitation-upload');
  } catch (error) { report.status = 'failed'; report.errors.push(errorText(error)); }
  finally {
    for (const context of contexts) { try { await context.close(); } catch (error) { report.cleanupErrors.push(errorText(error)); } }
    try { await browser?.close(); } catch (error) { report.cleanupErrors.push(errorText(error)); }
    if (server) {
      try { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } catch (error) { report.cleanupErrors.push(errorText(error)); }
    }
    report.localServerStopped = !server?.listening;
    report.ownedBrowserClosed = !browser?.isConnected();
    report.credentialsInScreenshots = false;
    report.usedSyntheticInvitationOnly = true;
    report.durationMs = Date.now() - started;
    if (report.cleanupErrors.length) report.status = 'failed';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

if (require.main === module) verifySite().then(report => { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'passed' ? 0 : 1; }).catch(error => { console.error(errorText(error)); process.exitCode = 1; });
module.exports = { verifySite };
