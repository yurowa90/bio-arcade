// 독립 정답표, 답 전수, 32,000판 상태 전이, 고의 변이의 실패까지 확인한다.
// 실행: node tests/circulation-logic.js (PASS/FAIL 출력, 실패 시 종료 코드 1)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const modulePath = path.join(__dirname, '../games/circulation/circulation.js');
const source = fs.readFileSync(modulePath, 'utf8');
const mutant = process.argv.find(x => x.startsWith('--mutant='))?.split('=')[1];
const mutations = {
  capillary: ["BY_ID[path[to]].kind === 'capillary'", 'false'],
  stars: ['names >= 7 && reasons === 4', 'names >= 7'],
  leak: ["{ type: 'finalAnswer', kind, pick: action.pick }", "{ type: 'finalAnswer', kind, pick: action.pick, ok: true }"],
  boundary: ['return scoreParts(s).total;', "return scoreParts(s).total + (s.phase === 'end' ? s.boundaries.filter((x, i) => x.pick === FINAL_BOUNDARIES[i].answer).length * 10 : 0);"],
  optionLeak: ['options: nameOptions(NAME_OPTIONS[FINAL_NAMES[s.final.length]])', 'options: nameOptions(NAME_OPTIONS[FINAL_NAMES[s.final.length]]).map(o => ({ ...o, ok: o.key === FINAL_NAMES[s.final.length] }))'],
  chamberOrder: ['shuffle(s, CHAMBERS)', 'CHAMBERS.slice()'],
  reasonOrder: ["shuffle(s, ['direction', 'oxygen'])", "['direction', 'oxygen']"],
  landmark: ["events.push({ type: 'landmark', label: s.final.length === 4 ? '폐의 모세 혈관' : '온몸의 모세 혈관' });", 'void 0;'],
};
let C;
if (mutant) {
  const [before, after] = mutations[mutant];
  assert.equal(source.split(before).length, 2, '고의 변이 대상은 정확히 한 곳이어야 한다.');
  const context = { module: { exports: {} } };
  vm.runInNewContext(source.replace(before, after), context);
  C = context.module.exports;
} else C = require(modulePath);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.message); }
}
// VM 객체도 값으로 비교한다. 오라클 표는 규칙 데이터에서 만들지 않는다.
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const square = id => C.SQUARES.find(s => s.id === id);
const NAMES = ['VC', 'RA', 'RV', 'PA', 'PV', 'LA', 'LV', 'Ao'];
const REASONS = ['Ao', 'VC', 'PA', 'PV'];
const OPTIONS = [
  ['RA', 'PA', 'Ao', 'VC'], ['RA', 'LA', 'RV', 'LV'], ['RA', 'LA', 'RV', 'LV'], ['PV', 'PA', 'RA', 'Ao'],
  ['PA', 'LA', 'PV', 'Ao'], ['RA', 'LA', 'RV', 'LV'], ['RA', 'LA', 'RV', 'LV'], ['Ao', 'VC', 'PA', 'LA'],
];
const ROPTIONS = [['direction', 'oxygen'], ['oxygen', 'direction'], ['oxygen', 'direction'], ['direction', 'oxygen']];
const PATHS = {
  brain: ['Ao1', 'brain', 'VC1', 'RA', 'RV', 'PA1', 'PA2', 'lung', 'PV1', 'PV2', 'LA', 'LV'],
  kidney: ['Ao1', 'Ao2', 'kidney', 'VC2', 'VC1', 'RA', 'RV', 'PA1', 'PA2', 'lung', 'PV1', 'PV2', 'LA', 'LV'],
  leg: ['Ao1', 'Ao2', 'Ao3', 'leg', 'VC3', 'VC2', 'VC1', 'RA', 'RV', 'PA1', 'PA2', 'lung', 'PV1', 'PV2', 'LA', 'LV'],
};
const REDUCED = ['LV', 'Ao', 'body', 'VC', 'RA', 'RV', 'PA', 'lung', 'PV', 'LA', 'LV'];
const reducePath = ids => ids.map(id => square(id).structure || (id === 'lung' ? 'lung' : 'body')).filter((x, i, a) => i === 0 || x !== a[i - 1]);
function submit(s, pick, seconds) { const p = C.pending(s); return C.act(s, { type: p.type, token: p.token, pick, ...(seconds === undefined ? {} : { seconds }) }); }
const wrong = (s, p) => p.options.find(o => o.key !== C.correct(s)).key;
const answerList = (names = NAMES, reasons = ['direction', 'direction', 'direction', 'direction']) => names.concat(reasons).map(pick => ({ pick, sec: null }));

test('① 기관별 실제 칸 경로·교과서 구조 순서·12/14/16칸', () => {
  for (const [organ, ids] of Object.entries(PATHS)) {
    eq(C.lapPath(organ), ids); eq(reducePath(['LV', ...C.lapPath(organ)]), REDUCED);
  }
  assert.equal(Object.values(PATHS).reduce((n, a) => n + a.length, 0), 42);
  assert.equal(C.SQUARES.length, 18); assert.equal(new Set(C.SQUARES.map(s => s.id)).size, 18);
  assert.equal(C.LAPS, 3);
});
test('② 심장 연결 여섯 개·판막 네 곳·마주 본 좌우·구역', () => {
  const pairs = [['VC', 'RA'], ['RA', 'RV'], ['RV', 'PA'], ['PV', 'LA'], ['LA', 'LV'], ['LV', 'Ao']];
  for (const organ of Object.keys(PATHS)) {
    const reduced = reducePath(['LV', ...C.lapPath(organ)]);
    for (const [a, b] of pairs) assert(reduced.some((x, i) => x === a && reduced[i + 1] === b));
  }
  eq(C.VALVES, [['RA', 'RV'], ['RV', 'PA1'], ['LA', 'LV'], ['LV', 'Ao1']]);
  for (const id of ['RA', 'RV']) assert.equal(square(id).col, 1);
  for (const id of ['LA', 'LV']) assert.equal(square(id).col, 3);
  for (const id of ['LV', 'RA', 'Ao1', 'VC1', 'brain', 'kidney', 'leg']) assert.equal(C.circuitAt(id), 'systemic');
  for (const id of ['RV', 'LA', 'PA1', 'PV1', 'lung']) assert.equal(C.circuitAt(id), 'pulmonary');
});
test('③ 동맥은 심실→모세 혈관, 정맥은 모세 혈관→심방 사이', () => {
  for (const organ of Object.keys(PATHS)) {
    const p = reducePath(['LV', ...C.lapPath(organ)]);
    for (const [vessel, from, to] of [['Ao', 'LV', 'body'], ['PA', 'RV', 'lung'], ['VC', 'body', 'RA'], ['PV', 'lung', 'LA']]) {
      const i = p.indexOf(vessel); eq(p.slice(i - 1, i + 2), [from, vessel, to]);
    }
  }
});
test('④ 혈액 상태 독립표·모세 혈관에서만 변화·모든 표지 1 이상', () => {
  const expected = { RA: 'low', RV: 'low', PA1: 'low', PA2: 'low', VC1: 'low', VC2: 'low', VC3: 'low', brain: 'low', kidney: 'low', leg: 'low',
    LA: 'high', LV: 'high', PV1: 'high', PV2: 'high', Ao1: 'high', Ao2: 'high', Ao3: 'high', lung: 'high' };
  for (const [id, blood] of Object.entries(expected)) { assert.equal(square(id).blood, blood); eq(C.bloodAt(id), C.BLOOD[blood]); }
  for (const ids of Object.values(PATHS)) {
    let blood = 'high'; let changes = 0;
    for (const id of ids) { if (square(id).blood !== blood) { assert.equal(square(id).kind, 'capillary'); changes++; } blood = square(id).blood; }
    assert.equal(changes, 2);
  }
  for (const b of Object.values(C.BLOOD)) assert(b.oxygen >= 1 && b.co2 >= 1);
  eq([C.BLOOD.high.co2, C.BLOOD.low.co2], [1, 3]);
  assert(C.BLOOD.high.oxygen >= 4 && C.BLOOD.high.oxygen <= 5);
  assert(C.BLOOD.low.oxygen >= 1 && C.BLOOD.low.oxygen <= 2);
});
test('⑤ 모든 위치×1~6: 강제 멈춤·남은 눈 버림·정방향·좌심실 종료', () => {
  for (const [organ, ids] of Object.entries(PATHS)) for (let pos = -1; pos < ids.length; pos++) for (let steps = 1; steps <= 6; steps++) {
    let to = pos;
    for (let n = 0; n < steps && to < ids.length - 1; n++) { to++; if (['brain', 'kidney', 'leg', 'lung', 'LV'].includes(ids[to])) break; }
    const m = C.move(C.lapPath(organ), pos, steps);
    eq(m.passed, ids.slice(pos + 1, to + 1)); assert.equal(m.to, to);
    assert.equal(m.stop, to === ids.length - 1 ? 'lapEnd' : ['brain', 'kidney', 'leg', 'lung'].includes(ids[to]) ? 'capillary' : null);
    assert(m.to >= pos); if (m.stop === 'lapEnd') assert.equal(ids[m.to], 'LV');
  }
  for (const bad of [0, 7, 1.5, NaN]) assert.throws(() => C.move(PATHS.brain, -1, bad));
});
test('⑥ 이름 분류 독립표 32칸 + 섞은 선택지·까닭 8칸', () => {
  const vessels = ['Ao', 'VC', 'PA', 'PV'], chambers = ['RA', 'LA', 'RV', 'LV'];
  const vtags = [[null, 'arteryVein', 'circuit', 'ventricleVein'], ['arteryVein', null, 'skip', 'circuit'], ['circuit', 'ventricleVein', null, 'arteryVein'], ['skip', 'circuit', 'arteryVein', null]];
  const ctags = [[null, 'side', 'type', 'diagonal'], ['side', null, 'diagonal', 'type'], ['type', 'diagonal', null, 'side'], ['diagonal', 'type', 'side', null]];
  for (const [keys, tags] of [[vessels, vtags], [chambers, ctags]]) keys.forEach((slot, i) => keys.forEach((pick, j) => eq(C.judgeName(slot, pick), { ok: i === j, tag: tags[i][j] })));
  for (const v of vessels) for (const c of chambers) eq(C.judgeName(v, c), { ok: false, tag: 'vesselChamber' });
  for (const slot of vessels) for (const pick of ['direction', 'oxygen']) eq(C.judgeReason(slot, pick), { ok: pick === 'direction', tag: pick === 'oxygen' ? 'oxygen' : null });
  assert.equal(C.judgeName('missing', 'Ao').ok, false); assert.equal(C.judgeReason('LV', 'direction').ok, false);
});
test('⑥ 피드백: 이름 해설은 정의 없이, 심장 방 해설은 혈관 이름 없이', () => {
  for (const v of REASONS) assert(!/심장에서 나가는|심장으로 들어오는/.test(C.nameExplanation(v)));
  for (const id of ['RA', 'RV', 'LA', 'LV']) assert(!/대동맥|대정맥|폐동맥|폐정맥/.test(C.nameExplanation(id)));
  eq(C.reasonExplanation('Ao'), '동맥은 심장에서 나가는 혈액이 흐르는 혈관이다.');
  eq(C.reasonExplanation('VC'), '정맥은 심장으로 들어오는 혈액이 흐르는 혈관이다.');
});
test('B 까닭 정답·오답 해설과 기관·바퀴 끝 안내의 지정 문장', () => {
  const explanations = {
    Ao: '대동맥에 산소가 많은 혈액이 흐르는 것은 맞다. 그러나 「동맥」은 심장에서 나가는 혈액이 흐르는 혈관이라는 뜻이다.',
    VC: '대정맥에 산소가 적은 혈액이 흐르는 것은 맞다. 그러나 「정맥」은 심장으로 들어오는 혈액이 흐르는 혈관이라는 뜻이다.',
    PA: '폐동맥에는 산소가 적은 혈액이 흐른다. 그래도 심장에서 나가는 혈액이 흐르므로 「동맥」이다.',
    PV: '폐정맥에는 산소가 많은 혈액이 흐른다. 그래도 심장으로 들어오는 혈액이 흐르므로 「정맥」이다.',
  };
  for (const slot of REASONS) {
    eq(C.reasonExplanation(slot, 'oxygen'), explanations[slot]);
    eq(C.reasonExplanation(slot, 'direction'), ['Ao', 'PA'].includes(slot) ? '동맥은 심장에서 나가는 혈액이 흐르는 혈관이다.' : '정맥은 심장으로 들어오는 혈액이 흐르는 혈관이다.');
  }
  eq(C.ORGANS.kidney.guide, '혈액 속 요소 같은 노폐물이 걸러진다. 콩팥의 세포에도 산소와 포도당을 주고 이산화 탄소를 받는다.');
  eq(C.GUIDES.lung, '폐포의 산소는 모세 혈관으로, 모세 혈관의 이산화 탄소는 폐포로 이동한다.');
  eq(C.GUIDES.lapEnd, '심장 칸을 지날 때는 혈액 색이 바뀌지 않았다. 심장은 혈액을 내보낼 뿐, 혈액에 산소를 더하지 않는다.');
  eq(C.STRUCTURES.RA.explain, '온몸을 돌고 온 혈액이 들어오는 방이다.'); eq(C.STRUCTURES.LA.explain, '폐를 거쳐 온 혈액이 들어오는 방이다.');
  for (const pick of ['direction', 'oxygen']) {
    let feedback = [];
    C.simulate({ answer: (s, p) => ['reason', 'fillReason'].includes(p.type) ? pick : C.correct(s), visit: (s, p, events) => {
      for (const e of events) if (e.type === 'reasonFeedback') { eq(e.text, C.reasonExplanation(e.slot, pick)); feedback.push(e.slot); }
    } }, 5);
    eq(feedback.slice().sort(), ['Ao', 'PA', 'PV', 'VC']);
  }
});
test('⑥ 틀린 혈관 이름 뒤 정답 이름→continue→실제 혈관 까닭 순서', () => {
  let checked = 0;
  C.simulate({ answer: (s, p) => s.phase === 'name' || s.phase === 'fillName' ? wrong(s, p) : C.correct(s), visit: (s, p, events, next) => {
    const e = events.find(x => x.type === 'nameFeedback' && REASONS.includes(x.slot));
    if (e) { assert(!e.ok); assert.equal(next.phase, 'continue'); assert.equal(next.labels[e.slot], true); assert.equal(e.text, C.nameExplanation(e.slot)); checked++; }
    if (p.type === 'reason' || p.type === 'fillReason') {
      assert(p.prompt.startsWith(C.STRUCTURES[s.slot].name));
      const last = s.practice.at(-1); assert.equal(last.kind, 'name'); assert.equal(last.slot, s.slot); assert.notEqual(last.pick, s.slot);
    }
  } }, 41);
  assert.equal(checked, 4);
});
test('D-044 고정 선택지와 정답 위치 균형·현재 빈칸만 제공', () => {
  eq(C.FINAL_NAMES, NAMES); eq(C.FINAL_REASONS, REASONS);
  const positions = [0, 0, 0, 0];
  NAMES.forEach((id, i) => {
    eq(C.NAME_OPTIONS[id], OPTIONS[i]); assert.equal(new Set(OPTIONS[i]).size, 4); positions[OPTIONS[i].indexOf(id)]++;
    if (REASONS.includes(id)) assert.equal(OPTIONS[i].filter(k => C.STRUCTURES[k].kind === 'chamber').length, 1);
  });
  eq(positions, [2, 2, 2, 2]); REASONS.forEach((id, i) => eq(C.FINAL_REASON_OPTIONS[id], ROPTIONS[i]));
  C.simulate({ visit: (s, p) => {
    if (p.type === 'finalName') { eq(Object.keys(p).sort(), ['options', 'prompt', 'token', 'type']); assert.equal(p.options.length, 4); }
  } }, 1);
});

// 전형적 오답이 보기에서 빠진 때는 정답으로 대체한다. 그 전략에 가장 유리한 상한이다.
// 순환을 모두 바꾸려는 전략: VC→PV, PV→VC는 보기 밖, PA→Ao와 Ao→PA는 보기 안.
const STRATEGIES = [
  { label: '개념을 아는 학생', names: NAMES, reasons: ['direction', 'direction', 'direction', 'direction'], stars: 3 },
  { label: '동맥·정맥을 산소로 정의', names: NAMES, reasons: ['oxygen', 'oxygen', 'oxygen', 'oxygen'], stars: 1 },
  { label: '산소로 이름 붙임(폐혈관 교환)', names: ['VC', 'RA', 'RV', 'PV', 'PA', 'LA', 'LV', 'Ao'], stars: 1 },
  { label: '한 고리 모형(두 모세 혈관 다음 다른 동맥)', names: ['PA', 'RA', 'RV', 'PA', 'Ao', 'LA', 'LV', 'Ao'], stars: 1 },
  { label: '폐정맥 다음 우심방 한 곳만', names: ['VC', 'RA', 'RV', 'PA', 'PV', 'RA', 'LV', 'Ao'], stars: 2 },
  { label: '좌우를 모두 바꿈', names: ['VC', 'LA', 'LV', 'PA', 'PV', 'RA', 'RV', 'Ao'], stars: 0 },
  { label: '폐·온몸 혈관 교환(없는 보기에서 정답 허용 상한)', names: ['VC', 'RA', 'RV', 'Ao', 'PV', 'LA', 'LV', 'PA'], stars: 1 },
  { label: '연습 모두 오답 뒤 개념 습득', names: NAMES, practiceWrong: true, stars: 3 },
];
function strategyAnswer(strategy, s, p) {
  if (p.type === 'finalName') return strategy.names[s.final.length];
  if (p.type === 'finalReason') return (strategy.reasons || ['direction', 'direction', 'direction', 'direction'])[s.final.length - 8];
  if (p.type === 'finalBoundary') return C.correct(s);
  return strategy.practiceWrong ? wrong(s, p) : C.correct(s);
}
test('⑦ 답 전수 4^8×2^4 = 1,048,576, 별 분포 독립 재계산', () => {
  const dist = [0, 0, 0, 0];
  for (let encoded = 0; encoded < 65536; encoded++) {
    let code = encoded; const names = OPTIONS.map(opts => { const key = opts[code % 4]; code = Math.floor(code / 4); return key; });
    for (let bits = 0; bits < 16; bits++) {
      const reasons = ROPTIONS.map((opts, i) => opts[(bits >> i) & 1]);
      dist[C.stars(answerList(names, reasons))]++;
    }
  }
  eq(dist, [1019952, 28599, 24, 1]); console.log('전수 별 0/1/2/3: ' + dist.join(' / '));
});
test('⑦ 전략별 별·실제 선택 가능성·반개념 전략 최고 별 1', () => {
  for (const strategy of STRATEGIES) {
    strategy.names.forEach((pick, i) => assert(OPTIONS[i].includes(pick)));
    const value = C.stars(answerList(strategy.names, strategy.reasons)); assert.equal(value, strategy.stars);
    console.log('전략: ' + strategy.label + ' → 별 ' + value);
  }
  for (const [slot, pick] of [['VC', 'PA'], ['PV', 'Ao'], ['PA', 'PV'], ['PV', 'PA']]) assert(C.NAME_OPTIONS[slot].includes(pick));
  // 네 혈관 자리 모두 심장 방으로 답하면 이름 4개만 남는다.
  assert.equal(C.stars(answerList(['RA', 'RA', 'RV', 'RA', 'LA', 'LA', 'LV', 'LA'])), 0);
  // 순환 교환에서 없는 두 보기는 각각 네 보기 모두 열어 상한을 전수로 센다.
  let max = 0;
  for (const vc of OPTIONS[0]) for (const pv of OPTIONS[4]) max = Math.max(max, C.stars(answerList([vc, 'RA', 'RV', 'Ao', pv, 'LA', 'LV', 'PA'])));
  assert.equal(max, 1);
  // 산소로 정의·이름 붙이기·한 고리 전략도 남은 까닭 16가지에서 별 1을 넘지 않는다.
  for (const strategy of STRATEGIES.slice(2, 4)) for (let bits = 0; bits < 16; bits++) {
    assert(C.stars(answerList(strategy.names, REASONS.map((_, i) => bits & (1 << i) ? 'oxygen' : 'direction'))) <= 1);
  }
});
test('⑦ 까닭 위/아래 고정·교대 전략은 2개만 맞힘', () => {
  for (const pattern of [[0, 0, 0, 0], [1, 1, 1, 1], [0, 1, 0, 1], [1, 0, 1, 0]]) {
    const reasons = pattern.map((index, i) => ROPTIONS[i][index]);
    assert.equal(reasons.filter(x => x === 'direction').length, 2); assert.equal(C.stars(answerList(NAMES, reasons)), 1);
  }
});
test('⑦ 부분 지식 분포: 경로 암기·심장 방 좌우 무작위', () => {
  const reasonDist = [0, 0, 0, 0], sideDist = [0, 0, 0, 0];
  for (let bits = 0; bits < 16; bits++) {
    reasonDist[C.stars(answerList(NAMES, REASONS.map((_, i) => bits & (1 << i) ? 'oxygen' : 'direction')))]++;
    const n = NAMES.slice();
    [1, 2, 5, 6].forEach((index, i) => { if (bits & (1 << i)) n[index] = { RA: 'LA', RV: 'LV', LA: 'RA', LV: 'RV' }[n[index]]; });
    sideDist[C.stars(answerList(n))]++;
  }
  eq(reasonDist, [0, 15, 0, 1]); eq(sideDist, [1, 10, 4, 1]);
});

test('⑩ 마지막 바퀴 14개 이벤트는 고른 답만, 점수·detail·결과는 종료 전 잠김', () => {
  for (const answer of [(s) => C.correct(s), wrong]) {
    let frozenScore, questions = 0;
    C.simulate({ answer, visit: (s, p, events, next) => {
      if (p.type === 'darkStart') frozenScore = C.score(next);
      if (p.type.startsWith('final')) {
        questions++; const e = events.find(e => e.type === 'finalAnswer');
        eq(Object.keys(e).sort(), ['kind', 'pick', 'type']);
        for (const record of next.final.concat(next.boundaries)) eq(Object.keys(record).sort(), ['pick', 'sec']);
        if (next.phase !== 'end') { assert.equal(C.score(next), frozenScore); assert.equal(C.detail(next), null); eq(C.resultLines(next), []); }
        assert(!events.some(e => /Feedback/.test(e.type)));
      }
    } }, 7);
    assert.equal(questions, 14);
  }
});
test('D-044 경계 2개는 마지막 까닭 뒤, 별·점수 불변, detail에 정오', () => {
  const perfect = C.simulate('first', 17);
  let seen = [];
  const wrongBoundary = C.simulate({ dice: 'first', answer: (s, p) => p.type === 'finalBoundary' ? wrong(s, p) : C.correct(s), visit: (s, p) => {
    if (p.type === 'finalBoundary') { assert.equal(s.final.length, 12); seen.push({ q: p.prompt, options: p.options.map(x => x.key) }); }
  } }, 17);
  eq(seen, [{ q: '폐순환이 끝나는 곳은?', options: ['LA', 'LV'] }, { q: '온몸순환이 시작되는 곳은?', options: ['RA', 'LA', 'RV', 'LV'] }]);
  assert.equal(C.score(wrongBoundary), C.score(perfect)); assert.equal(C.stars(wrongBoundary.final), 3);
  eq(C.detail(perfect).boundaries.map(x => x.ok), [true, true]); eq(C.detail(wrongBoundary).boundaries.map(x => x.ok), [false, false]);
});
test('⑨ 동일 시드·주사위 정책의 24문항: 오답 하나→정답 하나 점수 엄격 증가', () => {
  for (const dice of ['blank', 'random', 'first']) for (const seed of [1, 42, 1000]) {
    const allWrong = C.simulate({ dice, answer: wrong }, seed);
    for (let target = 0; target < 24; target++) {
      let i = 0;
      const improved = C.simulate({ dice, answer: (s, p) => {
        if (p.type === 'finalBoundary') return wrong(s, p);
        return i++ === target ? C.correct(s) : wrong(s, p);
      } }, seed);
      assert.equal(i, 24); assert(C.score(improved) > C.score(allWrong));
      eq(improved.organs, allWrong.organs); assert.equal(improved.turns, allWrong.turns);
      const record = target < 12 ? improved.practice[target] : null;
      assert.equal(C.score(improved) - C.score(allWrong), target >= 12 ? 10 : record.kind === 'name' && record.at === 'play' ? 10 : 5);
    }
  }
});
test('API 순수성·시드 재현·중복/잘못된 입력·외부 변경 격리', () => {
  let s = C.newGame(321); const before = JSON.stringify(s), p = C.pending(s);
  const action = { type: p.type, token: p.token, pick: C.correct(s), seconds: 2 };
  const a = C.act(s, action), b = C.act(s, action); eq(a, b); assert.equal(JSON.stringify(s), before);
  assert.equal(a.ignored, false);
  for (const [state, bad] of [[s, null], [s, {}], [s, { ...action, pick: 'invalid' }], [s, { ...action, token: -1 }], [a.state, action]]) {
    const out = C.act(state, bad); eq(out, { state, events: [], ignored: true }); assert.strictEqual(out.state, state);
  }
  p.options[0].label = '변경'; assert.notEqual(C.pending(s).options[0].label, '변경');
  a.events[0].pick = '변경'; assert.notEqual(a.state.practice[0].pick, '변경');
  const copied = submit(a.state).state; copied.practice[0].pick = '변경'; assert.notEqual(a.state.practice[0].pick, '변경');
  eq(C.simulate('random', 99), C.simulate('random', 99));
  const r = C.rng(1); eq([r(), r(), r()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  const end = C.simulate('first', 1); const ignored = submit(end);
  eq(ignored, { state: end, events: [], ignored: true }); assert.strictEqual(ignored.state, end);
});
test('기관 재방문 차단·미공개 preview 이름 숨김·판막/교환 이벤트', () => {
  let exchange = [], valves = [], laps = [], blank = 0, chosen = 0;
  const s = C.simulate({ visit: (s, p, events) => {
    if (p.type === 'organ') assert(p.options.every(o => !s.organs.includes(o.key)));
    if (p.type === 'die') {
      if (p.options.some(o => o.blank)) blank++;
      for (const o of p.options) if (o.blank) assert.equal(o.label, o.steps + '칸 → 이름 없는 칸');
    }
    for (const e of events) {
      if (e.type === 'exchange') exchange.push(e.square);
      if (e.type === 'step' && e.valve) valves.push([e.from, e.to]);
      if (e.type === 'lapEnd') laps.push(e.lap);
      if (e.type === 'nameFeedback' && e.at === 'play') chosen++;
    }
  } }, 6);
  eq(exchange, ['brain', 'lung', 'kidney', 'lung', 'leg', 'lung']); eq(laps, [1, 2, 3]);
  assert.equal(valves.length, 12); assert.equal(s.blankOpportunities, blank); assert.equal(s.blankChosen, chosen);
});
test('detail 관찰 신호·처음 혈관·동일 오답·연습 메타데이터', () => {
  const s = C.simulate({ answer: (s, p) => {
    if (['reason', 'fillReason', 'finalReason'].includes(p.type)) return 'oxygen';
    if (p.type === 'finalBoundary') return C.correct(s);
    const slot = C.correct(s), swap = { PA: 'PV', PV: 'PA', Ao: 'VC', VC: 'Ao', RA: 'LA', RV: 'RA', LA: 'RV', LV: 'RV' };
    return swap[slot];
  } }, 5);
  const d = C.detail(s, 7);
  eq(d.pulmonarySwap, [2, 2]); eq(d.systemicSwap, [2, 2]); eq(d.chamberSide, [2, 2]); eq(d.chamberType, [1, 1]); eq(d.chamberDiagonal, [1, 1]);
  eq(d.reasonOxygen, { systemic: [2, 2], pulmonary: [2, 2] }); assert.equal(d.cueConflict, 2);
  assert.equal(d.repeatWrong.length, 12); eq(d.reasonOxygenNameRight, []); assert.equal(d.playNo, 7);
  assert.equal(d.firstVessel.name.ok, false); assert.equal(d.firstVessel.reason.ok, false);
  assert.equal(d.firstVessel.reason.order, d.firstVessel.name.order + 1);
  d.practice.forEach((x, i) => { assert.equal(x.order, i + 1); assert(x.lap >= 1 && x.lap <= 3); if (x.at === 'fill') assert.equal(x.lap, 3); });
  assert.equal(d.practice[0].at, 'start'); assert.equal(d.practice[0].lap, 1);
  const oxygen = C.detail(C.simulate({ answer: (s, p) => p.type.toLowerCase().includes('reason') ? 'oxygen' : C.correct(s) }, 1));
  eq(oxygen.reasonOxygenNameRight.slice().sort(), ['Ao', 'PA', 'PV', 'VC']);
  const skips = C.detail(C.simulate({ answer: (s, p) => {
    const slot = C.correct(s); return ['VC', 'PV'].includes(slot) ? { VC: 'PA', PV: 'Ao' }[slot] : slot;
  } }, 1));
  eq(skips.skip, [null, 2]); assert.equal(skips.practice.filter(x => x.tag === 'skip').length, 2);
  const chambers = C.detail(C.simulate({ answer: (s, p) => p.type === 'finalName' && REASONS.includes(C.correct(s)) ? { VC: 'RA', PA: 'RA', PV: 'LA', Ao: 'LA' }[C.correct(s)] : C.correct(s) }, 1));
  eq(chambers.vesselChamber, [null, 4]);
  const oneWrong = C.detail(C.simulate({ answer: (s, p) => strategyAnswer(STRATEGIES[4], s, p) }, 1)); assert.equal(oneWrong.pvToRA, true);
});
test('시간은 주입값만 기록, 마지막 12문항과 경계 시간을 분리', () => {
  let s = C.newGame(2), steps = 0;
  while (s.phase !== 'end' && steps < 300) {
    const p = C.pending(s); const pick = ['organ', 'die'].includes(p.type) ? p.options[0].key : C.correct(s);
    s = submit(s, pick, 2).state; steps++;
  }
  const d = C.detail(s); assert(d); assert.equal(d.finalSec, 24); assert.equal(d.boundarySec, 4); assert.equal(d.playSec, steps * 2);
  assert.equal(d.untimedCount, 0);
  const untimed = C.detail(C.simulate('first', 1));
  assert.equal(untimed.playSec, 0); assert.equal(untimed.finalSec, 0); assert.equal(untimed.boundarySec, 0); assert(untimed.untimedCount > 14);
});
test('결과 문장 최대 5줄·오답 수정 최대 2곳·사실 표현', () => {
  for (const strategy of STRATEGIES) {
    const s = C.simulate({ answer: (s, p) => strategyAnswer(strategy, s, p) }, 3), lines = C.resultLines(s);
    assert(lines.length >= 3 && lines.length <= 5); assert(lines[0].startsWith('마지막 바퀴: 이름'));
    assert(lines[1].startsWith('연습 바퀴에서 처음 고른 답')); assert(!/찍었다|오개념이 있다|이해하지 못/.test(lines.join(' ')));
    assert(!lines.join(' ').includes('→ 대동맥 →'));
  }
});
test('B 결과: 까닭 묶음·이름 우선 선택 후 경로 순서·반복 오답·모자란 조건만', () => {
  const perfect = C.simulate('first', 3);
  const stateFor = (names, reasons) => ({ ...perfect, final: answerList(names, reasons) });
  const nameSentences = [
    '온몸의 모세 혈관 다음 혈관은 대정맥이다', '온몸을 돌고 온 혈액이 들어오는 방은 우심방이다',
    '폐로 혈액을 내보내는 방은 우심실이다', '우심실에서 나간 혈액이 지나는 혈관은 폐동맥이다',
    '폐의 모세 혈관 다음 혈관은 폐정맥이다', '폐를 거쳐 온 혈액이 들어오는 방은 좌심방이다',
    '온몸으로 혈액을 내보내는 방은 좌심실이다', '좌심실에서 나간 혈액이 지나는 혈관은 대동맥이다',
  ];
  const allWrong = OPTIONS.map((options, i) => options.find(k => k !== NAMES[i]));
  for (let i = 0; i < 8; i++) {
    const names = NAMES.slice(); names[i] = allWrong[i];
    const lines = C.resultLines(stateFor(names)); assert.equal(lines.length, 4);
    eq(lines[2], nameSentences[i] + '(고른 답: ' + C.STRUCTURES[names[i]].name + ').');
    eq(lines.at(-1), '다음 별: 이름 1개 더.');
  }
  const group = n => '「동맥」은 심장에서 나가는, 「정맥」은 심장으로 들어오는 혈액이 흐르는 혈관이다(까닭 ' + n + '개 틀림).';
  // 까닭 묶음과 폐동맥 이름을 우선 골라야 한다. 까닭 묶음의 첫 자리인 대정맥이 먼저다.
  const reasons = ['oxygen', 'oxygen', 'oxygen', 'oxygen'];
  eq(C.resultLines(stateFor(allWrong, reasons)).slice(2, 4), [group(4), nameSentences[3] + '(고른 답: 폐정맥).']);
  // 대동맥 까닭만 틀렸으면, 고른 두 줄은 폐동맥 이름 → 대동맥 까닭 순서다.
  eq(C.resultLines(stateFor(allWrong, ['oxygen', 'direction', 'direction', 'direction'])).slice(2, 4), [nameSentences[3] + '(고른 답: 폐정맥).', group(1)]);
  eq(C.resultLines(stateFor(allWrong)).slice(2, 4), [nameSentences[3] + '(고른 답: 폐정맥).', nameSentences[4] + '(고른 답: 폐동맥).']);
  eq(C.resultLines(perfect), ['마지막 바퀴: 이름 8/8 · 까닭 4/4', '연습 바퀴에서 처음 고른 답 12/12 → 마지막 바퀴 12/12', '별 3 조건을 모두 채웠다.']);
  const repeated = C.simulate({ answer: (s, p) => p.type === 'finalBoundary' ? C.correct(s) : p.type.toLowerCase().includes('reason') ? 'oxygen' : C.correct(s) }, 3);
  eq(C.resultLines(repeated)[1], '연습 바퀴에서 처음 고른 답 8/12 → 마지막 바퀴 8/12 (연습 때와 같은 오답 4개)');
  for (let nameCount = 0; nameCount <= 8; nameCount++) for (let reasonCount = 0; reasonCount <= 4; reasonCount++) {
    const names = NAMES.map((key, i) => i < nameCount ? key : allWrong[i]);
    const r = REASONS.map((_, i) => i < reasonCount ? 'direction' : 'oxygen');
    const lines = C.resultLines(stateFor(names, r)); assert(lines.length >= 3 && lines.length <= 5);
    const next = nameCount === 8 && reasonCount === 4 ? '별 3 조건을 모두 채웠다.' :
      nameCount < 5 ? '다음 별: 이름 ' + (5 - nameCount) + '개 더.' :
      reasonCount === 4 && nameCount === 7 ? '다음 별: 이름 1개 더.' :
      '다음 별: ' + [nameCount < 7 ? '이름 ' + (7 - nameCount) + '개 더' : '', reasonCount < 4 ? '까닭 ' + (4 - reasonCount) + '개 더' : ''].filter(Boolean).join(' · ') + (reasonCount === 4 ? '(까닭은 모두 맞힘)' : '') + '.';
    eq(lines.at(-1), next);
  }
  eq(C.resultLines(stateFor(NAMES.map((key, i) => i < 6 ? key : allWrong[i]))).at(-1), '다음 별: 이름 1개 더(까닭은 모두 맞힘).');
  eq(C.resultLines(stateFor(NAMES.map((key, i) => i < 7 ? key : allWrong[i]), ['oxygen', 'oxygen', 'direction', 'direction'])).at(-1), '다음 별: 까닭 2개 더.');
});
test('브라우저 전역 내보내기·불변 데이터·금지된 외부 의존 없음', () => {
  const context = { window: {} }; vm.runInNewContext(source, context);
  assert.equal(typeof context.window.Circulation.act, 'function'); assert.equal(context.window.Circulation.stars(answerList()), 3);
  assert(Object.isFrozen(C.SQUARES) && Object.isFrozen(C.NAME_OPTIONS.PA));
  assert(!/\b(?:document|localStorage|fetch|XMLHttpRequest)\b|Date\.now|Math\.random/.test(source));
});
test('⑪ 게임 폴더 아래 모든 JS·HTML 금지어 검사', () => {
  const forbidden = /동맥혈|정맥혈|거품|혈구|마블|모세혈관|이산화탄소|온몸 순환|폐 순환|중격|이중 순환|상대정맥|하대정맥|반월판|방실판|간문맥|관상 동맥|기포/;
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(target);
      else if (/\.(js|html)$/.test(entry.name)) assert(!forbidden.test(fs.readFileSync(target, 'utf8').replaceAll('적혈구', '')), target);
    }
  }
  inspect(path.dirname(modulePath));
});

test('C 입력 계약: 주사위 숫자·문자열, 시간 오류는 입력을 막지 않음', () => {
  let dieState;
  C.simulate({ visit: (s, p) => { if (!dieState && p.type === 'die') dieState = s; } }, 2);
  for (const pick of [0, 1]) {
    const numeric = submit(dieState, pick, 2), text = submit(dieState, String(pick), 2);
    eq(text, numeric); assert.equal(text.ignored, false);
  }
  for (const pick of ['2', '00', '', false]) {
    const out = submit(dieState, pick); assert(out.ignored); assert.strictEqual(out.state, dieState);
  }
  for (const seconds of [undefined, null, -1, NaN, Infinity, '2', {}, false]) {
    const s = C.newGame(3), out = submit(s, 'LV', seconds);
    assert.equal(out.ignored, false); assert.equal(out.state.playSec, 0); assert.equal(out.state.untimedCount, 1);
    assert.equal(out.state.practice[0].pick, 'LV');
  }
  // 이름·까닭은 문자열 key 그대로 받으며 주사위 단계만 숫자로 정규화한다.
  assert(submit(C.newGame(3), 0).ignored);
  let s = C.newGame(3), actions = 0, valid = 0, finalSec = 0, boundarySec = 0, missing = 0;
  const secondsList = [2, undefined, null, -1, '2', 0];
  while (s.phase !== 'end') {
    const p = C.pending(s), seconds = secondsList[actions++ % secondsList.length];
    const measured = typeof seconds === 'number' && seconds >= 0;
    if (measured) { valid += seconds; if (['finalName', 'finalReason'].includes(p.type)) finalSec += seconds; if (p.type === 'finalBoundary') boundarySec += seconds; }
    else missing++;
    const pick = ['organ', 'die'].includes(p.type) ? p.options[0].key : C.correct(s);
    const out = submit(s, pick, seconds); assert.equal(out.ignored, false); s = out.state;
    if (p.type.startsWith('final')) assert.equal((p.type === 'finalBoundary' ? s.boundaries : s.final).at(-1).sec, measured ? seconds : null);
    assert(actions < 300);
  }
  const d = C.detail(s); eq([d.playSec, d.finalSec, d.boundarySec, d.untimedCount], [valid, finalSec, boundarySec, missing]);
});
test('C 소수 시드 변환·잘못된 시드 TypeError·미완료 별 null', () => {
  for (const seed of [NaN, Infinity, -Infinity, '1', null, {}, false]) assert.throws(() => C.newGame(seed), { name: 'TypeError' });
  for (const seed of [0.1, 0.2, 0.5, 0.9]) eq(C.newGame(seed), C.newGame(Math.floor(seed * 2 ** 32)));
  const boards = [0.1, 0.2, 0.5, 0.9].map(seed => JSON.stringify(C.simulate('first', seed)));
  assert.equal(new Set(boards).size, 4); eq(C.newGame(), C.newGame(1));
  for (let length = 0; length < 12; length++) assert.equal(C.stars(answerList().slice(0, length)), null);
  for (const final of [null, undefined, {}, { names: 8, reasons: 4 }, Array(12).fill({}), [...answerList().slice(0, 11), null]]) assert.equal(C.stars(final), null);
  assert.equal(C.stars(answerList()), 3);
});
test('C detail 신호 두 칸·측정 불가능한 칸은 null', () => {
  const d = C.detail(C.simulate('first', 1));
  const paired = ['pulmonarySwap', 'systemicSwap', 'circuitSwap', 'skip', 'ventricleVein', 'chamberSide', 'chamberType', 'chamberDiagonal', 'vesselChamber'];
  for (const key of paired) assert.equal(d[key].length, 2, key);
  for (const key of ['systemic', 'pulmonary']) assert.equal(d.reasonOxygen[key].length, 2);
  eq(d.skip, [null, 0]); eq(d.ventricleVein, [0, null]); eq(d.vesselChamber, [null, 0]);
  const observed = C.detail(C.simulate({ answer: (s, p) => ['name', 'fillName'].includes(p.type) && ['Ao', 'PA'].includes(C.correct(s)) ? { Ao: 'PV', PA: 'VC' }[C.correct(s)] : C.correct(s) }, 1));
  eq(observed.ventricleVein, [2, null]);
});
test('C hud 연습 바퀴 번호·기관 선택 동안 다음 번호·마지막 점수 고정', () => {
  let organs = [], frozen;
  const end = C.simulate({ visit: (s, p, events, next) => {
    const h = C.hud(s); eq(Object.keys(h).sort(), ['dark', 'lap', 'score']); assert.equal(h.score, C.score(s));
    const dark = p.type.startsWith('final'); assert.equal(h.dark, dark);
    if (p.type === 'organ') { assert.equal(h.lap, s.organs.length + 1); organs.push(h.lap); }
    else assert.equal(h.lap, dark || p.type === 'darkStart' ? null : s.lap);
    if (p.type === 'darkStart') { frozen = C.score(next); eq(C.hud(next), { lap: null, dark: true, score: frozen }); }
    if (dark) assert.equal(h.score, frozen);
  } }, 11);
  eq(organs, [1, 2, 3]); eq(C.hud(end), { lap: null, dark: false, score: C.score(end) });
});
test('C 모세 혈관 입구·출구 혈액 상태와 기존 blood 호환', () => {
  const caps = C.SQUARES.filter(s => s.kind === 'capillary'); assert.equal(caps.length, 4);
  for (const sq of caps) {
    eq([sq.bloodIn, sq.bloodOut, sq.blood], sq.id === 'lung' ? ['low', 'high', 'high'] : ['high', 'low', 'low']);
    eq(C.bloodAt(sq), C.BLOOD[sq.bloodOut]);
  }
  for (const [organ, ids] of Object.entries(PATHS)) {
    for (const id of [organ, 'lung']) {
      const i = ids.indexOf(id); assert.equal(square(id).bloodIn, square(ids[i - 1]).blood);
      assert.equal(square(id).bloodOut, square(ids[i + 1]).blood);
    }
  }
});
test('D 선택지 순서: 연습 심장 방·까닭은 시드로 섞고 혈관·마지막은 고정', () => {
  const chambers = new Set(), reasons = new Set();
  for (let seed = 1; seed <= 32; seed++) C.simulate({ visit: (s, p) => {
    const keys = p.options.map(o => o.key);
    if (['nameStart', 'name', 'fillName'].includes(p.type)) {
      if (['RA', 'RV', 'LA', 'LV'].includes(s.slot)) { chambers.add(keys.join(',')); eq(keys.slice().sort(), ['LA', 'LV', 'RA', 'RV']); }
      else eq(keys, ['Ao', 'VC', 'PA', 'PV']);
    }
    if (['reason', 'fillReason'].includes(p.type)) { reasons.add(keys.join(',')); eq(keys.slice().sort(), ['direction', 'oxygen']); }
    if (p.type === 'finalName') eq(keys, OPTIONS[s.final.length]);
    if (p.type === 'finalReason') eq(keys, ROPTIONS[s.final.length - 8]);
    if (p.type === 'finalBoundary') eq(keys, s.boundaries.length ? ['RA', 'LA', 'RV', 'LV'] : ['LA', 'LV']);
  } }, seed);
  assert(chambers.size > 1, '연습 심장 방 순서가 실제로 달라져야 한다.'); assert.equal(reasons.size, 2);
});
test('D 기관 섞기 정책은 시드로 재현되며 여러 방문 순서를 만든다', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const config = { dice: 'blank', organ: 'random' };
    const s = C.simulate(config, seed); eq(s, C.simulate(config, seed));
    eq(s.organs.slice().sort(), ['brain', 'kidney', 'leg']); orders.add(s.organs.join(','));
    const other = C.simulate({ ...config, answer: wrong }, seed);
    eq(other.organs, s.organs); assert.equal(other.turns, s.turns);
  }
  assert.equal(orders.size, 6);
});
test('D landmark는 4·8번째 이름 답 뒤에만, 개수 정보 없음', () => {
  let nameCount = 0, seen = [];
  C.simulate({ visit: (s, p, events) => {
    if (p.type === 'finalName') nameCount++;
    const landmarks = events.filter(e => e.type === 'landmark');
    assert.equal(landmarks.length, p.type === 'finalName' && [4, 8].includes(nameCount) ? 1 : 0);
    for (const e of landmarks) {
      eq(Object.keys(e).sort(), ['label', 'type']); assert(!/\d/.test(JSON.stringify(e)));
      assert.equal(events.indexOf(e), events.findIndex(e => e.type === 'finalAnswer') + 1);
      seen.push([nameCount, e.label]);
    }
  } }, 19);
  eq(seen, [[4, '폐의 모세 혈관'], [8, '온몸의 모세 혈관']]);
});
// 고른 답만 제외: state.final·boundaries 레코드의 pick과 events.finalAnswer의 pick.
// 나머지 모든 필드(시간·길이·연습 기록 포함)는 보존한다. ok·정답 표시는 지우지 않는다.
function withoutPicks(state, events) {
  const strip = record => { const { pick, ...rest } = record; return rest; };
  return { state: { ...state, final: state.final.map(strip), boundaries: state.boundaries.map(strip) },
    events: events.map(e => e.type === 'finalAnswer' ? strip(e) : e) };
}
test('D 정오 누출 차분: 정답·보기 안 오답의 pending·events·hud·score·state 동일', () => {
  for (const seed of [1, 7, 32]) {
    let start;
    C.simulate({ visit: (s, p) => { if (p.type === 'finalName' && !start) start = s; } }, seed);
    let right = start, incorrect = start, steps = 0;
    while (right.phase !== 'end') {
      const p = C.pending(right), q = C.pending(incorrect); eq(p, q);
      // 차분만으로는 공통 정답 키 유출을 못 잡으므로 모든 선택지 필드도 제한한다.
      eq(Object.keys(p).sort(), ['options', 'prompt', 'token', 'type']);
      for (const option of p.options) eq(Object.keys(option).sort(), ['key', 'label']);
      eq(C.hud(right), C.hud(incorrect)); assert.equal(C.score(right), C.score(incorrect));
      eq(withoutPicks(right, []).state, withoutPicks(incorrect, []).state);
      const a = submit(right, C.correct(right), 2), b = submit(incorrect, wrong(incorrect, q), 2);
      assert.equal(a.ignored, false); assert.equal(b.ignored, false); eq(withoutPicks(a.state, a.events).events, withoutPicks(b.state, b.events).events);
      if (a.state.phase !== 'end') {
        eq(withoutPicks(a.state, []).state, withoutPicks(b.state, []).state);
        for (const s of [a.state, b.state]) {
          assert(!/"(?:ok|tag|stars|correct|remaining|total|finalCorrect)"/.test(JSON.stringify(s)));
          eq(C.resultLines(s), []); assert.equal(C.detail(s), null);
        }
      }
      right = a.state; incorrect = b.state; assert(++steps <= 14);
    }
    assert.equal(steps, 14); assert.equal(C.stars(right.final), 3); assert.equal(C.stars(incorrect.final), 0);
  }
});

if (!mutant) {
  test('⑧ 시드 1,000×정책 4×전략 8: 별 불변·문항 불변·연습 12피드백 선행', () => {
    let games = 0, maxScore = 0; const metrics = {};
    for (const policy of ['blank', 'random', 'first', 'shuffledOrgans']) {
      const dice = policy === 'shuffledOrgans' ? 'blank' : policy;
      const organ = policy === 'shuffledOrgans' ? 'random' : 'first';
      metrics[policy] = { turns: [], fill: [], zeroFill: 0 };
      for (let seed = 1; seed <= 1000; seed++) for (const strategy of STRATEGIES) {
        const feedback = [], finalQuestions = []; let darkSeen = false;
        const s = C.simulate({ dice, organ, answer: (s, p) => strategyAnswer(strategy, s, p), visit: (s, p, events) => {
          for (const e of events) if (e.type === 'nameFeedback' || e.type === 'reasonFeedback') feedback.push(e.kind + ':' + e.slot);
          if (p.type === 'darkStart') {
            assert.equal(feedback.length, 12); eq(feedback.slice().sort(), NAMES.map(x => 'name:' + x).concat(REASONS.map(x => 'reason:' + x)).sort());
            assert.equal(Object.keys(s.labels).length, 8); darkSeen = true;
          }
          if (p.type.startsWith('final')) { assert(darkSeen); finalQuestions.push([p.type, p.options.map(x => x.key)]); }
        } }, seed);
        const expected = OPTIONS.map(x => ['finalName', x]).concat(ROPTIONS.map(x => ['finalReason', x]), [['finalBoundary', ['LA', 'LV']], ['finalBoundary', ['RA', 'LA', 'RV', 'LV']]]);
        eq(finalQuestions, expected); assert.equal(C.stars(s.final), strategy.stars);
        assert.equal(s.practice.length, 12); assert.equal(s.final.length, 12); assert.equal(s.boundaries.length, 2);
        assert.equal(s.completedLaps, 3); eq(s.organs.slice().sort(), ['brain', 'kidney', 'leg']);
        if (organ === 'first') eq(s.organs, ['brain', 'kidney', 'leg']);
        assert.equal(s.square, 'LV');
        if (strategy.practiceWrong) assert.equal(C.detail(s).practiceFirst, 0);
        maxScore = Math.max(maxScore, C.score(s)); assert(C.score(s) <= 215);
        if (strategy === STRATEGIES[0]) {
          const fill = s.practice.filter(x => x.kind === 'name' && x.at === 'fill').length;
          metrics[policy].turns.push(s.turns); metrics[policy].fill.push(fill); if (!fill) metrics[policy].zeroFill++;
        }
        games++;
      }
    }
    assert.equal(games, 32000); assert.equal(maxScore, 215);
    console.log('전체 판 ' + games + ', 최대 점수 ' + maxScore);
    for (const [policy, data] of Object.entries(metrics)) {
      data.turns.sort((a, b) => a - b);
      const mean = data.turns.reduce((a, b) => a + b) / 1000, fill = data.fill.reduce((a, b) => a + b) / 1000;
      assert(mean >= 14 && mean <= 19);
      console.log('⑫ ' + policy + ': 평균 ' + mean.toFixed(3) + '턴, 5~95% ' + data.turns[49] + '~' + data.turns[949] + ', 보충 이름 평균 ' + fill.toFixed(3) + ', 보충 없음 ' + data.zeroFill + '/1000');
    }
  });
  // 원본 파일을 바꾸지 않고 VM에서 규칙을 고의로 깨뜨린다. 자식 테스트가 FAIL·종료 1인지 확인한다.
  // 강제 멈춤·까닭 문턱 제거, 이벤트·선택지 정오 노출, 경계 가산점,
  // 연습 심장 방·까닭 섞기 제거, 모세 혈관 표지 제거의 8종이다.
  test('고의 변이 8종은 실제 단언 FAIL·종료 1, 원본 파일은 보존', () => {
    const targets = { capillary: '⑤ 모든 위치', stars: '⑦ 답 전수', leak: '⑩ 마지막 바퀴', boundary: 'D-044 경계 2개',
      optionLeak: 'D 정오 누출 차분', chamberOrder: 'D 선택지 순서', reasonOrder: 'D 선택지 순서', landmark: 'D landmark' };
    for (const name of Object.keys(mutations)) {
      const run = spawnSync(process.execPath, [__filename, '--mutant=' + name], { encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 1, name + ': ' + run.stderr); assert(run.stdout.includes('FAIL ' + targets[name]), name + ' 목표 단언');
      console.log('고의 변이 ' + name + ': 목표 FAIL 확인, 종료 ' + run.status);
    }
    assert.equal(fs.readFileSync(modulePath, 'utf8'), source);
    eq(require(modulePath).simulate('first', 23), C.simulate('first', 23));
  });
}
console.log('혈액 순환 일주: PASS ' + pass + ', FAIL ' + fail);
process.exit(fail ? 1 : 0);
