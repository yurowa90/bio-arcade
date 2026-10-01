/* 에너지 런 — 쿠키런 오마주. 달리는 주인공은 온몸을 도는 혈액(적혈구 “혈구”)이다.
 * 규칙 = 세포 호흡: 포도당 1 + 산소 1 → 에너지 +10, 이산화 탄소 +1 (자동)
 * 소장 구간: 영양소 흡수 · 폐 구간: 산소 얻고 이산화 탄소 내보냄 · 콩팥 구간: 요소 걸러 냄 · 근육 구간: 에너지를 많이 씀
 */
(function () {
  const A = window.Arcade;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, GROUND = H - 60;
  const DURATION = 60;
  const ZONES = [
    { id: 'gut', name: '소장', desc: '소장의 융털 모세 혈관: 포도당·아미노산을 흡수한다', bg: '#f6d6c9', deco: '#e8a88f', drain: 5 },
    { id: 'lung', name: '폐', desc: '폐포의 모세 혈관: 산소를 받고 이산화 탄소를 내보낸다', bg: '#dcecf7', deco: '#a9cbe6', drain: 5 },
    { id: 'muscle', name: '근육', desc: '근육 세포: 에너지를 많이 쓴다. 장애물 조심!', bg: '#f2c6c6', deco: '#d98c8c', drain: 8 },
    { id: 'kidney', name: '콩팥', desc: '콩팥의 사구체: 요소 같은 노폐물을 걸러 오줌으로 내보낸다', bg: '#e6d2e8', deco: '#c29bc7', drain: 5 },
  ];
  const ZONE_LEN = 6; // 초
  let S, running = false, last = 0;

  function reset() {
    S = { t: 0, x: 0, y: GROUND, vy: 0, jumps: 0, E: 70, N: 3, O: 3, C: 0, U: 0, made: 0, items: [], nextSpawn: 0.6, hurt: 0,
      stats: { glucose: 0, protein: 0, o2: 0, hits: 0, noO2: 0, wasteSlow: 0, exhaled: 0, filtered: 0 }, respT: 0, warned: {} };
  }
  const zoneAt = t => ZONES[Math.floor(t / ZONE_LEN) % ZONES.length];
  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

  function spawn() {
    const z = zoneAt(S.t + 1.2); // 화면 오른쪽 끝은 약 1.2초 뒤의 구간
    const r = Math.random();
    const h = [GROUND - 20, GROUND - 95, GROUND - 165][Math.floor(Math.random() * 3)];
    let item;
    if (z.id === 'gut') item = r < 0.62 ? { k: 'glu', y: h } : r < 0.85 ? { k: 'pro', y: h } : { k: 'wall', y: GROUND };
    else if (z.id === 'lung') item = r < 0.75 ? { k: 'o2', y: h } : { k: 'wall', y: GROUND };
    else if (z.id === 'muscle') item = r < 0.45 ? { k: 'wall', y: GROUND } : r < 0.72 ? { k: 'glu', y: h } : { k: 'o2', y: h };
    else item = r < 0.3 ? { k: 'wall', y: GROUND } : { k: r < 0.65 ? 'o2' : 'glu', y: h };
    item.x = W + 30;
    S.items.push(item);
  }
  function speed() { return (S.C >= 8 || S.U >= 8) ? 170 : 230; }

  function update(dt) {
    const z = zoneAt(S.t);
    S.t += dt;
    const v = speed();
    S.x += v * dt;
    // 대사: 가만히 있어도 에너지를 쓴다
    const wasteHeavy = S.C >= 8 || S.U >= 8;
    S.E -= (z.drain + (wasteHeavy ? 3 : 0)) * dt;
    if (wasteHeavy) { S.stats.wasteSlow += dt; if (!S.warned.waste) { S.warned.waste = true; toast('노폐물이 쌓였다! 몸이 무거워진다 — 폐와 콩팥에서 내보내자'); } }
    // 세포 호흡(자동)
    S.respT += dt;
    if (S.respT >= 0.4) {
      S.respT = 0;
      if (S.E < 95) {
        if (S.N >= 1 && S.O >= 1) { S.N--; S.O--; S.E = Math.min(100, S.E + 10); S.C = Math.min(10, S.C + 1); S.made++; }
        else if (S.N >= 1 && S.O < 1) { S.stats.noO2 += 0.4; if (!S.warned.o2) { S.warned.o2 = true; toast('영양소가 있어도 산소가 없으면 에너지를 만들 수 없다!'); } }
      }
    }
    // 폐: 이산화 탄소 배출, 콩팥: 요소 배설
    if (z.id === 'lung' && S.C > 0) { const d = Math.min(S.C, 2.5 * dt); S.C -= d; S.stats.exhaled += d; }
    if (z.id === 'kidney' && S.U > 0) { const d = Math.min(S.U, 2 * dt); S.U -= d; S.stats.filtered += d; }
    // 점프 물리
    S.vy += 1500 * dt; S.y += S.vy * dt;
    if (S.y >= GROUND) { S.y = GROUND; S.vy = 0; S.jumps = 0; }
    if (S.hurt > 0) S.hurt -= dt;
    // 아이템
    S.nextSpawn -= dt;
    if (S.nextSpawn <= 0) { spawn(); S.nextSpawn = 0.45 + Math.random() * 0.4; }
    const px = 110;
    for (const it of S.items) {
      it.x -= v * dt;
      if (it.got) continue;
      const hitY = it.k === 'wall' ? S.y > GROUND - 40 : Math.abs((S.y - 22) - it.y) < 34;
      if (Math.abs(it.x - px) < 26 && hitY) {
        it.got = true;
        if (it.k === 'wall') { if (S.hurt <= 0) { S.E -= 12; S.hurt = 0.8; S.stats.hits++; toast('쿵! 좁아진 혈관에 부딪혔다'); } }
        else if (it.k === 'glu') { S.N = Math.min(10, S.N + 1); S.stats.glucose++; }
        else if (it.k === 'pro') { S.N = Math.min(10, S.N + 1); S.U = Math.min(10, S.U + 1); S.stats.protein++; if (!S.warned.pro) { S.warned.pro = true; toast('단백질을 에너지로 쓰면 질소 노폐물(요소)이 생긴다'); } }
        else if (it.k === 'o2') { S.O = Math.min(10, S.O + 1); S.stats.o2++; }
      }
    }
    S.items = S.items.filter(it => it.x > -40 && !(it.got && it.k !== 'wall'));
  }

  function draw() {
    const z = zoneAt(S.t);
    ctx.fillStyle = z.bg; ctx.fillRect(0, 0, W, H);
    // 배경 장식(구간마다 다른 무늬가 흘러간다)
    ctx.fillStyle = z.deco;
    const off = (S.x * 0.4) % 80;
    for (let i = -1; i < 8; i++) {
      const bx = i * 80 - off;
      if (z.id === 'gut') { ctx.beginPath(); ctx.ellipse(bx + 40, 40, 14, 34, 0, 0, Math.PI * 2); ctx.fill(); }            // 융털
      else if (z.id === 'lung') { ctx.beginPath(); ctx.arc(bx + 40, 50, 24, 0, Math.PI * 2); ctx.fill(); }                   // 폐포
      else if (z.id === 'muscle') { ctx.fillRect(bx, 20, 10, H - 100); ctx.fillRect(bx + 40, 20, 10, H - 100); }            // 근육 줄무늬
      else { ctx.beginPath(); ctx.arc(bx + 40, 50, 20, 0, Math.PI * 2); ctx.lineWidth = 8; ctx.strokeStyle = z.deco; ctx.stroke(); } // 사구체
    }
    // 혈관 바닥
    ctx.fillStyle = '#b03a2e'; ctx.fillRect(0, GROUND + 18, W, H - GROUND - 18);
    ctx.fillStyle = '#8a2a21'; for (let i = 0; i < 12; i++) ctx.fillRect(((i * 60 - S.x) % 720 + 720) % 720 - 60, GROUND + 30, 30, 6);
    // 아이템
    for (const it of S.items) {
      if (it.k === 'wall') { ctx.fillStyle = '#f1c232'; ctx.beginPath(); ctx.moveTo(it.x - 22, GROUND + 18); ctx.quadraticCurveTo(it.x, GROUND - 40, it.x + 22, GROUND + 18); ctx.fill(); continue; }
      const col = { glu: '#e0a412', pro: '#8e7cc3', o2: '#3d85c6' }[it.k], lab = { glu: '포', pro: '단', o2: 'O₂' }[it.k];
      ctx.fillStyle = col;
      if (it.k === 'glu') { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; ctx.lineTo(it.x + 16 * Math.cos(a), it.y + 16 * Math.sin(a)); } ctx.fill(); }
      else if (it.k === 'o2') { ctx.beginPath(); ctx.arc(it.x, it.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(it.x - 5, it.y - 5, 4, 0, Math.PI * 2); ctx.fill(); }
      else { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(it.x + k * 11, it.y, 7, 0, Math.PI * 2); ctx.fill(); } }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lab, it.x, it.y + 4);
    }
    // 주인공: 적혈구 “혈구”(가운데가 오목한 원반)
    const px = 110, py = S.y - 22;
    ctx.globalAlpha = S.hurt > 0 && Math.floor(S.hurt * 10) % 2 ? 0.4 : 1;
    ctx.fillStyle = '#d7263d'; ctx.beginPath(); ctx.ellipse(px, py, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a4161a'; ctx.beginPath(); ctx.ellipse(px, py, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + 9, py - 8, 5, 0, Math.PI * 2); ctx.arc(px + 20, py - 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px + 10, py - 8, 2.5, 0, Math.PI * 2); ctx.arc(px + 21, py - 8, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // 구간 이름
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(8, 8, 90, 28); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`📍 ${z.name}`, 16, 28);
  }
  function hud() {
    const set = (id, v, max) => { $(id + '-v').textContent = Math.round(v); $(id + '-b').style.width = `${Math.max(0, Math.min(100, v / max * 100))}%`; };
    set('e', S.E, 100); set('n', S.N, 10); set('o', S.O, 10); set('c', S.C, 10); set('u', S.U, 10);
    $('dist').textContent = `${Math.round(S.x / 10)} m`;
    $('time').textContent = `${Math.max(0, Math.ceil(DURATION - S.t))}초`;
    const z = zoneAt(S.t); $('zone').textContent = z.desc;
    const eq = $('eq'); const noO = S.O < 1 && S.N >= 1;
    eq.classList.toggle('off', noO);
    eq.textContent = noO ? '포도당 + 산소(없음!) → 에너지를 만들 수 없다' : '포도당 + 산소 → 에너지 + 이산화 탄소 + 물';
  }
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    update(dt); draw(); hud();
    if (S.E <= 0 || S.t >= DURATION) return finish();
    requestAnimationFrame(frame);
  }
  function jump() { if (!running) return; if (S.jumps < 2) { S.vy = S.jumps ? -560 : -620; S.jumps++; } }
  function start() { reset(); running = true; last = performance.now(); requestAnimationFrame(frame); }
  function finish() {
    running = false;
    const survived = S.E > 0 && S.t >= DURATION;
    const stars = !survived ? 0 : S.made >= 30 ? 3 : S.made >= 22 ? 2 : 1;
    A.finish($('overlay'), {
      id: 'run', stars, score: Math.round(S.x / 10),
      detail: { survived, seconds: +S.t.toFixed(1), energyMade: S.made, ...S.stats },
      lines: [survived ? `60초 완주! 거리 ${Math.round(S.x / 10)} m` : `${Math.round(S.t)}초에 에너지가 바닥났다.`,
        `세포 호흡으로 에너지를 ${S.made}번 만들었다. 포도당 ${S.stats.glucose + S.stats.protein} · 산소 ${S.stats.o2}개를 모았다.`,
        S.stats.noO2 > 1 ? `영양소는 있는데 산소가 모자라 에너지를 못 만든 시간이 ${S.stats.noO2.toFixed(1)}초. 호흡계 없이는 소화계도 소용없다!` : '',
        S.stats.wasteSlow > 1 ? `노폐물 때문에 느려진 시간 ${S.stats.wasteSlow.toFixed(1)}초. 폐와 콩팥이 쉬지 않는 까닭이다.` : ''].filter(Boolean),
      quiz: { q: '세포 호흡으로 에너지를 얻는 데 반드시 필요한 두 가지 물질은?', options: ['포도당(영양소)과 산소', '포도당과 이산화 탄소'], answer: 0,
        explain: '소화계가 흡수한 영양소와 호흡계가 받아들인 산소를 순환계가 세포까지 운반해야 세포 호흡이 일어난다. 이산화 탄소는 세포 호흡의 결과로 생기는 노폐물이다.' },
      reflection: '에너지 런에서 에너지가 계속 만들어지려면 소화계, 호흡계, 순환계, 배설계가 각각 어떤 일을 해야 했나요? 네 기관계를 모두 넣어 세포 호흡과 연결해 설명하세요.',
      onRetry: start,
    });
  }
  $('stage').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  window.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } });

  reset(); draw(); hud();
  A.intro($('overlay'), {
    id: 'run',
    rules: [
      '주인공은 온몸을 도는 <b>혈액</b>이다. 화면을 누르면 점프(두 번까지).',
      '에너지는 가만히 있어도 줄어든다. <b>포도당과 산소가 둘 다 있어야</b> 세포 호흡으로 에너지가 채워진다.',
      '세포 호흡을 하면 <b>이산화 탄소</b>가 쌓이고, 단백질을 먹으면 <b>요소</b>가 생긴다. 폐와 콩팥 구간을 지나야 줄어든다.',
      '60초를 버티면 성공. 세포 호흡 횟수 22·30번 이상이면 별 2·3개.',
    ],
    onStart: start,
  });
})();
