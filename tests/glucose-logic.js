/* GL-1 / D-054 Q1: 54 미만 누적 0.1초의 별 상한과 전략별 분포를 검증한다.
 * GLUCOSE_MODEL로 수정 전·고의 변이 모듈을 넣으면 회귀 단언이 실패해야 한다.
 */
const assert = require('node:assert/strict');
const M = require(process.env.GLUCOSE_MODEL || '../games/glucose/model.js');
const DT = 1 / 60;
const oldStars = s => s.tir / M.DAY >= .9 ? 3 : s.tir / M.DAY >= .75 ? 2 : s.tir / M.DAY >= .6 ? 1 : 0;
function run(policy, mode = 'normal', dt = DT) {
  const s = M.init(mode);
  for (let i = 0; i * dt < M.DAY - 1e-8; i++) M.step(s, policy(s, i), Math.min(dt, M.DAY - s.t));
  return s;
}
function reactive(delay, threshold = 120) {
  const history = [];
  return s => {
    history.push({ t: s.t, g: s.g });
    while (history.length > 1 && history[1].t <= s.t - delay + 1e-8) history.shift();
    return history[0].g > threshold;
  };
}
function random(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const rows = [];
const add = (name, mode, states) => rows.push({ name, mode, states });
for (const mode of ['normal', 'resistance']) {
  for (const delay of [0, .3, .5, 1, 1.5, 2]) add(`반응 지연 ${delay}초`, mode, [run(reactive(delay), mode)]);
  add('0.5초 교대 (시작 위상 10개)', mode, Array.from({ length: 10 }, (_, phase) => run((s, i) => (i + phase * 6) % 60 < 30, mode)));
  add('매초 0.45초 누름 (시작 위상 10개)', mode, Array.from({ length: 10 }, (_, phase) => run((s, i) => (i + phase * 6) % 60 < 27, mode)));
  const rnd = random(7), states = [];
  for (let n = 0; n < 2000; n++) {
    let hold = false, until = 0;
    const probability = .3 + rnd() * .4;
    states.push(run(s => {
      if (s.t >= until) { hold = rnd() < probability; until = s.t + .2 + rnd() * .8; }
      return hold;
    }, mode));
  }
  add('무작위 누르고 떼기 2000판 (시드 7)', mode, states);
  add('개념과 반대: 100·140 미만에서 누름', mode, [100, 140].map(th => run(s => s.g < th, mode)));
  add('계속 누름 / 계속 뗌', mode, [run(() => true, mode), run(() => false, mode)]);
}
const distribution = (states, fn) => states.reduce((a, s) => { a[fn(s)]++; return a; }, [0, 0, 0, 0]);
const range = values => `${Math.min(...values).toFixed(2)}~${Math.max(...values).toFixed(2)}`;
for (const row of rows) console.log(JSON.stringify({
  전략: row.name, 모드: row.mode, '별0·1·2·3': distribution(row.states, M.stars),
  '상한전_별0·1·2·3': distribution(row.states, oldStars),
  '목표범위%': range(row.states.map(s => s.tir / M.DAY * 100)),
  '54미만초': range(row.states.map(s => s.severe)),
}));
const expected = {
  normal: [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 1, 0, 0], [0, 1, 0, 0], [1, 0, 0, 0],
    [0, 10, 0, 0], [0, 0, 10, 0], [1254, 575, 125, 46], [2, 0, 0, 0], [2, 0, 0, 0]],
  resistance: [[0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0],
    [10, 0, 0, 0], [10, 0, 0, 0], [1720, 179, 69, 32], [2, 0, 0, 0], [2, 0, 0, 0]],
};
for (const mode of ['normal', 'resistance']) {
  const modeRows = rows.filter(r => r.mode === mode);
  assert.equal(modeRows.length, expected[mode].length, `${mode}: 전체 전략의 분포 수`);
  modeRows.forEach((r, i) => assert.deepEqual(distribution(r.states, M.stars), expected[mode][i], `${mode}: ${r.name}`));
}
// 같은 혈당 경로에서는 조작 의도를 구분할 수 없다.
// 0.45초 반복은 54 미만 체류가 없어 별2로 남고 저항성 모드도 열린다. 한계를 그대로 고정한다.
const blind45 = rows.find(r => r.mode === 'normal' && r.name.startsWith('매초')).states;
assert(blind45.every(s => s.severe === 0 && M.stars(s) === 2), '0.45초 반복의 상한 미적용 반례 10개');
const alternate = rows.find(r => r.mode === 'normal' && r.name.startsWith('0.5초')).states;
assert(alternate.every(s => s.severe >= .1 && M.stars(s) === 1), '0.5초 교대 10개는 실제 별1: 저항성 모드를 열지 못함');
for (const mode of ['normal', 'resistance']) {
  for (const [ratio, stars] of [[0, 0], [.599, 0], [.6, 1], [.749, 1], [.75, 2], [.899, 2], [.9, 3], [1, 3]]) {
    for (const severe of [0, Number.EPSILON, 1 / 120, 1 / 60, .05, .099999]) {
      assert.equal(M.stars({ ...M.init(mode), tir: ratio * M.DAY, severe }), stars, `${mode}: 별 경계 ${ratio}, 짧은 체류 ${severe}`);
    }
    for (const severe of [.1 - 1e-12, .1, .100001, 4.8]) {
      assert.equal(M.stars({ ...M.init(mode), tir: ratio * M.DAY, severe }), Math.min(stars, 1), `${mode}: 별 상한 경계 ${ratio}, 체류 ${severe}`);
    }
  }
}
// 화면의 dt 상한 0.05초부터 120Hz까지: 기본 모드의 지연 0~0.5초를 0.05초 간격으로 재생한다.
let reactiveCases = 0;
for (const dt of [1 / 120, 1 / 60, 1 / 30, .05]) for (let i = 0; i <= 10; i++) {
  const s = run(reactive(i * .05), 'normal', dt);
  assert.equal(M.stars(s), 3, `반응 조절 별3 유지: dt=${dt}, 지연=${i * .05}`);
  assert.equal(s.severe, 0, '반응 조절은 상한의 유예 시간에 의존하지 않음');
  reactiveCases++;
}
// 54 자체는 포함하지 않고, 떨어져 있는 짧은 체류도 합산한다. 새 판에서는 초기화한다.
const edge = M.init(); edge.g = 54 - 12 / 32;
M.step(edge, false, 1 / 32);
assert.equal(edge.g, 54, '이진수로 정확히 표현되는 간격으로 경계에 도달');
assert.equal(edge.severe, 0, '혈당 54는 미만 체류에 포함하지 않음');
edge.g = 53; M.step(edge, false, 0);
assert.equal(edge.severe, 0, '길이 0인 프레임은 체류가 아님');
for (const dt of [1 / 120, 1 / 60, 1 / 30, .05]) {
  const s = M.init();
  for (let i = 0; i < Math.round(.1 / dt); i++) {
    s.g = 40; M.step(s, false, dt);
    s.g = 100; M.step(s, false, dt);
  }
  s.tir = .9 * M.DAY;
  assert.equal(M.stars(s), 1, `떨어진 체류의 누적 0.1초: dt=${dt}`);
}
assert.equal(M.init().severe, 0, '새 판은 체류 시간을 물려받지 않음');
for (const mode of ['normal', 'resistance']) {
  const inverse = rows.find(r => r.mode === mode && r.name.startsWith('개념과 반대')).states;
  assert(inverse.every(s => M.stars(s) === 0), '개념과 반대 조절은 별0');
}
for (const row of rows) for (const s of row.states) {
  assert(s.g >= 30 && s.g <= 350, '모델 혈당 범위');
  assert(Math.abs(s.tir + s.hypo + s.hyper - M.DAY) < 1e-6, '시간 집계 합계');
}
console.log(`PASS 혈당 전략 분포 22개·별 경계 160개·반응 조절 ${reactiveCases}개·누적 체류·반대 조절·두 모드 무작위 4000판 시간 집계`);

// D-064·D-065: 기존 출력을 남긴 뒤 새 계약을 검증한다.
// 아래부터의 모든 일정 난수와 정책 난수는 서로 독립된 고정 시드다.
const started = performance.now();
let newAssertions = 0;
function check(ok, message) { newAssertions++; assert(ok, message); }
function equal(actual, expectedValue, message) { newAssertions++; assert.deepEqual(actual, expectedValue, message); }
// 3차 계약: 정수 아닌 시드를 조용히 자르거나 식사량을 고정하면 실패한다.
for (const seed of [.5, NaN, -1, 2 ** 32, Infinity, undefined, '1']) {
  newAssertions++; assert.throws(() => M.makeSchedule('mixed', seed), RangeError, '시드는 부호 없는 32비트 정수만 허용');
}
check(M.makeSchedule('mixed', 123)[0].scale >= .7, '도전 식사에 하루 배율 포함');
check(Object.keys(M.init()).includes('events'), '일정은 열거되는 상태 필드');

// 연속 시간 누락·범위 이탈 뒤 누적·경계 제외·점수 내림 오차를 잡는다.
equal(M.init().inRangeRun, 0, '새 판의 현재 연속 유지 시간은 0');
equal(M.init().bestInRangeRun, 0, '새 판의 최장 연속 유지 시간은 0');
for (const mode of ['normal', 'resistance']) for (const dt of [1 / 120, DT, 1 / 30, .05]) {
  const s = M.init(mode);
  for (let i = 0; i < 10; i++) { s.g = 100; M.step(s, false, dt); }
  equal(s.inRangeRun, s.tir, '계속 범위 안이면 현재 연속 시간 = tir');
  equal(s.bestInRangeRun, s.tir, '계속 범위 안이면 최장 연속 시간 = tir');
  const best = s.bestInRangeRun;
  for (const outside of [50, 200]) {
    s.g = outside; M.step(s, false, dt);
    equal(s.inRangeRun, 0, '범위 밖이면 연속 시간 끊김');
    equal(s.bestInRangeRun, best, '범위 밖에서도 최장 시간 보존');
    s.g = 100; M.step(s, false, dt);
    equal(s.inRangeRun, dt, '다시 들어오면 새 연속 시간');
    equal(s.bestInRangeRun, best, '짧은 새 연속 시간은 최장을 덮지 않음');
  }
  for (const boundary of [70, 180]) {
    const edgeState = M.init(mode);
    edgeState.g = boundary - 12 * dt;
    M.step(edgeState, false, dt);
    equal(edgeState.g, boundary, '목표 범위 경계에 정확히 도달');
    equal(edgeState.inRangeRun, dt, '70과 180도 연속 시간에 포함');
  }
  const actual = run(reactive(.3), mode, dt);
  check(actual.bestInRangeRun <= actual.tir && actual.inRangeRun <= actual.bestInRangeRun, '실제 판의 현재 ≤ 최장 ≤ 누적 시간');
  const outsideOnly = M.init(mode);
  for (let i = 0; i < 10; i++) { outsideOnly.g = 200; M.step(outsideOnly, false, dt); }
  equal(M.scoreFields(outsideOnly), { playScore: 0, maxCombo: 0 }, '범위 밖에만 있던 판의 점수');
}
for (const [time, seconds] of [[44.9999999, 45], [44.99, 44], [0, 0]]) {
  equal(M.scoreFields(Object.freeze({ tir: time, bestInRangeRun: time })),
    { playScore: seconds, maxCombo: seconds }, '정수 초 내림과 부동소수점 합 오차 보정');
}
equal(M.scoreFields(Object.freeze({ tir: 30.9, bestInRangeRun: 12.9 })),
  { playScore: 30, maxCombo: 12 }, '점수와 최장 콤보는 각각 누적과 최장에서 계산');
for (const mode of ['normal', 'resistance']) for (const kind of ['fixed', 'shift', 'mixed']) {
  equal(M.condFor(mode, kind), `${mode}/${kind}`, '같은 조건을 구분하는 모드/시간표 형식');
}
// 도전의 표 순서나 id에 의존하지 않고 전달한 계약으로 판 기록을 만든다.
for (const challenge of M.CHALLENGES) {
  const events = M.makeSchedule(challenge.kind, 12345);
  const pass = Object.freeze({ tir: 40.5, severe: 0, bestInRangeRun: 30.9, events });
  const fail = Object.freeze({ tir: 45, severe: .1, bestInRangeRun: 30.9 });
  const won = Object.freeze({ stars: 3, eligible: true, cleared: false });
  const lost = Object.freeze({ stars: 2, eligible: true, cleared: false });
  const done = Object.freeze({ stars: 3, eligible: true, cleared: true });
  const prior = n => Array(n).fill(won);
  const finish = (state, plays) => {
    const before = JSON.stringify(plays), frozen = plays && Object.freeze(plays);
    const result = M.challengeFinish(state, challenge, 12345, frozen);
    equal(JSON.stringify(frozen), before, '동결한 이전 판 배열과 원소 불변');
    return result;
  };
  const first = { level: challenge.id, cond: `${challenge.mode}/${challenge.kind}`,
    stars: 3, playScore: 40, maxCombo: 30, cleared: false, eligible: true,
    detail: { kind: challenge.kind, seed: 12345, passed: true, streak: 1, mealScale: events.find(e => e.type === 'meal').scale } };
  equal(finish(pass), first, '이전 기록 없는 첫 판의 T12 필드');
  equal(finish(pass, []), first, '빈 기록의 첫 판');
  equal(finish(pass, null), first, 'null 기록의 첫 판');
  const saved = [];
  for (let i = 0; i < challenge.games * 2; i++) {
    saved.push(finish(pass, saved.slice()));
    equal(saved[i].cleared, (i + 1) % challenge.games === 0, '반환값만 이어 저장해도 묶음 완료와 새 경계 판정');
  }
  for (const count of [challenge.games - 2, challenge.games - 1]) {
    equal(finish(pass, prior(count)), { ...first, cleared: count + 1 >= challenge.games,
      detail: { ...first.detail, streak: count + 1 } }, '연속 통과 games-1·games 경계');
  }
  for (const boundary of [lost, done]) {
    equal(finish(pass, [...prior(challenge.games), boundary]), first, '실패·완료 판 뒤 새 묶음');
    equal(finish(pass, [...prior(challenge.games), boundary, won]),
      { ...first, detail: { ...first.detail, streak: 2 } }, '경계 뒤 성공만 새 묶음에 포함');
  }
  const practices = [Object.freeze({ stars: 0, cleared: false, eligible: false }),
    Object.freeze({ stars: 3, cleared: true, eligible: false })];
  equal(finish(pass, [won, practices[0], won, practices[1]]),
    { ...first, cleared: challenge.games <= 3, detail: { ...first.detail, streak: 3 } }, '연습의 실패·완료는 묶음을 늘리지도 끊지도 않음');
  equal(finish(pass, [Object.freeze({ stars: 3 }), won]),
    { ...first, cleared: challenge.games <= 3, detail: { ...first.detail, streak: 3 } }, 'eligible이 명시적으로 false인 판만 제외');
  equal(finish(fail, prior(challenge.games)), { ...first, stars: 1, playScore: 45,
    detail: { ...first.detail, passed: false, streak: 0, mealScale: 1 } }, '이번 판 실패면 묶음 초기화·완료 아님');
}
equal(typeof M.makeSchedule, 'function', '새 일정 생성기 makeSchedule이 있어야 함');
function rng(seed) {
  let v = seed >>> 0 || 1;
  return () => { v ^= v << 13; v >>>= 0; v ^= v >>> 17; v ^= v << 5; v >>>= 0; return v / 4294967296; };
}
// xorshift 출력 자체를 같은 xorshift 생성기의 시드로 쓰면 다음 판끼리 난수열이
// 한 칸씩 겹친다. 전단사 32비트 혼합으로 시드를 분산해 이 직렬 상관을 피한다.
function mixSeed(v) {
  v ^= v >>> 16; v = Math.imul(v, 0x85ebca6b);
  v ^= v >>> 13; v = Math.imul(v, 0xc2b2ae35);
  return (v ^ (v >>> 16)) >>> 0;
}
const cloneEvents = () => M.EVENTS.map(e => ({ ...e }));
equal(M.MEAL_DUR, 5, '기존 흡수 시간');
equal(M.MIN_MEAL_GAP, 5, '식사 최소 간격');
check(Object.isFrozen(M.EVENTS) && M.EVENTS.every(Object.isFrozen), '기본 일정과 이벤트 동결');
const fixedJSON = JSON.stringify(M.EVENTS);
check(!Reflect.set(M.EVENTS[0], 't', 9), '기본 이벤트 수정 금지');
check(!Reflect.set(M, 'EVENTS', []), '기본 일정 교체 금지');
const oldFields = ['t', 'g', 'ins', 'mode', 'tir', 'hypo', 'severe', 'hyper', 'peak', 'low', 'trace'];
const oldJSON = s => JSON.stringify(Object.fromEntries(oldFields.map(k => [k, s[k]])));
let sameFrames = 0;
for (const mode of ['normal', 'resistance']) for (const dt of [1 / 120, DT, 1 / 30, .05]) {
  for (const policy of [() => true, () => false, s => s.g > 120, (s, i) => i % 60 < 27]) {
    const states = [M.init(mode), M.init(mode, M.EVENTS), M.init(mode, cloneEvents()), M.init(mode)];
    delete states[3].events;
    check(states[0].events === M.EVENTS && states[1].events === M.EVENTS, '기본 일정 참조');
    for (let i = 0; i * dt < M.DAY - 1e-8; i++) {
      for (const s of states) M.step(s, policy(s, i), Math.min(dt, M.DAY - s.t));
      equal(states.map(oldJSON), Array(4).fill(oldJSON(states[0])), '기본·명시·깊은 사본·옛 상태의 매 프레임 동일성');
      sameFrames++;
    }
  }
}
console.log(JSON.stringify({ 검증: '기본 일정 매 프레임 동일성', 프레임: sameFrames }));

// 생성기와 독립적으로 후보 난수를 소비해 거절·상한 대체를 센다.
function scheduleReference(kind, seed) {
  const r = rng(mixSeed(seed)); let rejected = 0, inverted = 0;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const events = cloneEvents();
    for (const e of events) {
      e.t = Math.max(1, Math.min(40, kind === 'shift' ? e.t + Math.floor(r() * 9) - 4
        : e.type === 'meal' ? e.t + Math.floor(r() * 13) - 6 : 14 + Math.floor(r() * 17)));
    }
    const meals = events.filter(e => e.type === 'meal');
    if (meals.some((e, i) => i && e.t <= meals[i - 1].t)) inverted++;
    if (meals.some((e, i) => i && e.t - meals[i - 1].t < 5)) { rejected++; continue; }
    const k = Math.floor(r() * 61), scale = (70 + k) / 100;
    for (const e of meals) { e.amount *= scale; e.scale = scale; e.portion = k < 20 ? 'less' : k > 40 ? 'more' : 'normal'; }
    return { events: events.sort((a, b) => a.t - b.t), rejected, inverted, fallback: false };
  }
  const events = cloneEvents(), k = Math.floor(r() * 61), scale = (70 + k) / 100;
  for (const e of events) if (e.type === 'meal') { e.amount *= scale; e.scale = scale; e.portion = k < 20 ? 'less' : k > 40 ? 'more' : 'normal'; }
  return { events, rejected, inverted, fallback: true };
}
for (const kind of ['shift', 'mixed']) {
  const unique = new Set(), overlaps = [0, 0, 0, 0];
  let rejected = 0, inverted = 0, fallback = 0, firstAtOne = 0, sameStart = 0, rawInverted = 0, boundaryPortions = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const events = M.makeSchedule(kind, seed), ref = scheduleReference(kind, seed);
    equal(events, ref.events, `${kind}/${seed}: 거절 뒤 같은 난수열에서 다시 뽑음`);
    equal(events, M.makeSchedule(kind, seed), '같은 시드 재현');
    check(Object.isFrozen(events) && events.every(Object.isFrozen), '생성 일정과 이벤트 동결');
    equal(events.length, M.EVENTS.length, '이벤트 개수');
    rejected += ref.rejected; inverted += ref.inverted; fallback += Number(ref.fallback);
    unique.add(JSON.stringify(events)); firstAtOne += Number(events[0].t === 1);
    const meals = events.filter(e => e.type === 'meal'), exercise = events.find(e => e.type === 'exercise');
    equal(meals.map(e => e.name), M.EVENTS.filter(e => e.type === 'meal').map(e => e.name), '식사 이름 순서');
    check(meals.every((e, i) => !i || e.t - meals[i - 1].t >= 5), '식사 간격과 같은 시각 금지');
    check(events.every(e => Number.isInteger(e.t) && e.t >= 1 && e.t <= 40), '시작 시각 정수 범위');
    check(exercise.t >= (kind === 'shift' ? 20 : 14) && exercise.t <= (kind === 'shift' ? 28 : 30), '운동 범위');
    for (let i = 0; i < events.length; i++) {
      const e = events[i], original = M.EVENTS.find(x => x.name === e.name);
      if (e.type === 'meal') {
        // 배율은 (70 + k) / 100으로 정확히 만든 값이어야 한다(0.8999999999999999 같은 값 금지).
        check(e.scale >= .7 && e.scale <= 1.3 && e.scale === Math.round(e.scale * 100) / 100, '식사 배율 범위와 0.01 간격');
        equal(e.scale, meals[0].scale, '하루 모든 식사는 같은 배율');
        equal(e.amount, original.amount * e.scale, '원래 식사량에 하루 배율 적용');
        equal(e.portion, e.scale < .9 ? 'less' : e.scale > 1.1 ? 'more' : 'normal', '배율에 따른 양 구간');
        if (e.scale === .9 || e.scale === 1.1) { equal(e.portion, 'normal', '경계 배율 0.90·1.10은 보통'); boundaryPortions++; }
        const { scale, portion, ...rest } = e;
        equal({ ...rest, t: original.t, amount: original.amount }, original, '식사 시각·양 외 속성 불변');
      } else equal({ ...e, t: original.t }, original, '운동은 시각 외 속성 불변');
      check(i === 0 || events[i - 1].t <= e.t, '시작 시각 정렬');
      if (i && events[i - 1].t === e.t) check(M.EVENTS.indexOf(M.EVENTS.find(x => x.name === events[i - 1].name)) < M.EVENTS.indexOf(original), '동시 시작의 원래 순서');
    }
    meals.forEach((e, i) => { if (Math.max(e.t, exercise.t) < Math.min(e.t + M.MEAL_DUR, exercise.t + exercise.dur)) overlaps[i]++; });
    sameStart += Number(meals.some(e => e.t === exercise.t));
    // v2의 seed * 3571 + 71 전처리를 재현하되 제약 전 첫 후보만 센다.
    const r = rng(seed * 3571 + 71), raw = cloneEvents();
    for (const e of raw) e.t = Math.max(1, Math.min(40, kind === 'shift' ? e.t + Math.floor(r() * 9) - 4 : e.type === 'meal' ? e.t + Math.floor(r() * 13) - 6 : 14 + Math.floor(r() * 17)));
    const rawMeals = raw.filter(e => e.type === 'meal');
    rawInverted += Number(rawMeals[3].t <= rawMeals[2].t);
  }
  equal(fallback, 0, '시드 1~20000에서 상한 대체 0회');
  check(boundaryPortions > 0, '경계 배율 0.90·1.10 사례가 표본에 있음');
  console.log(JSON.stringify({ 검증: '생성기', kind, 시드수: 20000, 후보수: 20000 + rejected, 거절수: rejected,
    '거절률%': rejected / (20000 + rejected) * 100, 순서위반후보: inverted, 상한대체: fallback, 서로다른일정: unique.size,
    v2제약전야식역전: rawInverted, 'v2제약전야식역전%': rawInverted / 200,
    첫이벤트1초: firstAtOne, 운동과식사흡수겹침: overlaps, 운동과식사동시시작: sameStart }));
}
for (const seed of [0, 4294967295]) equal(M.makeSchedule('shift', seed), scheduleReference('shift', seed).events, '양끝 정수 시드 허용');
check(M.EVENTS.every(e => !('scale' in e) && !('portion' in e)), '기본 판에는 배율·양 필드를 넣지 않음');
newAssertions++; assert.throws(() => M.makeSchedule('unknown', 1), RangeError, '잘못된 종류는 조용히 다른 시간표가 되지 않음');
equal(JSON.stringify(M.EVENTS), fixedJSON, '생성 후에도 기본 일정 불변');
// 상한 도달은 별도 VM에서 상한만 0으로 바꿔 확인한다. 실제 모듈은 바꾸지 않는다.
const modelSource = require('node:fs').readFileSync(require.resolve(process.env.GLUCOSE_MODEL || '../games/glucose/model.js'), 'utf8');
check(modelSource.includes('const SCHEDULE_ATTEMPTS = 1000;'), '실제 거절 시도 상한 확인');
const fallbackContext = { module: { exports: {} } };
require('node:vm').runInNewContext(modelSource.replace('const SCHEDULE_ATTEMPTS = 1000;', 'const SCHEDULE_ATTEMPTS = 0;'), fallbackContext);
for (const kind of ['shift', 'mixed']) {
  const fallback = fallbackContext.module.exports.makeSchedule(kind, 37);
  equal(fallback.map(e => e.t).join(), M.EVENTS.map(e => e.t).join(), '상한에 도달하면 기본 시각으로 대체');
  const scale = (70 + Math.floor(rng(mixSeed(37))() * 61)) / 100;
  check(fallback.filter(e => e.type === 'meal').every(e => e.scale === scale && e.amount === M.EVENTS.find(x => x.name === e.name).amount * scale), '대체 일정에도 같은 난수열의 하루 배율 적용');
  check(fallback !== fallbackContext.module.exports.EVENTS && Object.isFrozen(fallback) && fallback.every(Object.isFrozen), '대체 일정도 별도 동결 사본');
}
const shifted = cloneEvents(); shifted[0].t = 1; shifted[2].t = 14;
check(M.mealRate(3, shifted) !== M.mealRate(3), '식사율에 전달 일정 사용');
equal(M.exerciseRate(15, shifted), 10, '운동율에 전달 일정 사용');
equal(M.exerciseRate(15), 0, '운동율 기본 일정');
const fixedState = M.init(), shiftedState = M.init('normal', shifted);
for (let i = 0; i < 300; i++) { M.step(fixedState, false, DT); M.step(shiftedState, false, DT); }
check(fixedState.g !== shiftedState.g, '전달 일정에 따라 실제 혈당 경로 변화');
const copiedState = { ...shiftedState };
check(copiedState.events === shifted, '객체 펼치기에 일정 보존');
for (let i = 0; i < 300; i++) {
  M.step(shiftedState, i % 60 < 29, DT); M.step(copiedState, i % 60 < 29, DT);
  equal(copiedState, shiftedState, '펼친 사본도 매 프레임 같은 일정으로 진행');
}
for (const challenge of M.CHALLENGES) {
  for (const tir of [.899999, .9, 1]) for (const severe of [0, .099999, .1 - 1e-12, .1]) {
    const s = { tir: tir * M.DAY, severe };
    equal(M.challengeGamePassed(s), M.stars(s) === 3, '별3과 도전 판정 일치');
  }
}

// 가능한 원시 시각 조합을 모두 세어, 거절 표집의 정확한 조건부 분포를 구한다.
// clamp로 같은 시각이 되는 후보도 원시 추첨 수만큼 센다. 운동은 식사 거절 조건과 독립이다.
for (const kind of ['shift', 'mixed']) {
  const width = kind === 'shift' ? 9 : 13, offset = (width - 1) / 2;
  let valid = 0, breakfastOne = 0;
  const meals = M.EVENTS.filter(e => e.type === 'meal');
  for (let a = 0; a < width; a++) for (let b = 0; b < width; b++)
    for (let c = 0; c < width; c++) for (let d = 0; d < width; d++) {
      const times = [a, b, c, d].map((x, i) => Math.max(1, Math.min(40, meals[i].t + x - offset)));
      if (times.slice(1).some((t, i) => t - times[i] < 5)) continue;
      valid++; breakfastOne += Number(times[0] === 1);
    }
  const probability = breakfastOne / valid, variance = (61 * 61 - 1) / 12 / 10000;
  const sampleRng = rng(0x6a09e667);
  for (const [label, seeds] of [
    ['연속 1~1000', Array.from({ length: 1000 }, (_, i) => i + 1)],
    ['연속 1~20000', Array.from({ length: 20000 }, (_, i) => i + 1)],
    ['무작위 20000', Array.from({ length: 20000 }, () => Math.floor(sampleRng() * 2 ** 32))],
  ]) {
    let atOne = 0, sum = 0;
    const histogram = Array(61).fill(0), portions = { less: 0, normal: 0, more: 0 };
    for (const seed of seeds) {
      const meal = M.makeSchedule(kind, seed).find(e => e.name === '아침 식사');
      atOne += Number(meal.t === 1); sum += meal.scale;
      histogram[Math.round(meal.scale * 100) - 70]++; portions[meal.portion]++;
    }
    const n = seeds.length;
    // 여러 표본군·61개 칸을 함께 보므로 회귀 검사는 5 표준오차를 사용한다.
    check(Math.abs(atOne / n - probability) <= 5 * Math.sqrt(probability * (1 - probability) / n), '아침 1초 비율이 정확한 조건부 분포의 표본 오차 안');
    check(Math.abs(sum / n - 1) <= 5 * Math.sqrt(variance / n), '배율 평균이 균등 분포의 표본 오차 안');
    check(histogram.every(count => Math.abs(count - n / 61) <= 5 * Math.sqrt(n / 61 * 60 / 61)), '61개 배율의 균등 분포');
    console.log(JSON.stringify({ 검증: '생성 분포', kind, 표본: label, 정확한아침1초비율: probability,
      관측아침1초비율: atOne / n, 배율평균: sum / n, 양구간: portions, 배율61칸: histogram,
      정확한거절률: 1 - valid / width ** 4 }));
  }
}

// 선정·held-out을 먼저 고정한다. 수용 정책 격자는 결과와 무관하게 전부 검사한다.
const acceptance = process.argv.includes('--acceptance');
// 기본 검사도 정책마다 6,000판을 쓴다. 1,500~2,400판으로 줄이면 p≈0.34인 정책의
// 표본 변동·Wilson 상한 확대만으로 5%를 넘을 수 있다. 6,000판에서 p=0.34의 상한은 약 0.352다.
// 30초 제한을 위해 기본 검사는 대표 정책·선정 시드군만, 수용 검사는 전체 격자·두 시드군을 돈다.
const playCount = 6000;
let policies = [];
for (const period of [.5, .75, 1, 1.25, 1.5, 2, 2.5, 3]) for (let duty = 40; duty <= 60; duty++) policies.push({ name: `맹목 P${period} d${duty / 100}`, type: 'blind', period, duty: duty / 100, restricted: true });
policies.push({ name: '흔들림 리듬', type: 'jitter', restricted: true });
policies.push({ name: '무작위', type: 'random', restricted: true });
for (const delay of [0, .3, .5, 1, 1.5, 2]) policies.push({ name: `반응 ${delay}초`, type: 'reactive', delay });
for (const lead of [0, .5, 1, 1.5, 2]) for (const duration of [3, 4, 5, 6, 7]) policies.push({ name: `띠만 L${lead} H${duration}`, type: 'band', lead, duration });
for (const delay of [0, .3, .5]) policies.push({ name: `띠+혈당 ${delay}초`, type: 'predict', delay });
for (const threshold of [100, 140]) policies.push({ name: `반대 ${threshold}`, type: 'inverse', threshold });
// 일정의 외력은 혈당·정책과 무관하다. 한 번 계산해 모든 정책에서 재사용한다.
// 계산식을 복사하지 않고 실제 step 본문의 두 외력 호출만 조회로 바꾼다.
// 각 시드군·도전·정책의 첫 판은 원본 step과 매 프레임 JSON으로 대조한다.
const stepSource = M.step.toString();
check(stepSource.includes('mealRate(s.t, events)') && stepSource.includes('exerciseRate(s.t, events)'), '외력 조회 최적화의 원본 호출 확인');
const cachedStep = new Function('EVENTS', `return ${stepSource.replace('step(s, hold, dt)', 'step(s, hold, dt, rates, index)')
  .replace('mealRate(s.t, events)', 'rates.meal[index]').replace('exerciseRate(s.t, events)', 'rates.exercise[index]')}`)(M.EVENTS);
function ratesFor(events) {
  const meal = new Float64Array(2700), exercise = new Float64Array(2700);
  const soon = new Uint8Array(2700), active = new Uint8Array(2700), times = new Float64Array(2700);
  let t = 0;
  for (let i = 0; i < 2700; i++) {
    meal[i] = M.mealRate(t, events); exercise[i] = M.exerciseRate(t, events);
    times[i] = t;
    soon[i] = Number(events.some(e => e.type === 'meal' && t >= e.t - 1 && t < e.t));
    active[i] = Number(events.some(e => e.type === 'exercise' && t >= e.t && t < e.t + e.dur));
    t += Math.min(DT, M.DAY - t);
  }
  const bands = new Map();
  const lowerBound = t => {
    let lo = 0, hi = times.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  for (const p of policies.filter(p => p.type === 'band')) {
    const tape = new Uint8Array(2700);
    for (const e of events) if (e.type === 'meal') tape.fill(1, lowerBound(e.t - p.lead), lowerBound(e.t - p.lead + p.duration));
    for (const e of events) if (e.type === 'exercise') tape.fill(0, lowerBound(e.t), lowerBound(e.t + e.dur));
    bands.set(p.name, tape);
  }
  return { meal, exercise, soon, active, bands };
}
function play(events, policy, seed, tape, rates, verify = false, frames) {
  const s = M.init('normal', events), r = rng(seed);
  const history = ['reactive', 'predict'].includes(policy.type) ? new Float64Array(2700) : null;
  const bandTape = rates?.bands.get(policy.name);
  const direct = verify ? M.init('normal', events) : null;
  const period = policy.type === 'jitter' ? .4 + r() * .4 : policy.period;
  const duty = policy.type === 'jitter' ? .42 + r() * .12 : policy.duty;
  const phase = r() * (period || 1), probability = .3 + r() * .4;
  const lag = Math.round((policy.delay || 0) / DT);
  let hold = false, until = 0;
  for (let i = 0; i < 2700; i++) {
    if (history) history[i] = s.g;
    switch (policy.type) {
      case 'blind': case 'jitter': hold = (s.t + phase) % period < period * duty; break;
      case 'random': if (s.t >= until) { hold = r() < probability; until = s.t + .2 + r() * .8; } break;
      case 'replay': hold = policy.tape[i]; break;
      case 'inverse': hold = s.g < policy.threshold; break;
      case 'reactive': hold = history[Math.max(0, i - lag)] > 120; break;
      case 'band':
        if (bandTape && !verify) hold = !!bandTape[i];
        else {
          hold = events.some(e => e.type === 'meal' && s.t >= e.t - policy.lead && s.t < e.t - policy.lead + policy.duration);
          if (events.some(e => e.type === 'exercise' && s.t >= e.t && s.t < e.t + e.dur)) hold = false;
          if (bandTape) equal(hold, !!bandTape[i], '띠만 정책의 캐시와 원래 판단 일치');
        }
        break;
      case 'predict': {
        const glucose = history[Math.max(0, i - lag)];
        const soon = rates && !verify ? !!rates.soon[i] : events.some(e => e.type === 'meal' && s.t >= e.t - 1 && s.t < e.t);
        const active = rates && !verify ? !!rates.active[i] : events.some(e => e.type === 'exercise' && s.t >= e.t && s.t < e.t + e.dur);
        if (rates && verify) { equal(soon, !!rates.soon[i], '예측 정책의 식사 예고 일치'); equal(active, !!rates.active[i], '예측 정책의 운동 띠 일치'); }
        hold = glucose > 120 || soon;
        if (glucose < 140 && active) hold = false;
        break;
      }
    }
    if (tape) tape.push(hold);
    const dt = Math.min(DT, M.DAY - s.t);
    if (rates) cachedStep(s, hold, dt, rates, i); else M.step(s, hold, dt);
    if (frames) frames.push(JSON.stringify(s));
    if (direct) {
      M.step(direct, hold, dt);
      equal(JSON.stringify(s), JSON.stringify(direct), '외력 캐시와 실제 step의 매 프레임 바이트 동일성');
    }
  }
  return { stars: M.stars(s), tir: s.tir / M.DAY * 100, state: s };
}
for (const source of policies.filter(p => (p.type === 'reactive' && p.delay <= .5) || p.type === 'predict')) {
  const tape = []; play(M.EVENTS, source, 17, tape);
  policies.push({ name: `고정 재생 ${source.name}`, type: 'replay', tape, restricted: true });
}
// 추가 지연은 보고만 한다. 재생 원본은 반응·띠+혈당의 지연 0·0.3·0.5초, 총 6개로 고정한다.
for (const delay of [1, 1.5]) policies.push({ name: `띠+혈당 ${delay}초`, type: 'predict', delay });
policies.forEach((policy, index) => { policy.seedIndex = index; });
if (!acceptance) policies = policies.filter(p => {
  // 선정 격자의 최악 후보 P1.5 d0.46와 P1 d0.45 주변, D-054의 P1 d0.45를 포함한다.
  if (p.type === 'blind') return (p.period === 1 && [.45, .46, .47, .48, .49].includes(p.duty)) ||
    (p.period === 1.5 && [.45, .46, .47].includes(p.duty));
  if (p.type === 'reactive') return p.delay <= 1;
  if (p.type === 'predict') return [.5, 1].includes(p.delay);
  if (p.type === 'band') return false;
  return true;
});
// 기본 검사를 30초 안에 끝내기 위해 정책별 루프와 실제 step 본문을 결합한다.
// 수식·연산 순서는 원본에서 그대로 가져오고 상태 필드만 지역 변수로 바꾼다.
// 모든 정책의 각 시드군·도전 첫 판에서 원래 play/step과 매 프레임 JSON을 대조한다.
const stateFields = [...oldFields.filter(k => k !== 'trace' && k !== 'mode'), 'inRangeRun', 'bestInRangeRun'];
let scalarStep = stepSource.slice(stepSource.indexOf('{') + 1, stepSource.lastIndexOf('}'))
  .replace('const events = s.events || EVENTS;', '')
  .replace('mealRate(s.t, events)', 'rates.meal[i]').replace('exerciseRate(s.t, events)', 'rates.exercise[i]')
  .replace('s.mode', '"normal"').replace('return s;', '');
for (const key of stateFields) scalarStep = scalarStep.replace(new RegExp(`s\\.${key}\\b`, 'g'), key);
const actions = {
  blind: 'hold = (t + phase) % period < period * duty;',
  jitter: 'hold = (t + phase) % period < period * duty;',
  random: 'if (t >= until) { hold = r() < probability; until = t + .2 + r() * .8; }',
  replay: 'hold = policy.tape[i];',
  inverse: 'hold = g < policy.threshold;',
  reactive: 'history[i] = g; hold = history[Math.max(0, i - lag)] > 120;',
  band: 'hold = !!rates.bands.get(policy.name)[i];',
  predict: 'history[i] = g; const glucose = history[Math.max(0, i - lag)]; hold = glucose > 120 || !!rates.soon[i]; if (glucose < 140 && rates.active[i]) hold = false;',
};
function makePlayer(policy, verify) {
  const snapshot = `({ ...initial, ${stateFields.join(', ')} })`;
  return new Function('M', 'rng', 'policy', 'equal', `return function(events, seed, rates, frames) {
    const initial = M.init('normal', events), r = rng(seed);
    let { ${stateFields.join(', ')} } = initial;
    const period = policy.type === 'jitter' ? .4 + r() * .4 : policy.period;
    const duty = policy.type === 'jitter' ? .42 + r() * .12 : policy.duty;
    const phase = r() * (period || 1), probability = .3 + r() * .4;
    const lag = Math.round((policy.delay || 0) * 60);
    const history = new Float64Array(2700);
    let hold = false, until = 0;
    for (let i = 0; i < 2700; i++) {
      ${actions[policy.type]}
      const dt = Math.min(1 / 60, M.DAY - t);
      ${scalarStep}
      ${verify ? `equal(JSON.stringify(${snapshot}), frames[i], '정책별 지역 변수 루프와 원래 play/step 매 프레임 동일성');` : ''}
    }
    return M.stars(${snapshot});
  }`)(M, rng, policy, equal);
}
const players = policies.map(policy => makePlayer(policy, false));
const verifiedPlayers = policies.map(policy => makePlayer(policy, true));

console.log(JSON.stringify({ 검증: '정책 조건', 정책수: policies.length, 제한대상정책수: policies.filter(p => p.restricted).length,
  독립판수: playCount, dt: DT, 모드: 'normal', 일정시드: ['0x51a7c093', '0x9e3779b9'], 정책시드: ['0x13579bdf', '0x2468ace0'],
  시드분리: '일정·정책별 서로 다른 고정 난수열; 선정·held-out 일정 시드 중복 단언',
  통계: '한 판 별3 비율 p, 정책별 Wilson 95% 상한 p_u의 n제곱 ≤ 5%; 직접 집계는 중첩 없는 n판 묶음; 무제한 재도전 누적 확률 아님' }));
function wilson(passed, total) {
  const z = 1.96, p = passed / total;
  return (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / (1 + z * z / total);
}
const round = v => +v.toFixed(6);
const selected = {}, scheduleSeeds = {};
const phases = ['선정', 'held-out'];
// 실행 전에 두 시드군의 교집합을 검사한다. 같은 시드군은 두 시간표 종류에 공통 사용한다.
for (const phase of phases) {
  const r = rng(phase === '선정' ? 0x51a7c093 : 0x9e3779b9);
  const seeds = Array.from({ length: playCount }, () => mixSeed(Math.floor(r() * 2 ** 32)));
  equal(new Set(seeds).size, playCount, '독립 판 사이 일정 시드 재사용 없음');
  scheduleSeeds[phase] = seeds;
}
const selectedSeeds = new Set(scheduleSeeds['선정']);
check(scheduleSeeds['held-out'].every(seed => !selectedSeeds.has(seed)), '선정·held-out 일정 시드 교집합 없음');
for (const phase of (acceptance ? phases : ['선정'])) for (const challenge of M.CHALLENGES) {
  const policyRngs = policies.map(policy => rng((phase === '선정' ? 0x13579bdf : 0x2468ace0) ^ Math.imul(policy.seedIndex + 1, 2654435761)));
  const results = policies.map(policy => ({ policy, passed: 0, stars: [0, 0, 0, 0], wins: new Uint8Array(playCount), bins: Array.from({ length: 6 }, () => ({ passed: 0, total: 0 })) }));
  for (let n = 0; n < playCount; n++) {
    const seed = scheduleSeeds[phase][n], events = M.makeSchedule(challenge.kind, seed), rates = ratesFor(events);
    const scale = events.find(e => e.type === 'meal').scale;
    const bin = Math.min(5, Math.floor((Math.round(scale * 100) - 70) / 10));
    policies.forEach((policy, p) => {
      const result = results[p];
      const policySeed = mixSeed(Math.floor(policyRngs[p]() * 2 ** 32));
      if (n === 0) {
        const frames = [];
        play(events, policy, policySeed, null, rates, true, frames);
        verifiedPlayers[p](events, policySeed, rates, frames);
      }
      const stars = players[p](events, policySeed, rates);
      const passed = Number(stars === 3);
      result.passed += passed; result.wins[n] = passed; result.stars[stars]++;
      result.bins[bin].passed += passed; result.bins[bin].total++;
    });
  }
  for (const result of results) {
    const { policy, passed, wins } = result, games = challenge.games;
    const p = passed / playCount, upper = wilson(passed, playCount), bundles = Math.floor(playCount / games);
    let direct = 0;
    for (let b = 0; b < bundles; b++) {
      let good = true;
      for (let g = 0; g < games; g++) good = good && wins[b * games + g] === 1;
      direct += Number(good);
    }
    Object.assign(result, { p, upper, bundle: p ** games, upperBundle: upper ** games, direct: direct / bundles });
    const row = { 검증: phase, 도전: challenge.id, kind: challenge.kind, 정책: policy.name, 판수: games,
      별3판수: passed, 독립판수: playCount, p: round(p), p_u: round(upper), 'p^n': round(result.bundle), 'p_u^n': round(result.upperBundle),
      직접통과묶음: direct, 직접묶음수: bundles, 직접묶음통과율: round(result.direct), '별0·1·2·3': result.stars };
    result.row = row; console.log(JSON.stringify(row));
    if (policy.restricted) check(result.upperBundle <= .05, `${phase} 도전 ${challenge.id} ${policy.name}: p_u^${games} ≤ 5%`);
    if (policy.type === 'inverse') equal(passed, 0, '개념과 반대 조절의 한 판·묶음 통과 0');
    // 같은 표본에서 추정한 p^n과 직접 묶음은 상관된다. 두 추정 오차를 더한 보수적 5σ 허용 폭이다.
    // 표본 오차 검사는 문턱 판정을 대체하지 않는다.
    if ((policy.type === 'blind' && policy.period === 1 && policy.duty === .47) ||
        ['jitter', 'random'].includes(policy.type) || (policy.type === 'reactive' && policy.delay === .3)) {
      const tolerance = 5 * (Math.sqrt(result.bundle * (1 - result.bundle) / bundles) +
        games * p ** (games - 1) * Math.sqrt(p * (1 - p) / playCount)) + 1 / bundles;
      check(Math.abs(result.direct - result.bundle) <= tolerance, '직접 묶음 통과율과 독립 판 p^n이 표본 오차 안');
      console.log(JSON.stringify({ 검증: '직접 묶음 대조', phase, 도전: challenge.id, 정책: policy.name,
        차이: result.direct - result.bundle, 허용오차: tolerance }));
    }
    if ((policy.type === 'reactive' && [.3, .5].includes(policy.delay)) || (policy.type === 'predict' && [.5, 1].includes(policy.delay))) {
      console.log(JSON.stringify({ 검증: '배율별 하루 운', phase, 도전: challenge.id, 정책: policy.name,
        구간: result.bins.map((b, i) => ({ 배율: `${(70 + i * 10) / 100}~${(i === 5 ? 130 : 79 + i * 10) / 100}`,
          ...b, 별3비율: round(b.passed / b.total) })) }));
    }
  }
  const restricted = results.filter(x => x.policy.restricted).sort((a, b) => b.upper - a.upper);
  const worst = restricted[0];
  let smallest = 3;
  while (worst.upper ** smallest > .05) smallest++;
  const bestBand = results.filter(x => x.policy.type === 'band').sort((a, b) => b.p - a.p)[0];
  const worstOf = type => restricted.filter(x => x.policy.type === type).sort((a, b) => b.p - a.p)[0].row;
  console.log(JSON.stringify({ 검증: `${phase} 요약`, 도전: challenge.id, 선택판수: challenge.games, 최소통과판수: smallest,
    제한대상최악: worst.row, 흔들림: worstOf('jitter'), 무작위: worstOf('random'), 재생최악: worstOf('replay'),
    띠만최선: bestBand?.row ?? '기본 검사 제외', 한판적을때최악상한: round(worst.upper ** (challenge.games - 1)) }));
  if (acceptance && phase === '선정') {
    if (challenge.id === 2) equal(challenge.games, smallest, '도전 2는 선정 검사에서 기준을 만족하는 가장 작은 3판 이상');
    selected[challenge.id] = challenge.games;
  }
  if (acceptance && phase === 'held-out') equal(challenge.games, selected[challenge.id], 'held-out으로 판 수를 다시 고르지 않음');
}
// 3차 수정: 포기 기록 누락·별3 상태에서의 포기 통과·포기 뒤 연속 합산을 잡는다.
for (const challenge of M.CHALLENGES) {
  const seed = 12345;
  const events = Object.freeze([Object.freeze({ t: 4, type: 'meal', name: '아침 식사', scale: 1.2, portion: 'more', amount: 84 })]);
  const partial = Object.freeze({ ...M.init(challenge.mode, events), t: 12.9, tir: 10.9, bestInRangeRun: 4.9 });
  const pass = Object.freeze({ ...partial, t: 45, tir: 40.5, bestInRangeRun: 30.9 });
  const expected = { level: challenge.id, cond: `${challenge.mode}/${challenge.kind}`,
    stars: 0, playScore: 10, maxCombo: 4, cleared: false, eligible: true,
    detail: { kind: challenge.kind, seed, passed: false, streak: 0, mealScale: 1.2, abandoned: true } };
  equal(M.challengeFinish(partial, challenge, seed, [], { abandoned: true }), expected,
    '포기한 판은 실패로 기록하고 현재 점수·식사 배율을 보존');
  const won = Object.freeze(M.challengeFinish(pass, challenge, seed, []));
  equal(M.challengeFinish(pass, challenge, seed, Object.freeze([won, won]), { abandoned: true }),
    { ...expected, playScore: 40, maxCombo: 30 }, '별3을 받을 상태라도 포기하면 통과·묶음 완료 아님');
  const saved = [];
  for (const [abandoned, streak, cleared] of [
    [false, 1, false], [false, 2, false], [true, 0, false],
    [false, 1, false], [false, 2, false], [false, 3, true],
  ]) {
    const result = M.challengeFinish(pass, challenge, seed, Object.freeze(saved.slice()), { abandoned });
    saved.push(Object.freeze(result));
    equal([result.detail.streak, result.cleared], [streak, cleared],
      '통과·통과·포기 뒤에는 새로 세 판 연속 통과해야 묶음 완료');
  }
}
console.log(`PASS 기존 단언 유지·새 단언 ${newAssertions}개·${acceptance ? '수용' : '기본'} ${playCount}독립판/정책/도전/시드군·추가 검사 ${(performance.now() - started) / 1000}초`);
