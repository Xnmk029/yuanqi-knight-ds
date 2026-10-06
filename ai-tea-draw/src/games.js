'use strict';

// Host-owned, synchronous game state. Only view/getTask/replay are wire DTOs.
// A transport must never serialize this object to a participant directly.
const { randomUUID, randomInt, createHash } = require('node:crypto');

const SCHEMA = 2;
const FEATURE = 'tea-games-v1';
const MAX_ASSET_BYTES = 512 * 1024;
const MAX_GAME_BYTES = 24 * 1024 * 1024;
const WORD_PACK_VERSION = 'tea-zh-basic-1';
const WORDS = [
  ['雨伞', ['伞']], ['自行车', ['脚踏车', '单车', '腳踏車', '單車', '自行車']],
  ['章鱼', ['章魚', '八爪鱼', '八爪魚']], ['月亮', ['月球']], ['西瓜', []],
  ['机器人', ['機器人']], ['猫', ['小猫', '小貓', '貓']], ['鲸鱼', ['鯨魚', '鲸', '鯨']],
  ['飞机', ['飛機']], ['火车', ['火車']], ['汽车', ['汽車']], ['雪人', []],
  ['火山', []], ['灯塔', ['燈塔']], ['蛋糕', []], ['太阳', ['太陽']],
  ['蝴蝶', []], ['蘑菇', []], ['风筝', ['風箏']], ['气球', ['氣球']],
  ['菠萝', ['鳳梨', '凤梨', '菠蘿']], ['香蕉', []], ['草莓', []], ['苹果', ['蘋果']],
  ['树', ['大树', '樹', '大樹']], ['房子', ['房屋']], ['轮船', ['船', '輪船']],
  ['眼镜', ['眼鏡']], ['手表', ['腕表', '手錶']], ['铅笔', ['鉛筆']],
  ['书', ['书本', '書', '書本']], ['书包', ['書包']], ['鞋子', ['鞋']],
  ['帽子', ['帽']], ['兔子', ['兔']], ['长颈鹿', ['長頸鹿']], ['大象', ['象']],
  ['熊猫', ['熊貓', '大熊猫', '大熊貓']], ['螃蟹', ['蟹']], ['乌龟', ['烏龜', '海龟', '海龜']],
  ['吉他', []], ['钢琴', ['鋼琴']], ['足球', []], ['篮球', ['籃球']],
  ['雪花', []], ['彩虹', []], ['城堡', []], ['桥', ['橋', '桥梁', '橋樑']],
  ['冰淇淋', ['冰激凌', '雪糕']], ['汉堡', ['漢堡', '汉堡包', '漢堡包']],
  ['披萨', ['披薩', '比萨', '比薩']], ['茶壶', ['茶壺']], ['杯子', ['杯']],
  ['钥匙', ['鑰匙']], ['剪刀', []], ['信封', []], ['蜗牛', ['蝸牛']],
  ['企鹅', ['企鵝']], ['蜜蜂', []], ['钟', ['时钟', '鐘', '時鐘']],
].map(([answer, aliases], index) => ({ id: `w${index + 1}`, answer, aliases, difficulty: 'easy' }));

const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const uid = prefix => `${prefix}_${randomUUID()}`;
function fail(code, message = code) { throw Object.assign(new Error(message), { code }); }
function nowOf(ctx) { const now = ctx?.now ?? Date.now(); if (!Number.isFinite(now) || now < 0) fail('INVALID_TIME'); return now; }
function cleanName(value) { return String(value ?? '画友').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80); }
function plainText(value, maximum = 80) {
  if (typeof value !== 'string') fail('TEXT_REQUIRED', '请提交纯文本。');
  const text = value.trim();
  if (!text || Array.from(text).length > maximum || /[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text)) fail('TEXT_FORMAT', '文字为空、过长或含不允许的控制符。');
  return text;
}
function integer(value, fallback, min, max, label) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) fail('INVALID_GAME_RULES', `${label}超出范围。`);
  return result;
}
function duration(options, name, fallback) { return integer(options[name], fallback, 1000, 600000, name); }
function normalizeGuess(value) {
  if (typeof value !== 'string') fail('GUESS_FORMAT', '每次只能提交一个词。');
  const raw = value.trim();
  if (!raw || Array.from(raw).length > 40 || /[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(raw)) fail('GUESS_FORMAT', '每次只能提交一个不超过40字的词。');
  const text = raw.normalize('NFKC').toLowerCase().trim();
  if (/[,，、;；|\/\\\[\]{}<>\n\r]/u.test(text)) fail('GUESS_FORMAT', '不接受候选词列表。');
  const normalized = text.replace(/^[\s.!?。！？"'“”‘’]+|[\s.!?。！？"'“”‘’]+$/gu, '').replace(/\s+/gu, ' ');
  if (!normalized) fail('GUESS_FORMAT');
  return normalized;
}

function makePack(options) {
  if (options.words === undefined) return { version: WORD_PACK_VERSION, words: copy(WORDS) };
  if (!Array.isArray(options.words) || options.words.length < 3 || options.words.length > 512) fail('INVALID_WORD_PACK');
  const globalAliases = new Map();
  const words = options.words.map((word, index) => {
    if (!word || typeof word !== 'object' || !Array.isArray(word.aliases || [])) fail('INVALID_WORD_PACK');
    const answer = plainText(word.answer, 40), aliases = (word.aliases || []).map(alias => plainText(alias, 40));
    if (aliases.length > 16) fail('INVALID_WORD_PACK');
    for (const alias of [answer, ...aliases]) {
      const normalized = normalizeGuess(alias);
      if (globalAliases.has(normalized) && globalAliases.get(normalized) !== index) fail('WORD_ALIAS_CONFLICT');
      globalAliases.set(normalized, index);
    }
    return { id: `custom${index + 1}`, answer, aliases, difficulty: 'custom' };
  });
  return { version: `custom-${digest(words).slice(0, 16)}`, words };
}

function createGame(options = {}, ctx = {}) {
  const now = nowOf(ctx);
  if (!['telephone', 'guess_draw'].includes(options.mode)) fail('INVALID_GAME_MODE');
  const reviewPolicy = options.reviewPolicy || 'moderator-strict';
  if (!['moderator-strict', 'participant-confirm'].includes(reviewPolicy)) fail('INVALID_GAME_POLICY');
  if (typeof ctx.hostId !== 'string' || !ctx.hostId) fail('HOST_REQUIRED');
  const config = {
    checkpoints: integer(options.checkpoints, 3, 1, 3, 'checkpoints'),
    cycles: integer(options.cycles, 1, 1, 2, 'cycles'),
    seedMs: duration(options, 'seedMs', 60000),
    telephoneDrawMs: duration(options, 'telephoneDrawMs', 150000),
    describeMs: duration(options, 'describeMs', 60000),
    selectMs: duration(options, 'selectMs', 20000),
    drawMs: duration(options, 'drawMs', options.checkpoints === 1 ? 120000 : 40000),
    guessMs: duration(options, 'guessMs', options.checkpoints === 1 ? 45000 : 20000),
    reviewMs: duration(options, 'reviewMs', 45000),
    revealMs: duration(options, 'revealMs', 15000),
    maxPauseMs: integer(options.maxPauseMs, 120000, 1000, 600000, 'maxPauseMs'),
    textLimit: integer(options.textLimit, 80, 1, 160, 'textLimit'),
    wordPackVersion: null,
  };
  const pack = makePack(options);
  config.wordPackVersion = pack.version;
  const game = {
    schema: SCHEMA, feature: FEATURE, id: uid('game'), mode: options.mode, reviewPolicy,
    hostId: ctx.hostId, status: 'lobby', createdAt: now, updatedAt: now,
    version: 1, publicVersion: 1, config, rulesHash: digest({ mode: options.mode, reviewPolicy, config }),
    phase: { id: uid('phase'), type: 'lobby', version: 1, startedAt: now, deadlineAt: null },
    players: [], participants: [], practice: false, scores: {},
    _tasks: {}, _submissions: [], _assets: {}, _telephone: null, _guess: null,
    _pack: pack, _dedup: [], _submitReceipts: [], _pause: null, _pauseUsedMs: 0, _assetBytes: 0,
  };
  syncMembers(game, ctx);
  if (!game.players.some(player => player.id === game.hostId)) game.players.unshift({ id: game.hostId, name: '房主', connected: true, ready: false, controlMode: 'assisted', shareSourceAfterReveal: false, connectionEpoch: 1 });
  if (game.players.length > 8) fail('INVALID_CAPACITY');
  return game;
}

function checkGame(game) {
  if (!game || game.schema !== SCHEMA || game.feature !== FEATURE) fail('GAME_SCHEMA');
}
function membersOf(game, ctx) {
  return Array.isArray(ctx.members) ? ctx.members : game.players;
}
function syncMembers(game, ctx) {
  if (!Array.isArray(ctx.members)) return false;
  let changed = false;
  const ids = new Set();
  for (const member of ctx.members) {
    if (!member || typeof member.id !== 'string' || !member.id || member.id.length > 100) fail('INVALID_MEMBER');
    if (ids.has(member.id)) fail('INVALID_MEMBER');
    ids.add(member.id);
    let player = game.players.find(candidate => candidate.id === member.id);
    if (!player) {
      if (game.players.length >= 8) fail('INVALID_CAPACITY');
      player = { id: member.id, name: cleanName(member.name), connected: member.connected !== false, ready: false, controlMode: 'assisted', shareSourceAfterReveal: false, connectionEpoch: 1 };
      game.players.push(player); changed = true;
    } else {
      const connected = member.connected !== false;
      if (player.connected !== connected) {
        player.connected = connected; player.connectionEpoch++; changed = true;
        const task = game._tasks[player.id];
        if (task && !task.submitted) { task.id = uid('task'); task.assignmentEpoch++; }
      }
      const name = cleanName(member.name ?? player.name);
      if (player.name !== name) { player.name = name; changed = true; }
    }
  }
  for (const player of game.players) if (!ids.has(player.id) && player.connected) {
    player.connected = false; player.connectionEpoch++; changed = true;
    const task = game._tasks[player.id];
    if (task && !task.submitted) { task.id = uid('task'); task.assignmentEpoch++; }
  }
  if (changed && game.version > 1) game.publicVersion++;
  return changed;
}
function requireActor(game, actor, ctx, requireConnected = true) {
  const member = membersOf(game, ctx).find(player => player.id === actor);
  if (!member || requireConnected && member.connected === false) fail('NOT_AUTHORIZED', '请以本人的房间身份连接。');
  return game.players.find(player => player.id === actor) || member;
}
function requireAdmin(game, actor, ctx) {
  requireActor(game, actor, ctx);
  if (actor !== game.hostId || ctx.hostId && ctx.hostId !== game.hostId || !ctx.admin) fail('FORBIDDEN', '此操作仅限房主网页。');
}
function connected(game, actor) { return game.players.find(player => player.id === actor)?.connected !== false; }
function setPhase(game, type, now, milliseconds = null) {
  game.phase = { id: uid('phase'), type, version: game.phase.version + 1, startedAt: now, deadlineAt: milliseconds === null ? null : now + milliseconds };
  game._tasks = {};
  game.publicVersion++;
}
function taskFor(game, actor, kind, now, extra = {}) {
  const task = { id: uid('task'), gameId: game.id, phaseId: game.phase.id, phaseVersion: game.phase.version,
    assignmentEpoch: game.players.find(player => player.id === actor)?.connectionEpoch || 1,
    actorId: actor, kind, deadlineAt: game.phase.deadlineAt, createdAt: now, submitted: false, ...extra };
  game._tasks[actor] = task;
  return task;
}
function requireTask(game, actor, args, ctx, kinds) {
  if (game.status === 'paused') fail('GAME_PAUSED');
  if (game.status !== 'active') fail('PHASE_CLOSED');
  if (game.phase.deadlineAt !== null && nowOf(ctx) >= game.phase.deadlineAt) fail('PHASE_CLOSED', '本阶段已截止，请读取新任务。');
  const task = game._tasks[actor];
  if (!task || !kinds.includes(task.kind)) fail('ROLE_FORBIDDEN');
  if (typeof args.taskId !== 'string' || args.taskId !== task.id || typeof args.phaseId !== 'string' || args.phaseId !== game.phase.id) fail('ASSIGNMENT_STALE', '任务或阶段已变化。');
  if (args.gameId !== undefined && args.gameId !== game.id || args.assignmentEpoch !== undefined && args.assignmentEpoch !== task.assignmentEpoch || args.phaseVersion !== undefined && args.phaseVersion !== game.phase.version) fail('ASSIGNMENT_STALE');
  return task;
}

function publicImage(asset) {
  return { id: asset.imageId, mimeType: 'image/png', png: asset.png, width: asset.width, height: asset.height, hash: asset.pngHash };
}
function validateAsset(asset, expected = {}) {
  if (!asset || typeof asset !== 'object') fail('ASSET_REQUIRED', '绘图必须由房主服务先校验并渲染。');
  if (typeof asset.svg !== 'string' || !asset.svg.trim() || Buffer.byteLength(asset.svg) > 256 * 1024) fail('INVALID_ASSET');
  if (typeof asset.png !== 'string' || asset.png.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.png)) fail('INVALID_ASSET');
  const bytes = Buffer.from(asset.png, 'base64');
  if (bytes.toString('base64') !== asset.png || bytes.length < 33 || bytes.length > MAX_ASSET_BYTES || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR') fail('INVALID_ASSET');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || width !== asset.width || height !== asset.height || width < 1 || height < 1 || width > 1024 || height > 1024 || width * height > 1048576) fail('INVALID_ASSET');
  if (asset.svgHash !== digest(asset.svg) || asset.pngHash !== digest(bytes)) fail('ASSET_HASH_MISMATCH');
  if (expected.taskId && asset.taskId !== expected.taskId || expected.phaseId && asset.phaseId !== expected.phaseId) fail('ASSET_TASK_MISMATCH');
  if (expected.revision !== undefined && asset.revision !== expected.revision) fail('STALE_DOCUMENT');
  // Metadata chunks must not smuggle filenames, captions, descriptions or prompts.
  let offset = 8, ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (size > bytes.length - offset - 12) fail('INVALID_ASSET');
    if (['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) fail('ASSET_METADATA_FORBIDDEN');
    offset += size + 12;
    if (type === 'IEND') { if (size !== 0) fail('INVALID_ASSET'); ended = true; break; }
  }
  if (offset !== bytes.length || !ended) fail('INVALID_ASSET');
  return { svg: asset.svg, png: asset.png, svgHash: asset.svgHash, pngHash: asset.pngHash, width, height,
    imageId: uid('image'), ...(asset.revision === undefined ? {} : { revision: asset.revision }), bytes: bytes.length + Buffer.byteLength(asset.svg) };
}
function addAsset(game, asset) {
  if (game._assetBytes + asset.bytes > MAX_GAME_BYTES) fail('GAME_BUDGET');
  game._assetBytes += asset.bytes;
  game._assets[asset.imageId] = asset;
  return asset.imageId;
}
function assetOf(game, holder) { return holder?.assetId ? game._assets[holder.assetId] : null; }
function shuffled(values, ctx) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = typeof ctx.random === 'function' ? Math.floor(Math.max(0, Math.min(0.999999999, ctx.random())) * (i + 1)) : randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function start(game, actor, args, ctx) {
  requireAdmin(game, actor, ctx);
  if (game.status !== 'lobby') fail('GAME_ALREADY_STARTED');
  const eligible = game.players.filter(player => player.connected && !(game.reviewPolicy === 'moderator-strict' && player.id === game.hostId));
  const minimum = game.mode === 'telephone' && game.reviewPolicy === 'moderator-strict' ? 3 : 2;
  if (eligible.length < minimum) fail('NOT_ENOUGH_PLAYERS', game.reviewPolicy === 'moderator-strict' ? '严格模式需要另有不参赛主持人和足够玩家。' : '至少需要两位玩家。');
  if (eligible.some(player => !player.ready)) fail('PLAYERS_NOT_READY');
  game.participants = shuffled(eligible.map(player => player.id), ctx);
  game.practice = game.participants.length === 2;
  game.status = 'active';
  game.startedAt = nowOf(ctx);
  for (const id of game.participants) game.scores[id] = { guessed: 0, drawing: 0, total: 0 };
  if (game.mode === 'telephone') {
    game._telephone = { order: [...game.participants], step: 0,
      chains: game.participants.map(id => ({ id: uid('chain'), ownerId: id, entries: [] })) };
    telephonePhase(game, nowOf(ctx));
  } else {
    if (game._pack.words.length < game.participants.length * game.config.cycles + 2) fail('WORD_PACK_TOO_SMALL');
    game._guess = { order: [...game.participants], roundIndex: 0, usedWords: [], rounds: [], current: null, deck: shuffled(game._pack.words, ctx) };
    nextGuessRound(game, nowOf(ctx));
  }
  return { status: 'started', gameId: game.id, phaseId: game.phase.id, practice: game.practice };
}

function telephonePhase(game, now) {
  const telephone = game._telephone, step = telephone.step;
  const kind = step === 0 ? 'seed' : step % 2 ? 'draw' : 'describe';
  const phase = kind === 'seed' ? 'seed_write' : kind === 'draw' ? 'draw_private' : 'describe';
  const durationMs = kind === 'seed' ? game.config.seedMs : kind === 'draw' ? game.config.telephoneDrawMs : game.config.describeMs;
  setPhase(game, phase, now, durationMs);
  telephone.chains.forEach((chain, index) => {
    const actor = telephone.order[(index + step) % telephone.order.length];
    taskFor(game, actor, kind, now, { chainId: chain.id, step });
  });
}
function telephoneInput(game, task) {
  if (task.kind === 'seed') return null;
  const chain = game._telephone.chains.find(value => value.id === task.chainId);
  const entry = chain.entries[task.step - 1];
  if (!entry || entry.status !== 'released') return { type: 'missing', message: '上一跳没有可用交卷，请自由发挥。' };
  return entry.kind === 'draw' ? { type: 'image', image: publicImage(assetOf(game, entry)) } : { type: 'text', text: entry.text };
}
function telephoneClose(game, now) {
  const telephone = game._telephone;
  for (const task of Object.values(game._tasks)) if (!task.submitted) task.missing = true;
  const submissions = game._submissions.filter(item => item.step === telephone.step && item.mode === 'telephone');
  if (game.phase.type === 'draw_private' && game.reviewPolicy === 'moderator-strict' && submissions.some(item => item.status === 'pending_review')) {
    game._reviewTaskPhase = game.phase.id;
    setPhase(game, 'review', now, game.config.reviewMs);
    return;
  }
  telephoneTransfer(game, now, submissions);
}
function telephoneTransfer(game, now, supplied) {
  const telephone = game._telephone;
  const submissions = supplied || game._submissions.filter(item => item.mode === 'telephone' && item.step === telephone.step);
  telephone.chains.forEach((chain, index) => {
    const authorId = telephone.order[(index + telephone.step) % telephone.order.length];
    const submission = submissions.find(item => item.chainId === chain.id && item.authorId === authorId);
    const released = submission && ['released', 'approved'].includes(submission.status);
    chain.entries.push({ id: uid('entry'), authorId, position: telephone.step,
      kind: telephone.step === 0 ? 'seed' : telephone.step % 2 ? 'draw' : 'describe',
      status: released ? 'released' : 'missing', ...(released ? submission.assetId ? { assetId: submission.assetId } : { text: submission.text } : {}),
      ...(submission && !released ? { missingReason: submission.status === 'rejected' ? 'rejected' : 'review_timeout' } : !released ? { missingReason: 'timeout' } : {}),
    });
  });
  telephone.step++;
  if (telephone.step >= telephone.order.length) {
    game.status = 'complete'; game.completedAt = now;
    setPhase(game, 'complete', now);
  } else telephonePhase(game, now);
}

function nextGuessRound(game, now) {
  const guess = game._guess;
  if (guess.roundIndex >= game.participants.length * game.config.cycles) {
    game.status = 'complete'; game.completedAt = now;
    setPhase(game, 'complete', now);
    return;
  }
  const drawerId = guess.order[guess.roundIndex % guess.order.length];
  const available = guess.deck.filter(word => !guess.usedWords.includes(word.id));
  if (!available.length) fail('WORD_PACK_EXHAUSTED');
  const current = { id: uid('round'), index: guess.roundIndex, drawerId,
    guesserIds: game.participants.filter(id => id !== drawerId),
    candidates: available.slice(0, 3).map(word => ({ choiceId: uid('choice'), word })),
    answer: null, checkpointIndex: 0, checkpoints: [], guesses: [], matched: {}, eligibleGuessers: [],
    settled: false, invalidated: false, status: 'select_word' };
  guess.current = current;
  setPhase(game, 'word_select', now, game.config.selectMs);
  taskFor(game, drawerId, 'select_word', now);
}
function chooseWord(game, choice, now) {
  const round = game._guess.current;
  round.answer = copy(choice.word); game._guess.usedWords.push(choice.word.id);
  round.candidates = [];
  guessDrawPhase(game, now);
}
function guessDrawPhase(game, now) {
  const round = game._guess.current;
  round.status = 'draw_private';
  setPhase(game, 'draw_private', now, game.config.drawMs);
  taskFor(game, round.drawerId, 'draw', now, { roundId: round.id, checkpointIndex: round.checkpointIndex });
}
function guessDrawingClose(game, now) {
  const round = game._guess.current;
  const submission = game._submissions.find(item => item.mode === 'guess_draw' && item.roundId === round.id && item.checkpointIndex === round.checkpointIndex);
  if (submission?.status === 'pending_review' && game.reviewPolicy === 'moderator-strict') {
    round.status = 'review'; game._reviewTaskPhase = game.phase.id;
    setPhase(game, 'review', now, game.config.reviewMs);
    return;
  }
  publishGuessCheckpoint(game, now, submission);
}
function publishGuessCheckpoint(game, now, submission) {
  const round = game._guess.current;
  const source = submission && ['released', 'approved'].includes(submission.status) ? submission.assetId : round.checkpoints.at(-1)?.assetId;
  if (!source) {
    round.invalidated = true;
    round.invalidReason = submission?.status === 'rejected' ? 'rejected' : 'no_released_image';
    revealRound(game, now);
    return;
  }
  const checkpoint = { id: uid('checkpoint'), index: round.checkpointIndex, assetId: source, releasedAt: now };
  round.checkpoints.push(checkpoint); round.status = 'guess_window';
  setPhase(game, 'guess_window', now, game.config.guessMs);
  for (const id of round.guesserIds) {
    if (connected(game, id) && !round.eligibleGuessers.includes(id)) round.eligibleGuessers.push(id);
    taskFor(game, id, 'guess', now, { roundId: round.id, checkpointId: checkpoint.id, submitted: !!round.matched[id], locked: !!round.matched[id] });
  }
}
function closeGuessWindow(game, now) {
  const round = game._guess.current;
  round.checkpointIndex++;
  if (round.checkpointIndex >= game.config.checkpoints) revealRound(game, now);
  else guessDrawPhase(game, now);
}
function revealRound(game, now) {
  const round = game._guess.current;
  if (!round.settled) {
    round.settled = true; round.status = 'revealed'; round.revealedAt = now;
    if (!round.invalidated) {
      for (const id of round.guesserIds) if (round.matched[id]) game.scores[id].guessed++;
      const valid = round.eligibleGuessers;
      const count = valid.filter(id => round.matched[id]).length;
      if (valid.length) game.scores[round.drawerId].drawing += count / valid.length;
      for (const score of Object.values(game.scores)) score.total = score.guessed + score.drawing;
    }
    game._guess.rounds.push(round);
  }
  setPhase(game, 'round_reveal', now, game.config.revealMs);
}
function advanceGuessReveal(game, now) {
  game._guess.roundIndex++;
  nextGuessRound(game, now);
}

function submitFingerprint(args) {
  // The immutable source revision or literal SVG identifies the submitted work.
  // Retrying never needs to rerender or replace an already accepted asset.
  return digest({ text: args.text, choiceId: args.choiceId, choiceIndex: args.choiceIndex,
    draftId: args.draftId, revision: args.revision, svg: args.svg });
}
function findSubmitReceipt(game, actor, args = {}, ctx = {}) {
  checkGame(game); requireActor(game, actor, ctx);
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_ARGUMENT');
  if (Object.hasOwn(args, 'asset') || Object.hasOwn(args, '__asset') || Object.hasOwn(args, 'png')) fail('UNTRUSTED_ASSET');
  if (args.gameId !== undefined && args.gameId !== game.id) fail('ASSIGNMENT_STALE');
  const previous = game._submitReceipts?.find(item => item.actor === actor && item.taskId === args.taskId && item.phaseId === args.phaseId);
  if (!previous) return null;
  if (previous.fingerprint !== submitFingerprint(args)) fail('SUBMISSION_LOCKED');
  return copy(previous.receipt);
}
function rememberSubmission(game, actor, args, fingerprint, receipt) {
  game._submitReceipts ||= [];
  game._submitReceipts.push({ actor, taskId: args.taskId, phaseId: args.phaseId, fingerprint, receipt: copy(receipt) });
  game._submitReceipts = game._submitReceipts.slice(-128);
  return copy(receipt);
}
function submit(game, actor, args, ctx) {
  if (Object.hasOwn(args, 'asset') || Object.hasOwn(args, '__asset') || Object.hasOwn(args, 'png')) fail('UNTRUSTED_ASSET');
  const previous = findSubmitReceipt(game, actor, args, ctx);
  if (previous) return previous;
  const task = requireTask(game, actor, args, ctx, ['seed', 'describe', 'draw', 'select_word']);
  const fingerprint = submitFingerprint(args);
  if (task.submitted) {
    if (task.fingerprint !== fingerprint) fail('SUBMISSION_LOCKED');
    return copy(task.receipt);
  }
  if (task.kind === 'select_word') {
    const round = game._guess.current;
    const candidate = args.choiceId !== undefined ? round.candidates.find(item => item.choiceId === args.choiceId)
      : Number.isInteger(args.choiceIndex) && args.choiceIndex >= 0 ? round.candidates[args.choiceIndex] : null;
    if (!candidate) fail('INVALID_CHOICE');
    chooseWord(game, candidate, nowOf(ctx));
    return rememberSubmission(game, actor, args, fingerprint, { status: 'selected', gameId: game.id, phaseId: game.phase.id });
  }
  const submission = { id: uid('submission'), taskId: task.id, authorId: actor, phaseId: game.phase.id,
    mode: game.mode, kind: task.kind, createdAt: nowOf(ctx), status: 'released',
    ...(game.mode === 'telephone' ? { chainId: task.chainId, step: task.step } : { roundId: task.roundId, checkpointIndex: task.checkpointIndex }) };
  if (task.kind === 'draw') {
    if (args.revision !== undefined && (!Number.isSafeInteger(args.revision) || args.revision < 0)) fail('INVALID_ARGUMENT');
    const asset = validateAsset(ctx.asset, { taskId: task.id, phaseId: game.phase.id, revision: args.revision });
    if (args.svg !== undefined && typeof args.svg !== 'string') fail('INVALID_ARGUMENT');
    submission.assetId = addAsset(game, asset);
    submission.status = game.reviewPolicy === 'moderator-strict' ? 'pending_review' : 'released';
  } else submission.text = plainText(args.text, game.config.textLimit);
  game._submissions.push(submission);
  task.submitted = true; task.fingerprint = fingerprint; task.submissionId = submission.id;
  const receipt = { status: submission.status === 'pending_review' ? 'pending_review' : 'locked',
    publication: 'not_released', gameId: game.id, taskId: task.id, submissionId: submission.id };
  task.receipt = receipt;
  if (game.mode === 'telephone' && Object.values(game._tasks).every(value => value.submitted)) telephoneClose(game, nowOf(ctx));
  else if (game.mode === 'guess_draw') guessDrawingClose(game, nowOf(ctx));
  return rememberSubmission(game, actor, args, fingerprint, receipt);
}
function guess(game, actor, args, ctx) {
  const task = requireTask(game, actor, args, ctx, ['guess']);
  const round = game._guess.current;
  if (args.roundId !== undefined && args.roundId !== round.id || args.checkpointId !== task.checkpointId) fail('ASSIGNMENT_STALE');
  const normalized = normalizeGuess(args.guess);
  if (task.submitted) {
    if (task.guess === normalized && task.receipt) return copy(task.receipt);
    fail('GUESS_LIMIT', '本窗口已经作答。');
  }
  if (round.matched[actor]) fail('GUESS_LIMIT');
  const matched = [round.answer.answer, ...round.answer.aliases].some(word => normalizeGuess(word) === normalized);
  const receipt = { status: matched ? 'matched' : 'not_matched', matched, locked: matched,
    attemptsRemaining: matched ? 0 : game.config.checkpoints - round.checkpointIndex - 1,
    receiptId: uid('guess') };
  round.guesses.push({ actorId: actor, checkpointId: task.checkpointId, checkpointIndex: round.checkpointIndex, guess: plainText(args.guess, 40), normalized, matched, receiptId: receipt.receiptId });
  if (!round.eligibleGuessers.includes(actor)) round.eligibleGuessers.push(actor);
  if (matched) round.matched[actor] = true;
  task.submitted = true; task.guess = normalized; task.receipt = receipt;
  // Do not advance the public phase or counter when somebody guesses/matches.
  return copy(receipt);
}

function review(game, actor, args, ctx) {
  requireAdmin(game, actor, ctx);
  if (game.reviewPolicy !== 'moderator-strict') fail('ROLE_FORBIDDEN', '参赛房主不能开启全稿审核。');
  if (game.status !== 'active' || game.phase.type !== 'review' || nowOf(ctx) >= game.phase.deadlineAt) fail('PHASE_CLOSED');
  if (args.phaseId !== undefined && args.phaseId !== game.phase.id) fail('ASSIGNMENT_STALE');
  if (!['approve', 'reject'].includes(args.decision)) fail('INVALID_REVIEW');
  const pending = activeReviews(game);
  const submission = pending.find(item => item.id === args.submissionId);
  if (!submission) fail('SUBMISSION_NOT_PENDING');
  if (args.hash !== assetOf(game, submission).pngHash) fail('HASH_MISMATCH');
  submission.status = args.decision === 'approve' ? 'approved' : 'rejected';
  submission.reviewedAt = nowOf(ctx);
  submission.reasonCode = args.decision === 'reject' ? 'content_rejected' : null;
  if (!activeReviews(game).length) {
    if (game.mode === 'telephone') telephoneTransfer(game, nowOf(ctx));
    else publishGuessCheckpoint(game, nowOf(ctx), submission);
  }
  return { status: submission.status, submissionId: submission.id };
}
function activeReviews(game) {
  return game._submissions.filter(item => item.status === 'pending_review' && (game.mode === 'telephone'
    ? item.mode === 'telephone' && item.step === game._telephone.step
    : item.mode === 'guess_draw' && item.roundId === game._guess.current.id && item.checkpointIndex === game._guess.current.checkpointIndex));
}

function closePhase(game, now) {
  if (game.mode === 'telephone') {
    if (game.phase.type === 'review') {
      for (const submission of activeReviews(game)) submission.status = 'review_timeout';
      telephoneTransfer(game, now);
    } else if (['seed_write', 'draw_private', 'describe'].includes(game.phase.type)) telephoneClose(game, now);
    else fail('PHASE_CLOSED');
    return;
  }
  switch (game.phase.type) {
    case 'word_select': chooseWord(game, game._guess.current.candidates[0], now); break;
    case 'draw_private': guessDrawingClose(game, now); break;
    case 'review': {
      const submissions = activeReviews(game);
      for (const submission of submissions) submission.status = 'review_timeout';
      publishGuessCheckpoint(game, now, submissions[0]); break;
    }
    case 'guess_window': closeGuessWindow(game, now); break;
    case 'round_reveal': advanceGuessReveal(game, now); break;
    default: fail('PHASE_CLOSED');
  }
}
function abort(game, now, reason) {
  game.status = 'aborted'; game.abortedAt = now; game.abortReason = reason;
  game._pause = null;
  setPhase(game, 'aborted', now);
}
function pause(game, actor, args, ctx) {
  requireAdmin(game, actor, ctx);
  const now = nowOf(ctx), paused = args.paused ?? args.pause ?? true;
  if (typeof paused !== 'boolean') fail('INVALID_ARGUMENT');
  if (paused) {
    if (game.status === 'paused') return { status: 'paused' };
    if (game.status !== 'active') fail('PHASE_CLOSED');
    if (args.phaseId !== undefined && args.phaseId !== game.phase.id) fail('ASSIGNMENT_STALE');
    if (game.phase.deadlineAt !== null && now >= game.phase.deadlineAt) fail('PHASE_CLOSED');
    const budget = game.config.maxPauseMs - game._pauseUsedMs;
    if (budget <= 0) fail('PAUSE_LIMIT');
    game._pause = { startedAt: now, expiresAt: now + budget, remainingMs: Math.max(0, game.phase.deadlineAt - now) };
    game.status = 'paused'; game.publicVersion++;
    return { status: 'paused', expiresAt: game._pause.expiresAt };
  }
  if (game.status !== 'paused') fail('GAME_NOT_PAUSED');
  resume(game, Math.min(now, game._pause.expiresAt));
  return { status: 'active', phaseId: game.phase.id };
}
function resume(game, now) {
  const paused = game._pause;
  const elapsed = Math.min(Math.max(0, now - paused.startedAt), game.config.maxPauseMs - game._pauseUsedMs);
  game._pauseUsedMs += elapsed; game._pause = null; game.status = 'active';
  game.phase.id = uid('phase'); game.phase.version++; game.phase.startedAt = now; game.phase.deadlineAt = now + paused.remainingMs;
  for (const task of Object.values(game._tasks)) { task.phaseId = game.phase.id; task.phaseVersion = game.phase.version; task.deadlineAt = game.phase.deadlineAt; task.assignmentEpoch++; }
  game.publicVersion++;
}

function execute(game, actor, command, args = {}, ctx = {}) {
  checkGame(game);
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_ARGUMENT');
  requireActor(game, actor, ctx);
  if (command === 'game.status') return view(game, actor, ctx);
  if (command === 'game.task') return getTask(game, actor, ctx);
  if (command === 'game.replay') return replay(game, actor, args, ctx);
  if (['game.start', 'game.review', 'game.advance', 'game.pause', 'game.abort'].includes(command)) requireAdmin(game, actor, ctx);
  if (Object.hasOwn(args, 'asset') || Object.hasOwn(args, '__asset') || Object.hasOwn(args, 'png')) fail('UNTRUSTED_ASSET');
  const before = copy(game);
  try {
    syncMembers(game, ctx);
    const id = ctx.operationId || ctx.id || args.operationId;
    if (id !== undefined && (typeof id !== 'string' || !id || id.length > 128)) fail('INVALID_OPERATION_ID');
    const signature = digest({ command, args });
    const previous = id && game._dedup.find(item => item.actor === actor && item.id === id);
    if (previous) {
      if (previous.signature !== signature) fail('IDEMPOTENCY_CONFLICT');
      return copy(previous.result);
    }
    let result;
    switch (command) {
      case 'game.ready': {
        if (game.status !== 'lobby') fail('GAME_ALREADY_STARTED');
        if (args.rulesHash !== undefined && args.rulesHash !== game.rulesHash) fail('RULES_CHANGED');
        const player = game.players.find(value => value.id === actor);
        const ready = args.ready ?? true;
        if (typeof ready !== 'boolean') fail('INVALID_ARGUMENT');
        if (args.controlMode !== undefined && !['human', 'assisted', 'delegated'].includes(args.controlMode)) fail('INVALID_CONTROL_MODE');
        if (args.shareSourceAfterReveal !== undefined && typeof args.shareSourceAfterReveal !== 'boolean') fail('INVALID_ARGUMENT');
        player.ready = ready;
        if (args.controlMode !== undefined) player.controlMode = args.controlMode;
        if (args.shareSourceAfterReveal !== undefined) player.shareSourceAfterReveal = args.shareSourceAfterReveal;
        game.publicVersion++;
        result = { ready, rulesHash: game.rulesHash }; break;
      }
      case 'game.start': result = start(game, actor, args, ctx); break;
      case 'game.submit': result = submit(game, actor, args, ctx); break;
      case 'game.guess': result = guess(game, actor, args, ctx); break;
      case 'game.review': result = review(game, actor, args, ctx); break;
      case 'game.advance': {
        requireAdmin(game, actor, ctx);
        if (game.status !== 'active') fail('PHASE_CLOSED');
        if (args.phaseId !== undefined && args.phaseId !== game.phase.id) fail('ASSIGNMENT_STALE');
        closePhase(game, nowOf(ctx)); result = { status: game.status, phaseId: game.phase.id }; break;
      }
      case 'game.pause': result = pause(game, actor, args, ctx); break;
      case 'game.abort': {
        requireAdmin(game, actor, ctx);
        if (['complete', 'aborted'].includes(game.status)) fail('PHASE_CLOSED');
        abort(game, nowOf(ctx), 'host_aborted'); result = { status: 'aborted' }; break;
      }
      default: fail('UNKNOWN_COMMAND');
    }
    game.version++; game.updatedAt = nowOf(ctx);
    if (id) { game._dedup.push({ actor, id, signature, result: copy(result) }); game._dedup = game._dedup.slice(-256); }
    return copy(result);
  } catch (error) {
    for (const key of Object.keys(game)) delete game[key];
    Object.assign(game, before);
    throw error;
  }
}

function tick(game, ctx = {}) {
  checkGame(game);
  const before = copy(game);
  try {
    let changed = syncMembers(game, ctx);
    const now = nowOf(ctx);
    if (['lobby', 'active', 'paused'].includes(game.status) && ctx.hostLeft === true) {
      abort(game, now, 'host_left'); changed = true;
    } else if (game.status === 'paused' && now >= game._pause.expiresAt) {
      resume(game, game._pause.expiresAt); changed = true;
    }
    if (game.status === 'active' && game.phase.deadlineAt !== null && now >= game.phase.deadlineAt) {
      closePhase(game, now); changed = true;
    }
    if (changed) { game.version++; game.updatedAt = now; }
    return changed;
  } catch (error) {
    for (const key of Object.keys(game)) delete game[key];
    Object.assign(game, before);
    throw error;
  }
}

function getTask(game, actor, ctx = {}) {
  checkGame(game); requireActor(game, actor, ctx);
  if (!['active', 'paused'].includes(game.status)) return null;
  const task = game._tasks[actor];
  if (!task) return null;
  const result = { id: task.id, taskId: task.id, gameId: game.id, phaseId: game.phase.id, phaseVersion: game.phase.version,
    assignmentEpoch: task.assignmentEpoch, kind: task.kind, deadlineAt: game.phase.deadlineAt,
    submitted: !!task.submitted, paused: game.status === 'paused', allowedActions: task.submitted || game.status === 'paused' ? [] : [task.kind === 'guess' ? 'game.guess' : 'game.submit'] };
  if (task.submissionId) {
    const submission = game._submissions.find(item => item.id === task.submissionId);
    result.submission = { id: submission.id, status: submission.status };
  }
  if (game.mode === 'telephone') result.input = telephoneInput(game, task);
  else {
    const round = game._guess.current;
    result.roundId = round.id;
    if (task.kind === 'select_word') result.choices = round.candidates.map(item => ({ id: item.choiceId, choiceId: item.choiceId, text: item.word.answer }));
    else if (task.kind === 'draw') {
      result.input = { type: 'word', text: round.answer.answer };
      result.checkpointIndex = round.checkpointIndex;
      result.checkpointCount = game.config.checkpoints;
    } else if (task.kind === 'guess') {
      const checkpoint = round.checkpoints.find(item => item.id === task.checkpointId);
      result.checkpointId = task.checkpointId;
      result.input = { type: 'image', image: publicImage(assetOf(game, checkpoint)) };
      result.locked = !!round.matched[actor];
      result.attemptsRemaining = round.matched[actor] ? 0 : game.config.checkpoints - round.checkpointIndex - Number(task.submitted);
      if (task.receipt) result.ownResult = copy(task.receipt);
    }
  }
  return result;
}

function roundSummary(round) {
  return { id: round.id, index: round.index, drawerId: round.drawerId, answer: round.answer?.answer || null,
    invalidated: round.invalidated, invalidReason: round.invalidReason || null,
    guesses: round.guesses.map(item => ({ actorId: item.actorId, checkpointIndex: item.checkpointIndex, guess: item.guess, matched: item.matched })),
    matchedIds: Object.keys(round.matched), eligibleGuessers: [...round.eligibleGuessers] };
}
function view(game, actor, ctx = {}) {
  checkGame(game); requireActor(game, actor, ctx);
  const isNeutralModerator = actor === game.hostId && !!ctx.admin && game.reviewPolicy === 'moderator-strict';
  const memberships = membersOf(game, ctx);
  const result = { schema: SCHEMA, feature: FEATURE, id: game.id, gameId: game.id, mode: game.mode,
    reviewPolicy: game.reviewPolicy, hostId: game.hostId, status: game.status,
    version: game.publicVersion, publicVersion: game.publicVersion, rulesHash: game.rulesHash,
    phase: copy(game.phase), config: copy(game.config), practice: game.practice,
    players: game.players.map(player => ({ id: player.id, name: player.name, connected: memberships.find(value => value.id === player.id)?.connected !== false && memberships.some(value => value.id === player.id),
      ready: player.ready, controlMode: player.controlMode, participating: game.participants.includes(player.id) })),
    me: { id: actor, isModerator: isNeutralModerator, participating: game.participants.includes(actor) },
    task: getTask(game, actor, ctx), scores: copy(game.scores), canReplay: game.status === 'complete' || game.mode === 'guess_draw' && game._guess?.rounds.length > 0,
    ...(game.status === 'paused' ? { pause: { expiresAt: game._pause.expiresAt, remainingMs: game._pause.remainingMs } } : {}),
    ...(game.status === 'aborted' ? { abortReason: game.abortReason } : {}),
  };
  if (game.mode === 'telephone' && game._telephone) {
    result.progress = { step: Math.min(game._telephone.step + 1, game.participants.length), steps: game.participants.length, chains: game.participants.length };
  }
  if (game.mode === 'guess_draw' && game._guess?.current) {
    const round = game._guess.current;
    result.progress = { round: round.index + 1, rounds: game.participants.length * game.config.cycles,
      drawerId: round.drawerId, checkpoint: Math.min(round.checkpointIndex + 1, game.config.checkpoints), checkpoints: game.config.checkpoints };
    if (game.participants.includes(actor) && round.checkpoints.length) result.currentImage = publicImage(assetOf(game, round.checkpoints.at(-1)));
    if (round.settled && ['round_reveal', 'complete', 'aborted'].includes(game.phase.type)) result.revealedRound = roundSummary(round);
  }
  if (isNeutralModerator && game.phase.type === 'review') {
    result.reviewQueue = activeReviews(game).map(submission => ({ submissionId: submission.id, authorId: submission.authorId,
      hash: assetOf(game, submission).pngHash, image: publicImage(assetOf(game, submission)), status: 'pending_review' }));
  }
  return result;
}

function replay(game, actor, args = {}, ctx = {}) {
  checkGame(game); requireActor(game, actor, ctx);
  const limit = integer(args.limit, 4, 1, 8, 'limit');
  let start = 0;
  if (args.cursor !== undefined && args.cursor !== null) {
    if (typeof args.cursor !== 'string' || !/^\d+$/.test(args.cursor) || args.cursor.length > 4) fail('INVALID_CURSOR');
    start = Number(args.cursor);
  }
  let records = [];
  if (game.mode === 'telephone') {
    if (game.status !== 'complete') fail('CONTENT_NOT_VISIBLE', '传话结束前不能读取回放。');
    for (const [chainIndex, chain] of game._telephone.chains.entries()) for (const entry of chain.entries) {
      records.push({ chainIndex, chainId: chain.id, entry });
    }
  } else {
    if (!game._guess?.rounds.length) fail('CONTENT_NOT_VISIBLE', '揭晓前不能读取回放。');
    for (const round of game._guess.rounds) {
      for (const checkpoint of round.checkpoints) records.push({ round, checkpoint });
      if (!round.checkpoints.length) records.push({ round, checkpoint: null });
    }
  }
  if (start > records.length) fail('INVALID_CURSOR');
  const entries = records.slice(start, start + limit).map(record => {
    if (game.mode === 'telephone') {
      const entry = record.entry;
      const value = { id: entry.id, chainIndex: record.chainIndex, chainId: record.chainId, position: entry.position,
        authorId: entry.authorId, kind: entry.kind, status: entry.status,
        ...(entry.text === undefined ? {} : { text: entry.text }), ...(entry.missingReason ? { missingReason: entry.missingReason } : {}),
        ...(entry.assetId ? { image: publicImage(assetOf(game, entry)) } : {}) };
      addReplaySource(value, entry.authorId, assetOf(game, entry), game, actor, args);
      return value;
    }
    const { round, checkpoint } = record;
    const value = { round: roundSummary(round), checkpointIndex: checkpoint?.index ?? null,
      ...(checkpoint ? { image: publicImage(assetOf(game, checkpoint)) } : {}) };
    addReplaySource(value, round.drawerId, assetOf(game, checkpoint), game, actor, args);
    return value;
  });
  return { gameId: game.id, entries, total: records.length, nextCursor: start + entries.length < records.length ? String(start + entries.length) : null };
}
function addReplaySource(target, ownerId, asset, game, actor, args) {
  if (!asset) return;
  const allowed = ownerId === actor || game.players.find(player => player.id === ownerId)?.shareSourceAfterReveal === true;
  target.sourceAvailable = allowed;
  if (args.includeSource === true && allowed) { target.svg = asset.svg; target.svgHash = asset.svgHash; }
}

module.exports = { createGame, execute, tick, view, getTask, replay, findSubmitReceipt, validateAsset, normalizeGuess,
  SCHEMA, FEATURE, WORD_PACK_VERSION, MAX_ASSET_BYTES, MAX_GAME_BYTES };
