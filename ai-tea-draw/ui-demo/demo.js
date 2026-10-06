'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'ai-tea-ui-demo-v1';
  const clone = value => structuredClone(value);
  const id = () => crypto.randomUUID();
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const node = (tag, attrs = {}) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  };
  const palette = ['#416f64', '#274a4b', '#6c9e95', '#9ec5bb', '#d6e7cf', '#e9eddf', '#ce9275', '#e8b78a', '#f2d39b', '#a298b4', '#78818e', '#fffdf6'];
  const toolNames = { select: '选择', brush: '画笔', erase: '对象橡皮', rect: '矩形', ellipse: '椭圆', line: '直线', pan: '平移' };
  const toolIcons = { select: 'select', brush: 'brush', erase: 'erase', rect: 'rect', ellipse: 'ellipse', line: 'line', pan: 'hand' };
  const baseObject = (kind, x, y, w, h, color, label) => ({ id: id(), kind, x, y, w, h, angle: 0, color, opacity: 1, size: 4, label, fillEnabled: true });
  function initialDocument() {
    return {
      layers: [
        { id: 'background', name: '夜市背景', visible: true, locked: true, objects: [baseObject('background', 0, 0, 1040, 720, '#c9dfcf', '夜市背景')] },
        { id: 'market', name: '灯笼与小屋', visible: true, locked: false, objects: [
          baseObject('stall', 188, 306, 232, 230, '#547f70', '珊瑚茶屋'),
          baseObject('lanterns', 208, 150, 620, 150, '#ce9275', '夜市灯笼'),
          baseObject('coral', 826, 359, 80, 175, '#c79784', '一株珊瑚')
        ] },
        { id: 'whale', name: '鲸鱼茶摊', visible: true, locked: false, objects: [baseObject('whale', 468, 320, 285, 229, '#799f9e', '小鲸鱼')] },
        { id: 'sketch', name: '我的笔画', visible: true, locked: false, objects: [] }
      ],
      activeLayer: 'sketch'
    };
  }
  let documentState = initialDocument();
  let sharedState = clone(documentState);
  let pendingSubmission = null;
  let sharedName = '伙伴们的夜市 · 示例';
  let saveAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.version === 1 && Array.isArray(saved.draft?.layers) && saved.draft.layers.length < 100 &&
      saved.draft.layers.every(layer => Array.isArray(layer.objects) && layer.objects.length < 1500)) {
      documentState = saved.draft;
      sharedState = saved.shared || clone(documentState);
      pendingSubmission = saved.pending || null;
      sharedName = saved.sharedName || sharedName;
    }
  } catch { /* A damaged or unavailable local cache starts with the example. */ }
  let tool = 'brush', selectedId = null, viewName = 'draft', panel = 'layers';
  let layout = new URLSearchParams(location.search).get('layout') ||
    (matchMedia('(pointer:coarse)').matches || innerWidth < 900 ? 'touch' : 'desktop');
  let panelOpen = layout === 'desktop' && innerWidth > 650;
  let focus = false, space = false, hand = 'left';
  let config = { color: '#416f64', size: 6, opacity: 1, fill: false, marker: false };
  let viewport = { scale: 1, x: 0, y: 0 };
  let gesture = null, pinch = null, suppressTouch = false, rangeBefore = null;
  const pointers = new Map(), undoStack = [], redoStack = [];
  let toastTimer, saveTimer;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400);
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, draft: documentState, shared: sharedState, pending: pendingSubmission, sharedName }));
        saveAvailable = true;
      } catch { saveAvailable = false; }
      $('save-status').textContent = saveAvailable ? '已保存在本机' : '本地存储不可用，建议导出';
      $('footer-save').textContent = saveAvailable ? '本地草稿已保存' : '草稿仅保留在当前页面';
    }, 120);
  }
  function commit(before) {
    if (!before || JSON.stringify(before) === JSON.stringify(documentState)) return;
    undoStack.push(before);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    persist();
    render();
  }
  function undo() {
    if (viewName !== 'draft' || !undoStack.length) return;
    redoStack.push(clone(documentState));
    documentState = undoStack.pop();
    selectedId = null;
    render();
    persist();
  }
  function redo() {
    if (viewName !== 'draft' || !redoStack.length) return;
    undoStack.push(clone(documentState));
    documentState = redoStack.pop();
    selectedId = null;
    render();
    persist();
  }
  function getObject(objectId = selectedId) {
    if (!objectId) return null;
    for (const layer of documentState.layers) {
      const object = layer.objects.find(item => item.id === objectId);
      if (object) return { object, layer };
    }
    return null;
  }
  function editable(found = getObject()) {
    return viewName === 'draft' && found && found.layer.visible && !found.layer.locked;
  }
  function objectMarkup(object) {
    const color = /^#[0-9a-f]{6}$/i.test(object.color) ? object.color : '#416f64';
    if (object.kind === 'background') return '<ellipse cx="530" cy="353" rx="416" ry="247" fill="url(#sea-light)"/><path d="M143 500Q245 456 390 487T724 488Q811 471 910 514L910 560Q512 606 143 560Z" fill="#d9ddbd"/><path d="M145 553Q322 587 485 556T902 552" fill="none" stroke="#c0cda6" stroke-width="3"/><circle cx="768" cy="214" r="38" fill="#faf0c4"/><circle cx="768" cy="214" r="48" fill="none" stroke="#eef0d4" stroke-width="2"/><path d="M166 405Q198 400 227 405M759 412Q802 398 845 410M399 216Q430 207 456 217" fill="none" stroke="#a9c9b7" stroke-width="3" stroke-linecap="round"/><circle cx="228" cy="242" r="5" fill="#a7c5b1"/><circle cx="863" cy="280" r="4" fill="#a7c5b1"/><circle cx="799" cy="487" r="5" fill="#f6e2b0"/><circle cx="169" cy="457" r="3" fill="#f6e2b0"/>';
    if (object.kind === 'whale') return '<ellipse cx="141" cy="219" rx="113" ry="8" fill="#5b7865" opacity=".11"/><path d="M45 140C16 90 57 54 111 57C153 3 232 31 252 95L280 70L279 130L249 116C225 170 100 184 45 140Z" fill="' + color + '"/><path d="M102 150Q116 190 146 181Q136 157 130 142" fill="#5e898c"/><path d="M107 51Q79 26 115 17Q120 0 148 14Q174 17 155 53Z" fill="#426563"/><path d="M146 173Q216 190 249 147" fill="none" stroke="#527d7e" stroke-width="3" stroke-linecap="round"/><circle cx="205" cy="89" r="5" fill="#2d4a4e"/><path d="M204 109Q215 123 230 111" fill="none" stroke="#355e60" stroke-width="3" stroke-linecap="round"/><ellipse cx="196" cy="111" rx="8" ry="4" fill="#d7a09b" opacity=".65"/><path d="M207 43Q226 33 222 21M226 31Q245 26 243 16" fill="none" stroke="#d5ebe1" stroke-width="4" stroke-linecap="round"/><rect x="79" y="184" width="173" height="13" rx="6" fill="#b9a48a"/><path d="M96 197v27M235 197v27" stroke="#9c8b76" stroke-width="7" stroke-linecap="round"/><ellipse cx="178" cy="181" rx="30" ry="5" fill="#f0e8d5"/><path d="M163 157h27v17q-14 13-27 0Z" fill="#eee3c8"/><path d="M190 161q16-3 11 9q-3 5-12 2" fill="none" stroke="#eee3c8" stroke-width="4"/><path d="M172 151q-6-8 1-15M180 152q-4-7 2-13" fill="none" stroke="#ecf0df" stroke-width="3" stroke-linecap="round"/>';
    if (object.kind === 'stall') return '<ellipse cx="120" cy="219" rx="106" ry="7" fill="#5b7865" opacity=".12"/><path d="M30 72h177v137H30Z" fill="#ddc6a3"/><path d="M30 84h177v16H30Z" fill="#cfb38e"/><path d="M7 78Q74 10 124 12Q183 17 230 78Z" fill="url(#roof-light)"/><path d="M29 76Q126 22 210 76" fill="none" stroke="#91afa0" stroke-width="4"/><path d="M37 20q-17-10-10-20M183 29q14-20 8-29" fill="none" stroke="#c89b87" stroke-width="6" stroke-linecap="round"/><rect x="48" y="116" width="131" height="77" rx="4" fill="' + color + '"/><rect x="55" y="123" width="116" height="53" rx="2" fill="#8cb3a0"/><path d="M113 123v53M55 148h116" stroke="#527a6c" stroke-width="4"/><rect x="44" y="183" width="140" height="8" rx="4" fill="#b59775"/><path d="M65 175v-15h20v15M120 175v-15h20v15" fill="#eae4c7"/><path d="M39 208h173" stroke="#bcaa89" stroke-width="7" stroke-linecap="round"/><path d="M179 160h22v48h-22Z" fill="#a98f72"/>';
    if (object.kind === 'lanterns') return '<path d="M0 9Q282 101 620 6" fill="none" stroke="#729481" stroke-width="3"/><path d="M128 39v24M315 56v27M498 38v25" stroke="#9b8466" stroke-width="2"/><ellipse cx="128" cy="91" rx="21" ry="30" fill="' + color + '"/><ellipse cx="128" cy="91" rx="8" ry="30" fill="none" stroke="#f3d1a4" stroke-width="2"/><path d="M115 62h26M115 120h26M128 120v21" stroke="#a7785e" stroke-width="3"/><ellipse cx="315" cy="107" rx="18" ry="25" fill="#a3b99b"/><ellipse cx="315" cy="107" rx="7" ry="25" fill="none" stroke="#deebc8" stroke-width="2"/><path d="M304 82h22M304 132h22M315 132v17" stroke="#819778" stroke-width="3"/><ellipse cx="498" cy="88" rx="20" ry="26" fill="#dfb378"/><ellipse cx="498" cy="88" rx="8" ry="26" fill="none" stroke="#f6dda5" stroke-width="2"/><path d="M486 62h24M486 113h24M498 113v20" stroke="#b28e5e" stroke-width="3"/>';
    if (object.kind === 'coral') return '<path d="M39 168V30M39 77Q13 76 8 45M39 109Q69 104 72 73M39 51Q59 40 63 10M39 143Q13 138 9 106" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round"/><circle cx="8" cy="45" r="7" fill="#d8ac92"/><circle cx="72" cy="72" r="7" fill="#d8ac92"/><circle cx="63" cy="10" r="7" fill="#d8ac92"/><circle cx="9" cy="105" r="7" fill="#d8ac92"/><ellipse cx="40" cy="170" rx="29" ry="5" fill="#5b7865" opacity=".12"/>';
    if (object.kind === 'bubbles') return '<circle cx="20" cy="80" r="14" fill="none" stroke="' + color + '" stroke-width="3"/><circle cx="50" cy="40" r="10" fill="none" stroke="' + color + '" stroke-width="3"/><circle cx="67" cy="12" r="5" fill="none" stroke="' + color + '" stroke-width="2"/><path d="M13 75q2-6 7-6M44 36q1-4 5-4" fill="none" stroke="#f7fbf1" stroke-width="3" stroke-linecap="round"/>';
    return '';
  }
  const illustrationDimensions = { background: [1040,720], whale: [285,229], stall: [232,230], lanterns: [620,150], coral: [80,175], bubbles: [80,100] };
  function smoothPath(points) {
    if (points.length < 2) return 'M0 0L.1 .1';
    let d = 'M' + points[0].x + ' ' + points[0].y;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], next = points[i+1];
      d += 'Q' + p.x + ' ' + p.y + ' ' + ((p.x+next.x)/2) + ' ' + ((p.y+next.y)/2);
    }
    const last = points.at(-1);
    return d + 'L' + last.x + ' ' + last.y;
  }
  function objectNode(object) {
    const [bw,bh] = illustrationDimensions[object.kind] || [object.baseWidth || object.w, object.baseHeight || object.h];
    const g = node('g', { 'data-object': object.id, 'aria-label': object.label || object.kind, opacity: object.opacity,
      transform: 'translate(' + object.x + ' ' + object.y + ') rotate(' + object.angle + ' ' + object.w/2 + ' ' + object.h/2 + ') scale(' + object.w/bw + ' ' + object.h/bh + ')' });
    const color = /^#[0-9a-f]{6}$/i.test(object.color) ? object.color : '#416f64';
    if (illustrationDimensions[object.kind]) {
      // Only original, constant demonstration SVG is used here. No uploaded markup is inserted.
      g.innerHTML = objectMarkup(object);
    } else {
      const attrs = { fill: object.fillEnabled ? color : 'none', stroke: color, 'stroke-width': object.size, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      let shape;
      if (object.kind === 'brush') shape = node('path', { ...attrs, fill: 'none', d: smoothPath(object.points) });
      else if (object.kind === 'rect') shape = node('rect', { ...attrs, x: 0, y: 0, width: bw, height: bh, rx: object.radius || 3 });
      else if (object.kind === 'ellipse') shape = node('ellipse', { ...attrs, cx: bw/2, cy: bh/2, rx: bw/2, ry: bh/2 });
      else if (object.kind === 'line') shape = node('line', { ...attrs, x1: object.lineReverseX ? bw : 0, y1: object.lineReverseY ? bh : 0, x2: object.lineReverseX ? 0 : bw, y2: object.lineReverseY ? 0 : bh });
      if (shape) g.append(shape);
    }
    return g;
  }
  function renderArt() {
    const state = viewName === 'draft' ? documentState : sharedState;
    $('art').replaceChildren();
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      const g = node('g', { 'data-layer': layer.id });
      for (const object of layer.objects) g.append(objectNode(object));
      $('art').append(g);
    }
    renderSelection();
  }
  function renderSelection() {
    const overlay = $('selection-overlay');
    overlay.replaceChildren();
    const found = getObject();
    const active = editable(found) && tool === 'select';
    $('selection-actions').hidden = !active;
    if (!active) return;
    const o = found.object, r = (layout === 'touch' || innerWidth <= 650 ? 9 : 5)/viewport.scale;
    $('selection-name').textContent = o.label || '所选对象';
    const g = node('g', { transform: 'translate(' + o.x + ' ' + o.y + ') rotate(' + o.angle + ' ' + o.w/2 + ' ' + o.h/2 + ')' });
    g.append(node('rect', { x: 0, y: 0, width: o.w, height: o.h, fill: 'none', stroke: '#416f64', 'stroke-width': 1.4/viewport.scale, 'pointer-events': 'none' }));
    g.append(node('path', { d: 'M' + o.w/2 + ' 0V' + (-28/viewport.scale), stroke: '#416f64', 'stroke-width': 1.4/viewport.scale, 'pointer-events': 'none' }));
    for (const [name,x,y] of [['nw',0,0],['ne',o.w,0],['se',o.w,o.h],['sw',0,o.h],['rotate',o.w/2,-30/viewport.scale]]) {
      const handle = node('g', { 'data-handle': name, cursor: name === 'rotate' ? 'grab' : 'nwse-resize' });
      handle.append(node('circle', { cx: x, cy: y, r: (layout === 'touch' ? 22 : 11)/viewport.scale, fill: 'transparent' }));
      handle.append(node(name === 'rotate' ? 'circle' : 'rect', name === 'rotate' ?
        { cx: x, cy: y, r, fill: '#fffdf6', stroke: '#416f64', 'stroke-width': 1.5/viewport.scale } :
        { x: x-r, y: y-r, width: 2*r, height: 2*r, rx: 1/viewport.scale, fill: '#fffdf6', stroke: '#416f64', 'stroke-width': 1.5/viewport.scale }));
      g.append(handle);
    }
    overlay.append(g);
  }
  function renderLayers() {
    const displayState = viewName === 'draft' ? documentState : sharedState;
    const list = $('layer-list');
    list.replaceChildren();
    for (const layer of [...displayState.layers].reverse()) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === documentState.activeLayer ? ' active' : '') + (!layer.visible ? ' is-hidden' : '');
      row.dataset.layerId = layer.id;
      const thumb = document.createElement('span');
      thumb.className = 'layer-thumb';
      const first = layer.objects[0];
      const thumbSvg = node('svg', { viewBox: first ? (first.x-12) + ' ' + (first.y-12) + ' ' + (first.w+24) + ' ' + (first.h+24) : '0 0 100 100' });
      for (const object of layer.objects.slice(0,10)) thumbSvg.append(objectNode(object));
      thumb.append(thumbSvg);
      const choose = document.createElement('button');
      choose.className = 'layer-select';
      const title = document.createElement('strong'), count = document.createElement('small');
      title.textContent = layer.name;
      count.textContent = layer.locked ? '已锁定' : layer.objects.length + ' 个对象';
      choose.append(title,count);
      choose.disabled = viewName !== 'draft';
      choose.addEventListener('click', () => {
        documentState.activeLayer = layer.id;
        selectedId = null;
        render();
        persist();
      });
      row.append(thumb, choose);
      for (const field of ['visible','locked']) {
        const button = document.createElement('button');
        button.className = 'icon-button';
        button.setAttribute('aria-label', (field === 'visible' ? (layer.visible ? '隐藏 ' : '显示 ') : (layer.locked ? '解锁 ' : '锁定 ')) + layer.name);
        button.title = button.getAttribute('aria-label');
        button.innerHTML = icon(field === 'visible' ? (layer.visible ? 'eye' : 'eye-off') : (layer.locked ? 'lock' : 'unlock'));
        button.disabled = viewName !== 'draft';
        button.addEventListener('click', () => {
          const before = clone(documentState);
          layer[field] = !layer[field];
          if (!editable(getObject())) selectedId = null;
          commit(before);
        });
        row.append(button);
      }
      list.append(row);
    }
    const active = documentState.layers.find(layer => layer.id === documentState.activeLayer);
    if (document.activeElement !== $('layer-name')) $('layer-name').value = active?.name || '';
    const index = documentState.layers.indexOf(active);
    $('layer-up').disabled = viewName !== 'draft' || index === documentState.layers.length-1;
    $('layer-down').disabled = viewName !== 'draft' || index <= 0;
    $('add-layer').disabled = viewName !== 'draft';
    $('layer-name').disabled = viewName !== 'draft';
  }
  function render() {
    renderArt();
    renderLayers();
    $('undo').disabled = !undoStack.length || viewName !== 'draft';
    $('redo').disabled = !redoStack.length || viewName !== 'draft';
    $('submit-open').disabled = viewName !== 'draft';
    $('canvas-caption').textContent = viewName === 'draft' ? '我的草稿 · 仅自己可见' : '全场画布 · ' + sharedName;
    $('review-status').textContent = pendingSubmission ? '「' + pendingSubmission.name + '」等待房主确认（演示）' : (sharedName === '伙伴们的夜市 · 示例' ? '还没有提交作品' : '「' + sharedName + '」已发布（演示）');
    $('simulate-approve').disabled = !pendingSubmission;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === viewName)));
    document.querySelectorAll('[data-tool]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      button.disabled = viewName === 'shared' && button.dataset.tool !== 'pan';
    });
    $('agent-demo-add').disabled = viewName !== 'draft';
    for (const control of ['brush-size','brush-opacity','shape-fill','preset-switch','color-open','shape-open']) $(control).disabled = viewName !== 'draft';
    $('side-panel').querySelector('[data-panel-content=layers] h2').textContent = viewName === 'draft' ? '我的图层' : '已发布图层';
    updateSettings();
  }
  function updateSettings() {
    $('active-tool-name').textContent = toolNames[tool];
    $('active-tool-icon').querySelector('use').setAttribute('href','#i-' + toolIcons[tool]);
    $('brush-size').value = config.size;
    $('brush-size-value').textContent = config.size + ' px';
    $('brush-opacity').value = Math.round(config.opacity*100);
    $('brush-opacity-value').textContent = Math.round(config.opacity*100) + '%';
    $('shape-fill').checked = config.fill;
    $('shape-menu-fill').checked = config.fill;
    $('shape-open').setAttribute('aria-pressed',String(['rect','ellipse','line'].includes(tool)));
    if (['rect','ellipse','line'].includes(tool)) $('shape-open').querySelector('use').setAttribute('href','#i-'+toolIcons[tool]);
    $('current-color').style.background = config.color;
    $('custom-color').value = config.color;
    $('color-hex').textContent = config.color.toUpperCase();
    $('preset-name').textContent = config.marker ? '荧光笔' : '圆头画笔';
    $('paper').style.cursor = viewName === 'shared' || tool === 'pan' || space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    document.querySelectorAll('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === config.color)));
  }
  function setTool(next) {
    tool = next;
    if (next !== 'select') selectedId = null;
    render();
  }
  function selectObject(objectId) {
    selectedId = objectId;
    const found = getObject();
    if (!editable(found)) { selectedId = null; renderSelection(); return; }
    documentState.activeLayer = found.layer.id;
    config.color = found.object.color;
    config.opacity = found.object.opacity;
    config.size = found.object.size || 6;
    config.fill = !!found.object.fillEnabled;
    render();
  }
  function changeColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    const before = clone(documentState);
    config.color = color;
    if (editable()) getObject().object.color = color;
    commit(before);
    updateSettings();
  }
  function openPanel(next) {
    panel = next;
    panelOpen = true;
    syncPanels();
    fitCanvas();
  }
  function syncPanels() {
    document.body.classList.toggle('panel-hidden', !panelOpen);
    document.querySelectorAll('[data-panel]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.panel === panel)));
    document.querySelectorAll('[data-panel-content]').forEach(section => section.hidden = section.dataset.panelContent !== panel);
    $('panel-scrim').hidden = !panelOpen || (layout !== 'touch' && innerWidth > 650);
  }
  function setLayout(next) {
    layout = next === 'touch' ? 'touch' : 'desktop';
    document.body.dataset.layout = layout;
    panelOpen = layout === 'desktop' && innerWidth > 650;
    $('gesture-hint').textContent = layout === 'touch' ? '双指缩放 / 平移 · 双指轻点撤销' : 'B 画笔 · V 选择 · 空格平移 · 滚轮缩放';
    document.querySelectorAll('[data-layout-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layoutChoice === layout)));
    const url = new URL(location.href);
    url.searchParams.set('layout',layout);
    history.replaceState(null,'',url);
    syncPanels();
    $('color-popover').hidden = true;
    requestAnimationFrame(fitCanvas);
  }
  function applyViewport() {
    $('paper').style.transform = 'translate(' + viewport.x + 'px,' + viewport.y + 'px) scale(' + viewport.scale + ')';
    $('zoom-value').textContent = Math.round(viewport.scale*100) + '%';
    renderSelection();
  }
  function fitCanvas() {
    const area = $('canvas-area').getBoundingClientRect(), phone = innerWidth <= 650;
    const left = focus ? 24 : phone ? 18 : 90;
    const right = focus ? 24 : phone ? 18 : 63;
    const top = focus ? 28 : phone ? 68 : (document.body.dataset.game === 'true' ? 76 : 57);
    const bottom = focus ? 28 : phone ? 192 : layout === 'touch' ? 107 : 67;
    viewport.scale = Math.max(.12, Math.min((area.width-left-right)/1040,(area.height-top-bottom)/720,1.2));
    viewport.x = left + (area.width-left-right-1040*viewport.scale)/2;
    viewport.y = top + (area.height-top-bottom-720*viewport.scale)/2;
    applyViewport();
  }
  function zoomAt(factor, clientX, clientY) {
    const area = $('canvas-area').getBoundingClientRect();
    const x = clientX-area.left, y = clientY-area.top;
    const worldX = (x-viewport.x)/viewport.scale, worldY = (y-viewport.y)/viewport.scale;
    viewport.scale = Math.max(.12, Math.min(4,viewport.scale*factor));
    viewport.x = x-worldX*viewport.scale;
    viewport.y = y-worldY*viewport.scale;
    applyViewport();
  }
  function point(event) {
    const area = $('canvas-area').getBoundingClientRect();
    return { x: (event.clientX-area.left-viewport.x)/viewport.scale, y: (event.clientY-area.top-viewport.y)/viewport.scale };
  }
  function addObject(object) {
    let layer = documentState.layers.find(item => item.id === documentState.activeLayer);
    if (!layer || layer.locked || !layer.visible) {
      layer = { id: id(), name: '我的笔画', visible: true, locked: false, objects: [] };
      documentState.layers.push(layer);
      documentState.activeLayer = layer.id;
      toast('已为你新建一个可绘画图层');
    }
    if (documentState.layers.reduce((total,item) => total+item.objects.length,0) > 1000) {
      toast('演示画布已达到 1000 个对象，请导出后刷新');
      return;
    }
    layer.objects.push(object);
  }
  function previewStroke(points) {
    $('gesture-preview').replaceChildren(node('path', { d: smoothPath(points), fill: 'none', stroke: config.color, opacity: config.opacity,
      'stroke-width': config.size, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  function shapeFromGesture(kind, start, end, shift) {
    let dx = end.x-start.x, dy = end.y-start.y;
    if (shift && kind !== 'line') {
      const size = Math.max(Math.abs(dx),Math.abs(dy));
      dx = Math.sign(dx || 1)*size;
      dy = Math.sign(dy || 1)*size;
    }
    if (shift && kind === 'line') {
      const length = Math.hypot(dx,dy), a = Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);
      dx = Math.cos(a)*length; dy = Math.sin(a)*length;
    }
    return { ...baseObject(kind,Math.min(start.x,start.x+dx),Math.min(start.y,start.y+dy),Math.max(1,Math.abs(dx)),Math.max(1,Math.abs(dy)),config.color,toolNames[kind]),
      size: config.size, opacity: config.opacity, fillEnabled: config.fill, lineReverseX: dx<0, lineReverseY: dy<0 };
  }
  function beginPinch() {
    const [a,b] = [...pointers.values()];
    if (gesture?.before && ['move','resize','rotate'].includes(gesture.kind)) documentState = gesture.before;
    gesture = null;
    $('gesture-preview').replaceChildren();
    renderArt();
    const area = $('canvas-area').getBoundingClientRect();
    const mx = (a.x+b.x)/2-area.left, my = (a.y+b.y)/2-area.top;
    pinch = { distance: Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)), scale: viewport.scale,
      anchor: { x: (mx-viewport.x)/viewport.scale, y: (my-viewport.y)/viewport.scale }, midpoint: { x: mx, y: my }, time: performance.now(), moved: false };
    suppressTouch = true;
  }
  $('canvas-area').addEventListener('pointerdown', event => {
    if (event.target.closest('button') || event.target.closest('.selection-actions') || event.button > 1) return;
    if (event.pointerType === 'touch' && [...pointers.values()].some(p => p.type === 'pen')) return;
    pointers.set(event.pointerId,{ x: event.clientX, y: event.clientY, type: event.pointerType });
    $('canvas-area').setPointerCapture(event.pointerId);
    if (pointers.size === 2 && event.pointerType === 'touch') { beginPinch(); return; }
    if (pointers.size !== 1 || suppressTouch) return;
    const p = point(event), handle = event.target.closest('[data-handle]')?.dataset.handle;
    if (space || tool === 'pan' || viewName === 'shared' || event.button === 1) {
      gesture = { kind: 'pan', startClient: { x: event.clientX, y: event.clientY }, viewport: clone(viewport) };
      return;
    }
    if (!event.target.closest('#board')) return;
    if (handle && editable()) {
      const original = clone(getObject().object);
      gesture = { kind: handle === 'rotate' ? 'rotate' : 'resize', handle, objectId: original.id, original, before: clone(documentState),
        startAngle: Math.atan2(p.y-original.y-original.h/2,p.x-original.x-original.w/2) };
      return;
    }
    const objectId = event.target.closest('[data-object]')?.dataset.object;
    if (tool === 'select') {
      selectObject(objectId || null);
      if (editable()) gesture = { kind: 'move', objectId, start: p, original: clone(getObject().object), before: clone(documentState) };
      return;
    }
    if (tool === 'erase') {
      const found = getObject(objectId);
      if (editable(found)) {
        const before = clone(documentState);
        found.layer.objects = found.layer.objects.filter(object => object.id !== objectId);
        selectedId = null;
        commit(before);
      } else if (found) toast('这个图层已锁定，先在图层面板解锁');
      return;
    }
    gesture = { kind: tool, start: p, points: [p], before: clone(documentState) };
    if (tool === 'brush') previewStroke([p,{ x: p.x+.1, y: p.y+.1 }]);
  });
  $('canvas-area').addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId,{ x: event.clientX, y: event.clientY, type: event.pointerType });
    if (pinch && pointers.size >= 2) {
      const [a,b] = [...pointers.values()], area = $('canvas-area').getBoundingClientRect();
      const mx = (a.x+b.x)/2-area.left, my = (a.y+b.y)/2-area.top, distance = Math.hypot(a.x-b.x,a.y-b.y);
      if (Math.abs(distance-pinch.distance)>6 || Math.hypot(mx-pinch.midpoint.x,my-pinch.midpoint.y)>6) pinch.moved = true;
      viewport.scale = Math.max(.12,Math.min(4,pinch.scale*distance/pinch.distance));
      viewport.x = mx-pinch.anchor.x*viewport.scale;
      viewport.y = my-pinch.anchor.y*viewport.scale;
      applyViewport();
      return;
    }
    if (!gesture || suppressTouch) return;
    const p = point(event);
    if (gesture.kind === 'pan') {
      viewport.x = gesture.viewport.x + event.clientX-gesture.startClient.x;
      viewport.y = gesture.viewport.y + event.clientY-gesture.startClient.y;
      applyViewport();
    } else if (gesture.kind === 'move') {
      const found = getObject(gesture.objectId);
      found.object.x = gesture.original.x+p.x-gesture.start.x;
      found.object.y = gesture.original.y+p.y-gesture.start.y;
      renderArt();
    } else if (gesture.kind === 'rotate') {
      const o = getObject(gesture.objectId).object, original = gesture.original;
      const a = Math.atan2(p.y-original.y-original.h/2,p.x-original.x-original.w/2);
      o.angle = original.angle+(a-gesture.startAngle)*180/Math.PI;
      if (event.shiftKey) o.angle = Math.round(o.angle/15)*15;
      renderArt();
    } else if (gesture.kind === 'resize') {
      const o = getObject(gesture.objectId).object, old = gesture.original, a = old.angle*Math.PI/180, cos = Math.cos(a), sin = Math.sin(a);
      const sx = gesture.handle.includes('e') ? 1 : -1, sy = gesture.handle.includes('s') ? 1 : -1;
      const anchorX = old.x+old.w/2-sx*old.w/2*cos+sy*old.h/2*sin;
      const anchorY = old.y+old.h/2-sx*old.w/2*sin-sy*old.h/2*cos;
      const dx = p.x-anchorX, dy = p.y-anchorY;
      let w = Math.max(5,sx*(dx*cos+dy*sin)), h = Math.max(5,sy*(-dx*sin+dy*cos));
      if (event.shiftKey) { const ratio = old.w/old.h; if (w/h>ratio) h=w/ratio; else w=h*ratio; }
      const cx = anchorX+sx*w/2*cos-sy*h/2*sin, cy = anchorY+sx*w/2*sin+sy*h/2*cos;
      o.w=w; o.h=h; o.x=cx-w/2; o.y=cy-h/2;
      renderArt();
    } else if (gesture.kind === 'brush') {
      const last = gesture.points.at(-1);
      if (Math.hypot(p.x-last.x,p.y-last.y)>1 && gesture.points.length<2500) gesture.points.push(p);
      previewStroke(gesture.points);
    } else {
      gesture.shape = shapeFromGesture(gesture.kind,gesture.start,p,event.shiftKey);
      $('gesture-preview').replaceChildren(objectNode(gesture.shape));
    }
  });
  function endPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pinch || suppressTouch) {
      if (!pointers.size) {
        const shouldUndo = pinch && !pinch.moved && performance.now()-pinch.time<300 && !cancelled;
        pinch = null; suppressTouch = false; gesture = null;
        if (shouldUndo) { undo(); toast('双指撤销'); }
      }
      return;
    }
    const done = gesture;
    gesture = null;
    $('gesture-preview').replaceChildren();
    if (!done) return;
    if (cancelled) {
      if (done.before) documentState = done.before;
      render();
      return;
    }
    if (done.kind === 'brush') {
      const points = done.points;
      if (points.length === 1) points.push({ x: points[0].x+.1, y: points[0].y+.1 });
      const minX = Math.min(...points.map(p=>p.x)), minY = Math.min(...points.map(p=>p.y));
      const w = Math.max(1,Math.max(...points.map(p=>p.x))-minX), h = Math.max(1,Math.max(...points.map(p=>p.y))-minY);
      const object = { ...baseObject('brush',minX,minY,w,h,config.color,'画笔线条'), baseWidth: w, baseHeight: h,
        points: points.map(p=>({ x:p.x-minX,y:p.y-minY })), size: config.size, opacity: config.opacity, fillEnabled: false };
      addObject(object);
    } else if (['rect','ellipse','line'].includes(done.kind)) {
      addObject(done.shape || shapeFromGesture(done.kind,done.start,point(event),event.shiftKey));
    }
    if (done.before) commit(done.before);
    else render();
  }
  $('canvas-area').addEventListener('pointerup', event => endPointer(event));
  $('canvas-area').addEventListener('pointercancel', event => endPointer(event,true));
  $('canvas-area').addEventListener('wheel', event => {
    if (event.target.closest('.zoom-controls')) return;
    event.preventDefault();
    zoomAt(Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);
  }, { passive: false });

  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click',()=>setTool(button.dataset.tool)));
  document.querySelectorAll('[data-layout-choice]').forEach(button => button.addEventListener('click',()=>setLayout(button.dataset.layoutChoice)));
  document.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click',()=>openPanel(button.dataset.openPanel)));
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click',()=>openPanel(button.dataset.panel)));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',()=> {
    if (document.body.dataset.game === 'true' && button.dataset.view === 'shared') { toast('游戏中的作品揭晓后才能查看全场画布'); return; }
    viewName = button.dataset.view;
    selectedId = null;
    if (viewName === 'shared') toast('全场画布为浏览视图；切回我的草稿继续画');
    render();
    fitCanvas();
  }));
  $('panel-close').addEventListener('click',()=>{ panelOpen=false; syncPanels(); fitCanvas(); });
  $('panel-scrim').addEventListener('click',()=>{ panelOpen=false; syncPanels(); });
  $('undo').addEventListener('click',undo);
  $('redo').addEventListener('click',redo);
  $('fit').addEventListener('click',fitCanvas);
  $('zoom-value').addEventListener('click',fitCanvas);
  for (const [button,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]]) $(button).addEventListener('click',()=> {
    const area=$('canvas-area').getBoundingClientRect(); zoomAt(factor,area.left+area.width/2,area.top+area.height/2);
  });
  for (const [input,key] of [['brush-size','size'],['brush-opacity','opacity']]) {
    $(input).addEventListener('input',()=> {
      if (!rangeBefore) rangeBefore=clone(documentState);
      config[key] = Number($(input).value)/(key === 'opacity' ? 100 : 1);
      if (editable()) getObject().object[key] = config[key];
      renderArt();
      updateSettings();
    });
    $(input).addEventListener('change',()=> { commit(rangeBefore); rangeBefore=null; });
  }
  $('shape-fill').addEventListener('change',()=> {
    const before=clone(documentState); config.fill=$('shape-fill').checked;
    if (editable() && ['rect','ellipse'].includes(getObject().object.kind)) getObject().object.fillEnabled=config.fill;
    commit(before); updateSettings();
  });
  $('preset-switch').addEventListener('click',()=> {
    config.marker=!config.marker; config.size=config.marker?18:6; config.opacity=config.marker ? .45 : 1;
    updateSettings();
  });
  for (const color of palette) {
    const swatch=document.createElement('button');
    swatch.className='swatch'; swatch.dataset.color=color; swatch.style.setProperty('--swatch',color);
    swatch.setAttribute('aria-label','选择颜色 '+color); swatch.setAttribute('aria-pressed','false');
    swatch.addEventListener('click',()=>changeColor(color));
    $('swatches').append(swatch);
  }
  $('custom-color').addEventListener('change',()=>changeColor($('custom-color').value));
  $('color-open').addEventListener('click',()=> {
    const popover=$('color-popover'); popover.hidden=!popover.hidden;
    if (!popover.hidden) {
      const anchor=$('color-open').getBoundingClientRect();
      const width=popover.getBoundingClientRect().width;
      popover.style.left=Math.min(innerWidth-width-12,Math.max(12,anchor.right+12))+'px';
      popover.style.top=Math.max(55,Math.min(innerHeight-popover.getBoundingClientRect().height-30,anchor.top-100))+'px';
    }
  });
  $('color-close').addEventListener('click',()=>$('color-popover').hidden=true);
  document.addEventListener('pointerdown',event=> {
    if (!event.target.closest('#color-popover') && !event.target.closest('#color-open')) $('color-popover').hidden=true;
    if (!event.target.closest('#shape-popover') && !event.target.closest('#shape-open')) {
      $('shape-popover').hidden=true; $('shape-open').setAttribute('aria-expanded','false');
    }
  });
  $('shape-open').addEventListener('click',()=> {
    $('shape-popover').hidden=!$('shape-popover').hidden;
    $('shape-open').setAttribute('aria-expanded',String(!$('shape-popover').hidden));
  });
  document.querySelectorAll('[data-shape]').forEach(button=>button.addEventListener('click',()=> {
    setTool(button.dataset.shape); $('shape-popover').hidden=true; $('shape-open').setAttribute('aria-expanded','false');
  }));
  $('shape-menu-fill').addEventListener('change',()=> {
    config.fill=$('shape-menu-fill').checked; $('shape-fill').checked=config.fill;
  });
  function duplicateObject() {
    if (!editable()) return;
    const before=clone(documentState), found=getObject(), copy=clone(found.object);
    copy.id=id(); copy.x+=24; copy.y+=24; copy.label=(copy.label||'对象')+' 副本';
    found.layer.objects.push(copy); selectedId=copy.id; commit(before);
  }
  function deleteObject() {
    if (!editable()) return;
    const before=clone(documentState), found=getObject();
    found.layer.objects=found.layer.objects.filter(o=>o.id!==selectedId);
    selectedId=null; commit(before);
  }
  $('duplicate-object').addEventListener('click',duplicateObject);
  $('delete-object').addEventListener('click',deleteObject);
  $('clear-selection').addEventListener('click',()=>selectObject(null));
  $('add-layer').addEventListener('click',()=> {
    const before=clone(documentState), layer={ id:id(),name:'新图层 '+documentState.layers.length,locked:false,visible:true,objects:[] };
    documentState.layers.push(layer); documentState.activeLayer=layer.id; selectedId=null; commit(before);
  });
  $('layer-name').addEventListener('change',()=> {
    const before=clone(documentState), layer=documentState.layers.find(item=>item.id===documentState.activeLayer);
    layer.name=$('layer-name').value.trim()||'未命名图层'; commit(before);
  });
  for (const [button,offset] of [['layer-up',1],['layer-down',-1]]) $(button).addEventListener('click',()=> {
    const before=clone(documentState), index=documentState.layers.findIndex(layer=>layer.id===documentState.activeLayer);
    if (index+offset<0 || index+offset>=documentState.layers.length) return;
    [documentState.layers[index],documentState.layers[index+offset]]=[documentState.layers[index+offset],documentState.layers[index]];
    commit(before);
  });
  $('agent-demo-add').addEventListener('click',()=> {
    const before=clone(documentState);
    addObject(baseObject('bubbles',754+Math.random()*50,286+Math.random()*35,80,100,'#82a99c','Agent 示例气泡'));
    commit(before); toast('已添加可编辑气泡 · 固定 SVG 演示');
  });
  $('game-mode').addEventListener('change',()=> {
    const enabled=$('game-mode').value!=='free';
    document.body.dataset.game=String(enabled); $('task-banner').hidden=!enabled;
    viewName='draft';
    $('task-banner').querySelector('span').textContent=$('game-mode').value==='guess'?'本轮任务 · 请画出「鲸鱼」让同桌猜一猜':'本轮任务 · 画出在深海夜市喝茶的小鲸鱼';
    render(); fitCanvas();
  });
  $('copy-demo-link').addEventListener('click',async()=> {
    const url=new URL(location.href); url.hash='';
    try { await navigator.clipboard.writeText(url.href); toast('已复制 Demo 链接'); } catch { toast('当前浏览器无法写入剪贴板，请复制地址栏链接'); }
  });
  function toggleFocus() {
    focus=!focus; panelOpen=focus?false:layout==='desktop'&&innerWidth>650;
    document.body.classList.toggle('focus',focus); $('focus-return').hidden=!focus;
    $('focus-toggle').setAttribute('aria-pressed',String(focus)); syncPanels(); fitCanvas();
  }
  $('focus-toggle').addEventListener('click',toggleFocus);
  $('focus-return').addEventListener('click',toggleFocus);
  $('hand-switch').addEventListener('click',()=> {
    hand=hand==='left'?'right':'left'; document.body.dataset.hand=hand;
    $('hand-switch').textContent=hand==='left'?'工具放右侧':'工具放左侧';
    toast(hand==='left'?'工具已移到左侧':'工具已移到右侧');
  });
  function exportNode(state) {
    const root=node('svg',{ xmlns:NS,viewBox:'0 0 1040 720',width:1040,height:720 });
    const defs=$('board').querySelector('defs').cloneNode(true); root.append(defs);
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      const g=node('g');
      for (const object of layer.objects) {
        const element=objectNode(object); element.removeAttribute('data-object'); element.removeAttribute('aria-label'); g.append(element);
      }
      root.append(g);
    }
    return root;
  }
  $('export-svg').addEventListener('click',()=> {
    const svg=new XMLSerializer().serializeToString(exportNode(viewName==='draft'?documentState:sharedState));
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})), link=document.createElement('a');
    link.href=url; link.download='tea-drawing-demo.svg'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('已导出可编辑 SVG');
  });
  $('submit-open').addEventListener('click',()=> {
    $('submit-preview').replaceChildren(exportNode(documentState)); $('submit-dialog').showModal();
  });
  $('submit-confirm').addEventListener('click',()=> {
    pendingSubmission={name:$('artwork-name').value.trim()||'我的茶绘作品',document:clone(documentState)};
    $('submit-dialog').close(); render(); persist();
    toast('作品已提交 · 等待演示房主审核'); openPanel('room');
  });
  $('simulate-approve').addEventListener('click',()=> {
    if (!pendingSubmission) return;
    sharedState=clone(pendingSubmission.document); sharedName=pendingSubmission.name; pendingSubmission=null;
    render(); persist(); toast('已模拟审核通过，可切换全场画布查看');
  });
  $('research-open').addEventListener('click',()=>$('research-dialog').showModal());
  $('design-open').addEventListener('click',()=>$('design-dialog').showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.closeDialog).close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=> {
    if (event.target!==dialog) return;
    const bounds=dialog.getBoundingClientRect();
    if (event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom) dialog.close();
  }));
  document.addEventListener('keydown',event=> {
    if (event.key==='Escape') { selectedId=null; $('color-popover').hidden=true; renderSelection(); return; }
    if (document.querySelector('dialog[open]') || ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    const key=event.key.toLowerCase(), control=event.ctrlKey||event.metaKey;
    if (control&&key==='z') { event.preventDefault(); event.shiftKey?redo():undo(); }
    else if (control&&key==='y') { event.preventDefault(); redo(); }
    else if (control&&key==='d') { event.preventDefault(); duplicateObject(); }
    else if (event.key==='Delete'||event.key==='Backspace') { event.preventDefault(); deleteObject(); }
    else if (event.code==='Space') { event.preventDefault(); space=true; updateSettings(); }
    else if (!control) {
      const shortcuts={v:'select',b:'brush',e:'erase',r:'rect',o:'ellipse',l:'line',h:'pan'};
      if (shortcuts[key] && viewName==='draft') setTool(shortcuts[key]);
      if (key==='f') toggleFocus();
    }
  });
  document.addEventListener('keyup',event=>{ if(event.code==='Space'){space=false;updateSettings();} });
  window.addEventListener('blur',()=>{space=false;updateSettings();});
  window.addEventListener('resize',()=>{ if(innerWidth<=650&&panelOpen&&layout==='desktop')panelOpen=false;syncPanels();fitCanvas(); });
  window.addEventListener('beforeunload',()=> {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,draft:documentState,shared:sharedState,pending:pendingSubmission,sharedName})); } catch {}
  });
  setLayout(layout);
  render();
  persist();
  $('focus-toggle').title='专注画布 F';
  const shortcutParagraph=$('design-dialog').querySelector('.shortcut-sheet p:last-child');
  shortcutParagraph.textContent=shortcutParagraph.textContent.replace('Tab','F');
})();
