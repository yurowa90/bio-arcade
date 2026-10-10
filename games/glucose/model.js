/* 혈당 지키기 — 혈당 모델(순수 함수)
 * 누르고 있으면 이자가 인슐린을, 떼면 글루카곤을 분비한다고 본다(호르몬 농도는 서서히 따라 움직임).
 * 혈당 변화(초당) = 글루카곤에 의한 간의 포도당 방출 − 인슐린에 의한 세포의 포도당 흡수 + 식사 흡수 − 운동 사용
 * 게임용 단순 모델이다. 실제 혈당 조절이나 당뇨병 치료를 흉내 내는 것이 아니다.
 */
(function (root) {
  const DAY = 45; // 45초 = 하루(06시~24시)
  // D-054 Q1: 54 미만을 누적 0.1초 이상 겪으면 별은 최대 1개다.
  // 한 프레임(화면에서 최대 0.05초)의 수치 흔들림은 제외하되, 짧은 반복 진입은 합산한다.
  const SEVERE_LIMIT = 0.1;
  const freezeEvents = events => Object.freeze(events.map(e => Object.freeze(e)));
  const EVENTS = freezeEvents([
    { t: 4, type: 'meal', name: '아침 식사', amount: 70 },
    { t: 16, type: 'meal', name: '점심 식사', amount: 95 },
    { t: 24, type: 'exercise', name: '체육 시간', dur: 5, rate: 10 },
    { t: 33, type: 'meal', name: '저녁 식사', amount: 105 },
    { t: 40, type: 'meal', name: '야식', amount: 45 },
  ]);
  const MEAL_DUR = 5;
  const MIN_MEAL_GAP = MEAL_DUR;
  const SCHEDULE_ATTEMPTS = 1000;
  // 도전과 시간표 종류의 대응은 이 표에서만 정한다. 두 도전 모두 기본 모델을 쓴다.
  // 도전 1(겹침형)은 도전 2를 여는 문턱이고, 도전 2(이동형)는 완료 기록이다(D-065, 총괄 결정).
  // 검사한 정책군: 주기 0.5·0.75·1·1.25·1.5·2·2.5·3초 × 누름 비율 0.40~0.60(0.01 간격),
  // 흔들림 리듬(판마다 주기 U(0.4,0.8)·비율 U(0.42,0.54)), 무작위, 고정 수열 재생 6개.
  // 독립 판의 별3 비율 Wilson 95% 상한을 p_u라 할 때
  // 선정·held-out 각각 p_u^판수 ≤ 5%를 검사한다(tests/glucose-logic.js --acceptance).
  // 도전 1은 교사 결정의 3판, 도전 2는 선정 검사에서 이 기준을 만족하는 최소 3판 이상이다.
  // 반응 조절에는 이동형이 더 어려워 이동형을 도전 2로 둔다.
  const CHALLENGES = Object.freeze([
    Object.freeze({ id: 1, kind: 'mixed', games: 3, mode: 'normal' }),
    Object.freeze({ id: 2, kind: 'shift', games: 3, mode: 'normal' }),
  ]);
  function random(seed) {
    let v = seed >>> 0 || 1;
    return () => { v ^= v << 13; v >>>= 0; v ^= v >>> 17; v ^= v << 5; v >>>= 0; return v / 4294967296; };
  }
  function makeSchedule(kind, seed) {
    if (kind !== 'shift' && kind !== 'mixed') throw new RangeError('알 수 없는 시간표 종류');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('시드는 부호 없는 32비트 정수여야 함');
    // fmix32의 전단사 혼합으로 연속 작은 시드의 첫 난수가 한쪽에 몰리지 않게 한다.
    seed ^= seed >>> 16; seed = Math.imul(seed, 0x85ebca6b);
    seed ^= seed >>> 13; seed = Math.imul(seed, 0xc2b2ae35);
    seed = (seed ^ (seed >>> 16)) >>> 0;
    const r = random(seed);
    const withPortions = events => {
      // 정수 칸 k(0~60)로 정한다. 0.70 + k / 100은 0.8999999999999999처럼 경계가 어긋난다.
      const k = Math.floor(r() * 61), scale = (70 + k) / 100;
      const portion = k < 20 ? 'less' : k > 40 ? 'more' : 'normal'; // 0.90·1.10은 보통

      for (const e of events) if (e.type === 'meal') { e.amount *= scale; e.scale = scale; e.portion = portion; }
      return freezeEvents(events);
    };
    for (let attempt = 0; attempt < SCHEDULE_ATTEMPTS; attempt++) {
      const events = EVENTS.map(e => {
        const t = kind === 'shift' ? e.t + Math.floor(r() * 9) - 4
          : e.type === 'meal' ? e.t + Math.floor(r() * 13) - 6 : 14 + Math.floor(r() * 17);
        return { ...e, t: Math.max(1, Math.min(40, t)) };
      });
      const meals = events.filter(e => e.type === 'meal');
      if (meals.some((e, i) => i > 0 && e.t - meals[i - 1].t < MIN_MEAL_GAP)) continue;
      // 안정 정렬로 같은 시각의 이벤트는 원래 EVENTS 순서를 지킨다.
      return withPortions(events.sort((a, b) => a.t - b.t));
    }
    return withPortions(EVENTS.map(e => ({ ...e })));
  }
  function init(mode, events = EVENTS) {
    const s = { t: 0, g: 95, ins: 0, mode: mode || 'normal', tir: 0, hypo: 0, severe: 0, hyper: 0, peak: 95, low: 95, trace: [] };
    // 옛 필드와 연속 유지 시간 뒤에 보통 속성으로 일정을 둔다. 펼치기·저장에도 보존된다.
    s.inRangeRun = 0; s.bestInRangeRun = 0;
    s.events = events;
    return s;
  }
  function mealRate(t, events = EVENTS) {
    let r = 0;
    for (const e of events) if (e.type === 'meal' && t >= e.t && t < e.t + MEAL_DUR) {
      const u = (t - e.t) / MEAL_DUR; r += e.amount * 2 / MEAL_DUR * (u < 0.5 ? u * 2 : 2 - u * 2); // 삼각형 흡수 곡선(넓이 = amount)
    }
    return r;
  }
  function exerciseRate(t, events = EVENTS) {
    let r = 0;
    // 동결 배열의 filter 사본을 매 프레임 만들지 않는다. 기존 reduce와 같은 순서로 더한다.
    for (const e of events) if (e.type === 'exercise' && t >= e.t && t < e.t + e.dur) r += e.rate;
    return r;
  }
  function step(s, hold, dt) {
    const target = hold ? 1 : 0;
    s.ins += (target - s.ins) * Math.min(1, dt / 1.6);            // 호르몬 농도는 1.6초 정도 늦게 따라온다
    const sens = s.mode === 'resistance' ? 0.45 : 1;              // 인슐린 저항성: 세포가 인슐린에 덜 반응
    const glucagon = 1 - s.ins;
    const events = s.events || EVENTS;
    const dg = 12 * glucagon - 24 * s.ins * sens + mealRate(s.t, events) - exerciseRate(s.t, events);
    s.g = Math.max(30, Math.min(350, s.g + dg * dt));
    s.t += dt;
    if (s.g >= 70 && s.g <= 180) s.tir += dt;
    if (s.g < 70) s.hypo += dt;
    if (s.g < 54) s.severe += dt;
    if (s.g > 180) s.hyper += dt;
    s.peak = Math.max(s.peak, s.g); s.low = Math.min(s.low, s.g);
    // tir과 같은 프레임·경계 조건으로 세며, 기존 상태의 계산 순서는 바꾸지 않는다.
    s.inRangeRun = s.g >= 70 && s.g <= 180 ? s.inRangeRun + dt : 0;
    s.bestInRangeRun = Math.max(s.bestInRangeRun, s.inRangeRun);
    return s;
  }
  // 1/60초 등을 더할 때 생기는 부동소수점 오차만 허용한다. 저장용 반올림 값은 쓰지 않는다.
  function severeCapped(s) { return s.severe >= SEVERE_LIMIT - 1e-9; }
  function stars(s) {
    const p = s.tir / DAY, earned = p >= 0.9 ? 3 : p >= 0.75 ? 2 : p >= 0.6 ? 1 : 0;
    return severeCapped(s) ? Math.min(earned, 1) : earned;
  }
  function challengeGamePassed(s) { return stars(s) === 3; }
  function condFor(mode, kind) { return `${mode}/${kind}`; }
  function scoreFields(s) {
    // 1/60초 누적이 44.9999999처럼 정수 바로 아래로 남는 합 오차만 보정한 뒤 내린다.
    return { playScore: Math.floor(s.tir + 1e-6), maxCombo: Math.floor(s.bestInRangeRun + 1e-6) };
  }
  function challengeFinish(s, challenge, seed, priorPlays = [], { abandoned = false } = {}) {
    priorPlays = priorPlays ?? [];
    const passed = !abandoned && challengeGamePassed(s);
    let streak = 0;
    if (passed) {
      streak = 1;
      // 호출자가 같은 level·cond의 판을 시간 순으로 전달한다. 완료 판은 새 묶음의 경계다.
      for (let i = priorPlays.length - 1; i >= 0; i--) {
        const play = priorPlays[i];
        if (play.eligible === false) continue;
        if (play.stars !== 3 || play.cleared === true) break;
        streak++;
      }
    }
    // 도전은 매 판 새 무작위 시드를 쓴다. 같은 시드 다시 하기가 생기면 그 판은 false로 둔다.
    return { level: challenge.id, cond: condFor(challenge.mode, challenge.kind), stars: abandoned ? 0 : stars(s), ...scoreFields(s),
      cleared: passed && streak >= challenge.games, eligible: true,
      detail: { kind: challenge.kind, seed, passed, streak, mealScale: s.events?.find(e => e.type === 'meal')?.scale ?? 1,
        ...(abandoned ? { abandoned: true } : {}) } };
  }
  const api = { DAY, EVENTS, SEVERE_LIMIT, init, step, stars, severeCapped, mealRate,
    exerciseRate, MEAL_DUR, MIN_MEAL_GAP, SCHEDULE_ATTEMPTS, makeSchedule, CHALLENGES,
    challengeGamePassed, condFor, scoreFields, challengeFinish };
  // init의 E2E 래핑은 허용하면서 기본 일정의 통째 교체는 막는다.
  Object.defineProperty(api, 'EVENTS', { writable: false, configurable: false });
  root.GlucoseModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
