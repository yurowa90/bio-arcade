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
  const EVENTS = [
    { t: 4, type: 'meal', name: '아침 식사', amount: 70 },
    { t: 16, type: 'meal', name: '점심 식사', amount: 95 },
    { t: 24, type: 'exercise', name: '체육 시간', dur: 5, rate: 10 },
    { t: 33, type: 'meal', name: '저녁 식사', amount: 105 },
    { t: 40, type: 'meal', name: '야식', amount: 45 },
  ];
  const MEAL_DUR = 5;
  function init(mode) { return { t: 0, g: 95, ins: 0, mode: mode || 'normal', tir: 0, hypo: 0, severe: 0, hyper: 0, peak: 95, low: 95, trace: [] }; }
  function mealRate(t) {
    let r = 0;
    for (const e of EVENTS) if (e.type === 'meal' && t >= e.t && t < e.t + MEAL_DUR) {
      const u = (t - e.t) / MEAL_DUR; r += e.amount * 2 / MEAL_DUR * (u < 0.5 ? u * 2 : 2 - u * 2); // 삼각형 흡수 곡선(넓이 = amount)
    }
    return r;
  }
  function exerciseRate(t) { return EVENTS.filter(e => e.type === 'exercise' && t >= e.t && t < e.t + e.dur).reduce((a, e) => a + e.rate, 0); }
  function step(s, hold, dt) {
    const target = hold ? 1 : 0;
    s.ins += (target - s.ins) * Math.min(1, dt / 1.6);            // 호르몬 농도는 1.6초 정도 늦게 따라온다
    const sens = s.mode === 'resistance' ? 0.45 : 1;              // 인슐린 저항성: 세포가 인슐린에 덜 반응
    const glucagon = 1 - s.ins;
    const dg = 12 * glucagon - 24 * s.ins * sens + mealRate(s.t) - exerciseRate(s.t);
    s.g = Math.max(30, Math.min(350, s.g + dg * dt));
    s.t += dt;
    if (s.g >= 70 && s.g <= 180) s.tir += dt;
    if (s.g < 70) s.hypo += dt;
    if (s.g < 54) s.severe += dt;
    if (s.g > 180) s.hyper += dt;
    s.peak = Math.max(s.peak, s.g); s.low = Math.min(s.low, s.g);
    return s;
  }
  // 1/60초 등을 더할 때 생기는 부동소수점 오차만 허용한다. 저장용 반올림 값은 쓰지 않는다.
  function severeCapped(s) { return s.severe >= SEVERE_LIMIT - 1e-9; }
  function stars(s) {
    const p = s.tir / DAY, earned = p >= 0.9 ? 3 : p >= 0.75 ? 2 : p >= 0.6 ? 1 : 0;
    return severeCapped(s) ? Math.min(earned, 1) : earned;
  }
  const api = { DAY, EVENTS, SEVERE_LIMIT, init, step, stars, severeCapped, mealRate };
  root.GlucoseModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
