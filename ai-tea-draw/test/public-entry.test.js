'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { verifyPublic } = require('../scripts/verify-public');

test('published entry checks real downloads, rejects local-build and corrupted release assets', async t => {
  const files = { '/lite.zip': Buffer.from('lite fixture'), '/portable.zip': Buffer.from('portable fixture') };
  for (const file of ['index.html', 'site.js', 'site.css', 'INSTALL.md', 'AGENT-START.md', 'bootstrap.ps1']) files['/' + file] = Buffer.from('entry fixture');
  let manifest;
  const server = http.createServer((req, res) => {
    if (req.url === '/release-manifest.json') { res.end(JSON.stringify(manifest)); return; }
    if (!files[req.url]) { res.writeHead(404); res.end(); return; }
    res.end(files[req.url]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  manifest = { schema: 1, status: 'ready-for-upload', platform: 'windows-x64', version: '0.3.0', variants: {} };
  for (const kind of ['lite', 'portable']) {
    const bytes = files['/' + kind + '.zip'];
    manifest.variants[kind] = { url: url + kind + '.zip', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const result = await verifyPublic(url, { allowLocal: true }); assert.equal(result.publicDownloadsVerified, true); assert.equal(result.steam, 'not-checked');
  manifest.status = 'local-build'; await assert.rejects(verifyPublic(url, { allowLocal: true }), /RELEASE_NOT_PUBLISHED/);
  manifest.status = 'ready-for-upload'; files['/lite.zip'] = Buffer.from('bad'); await assert.rejects(verifyPublic(url, { allowLocal: true }), /ASSET_HASH_MISMATCH/);
  await assert.rejects(verifyPublic(url), /DOWNLOAD_HTTPS_REQUIRED/);
});
