'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { sanitizeSvg } = require('../src/svg');

const wrap = (body, attributes = 'viewBox="0 0 100 100"') => `<svg ${attributes}>${body}</svg>`;
const invalid = (svg, code) => assert.throws(() => sanitizeSvg(svg), error => error.code === code);

test('normalizes harmless shape SVG deterministically and idempotently', () => {
  const a = sanitizeSvg(wrap('<rect fill="RED" height="2e1" width="20.0" y="-0" x="0"/>'));
  const b = sanitizeSvg(wrap('<rect x="0" y="0" width="20" height="20" fill="red"></rect>'));
  assert.equal(a.svg, b.svg);
  assert.equal(a.hash, createHash('sha256').update(a.svg).digest('hex'));
  assert.deepEqual(a.viewBox, [0,0,100,100]);
  assert.deepEqual(a.stats, { bytes:Buffer.byteLength(a.svg), elements:2, pathCommands:0, depth:2 });
  assert.deepEqual(sanitizeSvg(a.svg), a);
});

test('supports core geometry, finite transforms, CSS literal colors and XML comments', () => {
  const svg = sanitizeSvg('<?xml version="1.0" encoding="UTF-8"?>' + wrap(`<!-- omitted -->
    <g transform="translate(2,3) rotate(30) scale(.5)" stroke="rgb(10, 20, 30)" fill="rgba(1,2,3,.5)" stroke-width="2px" stroke-linecap="round" stroke-dasharray="3, 2">
      <path d="M10,10 c1 2 3 4 5 6 l-2-.5 H8 V9 Q5 4 2 3 T1 1 A5 6 10 0 1 8 8 z"/>
      <ellipse rx="4" ry="2"/><circle cx="30" cy="40" r="10"/>
      <line x1="0" y1="0" x2="100" y2="100"/>
      <polyline points="0,0 10,10 20,10"/><polygon points="0,0 10,0 10,10"/>
    </g>`));
  assert.equal(svg.stats.elements, 8);
  assert.equal(svg.stats.pathCommands, 15);
  assert(!svg.svg.includes('<!--'));
  assert(svg.svg.includes('stroke="rgb(10,20,30)"'));
  assert.deepEqual(sanitizeSvg(svg.svg), svg);
});

test('rewrites gradients and local references independent of original names', () => {
  const make = id => wrap(`<defs><linearGradient id="${id}" x1="0%" x2="100%"><stop offset="0%" stop-color="#ABC"/><stop offset="100%" stop-color="blue" stop-opacity=".7"/></linearGradient></defs><rect width="100" height="100" fill="url(#${id})"/>`);
  const a = sanitizeSvg(make('gradientA'));
  const b = sanitizeSvg(make('otherName'));
  assert.equal(a.svg, b.svg);
  assert.match(a.svg, /id="tea-[0-9a-f]{16}-g1"/);
  assert.deepEqual(sanitizeSvg(a.svg), a);
  invalid(wrap('<rect fill="url(#missing)"/>'), 'SVG_REFERENCE');
  invalid(wrap('<g id="wrong"/><rect fill="url(#wrong)"/>'), 'SVG_REFERENCE');
  invalid(wrap('<defs><linearGradient id="x" href="#x"><stop offset="0"/></linearGradient></defs>'), 'SVG_ATTRIBUTE');
});

test('rejects executable, embedded, CSS, remote, or recursive SVG constructs', () => {
  for (const body of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/x"/>', '<use href="#x"/>', '<animate/>', '<filter/>', '<mask/>', '<style/>', '<text>Hello</text>']) invalid(wrap(body), 'SVG_ELEMENT');
  for (const attribute of ['onclick="alert(1)"', 'onLoad="alert(1)"', 'style="fill:red"', 'href="javascript:alert(1)"', 'filter="url(#x)"', 'clip-path="url(#x)"']) invalid(wrap(`<rect ${attribute}/>`), 'SVG_ATTRIBUTE');
  for (const paint of ['url(https://example.com/x)', 'url(data:image/svg+xml,x)', 'url(file:///etc/passwd)', 'url(#x) red', 'var(--color)', 'currentColor', 'context-fill', 'javascript:alert(1)']) invalid(wrap(`<rect fill="${paint}"/>`), 'SVG_PAINT');
  invalid('<!DOCTYPE svg [<!ENTITY x "x">]>' + wrap('<g/>'), 'SVG_XML');
  invalid(wrap('<rect id="a&amp;b"/>'), 'SVG_XML');
  invalid(wrap('<g>&amp;</g>'), 'SVG_TEXT');
  invalid(wrap('<![CDATA[hello]]>'), 'SVG_XML');
  invalid('<?evil run?>' + wrap('<g/>'), 'SVG_XML');
});

test('rejects malformed XML, namespaces, duplicate attributes, and unclosed documents', () => {
  for (const svg of ['', '<g/>', '<svg>', wrap('<g></rect>'), wrap('<g/>') + '<svg/>', '<svg viewBox="0 0 10 10"viewBox="0 0 1 1"/>', wrap('<rect x="1" x="2"/>'), wrap('<rect x=1/>'), wrap('<g/ >'), wrap('<g><!--bad--comment--></g>'), wrap('<g>oops</g>')]) assert.throws(() => sanitizeSvg(svg));
  invalid(wrap('<x:rect/>'), 'SVG_NAMESPACE');
  invalid('<svg xmlns="http://evil.invalid" viewBox="0 0 10 10"/>', 'SVG_NAMESPACE');
  invalid('<svg xmlns:x="http://evil.invalid" viewBox="0 0 10 10"/>', 'SVG_NAMESPACE');
  invalid(wrap('<svg/>'), 'SVG_STRUCTURE');
  invalid(wrap('<rect><circle/></rect>'), 'SVG_STRUCTURE');
  invalid(wrap('<g\u0000/>'), 'SVG_XML');
  invalid(wrap('<g id="\uD800"/>'), 'SVG_XML');
});

test('bounds byte size, depth, element count, path work, and numeric values', () => {
  invalid(wrap(' '.repeat(256 * 1024)), 'SVG_BYTES');
  invalid(wrap('<g>'.repeat(16) + '</g>'.repeat(16)), 'SVG_DEPTH');
  invalid(wrap('<rect/>'.repeat(2000)), 'SVG_ELEMENTS');
  invalid(wrap(`<path d="M0 0 ${'1 1 '.repeat(12000)}"/>`), 'SVG_PATH_COMMANDS');
  invalid(wrap('<rect x="NaN"/>'), 'SVG_NUMBER');
  invalid(wrap('<rect x="1e309"/>'), 'SVG_NUMBER');
  invalid(wrap('<rect x="1000001"/>'), 'SVG_NUMBER');
  invalid(wrap('<rect width="-1"/>'), 'SVG_NUMBER');
  invalid(wrap('<rect stroke-width="129"/>'), 'SVG_NUMBER');
  invalid(wrap('<g opacity="1.1"/>'), 'SVG_NUMBER');
  invalid(wrap('<g transform="scale(1001)"/>'), 'SVG_NUMBER');
  invalid(wrap('<g transform="scale(1000)"><g transform="scale(2)"/></g>'), 'SVG_NUMBER');
  assert.throws(() => sanitizeSvg(wrap('<rect/>'), { maxBytes:1 }), error => error.code === 'SVG_BYTES');
  assert.throws(() => sanitizeSvg(wrap('<rect/>'), { maxElements:3000 }), error => error.code === 'SVG_LIMITS');
  assert.throws(() => sanitizeSvg(wrap('<path d="M0 0 L1 1"/>'), { maxPathCommands:1 }), error => error.code === 'SVG_PATH_COMMANDS');
});

test('path parser rejects malformed commands, arc flags, and runaway relative geometry', () => {
  for (const path of ['', 'L0 0', 'M0', 'M0 0 L1', 'M0 0 B1 2', 'M0,,0', 'M0 0,', 'M0 0 Z1 2', 'M0 0 A1 1 0 2 0 3 3', 'M0 0 A-1 1 0 0 1 3 3', 'M0 0 e1', 'M0 0;L1 1']) assert.throws(() => sanitizeSvg(wrap(`<path d="${path}"/>`)));
  invalid(wrap('<path d="M1000000 0 l1 1"/>'), 'SVG_NUMBER');
  invalid(wrap('<g transform="rotate()"/>'), 'SVG_NUMBER');
  invalid(wrap('<g transform="scale(1),"/>'), 'SVG_TRANSFORM');
  invalid(wrap('<g transform="skewX(90)"/>'), 'SVG_NUMBER');
  invalid(wrap('<g transform="matrix(1 0 0 1 1)"/>'), 'SVG_TRANSFORM');
});

test('validates viewBox and fallback dimensions without arbitrary units', () => {
  const a = sanitizeSvg('<svg width="100px" height="50"><rect width="100" height="50"/></svg>');
  assert.deepEqual(a.viewBox, [0,0,100,50]);
  for (const attributes of ['viewBox="0 0 0 1"', 'viewBox="0 0 1 -1"', 'viewBox="0 0 20000 1"', 'viewBox="0 0 1"', 'viewBox="0 0 1e-323 1e-323"', 'width="10"', 'width="100%" height="10"', 'width="1e-323" height="1e-323"', 'viewBox="0 0 10 10" width="0"']) assert.throws(() => sanitizeSvg(wrap('<g/>', attributes)));
});

test('gradient stop count, ordering, duplicate IDs, and definitions are bounded', () => {
  invalid(wrap('<defs/><defs/>'), 'SVG_GRADIENT');
  invalid(wrap('<defs><linearGradient id="a"/></defs>'), 'SVG_GRADIENT');
  invalid(wrap('<defs><radialGradient id="a"><stop offset=".8"/><stop offset=".2"/></radialGradient></defs>'), 'SVG_GRADIENT');
  invalid(wrap('<defs><linearGradient id="a"><stop/></linearGradient></defs>'), 'SVG_GRADIENT');
  invalid(wrap('<defs><linearGradient id="a"><stop offset="1.1"/></linearGradient></defs>'), 'SVG_NUMBER');
  invalid(wrap(`<defs><linearGradient id="a">${'<stop offset="0"/>'.repeat(33)}</linearGradient></defs>`), 'SVG_GRADIENT');
  invalid(wrap('<g id="a"/><g id="a"/>'), 'SVG_ID');
  invalid(wrap('<defs><rect/></defs>'), 'SVG_STRUCTURE');
});
