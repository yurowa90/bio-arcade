/* 에너지 런 — 쿠키런 오마주. 달리는 주인공은 온몸을 도는 혈액(적혈구 “혈구”)이다.
 * 소장 구간: 포도당·아미노산을 받는다 · 폐 구간: 산소를 받고 이산화 탄소를 내보낸다
 * 근육·콩팥 구간: 세포에 닿으면 영양소 1 + 산소 1을 전해 준다 → 세포가 세포 호흡으로 에너지를 얻고
 *   혈액에 이산화 탄소 +1을 내놓는다(아미노산을 썼으면 요소도 +1) · 콩팥 구간: 혈액의 요소를 걸러 낸다
 * 아이템은 구간마다 정해진 묶음(DECK)의 순서만 섞어 내보낸다. 판마다 공급량이 같아서
 * 다 받고 세포마다 다 전해 주면 운과 상관없이 완주한다.
 */
(function () {
  const A = window.Arcade;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, GROUND = H - 60;
  const DURATION = 60;
  const ZONES = [
    { id: 'gut', name: '소장', desc: '소장의 융털 모세 혈관: 포도당·아미노산을 흡수한다', bg: '#f6d6c9', deco: '#e8a88f', drain: 4 },
    { id: 'lung', name: '폐', desc: '폐포의 모세 혈관: 산소를 받고 이산화 탄소를 내보낸다', bg: '#dcecf7', deco: '#a9cbe6', drain: 4 },
    { id: 'muscle', name: '근육', desc: '근육: 세포에 산소·영양소를 주고 이산화 탄소를 받는다', bg: '#f2c6c6', deco: '#d98c8c', drain: 7 },
    { id: 'kidney', name: '콩팥', desc: '콩팥: 혈액의 요소를 걸러 낸다. 세포에 산소·영양소도 준다', bg: '#e6d2e8', deco: '#c29bc7', drain: 4 },
  ];
  const ZONE_LEN = 6; // 초
  // 구간 하나(6초) 동안 나오는 아이템 묶음. 근육·콩팥에서는 산소·영양소를 받지 않고 세포에 전해 준다.
  const DECK = {
    gut: ['glu', 'glu', 'glu', 'glu', 'glu', 'glu', 'amino', 'amino', 'wall'],
    lung: ['o2', 'o2', 'o2', 'o2', 'o2', 'o2', 'o2', 'wall', 'wall'],
    muscle: ['cell', 'cell', 'cell', 'cell', 'wall', 'wall', 'wall', 'wall'],
    kidney: ['cell', 'cell', 'cell', 'wall', 'wall', 'wall'],
  };
  const PX = 110, BASE_SPEED = 230;            // 주인공의 x 위치, 기본 달리기 속도(px/초)
  const LEAD = (W + 30 - PX) / BASE_SPEED;     // 아이템이 오른쪽 끝에서 주인공까지 오는 시간
  const HEIGHTS = [GROUND - 20, GROUND - 95, GROUND - 165];
  const E_MAX = 100, GAIN = 25, CARRY = 10;    // 세포 에너지 상한, 세포 하나에 전해 줄 때 얻는 에너지, 혈액이 실을 수 있는 양
  const zoneAt = t => ZONES[Math.floor(t / ZONE_LEN) % ZONES.length];
  let CELLS = 0; // 한 판(60초)에 나오는 세포 수
  for (let k = 0; k * ZONE_LEN < DURATION; k++) CELLS += DECK[ZONES[k % ZONES.length].id].filter(x => x === 'cell').length;
  const STAR2 = CELLS - 3, STAR3 = CELLS - 1; // 세포 14개 기준 11개·13개
  let S, running = false, last = 0;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 한 판의 아이템 일정: 구간마다 묶음을 섞어 고르게 배치한다. at = 주인공에게 닿는 시각
  function makeQueue() {
    const q = [];
    for (let k = 0; k * ZONE_LEN < DURATION; k++) {
      const z = ZONES[k % ZONES.length], deck = shuffle(DECK[z.id].slice());
      const t0 = k * ZONE_LEN + (k ? 0.4 : 1.0), gap = ((k + 1) * ZONE_LEN - 0.4 - t0) / (deck.length - 1);
      deck.forEach((kind, i) => q.push({ at: t0 + i * gap + (Math.random() - 0.5) * 0.1, k: kind, z: z.id,
        y: kind === 'wall' ? GROUND : HEIGHTS[Math.floor(Math.random() * 3)] }));
    }
    return q;
  }
  function reset() {
    S = { t: 0, x: 0, y: GROUND, vy: 0, jumps: 0, E: E_MAX, nut: ['glu', 'glu', 'glu'], O: 3, C: 0, U: 0, made: 0, items: [], queue: makeQueue(), hurt: 0,
      stats: { glucose: 0, amino: 0, o2: 0, hits: 0, cellsMet: 0, cellsNoO2: 0, cellsNoNut: 0, cellsEmpty: 0, exhaled: 0, filtered: 0 }, warned: {} };
    spawn();
  }
  let toastT, lessonT;
  const lessons = [];
  let teaching = false;
  const AMINO_NOTE = '세포가 아미노산을 쓰면 암모니아가 생기고, 간에서 요소로 바뀐다';
  // 글이 길수록 오래 보여 준다: 글자당 70ms, 최소 2.2초, 최대 6초
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), Math.min(6000, Math.max(2200, t.length * 70))); }
  function nextLesson() {
    if (!lessons.length) { teaching = false; $('lesson').textContent = ''; return; }
    teaching = true;
    const text = lessons.shift(); $('lesson').textContent = text;
    lessonT = setTimeout(nextLesson, Math.min(6000, Math.max(2200, Array.from(text).length * 70)));
  }
  function warnOnce(key, text) {
    if (S.warned[key]) return;
    S.warned[key] = true; lessons.push(text);
    if (!teaching) nextLesson();
  }
  function clearFeedback() {
    clearTimeout(toastT); clearTimeout(lessonT); lessons.length = 0; teaching = false;
    $('toast').classList.remove('on'); $('toast').textContent = ''; $('lesson').textContent = '';
  }

  // 일정에서 화면 오른쪽 끝에 들어올 때가 된 아이템을 꺼낸다
  function spawn() {
    while (S.queue.length && S.queue[0].at - LEAD <= S.t) {
      const it = S.queue.shift();
      it.x = PX + BASE_SPEED * (it.at - S.t);
      S.items.push(it);
    }
  }

  // 세포에 닿았을 때: 영양소 1 + 산소 1을 전해 주면 세포가 세포 호흡을 하고 노폐물을 혈액에 내놓는다
  function deliver(it) {
    S.stats.cellsMet++;
    const hasN = S.nut.length > 0, hasO = S.O >= 1;
    if (hasN && hasO) {
      const n = S.nut.shift(); S.O--;
      S.E = Math.min(E_MAX, S.E + GAIN); S.C = Math.min(10, S.C + 1); S.made++; it.fed = true;
      if (n === 'amino') { S.U = Math.min(10, S.U + 1); warnOnce('amino', AMINO_NOTE); }
      else warnOnce('fed', '세포에 전달! 세포가 세포 호흡으로 에너지를 얻고 이산화 탄소를 내놓았다');
    }
    else if (hasN) { S.stats.cellsNoO2++; warnOnce('o2', '산소가 없어 세포가 세포 호흡을 못 했다! 폐에서 산소를 받아 오자'); }
    else if (hasO) { S.stats.cellsNoNut++; warnOnce('nut', '영양소가 없어 세포가 에너지를 못 얻었다! 소장에서 받아 오자'); }
    else { S.stats.cellsEmpty++; warnOnce('empty', '세포에 전해 줄 산소도 영양소도 없다!'); }
  }

  function update(dt) {
    const z = zoneAt(S.t);
    S.t += dt;
    S.x += BASE_SPEED * dt;
    // 대사: 세포는 가만히 있어도 에너지를 쓴다
    S.E -= z.drain * dt;
    // 폐: 이산화 탄소 배출, 콩팥: 요소 배설. 그 구간을 지나기만 하면 저절로 줄어드는 표시용 값이다.
    // 폐를 지날 때마다 이산화 탄소가 0이 되어 많이 쌓일 수 없으므로, 노폐물이 쌓여 받는 불이익(감속 등)은 두지 않는다.
    if (z.id === 'lung' && S.C > 0) { const d = Math.min(S.C, 2.5 * dt); S.C -= d; S.stats.exhaled += d; }
    if (z.id === 'kidney' && S.U > 0) { const d = Math.min(S.U, 2 * dt); S.U -= d; S.stats.filtered += d; }
    // 점프 물리
    S.vy += 1500 * dt; S.y += S.vy * dt;
    if (S.y >= GROUND) { S.y = GROUND; S.vy = 0; S.jumps = 0; }
    if (S.hurt > 0) S.hurt -= dt;
    // 아이템
    spawn();
    for (const it of S.items) {
      it.x -= BASE_SPEED * dt;
      if (it.got) continue;
      if (it.k === 'cell' && it.x < PX - 26) { it.got = true; S.stats.cellsMet++; continue; } // 닿지 못하고 지나친 세포
      const hitY = it.k === 'wall' ? S.y > GROUND - 40 : Math.abs((S.y - 22) - it.y) < 34;
      if (Math.abs(it.x - PX) < 26 && hitY) {
        it.got = true; it.touched = true;
        if (it.k === 'wall') { if (S.hurt <= 0) { S.E -= 12; S.hurt = 0.8; S.stats.hits++; toast('쿵! 좁아진 혈관에 부딪혔다'); } }
        else if (it.k === 'cell') deliver(it);
        else if (it.k === 'glu') { if (S.nut.length < CARRY) S.nut.push('glu'); S.stats.glucose++; }
        else if (it.k === 'amino') { if (S.nut.length < CARRY) S.nut.push('amino'); S.stats.amino++; }
        else if (it.k === 'o2') { S.O = Math.min(CARRY, S.O + 1); S.stats.o2++; }
      }
    }
    S.items = S.items.filter(it => it.x > -40 && !(it.got && it.k !== 'wall' && it.k !== 'cell'));
  }

  // 구간 배경 하나를 x0~x1 사이에 그린다
  function drawZone(z, x0, x1) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, H); ctx.clip();
    ctx.fillStyle = z.bg; ctx.fillRect(x0, 0, x1 - x0, H);
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
    ctx.restore();
  }
  function drawCell(it) {
    const muscle = it.z === 'muscle';
    ctx.fillStyle = it.fed ? '#6aa84f' : it.touched ? '#9e9e9e' : muscle ? '#c0392b' : '#8e5ea2';
    ctx.beginPath();
    if (muscle) ctx.ellipse(it.x, it.y, 24, 14, 0, 0, Math.PI * 2); else ctx.arc(it.x, it.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(it.fed ? '✓' : it.touched ? '×' : '세포', it.x, it.y + 4);
  }

  function draw() {
    const z = zoneAt(S.t), v = BASE_SPEED, k = Math.floor(S.t / ZONE_LEN);
    // 구간 경계도 아이템과 같은 속도로 흘러온다: 화면 오른쪽에는 곧 들어갈 구간이 보인다
    for (let j = Math.max(0, k - 1); j <= k + 1; j++) {
      const x0 = j === 0 ? 0 : PX + v * (j * ZONE_LEN - S.t), x1 = PX + v * ((j + 1) * ZONE_LEN - S.t);
      if (x1 > 0 && x0 < W) drawZone(ZONES[j % ZONES.length], Math.max(0, x0), Math.min(W, x1));
    }
    // 혈관 바닥
    ctx.fillStyle = '#b03a2e'; ctx.fillRect(0, GROUND + 18, W, H - GROUND - 18);
    ctx.fillStyle = '#8a2a21'; for (let i = 0; i < 12; i++) ctx.fillRect(((i * 60 - S.x) % 720 + 720) % 720 - 60, GROUND + 30, 30, 6);
    // 아이템
    for (const it of S.items) {
      if (it.k === 'wall') { ctx.fillStyle = '#526477'; ctx.beginPath(); ctx.moveTo(it.x - 22, GROUND + 18); ctx.quadraticCurveTo(it.x, GROUND - 40, it.x + 22, GROUND + 18); ctx.fill(); continue; }
      if (it.k === 'cell') { drawCell(it); continue; }
      const col = { glu: '#e0a412', amino: '#8e7cc3', o2: '#3d85c6' }[it.k], lab = { glu: '포', amino: '아', o2: 'O₂' }[it.k];
      ctx.fillStyle = col;
      if (it.k === 'glu') { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; ctx.lineTo(it.x + 16 * Math.cos(a), it.y + 16 * Math.sin(a)); } ctx.fill(); }
      else if (it.k === 'o2') { ctx.beginPath(); ctx.arc(it.x, it.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(it.x - 5, it.y - 5, 4, 0, Math.PI * 2); ctx.fill(); }
      else { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(it.x + k * 11, it.y, 7, 0, Math.PI * 2); ctx.fill(); } }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lab, it.x, it.y + 4);
    }
    // 주인공: 적혈구 “혈구”(가운데가 오목한 원반)
    const px = PX, py = S.y - 22;
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
    set('e', S.E, E_MAX); set('n', S.nut.length, CARRY); set('o', S.O, CARRY); set('c', S.C, 10); set('u', S.U, 10);
    $('dist').textContent = `${Math.round(S.x / 10)} m`;
    $('time').textContent = `${Math.max(0, Math.ceil(DURATION - S.t))}초`;
    const z = zoneAt(S.t); $('zone').textContent = z.desc;
    const eq = $('eq'); const noO = S.O < 1 && S.nut.length >= 1;
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
  function start() {
    clearFeedback(); reset();
    // 이전 판의 막대 폭에서 움직이지 않고 새 판 값을 바로 그린다.
    const gauges = document.querySelector('.gauges'); gauges.classList.add('resetting');
    hud(); draw(); void gauges.offsetWidth; gauges.classList.remove('resetting');
    running = true; last = performance.now(); requestAnimationFrame(frame);
  }
  function finish() {
    running = false;
    const survived = S.E > 0 && S.t >= DURATION;
    const stars = !survived ? 0 : S.made >= STAR3 ? 3 : S.made >= STAR2 ? 2 : 1;
    const st = S.stats;
    const missed = st.cellsMet - S.made - st.cellsNoO2 - st.cellsNoNut - st.cellsEmpty;
    const notes = Object.keys(S.warned).length ? [
      S.warned.fed ? '세포가 세포 호흡으로 에너지를 얻고 이산화 탄소를 내놓는다.' : '',
      S.warned.amino ? `${AMINO_NOTE}.` : '',
    ].filter(Boolean) : [];
    clearFeedback();
    A.finish($('overlay'), {
      id: 'run', stars, score: Math.round(S.x / 10),
      detail: { survived, seconds: +S.t.toFixed(1), energyMade: S.made, ...st },
      lines: [survived ? `60초 완주! 거리 ${Math.round(S.x / 10)} m` : `${Math.round(S.t)}초에 세포의 에너지가 바닥났다.`,
        `지나간 세포 ${st.cellsMet}개 가운데 ${S.made}개에 산소와 영양소를 전해 주었다(세포 호흡 ${S.made}번).`,
        `좁아진 혈관에 부딪힘 ${st.hits}번(에너지 −12씩). 장애물은 뛰어넘자.`,
        `닿지 못한 세포 ${missed}개. 세포 높이에 맞춰 닿아 보자.`,
        `받은 것: 포도당 ${st.glucose} · 아미노산 ${st.amino} · 산소 ${st.o2}개`,
        st.cellsNoO2 ? `영양소는 있는데 산소가 없어 세포 호흡을 못 한 세포가 ${st.cellsNoO2}개. 호흡계 없이는 소화계도 소용없다!` : '',
        st.cellsNoNut ? `산소는 있는데 영양소가 없어 에너지를 못 얻은 세포가 ${st.cellsNoNut}개. 소화계 없이는 호흡계도 소용없다!` : '',
        st.cellsEmpty ? `산소와 영양소가 모두 없어 전해 주지 못한 세포 ${st.cellsEmpty}개. 소장과 폐에서 받아 오자.` : '',
        ...notes].filter(Boolean),
      quiz: { q: '세포 호흡으로 에너지를 얻는 데 반드시 필요한 두 가지 물질은?', options: ['포도당(영양소)과 산소', '포도당과 이산화 탄소'], answer: 0,
        explain: '소화계가 흡수한 영양소와 호흡계가 받아들인 산소를 순환계가 세포까지 운반해야 세포 호흡이 일어난다. 이산화 탄소는 세포 호흡의 결과로 생기는 노폐물이다.' },
      reflection: '에너지 런에서 에너지가 계속 만들어지려면 소화계, 호흡계, 순환계, 배설계가 각각 어떤 일을 해야 했나요? 네 기관계를 모두 넣어 세포 호흡과 연결해 설명하세요.',
      onRetry: start,
    });
  }
  $('stage').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  // 게임 중에만 Space·↑를 점프로 쓴다. 시작·결과 화면에서는 버튼 누르기와 서술 답의 띄어쓰기가 그대로 되게 둔다.
  window.addEventListener('keydown', e => {
    if (!running || (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]'))) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
  });

  reset(); draw(); hud();
  window.__run = { state: () => S }; // 실제 충돌·전달·놓침을 재현하는 테스트용
  A.intro($('overlay'), {
    id: 'run',
    rules: [
      '주인공은 온몸을 도는 <b>혈액</b>이다. 화면을 누르면 점프(두 번까지).',
      '<b>회색 장애물(좁아진 혈관)은 뛰어넘는다.</b> 부딪히면 세포의 에너지가 12 줄어든다(게임 장치).',
      '소장에서 <b>포도당·아미노산</b>을, 폐에서 <b>산소</b>를 받아 싣는다.',
      '근육·콩팥 구간의 <b>세포</b>에 닿으면 영양소와 산소를 하나씩 전해 준다. <b>둘 다 있어야</b> 세포가 세포 호흡으로 에너지를 얻고 <b>이산화 탄소</b>를 혈액에 내놓는다. 아미노산을 쓰면 <b>요소</b>도 생긴다.',
      '세포의 에너지는 가만히 있어도 줄어들고, 근육에서는 더 빨리 줄어든다.',
      '<b>이산화 탄소·요소</b> 막대는 혈액에 실린 노폐물의 양이다. 혈액이 폐를 지나면 이산화 탄소가 빠져나가고, 콩팥을 지나면 요소가 걸러진다. 따로 누를 것은 없다.',
      `60초를 버티면 성공. 세포 ${CELLS}개 가운데 ${STAR2}개·${STAR3}개 이상에 전해 주면 별 2·3개.`,
    ],
    onStart: start,
  });
})();
