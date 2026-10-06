'use strict';
const { createHash } = require('node:crypto');
const { download } = require('./bootstrap');
async function verifyPublic(site, { allowLocal = false } = {}) {
  const base = new URL(site);
  if (base.username || base.password || base.hash || base.search) throw new Error('SITE_URL_INVALID');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const manifest = JSON.parse(await download(new URL('release-manifest.json', base), { limit: 32768, allowLocal }));
  if (manifest.schema !== 1 || manifest.status === 'local-build' || manifest.platform !== 'windows-x64' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('RELEASE_NOT_PUBLISHED');
  const assets = [];
  for (const kind of ['lite', 'portable']) {
    const asset = manifest.variants?.[kind];
    if (!asset?.url || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 100 * 1024 * 1024) throw new Error('ASSET_MANIFEST_INVALID');
    const bytes = await download(asset.url, { limit: asset.bytes, allowLocal });
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('ASSET_HASH_MISMATCH');
    assets.push({ kind, bytes: bytes.length, sha256: asset.sha256 });
  }
  for (const file of ['index.html', 'site.js', 'site.css', 'INSTALL.md', 'AGENT-START.md', 'bootstrap.ps1']) {
    const bytes = await download(new URL(file, base), { limit: 1024 * 1024, allowLocal });
    if (!bytes.length) throw new Error('ENTRY_FILE_EMPTY');
  }
  return { status: 'passed', site: base.href, version: manifest.version, assets, publicDownloadsVerified: true, steam: 'not-checked', time: new Date().toISOString() };
}
if (require.main === module) verifyPublic(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(JSON.stringify({ status: 'failed', error: error.message })); process.exitCode = 1; });
module.exports = { verifyPublic };
