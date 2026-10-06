// 독립 정답표·전수 탐색·실제 상태 전이 시뮬레이션·메모리 안 고의 변이 검사.
// 실행: fnm exec --using=.node-version node tests/rummikub-logic.js
// D-057 난도 인수 기준: 같은 명령 끝에 --acceptance. 완전한 줄을 노리는 학생을 기준으로 삼는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const modulePath = path.join(__dirname, '../games/rummikub/rummikub.js');
const source = fs.readFileSync(modulePath, 'utf8');
const mutant = process.argv.find(x => x.startsWith('--mutant='))?.split('=')[1];
// Opus mutate.js의 12개 결함 모델. 바뀐 D-056 계약 두 개는 새 규칙의 역변이로 갱신한다.
const mutations = {
  completed4: ['if (judgment.ok && judgment.complete) counts', 'if (judgment.ok && set.tiles.length >= 4) counts'],
  skipStage: ["if (pairs.some(([a, b]) => b.number !== a.number + 1)) return reject('stageGap');", "if (pairs.some(([a, b]) => b.number <= a.number)) return reject('stageGap');"],
  dupIdsInMove: ['if (new Set(move.tiles).size !== move.tiles.length || Array.from(move.tiles)', 'if (Array.from(move.tiles)'],
  handByType: ['s.hand = s.hand.filter(id => !move.tiles.includes(id));', "s.hand = s.hand.filter(id => !move.tiles.some(m => m.split(':')[0] === id.split(':')[0]));"],
  constraintLastOnly: ['ts.some(t => t.stage === rule.stage && !rule.allowed.includes(t.id))', 'ts[ts.length - 1].stage === rule.stage && !rule.allowed.includes(ts[ts.length - 1].id)'],
  shuffleBias: ['const j = Math.floor(random() * (i + 1));', 'const j = Math.floor(random() * i);'],
  noRevisionOnSuccess: ['const s = copy(state); s.revision++;', 'const s = copy(state);'],
  countNonSignals: ["if (judgment.misconception || judgment.reason === 'outOfScope') failed.signals[judgment.reason]++;", 'if (judgment.reason) failed.signals[judgment.reason] = (failed.signals[judgment.reason] || 0) + 1;'],
  groupPlantOrganTS: ["if (ts.some(t => t.kingdom === 'animal' && t.stage === 'organ') && ts.some(t => t.stage === 'tissueSystem'))", "if (ts.some(t => t.stage === 'organ') && ts.some(t => t.stage === 'tissueSystem'))"],
  systemAnyPlant: ["a.kingdom === 'plant' && a.stage === 'organ' && b.kingdom === 'animal' && b.stage === 'organSystem'", "a.kingdom === 'plant' && b.kingdom === 'animal' && b.stage === 'organSystem'"],
  drawEmptyDeckNoLoss: ["else return failure(reject('deckEmpty'));", "else { s.phase = 'lost'; s.endReason = 'deckEmpty'; }"],
  hiddenOrderSort: ["if (set.kind === 'line') ids.sort((a, b) => tile(a).number - tile(b).number);", ''],
  constraints: ['for (const rule of LINE_CONSTRAINTS)', 'for (const rule of [])'],
  duplicates: ['new Set(ts.map(t => t.id)).size !== ts.length', 'false'],
  scope: ["if (outside.length) return reject('outOfScope'", "if (outside.length) return reject('relationError'"],
  stars: ['if (full.animal && full.plant) return 3;', 'if (full.animal || full.plant) return 3;'],
  attach: ['validateLine(ids) : validateGroup(ids)', "(move.type === 'attach' ? { ok: true } : validateLine(ids)) : validateGroup(ids)"],
  atomic: ['const failed = copy(state);', 'const failed = copy(s);'],
  priority: ["return reject('systemInPlant');", "return reject('kingdomMix');"],
  noAttemptLimit: ['if (failed.attemptsRemaining === 0)', 'if (false)'],
  noForcedDraw: ['if (failed.deck.length)', 'if (false)'],
  countIgnored: ["const unchanged = reason => ({ state,", "const unchanged = reason => ({ state: { ...state, attemptsRemaining: state.attemptsRemaining - 1 },"],
  countMalformed: ['function failure(judgment, attemptCounted = false)', 'function failure(judgment, attemptCounted = true)'],
  skipUnsignaledFailure: ['if (attemptCounted) {', 'if (attemptCounted && judgment.misconception) {'],
  noAttemptReset: ["s.phase === 'playing' ? RULES.attemptLimit : 0", "s.phase === 'playing' ? s.attemptsRemaining : 0"],
  emptyDeckNoAdvance: ['finishTurn(failed); turnAdvanced = true;', 'if (autoDrawn) { finishTurn(failed); turnAdvanced = true; }'],
  acceptThirdFailure: ['state: failed, accepted: false', 'state: failed, accepted: turnAdvanced']
};
let R, evaluatedSource = source;
if (mutant) {
  assert(mutations[mutant], '알 수 없는 변이');
  const [from, to] = mutations[mutant]; assert(source.includes(from), '변이 대상 없음');
  evaluatedSource = source.replace(from, to);
  const context = vm.createContext({}); vm.runInContext(evaluatedSource, context); R = context.Rummikub;
} else R = require(modulePath);
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.message); } }
const plain = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepEqual(plain(a), plain(b));
const deepFreeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };

// 설계 문서에서 별도로 옮긴 표. 모듈의 관계표나 단계 순서로 정답을 만들지 않는다.
const ANIMAL = [
  ['상피 세포', '신경 세포(뉴런)', '심장 근육 세포'], ['상피 조직', '신경 조직', '근육 조직'],
  ['위', '뇌', '심장'], ['소화계', '신경계', '순환계'], ['사람', '고양이', '개구리']
];
const PLANT = [
  ['공변세포', '물관을 이루는 세포', '울타리 조직 세포'], ['표피 조직', '물관', '울타리 조직'],
  ['표피 조직계', '관다발 조직계', '기본 조직계'], ['잎', '줄기'], ['해바라기', '강낭콩', '토마토']
];
const ARROWS = [
  ['상피 세포', '상피 조직'], ['신경 세포(뉴런)', '신경 조직'], ['심장 근육 세포', '근육 조직'],
  ['상피 조직', '위'], ['근육 조직', '심장'], ['근육 조직', '위'], ['신경 조직', '뇌'],
  ['위', '소화계'], ['뇌', '신경계'], ['심장', '순환계'],
  ['소화계', '사람'], ['소화계', '고양이'], ['소화계', '개구리'],
  ['신경계', '사람'], ['신경계', '고양이'], ['신경계', '개구리'],
  ['순환계', '사람'], ['순환계', '고양이'], ['순환계', '개구리'],
  ['공변세포', '표피 조직'], ['물관을 이루는 세포', '물관'], ['울타리 조직 세포', '울타리 조직'],
  ['표피 조직', '표피 조직계'], ['물관', '관다발 조직계'], ['울타리 조직', '기본 조직계'],
  ['표피 조직계', '잎'], ['표피 조직계', '줄기'], ['관다발 조직계', '잎'], ['관다발 조직계', '줄기'], ['기본 조직계', '잎'], ['기본 조직계', '줄기'],
  ['잎', '해바라기'], ['잎', '강낭콩'], ['잎', '토마토'], ['줄기', '해바라기'], ['줄기', '강낭콩'], ['줄기', '토마토']
];
const SCOPES = [['상피 조직', '심장'], ['상피 조직', '뇌'], ['근육 조직', '뇌'], ['신경 조직', '심장'], ['신경 조직', '위']];
const arrowKeys = new Set(ARROWS.map(x => x.join('|')));
const ids = names => names.map(name => { const t = R.TILES.find(x => x.name === name); assert(t, name); return t.id; });
const names = ts => ts.map(id => R.tile(id).name);
const fullAnimal = ids(['상피 세포', '상피 조직', '위', '소화계', '사람']);
const fullPlant = ids(['공변세포', '표피 조직', '표피 조직계', '잎', '해바라기']);
function conflict(ns) { return ns.includes('줄기') && (ns.includes('울타리 조직 세포') || ns.includes('울타리 조직')) || ns.includes('심장 근육 세포') && (ns.includes('위') || ns.includes('뇌')); }
function products(rows) { return rows.reduce((xs, row) => xs.flatMap(x => row.map(y => [...x, y])), [[]]); }
const paths = [];
for (const [kingdom, table] of [['animal', ANIMAL], ['plant', PLANT]]) {
  for (let length = 3; length <= 5; length++) for (let start = 0; start + length <= 5; start++) {
    for (const ns of products(table.slice(start, start + length))) {
      const adjacent = ns.slice(1).every((n, i) => arrowKeys.has(ns[i] + '|' + n));
      paths.push({ kingdom, ns, tiles: ids(ns), adjacent, conflict: conflict(ns) });
    }
  }
}
const legalLines = paths.filter(p => p.adjacent && !p.conflict);

// 상태 예시는 실제 58장 가운데 골라 쓴다. 나머지는 뽑을 패로 두어 장수 보존도 검사한다.
function fixture(hand, board = [], options = {}) {
  const s = R.newGame(1, options), available = R.DECK.slice();
  const take = type => { const i = available.findIndex(id => R.tile(id).id === type); assert(i >= 0, type + ' 패 부족'); return available.splice(i, 1)[0]; };
  s.board = board.map((set, i) => ({ id: i + 1, kind: set.kind, tiles: set.tiles.map(take) }));
  s.hand = hand.map(take); s.deck = available; s.nextSetId = board.length + 1; return s;
}
const submit = (s, moves) => R.act(s, { type: 'play', token: s.revision, moves });
const place = (kind, tiles) => ({ type: 'place', kind, tiles });
const draw = s => R.act(s, { type: 'draw', token: s.revision });
function checkState(s) {
  eq([...s.hand, ...s.deck, ...s.board.flatMap(x => x.tiles)].sort(), R.DECK.slice().sort());
  assert.equal(new Set(s.board.map(x => x.id)).size, s.board.length);
  for (const set of s.board) assert((set.kind === 'line' ? R.validateLine(set.tiles) : R.validateGroup(set.tiles)).ok);
  assert(s.turns <= s.turnLimit);
  assert(Number.isInteger(s.attemptsRemaining));
  assert(s.phase === 'playing' ? s.attemptsRemaining >= 1 && s.attemptsRemaining <= 3 : s.attemptsRemaining === 0);
  if (s.phase === 'won') assert.equal(referenceStars(s), 3);
  assert.equal(R.detail(s).misconceptionTotal, R.SIGNALS.reduce((n, k) => n + s.signals[k], 0));
}

test('패 29종·58장, 교사 용어·단계·순번 독립 표 대조', () => {
  assert.equal(R.TILES.length, 29); assert.equal(R.DECK.length, 58); assert.equal(new Set(R.DECK).size, 58);
  for (const [kingdom, table, stages] of [['animal', ANIMAL, ['cell', 'tissue', 'organ', 'organSystem', 'individual']], ['plant', PLANT, ['cell', 'tissue', 'tissueSystem', 'organ', 'individual']]]) {
    table.forEach((row, n) => row.forEach(name => {
      const t = R.tile(ids([name])[0]); eq([t.kingdom, t.stage, t.number, t.count], [kingdom, stages[n], n + 1, 2]);
      assert.equal(R.DECK.filter(id => R.tile(id).id === t.id).length, 2);
    }));
  }
  assert.equal(R.tile('__proto__'), null); assert.equal(R.tile('heart:2'), null);
});
test('관계표 37쌍과 범위 밖 5쌍 독립 정답표 일치', () => {
  const pairs = table => Object.entries(table).flatMap(([a, bs]) => bs.map(b => names([a, b]).join('|'))).sort();
  eq(pairs(R.RELATIONS), ARROWS.map(x => x.join('|')).sort());
  eq(pairs(R.OUT_OF_SCOPE), SCOPES.map(x => x.join('|')).sort());
  assert.equal(R.LINE_CONSTRAINTS.length, 2);
});
test('연속 3~5장 전수: 쌍은 참·전체는 거짓, 완전한 줄 동물 9·식물 15', () => {
  const stats = { total: paths.length, adjacent: 0, rejected: 0, animal: 0, plant: 0, rawAnimal: 0, rawPlant: 0 };
  for (const p of paths) {
    const got = R.validateLine(p.tiles);
    assert.equal(got.ok, p.adjacent && !p.conflict, p.ns.join(' → '));
    if (!p.adjacent) continue;
    stats.adjacent++;
    if (p.conflict) { stats.rejected++; assert.equal(got.reason, 'lineConflict'); }
    if (p.tiles.length === 5) {
      stats[p.kingdom === 'animal' ? 'rawAnimal' : 'rawPlant']++;
      if (!p.conflict) { stats[p.kingdom]++; assert(got.complete && !got.partial); }
    } else if (!p.conflict) assert(got.partial && !got.complete);
  }
  eq([stats.rawAnimal, stats.rawPlant, stats.animal, stats.plant], [12, 18, 9, 15]);
  console.log('전수 수치 ' + JSON.stringify(stats));
});
test('부분 사슬·근육 조직→위·공변세포→줄기 허용과 제약 반례', () => {
  for (const ns of [['상피 세포', '상피 조직', '위'], ['근육 조직', '위', '소화계'], ['공변세포', '표피 조직', '표피 조직계', '줄기', '토마토']]) assert(R.validateLine(ids(ns)).ok);
  for (const ns of [['심장 근육 세포', '근육 조직', '위'], ['울타리 조직', '기본 조직계', '줄기'], ['울타리 조직 세포', '울타리 조직', '기본 조직계', '줄기']]) assert.equal(R.validateLine(ids(ns)).reason, 'lineConflict');
  assert.equal(R.validateLine(fullAnimal.slice(0, 2)).reason, 'tooShort');
});
test('묶음 단계·서로 다른 이름: 중복 금지, 기관과 개체는 계를 넘어 허용', () => {
  assert(R.validateGroup(ids(['위', '뇌', '잎'])).ok); assert(R.validateGroup(ids(['사람', '개구리', '토마토'])).ok);
  assert.equal(R.validateGroup(ids(['잎', '잎', '줄기'])).reason, 'duplicateGroup');
  assert.equal(R.validateGroup(['leaf:0', 'leaf:1', 'stem:0']).reason, 'duplicateGroup');
  assert.equal(R.validateGroup(ids(['위', '표피 조직계', '기본 조직계'])).reason, 'tissueSystemInAnimal');
  assert.equal(R.validateGroup(ids(['소화계', '신경계', '잎'])).reason, 'numberGroup');
  assert.equal(R.validateGroup(ids(['사람', '잎', '공변세포'])).reason, 'stageGroup');
});
test('묶음 3장 전수 4,495조합: 단계 이름·이름 중복을 독립 표로 판정', () => {
  const reference = new Map();
  for (const [table, stages] of [[ANIMAL, ['cell', 'tissue', 'organ', 'organSystem', 'individual']], [PLANT, ['cell', 'tissue', 'tissueSystem', 'organ', 'individual']]]) {
    table.forEach((row, i) => row.forEach(name => reference.set(name, stages[i])));
  }
  const ns = [...reference.keys()]; let total = 0, allowed = 0;
  for (let a = 0; a < ns.length; a++) for (let b = a; b < ns.length; b++) for (let c = b; c < ns.length; c++) {
    const chosen = [ns[a], ns[b], ns[c]], expected = a !== b && b !== c && chosen.every(n => reference.get(n) === reference.get(chosen[0]));
    assert.equal(R.validateGroup(ids(chosen)).ok, expected, chosen.join('·'));
    total++; if (expected) allowed++;
  }
  assert.equal(total, 4495); assert.equal(allowed, 72);
  console.log('묶음 전수 ' + total + '조합, 허용 ' + allowed + '조합');
});
test('잘못된 패·빈 제출·잘못된 붙이기 위치는 신호 없이 거부', () => {
  for (const input of [null, {}, ['없는 패', 'heart', 'brain'], new Array(3)]) {
    assert.equal(R.validateLine(input).reason, 'invalidTile'); assert.equal(R.validateGroup(input).reason, 'invalidTile');
  }
  const s = fixture(fullAnimal);
  for (const moves of [[], [null], [{ type: 'place', kind: 'unknown', tiles: s.hand }], [{ type: 'attach', setId: 999, side: 'end', tiles: s.hand }]]) {
    const out = submit(s, moves); assert(!out.accepted); assert.equal(out.state.turns, 0); assert.equal(R.detail(out.state).misconceptionTotal, 0);
    eq(out.state.hand, s.hand); eq(out.state.board, s.board);
  }
});
test('오개념 신호 우선 순위와 정확한 단계 필드 판정', () => {
  for (const [ns, reason] of [
    [['공변세포', '잎', '순환계'], 'systemInPlant'],
    [['상피 조직', '기본 조직계', '잎'], 'tissueSystemInAnimal'],
    [['위', '표피 조직', '물관'], 'kingdomMix'],
    [['위', '상피 조직', '상피 세포'], null],
    [['심장 근육 세포', '신경 조직', '뇌'], 'relationError'],
    [['물관', '기본 조직계', '잎'], 'relationError'],
    [['공변세포', '물관', '관다발 조직계'], 'relationError'],
    [['상피 세포', '상피 조직', '뇌', '소화계'], 'relationError']
  ]) assert.equal(R.validateLine(ids(ns)).reason, reason, ns.join(' → '));
  assert(R.validateLine(ids(['표피 조직', '표피 조직계', '잎'])).ok);
});
test('범위 밖 5쌍: 제출 맥락만 기록하고 오개념 합계에서 제외', () => {
  for (const [a, b] of SCOPES) {
    const next = { 위: '소화계', 뇌: '신경계', 심장: '순환계' }[b];
    const s = fixture(ids([a, b, next])); const out = submit(s, [place('line', s.hand)]);
    assert(!out.accepted); assert.equal(out.reason, 'outOfScope'); assert.equal(out.state.signals.outOfScope, 1);
    assert.equal(R.detail(out.state).misconceptionTotal, 0); eq(out.state.hand, s.hand); assert.equal(out.state.turns, 0);
  }
});
test('잘못된 제출 하나는 신호 하나, 중복 token은 집계하지 않음', () => {
  let s = fixture(ids(['상피 조직', '기본 조직계', '잎', '순환계']));
  const action = { type: 'play', token: s.revision, moves: [place('line', s.hand)] };
  s = R.act(s, action).state; assert.equal(R.detail(s).misconceptionTotal, 1); assert.equal(s.signals.systemInPlant, 1);
  const again = R.act(s, action); assert.equal(again.reason, 'stale'); assert.strictEqual(again.state, s);
});
test('양끝 붙이기: 기존 3·4장 줄의 전체 제약을 재검사', () => {
  // 오른쪽에 기관을 붙일 수 있는 3장 부분 사슬은 식물뿐이다. 동물은 왼쪽 세포 붙이기로 반례를 만든다.
  const cases = [
    { board: ids(['근육 조직', '위', '소화계']), hand: ids(['심장 근육 세포']), side: 'start' },
    { board: ids(['근육 조직', '위', '소화계', '사람']), hand: ids(['심장 근육 세포']), side: 'start' },
    { board: ids(['울타리 조직 세포', '울타리 조직', '기본 조직계']), hand: ids(['줄기']), side: 'end' },
    { board: ids(['기본 조직계', '줄기', '토마토']), hand: ids(['울타리 조직']), side: 'start' }
  ];
  for (const c of cases) {
    const s = fixture(c.hand, [{ kind: 'line', tiles: c.board }]); const out = submit(s, [{ type: 'attach', setId: 1, side: c.side, tiles: s.hand }]);
    assert(!out.accepted); assert.equal(out.reason, 'lineConflict'); eq(out.state.board, s.board); eq(out.state.hand, s.hand);
  }
});
test('여러 작업 원자성: 뒤 작업이 실패하면 앞 작업도 취소', () => {
  const s = fixture([...fullAnimal.slice(0, 3), ...ids(['잎', '잎', '줄기'])]);
  const out = submit(s, [place('line', s.hand.slice(0, 3)), place('group', s.hand.slice(3))]);
  assert(!out.accepted); eq(out.state.board, []); eq(out.state.hand, s.hand); assert.equal(out.state.nextSetId, 1);
  assert.equal(out.state.turns, 0); assert.equal(out.state.signals.duplicateGroup, 1);
});
test('한 턴 여러 세트와 양끝 붙이기, 중복 패·판 재배치 차단', () => {
  let s = fixture([...fullAnimal, ...fullPlant]);
  const out = submit(s, [place('line', s.hand.slice(1, 4)), { type: 'attach', setId: 1, side: 'start', tiles: s.hand.slice(0, 1) },
    { type: 'attach', setId: 1, side: 'end', tiles: s.hand.slice(4, 5) }, place('line', s.hand.slice(5))]);
  assert(out.accepted); assert.equal(out.state.turns, 1); assert.equal(R.stars(out.state), 3); checkState(out.state);
  s = fixture(fullAnimal);
  for (const moves of [[place('line', [s.hand[0], s.hand[0], s.hand[2]])], [place('line', s.hand.slice(0, 3)), place('line', s.hand.slice(0, 3))], [{ type: 'rearrange', tiles: s.hand }]]) {
    const bad = submit(s, moves); assert(!bad.accepted); eq(bad.state.board, []); eq(bad.state.hand, s.hand);
  }
  assert.equal(submit(s, [place('line', fullAnimal)]).reason, 'notInHand');
});
test('묶음 양끝 붙이기와 같은 이름 붙이기 차단', () => {
  for (const side of ['start', 'end']) {
    const s = fixture(ids(['잎', '줄기']), [{ kind: 'group', tiles: ids(['위', '뇌', '심장']) }]);
    const out = submit(s, [{ type: 'attach', setId: 1, side, tiles: s.hand }]); assert(out.accepted); assert.equal(R.stars(out.state), 0); checkState(out.state);
    const duplicate = fixture(ids(['잎']), [{ kind: 'group', tiles: ids(['위', '뇌', '잎']) }]);
    assert.equal(submit(duplicate, [{ type: 'attach', setId: 1, side, tiles: duplicate.hand }]).reason, 'duplicateGroup');
  }
});
// stars/completed/validateLine에 의존하지 않는 실제 판의 독립 정답.
function referenceStars(s) {
  const full = new Set(), partial = new Set();
  for (const set of s.board.filter(x => x.kind === 'line')) {
    const ns = names(set.tiles);
    const match = legalLines.find(p => p.ns.join('|') === ns.join('|'));
    if (match && ns.length === 5) full.add(match.kingdom);
    if (match && ns.length >= 4) partial.add(match.kingdom);
  }
  return full.size === 2 ? 3 : full.size ? 2 : partial.size === 2 ? 1 : 0;
}
test('별 경계: 손패와 무관, 4장 줄은 완전한 줄 아님, 두 계 4장부터 별 1', () => {
  for (const [sets, expected] of [
    [[], 0], [[fullAnimal.slice(0, 3)], 0], [[fullAnimal.slice(0, 4)], 0],
    [[fullAnimal.slice(0, 3), fullPlant.slice(0, 4)], 0],
    [[fullAnimal.slice(0, 4), fullPlant.slice(0, 4)], 1],
    [[fullAnimal], 2], [[fullPlant], 2], [[fullAnimal, fullPlant], 3]
  ]) {
    const start = fixture([...sets.flat(), ...ids(['고양이'])], [], { turnLimit: 1 }); let at = 0;
    const end = sets.length ? submit(start, sets.map(ts => { const m = place('line', start.hand.slice(at, at + ts.length)); at += ts.length; return m; })).state : draw(start).state;
    assert.equal(R.stars(end), expected); assert.equal(referenceStars(end), expected);
    eq(R.completed(end), { animal: sets.filter(ts => ts.length === 5 && ts[0] === fullAnimal[0]).length, plant: sets.filter(ts => ts.length === 5 && ts[0] === fullPlant[0]).length });
    assert.equal(end.phase, expected === 3 ? 'won' : 'lost'); assert(end.hand.length > 0);
  }
  const sets = [ids(['상피 세포', '신경 세포(뉴런)', '심장 근육 세포', '공변세포', '물관을 이루는 세포']),
    ids(['상피 조직', '신경 조직', '근육 조직', '표피 조직', '물관']), ids(['사람', '고양이', '개구리', '토마토'])];
  const start = fixture(sets.flat()); let at = 0;
  const end = submit(start, sets.map(ts => { const m = place('group', start.hand.slice(at, at + ts.length)); at += ts.length; return m; })).state;
  assert.equal(end.hand.length, 0); assert.equal(end.phase, 'playing'); assert.equal(R.stars(end), 0); assert.equal(R.score(end), 6);
  assert(draw(end).accepted);
});
test('붙여서 만든 완전한 줄도 별에 반영, 마지막 허용 턴 성공', () => {
  for (const [line, side] of [[fullAnimal, 'start'], [fullPlant, 'end']]) {
    const s = fixture(side === 'start' ? line.slice(0, 2) : line.slice(3), [{ kind: 'line', tiles: side === 'start' ? line.slice(2) : line.slice(0, 3) }], { turnLimit: 1 });
    const end = submit(s, [{ type: 'attach', setId: 1, side, tiles: s.hand }]).state;
    assert.equal(end.phase, 'lost'); assert.equal(R.stars(end), 2);
  }
});
test('뽑기 1장·턴 상한·덱 소진·종료 잠금', () => {
  const s = R.newGame(7, { turnLimit: 1 }); const out = draw(s);
  eq(out.state.hand, [...s.hand, s.deck[0]]); eq(out.state.deck, s.deck.slice(1)); assert.equal(out.state.draws, 1);
  assert.equal(out.state.phase, 'lost'); assert.equal(out.state.endReason, 'turnLimit'); assert.equal(R.stars(out.state), 0);
  assert.strictEqual(draw(out.state).state, out.state);
  let all = R.newGame(8, { turnLimit: 100 }); for (let i = 0; i < 44; i++) all = draw(all).state;
  assert.equal(all.hand.length, 58); assert.equal(all.phase, 'playing');
  const afterPlay = submit(all, [place('line', fullAnimal.map(type => all.hand.find(id => R.tile(id).id === type)))]);
  assert(afterPlay.accepted); assert.equal(afterPlay.state.phase, 'playing'); checkState(afterPlay.state);
  const empty = draw(all);
  assert(!empty.accepted); assert.equal(empty.reason, 'deckEmpty'); assert.equal(empty.state.phase, 'playing'); assert.equal(empty.state.turns, 44); assert.equal(empty.state.revision, all.revision + 1); eq(empty.state.signals, all.signals); assert(empty.message.includes('뽑을 패가 없습니다')); checkState(empty.state);
});
test('시드 0 포함 재현성·장수 보존·입력과 반환 상태 불변성', () => {
  for (const seed of [0, 1, 2, 17, 0xffffffff]) {
    const a = deepFreeze(R.newGame(seed)), b = R.newGame(seed); eq(a, b); checkState(a);
    const action = deepFreeze({ type: 'draw', token: a.revision }); const next = R.act(a, action).state;
    eq(a, b); checkState(next); next.hand.push('가상값'); assert.equal(a.hand.length, 14);
  }
  assert.notDeepEqual(R.newGame(1).hand, R.newGame(2).hand);
  for (const seed of [-1, NaN, Infinity, 1.5, '1', 0x100000000]) assert.throws(() => R.newGame(seed));
  for (const turnLimit of [0, -1, 101, 1.5, NaN]) assert.throws(() => R.newGame(1, { turnLimit }));
  const s = deepFreeze(fixture(fullAnimal, [], { turnLimit: 1 })); const before = plain(s);
  const won = submit(s, [place('line', s.hand)]).state; eq(s, before);
  const report = R.result(won); report.detail.completeLines.animal = 999; assert.equal(R.completed(won).animal, 1);
  assert(Object.isFrozen(R.TILES[0]) && Object.isFrozen(R.RELATIONS.muscle) && Object.isFrozen(R.LINE_CONSTRAINTS[0].triggers));
});
test('브라우저 UMD·외부 무작위/시계/저장소 없이 실행, 결과 문장', () => {
  const context = vm.createContext({ window: {}, Date: undefined, localStorage: undefined, document: undefined });
  vm.runInContext('Math.random = () => { throw new Error("외부 무작위"); };', context);
  vm.runInContext(evaluatedSource, context); eq(context.window.Rummikub.newGame(9), R.newGame(9));
  assert.equal(R.result(R.newGame(1)), null);
  const s = fixture(fullPlant, [], { turnLimit: 1 }), won = submit(s, [place('line', s.hand)]).state, result = R.result(won);
  assert.equal(result.quiz.answer, 0); eq(result.quiz.options, ['조직계', '기관계']); assert(result.reflection.includes('사람과 해바라기'));
  assert(result.lines.join(' ').includes('동물 0개, 식물 1개')); assert(result.lines.join(' ').includes('성취수준이 아닙니다'));
});


test('관계 오류 우선 전수: 거짓 쌍 → 줄 제약 → 범위 밖, 모든 입력 순열 동일', () => {
  const scopes = new Set(SCOPES.map(x => x.join('|')));
  function permutations(xs) { return xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map(t => [x, ...t])) : [[]]; }
  let total = 0, outside = 0;
  for (const p of paths) {
    const missing = p.ns.slice(1).map((n, i) => p.ns[i] + '|' + n).filter(k => !arrowKeys.has(k));
    const expected = missing.some(k => !scopes.has(k)) ? 'relationError' : p.conflict ? 'lineConflict' : missing.length ? 'outOfScope' : null;
    for (const ts of permutations(p.tiles)) {
      assert.equal(R.validateLine(ts).reason, expected, names(ts).join('→')); total++;
    }
    if (expected === 'outOfScope') { outside++; assert(missing.length && missing.every(k => scopes.has(k)) && !p.conflict); }
  }
  console.log('판정 순열 ' + total + ', 범위 밖만 있는 연속 사슬 ' + outside);
});
test('단계 누락·중복은 순서 실수가 아니며 별도 안내, orderError 제거', () => {
  for (const ns of [['상피 세포', '위', '소화계'], ['상피 세포', '상피 조직', '위', '사람'], ['상피 세포', '상피 조직', '상피 조직']]) {
    const j = R.validateLine(ids(ns)); assert.equal(j.reason, 'stageGap'); assert(!j.misconception);
  }
  assert(!R.SIGNALS.includes('orderError')); assert(!('orderError' in R.newGame(0).signals));
});
test('묶음과 특수 계 신호: 단계 혼동을 중복보다 우선, 식물 기관/조직계는 일반 혼동', () => {
  assert.equal(R.validateGroup(ids(['잎', '표피 조직계', '관다발 조직계'])).reason, 'stageGroup');
  assert.equal(R.validateGroup(ids(['잎', '잎', '공변세포'])).reason, 'stageGroup');
  assert.equal(R.validateGroup(ids(['위', '위', '표피 조직계'])).reason, 'tissueSystemInAnimal');
  assert.equal(R.validateGroup(ids(['소화계', '소화계', '잎'])).reason, 'numberGroup');
  assert.equal(R.validateLine(ids(['공변세포', '표피 조직', '순환계'])).reason, 'kingdomMix');
});
test('API: 성공 revision·실패 작업 번호·stale/ended 안내·원자성', () => {
  const s = fixture([...fullAnimal, ...ids(['잎', '잎', '줄기'])]);
  const action = { type: 'play', token: s.revision, moves: [place('line', s.hand.slice(0, 5))] };
  const ok = R.act(s, action); assert(ok.accepted); assert.equal(ok.state.revision, s.revision + 1);
  const stale = R.act(ok.state, action); assert(stale.ignored); assert.equal(stale.reason, 'stale'); assert.equal(stale.judgment.reason, 'stale'); assert(stale.message); assert.strictEqual(stale.state, ok.state);
  const fail = submit(s, [place('line', s.hand.slice(0, 5)), place('group', s.hand.slice(5))]);
  assert.equal(fail.failedMoveIndex, 1); assert.equal(fail.judgment.reason, 'duplicateGroup'); assert(fail.message); eq(fail.state.hand, s.hand); eq(fail.state.board, []);
  const first = submit(s, [place('line', [s.hand[0], s.hand[0], s.hand[2]])]); assert.equal(first.failedMoveIndex, 0); assert.equal(first.reason, 'notInHand');
  // 중복 ID가 다른 거부 사유에 우연히 걸리는 것만으로는 부족하다. 입구의 사유를 고정한다.
  const identical = submit(s, [place('group', [s.hand[5], s.hand[5], s.hand[7]])]); assert.equal(identical.reason, 'notInHand');
  eq(identical.state.signals, s.signals);
  const endedState = draw(R.newGame(1, { turnLimit: 1 })).state;
  const ended = draw(endedState); assert(ended.ignored); assert.equal(ended.judgment.reason, 'ended'); assert(ended.message); assert.strictEqual(ended.state, endedState);
  assert.equal(draw(s).state.revision, s.revision + 1);
});
test('비신호 실패는 signals에 키를 추가하지 않음, 범위 밖은 합계에서 제외', () => {
  const s = fixture(fullAnimal);
  for (const moves of [[], [null], [place('group', [s.hand[0]])], [place('line', [s.hand[0], s.hand[2], s.hand[3]])]]) {
    const out = submit(s, moves); assert(!out.accepted); eq(out.state.signals, s.signals); assert.equal(out.state.revision, s.revision + 1);
  }
});
test('줄 제출 자동 정렬·양끝 붙이기 정렬·실제 ID별 패 제거', () => {
  const s = fixture([...fullAnimal, fullAnimal[0]]);
  const original = [s.hand[4], s.hand[1], s.hand[3], s.hand[0], s.hand[2]], before = original.slice();
  const out = submit(s, [place('line', original)]); assert(out.accepted); eq(original, before);
  eq(out.state.board[0].tiles, s.hand.slice(0, 5)); eq(out.state.hand, [s.hand[5]]); checkState(out.state);
  for (const side of ['start', 'end']) {
    const a = fixture(fullAnimal.slice(0, 2), [{ kind: 'line', tiles: fullAnimal.slice(2) }]);
    const done = submit(a, [{ type: 'attach', setId: 1, side, tiles: a.hand.slice().reverse() }]);
    assert(done.accepted); eq(names(done.state.board[0].tiles), names(fullAnimal)); checkState(done.state);
  }
});
test('셔플 독립 BigInt 기준: 균등 Fisher–Yates의 자기 자리 선택 포함', () => {
  for (const seed of [0, 1, 2, 42, 99, 0xffffffff]) {
    let value = BigInt(seed); const expected = R.DECK.slice();
    for (let i = 57; i > 0; i--) {
      value = (value * 1664525n + 1013904223n) % 4294967296n;
      const j = Number(value * BigInt(i + 1) / 4294967296n);
      [expected[i], expected[j]] = [expected[j], expected[i]];
    }
    const s = R.newGame(seed); eq([...s.hand, ...s.deck], expected);
  }
});
test('점수: 완전한 줄 100/200, 부분 사슬 10/20 상한40, 묶음2 상한10', () => {
  const a = fullAnimal, p = fullPlant;
  for (const [lines, score] of [[[a.slice(0, 3)], 10], [[a.slice(0, 4)], 20], [[a.slice(0, 4), p.slice(0, 4)], 40], [[a], 100], [[a, p], 200], [[a, a], 100]]) {
    const s = fixture([], lines.map(tiles => ({ kind: 'line', tiles }))); assert.equal(R.score(s), score);
  }
  const groups = [ids(['상피 세포', '신경 세포(뉴런)', '심장 근육 세포']), ids(['공변세포', '물관을 이루는 세포', '울타리 조직 세포']), ids(['상피 조직', '신경 조직', '근육 조직'])];
  const s = fixture([], [...groups, ...groups].map(tiles => ({ kind: 'group', tiles })));
  assert.equal(R.score(s), 10); assert.equal(R.stars(s), 0);
});
test('기본 상한의 손패 최대: 뽑기만 34장, 큰 사용자 상한도 58장', () => {
  let s = R.newGame(3); while (s.phase === 'playing') s = draw(s).state;
  assert.equal(s.hand.length, 14 + R.RULES.turnLimit); assert.equal(s.hand.length, 34);
  let all = R.newGame(3, { turnLimit: 100 }); for (let i = 0; i < 44; i++) all = draw(all).state;
  assert.equal(all.hand.length, 58); eq(draw(all).state.hand, all.hand);
});

// D-057: 신호 집계와 시도 소모를 구별한다. 장수 부족도 유효한 패의 규칙 판정이다.
test('시도 상한: 판정 실패 3번에만 뽑기·턴 전환, 앞 두 번은 재시도', () => {
  let s = fixture(ids(['심장 근육 세포', '신경 조직', '뇌']));
  const before = plain(s), chosen = s.hand.slice();
  assert.equal(s.attemptsRemaining, 3); assert.equal(R.RULES.attemptLimit, 3);
  for (let n = 1; n <= 3; n++) {
    const out = submit(deepFreeze(s), [place('line', chosen)]);
    assert(!out.accepted && !out.ignored && out.attemptCounted);
    assert.equal(out.reason, 'relationError'); assert.equal(out.judgment.reason, 'relationError');
    assert(out.message.includes('앞 패가 뒤 패를 이루는 관계가 아닙니다'));
    assert.equal(out.failedMoveIndex, 0); assert.equal(out.turnAdvanced, n === 3); assert.equal(out.autoDrawn, n === 3);
    assert.equal(out.attemptsRemaining, n === 3 ? 3 : 3 - n);
    assert.equal(out.state.attemptsRemaining, out.attemptsRemaining);
    assert.equal(out.state.turns, n === 3 ? 1 : 0); assert.equal(out.state.revision, n);
    assert.equal(out.state.signals.relationError, n); assert.equal(out.state.draws, n === 3 ? 1 : 0);
    eq(out.state.hand, n === 3 ? [...before.hand, before.deck[0]] : before.hand);
    eq(out.state.deck, n === 3 ? before.deck.slice(1) : before.deck); eq(out.state.board, []);
    if (n === 3) assert(out.message.includes('다음 턴'));
    checkState(out.state); s = out.state;
  }
  const next = submit(s, [place('line', chosen)]);
  assert.equal(next.state.attemptsRemaining, 2); assert.equal(next.state.turns, 1);
});
test('시도 분류: 모든 개념·판정 실패는 세되 신호 분류는 유지', () => {
  const cases = [
    ['line', ['공변세포', '잎', '순환계'], 'systemInPlant'],
    ['line', ['상피 조직', '기본 조직계', '잎'], 'tissueSystemInAnimal'],
    ['line', ['위', '표피 조직', '물관'], 'kingdomMix'],
    ['line', ['상피 세포', '위', '소화계'], 'stageGap'],
    ['line', ['심장 근육 세포', '신경 조직', '뇌'], 'relationError'],
    ['line', ['심장 근육 세포', '근육 조직', '위'], 'lineConflict'],
    ['line', ['신경 조직', '심장', '순환계'], 'outOfScope'],
    ['group', ['잎', '잎', '줄기'], 'duplicateGroup'],
    ['group', ['소화계', '신경계', '잎'], 'numberGroup'],
    ['group', ['상피 세포', '상피 조직', '위'], 'stageGroup'],
    ['line', ['위'], 'tooShort'], ['group', ['위', '뇌'], 'tooShort']
  ];
  for (const [kind, ns, reason] of cases) {
    let s = fixture(ids(ns)); const chosen = s.hand.slice();
    for (let n = 1; n <= 3; n++) {
      const out = submit(s, [place(kind, chosen)]);
      assert.equal(out.reason, reason); assert(out.attemptCounted, reason);
      assert.equal(out.state.attemptsRemaining, n === 3 ? 3 : 3 - n);
      assert.equal(out.state.turns, n === 3 ? 1 : 0);
      assert.equal(R.detail(out.state).misconceptionTotal, R.SIGNALS.includes(reason) ? n : 0);
      assert.equal(out.state.signals.outOfScope, reason === 'outOfScope' ? n : 0); s = out.state;
    }
  }
});
test('토큰·무시·형식·손패 오류와 미리보기는 시도를 소모하지 않음', () => {
  let s = fixture(fullAnimal);
  s = submit(s, [place('line', [s.hand[0], s.hand[2], s.hand[3]])]).state;
  const actions = [null, {}, { type: 'play', token: s.revision - 1, moves: [place('group', s.hand)] },
    ...[
      { type: 'unknown' }, { type: 'play', moves: [] }, { type: 'play', moves: [null] },
      { type: 'play', moves: [place('unknown', s.hand)] }, { type: 'play', moves: [place('line', [])] },
      { type: 'play', moves: [place('line', new Array(1))] },
      { type: 'play', moves: [place('line', ['unknown'])] }, { type: 'play', moves: [place('line', [s.hand[0], s.hand[0]])] },
      { type: 'play', moves: [{ type: 'attach', setId: 999, side: 'end', tiles: s.hand }] }
    ].map(action => ({ ...action, token: s.revision }))];
  for (const action of actions) {
    const before = plain(s), out = R.act(deepFreeze(s), action);
    assert(!out.accepted && !out.attemptCounted && !out.turnAdvanced && !out.autoDrawn);
    assert.equal(out.attemptsRemaining, 2); assert.equal(out.state.attemptsRemaining, 2);
    assert.equal(out.state.turns, 0); eq(out.state.hand, s.hand); eq(out.state.signals, s.signals); eq(s, before);
  }
  R.validateLine(s.hand); R.validateGroup(s.hand); assert.equal(s.attemptsRemaining, 2);
  let empty = R.newGame(1, { turnLimit: 100 }); for (let n = 0; n < 44; n++) empty = draw(empty).state;
  empty = submit(empty, [place('line', [empty.hand[0]])]).state;
  const out = draw(empty); assert.equal(out.reason, 'deckEmpty'); assert.equal(out.attemptsRemaining, 2);
  assert(!out.attemptCounted && !out.turnAdvanced && !out.autoDrawn);
});
test('성공·수동 뽑기에서 시도 초기화, 세 번째 실패의 모든 작업 취소', () => {
  let s = fixture([...fullAnimal, ...ids(['잎', '잎', '줄기'])]);
  const bad = [place('line', s.hand.slice(0, 5)), place('group', s.hand.slice(5))];
  for (let n = 0; n < 2; n++) s = submit(s, bad).state;
  for (const out of [submit(s, [bad[0]]), draw(s)]) {
    assert(out.accepted && out.turnAdvanced); assert(!out.attemptCounted && !out.autoDrawn);
    assert.equal(out.attemptsRemaining, 3); assert.equal(out.state.attemptsRemaining, 3); assert.equal(out.state.turns, 1);
  }
  const out = submit(s, bad);
  assert(!out.accepted && out.turnAdvanced && out.autoDrawn); assert.equal(out.failedMoveIndex, 1);
  eq(out.state.board, s.board); eq(out.state.hand, [...s.hand, s.deck[0]]); assert.equal(out.state.nextSetId, 1);
  assert.equal(out.state.signals.duplicateGroup, 3); assert.equal(out.state.draws, 1); checkState(out.state);
});
test('세 번째 실패: 마지막 턴 종료·종료 뒤 무시·빈 덱에서는 턴만 전환', () => {
  for (const emptyDeck of [false, true]) {
    let s = fixture(ids(['상피 세포']), [], { turnLimit: 1 });
    if (emptyDeck) { s.hand.push(...s.deck); s.deck = []; }
    const chosen = [s.hand[0]], before = plain(s);
    for (let n = 0; n < 2; n++) s = submit(s, [place('line', chosen)]).state;
    const out = submit(s, [place('line', chosen)]);
    assert(out.turnAdvanced); assert.equal(out.autoDrawn, !emptyDeck); assert.equal(out.state.draws, emptyDeck ? 0 : 1);
    assert.equal(out.attemptsRemaining, 0); assert.equal(out.state.attemptsRemaining, 0);
    assert.equal(out.state.turns, 1); assert.equal(out.state.phase, 'lost'); assert.equal(out.state.endReason, 'turnLimit');
    assert(out.message.includes('정해진 턴')); assert.equal(R.result(out.state).stars, 0);
    eq(out.state.hand, emptyDeck ? before.hand : [...before.hand, before.deck[0]]); checkState(out.state);
    const ignored = submit(out.state, [place('line', chosen)]);
    assert(ignored.ignored && !ignored.attemptCounted && !ignored.turnAdvanced && !ignored.autoDrawn);
    assert.equal(ignored.attemptsRemaining, 0); assert.strictEqual(ignored.state, out.state);
  }
  let s = R.newGame(1, { turnLimit: 100 }); for (let n = 0; n < 44; n++) s = draw(s).state;
  const chosen = [s.hand[0]];
  for (let n = 0; n < 3; n++) s = submit(s, [place('line', chosen)]).state;
  assert.equal(s.turns, 45); assert.equal(s.draws, 44); assert.equal(s.phase, 'playing'); assert.equal(s.attemptsRemaining, 3);
  checkState(s);
  const both = fixture([...fullAnimal, ...fullPlant], [], { turnLimit: 1 });
  const won = submit(both, [place('line', both.hand.slice(0, 5)), place('line', both.hand.slice(5))]);
  assert.equal(won.state.phase, 'won'); assert.equal(won.attemptsRemaining, 0);
});

// 현재 손패와 판만 보는 전략. Opus strategies.js의 학생형 우선순위를 그대로 재현한다.
const templates = legalLines.map(p => ({ kind: 'line', tiles: p.tiles, kingdom: p.kingdom }));
for (const stage of Object.keys(R.STAGES)) {
  const ts = R.TILES.filter(t => t.stage === stage).map(t => t.id);
  for (let mask = 0; mask < 2 ** ts.length; mask++) {
    const tiles = ts.filter((_, i) => mask & (1 << i)); if (tiles.length >= 3) templates.push({ kind: 'group', tiles });
  }
}
const fullTemplates = templates.filter(t => t.kind === 'line' && t.tiles.length === 5);
const studentOrder = [...fullTemplates, ...templates.filter(t => t.kind === 'line' && t.tiles.length < 5).sort((a, b) => b.tiles.length - a.tiles.length), ...templates.filter(t => t.kind === 'group').sort((a, b) => b.tiles.length - a.tiles.length)];
function studentMoves(s, strategy) {
  const pool = s.hand.slice(), moves = [], board = s.board.map(x => ({ ...x, tiles: x.tiles.slice() }));
  const order = strategy === 'full' ? fullTemplates.filter(t => !s.board.some(x => x.kind === 'line' && x.tiles.length === 5 && R.tile(x.tiles[0]).kingdom === t.kingdom)) : studentOrder.filter(t => strategy !== 'groups' || t.kind === 'group');
  let next = s.nextSetId;
  for (;;) {
    const t = order.find(t => t.tiles.every(type => pool.some(id => R.tile(id).id === type)));
    if (!t) break;
    const ts = t.tiles.map(type => pool.splice(pool.findIndex(id => R.tile(id).id === type), 1)[0]);
    moves.push(place(t.kind, ts)); board.push({ id: next++, kind: t.kind, tiles: ts });
    if (strategy === 'full') { for (let i = order.length - 1; i >= 0; i--) if (order[i].kingdom === t.kingdom) order.splice(i, 1); }
  }
  if (strategy !== 'full') {
    for (;;) {
      let found = false;
      for (const id of pool) {
        for (const set of board) {
          if (strategy === 'groups' && set.kind !== 'group') continue;
          for (const side of ['start', 'end']) {
            const ts = side === 'start' ? [id, ...set.tiles] : [...set.tiles, id];
            if ((set.kind === 'line' ? R.validateLine(ts) : R.validateGroup(ts)).ok) {
              moves.push({ type: 'attach', setId: set.id, side, tiles: [id] });
              set.tiles = set.kind === 'line' ? ts.sort((a, b) => R.tile(a).number - R.tile(b).number) : ts;
              pool.splice(pool.indexOf(id), 1); found = true; break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
      if (!found) break;
    }
  }
  return moves;
}
function randomOf(seed) { let v = seed >>> 0 || 1; return () => { v ^= v << 13; v >>>= 0; v ^= v >>> 17; v ^= v << 5; v >>>= 0; return v / 4294967296; }; }
function shuffled(xs, random) { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function guessMoves(s, strategy, random) {
  if (strategy.startsWith('numbers')) {
    const opts = [];
    for (let n = 1; n <= 5; n++) { const ts = s.hand.filter(id => R.tile(id).number === n); if (ts.length >= 3) opts.push(place('group', shuffled(ts, random).slice(0, 3))); }
    // 숫자만 보는 학생도 5장 줄을 시도하고 놓인 줄에 붙일 수 있어야 한다.
    // 3장 줄만 새로 놓게 하면 별2 이상 0은 규칙상 자명해져 인수 검사가 되지 않는다.
    for (const kingdom of ['animal', 'plant']) for (let length = 3; length <= 5; length++) for (let n = 1; n + length <= 6; n++) {
      const ts = Array.from({ length }, (_, i) => n + i).map(number => shuffled(s.hand.filter(id => R.tile(id).kingdom === kingdom && R.tile(id).number === number), random)[0]);
      if (ts.every(Boolean)) opts.push(place('line', ts));
    }
    for (const set of s.board.filter(x => x.kind === 'line' && x.tiles.length < 5)) {
      const first = R.tile(set.tiles[0]), last = R.tile(set.tiles[set.tiles.length - 1]);
      for (const [side, number] of [['start', first.number - 1], ['end', last.number + 1]]) {
        const id = shuffled(s.hand.filter(id => R.tile(id).kingdom === first.kingdom && R.tile(id).number === number), random)[0];
        if (id) opts.push({ type: 'attach', setId: set.id, side, tiles: [id] });
      }
    }
    return opts.length ? [opts[Math.floor(random() * opts.length)]] : [];
  }
  const h = shuffled(s.hand, random);
  if (!h.length) return [];
  if (s.board.length && random() < 0.35) return [{ type: 'attach', setId: s.board[Math.floor(random() * s.board.length)].id, side: random() < 0.5 ? 'start' : 'end', tiles: h.slice(0, 1) }];
  const n = 3 + Math.floor(random() * 3);
  return h.length >= 3 ? [place(random() < 0.5 ? 'line' : 'group', h.slice(0, Math.min(n, h.length)))] : [];
}
function simulate(strategy, seed, turnLimit, chooseMoves) {
  let s = R.newGame(seed, { turnLimit }), maxHand = s.hand.length;
  const random = randomOf(seed * 31 + 7), attempts = strategy.endsWith('Max') ? 3 : 1;
  let submissions = 0, rejected = 0, forcedTurns = 0, autoDraws = 0;
  for (let guard = 0; s.phase === 'playing'; guard++) {
    assert(guard < 100, '시뮬레이션 종료'); const turn = s.turns;
    for (let k = 0; k < attempts && s.phase === 'playing' && s.turns === turn; k++) {
      const moves = chooseMoves ? chooseMoves(s) : ['student', 'full', 'groups'].includes(strategy) ? studentMoves(s, strategy) : guessMoves(s, strategy, random);
      if (!moves.length) break;
      const out = submit(s, moves); s = out.state; submissions++;
      if (!out.accepted) rejected++;
      if (!out.accepted && out.turnAdvanced) forcedTurns++;
      if (out.autoDrawn) autoDraws++;
      if (['student', 'full', 'groups'].includes(strategy)) assert(out.accepted, out.reason);
      else assert(out.accepted || out.attemptCounted, '찍기 전략은 형식 오류를 제출하지 않는다');
    }
    // 세 번째 실패는 accepted=false여도 이미 턴을 썼다. 추가로 뽑거나 다음 턴에 찍지 않는다.
    if (s.phase === 'playing' && s.turns === turn) s = draw(s).state;
    assert.equal(s.turns, turn + 1, '시뮬레이션 한 반복은 정확히 한 턴');
    maxHand = Math.max(maxHand, s.hand.length);
  }
  checkState(s); assert.equal(R.stars(s), referenceStars(s));
  return { s, maxHand, submissions, rejected, forcedTurns, autoDraws };
}
test('시뮬레이터: 최대 찍기 3회 뒤 추가 뽑기 없음, 1회 찍기와 별도 집계', () => {
  for (const [strategy, attempts] of [['random', 1], ['randomMax', 3]]) {
    const out = simulate(strategy, 7, 20, s => [place('line', [s.hand[0]])]);
    assert.equal(out.submissions, 20 * attempts); assert.equal(out.rejected, 20 * attempts);
    assert.equal(out.forcedTurns, attempts === 3 ? 20 : 0); assert.equal(out.autoDraws, out.forcedTurns);
    assert.equal(out.s.turns, 20); assert.equal(out.s.draws, 20); assert.equal(out.s.hand.length, 34);
    let expected = R.newGame(7); for (let n = 0; n < 20; n++) expected = draw(expected).state;
    eq(out.s.hand, expected.hand); eq(out.s.deck, expected.deck);
  }
});
let simulationReports;
if (!mutant && !process.env.SKIP_SIM) {
  test('전략별 시드 1,000판·후보 상한 비교·독립 별 기준·점수 분포', () => {
    const reports = {}; simulationReports = reports;
    for (const limit of (process.argv.includes('--acceptance') ? [20] : [18, 20, 22, 24])) {
      reports[limit] = {};
      for (const strategy of ['student', 'full', 'groups', 'numbers', 'numbersMax', 'random', 'randomMax']) {
        const stars = [0, 0, 0, 0]; let turns = 0, points = 0, maxHand = 0, maxScore = 0;
        let submissions = 0, rejected = 0, forcedTurns = 0, autoDraws = 0;
        for (let seed = 1; seed <= 1000; seed++) {
          const run = simulate(strategy, seed, limit), { s, maxHand: held } = run, count = R.stars(s), score = R.score(s);
          stars[count]++; turns += s.turns; points += score; maxHand = Math.max(maxHand, held); maxScore = Math.max(maxScore, score);
          submissions += run.submissions; rejected += run.rejected; forcedTurns += run.forcedTurns; autoDraws += run.autoDraws;
        }
        reports[limit][strategy] = { stars, avgTurns: +(turns / 1000).toFixed(3), avgScore: +(points / 1000).toFixed(3), maxScore, maxHand, submissions, rejected, forcedTurns, autoDraws };
        console.log('분포 ' + limit + '턴 ' + strategy + ' ' + JSON.stringify(reports[limit][strategy]));
      }
    }
    assert(reports[20].full.stars[3] >= 600 && reports[20].full.stars[3] <= 800, '완전한 줄 학생형 별3 60~80%');
    for (const strategy of ['groups', 'numbers', 'numbersMax', 'random', 'randomMax']) {
      assert(reports[20].full.avgScore > reports[20][strategy].avgScore);
    }
    console.log('인수 목표: 완전한 줄 학생 별3 600~800/1000, 묶음 별2 이상 0, 무작위 별2 이상 최대 10/1000(1%). 다 놓기와 숫자 전략(D-058 숫자 숨김)은 보고만 한다.');
    assert.equal(R.RULES.turnLimit, 20);
  });
}
if (simulationReports && process.argv.includes('--acceptance')) {
  test('인수: 완전한 줄을 노리는 학생 별3 60~80%', () => {
    const count = simulationReports[20].full.stars[3]; assert(count >= 600 && count <= 800, count + '/1000');
  });
  // 유한 표본에서 우연히 완전한 줄을 낼 수 있다. 상한은 학생 성공 목표 60%의 1/60인 1%로 고정한다.
  // numbers·numbersMax는 패의 단계 숫자를 보고 고르는 전략이다. D-058로 놀이 중에는 숫자를 숨기므로
  // 학생이 쓸 수 없는 전략이라 보고만 하고 단언하지 않는다(별2 이상 20턴 기준 약 19~30%, 숫자를 다시 보이면 이 단언을 되살린다).
  for (const strategy of ['numbers', 'numbersMax']) {
    const stars = simulationReports[20][strategy].stars;
    console.log('보고(D-058, 숫자 숨김으로 학생이 쓸 수 없음): ' + strategy + ' 별2 이상 ' + (stars[2] + stars[3]) + '/1000');
  }
  for (const strategy of ['groups', 'random', 'randomMax']) {
    test('인수: ' + strategy + ' 별2 이상 ' + (strategy === 'groups' ? '0' : '1% 이하'), () => {
      const stars = simulationReports[20][strategy].stars;
      assert(stars[2] + stars[3] <= (strategy === 'groups' ? 0 : 10), strategy + ' 별2 이상 ' + (stars[2] + stars[3]) + '/1000');
    });
  }
}
if (!mutant && !process.env.SKIP_MUTATIONS) {
  test('고의 변이: 기존 19종·시도 상한 8종 모두 단언 실패·종료1, 원본 보존', () => {
    for (const name of Object.keys(mutations)) {
      const run = spawnSync(process.execPath, [__filename, '--mutant=' + name], { encoding: 'utf8', timeout: 30000 });
      assert.equal(run.status, 1, name + ': ' + run.stderr);
      assert(/^FAIL /m.test(run.stdout), name + ' 단언 실패 누락');
      console.log('고의 변이 ' + name + ': ' + run.stdout.match(/^FAIL .*/m)[0]);
    }
    assert.equal(fs.readFileSync(modulePath, 'utf8'), source);
  });
}
console.log('구성 단계 루미큐브: PASS ' + pass + ', FAIL ' + fail);
process.exit(fail ? 1 : 0);
