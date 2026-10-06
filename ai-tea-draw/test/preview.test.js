'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPreview, findBrowser, playwrightPath } = require('../src/preview');

const SVG = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#13a89e"/><circle cx="50" cy="50" r="25" fill="white"/></svg>';
let available = true;
try { findBrowser(); playwrightPath(); } catch { available = false; }

test('optional isolated renderer produces bounded transparent PNG with no resource requests', {skip:available ? false : 'Installed Chromium / optional playwright-core unavailable'}, async () => {
  const result = await renderPreview(SVG, {width:128,height:128});
  assert.equal(result.width,128); assert.equal(result.height,128);
  assert.deepEqual([...result.png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(result.png.readUInt32BE(16),128); assert.equal(result.png.readUInt32BE(20),128);
  assert.equal(result.stats.networkRequests,0); assert.equal(result.hash.length,64);
  assert(result.bytes > 100 && result.bytes < 100000);
});

test('preview rejects script and external resource input before spawning browser', async () => {
  await assert.rejects(renderPreview('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>'), error => error.code === 'SVG_ELEMENT');
  await assert.rejects(renderPreview('<svg viewBox="0 0 10 10"><rect fill="url(https://example.com/x)"/></svg>'), error => error.code === 'SVG_PAINT');
  await assert.rejects(renderPreview(SVG,{width:10000}), error => error.code === 'PREVIEW_OPTIONS');
});

test('renderer hard deadline kills its worker tree and later rendering still works', {skip:available ? false : 'Installed Chromium / optional playwright-core unavailable'}, async () => {
  await assert.rejects(renderPreview(SVG,{timeoutMs:25}), error => error.code === 'PREVIEW_TIMEOUT');
  const result = await renderPreview(SVG,{width:32,height:32});
  assert.equal(result.width,32); assert.equal(result.stats.networkRequests,0);
});
