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
