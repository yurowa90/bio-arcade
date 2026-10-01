/* 혈당 지키기 — 화면과 진행 */
(function () {
  const M = window.GlucoseModel, A = window.Arcade;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  let s, hold = false, running = false, mode = 'normal', last = 0, holdTime = 0;
  const G_MIN = 30, G_MAX = 320, NOW_X = W * 0.42, PX_PER_S = 26;
  const gy = g => H - 40 - (g - G_MIN) / (G_MAX - G_MIN) * (H - 110);

  function unlocked() { return A.best('glucose') >= 2; }
  function setMode(m) {
    if (m === 'resistance' && !unlocked()) { toast('기본 모드에서 별 2개를 얻으면 열린다'); return; }
    mode = m; $('m-normal').classList.toggle('on', m === 'normal'); $('m-res').classList.toggle('on', m === 'resistance');
  }
  $('m-normal').onclick = () => !running && setMode('normal');
  $('m-res').onclick = () => !running && setMode('resistance');
  if (!unlocked()) $('m-res').textContent = '🔒 인슐린 저항성';

  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2000); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f7fbff'; ctx.fillRect(0, 0, W, H);
    // 범위 띠
    ctx.fillStyle = 'rgba(106, 168, 79, .18)'; ctx.fillRect(0, gy(180), W, gy(70) - gy(180));
    ctx.fillStyle = 'rgba(224, 102, 102, .15)'; ctx.fillRect(0, gy(54), W, gy(G_MIN) - gy(54));
    ctx.fillStyle = 'rgba(241, 194, 50, .12)'; ctx.fillRect(0, gy(G_MAX), W, gy(250) - gy(G_MAX));
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#4a6b3a'; ctx.textAlign = 'left';
    ctx.fillText('정상 범위 70~180', 8, gy(180) + 16);
    ctx.fillStyle = '#b43a3a'; ctx.fillText('저혈당 위험(54 미만)', 8, gy(54) + 16);
    ctx.fillStyle = '#9a7400'; ctx.fillText('고혈당(250 초과)', 8, gy(G_MAX) + 16);
    // 눈금
    ctx.strokeStyle = '#dbe6f0'; ctx.lineWidth = 1; ctx.fillStyle = '#7890a8'; ctx.textAlign = 'right';
    for (const v of [54, 70, 100, 140, 180, 250]) { ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(W, gy(v)); ctx.stroke(); ctx.fillText(v, W - 6, gy(v) - 3); }
    // 지금 선
    ctx.strokeStyle = '#9fb3c8'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(NOW_X, 60); ctx.lineTo(NOW_X, H - 30); ctx.stroke(); ctx.setLineDash([]);
    // 다가오는 일정(식사·운동)
    for (const e of M.EVENTS) {
      const x = NOW_X + (e.t - s.t) * PX_PER_S;
      if (x < -40 || x > W + 40) continue;
      const w = (e.type === 'meal' ? 5 : e.dur) * PX_PER_S;
      ctx.fillStyle = e.type === 'meal' ? 'rgba(241, 163, 60, .22)' : 'rgba(61, 133, 198, .18)';
      ctx.fillRect(x, 60, w, H - 90);
      ctx.fillStyle = e.type === 'meal' ? '#b36b00' : '#1f5f99'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((e.type === 'meal' ? '🍚 ' : '🏃 ') + e.name, x + 4, 78);
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
    ctx.fillStyle = '#10243a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`인슐린 ${hold ? '분비 중 ▲' : ''}`, 10 + barW / 2, 30);
    ctx.fillText(`글루카곤 ${hold ? '' : '분비 중 ▲'}`, 20 + barW * 1.5, 30);
    if (mode === 'resistance') { ctx.fillStyle = '#7a4bb3'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('인슐린 저항성: 세포가 인슐린에 덜 반응한다', W / 2, 56); }
  }
  function clockText(t) { const h = 6 + (t / M.DAY) * 18; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  let warned = {};
  function frame(now) {
    if (!running) return;
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
    if (s.t >= M.DAY) return finish();
    requestAnimationFrame(frame);
  }
  function start() { s = M.init(mode); hold = false; warned = {}; holdTime = 0; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function finish() {
    running = false; hold = false;
    const stars = M.stars(s), tir = Math.round(s.tir / M.DAY * 100);
    A.finish($('overlay'), {
      id: 'glucose', stars, score: tir,
      detail: { mode, tirPct: tir, hypoSec: +s.hypo.toFixed(1), severeSec: +s.severe.toFixed(1), hyperSec: +s.hyper.toFixed(1), peak: Math.round(s.peak), low: Math.round(s.low), holdSec: +holdTime.toFixed(1) },
      lines: [`하루 중 정상 범위(70~180 mg/dL)에 머문 시간 <b>${tir}%</b> · 최고 ${Math.round(s.peak)} · 최저 ${Math.round(s.low)}`,
        s.severe > 0 ? '⚠ 저혈당 위험 구간에 들어갔다. 인슐린을 너무 오래 분비하면 혈당이 지나치게 떨어진다.' : '',
        mode === 'resistance' ? '인슐린 저항성에서는 같은 양의 인슐린으로 혈당이 덜 내려간다. 제2형 당뇨병의 핵심 특징이다(게임용 단순 모델).' : (stars >= 2 ? '도전 모드 “인슐린 저항성”이 열렸다!' : ''),
        '실제로도 연속 혈당 측정에서 70~180 mg/dL에 머문 시간(TIR)을 혈당 조절 지표로 쓴다.'].filter(Boolean),
      quiz: { q: '혈당이 정상보다 높아지면 이자에서 분비가 늘어나는 호르몬은?', options: ['인슐린', '글루카곤'], answer: 0,
        explain: '인슐린은 세포가 포도당을 흡수하고 간이 포도당을 글리코젠으로 저장하게 해 혈당을 낮춘다. 글루카곤은 반대로 혈당을 높인다.' },
      reflection: '게임에서 손가락을 누르고 떼는 행동은 몸속에서 무엇에 해당했나요? 혈당이 오르면 인슐린이, 내리면 글루카곤이 분비되는 과정을 “음성 피드백”이라는 말을 넣어 설명하세요.',
      onRetry: () => { if (A.best('glucose') >= 2) $('m-res').textContent = '도전: 인슐린 저항성'; start(); },
    });
  }
  // 입력: 화면 어디든 누르고 있기
  const downH = e => { if (running) { hold = true; e.preventDefault(); } };
  const upH = () => { hold = false; };
  $('stage').addEventListener('pointerdown', e => { if (e.target.closest('.modes')) return; downH(e); });
  window.addEventListener('pointerup', upH); window.addEventListener('pointercancel', upH);
  window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (running) hold = true; } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') hold = false; });

  s = M.init('normal'); draw();
  A.intro($('overlay'), {
    id: 'glucose',
    rules: [
      '45초 = 하루(06시~24시). 그래프는 내 혈당이다.',
      '<b>누르고 있으면 이자가 인슐린</b>을 분비해 혈당이 내려가고, <b>떼면 글루카곤</b>이 분비되어 혈당이 올라간다.',
      '호르몬은 1~2초 늦게 효과를 낸다. 오른쪽에서 다가오는 식사·운동을 미리 보고 대비하자!',
      '정상 범위(70~180)에 머문 시간 60·75·90% 이상이면 별 1·2·3개. 기본 모드 별 2개면 “인슐린 저항성” 모드가 열린다.',
    ],
    onStart: start,
  });
})();
