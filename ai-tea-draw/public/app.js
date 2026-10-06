'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const svgLimit = 256 * 1024;
  const authorColors = ['#91a879', '#c49b7c', '#86a4af', '#ab91b2', '#d0b774', '#82ada0', '#b18b85', '#8d98b2'];
  let state = null;
  let socket = null;
  let reconnectTimer = null;
  let refreshPromise = null;
  let refreshAgain = false;
  let pendingOperations = 0;
  let selectedObject = null;
  let editingObject = null;
  let previewUrl = null;
  let canvasUrl = null;
  let canonicalDraft = null;
  let canvasSignature = null;
  let canvasRequest = 0;
  let regionSignature = null;
  let viewportReady = false;
  let zoom = 1;
  let fitZoom = 1;
  let panX = 0;
  let panY = 0;
  let baseWidth = 1000;
  let baseHeight = 562.5;
  let pointer = null;
  let shuttingDown = false;
  const imageUrls = new Set();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function svgUrl(svg) {
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }

  function safeImage(svg, className, description) {
    const img = el('img', className);
    img.alt = description;
    img.draggable = false;
    if (typeof svg === 'string' && svg.length <= svgLimit * 2) {
      const url = svgUrl(svg);
      imageUrls.add(url);
      img.src = url;
    }
    return img;
  }

  function revokeListImages() {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls.clear();
  }

  function toast(message, error = false) {
    const node = el('div', `toast${error ? ' error' : ''}`, message);
    $('toast-stack').append(node);
    setTimeout(() => node.remove(), error ? 6500 : 3700);
  }

  function errorText(error) {
    return error?.message || '操作暂时没有完成，请稍后再试。';
  }

  async function api(path, init = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
      cache: 'no-store'
    });
    let value;
    try { value = await response.json(); }
    catch { throw new Error('画室服务返回了无法读取的结果。'); }
    if (!response.ok || value.ok === false) {
      const error = new Error(value.error?.message || `画室服务暂时不可用（${response.status}）。`);
      error.code = value.error?.code;
      error.details = value.error?.details;
      throw error;
    }
    return value.ok === true && Object.prototype.hasOwnProperty.call(value, 'result') ? value.result : value;
  }

  async function command(name, args = {}) {
    return api('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), name, args })
    });
  }

  async function perform(button, operation, successMessage) {
    if (button?.dataset.busy === 'true') return;
    if (button) {
      button.dataset.busy = 'true';
      button.disabled = true;
    }
    pendingOperations += 1;
    try {
      const result = await operation();
      if (successMessage) toast(successMessage);
      await refresh();
      return result;
    } catch (error) {
      toast(errorText(error), true);
      throw error;
    } finally {
      pendingOperations -= 1;
      if (button) {
        delete button.dataset.busy;
        button.disabled = false;
      }
      updateButtons();
    }
  }

  async function refresh() {
    if (refreshPromise) { refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      do {
        refreshAgain = false;
        state = await api('/api/state');
        render();
      } while (refreshAgain);
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function members() { return state?.room?.members || []; }
  function selfId() { return state?.self?.id; }
  function host() { return !!(state?.self?.isHost || (selfId() && state?.room?.hostId === selfId())); }
  function inRoom() { return !!state?.room?.code; }
  function objects() { return state?.scene?.objects || []; }
  function proposals() { return state?.proposals || []; }
  function authorName(id) {
    if (id === selfId()) return state?.self?.name || '我';
    return members().find(member => member.id === id)?.name || '画室伙伴';
  }
  function authorInitial(name) { return Array.from(name || '友')[0]; }
  function authorColor(id) {
    const index = Math.max(0, members().findIndex(member => member.id === id));
    return authorColors[index % authorColors.length];
  }
  function myRegion() {
    return state?.quota?.region || members().find(member => member.id === selfId())?.region || state?.self?.region || null;
  }

  function render() {
    if(state?.game){location.replace('/studio.html'+location.hash);return;}
    if(!$('studio-entry')){const link=el('a','button outlined','游戏与绘图');link.id='studio-entry';link.href='/studio.html'+location.hash;document.querySelector('.top-actions').prepend(link);}
    const active = inRoom();
    const room = state?.room;
    $('connection-dot').className = 'connection-dot online';
    const roomTitle = room?.name || room?.theme || (active ? '一起画点什么' : '灵感，慢慢来。');
    $('session-label').textContent = active ? `${roomTitle} · ${members().length} 位伙伴` : '本机画室已准备好';
    $('mode-label').textContent = state?.connection?.mode === 'mock' ? '本机演练' : 'Steam 联机';
    $('room-heading').textContent = roomTitle;
    $('room-subtitle').textContent = active ? '每个人的灵感，都在这里留下一笔。' : '带上你的 AI，在一张画布上相遇。';
    $('room-details').hidden = !active;
    $('room-controls').hidden = !active;
    $('welcome-overlay').hidden = active;
    $('freeze-button').hidden = !host();
    $('freeze-button').textContent = room?.frozen ? '恢复投稿' : '暂停投稿';
    $('policy-label').textContent = room?.frozen ? '已暂停投稿' : room?.policy === 'trusted' ? '熟人自由绘' : '先审后发';
    $('policy-label').className = `pill${room?.frozen ? ' paused' : ''}`;
    $('revision-label').textContent = `已确认 ${state?.scene?.revision || 0}`;
    $('people-count').textContent = members().length;
    $('layers-count').textContent = objects().length;
    $('canvas-dimensions').textContent = `${state?.scene?.width || 4096} × ${state?.scene?.height || 2304}`;
    $('canvas-lock').hidden = !room?.frozen;
    $('save-label').textContent = active ? `已同步 · 版本 ${state?.scene?.revision || 0}` : '本机服务已就绪';
    $('canvas-empty').hidden = objects().some(object => !object.hidden);
    const trusted = room?.policy === 'trusted';
    $('submission-note').textContent = trusted ? '首稿由房主审核；之后按房规在自己的区域发布。' : '你的提案只会先被你和房主看见。';
    $('submit-button').textContent = trusted ? '提交作品 →' : '提交审核 →';
    $('guide-invite-button').disabled = !state?.invite;
    renderPeople();
    revokeListImages();
    renderLayers();
    renderProposals();
    renderRegion();
    updateButtons();
    updateCanvas();
  }

  function updateButtons() {
    $('invite-button').disabled = !state?.invite || $('invite-button').dataset.busy === 'true';
    $('export-button').disabled = !state?.scene || $('export-button').dataset.busy === 'true';
    $('submit-button').disabled = !inRoom() || !canonicalDraft || !!state?.room?.frozen || $('submit-button').dataset.busy === 'true';
    $('preview-button').disabled = !inRoom() || $('preview-button').dataset.busy === 'true';
  }

  function renderPeople() {
    const list = $('people-list');
    list.replaceChildren();
    if (!members().length) { list.append(el('li', 'empty-small', '建一间画室，或接受朋友的邀请。')); return; }
    for (const member of members()) {
      const row = el('li', 'person');
      const avatar = el('span', 'avatar', authorInitial(member.name));
      const info = el('div', 'person-info');
      const name = el('div', 'person-name', member.name || '画室伙伴');
      if (member.id === selfId()) name.append(el('span', 'person-tag', '你'));
      info.append(name, el('div', 'person-description', member.connected === false ? '暂时离线 · 作品保留' : member.isHost || member.id === state.room.hostId ? '房主 · 照看画室' : '带着自己的 AI'));
      const presence = el('span', 'person-presence');
      if (member.connected === false) presence.style.background = '#c1c6b6';
      row.append(avatar, info, presence);
      list.append(row);
    }
  }

  function renderLayers() {
    const list = $('layers-list');
    list.replaceChildren();
    if (!objects().length) { list.append(el('li', 'empty-small', '第一笔，还在想象中。')); return; }
    for (const object of objects().slice().reverse()) {
      const row = el('li', `layer${object.id === selectedObject ? ' selected' : ''}${object.hidden ? ' hidden-layer' : ''}`);
      row.tabIndex = 0;
      row.setAttribute('aria-label', `${object.name || '未命名作品'}，${authorName(object.authorId)}`);
      const info = el('div', 'layer-info');
      info.append(el('div', 'layer-name', object.name || '未命名作品'), el('div', 'layer-author', `${authorName(object.authorId)} · v${object.revision || 1}`));
      row.append(safeImage(object.svg, 'layer-thumb', object.name || '作品缩略图'), info);
      const select = () => {
        selectedObject = object.id;
        $('selection-label').textContent = `${object.name || '未命名作品'} · ${authorName(object.authorId)} · v${object.revision || 1}`;
        for (const sibling of list.children) sibling.classList.toggle('selected', sibling === row);
      };
      row.addEventListener('click', select);
      row.addEventListener('keydown', event => { if (event.key === 'Enter') select(); });
      if (object.authorId === selfId()) {
        const edit = el('button', 'layer-action', '✎');
        edit.title = '修改这块作品';
        edit.setAttribute('aria-label', `修改 ${object.name || '这块作品'}`);
        edit.addEventListener('click', event => { event.stopPropagation(); beginEdit(object); });
        const undo = el('button', 'layer-action', '↶');
        undo.title = '撤回本次贡献';
        undo.setAttribute('aria-label', `撤回 ${object.name || '这块作品'}`);
        undo.addEventListener('click', event => {
          event.stopPropagation();
          perform(undo, () => command('scene.undo', { objectId: object.id, baseRevision: object.revision }), '已撤回本次贡献').catch(() => {});
        });
        row.append(edit, undo);
      }
      if (host()) {
        const visibility = el('button', 'layer-action', object.hidden ? '◌' : '◉');
        visibility.title = object.hidden ? '恢复显示' : '在公共画布隐藏';
        visibility.setAttribute('aria-label', `${object.hidden ? '显示' : '隐藏'} ${object.name || '这块作品'}`);
        visibility.addEventListener('click', event => {
          event.stopPropagation();
          perform(visibility, () => command('scene.hide', { objectId: object.id, hidden: !object.hidden }), object.hidden ? '作品已恢复显示' : '作品已隐藏').catch(() => {});
        });
        row.append(visibility);
      }
      list.append(row);
    }
  }

  function beginEdit(object) {
    editingObject = { id: object.id, revision: object.revision };
    $('draft-name').value = object.name || '';
    $('draft-svg').value = object.svg || '';
    $('svg-editor').open = true;
    $('draft-x').value = object.x;
    $('draft-y').value = object.y;
    $('draft-width').value = object.width;
    $('draft-height').value = object.height;
    $('placement-summary').textContent = `修改作品 v${object.revision}`;
    invalidatePreview();
    selectWorkspaceTab('draft');
    $('draft-name').focus();
    toast('正在修改自己的作品；提交后会检查当前版本。');
  }

  function renderProposals() {
    const own = proposals().filter(proposal => proposal.authorId === selfId());
    $('own-proposal-count').textContent = own.length;
    const ownList = $('own-proposal-list');
    ownList.replaceChildren();
    if (!own.length) ownList.append(el('p', 'empty-small', '提交后的进度会出现在这里。'));
    const labels = { pending: '等待审核', accepted: '已上画布', rejected: '已退回', stale: '版本已变化', cancelled: '已取消' };
    for (const proposal of own.slice().reverse().slice(0, 12)) {
      const row = el('div', 'own-proposal');
      const name = el('span', 'own-proposal-name', proposal.name || '未命名作品');
      if (proposal.reason) name.title = proposal.reason;
      row.append(name, el('span', `status-badge ${proposal.status}`, labels[proposal.status] || proposal.status));
      ownList.append(row);
    }
    const pending = proposals().filter(proposal => proposal.status === 'pending' && (host() || proposal.authorId === selfId()));
    $('review-count').textContent = pending.length;
    $('review-heading').textContent = host() ? '待审作品' : '我的待审作品';
    $('review-description').textContent = host() ? '看看每一份新灵感，让合适的作品上画布。' : '房主通过后，这些作品才会出现在大家的画布上。';
    const reviewList = $('review-list');
    reviewList.replaceChildren();
    if (!pending.length) {
      const empty = el('div', 'review-empty');
      empty.append(el('span', '', '✓'), el('h3', '', '桌上暂时没有待审稿'), el('p', '', '新提案来了，会出现在这里。'));
      reviewList.append(empty);
      return;
    }
    for (const proposal of pending) {
      const card = el('article', 'review-card');
      if (proposal.svg) card.append(safeImage(proposal.svg, 'review-image', `${proposal.name || '作品'}的待审预览`));
      const content = el('div', 'review-content');
      content.append(el('h3', '', proposal.name || '未命名作品'));
      const placement = Number.isFinite(proposal.width) ? ` · ${proposal.width} × ${proposal.height}` : '';
      content.append(el('p', 'review-meta', `${authorName(proposal.authorId)}${placement}${proposal.objectId ? ' · 修改作品' : ' · 新作品'}`));
      if (host()) {
        const reason = el('input', 'review-reason');
        reason.placeholder = '给创作者一句修改建议';
        reason.maxLength = 240;
        reason.setAttribute('aria-label', '退回原因');
        const actions = el('div', 'review-actions');
        const reject = el('button', 'button outlined', '退回');
        const approve = el('button', 'button primary', '通过上图');
        reject.addEventListener('click', () => {
          if (!card.classList.contains('rejecting')) { card.classList.add('rejecting'); reject.textContent = '确认退回'; reason.focus(); return; }
          perform(reject, () => command('proposal.reject', { proposalId: proposal.id, reason: reason.value.trim() || '请按房规调整后重新提交。' }), '已退回，作者会收到建议').catch(() => {});
        });
        approve.addEventListener('click', () => perform(approve, () => command('proposal.approve', { proposalId: proposal.id, hash: proposal.hash }), '作品已通过，正在与伙伴同步').catch(() => {}));
        actions.append(reject, approve);
        content.append(reason, actions);
      } else content.append(el('p', 'review-meta', '等待房主审核'));
      card.append(content);
      reviewList.append(card);
    }
  }

  function renderRegion() {
    const region = myRegion();
    $('region-label').textContent = region ? `${Math.round(region.width)} × ${Math.round(region.height)} · 起点 ${Math.round(region.x)}, ${Math.round(region.y)}` : inRoom() ? '读取分配区域中…' : '加入画室后分配';
    const nextSignature = region ? JSON.stringify(region) : null;
    if (region && nextSignature !== regionSignature && !editingObject) {
      const padding = Math.min(48, Math.floor(Math.min(region.width, region.height) / 15));
      $('draft-x').value = Math.round(region.x + padding);
      $('draft-y').value = Math.round(region.y + padding);
      $('draft-width').value = Math.round(region.width - padding * 2);
      $('draft-height').value = Math.round(region.height - padding * 2);
      regionSignature = nextSignature;
    }
  }

  async function updateCanvas() {
    const scene = state?.scene;
    const width = scene?.width || 4096;
    const height = scene?.height || 2304;
    const newBaseHeight = 1000 * height / width;
    if (baseHeight !== newBaseHeight || !viewportReady) {
      baseWidth = 1000;
      baseHeight = newBaseHeight;
      $('canvas-plane').style.width = `${baseWidth}px`;
      $('canvas-plane').style.height = `${baseHeight}px`;
      fitCanvas();
      viewportReady = true;
    }
    const signature = `${state?.room?.epoch || 'offline'}:${scene?.revision || 0}:${objects().length}`;
    if (signature === canvasSignature) return;
    canvasSignature = signature;
    if (!scene) return;
    const request = ++canvasRequest;
    try {
      const response = await fetch('/api/canvas', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('共享画布暂时没有加载成功。');
      const svg = await response.text();
      if (request !== canvasRequest) return;
      const nextUrl = svgUrl(svg);
      const oldUrl = canvasUrl;
      canvasUrl = nextUrl;
      $('canvas-image').src = nextUrl;
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    } catch (error) {
      canvasSignature = null;
      $('save-label').textContent = '画布加载中，请稍后重试';
      console.warn(errorText(error));
    }
  }

  function applyTransform() {
    $('canvas-plane').style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    $('zoom-value').textContent = `${Math.round(zoom / fitZoom * 100)}%`;
  }

  function fitCanvas() {
    const rect = $('canvas-viewport').getBoundingClientRect();
    const margin = rect.width < 500 ? 22 : 40;
    fitZoom = Math.max(.05, Math.min((rect.width - margin * 2) / baseWidth, (rect.height - margin * 2) / baseHeight));
    zoom = fitZoom;
    panX = (rect.width - baseWidth * zoom) / 2;
    panY = (rect.height - baseHeight * zoom) / 2;
    applyTransform();
  }

  function changeZoom(factor, clientX, clientY) {
    const rect = $('canvas-viewport').getBoundingClientRect();
    const x = (clientX ?? (rect.left + rect.width / 2)) - rect.left;
    const y = (clientY ?? (rect.top + rect.height / 2)) - rect.top;
    const next = Math.max(fitZoom * .3, Math.min(fitZoom * 12, zoom * factor));
    const relativeX = (x - panX) / zoom;
    const relativeY = (y - panY) / zoom;
    panX = x - relativeX * next;
    panY = y - relativeY * next;
    zoom = next;
    applyTransform();
  }

  function draftMessage(message, error = false) {
    const node = $('draft-message');
    node.textContent = message;
    node.className = `draft-message${error ? ' error' : ''}`;
    node.hidden = !message;
  }

  function invalidatePreview() {
    canonicalDraft = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    $('draft-preview-image').removeAttribute('src');
    $('draft-preview').hidden = true;
    draftMessage('');
    updateButtons();
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > svgLimit) { draftMessage('这份 SVG 超过 256 KiB，请让 Agent 简化路径或拆成更小的作品。', true); return; }
    $('draft-svg').value = await file.text();
    if (!$('draft-name').value.trim()) $('draft-name').value = file.name.replace(/\.svg$/i, '').slice(0, 80);
    $('upload-box').querySelector('strong').textContent = file.name;
    $('svg-editor').open = true;
    invalidatePreview();
  }

  async function validateDraft() {
    const svg = $('draft-svg').value;
    if (!svg.trim()) throw new Error('先上传一份 SVG，或把源码粘贴到输入框。');
    if (new TextEncoder().encode(svg).byteLength > svgLimit) throw new Error('SVG 超过 256 KiB，请先简化作品。');
    const source = svg;
    const result = await command('draft.validate', { svg });
    const canonical = result.svg || result.canonicalSvg || result.normalizedSvg;
    if (typeof canonical !== 'string') throw new Error('检查结果没有安全预览，请确认服务版本。');
    if ($('draft-svg').value !== source) throw new Error('检查期间作品已修改，请重新预览。');
    canonicalDraft = { source, svg: canonical, hash: result.hash, stats: result.stats };
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = svgUrl(canonical);
    $('draft-preview-image').src = previewUrl;
    $('draft-preview').hidden = false;
    const count = result.stats?.elements || result.stats?.nodes;
    draftMessage(`结构检查通过${count ? ` · ${count} 个元素` : ''}。确认预览后，即可提交到画室。`);
    updateButtons();
    return result;
  }

  function selectWorkspaceTab(tab) {
    document.querySelectorAll('[data-workspace-tab]').forEach(button => {
      const active = button.dataset.workspaceTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $('draft-panel').hidden = tab !== 'draft';
    $('review-panel').hidden = tab !== 'review';
  }

  async function copyInvite() {
    if (!state?.invite) { toast('先开一间画室，再邀请朋友。', true); return; }
    const guide = state.onboarding?.guideUrl;
    const invitation = guide ? `按照这份 AI 茶绘接入指引 ${guide}，校验安装并加入房间 ${state.invite}，打开画布，读取房规后等我安排。` : `帮我加入这个 AI 茶绘房间：${state.invite}。使用已取得的 AI 茶绘程序和包内 AGENT-START.md 完成本机准备并打开画布，加入后等我安排。`;
    try {
      await navigator.clipboard.writeText(invitation);
      toast('Agent 邀请已复制，发给朋友就好。');
    } catch {
      const area = el('textarea');
      area.value = invitation;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      toast(copied ? 'Agent 邀请已复制，发给朋友就好。' : '浏览器没有允许复制，请从 CLI 获取完整邀请。', !copied);
    }
  }

  function connectEvents() {
    if (shuttingDown) return;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/events?token=${encodeURIComponent(token)}`);
    socket.addEventListener('open', () => {
      $('connection-dot').className = 'connection-dot online';
      refresh().catch(error => toast(errorText(error), true));
    });
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string' || event.data.length > 18 * 1024 * 1024) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'error' || message.type === 'fault') toast(message.error?.message || message.message || '联机连接暂时中断。', true);
        refresh().catch(error => console.warn(errorText(error)));
      } catch { /* Invalid events cannot replace authenticated room state. */ }
    });
    socket.addEventListener('close', () => {
      if (shuttingDown) return;
      $('connection-dot').className = 'connection-dot error';
      $('save-label').textContent = '本机连接中断，正在重连…';
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectEvents, 1800);
    });
    socket.addEventListener('error', () => {});
  }

  function showFatal(message) {
    const overlay = el('div', 'fatal-error');
    const content = el('div', 'fatal-error-content');
    content.append(el('h2', '', '画室还没有连接上'), el('p', '', message));
    const reload = el('button', 'button primary', '重新连接');
    reload.addEventListener('click', () => location.reload());
    content.append(reload);
    overlay.append(content);
    document.body.append(overlay);
    $('connection-dot').className = 'connection-dot error';
    $('session-label').textContent = '等待本机连接';
  }

  $('create-form').addEventListener('submit', event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    perform(button, async () => {
      const name = $('create-name').value.trim() || '画画的朋友';
      await command('session.name', { name });
      return command('room.create', { name: $('room-name').value.trim() || '一起画点什么', policy: $('room-policy').value, maxMembers: Number($('room-members').value) });
    }, '画室开好了，把邀请交给朋友吧。').catch(() => {});
  });
  $('join-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('join-invite').value.trim();
    const invite = text.match(/tea:\/\/join\/[A-Za-z0-9_-]+/)?.[0] || text.match(/https:\/\/[^\s。；，]+/)?.[0] || text;
    if (!invite) { toast('请粘贴朋友的完整邀请。', true); return; }
    const button = event.currentTarget.querySelector('[type="submit"]');
    perform(button, () => command('room.join', { invite, name: $('join-name').value.trim() || '画画的朋友' }), '已加入，一起画点什么。').catch(() => {});
  });
  document.querySelectorAll('[data-welcome-tab]').forEach(button => button.addEventListener('click', () => {
    const tab = button.dataset.welcomeTab;
    document.querySelectorAll('[data-welcome-tab]').forEach(other => {
      other.classList.toggle('active', other === button);
      other.setAttribute('aria-selected', String(other === button));
    });
    $('create-form').hidden = tab !== 'create';
    $('join-form').hidden = tab !== 'join';
  }));
  $('room-policy').addEventListener('change', () => {
    $('policy-hint').textContent = $('room-policy').value === 'trusted' ? '每人的首稿审核；之后在授权区域内通过规则即可发布。' : '每份作品先由房主看一眼，再一起上画布。';
  });
  document.querySelectorAll('[data-workspace-tab]').forEach(button => button.addEventListener('click', () => selectWorkspaceTab(button.dataset.workspaceTab)));
  $('preview-button').addEventListener('click', () => perform($('preview-button'), validateDraft).catch(error => draftMessage(errorText(error), true)));
  $('draft-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!canonicalDraft || canonicalDraft.source !== $('draft-svg').value) { draftMessage('作品已变化，请先检查与预览。', true); return; }
    const args = {
      svg: canonicalDraft.svg,
      name: $('draft-name').value.trim() || '未命名作品',
      x: Number($('draft-x').value), y: Number($('draft-y').value),
      width: Number($('draft-width').value), height: Number($('draft-height').value)
    };
    if (editingObject) Object.assign(args, { objectId: editingObject.id, baseRevision: editingObject.revision });
    perform($('submit-button'), async () => {
      const result = await command('proposal.submit', args);
      const status = result.status || result.proposal?.status;
      draftMessage(status === 'accepted' ? '作品已上画布，正在与伙伴同步。' : '提案已提交，等待房主审核。审核通过后才会上画布。');
      editingObject = null;
      $('placement-summary').textContent = '放入我的区域';
      return result;
    }).catch(error => draftMessage(errorText(error), true));
  });
  $('draft-svg').addEventListener('input', invalidatePreview);
  $('clear-preview').addEventListener('click', invalidatePreview);
  $('choose-file').addEventListener('click', () => $('svg-file').click());
  $('svg-file').addEventListener('change', () => loadFile($('svg-file').files[0]).catch(error => draftMessage(errorText(error), true)));
  const uploadBox = $('upload-box');
  uploadBox.addEventListener('dragover', event => { event.preventDefault(); uploadBox.classList.add('drag-over'); });
  uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('drag-over'));
  uploadBox.addEventListener('drop', event => { event.preventDefault(); uploadBox.classList.remove('drag-over'); loadFile(event.dataTransfer.files[0]).catch(error => draftMessage(errorText(error), true)); });
  $('invite-button').addEventListener('click', copyInvite);
  $('guide-invite-button').addEventListener('click', copyInvite);
  $('export-button').addEventListener('click', () => perform($('export-button'), async () => {
    const result = await command('scene.export');
    const svg = typeof result === 'string' ? result : result.svg;
    if (typeof svg !== 'string') throw new Error('导出结果中没有作品文件。');
    const url = svgUrl(svg);
    const link = el('a');
    link.href = url;
    const name = (state?.room?.name || 'AI茶绘').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60);
    link.download = `${name}-v${state?.scene?.revision || 0}.svg`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, '已导出可编辑 SVG').catch(() => {}));
  $('leave-button').addEventListener('click', () => perform($('leave-button'), async () => {
    const result = await command('room.leave');
    editingObject = null;
    regionSignature = null;
    canvasSignature = null;
    return result;
  }, '已离开画室，草稿仍留在页面里。').catch(() => {}));
  $('freeze-button').addEventListener('click', () => perform($('freeze-button'), () => command('room.freeze', { frozen: !state?.room?.frozen }), state?.room?.frozen ? '投稿已恢复' : '画室已暂停投稿').catch(() => {}));
  $('guide-button').addEventListener('click', () => $('guide-dialog').showModal());
  $('close-guide').addEventListener('click', () => $('guide-dialog').close());
  $('guide-dialog').addEventListener('click', event => { if (event.target === $('guide-dialog')) $('guide-dialog').close(); });
  const drawerBackdrop = el('button', 'drawer-backdrop');
  drawerBackdrop.setAttribute('aria-label', '关闭画室信息');
  drawerBackdrop.tabIndex = -1;
  document.body.append(drawerBackdrop);
  function toggleDrawer(open) {
    $('room-drawer').classList.toggle('drawer-open', open);
    drawerBackdrop.classList.toggle('open', open);
    $('open-room-drawer').setAttribute('aria-expanded', String(open));
    if (open) $('close-room-drawer').focus();
    else $('open-room-drawer').focus();
  }
  $('open-room-drawer').addEventListener('click', () => toggleDrawer(true));
  $('close-room-drawer').addEventListener('click', () => toggleDrawer(false));
  drawerBackdrop.addEventListener('click', () => toggleDrawer(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('room-drawer').classList.contains('drawer-open')) toggleDrawer(false); });
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); fitCanvas(); });
  $('zoom-in').addEventListener('click', () => changeZoom(1.2));
  $('zoom-out').addEventListener('click', () => changeZoom(1 / 1.2));
  $('fit-button').addEventListener('click', fitCanvas);
  const viewport = $('canvas-viewport');
  viewport.addEventListener('wheel', event => { event.preventDefault(); changeZoom(Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    panX = pointer.panX + event.clientX - pointer.x;
    panY = pointer.panY + event.clientY - pointer.y;
    applyTransform();
  });
  function endPointer() { pointer = null; viewport.classList.remove('dragging'); }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('keydown', event => {
    if (event.key === '+' || event.key === '=') changeZoom(1.2);
    else if (event.key === '-') changeZoom(1 / 1.2);
    else if (event.key === '0') fitCanvas();
    else return;
    event.preventDefault();
  });
  new ResizeObserver(() => { if (viewportReady) fitCanvas(); }).observe(viewport);
  window.addEventListener('beforeunload', () => {
    shuttingDown = true;
    clearTimeout(reconnectTimer);
    socket?.close();
    revokeListImages();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (canvasUrl) URL.revokeObjectURL(canvasUrl);
  });

  if (!token) {
    showFatal('请从茶绘启动器或 Agent 返回的本机画布链接进入。链接中的会话凭据用于连接你自己的画室。');
  } else {
    refresh().then(() => {
      const name = state?.self?.name || '';
      $('create-name').value = name;
      $('join-name').value = name;
      connectEvents();
    }).catch(error => showFatal(errorText(error)));
  }
})();
