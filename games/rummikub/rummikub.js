/* 구성 단계 루미큐브 — 순수 규칙. DOM·저장소·시계를 쓰지 않는다.
 * newGame(seed, { turnLimit? }) → 상태. seed는 32비트 부호 없는 정수(0 포함).
 * 패 종류는 TILES의 id, 실제 패는 DECK의 '종류:0|1'. tile(id)로 표시 정보를 얻는다.
 * validateLine/validateGroup은 종류 id와 실제 패 id를 받으며 상태를 바꾸지 않는다.
 * act(state, { token: state.revision, type: 'draw'|'play', moves? })
 * moves: { type:'place', kind:'line'|'group', tiles:[실제 패 id] }
 *      | { type:'attach', setId, side:'start'|'end', tiles:[실제 패 id] }
 * 한 play의 여러 작업은 순서대로, 한 턴에 모두 반영하거나 모두 취소한다.
 * 같은 제출 안에서 새로 만든 세트에도 붙일 수 있다(setId는 state.nextSetId부터).
 * 반환 { state, accepted, ignored, reason, judgment, message, failedMoveIndex,
 *        attemptsRemaining, attemptCounted, turnAdvanced, autoDrawn }.
 * attemptsRemaining은 반환 state와 같다(다음 턴이면 3, 종료면 0).
 * 세 번째 판정 실패도 accepted=false다. turnAdvanced/autoDrawn으로 턴 전환/자동 뽑기를 안다.
 * failedMoveIndex는 실패 작업의 0부터 시작하는 번호이며, 작업 밖 실패이면 null이다.
 * 화면은 성공·실패 모두 반환된 최신 state를 즉시 보관하고 다음 호출에 사용한다.
 * token은 그 최신 state.revision이다. 옛 token은 ignored로 돌려준다.
 * 순수 함수이므로 같은 옛 state와 token을 두 번 주면 같은 결과가 나온다.
 * 줄 입력·붙인 결과는 단계 순서로 정렬한다(입력 배열 자체는 보존).
 * 줄 판정: 특수 계 혼동 → 계 섞임 → 단계 누락/중복 → relationError
 * → lineConflict → outOfScope. 순서 선택은 신호로 기록하지 않는다.
 * 묶음 판정: 동물 기관/조직계 혼동 → 단계 섞임(숫자 혼동 포함) → 이름 중복.
 * 판정 실패는 한 제출에 한 번 센다. 앞 두 번은 재시도, 세 번째는 한 장 뽑고 턴 전환.
 * 장수 부족·단계 누락·범위 밖도 판정 실패지만 오개념 집계와는 구별한다.
 * 토큰·형식·손패 ID 오류는 시도를 세지 않는다. 현재 token의 요청은
 * 성공 여부와 관계없이 revision을 올려 중복 제출을 막는다. 미리보기는 판정 함수만 부른다.
 * 상태는 읽기 전용으로 취급한다. 결과는 종료 때 result로 얻는다(진행 중에는 null).
 */
(function (root) {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const STAGES = freeze({ cell: '세포', tissue: '조직', tissueSystem: '조직계', organ: '기관', organSystem: '기관계', individual: '개체' });
  const ORDERS = freeze({ animal: ['cell', 'tissue', 'organ', 'organSystem', 'individual'], plant: ['cell', 'tissue', 'tissueSystem', 'organ', 'individual'] });
  const rows = [
    ['animal', 'cell', 'epithelialCell', '상피 세포'], ['animal', 'cell', 'neuron', '신경 세포(뉴런)'], ['animal', 'cell', 'cardiacCell', '심장 근육 세포'],
    ['animal', 'tissue', 'epithelium', '상피 조직'], ['animal', 'tissue', 'nerve', '신경 조직'], ['animal', 'tissue', 'muscle', '근육 조직'],
    ['animal', 'organ', 'stomach', '위'], ['animal', 'organ', 'brain', '뇌'], ['animal', 'organ', 'heart', '심장'],
    ['animal', 'organSystem', 'digestive', '소화계'], ['animal', 'organSystem', 'nervous', '신경계'], ['animal', 'organSystem', 'circulatory', '순환계'],
    ['animal', 'individual', 'human', '사람'], ['animal', 'individual', 'cat', '고양이'], ['animal', 'individual', 'frog', '개구리'],
    ['plant', 'cell', 'guardCell', '공변세포'], ['plant', 'cell', 'xylemCell', '물관을 이루는 세포'], ['plant', 'cell', 'palisadeCell', '울타리 조직 세포'],
    ['plant', 'tissue', 'epidermis', '표피 조직'], ['plant', 'tissue', 'xylem', '물관'], ['plant', 'tissue', 'palisade', '울타리 조직'],
    ['plant', 'tissueSystem', 'dermal', '표피 조직계'], ['plant', 'tissueSystem', 'vascular', '관다발 조직계'], ['plant', 'tissueSystem', 'ground', '기본 조직계'],
    ['plant', 'organ', 'leaf', '잎'], ['plant', 'organ', 'stem', '줄기'],
    ['plant', 'individual', 'sunflower', '해바라기'], ['plant', 'individual', 'bean', '강낭콩'], ['plant', 'individual', 'tomato', '토마토']
  ];
  const TILES = freeze(rows.map(([kingdom, stage, id, name]) => ({ id, name, stage, kingdom, number: ORDERS[kingdom].indexOf(stage) + 1, count: 2 })));
  const DECK = freeze(TILES.flatMap(t => Array.from({ length: t.count }, (_, i) => t.id + ':' + i)));
  const lookup = new Map(TILES.flatMap(t => [[t.id, t], ...DECK.filter(id => id.startsWith(t.id + ':')).map(id => [id, t])]));
  const RELATIONS = freeze({
    epithelialCell: ['epithelium'], neuron: ['nerve'], cardiacCell: ['muscle'],
    epithelium: ['stomach'], nerve: ['brain'], muscle: ['heart', 'stomach'],
    stomach: ['digestive'], brain: ['nervous'], heart: ['circulatory'],
    digestive: ['human', 'cat', 'frog'], nervous: ['human', 'cat', 'frog'], circulatory: ['human', 'cat', 'frog'],
    guardCell: ['epidermis'], xylemCell: ['xylem'], palisadeCell: ['palisade'],
    epidermis: ['dermal'], xylem: ['vascular'], palisade: ['ground'],
    dermal: ['leaf', 'stem'], vascular: ['leaf', 'stem'], ground: ['leaf', 'stem'],
    leaf: ['sunflower', 'bean', 'tomato'], stem: ['sunflower', 'bean', 'tomato']
  });
  const OUT_OF_SCOPE = freeze({ epithelium: ['heart', 'brain'], muscle: ['brain'], nerve: ['heart', 'stomach'] });
  const LINE_CONSTRAINTS = freeze([
    { id: 'palisadeInLeaf', triggers: ['palisadeCell', 'palisade'], stage: 'organ', allowed: ['leaf'], message: '울타리 조직 세포나 울타리 조직이 든 줄의 기관은 잎이어야 합니다.' },
    { id: 'cardiacInHeart', triggers: ['cardiacCell'], stage: 'organ', allowed: ['heart'], message: '심장 근육 세포가 든 줄의 기관은 심장이어야 합니다.' }
  ]);
  const SIGNALS = freeze(['systemInPlant', 'tissueSystemInAnimal', 'kingdomMix', 'relationError', 'lineConflict', 'duplicateGroup', 'numberGroup']);
  const MESSAGES = freeze({
    systemInPlant: '식물의 구성 단계에는 기관계가 없습니다.', tissueSystemInAnimal: '조직계는 식물의 구성 단계입니다. 동물의 기관과 같은 단계가 아닙니다.',
    kingdomMix: '한 줄에는 동물과 식물 패를 섞을 수 없습니다.', stageGap: '줄은 중간 단계를 빠뜨리거나 같은 단계를 겹치지 않고 이어야 합니다.',
    relationError: '앞 패가 뒤 패를 이루는 관계가 아닙니다.', outOfScope: '이 게임에서 다루지 않는 연결입니다.',
    duplicateGroup: '묶음에는 서로 다른 이름의 패를 놓으세요.', numberGroup: '숫자가 아니라 구성 단계 이름이 같은 패를 묶으세요.',
    stageGroup: '묶음은 같은 구성 단계의 패로 만드세요.', tooShort: '줄과 묶음은 3장 이상이어야 합니다.',
    invalidTile: '패를 확인해 주세요.', invalidAction: '놓을 패와 위치를 확인해 주세요.', notInHand: '손패에 있는 패만 놓을 수 있습니다.',
    stale: '이미 처리한 입력입니다.', ended: '이미 끝난 판입니다.', deckEmpty: '뽑을 패가 없습니다. 손패로 줄이나 묶음을 만들어 보세요.'
  });
  // D-057: 완전한 줄을 노리는 학생 기준 20턴, 한 턴의 판정 실패는 3번까지.
  // 별·점수·패 배분은 D-056 그대로다. 난도와 찍기 결과는 tests의 --acceptance로 확인한다.
  const RULES = freeze({ handSize: 14, turnLimit: 20, attemptLimit: 3, completePoints: 100, partialPoints: 10, groupPoints: 2, partialCap: 40, groupCap: 10 });
  function tile(id) { return lookup.get(id) || null; }
  function reject(reason, extra = {}) { return { ok: false, reason, misconception: SIGNALS.includes(reason), message: MESSAGES[reason] || '', ...extra }; }
  function readTiles(ids) {
    const ts = Array.isArray(ids) ? Array.from(ids, tile) : null;
    return ts && ts.every(Boolean) ? ts : null;
  }
  function validateLine(ids) {
    const ts = readTiles(ids);
    if (!ts) return reject('invalidTile');
    if (ts.length < 3) return reject('tooShort');
    ts.sort((a, b) => a.number - b.number);
    const pairs = ts.slice(1).map((b, i) => [ts[i], b]);
    // 우선 순위는 줄 전체에 적용한다. 앞쪽의 낮은 우선 신호가 뒤쪽 신호를 가리지 않는다.
    if (ts.some(a => ts.some(b => a.kingdom === 'plant' && a.stage === 'organ' && b.kingdom === 'animal' && b.stage === 'organSystem'))) return reject('systemInPlant');
    if (ts.some(a => ts.some(b => a.kingdom === 'animal' && a.stage === 'tissue' && b.kingdom === 'plant' && b.stage === 'tissueSystem'))) return reject('tissueSystemInAnimal');
    if (ts.some(t => t.kingdom !== ts[0].kingdom)) return reject('kingdomMix');
    if (pairs.some(([a, b]) => b.number !== a.number + 1)) return reject('stageGap');
    const outside = pairs.filter(([a, b]) => !(RELATIONS[a.id] || []).includes(b.id));
    const falsePair = outside.find(([a, b]) => !(OUT_OF_SCOPE[a.id] || []).includes(b.id));
    if (falsePair) return reject('relationError', { pair: falsePair.map(t => t.id) });
    for (const rule of LINE_CONSTRAINTS) {
      if (ts.some(t => rule.triggers.includes(t.id)) && ts.some(t => t.stage === rule.stage && !rule.allowed.includes(t.id))) return reject('lineConflict', { constraint: rule.id, message: rule.message });
    }
    if (outside.length) return reject('outOfScope', { pair: outside[0].map(t => t.id) });
    return { ok: true, reason: null, misconception: false, kind: 'line', kingdom: ts[0].kingdom, complete: ts.length === 5, partial: ts.length < 5 };
  }
  function validateGroup(ids) {
    const ts = readTiles(ids);
    if (!ts) return reject('invalidTile');
    if (ts.length < 3) return reject('tooShort');
    if (ts.some(t => t.kingdom === 'animal' && t.stage === 'organ') && ts.some(t => t.stage === 'tissueSystem')) return reject('tissueSystemInAnimal');
    if (ts.some(t => t.stage !== ts[0].stage)) return reject(ts.every(t => t.number === ts[0].number) ? 'numberGroup' : 'stageGroup');
    if (new Set(ts.map(t => t.id)).size !== ts.length) return reject('duplicateGroup');
    return { ok: true, reason: null, misconception: false, kind: 'group', stage: ts[0].stage, complete: false };
  }
  function rng(seed) {
    let value = seed >>> 0;
    return function () { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  }
  function newGame(seed = 1, options = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('시드는 0~4294967295 정수여야 합니다.');
    const turnLimit = options.turnLimit === undefined ? RULES.turnLimit : options.turnLimit;
    if (!Number.isInteger(turnLimit) || turnLimit < 1 || turnLimit > 100) throw new RangeError('턴 상한은 1~100 정수여야 합니다.');
    const deck = DECK.slice(), random = rng(seed);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return { seed, phase: 'playing', endReason: null, revision: 0, turns: 0, turnLimit, draws: 0, nextSetId: 1, attemptsRemaining: RULES.attemptLimit,
      hand: deck.splice(0, RULES.handSize), deck, board: [], signals: Object.fromEntries([...SIGNALS, 'outOfScope'].map(key => [key, 0])) };
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  function finishTurn(s) {
    s.turns++;
    // 마지막 허용 턴에도 두 계를 완성하면 목표 달성이 우선한다.
    const full = completed(s);
    if (full.animal && full.plant) { s.phase = 'won'; s.endReason = 'completeLines'; }
    else if (s.turns >= s.turnLimit) { s.phase = 'lost'; s.endReason = 'turnLimit'; }
    s.attemptsRemaining = s.phase === 'playing' ? RULES.attemptLimit : 0;
  }
  function act(state, action) {
    const unchanged = reason => ({ state, accepted: false, ignored: true, reason, judgment: reject(reason), message: MESSAGES[reason], failedMoveIndex: null,
      attemptsRemaining: state.attemptsRemaining, attemptCounted: false, turnAdvanced: false, autoDrawn: false });
    if (state.phase !== 'playing') return unchanged('ended');
    if (!action || action.token !== state.revision) return unchanged('stale');
    const s = copy(state); s.revision++;
    let failedMoveIndex = null;
    function failure(judgment, attemptCounted = false) {
      // 작업 중인 복사본은 버린다. 앞선 작업의 부분 반영이나 중복 집계가 없다.
      const failed = copy(state); failed.revision++;
      if (judgment.misconception || judgment.reason === 'outOfScope') failed.signals[judgment.reason]++;
      let turnAdvanced = false, autoDrawn = false, message = judgment.message;
      // 줄·묶음 판정에 도달한 실패만 센다. 형식·손패 소유 확인은 대상이 아니다.
      if (attemptCounted) {
        failed.attemptsRemaining--;
        if (failed.attemptsRemaining === 0) {
          if (failed.deck.length) { failed.hand.push(failed.deck.shift()); failed.draws++; autoDrawn = true; }
          finishTurn(failed); turnAdvanced = true;
          message += ' 이번 턴에 틀린 시도가 3번입니다. ' + (autoDrawn ? '패를 한 장 뽑았습니다. ' : '뽑을 패가 없습니다. ')
            + (failed.phase === 'playing' ? '다음 턴으로 넘어갑니다.' : '정해진 턴을 모두 썼습니다.');
        }
      }
      return { state: failed, accepted: false, ignored: false, reason: judgment.reason, judgment, message, failedMoveIndex,
        attemptsRemaining: failed.attemptsRemaining, attemptCounted, turnAdvanced, autoDrawn };
    }
    if (action.type === 'draw') {
      if (s.deck.length) { s.hand.push(s.deck.shift()); s.draws++; }
      else return failure(reject('deckEmpty'));
    } else if (action.type === 'play') {
      if (!Array.isArray(action.moves) || !action.moves.length) return failure(reject('invalidAction'));
      for (const [index, move] of action.moves.entries()) {
        failedMoveIndex = index;
        if (!move || !['place', 'attach'].includes(move.type) || !Array.isArray(move.tiles) || !move.tiles.length) return failure(reject('invalidAction'));
        if (new Set(move.tiles).size !== move.tiles.length || Array.from(move.tiles).some(id => !s.hand.includes(id))) return failure(reject('notInHand'));
        let set, ids;
        if (move.type === 'place') {
          if (!['line', 'group'].includes(move.kind)) return failure(reject('invalidAction'));
          set = { id: s.nextSetId, kind: move.kind, tiles: [] }; ids = move.tiles.slice();
        } else {
          set = s.board.find(x => x.id === move.setId);
          if (!set || !['start', 'end'].includes(move.side)) return failure(reject('invalidAction'));
          ids = move.side === 'start' ? move.tiles.concat(set.tiles) : set.tiles.concat(move.tiles);
        }
        if (set.kind === 'line') ids.sort((a, b) => tile(a).number - tile(b).number);
        const judgment = set.kind === 'line' ? validateLine(ids) : validateGroup(ids);
        if (!judgment.ok) return failure(judgment, true);
        if (move.type === 'place') { s.board.push(set); s.nextSetId++; }
        set.tiles = ids;
        s.hand = s.hand.filter(id => !move.tiles.includes(id));
      }
    } else return failure(reject('invalidAction'));
    finishTurn(s);
    return { state: s, accepted: true, ignored: false, reason: null, judgment: { ok: true, reason: null, misconception: false, message: '' }, message: '', failedMoveIndex: null,
      attemptsRemaining: s.attemptsRemaining, attemptCounted: false, turnAdvanced: true, autoDrawn: false };
  }
  function completed(state) {
    const counts = { animal: 0, plant: 0 };
    for (const set of state.board) if (set.kind === 'line') {
      const judgment = validateLine(set.tiles);
      if (judgment.ok && judgment.complete) counts[judgment.kingdom]++;
    }
    return counts;
  }
  function stars(state) {
    const full = completed(state);
    if (full.animal && full.plant) return 3;
    if (full.animal + full.plant) return 2;
    const partial = new Set(state.board.filter(set => set.kind === 'line' && set.tiles.length >= 4 && validateLine(set.tiles).ok).map(set => tile(set.tiles[0]).kingdom));
    return partial.has('animal') && partial.has('plant') ? 1 : 0;
  }
  // 계마다 완전한 줄 하나만 100점. 추가 줄을 반복하거나 묶음으로 패를 소모해도
  // 한 계 완성(100점)보다 앞설 수 없게 부분 사슬 40점·묶음 10점 상한을 둔다.
  function score(state) {
    const full = completed(state);
    let partial = 0, groups = 0;
    for (const set of state.board) {
      if (set.kind === 'line' && set.tiles.length < 5 && validateLine(set.tiles).ok) partial += (set.tiles.length - 2) * RULES.partialPoints;
      if (set.kind === 'group' && validateGroup(set.tiles).ok) groups += RULES.groupPoints;
    }
    return (Number(full.animal > 0) + Number(full.plant > 0)) * RULES.completePoints + Math.min(RULES.partialCap, partial) + Math.min(RULES.groupCap, groups);
  }
  function detail(state) {
    return { ...state.signals, misconceptionTotal: SIGNALS.reduce((sum, key) => sum + state.signals[key], 0),
      turns: state.turns, turnLimit: state.turnLimit, draws: state.draws, remaining: state.hand.length,
      completeLines: completed(state), partialLines: state.board.filter(set => set.kind === 'line' && set.tiles.length < 5).length,
      groups: state.board.filter(set => set.kind === 'group').length, endReason: state.endReason };
  }
  function resultLines(state) {
    const full = completed(state), count = stars(state);
    return [state.phase === 'won' ? state.turns + '턴에 동물과 식물의 완전한 줄을 만들었습니다.' : state.phase === 'playing' ? '아직 진행 중입니다.' : '정해진 턴을 모두 썼습니다.' + ' 손패가 ' + state.hand.length + '장 남았습니다.',
      '완전한 줄: 동물 ' + full.animal + '개, 식물 ' + full.plant + '개.',
      count === 3 ? '동물에는 기관계가, 식물에는 조직계가 들어간 완전한 줄을 각각 만들었습니다.' : count === 2 ? '완전한 줄을 만들었습니다. 다음에는 동물과 식물의 완전한 줄을 각각 만들어 보세요.' : '별 2개는 완전한 줄 하나 이상, 별 3개는 동물과 식물의 완전한 줄이 각각 있어야 합니다. 별 1개는 동물과 식물에서 각각 4장 이상의 부분 사슬을 만들면 받습니다.',
      '별과 점수는 성취수준이 아닙니다. 구성 단계의 차이를 설명해 보세요.'];
  }
  function result(state) {
    if (state.phase === 'playing') return null;
    return { id: 'rummikub', stars: stars(state), score: score(state), detail: detail(state), lines: resultLines(state),
      quiz: { q: '식물의 구성 단계에는 있고 동물에는 없는 단계는?', options: ['조직계', '기관계'], answer: 0, explain: '식물에는 조직계가 있고, 동물에는 기관계가 있습니다.' },
      reflection: '사람과 해바라기의 구성 단계를 세포부터 개체까지 각각 쓰고, 두 생물에서 다른 단계를 예를 들어 비교하세요.' };
  }
  const api = { STAGES, ORDERS, TILES, DECK, RELATIONS, OUT_OF_SCOPE, LINE_CONSTRAINTS, SIGNALS, MESSAGES, RULES,
    tile, rng, validateLine, validateGroup, newGame, act, completed, stars, score, detail, resultLines, result };
  root.Rummikub = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
