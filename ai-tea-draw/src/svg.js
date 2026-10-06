'use strict';

const { createHash } = require('node:crypto');

const DEFAULT_LIMITS = Object.freeze({ maxBytes: 256 * 1024, maxElements: 2000, maxPathCommands: 12000, maxDepth: 16, maxCoordinate: 1000000, maxDimension: 16384, maxStrokeWidth: 128, maxGradients: 64, maxStops: 32 });
const DRAW = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const GRADIENTS = new Set(['linearGradient', 'radialGradient']);
const COMMON = new Set(['id', 'transform', 'fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'vector-effect']);
const SPECIFIC = {
  svg: new Set(['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio']),
  g: new Set(), path: new Set(['d']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry']),
  circle: new Set(['cx', 'cy', 'r']), ellipse: new Set(['cx', 'cy', 'rx', 'ry']),
  line: new Set(['x1', 'y1', 'x2', 'y2']), polyline: new Set(['points']), polygon: new Set(['points']),
  defs: new Set(),
  linearGradient: new Set(['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod']),
  radialGradient: new Set(['id', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod']),
  stop: new Set(['offset', 'stop-color', 'stop-opacity']),
};
const COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const WS = /[ \t\r\n]/;
const IDENTITY = [1, 0, 0, 1, 0, 0];

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function fmt(value) { return Object.is(value, -0) ? '0' : String(value); }
function finite(value, maximum, label) { if (!Number.isFinite(value) || Math.abs(value) > maximum) fail('SVG_NUMBER', `${label} must be finite and within ±${maximum}.`); return value; }

// This lexer deliberately accepts only the documented SVG subset. It never expands entities,
// resolves namespaces, loads resources, or silently removes unsupported markup.
function parseXml(source, limits) {
  let at = 0, root = null, elements = 0, deepest = 0, declaration = false;
  const stack = [];
  function whitespace() { const start = at; while (at < source.length && WS.test(source[at])) at++; return at > start; }
  function name() { const start = at; if (!/[A-Za-z_]/.test(source[at] || '')) fail('SVG_XML', 'Expected an XML name.'); at++; while (/[A-Za-z0-9_.:-]/.test(source[at] || '')) at++; const value = source.slice(start, at); if (value.includes(':')) fail('SVG_NAMESPACE', 'Namespace prefixes are not supported.'); return value; }
  function attributes(end) {
    const attrs = Object.create(null);
    while (at < source.length) {
      const separated = whitespace();
      if (source.startsWith(end, at) || source.startsWith('/>', at)) return attrs;
      if (!separated) fail('SVG_XML', 'Attributes must be separated by whitespace.');
      const key = name(); if (Object.hasOwn(attrs, key)) fail('SVG_XML', `Duplicate attribute ${key}.`);
      whitespace(); if (source[at++] !== '=') fail('SVG_XML', 'Expected = after attribute.'); whitespace();
      const quote = source[at++]; if (quote !== '"' && quote !== "'") fail('SVG_XML', 'Attributes must be quoted.');
      const start = at; while (at < source.length && source[at] !== quote) { if (source[at] === '<' || source[at] === '&') fail('SVG_XML', 'Markup and entities are not allowed in attributes.'); at++; }
      if (at === source.length) fail('SVG_XML', 'Unclosed attribute.');
      attrs[key] = source.slice(start, at++);
    }
    fail('SVG_XML', 'Unclosed opening tag.');
  }
  if (source.charCodeAt(0) === 0xfeff) at++;
  while (at < source.length) {
    if (source[at] !== '<') { const start = at; while (at < source.length && source[at] !== '<') at++; if (!/^[ \t\r\n]*$/.test(source.slice(start, at))) fail('SVG_TEXT', 'Only whitespace is allowed between elements; arbitrary text is unsupported.'); continue; }
    if (source.startsWith('<!--', at)) { const end = source.indexOf('-->', at + 4); if (end < 0 || source.slice(at + 4, end).includes('--') || source[end - 1] === '-') fail('SVG_XML', 'Malformed XML comment.'); at = end + 3; continue; }
    if (source.startsWith('<?xml', at)) {
      if (root || stack.length || declaration || at > (source.charCodeAt(0) === 0xfeff ? 1 : 0)) fail('SVG_XML', 'XML declaration must appear once at the start.');
      at += 5; const attrs = attributes('?>');
      if (attrs.version !== '1.0' || Object.keys(attrs).some(key => !['version', 'encoding', 'standalone'].includes(key)) || (attrs.encoding && !/^utf-8$/i.test(attrs.encoding)) || (attrs.standalone && !['yes', 'no'].includes(attrs.standalone)) || !source.startsWith('?>', at)) fail('SVG_XML', 'Unsupported XML declaration.');
      declaration = true; at += 2; continue;
    }
    if (source.startsWith('<!', at) || source.startsWith('<?', at)) fail('SVG_XML', 'DTD, CDATA, entities, and processing instructions are unsupported.');
    if (source.startsWith('</', at)) { at += 2; const tag = name(); whitespace(); if (source[at++] !== '>' || stack.length === 0 || stack.pop().tag !== tag) fail('SVG_XML', 'Mismatched closing tag.'); continue; }
    at++; const tag = name(); if (!Object.hasOwn(SPECIFIC, tag)) fail('SVG_ELEMENT', `Unsupported element ${tag}.`);
    const attrs = attributes('>'); const selfClosing = source.startsWith('/>', at); if (!selfClosing && source[at] !== '>') fail('SVG_XML', 'Expected closing >.'); at += selfClosing ? 2 : 1;
    const node = { tag, attrs, children: [] };
    const parent = stack[stack.length - 1];
    if (!parent) { if (root || tag !== 'svg') fail('SVG_XML', 'Document must have exactly one svg root.'); root = node; }
    else {
      const valid = (parent.tag === 'svg' && (DRAW.has(tag) || tag === 'defs')) || (parent.tag === 'g' && DRAW.has(tag)) || (parent.tag === 'defs' && GRADIENTS.has(tag)) || (GRADIENTS.has(parent.tag) && tag === 'stop');
      if (!valid) fail('SVG_STRUCTURE', `${tag} is not allowed inside ${parent.tag}.`);
      parent.children.push(node);
    }
    if (++elements > limits.maxElements) fail('SVG_ELEMENTS', `SVG exceeds ${limits.maxElements} elements.`);
    deepest = Math.max(deepest, stack.length + 1); if (deepest > limits.maxDepth) fail('SVG_DEPTH', `SVG exceeds depth ${limits.maxDepth}.`);
    if (!selfClosing) stack.push(node);
  }
  if (!root || stack.length) fail('SVG_XML', 'Missing root or unclosed element.');
  return { root, elements, depth: deepest };
}

function numberList(value, maximum, label) {
  const result = []; let at = 0;
  while (at < value.length && WS.test(value[at])) at++;
  while (at < value.length) {
    const match = NUMBER.exec(value.slice(at)); if (!match) fail('SVG_NUMBER', `Invalid number in ${label}.`);
    result.push(finite(Number(match[0]), maximum, label)); at += match[0].length;
    while (at < value.length && WS.test(value[at])) at++;
    if (value[at] === ',') { at++; while (at < value.length && WS.test(value[at])) at++; if (at === value.length || value[at] === ',') fail('SVG_NUMBER', `Invalid separator in ${label}.`); }
    else if (at < value.length && !/[+\-.0-9]/.test(value[at])) fail('SVG_NUMBER', `Invalid value in ${label}.`);
  }
  if (!result.length) fail('SVG_NUMBER', `Missing number in ${label}.`);
  return result;
}
function numeric(value, maximum, label, { min = -maximum, units = false } = {}) {
  const text = value.trim(); const match = NUMBER.exec(text); const tail = match ? text.slice(match[0].length) : 'invalid';
  if (!match || !(tail === '' || (units && tail === 'px'))) fail('SVG_NUMBER', `Invalid number in ${label}.`);
  const result = finite(Number(match[0]), maximum, label); if (result < min) fail('SVG_NUMBER', `${label} must be at least ${min}.`); return result;
}
function multiply(a, b) { return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]; }
function boundedMatrix(matrix, limits) { matrix.forEach((value, i) => finite(value, i < 4 ? 1000 : limits.maxCoordinate, 'Combined transform')); return matrix; }
function transform(value, limits) {
  let at = 0, matrix = IDENTITY, count = 0; const result = [];
  while (at < value.length) {
    while (at < value.length && WS.test(value[at])) at++;
    if (at === value.length) break;
    if (count && value[at] === ',') { at++; while (at < value.length && WS.test(value[at])) at++; if (at === value.length) fail('SVG_TRANSFORM', 'Trailing transform separator.'); }
    const match = /^(matrix|translate|scale|rotate|skewX|skewY)\s*\(/.exec(value.slice(at)); if (!match) fail('SVG_TRANSFORM', 'Unsupported transform.'); at += match[0].length;
    const end = value.indexOf(')', at); if (end < 0) fail('SVG_TRANSFORM', 'Unclosed transform.'); const numbers = numberList(value.slice(at, end), limits.maxCoordinate, 'transform'); at = end + 1;
    if (++count > 32) fail('SVG_TRANSFORM', 'Too many transform functions.');
    const fn = match[1]; let next;
    if (fn === 'matrix' && numbers.length === 6) next = numbers;
    else if (fn === 'translate' && [1, 2].includes(numbers.length)) next = [1, 0, 0, 1, numbers[0], numbers[1] || 0];
    else if (fn === 'scale' && [1, 2].includes(numbers.length)) next = [numbers[0], 0, 0, numbers.length === 2 ? numbers[1] : numbers[0], 0, 0];
    else if (fn === 'rotate' && [1, 3].includes(numbers.length)) { const angle = numbers[0] * Math.PI / 180; const c = Math.cos(angle), s = Math.sin(angle); next = [c, s, -s, c, 0, 0]; if (numbers.length === 3) next = multiply(multiply([1,0,0,1,numbers[1],numbers[2]], next), [1,0,0,1,-numbers[1],-numbers[2]]); }
    else if ((fn === 'skewX' || fn === 'skewY') && numbers.length === 1) { const tangent = Math.tan(numbers[0] * Math.PI / 180); next = fn === 'skewX' ? [1,0,tangent,1,0,0] : [1,tangent,0,1,0,0]; }
    else fail('SVG_TRANSFORM', `Invalid arguments for ${fn}.`);
    boundedMatrix(next, limits); matrix = boundedMatrix(multiply(matrix, next), limits); result.push(`${fn}(${numbers.map(fmt).join(' ')})`);
  }
  if (!count) fail('SVG_TRANSFORM', 'Empty transform.');
  return { value: result.join(' '), matrix };
}

function pathData(value, limits) {
  const arity = { M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0 };
  let at = 0, commands = 0, x = 0, y = 0, startX = 0, startY = 0; const output = [];
  while (at < value.length) {
    while (at < value.length && WS.test(value[at])) at++;
    if (at === value.length) break;
    const cmd = value[at++], upper = cmd.toUpperCase(); if (!Object.hasOwn(arity, upper)) fail('SVG_PATH', 'Invalid path command.');
    if (!commands && upper !== 'M') fail('SVG_PATH', 'A path must begin with moveto.');
    if (upper === 'Z') { if (++commands > limits.maxPathCommands) fail('SVG_PATH_COMMANDS', 'Path command budget exceeded.'); output.push(cmd); x = startX; y = startY; continue; }
    const start = at; while (at < value.length && !/[A-DF-Za-df-z]/.test(value[at])) at++;
    const numbers = numberList(value.slice(start, at), limits.maxCoordinate, 'path'); if (numbers.length % arity[upper] !== 0) fail('SVG_PATH', `Wrong argument count for ${cmd}.`);
    const relative = cmd === cmd.toLowerCase();
    for (let n = 0; n < numbers.length; n += arity[upper]) {
      if (++commands > limits.maxPathCommands) fail('SVG_PATH_COMMANDS', 'Path command budget exceeded.');
      const v = numbers.slice(n, n + arity[upper]);
      if (upper === 'A' && (v[0] < 0 || v[1] < 0 || ![0,1].includes(v[3]) || ![0,1].includes(v[4]))) fail('SVG_PATH', 'Arc radii must be positive and arc flags must be 0 or 1.');
      if (upper === 'H') x = relative ? x + v[0] : v[0];
      else if (upper === 'V') y = relative ? y + v[0] : v[0];
      else {
        const pairStart = upper === 'A' ? 5 : 0;
        for (let p = pairStart; p < v.length; p += 2) { finite((relative ? x : 0) + v[p], limits.maxCoordinate, 'Resolved path x'); finite((relative ? y : 0) + v[p+1], limits.maxCoordinate, 'Resolved path y'); }
        x = (relative ? x : 0) + v[v.length-2]; y = (relative ? y : 0) + v[v.length-1];
      }
      finite(x, limits.maxCoordinate, 'Resolved path x'); finite(y, limits.maxCoordinate, 'Resolved path y');
      if (upper === 'M' && n === 0) { startX = x; startY = y; }
    }
    output.push(`${cmd} ${numbers.map(fmt).join(' ')}`);
  }
  if (!commands) fail('SVG_PATH', 'Path cannot be empty.');
  return { value: output.join(' '), commands };
}

function color(value, references, allowReference = true) {
  const text = value.trim().toLowerCase();
  if (text === 'none' || COLORS.has(text) || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(text)) return text;
  const ref = /^url\(#([A-Za-z_][A-Za-z0-9_.-]{0,63})\)$/.exec(value.trim());
  if (allowReference && ref) { references.push(ref[1]); return `url(#${ref[1]})`; }
  const rgb = /^(rgb|rgba)\(([^()]*)\)$/.exec(text);
  if (rgb) { const bits = rgb[2].split(',').map(part => part.trim()); const count = rgb[1] === 'rgb' ? 3 : 4; if (bits.length !== count) fail('SVG_PAINT', 'Invalid RGB color.'); const normalized = bits.map((part, index) => {
    const percentage = part.endsWith('%'); const max = index === 3 ? (percentage ? 100 : 1) : (percentage ? 100 : 255); const n = numeric(percentage ? part.slice(0,-1) : part, max, 'color', { min:0 }); return fmt(n) + (percentage ? '%' : '');
  }); return `${rgb[1]}(${normalized.join(',')})`; }
  fail('SVG_PAINT', 'Paint must be a literal color, none, or a checked local gradient.');
}

function serialize(node) { const attrs = Object.keys(node.attrs).sort().map(key => ` ${key}="${node.attrs[key]}"`).join(''); return node.children.length ? `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>` : `<${node.tag}${attrs}/>`; }

function sanitizeSvg(input, suppliedLimits = {}) {
  if (typeof input !== 'string') fail('SVG_INPUT', 'SVG input must be a string.');
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS)) if (Object.hasOwn(suppliedLimits, key)) { const value = suppliedLimits[key]; if (!Number.isSafeInteger(value) || value <= 0 || value > DEFAULT_LIMITS[key]) fail('SVG_LIMITS', `${key} may only tighten the default limit.`); limits[key] = value; }
  const inputBytes = Buffer.byteLength(input, 'utf8'); if (inputBytes > limits.maxBytes) fail('SVG_BYTES', `SVG exceeds ${limits.maxBytes} bytes.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(input) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input)) fail('SVG_XML', 'Invalid XML character.');
  const parsed = parseXml(input, limits); const { root } = parsed; const ids = new Map(), references = []; let pathCommands = 0, gradients = 0, defs = 0;
  function normalize(node, parentMatrix = IDENTITY) {
    const attrs = node.attrs, isDraw = DRAW.has(node.tag) || node.tag === 'svg';
    let localMatrix = IDENTITY;
    for (const key of Object.keys(attrs)) {
      if (!SPECIFIC[node.tag].has(key) && !(isDraw && COMMON.has(key) && !(node.tag === 'svg' && (key === 'id' || key === 'transform')))) fail('SVG_ATTRIBUTE', `Unsupported ${key} attribute on ${node.tag}.`);
      const value = attrs[key];
      if (key === 'id') { if (!ID.test(value) || ids.has(value)) fail('SVG_ID', 'IDs must be short, unique ASCII names.'); ids.set(value, { node, index: ids.size + 1 }); }
      else if (key === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') fail('SVG_NAMESPACE', 'Unexpected SVG namespace.'); }
      else if (key === 'transform' || key === 'gradientTransform') { const normalized = transform(value, limits); attrs[key] = normalized.value; if (key === 'transform') localMatrix = normalized.matrix; }
      else if (['fill','stroke','stop-color'].includes(key)) attrs[key] = color(value, references, key !== 'stop-color');
      else if (['opacity','fill-opacity','stroke-opacity','stop-opacity'].includes(key)) attrs[key] = fmt(numeric(value, 1, key, { min:0 }));
      else if (key === 'stroke-width') attrs[key] = fmt(numeric(value, limits.maxStrokeWidth, key, { min:0, units:true }));
      else if (key === 'stroke-miterlimit') attrs[key] = fmt(numeric(value, 20, key, { min:1 }));
      else if (key === 'stroke-dashoffset') attrs[key] = fmt(numeric(value, limits.maxCoordinate, key));
      else if (key === 'stroke-dasharray') { if (value.trim() === 'none') attrs[key] = 'none'; else { const values = numberList(value, 10000, key); if (values.length > 32 || values.some(n => n < 0) || values.every(n => n === 0)) fail('SVG_NUMBER', 'Invalid stroke dash pattern.'); attrs[key] = values.map(fmt).join(' '); } }
      else if (key === 'stroke-linecap') { if (!['butt','round','square'].includes(value)) fail('SVG_ATTRIBUTE', 'Invalid linecap.'); }
      else if (key === 'stroke-linejoin') { if (!['miter','round','bevel'].includes(value)) fail('SVG_ATTRIBUTE', 'Invalid linejoin.'); }
      else if (key === 'fill-rule') { if (!['nonzero','evenodd'].includes(value)) fail('SVG_ATTRIBUTE', 'Invalid fill-rule.'); }
      else if (key === 'vector-effect') { if (value !== 'non-scaling-stroke') fail('SVG_ATTRIBUTE', 'Unsupported vector-effect.'); }
      else if (key === 'preserveAspectRatio') { if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value)) fail('SVG_ATTRIBUTE', 'Invalid preserveAspectRatio.'); }
      else if (key === 'viewBox') { const values = numberList(value, limits.maxCoordinate, key); if (values.length !== 4 || values[2] < 0.001 || values[3] < 0.001 || values[2] > limits.maxDimension || values[3] > limits.maxDimension) fail('SVG_VIEWBOX', 'viewBox width and height must be between 0.001 and the dimension limit.'); attrs[key] = values.map(fmt).join(' '); }
      else if (key === 'gradientUnits') { if (!['objectBoundingBox','userSpaceOnUse'].includes(value)) fail('SVG_GRADIENT', 'Unsupported gradientUnits.'); }
      else if (key === 'spreadMethod') { if (!['pad','reflect','repeat'].includes(value)) fail('SVG_GRADIENT', 'Unsupported spreadMethod.'); }
      else if (key === 'offset') { const percentage = value.trim().endsWith('%'); attrs[key] = fmt(numeric(percentage ? value.trim().slice(0,-1) : value, percentage ? 100 : 1, key, { min:0 }) / (percentage ? 100 : 1)); }
      else if (key === 'd') { const normalized = pathData(value, limits); pathCommands += normalized.commands; if (pathCommands > limits.maxPathCommands) fail('SVG_PATH_COMMANDS', 'Total path command budget exceeded.'); attrs[key] = normalized.value; }
      else if (key === 'points') { const values = numberList(value, limits.maxCoordinate, key); const minimum = node.tag === 'polygon' ? 6 : 4; if (values.length < minimum || values.length % 2 || values.length > limits.maxPathCommands * 2) fail('SVG_POINTS', 'Invalid or excessively complex points.'); pathCommands += values.length / 2; if (pathCommands > limits.maxPathCommands) fail('SVG_PATH_COMMANDS', 'Total geometry command budget exceeded.'); attrs[key] = values.map(fmt).join(' '); }
      else {
        const gradient = GRADIENTS.has(node.tag), nonnegative = ['width','height','r','rx','ry','fr'].includes(key);
        if (gradient && value.trim().endsWith('%')) attrs[key] = fmt(numeric(value.trim().slice(0,-1), 1000, key, { min:nonnegative ? 0 : -1000 })) + '%';
        else attrs[key] = fmt(numeric(value, node.tag === 'svg' ? limits.maxDimension : limits.maxCoordinate, key, { min:nonnegative ? 0 : -limits.maxCoordinate, units: !gradient }));
      }
    }
    const combined = boundedMatrix(multiply(parentMatrix, localMatrix), limits);
    if (node.tag === 'defs' && ++defs > 1) fail('SVG_GRADIENT', 'Only one defs block is supported.');
    if (GRADIENTS.has(node.tag)) { if (!attrs.id || !node.children.length || node.children.length > limits.maxStops || ++gradients > limits.maxGradients) fail('SVG_GRADIENT', 'Gradient needs an ID, bounded stops, and a bounded gradient count.'); let previous = -1; for (const stop of node.children) { if (!Object.hasOwn(stop.attrs, 'offset')) fail('SVG_GRADIENT', 'Stops require offset.'); const raw = stop.attrs.offset.trim(), n = numeric(raw.endsWith('%') ? raw.slice(0,-1) : raw, raw.endsWith('%') ? 100 : 1, 'offset', { min:0 }) / (raw.endsWith('%') ? 100 : 1); if (n < previous) fail('SVG_GRADIENT', 'Stop offsets must be nondecreasing.'); previous = n; } }
    if (node.tag === 'path' && !attrs.d) fail('SVG_PATH', 'Path requires d.');
    if (['polyline','polygon'].includes(node.tag) && !attrs.points) fail('SVG_POINTS', 'Polyline and polygon require points.');
    node.children.forEach(child => normalize(child, combined));
  }
  normalize(root);
  let viewBox;
  if (root.attrs.viewBox) viewBox = root.attrs.viewBox.split(' ').map(Number);
  else { const width = Number(root.attrs.width), height = Number(root.attrs.height); if (!(width >= 0.001 && height >= 0.001)) fail('SVG_VIEWBOX', 'Provide a viewBox or width and height of at least 0.001.'); viewBox = [0,0,width,height]; root.attrs.viewBox = viewBox.map(fmt).join(' '); }
  if ((root.attrs.width && Number(root.attrs.width) < 0.001) || (root.attrs.height && Number(root.attrs.height) < 0.001)) fail('SVG_VIEWBOX', 'Root dimensions must be at least 0.001.');
  root.attrs.width = root.attrs.width || fmt(viewBox[2]); root.attrs.height = root.attrs.height || fmt(viewBox[3]); root.attrs.xmlns = 'http://www.w3.org/2000/svg';
  for (const reference of references) { const target = ids.get(reference); if (!target || !GRADIENTS.has(target.node.tag)) fail('SVG_REFERENCE', 'Paint references must target a gradient in this asset.'); }
  // A structural digest makes prefixes independent of user-supplied names and attribute order.
  for (const [original, record] of ids) record.node.attrs.id = `g${record.index}`;
  function replaceReferences(node, prefix) { for (const key of ['fill','stroke']) if (node.attrs[key]?.startsWith('url(#')) { const original = node.attrs[key].slice(5,-1); node.attrs[key] = `url(#${prefix}g${ids.get(original).index})`; } node.children.forEach(child => replaceReferences(child, prefix)); }
  replaceReferences(root, ''); const structural = serialize(root); const prefix = `tea-${hash(structural).slice(0,16)}-`;
  function prefixIds(node) { if (node.attrs.id) node.attrs.id = prefix + node.attrs.id; for (const key of ['fill','stroke']) if (node.attrs[key]?.startsWith('url(#')) node.attrs[key] = `url(#${prefix}${node.attrs[key].slice(5,-1)})`; node.children.forEach(prefixIds); }
  prefixIds(root); const svg = serialize(root), bytes = Buffer.byteLength(svg, 'utf8'); if (bytes > limits.maxBytes) fail('SVG_BYTES', 'Normalized SVG exceeds byte budget.');
  return { svg, hash:hash(svg), stats:{ bytes, elements:parsed.elements, pathCommands, depth:parsed.depth }, viewBox };
}

function parseSvgTree(input) { const asset = sanitizeSvg(input); return {asset, root:parseXml(asset.svg, DEFAULT_LIMITS).root}; }
module.exports = { sanitizeSvg, parseSvgTree, DEFAULT_LIMITS };
