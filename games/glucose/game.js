/* 혈당 지키기 — 화면과 진행 */
(function () {
  const M = window.GlucoseModel, A = window.Arcade;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  let s, hold = false, running = false, mode = 'normal', last = 0, holdTime = 0;
  let frameId = null, challengeRun = null;
  const G_MIN = 30, G_MAX = 350, NOW_X = W * 0.42, PX_PER_S = 26;
  const gy = g => H - 40 - (g - G_MIN) / (G_MAX - G_MIN) * (H - 150);
  const starRule = `목표 범위(70~180)에 머문 시간 60·75·90% 이상이면 별 1·2·3개. 단, 혈당이 54 미만에 머문 시간이 합쳐서 ${M.SEVERE_LIMIT}초 이상인 판은 별이 1개까지다.`;
  function nextStarHint(stars) {
    if (stars === 3) return '별 3개를 받았다. 다음 판에도 혈당 변화를 살펴 조절해 보자.';
    if (stars === 0) return `다음 별: 목표 범위에 머문 시간을 60% 이상으로 늘려 보자. 별 2개부터는 54 미만에 머문 시간도 합쳐서 ${M.SEVERE_LIMIT}초 미만이어야 한다.`;
    if (M.severeCapped(s) && s.tir / M.DAY >= 0.75) {
      const uncappedStars = s.tir / M.DAY >= 0.9 ? 3 : 2;
      return `이번 판은 별 1개 상한이 적용됐다. 목표 범위에 머문 시간을 유지하고, 54 미만에 머문 시간을 합쳐서 ${M.SEVERE_LIMIT}초 미만으로 줄이면 별 ${uncappedStars}개를 받을 수 있다.`;
    }
    const target = stars === 1 ? 75 : 90;
    return `다음 별 ${stars + 1}개: ${M.severeCapped(s) ? '이번 판은 별 1개 상한이 적용됐다. 다음 판에는 ' : ''}목표 범위에 머문 시간을 ${target}% 이상으로 유지하고, 54 미만에 머문 시간은 합쳐서 ${M.SEVERE_LIMIT}초 미만으로 줄여 보자.`;
  }

  function unlocked() { return A.best('glucose') >= 2; }
  // 모드 고르기: 게임 밖에서는 시작·결과 카드가 화면 전체를 덮으므로 고르는 버튼을 카드 안에 넣는다.
  function addModePicker(before) {
    const open = unlocked();
    if (!open) mode = 'normal';
    const box = document.createElement('div');
    box.className = 'mode-pick';
    box.innerHTML = `<div class="modes" role="group" aria-label="모드 고르기">
        <button class="btn" data-mode="normal">기본</button>
        <button class="btn" data-mode="resistance"${open ? '' : ' disabled'}>${open ? '도전: 인슐린 저항성' : '🔒 인슐린 저항성'}</button></div>
      ${open ? '' : '<p class="mode-note">기본 모드에서 별 2개를 얻으면 열린다.</p>'}`;
    const btns = box.querySelectorAll('[data-mode]');
    const paint = () => btns.forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    btns.forEach(b => { b.onclick = () => { mode = b.dataset.mode; paint(); }; });
    paint();
    before.parentNode.insertBefore(box, before);
  }

  let toastT;
  // 토스트는 글자 수(띄어쓰기 포함)에 비례해 띄운다: 글자당 70ms, 짧아도 2.2초, 길어도 6초
  const toastMs = t => Math.min(6000, Math.max(2200, Array.from(t).length * 70));
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), toastMs(t)); }

  // 같은 줄의 앞 이름표들과 겹치지 않는 첫 줄을 쓴다. 맞닿기만 하면 겹침이 아니다.
  // 세 줄 모두 겹치면 겹치는 너비의 합이 가장 작은 줄을 쓴다.
  function scheduleLabelY(x, width, labels) {
    let bestY = 78, leastOverlap = Infinity;
    for (const y of [78, 98, 118]) {
      let overlap = 0;
      for (const label of labels) if (label.y === y) {
        overlap += Math.max(0, Math.min(x + width, label.x + label.width) - Math.max(x, label.x));
      }
      if (overlap === 0) return y;
      if (overlap < leastOverlap) { bestY = y; leastOverlap = overlap; }
    }
    return bestY;
  }

  const scheduleLabelCache = new WeakMap();
  function scheduleLabelRows(events) {
    if (scheduleLabelCache.has(events)) return scheduleLabelCache.get(events);
    const rows = new Map(), labels = [];
    ctx.font = 'bold 16px sans-serif';
    // 화면 밖도 포함한 하루 전체의 상대 위치로 한 번만 정해, 화면이 이동해도 줄은 유지한다.
    for (const e of [...events].sort((a, b) => a.t - b.t)) {
      const x = e.t * PX_PER_S + 4;
      const width = ctx.measureText((e.type === 'meal' ? '🍚 ' : '🏃 ') + e.name).width;
      const y = scheduleLabelY(x, width, labels);
      labels.push({ x, width, y });
      rows.set(e, y);
    }
    scheduleLabelCache.set(events, rows);
    return rows;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f7fbff'; ctx.fillRect(0, 0, W, H);
    // 범위 띠
    ctx.fillStyle = 'rgba(106, 168, 79, .18)'; ctx.fillRect(0, gy(180), W, gy(70) - gy(180));
    ctx.fillStyle = 'rgba(224, 102, 102, .15)'; ctx.fillRect(0, gy(54), W, gy(G_MIN) - gy(54));
    ctx.fillStyle = 'rgba(241, 194, 50, .12)'; ctx.fillRect(0, gy(G_MAX), W, gy(250) - gy(G_MAX));
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#4a6b3a'; ctx.textAlign = 'left';
    ctx.fillText('목표 범위 70~180', 8, gy(180) + 16);
    ctx.fillStyle = '#b43a3a'; ctx.fillText('저혈당 위험(54 미만)', 8, H - 16);
    ctx.fillStyle = '#9a7400'; ctx.fillText('고혈당(250 초과)', 8, gy(G_MAX) + 16);
    // 눈금
    ctx.strokeStyle = '#dbe6f0'; ctx.lineWidth = 1; ctx.fillStyle = '#7890a8'; ctx.textAlign = 'right';
    for (const v of [54, 70, 100, 140, 180, 250, 350]) { ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(W, gy(v)); ctx.stroke(); ctx.fillText(v, W - 6, gy(v) - 3); }
    // 지금 선
    ctx.strokeStyle = '#9fb3c8'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(NOW_X, 60); ctx.lineTo(NOW_X, H - 30); ctx.stroke(); ctx.setLineDash([]);
    // 다가오는 일정(식사·운동)
    const events = s.events || M.EVENTS;
    // 기본 판은 측정 호출도 추가하지 않고 기존 줄·그리기 순서를 유지한다.
    const labelRows = events !== M.EVENTS ? scheduleLabelRows(events) : null;
    for (const e of events) {
      const x = NOW_X + (e.t - s.t) * PX_PER_S;
      if (x < -40 || x > W + 40) continue;
      const w = (e.type === 'meal' ? M.MEAL_DUR : e.dur) * PX_PER_S;
      ctx.fillStyle = e.type === 'meal' ? 'rgba(241, 163, 60, .22)' : 'rgba(61, 133, 198, .18)';
      ctx.fillRect(x, 60, w, H - 90);
      ctx.fillStyle = e.type === 'meal' ? '#b36b00' : '#1f5f99'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
      const label = (e.type === 'meal' ? '🍚 ' : '🏃 ') + e.name;
      const y = labelRows ? labelRows.get(e) : 78;
      ctx.fillText(label, x + 4, y);
    }
    // 지나온 혈당
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.beginPath();
    s.trace.forEach((p, i) => { const x = NOW_X - (s.t - p.t) * PX_PER_S; const y = gy(p.g); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(NOW_X, gy(s.g), 8, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#1f2d3d';
    ctx.fillText(`${Math.round(s.g)} mg/dL`, NOW_X + 12, gy(s.g) - 10);
    // 호르몬 막대
    const barW = (W - 30) / 2;
    ctx.fillStyle = '#e8eef4'; ctx.fillRect(10, 10, barW, 30); ctx.fillRect(20 + barW, 10, barW, 30);
    ctx.fillStyle = '#3d85c6'; ctx.fillRect(10, 10, barW * s.ins, 30);
    ctx.fillStyle = '#e69138'; ctx.fillRect(20 + barW, 10, barW * (1 - s.ins), 30);
    ctx.fillStyle = '#10243a'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`인슐린 ${hold ? '분비 중 ▲' : ''}`, 10 + barW / 2, 30);
    ctx.fillText(`글루카곤 ${hold ? '' : '분비 중 ▲'}`, 20 + barW * 1.5, 30);
    if (s.mode === 'resistance') { ctx.fillStyle = '#7a4bb3'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('인슐린 저항성: 세포가 인슐린에 덜 반응한다', W / 2, 58); }
  }
  function clockText(t) { const h = 6 + (t / M.DAY) * 18; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  let warned = {};
  function frame(now) {
    if (!running) return;
    frameId = null;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    M.step(s, hold, dt);
    if (hold) holdTime += dt;
    s.trace.push({ t: s.t, g: s.g });
    if (s.trace.length > 600) s.trace.shift();
    if (s.g < 60 && !warned.low) { warned.low = true; toast('저혈당 위험! 손을 떼면 글루카곤이 간의 글리코젠을 포도당으로 바꾼다'); }
    if (s.g > 200 && !warned.high) { warned.high = true; toast('혈당이 너무 높다! 누르면 인슐린이 세포로 포도당을 들여보낸다'); }
    $('clock').textContent = clockText(s.t);
    $('tir').textContent = `${Math.round(s.tir / Math.max(0.01, s.t) * 100)}%`;
    draw();
    if (s.t >= M.DAY) return challengeRun ? finishChallenge() : finish();
    frameId = requestAnimationFrame(frame);
  }
  function settleChallenge(result) {
    if (!challengeRun) return;
    const { resolve } = challengeRun;
    challengeRun = null;
    resolve(result);
  }
  function beginRound(createState, nextChallenge = null) {
    // 새 판으로 바꾸면 진행 중인 도전을 포기 기록으로 끝내고 예약 프레임도 취소한다.
    if (running && challengeRun) {
      const { challenge, seed } = challengeRun;
      settleChallenge(M.challengeFinish(s, challenge, seed, [], { abandoned: true }));
    }
    if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    // 숨겨진 시작·다시 하기 버튼에 포커스가 남으면 게임 중 Space가 그 버튼을 누를 수 있어 포커스를 푼다
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    // 이전 판 끝 무렵에 뜬 경고가 새 판(혈당 95)에 남지 않게 토스트를 바로 내린다
    clearTimeout(toastT); $('toast').classList.remove('on');
    s = createState(); challengeRun = nextChallenge;
    if (challengeRun) $('overlay').hidden = true;
    hold = false; warned = {}; holdTime = 0; running = true; last = performance.now(); frameId = requestAnimationFrame(frame);
  }
  function start() {
    beginRound(() => M.init(mode));
  }
  function startChallenge(id) {
    const challenge = M.CHALLENGES.find(candidate => candidate.id === id);
    if (!challenge) throw new RangeError('알 수 없는 도전');
    const seed = Math.floor(Math.random() * 4294967296);
    return new Promise(resolve => {
      beginRound(() => M.init(challenge.mode, M.makeSchedule(challenge.kind, seed)), { challenge, seed, resolve });
    });
  }
  function finishChallenge() {
    running = false; hold = false;
    const { challenge, seed } = challengeRun;
    // T12의 A.plays가 생기기 전까지 이전 판 목록은 비워 두고 기록·결과 카드를 연결하지 않는다.
    const result = M.challengeFinish(s, challenge, seed, []);
    settleChallenge(result);
    return result;
  }
  function finish() {
    running = false; hold = false;
    const wasOpen = unlocked();
    const stars = M.stars(s), tir = Math.round(s.tir / M.DAY * 100);
    A.finish($('overlay'), {
      id: 'glucose', stars, score: tir,
      detail: { mode, tirPct: tir, hypoSec: +s.hypo.toFixed(1), severeSec: +s.severe.toFixed(1), hyperSec: +s.hyper.toFixed(1), peak: Math.round(s.peak), low: Math.round(s.low), holdSec: +holdTime.toFixed(1) },
      lines: [`하루 중 목표 범위(70~180 mg/dL)에 머문 시간 <b>${tir}%</b> · 최고 ${Math.round(s.peak)} · 최저 ${Math.round(s.low)}`,
        `180 초과 ${s.hyper.toFixed(1)}초 · 70 미만 ${s.hypo.toFixed(1)}초 · 그중 54 미만 ${s.severe > 0 && !M.severeCapped(s) ? M.SEVERE_LIMIT + '초 미만' : s.severe.toFixed(1) + '초'}`,
        starRule,
        nextStarHint(stars),
        s.hyper > 0 ? '혈당이 높아지면 조금 더 일찍 눌러 인슐린을 분비해 보자.' : '',
        s.hypo > 0 ? '혈당이 낮아지면 조금 더 일찍 손을 떼어 글루카곤을 분비해 보자.' : '',
        s.severe > 0 ? '⚠ 저혈당 위험 구간에 들어갔다. 인슐린을 너무 오래 분비하면 혈당이 지나치게 떨어진다.' : '',
        mode === 'resistance' ? '인슐린 저항성에서는 같은 양의 인슐린으로 혈당이 덜 내려간다. 제2형 당뇨병의 핵심 특징이다(게임용 단순 모델).' : (!wasOpen && stars >= 2 ? '도전 모드 “인슐린 저항성”이 열렸다! 아래에서 골라 다시 해 보자.' : ''),
        '건강한 사람의 혈당은 대부분 70~140 mg/dL 안에 머문다. 70~180 mg/dL은 당뇨병 환자의 혈당 관리에서 쓰는 목표 범위다.'].filter(Boolean),
      quiz: { q: '혈당이 정상보다 높아지면 이자에서 분비가 늘어나는 호르몬은?', options: ['인슐린', '글루카곤'], answer: 0,
        explain: '인슐린은 세포가 포도당을 흡수하고 간이 포도당을 글리코젠으로 저장하게 해 혈당을 낮춘다. 글루카곤은 반대로 혈당을 높인다.' },
      reflection: '해설을 참고해 정리해 보세요. 게임에서 손가락을 누르고 떼는 행동은 몸속에서 무엇에 해당했을까? 혈당이 오르면 인슐린이, 내리면 글루카곤이 분비되는 과정을 “음성 피드백”이라는 말을 넣어 설명하세요.',
      onRetry: start,
    });
    addModePicker($('overlay').querySelector('#ar-retry').parentNode);
  }
  // 입력: 화면 어디든 누르고 있기
  const downH = e => { if (running) { hold = true; e.preventDefault(); } };
  const upH = () => { hold = false; };
  $('stage').addEventListener('pointerdown', downH);
  window.addEventListener('pointerup', upH); window.addEventListener('pointercancel', upH);
  // Space는 게임 중에만 가로챈다. 시작·결과 화면의 버튼 누르기와 '설명해 보기' 띄어쓰기는 그대로 둔다.
  const typing = e => e.target instanceof Element && e.target.closest('textarea, input, select, [contenteditable]');
  window.addEventListener('keydown', e => { if (e.code === 'Space' && running && !typing(e)) { e.preventDefault(); hold = true; } });
  window.addEventListener('keyup', e => { if (e.code !== 'Space') return; if (running && !typing(e)) e.preventDefault(); hold = false; });

  // 도전 선택 화면(T9)과 기록 연결(T12) 전까지 학생 화면에서 부르지 않는다.
  window.GlucoseGame = Object.freeze({ startChallenge });

  s = M.init('normal'); draw();
  A.intro($('overlay'), {
    id: 'glucose',
    rules: [
      '45초 = 하루(06시~24시). 그래프는 내 혈당이다.',
      '<b>누르고 있으면 이자가 인슐린</b>을 분비해 혈당이 내려가고, <b>떼면 글루카곤</b>이 분비되어 혈당이 올라간다.',
      '호르몬은 1~2초 늦게 효과를 낸다. 오른쪽에서 다가오는 식사·운동을 미리 보고 대비하자!',
      starRule,
      '기본 모드 별 2개면 “인슐린 저항성” 모드가 열린다.',
    ],
    onStart: start,
  });
  addModePicker($('overlay').querySelector('#ar-start'));
})();
