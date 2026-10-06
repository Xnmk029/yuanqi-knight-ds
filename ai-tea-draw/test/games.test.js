'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const G = require('../src/games');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC2kAAAAASUVORK5CYII=';
const SVG = '<svg viewBox="0 0 1 1"><path d="M 0 0 L 1 1" stroke="black"/></svg>';
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture(mode = 'telephone', count = 4, reviewPolicy = 'participant-confirm', options = {}) {
  const e = { now: 1000, members: Array.from({ length: count }, (_, index) => ({ id: String.fromCharCode(97 + index), name: `玩家${index + 1}`, connected: true })) };
  e.ctx = (admin = false, extra = {}) => ({ hostId: 'a', members: e.members, now: e.now, admin, random: () => 0.999999, ...extra });
  e.game = G.createGame({ mode, reviewPolicy, seedMs: 1000, telephoneDrawMs: 1000, describeMs: 1000, drawMs: 1000, guessMs: 1000, selectMs: 1000, reviewMs: 1000, revealMs: 1000, maxPauseMs: 2000, ...options }, e.ctx());
  e.run = (actor, command, args = {}, extra = {}) => G.execute(e.game, actor, command, args, e.ctx(false, extra));
  e.admin = (command, args = {}, extra = {}) => G.execute(e.game, 'a', command, args, e.ctx(true, extra));
  e.task = actor => G.getTask(e.game, actor, e.ctx());
  e.view = (actor, admin = false) => G.view(e.game, actor, e.ctx(admin));
  e.taskArgs = actor => { const task = e.task(actor); return { taskId: task.id, phaseId: task.phaseId, assignmentEpoch: task.assignmentEpoch }; };
  e.ready = () => {
    for (const member of e.members) if (!(reviewPolicy === 'moderator-strict' && member.id === 'a')) e.run(member.id, 'game.ready', { ready: true, rulesHash: e.game.rulesHash });
  };
  e.start = () => { e.ready(); e.admin('game.start'); };
  e.asset = (actor, svg = SVG, extra = {}) => {
    const task = e.task(actor);
    return { svg, png: PNG, svgHash: hash(svg), pngHash: hash(Buffer.from(PNG, 'base64')), width: 1, height: 1, taskId: task.id, phaseId: task.phaseId, revision: 1, ...extra };
  };
  e.draw = (actor, svg = SVG, extra = {}) => e.run(actor, 'game.submit', { ...e.taskArgs(actor), draftId: 'draft-private', revision: 1, ...extra }, { asset: e.asset(actor, svg) });
  e.text = (actor, text, extra = {}) => e.run(actor, 'game.submit', { ...e.taskArgs(actor), text, ...extra });
  e.choose = () => { const drawer = e.game._guess.current.drawerId; e.run(drawer, 'game.submit', { ...e.taskArgs(drawer), choiceId: e.task(drawer).choices[0].id }); return drawer; };
  e.advance = () => e.admin('game.advance', { phaseId: e.game.phase.id });
  e.expire = () => { e.now = e.game.phase.deadlineAt; return G.tick(e.game, e.ctx()); };
  e.approve = () => {
    const queue = e.view('a', true).reviewQueue;
    for (const item of queue) e.admin('game.review', { phaseId: e.game.phase.id, submissionId: item.submissionId, hash: item.hash, decision: 'approve' });
  };
  return e;
}

function finishTelephone(e) {
  let guard = 0;
  while (e.game.status === 'active') {
    assert.ok(++guard < 30);
    if (e.game.phase.type === 'review') { e.approve(); continue; }
    for (const id of e.game.participants) {
      const task = e.task(id);
      if (task.kind === 'draw') e.draw(id, SVG.replace('black', 'blue'));
      else e.text(id, task.kind === 'seed' ? `私有原题-${id}-鲸鱼撑伞` : `看图描述-${id}`);
    }
  }
}
function submitGuess(e, actor, word, extra = {}) {
  const task = e.task(actor);
  return e.run(actor, 'game.guess', { ...e.taskArgs(actor), roundId: task.roundId, checkpointId: task.checkpointId, guess: word, ...extra });
}
function finishGuess(e, correctness = () => true) {
  let guard = 0;
  while (e.game.status === 'active') {
    assert.ok(++guard < 180);
    const round = e.game._guess.current;
    switch (e.game.phase.type) {
      case 'word_select': e.choose(); break;
      case 'draw_private': e.draw(round.drawerId); break;
      case 'review': e.approve(); break;
      case 'guess_window':
        for (const id of round.guesserIds) if (!e.task(id).submitted) submitGuess(e, id, correctness(round, id) ? round.answer.answer : '猜错了');
        e.expire(); break;
      case 'round_reveal': e.advance(); break;
      default: assert.fail(e.game.phase.type);
    }
  }
}

test('game schema, default rules, serializability and read-only lobby views', () => {
  const e = fixture();
  assert.equal(e.game.schema, 2); assert.equal(e.game.feature, 'tea-games-v1');
  assert.equal(e.game.config.checkpoints, 3);
  const before = JSON.stringify(e.game); e.view('a'); e.task('a');
  assert.equal(JSON.stringify(e.game), before);
  assert.deepEqual(JSON.parse(before), e.game);
  assert.throws(() => G.createGame({ mode: 'invalid' }, e.ctx()), { code: 'INVALID_GAME_MODE' });
  assert.throws(() => fixture('guess_draw', 4, 'participant-confirm', { checkpoints: 4 }), { code: 'INVALID_GAME_RULES' });
});

test('preparation and management require the correct room identity and webpage capability', () => {
  const e = fixture();
  assert.throws(() => e.admin('game.start'), { code: 'PLAYERS_NOT_READY' });
  assert.throws(() => e.run('stranger', 'game.ready'), { code: 'NOT_AUTHORIZED' });
  assert.throws(() => e.run('b', 'game.start', {}, { admin: true }), { code: 'FORBIDDEN' });
  assert.throws(() => e.run('a', 'game.start'), { code: 'FORBIDDEN' });
  assert.throws(() => e.run('a', 'game.ready', { rulesHash: 'wrong' }), { code: 'RULES_CHANGED' });
  e.start();
  assert.throws(() => e.run('b', 'game.ready'), { code: 'GAME_ALREADY_STARTED' });
});

test('strict moderator is not a player and minimum counts are enforced for both games', () => {
  const tooSmall = fixture('telephone', 3, 'moderator-strict'); tooSmall.ready();
  assert.throws(() => tooSmall.admin('game.start'), { code: 'NOT_ENOUGH_PLAYERS' });
  const e = fixture('telephone', 4, 'moderator-strict'); e.start();
  assert.deepEqual(e.game.participants, ['b', 'c', 'd']); assert.equal(e.task('a'), null);
  const guessing = fixture('guess_draw', 2, 'moderator-strict'); guessing.ready();
  assert.throws(() => guessing.admin('game.start'), { code: 'NOT_ENOUGH_PLAYERS' });
  const valid = fixture('guess_draw', 3, 'moderator-strict'); valid.start();
  assert.deepEqual(valid.game.participants, ['b', 'c']); assert.equal(valid.task('a'), null);
});

test('two-player telephone is explicitly practice and stops before returning to the seed author', () => {
  const e = fixture('telephone', 2); e.start(); finishTelephone(e);
  assert.equal(e.game.status, 'complete'); assert.equal(e.view('a').practice, true);
  for (const chain of e.game._telephone.chains) {
    assert.equal(chain.entries.length, 2); assert.equal(new Set(chain.entries.map(entry => entry.authorId)).size, 2);
    assert.equal(chain.entries.at(-1).kind, 'draw');
  }
});

for (const count of [3, 4, 5, 7, 8]) test(`${count}-player telephone completes N parallel chains with one visit per player and the right final type`, () => {
  const e = fixture('telephone', count); e.start(); finishTelephone(e);
  assert.equal(e.game._telephone.chains.length, count);
  for (const chain of e.game._telephone.chains) {
    assert.equal(chain.entries.length, count);
    assert.equal(new Set(chain.entries.map(entry => entry.authorId)).size, count);
    assert.equal(chain.entries.at(-1).kind, count % 2 ? 'describe' : 'draw');
  }
  assert.equal(e.game._telephone.chains.flatMap(chain => chain.entries).filter(entry => entry.status === 'missing').length, 0);
});

test('telephone exposes only the immediately previous entry and never SVG or semantic metadata', () => {
  const e = fixture('telephone', 4); e.start();
  for (const id of e.game.participants) e.text(id, `ORIGINAL_SECRET_${id}`);
  assert.equal(e.task('b').input.text, 'ORIGINAL_SECRET_a');
  assert.doesNotMatch(JSON.stringify(e.view('a')), /ORIGINAL_SECRET_[abc]/);
  const tagged = SVG.replace('black', 'black').replace('</svg>', '<!-- DRAW_INTENT_SECRET --></svg>');
  for (const id of e.game.participants) e.draw(id, tagged, { name: 'PRIVATE_TITLE_SECRET', filename: 'answer-secret.svg' });
  for (const id of e.game.participants) {
    const text = JSON.stringify(e.view(id));
    assert.equal(e.task(id).kind, 'describe'); assert.equal(e.task(id).input.type, 'image');
    assert.doesNotMatch(text, /ORIGINAL_SECRET|DRAW_INTENT_SECRET|PRIVATE_TITLE_SECRET|answer-secret|<svg|chainId|ownerId/);
  }
});

test('telephone no-source and replay limits hold until completion; source sharing is explicit', () => {
  const e = fixture('telephone', 3);
  e.run('b', 'game.ready', { shareSourceAfterReveal: true }); e.start();
  assert.throws(() => G.replay(e.game, 'a', { includeSource: true }, e.ctx()), { code: 'CONTENT_NOT_VISIBLE' });
  finishTelephone(e);
  const all = []; let cursor;
  do { const page = G.replay(e.game, 'c', { limit: 4, cursor, includeSource: true }, e.ctx()); all.push(...page.entries); cursor = page.nextCursor; } while (cursor);
  assert.equal(all.length, 9);
  assert.ok(all.find(entry => entry.kind === 'draw' && entry.authorId === 'b').svg);
  assert.equal(all.find(entry => entry.kind === 'draw' && entry.authorId === 'a').svg, undefined);
  assert.equal(G.replay(e.game, 'a', {}, e.ctx()).entries.length, 4);
  assert.throws(() => G.replay(e.game, 'a', { limit: 9 }, e.ctx()), { code: 'INVALID_GAME_RULES' });
  assert.throws(() => G.replay(e.game, 'a', { cursor: '-1' }, e.ctx()), { code: 'INVALID_CURSOR' });
});

test('strict telephone review exposes images only to a neutral moderator and requires the exact hash', () => {
  const e = fixture('telephone', 4, 'moderator-strict'); e.start();
  for (const id of e.game.participants) e.text(id, 'ORIGINAL_WORD_SECRET');
  for (const id of e.game.participants) e.draw(id, SVG.replace('</svg>', '<!-- SVG_SECRET --></svg>'));
  assert.equal(e.game.phase.type, 'review');
  assert.equal(e.view('a').reviewQueue, undefined); assert.equal(e.view('b', true).reviewQueue, undefined);
  const admin = e.view('a', true);
  assert.equal(admin.reviewQueue.length, 3);
  assert.doesNotMatch(JSON.stringify(admin), /ORIGINAL_WORD_SECRET|SVG_SECRET|<svg/);
  const item = admin.reviewQueue[0];
  assert.throws(() => e.run('a', 'game.review', { submissionId: item.submissionId, decision: 'approve', hash: item.hash }), { code: 'FORBIDDEN' });
  assert.throws(() => e.admin('game.review', { submissionId: item.submissionId, decision: 'approve', hash: 'bad' }), { code: 'HASH_MISMATCH' });
  e.approve(); assert.equal(e.game.phase.type, 'describe');
});

test('review timeout makes a missing telephone entry and never backfills the original text', () => {
  const e = fixture('telephone', 4, 'moderator-strict'); e.start();
  for (const id of e.game.participants) e.text(id, 'ORIGINAL_DO_NOT_FALL_BACK');
  for (const id of e.game.participants) e.draw(id);
  e.expire();
  assert.equal(e.game.phase.type, 'describe');
  for (const id of e.game.participants) {
    assert.equal(e.task(id).input.type, 'missing');
    assert.doesNotMatch(JSON.stringify(e.view(id)), /ORIGINAL_DO_NOT_FALL_BACK/);
  }
});

test('missing telephone steps keep fixed chains and do not give known-original authors a substitute task', () => {
  const e = fixture('telephone', 4); e.start();
  const initialOrder = [...e.game.participants];
  for (const id of ['a', 'b', 'c']) e.text(id, `seed-${id}`);
  e.members.find(member => member.id === 'd').connected = false;
  e.expire();
  assert.deepEqual(e.game.participants, initialOrder);
  assert.equal(e.task('a').input.type, 'missing');
  assert.equal(e.game._telephone.chains[3].entries[0].authorId, 'd');
  assert.equal(e.game._telephone.chains[3].entries[0].status, 'missing');
  assert.equal(e.game._tasks.d.chainId, e.game._telephone.chains[2].id);
});

test('same Steam identity rejoining keeps the assignment but invalidates the old task handle', () => {
  const e = fixture(); e.start();
  const old = e.task('b'), chain = e.game._tasks.b.chainId;
  e.members[1].connected = false; G.tick(e.game, e.ctx());
  assert.throws(() => e.text('b', 'offline'), { code: 'NOT_AUTHORIZED' });
  e.members[1].connected = true; G.tick(e.game, e.ctx());
  const current = e.task('b'); assert.notEqual(current.id, old.id);
  assert.equal(e.game._tasks.b.chainId, chain);
  assert.throws(() => e.run('b', 'game.submit', { taskId: old.id, phaseId: old.phaseId, text: 'old' }), { code: 'ASSIGNMENT_STALE' });
  e.text('b', 'same seat returned');
});

test('late joiners are spectators, with no active chain, candidate words or image task', () => {
  const e = fixture('guess_draw', 3); e.start();
  e.members.push({ id: 'late', name: '迟到', connected: true }); G.tick(e.game, e.ctx());
  assert.equal(e.task('late'), null); assert.equal(e.view('late').currentImage, undefined);
  assert.deepEqual(e.game.participants, ['a', 'b', 'c']);
  assert.throws(() => e.run('late', 'game.ready'), { code: 'GAME_ALREADY_STARTED' });
});

test('deadline, phase, game and assignment preconditions reject stale or late writes atomically', () => {
  const e = fixture(); e.start();
  const args = e.taskArgs('a');
  for (const override of [{ phaseId: 'wrong' }, { taskId: 'wrong' }, { gameId: 'wrong' }, { assignmentEpoch: 99 }, { phaseVersion: 999 }]) {
    const before = JSON.stringify(e.game);
    assert.throws(() => e.run('a', 'game.submit', { ...args, ...override, text: 'valid' }), { code: 'ASSIGNMENT_STALE' });
    assert.equal(JSON.stringify(e.game), before);
  }
  e.now = e.game.phase.deadlineAt;
  assert.throws(() => e.run('a', 'game.submit', { ...args, text: 'too late' }), { code: 'PHASE_CLOSED' });
  assert.equal(e.expire(), true); assert.equal(e.game.phase.type, 'draw_private');
});

test('task-level and operation-ID deduplication do not create additional submissions', () => {
  const e = fixture(); e.start();
  const args = { ...e.taskArgs('a'), text: 'once' };
  const first = e.run('a', 'game.submit', args, { operationId: 'same-op' });
  assert.deepEqual(e.run('a', 'game.submit', args, { operationId: 'same-op' }), first);
  assert.deepEqual(e.run('a', 'game.submit', args), first);
  assert.equal(e.game._submissions.length, 1);
  assert.throws(() => e.run('a', 'game.submit', { ...args, text: 'changed' }, { operationId: 'same-op' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => e.run('a', 'game.submit', { ...args, text: 'changed' }), { code: 'SUBMISSION_LOCKED' });
});

test('reusing an admin operation ID cannot turn a CLI credential into a management credential', () => {
  const e = fixture(); e.ready(); e.admin('game.start', {}, { operationId: 'start-once' });
  assert.throws(() => e.run('a', 'game.start', {}, { operationId: 'start-once' }), { code: 'FORBIDDEN' });
});

test('ready accepts an omitted rules hash but checks a supplied one', () => {
  const e = fixture();
  assert.equal(e.run('b', 'game.ready').ready, true);
  assert.throws(() => e.run('c', 'game.ready', { rulesHash: 'outdated' }), { code: 'RULES_CHANGED' });
  assert.equal(e.run('c', 'game.ready', { rulesHash: e.game.rulesHash }).ready, true);
});

test('telephone final submission retries remain idempotent after transfer, deadline and recovery', () => {
  const e = fixture('telephone', 3); e.start();
  e.text('a', 'first'); e.text('b', 'second');
  const args = { ...e.taskArgs('c'), text: 'last' };
  const receipt = e.run('c', 'game.submit', args);
  assert.equal(e.game.phase.type, 'draw_private');
  e.now += 2000; e.game = JSON.parse(JSON.stringify(e.game));
  const count = e.game._submissions.length;
  assert.deepEqual(e.run('c', 'game.submit', args), receipt);
  assert.equal(e.game._submissions.length, count);
  assert.throws(() => e.run('c', 'game.submit', { ...args, text: 'replacement' }), { code: 'SUBMISSION_LOCKED' });
  assert.equal(G.findSubmitReceipt(e.game, 'b', args, e.ctx()), null);
  assert.throws(() => G.findSubmitReceipt(e.game, 'c', { ...args, gameId: 'other-game' }, e.ctx()), { code: 'ASSIGNMENT_STALE' });
});

test('choice and drawing retries reuse private receipts without requiring a second rendering', () => {
  const e = fixture('guess_draw', 3); e.start();
  const choice = { ...e.taskArgs('a'), choiceId: e.task('a').choices[0].id };
  const selected = e.run('a', 'game.submit', choice);
  assert.deepEqual(e.run('a', 'game.submit', choice), selected);
  const drawing = { ...e.taskArgs('a'), draftId: 'fixed-draft', revision: 1 };
  const receipt = e.run('a', 'game.submit', drawing, { asset: e.asset('a'), operationId: 'drawing-op' });
  assert.equal(e.game.phase.type, 'guess_window');
  assert.deepEqual(G.findSubmitReceipt(e.game, 'a', drawing, e.ctx()), receipt);
  assert.deepEqual(e.run('a', 'game.submit', drawing), receipt);
  assert.deepEqual(e.run('a', 'game.submit', drawing, { operationId: 'drawing-op' }), receipt);
  assert.equal(Object.keys(e.game._assets).length, 1);
  assert.throws(() => G.findSubmitReceipt(e.game, 'a', { ...drawing, png: PNG }, e.ctx()), { code: 'UNTRUSTED_ASSET' });
  assert.throws(() => e.run('a', 'game.submit', { ...drawing, revision: 2 }), { code: 'SUBMISSION_LOCKED' });
});

test('drawing submissions require host-rendered PNGs bound to the current task and source revision', () => {
  const e = fixture('guess_draw'); e.start(); const drawer = e.choose();
  const args = { ...e.taskArgs(drawer), revision: 1 };
  assert.throws(() => e.run(drawer, 'game.submit', args), { code: 'ASSET_REQUIRED' });
  for (const key of ['asset', '__asset', 'png']) assert.throws(() => e.run(drawer, 'game.submit', { ...args, [key]: 'untrusted' }, { asset: e.asset(drawer) }), { code: 'UNTRUSTED_ASSET' });
  assert.throws(() => e.run(drawer, 'game.submit', args, { asset: e.asset(drawer, SVG, { taskId: 'old' }) }), { code: 'ASSET_TASK_MISMATCH' });
  assert.throws(() => e.run(drawer, 'game.submit', args, { asset: e.asset(drawer, SVG, { revision: 2 }) }), { code: 'STALE_DOCUMENT' });
  assert.throws(() => e.run(drawer, 'game.submit', args, { asset: e.asset(drawer, SVG, { pngHash: 'bad' }) }), { code: 'ASSET_HASH_MISMATCH' });
  assert.equal(e.game._submissions.length, 0); e.draw(drawer);
  assert.equal(e.game.phase.type, 'guess_window');
});

test('PNG signatures, dimensions, encoded size and metadata are bounded', () => {
  const e = fixture('guess_draw'); e.start(); const drawer = e.choose();
  assert.throws(() => G.validateAsset(e.asset(drawer, SVG, { width: 2 })), { code: 'INVALID_ASSET' });
  assert.throws(() => G.validateAsset(e.asset(drawer, SVG, { png: 'not png' })), { code: 'INVALID_ASSET' });
  const raw = Buffer.from(PNG, 'base64');
  const chunk = Buffer.alloc(12 + 6); chunk.writeUInt32BE(6); chunk.write('tEXt', 4); chunk.write('secret', 8);
  const withMetadata = Buffer.concat([raw.subarray(0, raw.length - 12), chunk, raw.subarray(raw.length - 12)]);
  assert.throws(() => G.validateAsset(e.asset(drawer, SVG, { png: withMetadata.toString('base64'), pngHash: hash(withMetadata) })), { code: 'ASSET_METADATA_FORBIDDEN' });
});

test('512 KiB PNG and 24 MiB game budgets reject excess data without partial submission', () => {
  assert.equal(G.MAX_ASSET_BYTES, 512 * 1024); assert.equal(G.MAX_GAME_BYTES, 24 * 1024 * 1024);
  const e = fixture('guess_draw'); e.start(); e.choose();
  const tooLarge = Buffer.alloc(G.MAX_ASSET_BYTES + 1).toString('base64');
  assert.throws(() => G.validateAsset(e.asset('a', SVG, { png: tooLarge })), { code: 'INVALID_ASSET' });
  e.game._assetBytes = G.MAX_GAME_BYTES;
  const before = JSON.stringify(e.game);
  assert.throws(() => e.draw('a'), { code: 'GAME_BUDGET' });
  assert.equal(JSON.stringify(e.game), before);
});

for (const [count, policy] of [[3, 'participant-confirm'], [4, 'participant-confirm'], [4, 'moderator-strict']]) test(`${count}-connection ${policy} guessing completes every drawer with three checkpoints and fixed scoring`, () => {
  const e = fixture('guess_draw', count, policy); e.start(); finishGuess(e);
  const n = e.game.participants.length;
  assert.equal(e.game.status, 'complete'); assert.equal(e.game._guess.rounds.length, n);
  for (const round of e.game._guess.rounds) assert.equal(round.checkpoints.length, 3);
  for (const id of e.game.participants) assert.deepEqual(e.game.scores[id], { guessed: n - 1, drawing: 1, total: n });
  assert.equal(new Set(e.game._guess.rounds.map(round => round.answer.id)).size, n);
  assert.equal(G.replay(e.game, e.game.participants[0], { limit: 8 }, e.ctx()).total, n * 3);
});

test('single-checkpoint two-player guessing is a complete practice game', () => {
  const e = fixture('guess_draw', 2, 'participant-confirm', { checkpoints: 1 }); e.start(); finishGuess(e);
  assert.equal(e.view('a').practice, true); assert.equal(e.game._guess.rounds.length, 2);
  assert.equal(e.game._guess.rounds[0].checkpoints.length, 1);
});

test('custom word packs reject ambiguous aliases and preserve a frozen version', () => {
  assert.throws(() => fixture('guess_draw', 2, 'participant-confirm', { words: [
    { answer: '自行车', aliases: ['车'] }, { answer: '汽车', aliases: ['车'] }, { answer: '火车' },
  ] }), { code: 'WORD_ALIAS_CONFLICT' });
  const e = fixture('guess_draw', 2, 'participant-confirm', { words: [
    { answer: '自行车', aliases: ['脚踏车', '單車'] }, { answer: '火车' }, { answer: '汽车' }, { answer: '雨伞' },
  ] });
  assert.match(e.game.config.wordPackVersion, /^custom-/); e.start();
  assert.equal(e.task('a').choices[0].text, '自行车');
});

test('guess normalization handles NFKC and aliases without substring or fuzzy matching', () => {
  assert.equal(G.normalizeGuess('  ＢＩＫＥ！ '), 'bike');
  assert.equal(G.normalizeGuess('自行车。'), '自行车');
  for (const text of ['自行车,汽车', '自行车\n汽车', '车\u200b', '', 'x'.repeat(41)]) assert.throws(() => G.normalizeGuess(text), { code: 'GUESS_FORMAT' });
  const e = fixture('guess_draw', 4, 'participant-confirm', { words: [
    { answer: '自行车', aliases: ['脚踏车', '單車', 'bike'] }, { answer: '火车' }, { answer: '汽车' }, { answer: '雨伞' }, { answer: '大象' }, { answer: '猫' },
  ] });
  e.start(); e.choose(); e.draw('a');
  assert.equal(submitGuess(e, 'b', ' ＢＩＫＥ！ ').matched, true);
  assert.equal(submitGuess(e, 'c', '骑自行车').matched, false);
  assert.equal(submitGuess(e, 'd', '腳踏車').matched, false); // Not in this explicitly frozen custom alias set.
});

test('wrong and close words receive the same shape with no correctness hints', () => {
  const e = fixture('guess_draw'); e.start(); e.choose(); e.draw('a');
  const near = submitGuess(e, 'b', '雨衣'), wrong = submitGuess(e, 'c', '汽车');
  delete near.receiptId; delete wrong.receiptId;
  assert.deepEqual(near, wrong); assert.equal(near.matched, false);
  assert.doesNotMatch(JSON.stringify(near), /similar|close|answer|雨伞/);
});

test('a guess, a match and another player’s input do not alter anyone else’s public view', () => {
  const e = fixture('guess_draw'); e.start(); e.choose(); e.draw('a', SVG.replace('</svg>', '<!-- ANSWER_IN_PRIVATE_SVG --></svg>'));
  const before = JSON.stringify(e.view('d')), pub = e.game.publicVersion;
  submitGuess(e, 'b', e.game._guess.current.answer.answer);
  submitGuess(e, 'c', 'PRIVATE_WRONG_GUESS');
  assert.equal(e.game.publicVersion, pub); assert.equal(JSON.stringify(e.view('d')), before);
  assert.equal(e.task('b').locked, true); assert.equal(e.game.phase.type, 'guess_window');
  const spy = JSON.stringify(e.view('a', true));
  assert.doesNotMatch(spy, /PRIVATE_WRONG_GUESS|ANSWER_IN_PRIVATE_SVG|"matchedIds"|"guesses"|"aliases"|<svg/);
  assert.equal(e.view('a', true).reviewQueue, undefined);
});

test('guesses require exact checkpoint/task binding and cannot be batched or changed within a window', () => {
  const e = fixture('guess_draw'); e.start(); e.choose(); e.draw('a');
  assert.throws(() => submitGuess(e, 'b', 'bad', { checkpointId: 'old' }), { code: 'ASSIGNMENT_STALE' });
  assert.throws(() => submitGuess(e, 'b', '雨伞,汽车'), { code: 'GUESS_FORMAT' });
  const first = submitGuess(e, 'b', '错词');
  assert.deepEqual(submitGuess(e, 'b', '错词'), first);
  assert.throws(() => submitGuess(e, 'b', e.game._guess.current.answer.answer), { code: 'GUESS_LIMIT' });
  assert.equal(e.game._guess.current.guesses.filter(item => item.actorId === 'b').length, 1);
});

test('old guess tasks are rejected at the next checkpoint and earlier match remains privately locked', () => {
  const e = fixture('guess_draw'); e.start(); e.choose(); e.draw('a');
  const old = e.task('c'); submitGuess(e, 'b', e.game._guess.current.answer.answer);
  e.expire(); e.draw('a');
  assert.equal(e.task('b').locked, true); assert.deepEqual(e.task('b').allowedActions, []);
  assert.throws(() => e.run('c', 'game.guess', { taskId: old.id, phaseId: old.phaseId, checkpointId: old.checkpointId, guess: 'x' }), { code: 'ASSIGNMENT_STALE' });
});

test('scores are published only at reveal and repeated ticks cannot duplicate them', () => {
  const e = fixture('guess_draw', 3, 'participant-confirm', { checkpoints: 1 }); e.start(); e.choose(); e.draw('a');
  submitGuess(e, 'b', e.game._guess.current.answer.answer); submitGuess(e, 'c', 'wrong');
  assert.equal(e.view('b').scores.b.total, 0); e.expire();
  assert.equal(e.game.phase.type, 'round_reveal'); assert.equal(e.game.scores.b.guessed, 1);
  assert.equal(e.game.scores.a.drawing, 0.5);
  const before = JSON.stringify(e.game.scores);
  assert.equal(G.tick(e.game, e.ctx()), false); assert.equal(JSON.stringify(e.game.scores), before);
  assert.ok(e.view('c').revealedRound.answer);
});

test('guess replay never exposes future/current unrevealed rounds or the raw source by default', () => {
  const e = fixture('guess_draw', 3, 'participant-confirm', { checkpoints: 1 }); e.start(); e.choose();
  assert.throws(() => G.replay(e.game, 'b', {}, e.ctx()), { code: 'CONTENT_NOT_VISIBLE' });
  e.draw('a', SVG.replace('</svg>', '<!-- OWNER_ONLY_SOURCE --></svg>')); e.expire();
  const disclosed = G.replay(e.game, 'b', { includeSource: true }, e.ctx());
  assert.equal(disclosed.total, 1); assert.equal(disclosed.entries[0].svg, undefined);
  assert.ok(G.replay(e.game, 'a', { includeSource: true }, e.ctx()).entries[0].svg);
  e.advance(); e.choose();
  const replay = G.replay(e.game, 'c', {}, e.ctx());
  assert.equal(replay.total, 1); assert.equal(replay.entries[0].round.drawerId, 'a');
  assert.doesNotMatch(JSON.stringify(replay), /OWNER_ONLY_SOURCE|"aliases"|"candidates"/);
});

test('neutral review cannot see secret answer/candidates, and rejection invalidates a first no-image round', () => {
  const e = fixture('guess_draw', 4, 'moderator-strict'); e.start(); const drawer = e.choose(); e.draw(drawer);
  const view = e.view('a', true), secret = e.game._guess.current.answer.answer;
  assert.equal(view.reviewQueue.length, 1); assert.doesNotMatch(JSON.stringify(view), new RegExp(secret));
  const item = view.reviewQueue[0];
  e.admin('game.review', { submissionId: item.submissionId, hash: item.hash, decision: 'reject', reason: 'MUST_NOT_BROADCAST' });
  assert.equal(e.game.phase.type, 'round_reveal'); assert.equal(e.game._guess.current.invalidated, true);
  assert.equal(Object.values(e.game.scores).reduce((sum, score) => sum + score.total, 0), 0);
  assert.doesNotMatch(JSON.stringify(e.view('b')), /MUST_NOT_BROADCAST/);
});

test('later missing or rejected checkpoints reuse only the last approved public picture', () => {
  const e = fixture('guess_draw', 3, 'moderator-strict'); e.start(); const drawer = e.choose(); e.draw(drawer); e.approve();
  const first = e.game._guess.current.checkpoints[0].assetId;
  e.expire(); // The next drawing phase is deliberately left empty.
  e.expire();
  assert.equal(e.game.phase.type, 'guess_window');
  assert.equal(e.game._guess.current.checkpoints[1].assetId, first);
  assert.equal(Object.keys(e.game._assets).length, 1);
});

test('no first picture means an invalidated round, not an SVG fallback or an automatic model drawing', () => {
  const e = fixture('guess_draw'); e.start(); e.expire(); // Selection timeout uses the first private option.
  assert.equal(e.game.phase.type, 'draw_private'); e.expire();
  assert.equal(e.game.phase.type, 'round_reveal'); assert.equal(e.game._guess.current.invalidated, true);
  assert.equal(e.view('b').currentImage, undefined);
});

test('pause preserves a partially submitted telephone step and resumes with new phase preconditions', () => {
  const e = fixture(); e.start();
  e.text('a', 'KEEP_THIS_SUBMISSION');
  const old = e.task('b'), remaining = e.game.phase.deadlineAt - e.now;
  e.admin('game.pause', { paused: true });
  assert.throws(() => e.text('b', 'not now'), { code: 'GAME_PAUSED' });
  e.now += 500; e.admin('game.pause', { paused: false });
  assert.equal(e.game.phase.deadlineAt - e.now, remaining); assert.notEqual(e.game.phase.id, old.phaseId);
  assert.throws(() => e.run('b', 'game.submit', { taskId: old.id, phaseId: old.phaseId, text: 'old' }), { code: 'ASSIGNMENT_STALE' });
  for (const id of ['b', 'c', 'd']) e.text(id, `after-${id}`);
  assert.equal(e.task('b').input.text, 'KEEP_THIS_SUBMISSION');
});

test('pause budget expires automatically and cannot be reused forever', () => {
  const e = fixture(); e.start(); e.admin('game.pause', { paused: true });
  e.now += 2000; assert.equal(G.tick(e.game, e.ctx()), true);
  assert.equal(e.game.status, 'active');
  assert.throws(() => e.admin('game.pause', { paused: true }), { code: 'PAUSE_LIMIT' });
});

test('late pause cannot reopen a deadline and delayed ticks cannot enlarge the pause budget', () => {
  const e = fixture(); e.start();
  const phase = e.game.phase.id;
  assert.throws(() => e.admin('game.pause', { phaseId: 'old', paused: true }), { code: 'ASSIGNMENT_STALE' });
  e.now = e.game.phase.deadlineAt;
  assert.throws(() => e.admin('game.pause', { paused: true }), { code: 'PHASE_CLOSED' });
  e.now -= 500; e.admin('game.pause', { paused: true });
  e.now += 10000;
  assert.equal(G.tick(e.game, e.ctx()), true);
  assert.equal(e.game.status, 'active'); assert.equal(e.game._pauseUsedMs, 2000);
  assert.notEqual(e.game.phase.id, phase); assert.equal(e.game.phase.type, 'draw_private');
  assert.equal(e.game._telephone.step, 1);
});

test('abort and host departure seal current secrets and reject further writes', () => {
  const e = fixture('guess_draw'); e.start(); e.choose();
  const answer = e.game._guess.current.answer.answer;
  assert.throws(() => e.run('b', 'game.abort'), { code: 'FORBIDDEN' });
  assert.equal(G.tick(e.game, e.ctx(false, { hostLeft: true })), true);
  assert.equal(e.game.status, 'aborted'); assert.equal(e.view('b').abortReason, 'host_left');
  assert.doesNotMatch(JSON.stringify(e.view('b')), new RegExp(answer));
  assert.throws(() => G.replay(e.game, 'b', {}, e.ctx()), { code: 'CONTENT_NOT_VISIBLE' });
  assert.throws(() => e.admin('game.advance'), { code: 'PHASE_CLOSED' });
});

test('serialized recovery keeps trusted assets once and preserves role-specific state', () => {
  const e = fixture('telephone', 4); e.start(); finishTelephone(e);
  const source = JSON.stringify(e.game); e.game = JSON.parse(source);
  assert.equal(Object.keys(e.game._assets).length, 8);
  assert.equal((source.match(new RegExp(PNG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 8);
  assert.equal(G.replay(e.game, 'a', { limit: 8 }, e.ctx()).entries.length, 8);
  assert.doesNotMatch(JSON.stringify(e.view('b')), /<svg|"_assets"|"chains":\[/);
});

test('game read commands use projections and do not expose the authority object', () => {
  const e = fixture('guess_draw'); e.start(); e.choose(); e.draw('a');
  const status = e.run('b', 'game.status'), task = e.run('b', 'game.task');
  assert.equal(status.task.id, task.id);
  assert.doesNotMatch(JSON.stringify({ status, task }), /"_pack"|"_submissions"|"svg"|"aliases"|"answer"/);
  assert.throws(() => e.run('b', 'arbitrary.command'), { code: 'UNKNOWN_COMMAND' });
});
