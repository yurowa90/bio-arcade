/* 생명 탐사대 — 게임 본체 (지도·대화·조우·도감·체육관·저장) */
(function () {
  const { SPECIES, MAPS, PARTNERS, GYMS } = window.GameData;
  const B = window.Battles;
  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'bioQuest.v1';
  const TILE = 16, VW = 11, VH = 9;
  const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

  /* ---------------- 저장 ---------------- */
  const freshSave = () => ({
    v: 1, partner: null, map: 'town', x: 9, y: 5, dir: 'down',
    dex: {}, badges: {}, timeMode: 'real', records: [], student: { id: '', name: '' }, introDone: false,
  });
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* 저장 불가 환경 */ } }
  let S = freshSave();

  /* ---------------- 시간(낮·밤) ---------------- */
  function isNight() {
    if (S.timeMode === 'night') return true;
    if (S.timeMode === 'day') return false;
    const h = new Date().getHours();
    return h < 6 || h >= 19;
  }

  /* ---------------- 한국어 조사 ---------------- */
  function josa(word, pair) {
    const [a, b] = pair.split('/');
    const ch = word.replace(/[^가-힣]/g, '').slice(-1);
    if (!ch) return word + a;
    return word + (((ch.charCodeAt(0) - 0xac00) % 28) ? a : b);
  }

  /* ---------------- 상태 ---------------- */
  let mode = 'title';          // title | walk | dialog | panel | busy
  const player = { x: 9, y: 5, dir: 'down', moving: false, fromX: 9, fromY: 5, t: 0, stepsSinceEnc: 0 };
  const held = new Set();
  let frame = 0;

  const map = () => MAPS[S.map];
  const tileAt = (x, y) => { const m = map(); if (y < 0 || y >= m.rows.length || x < 0 || x >= m.rows[0].length) return 'T'; return m.rows[y][x]; };
  const npcAt = (x, y) => map().npcs.find(n => n.x === x && n.y === y);
  const WALKABLE = new Set(['.', ',', ';', 'f', 'B']);
  const DOORS = new Set(['D', 'L', 'G', 'J']);

  /* ---------------- 대화 ---------------- */
  let dlg = null; // { lines, idx, name, resolve, choices, shown, full }
  function say(name, lines, choices) {
    return new Promise(resolve => {
      const prevMode = mode;
      dlg = { lines: Array.isArray(lines) ? lines : [lines], idx: 0, name: name || '', resolve, choices: choices || null, prevMode };
      mode = 'dialog';
      $('dialog').hidden = false;
      showLine();
    });
  }
  function ask(name, text, choices) { return say(name, [text], choices); }
  let typeTimer = null;
  function showLine() {
    const text = dlg.lines[dlg.idx];
    $('dialog-name').textContent = dlg.name;
    $('dialog-choices').innerHTML = '';
    $('dialog-next').hidden = true;
    let i = 0;
    dlg.full = false;
    clearInterval(typeTimer);
    const el = $('dialog-text');
    el.textContent = '';
    typeTimer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) finishLine();
    }, 18);
  }
  function finishLine() {
    clearInterval(typeTimer);
    $('dialog-text').textContent = dlg.lines[dlg.idx];
    dlg.full = true;
    const last = dlg.idx === dlg.lines.length - 1;
    if (last && dlg.choices) {
      const box = $('dialog-choices');
      dlg.choices.forEach(c => {
        const b = document.createElement('button');
        b.className = 'btn'; b.textContent = c.label;
        b.addEventListener('click', e => { e.stopPropagation(); closeDialog(c.value); });
        box.appendChild(b);
      });
      box.querySelector('button').focus();
    } else {
      $('dialog-next').hidden = false;
    }
  }
  function advanceDialog() {
    if (!dlg) return;
    if (!dlg.full) { finishLine(); return; }
    if (dlg.idx === dlg.lines.length - 1 && dlg.choices) { // 선택지를 골라야 함: 포커스만 첫 선택지로 옮긴다
      const first = $('dialog-choices').querySelector('button');
      if (first && !$('dialog-choices').contains(document.activeElement)) first.focus();
      return;
    }
    if (dlg.idx < dlg.lines.length - 1) { dlg.idx++; showLine(); return; }
    closeDialog(undefined);
  }
  function closeDialog(value) {
    clearInterval(typeTimer);
    $('dialog').hidden = true;
    const d = dlg; dlg = null;
    mode = d.prevMode === 'dialog' ? 'walk' : d.prevMode;
    d.resolve(value);
  }

  /* ---------------- 패널(도감·조우·대결·메뉴) ---------------- */
  let panelOnClose = null;
  function openPanel(title, closable, onClose) {
    $('panel-title').textContent = title;
    $('panel-close').hidden = !closable;
    $('panel').hidden = false;
    panelOnClose = onClose || null;
    mode = 'panel';
    $('panel-body').scrollTop = 0;
    return $('panel-body');
  }
  function closePanel() {
    $('panel').hidden = true;
    mode = 'walk';
    const f = panelOnClose; panelOnClose = null;
    if (f) f();
  }

  /* ---------------- 지도 그리기 ---------------- */
  const cv = $('map'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const PAL = {
    grass: '#9ccf7f', grassDot: '#8bc070', path: '#e8d7a4', pathDot: '#d6c28a',
    canopy: '#2f6b3f', canopyHi: '#3f8a51', trunk: '#6b4a2b',
    tall: '#5aa65a', blade: '#2f7d3a', wet: '#7fbf9a', wetBlade: '#2e7d6b',
    water: '#4f9bd1', wave: '#8ec8ef', plank: '#b08a5a', plankLine: '#7d5d35',
    roof: '#c0563f', roofLine: '#8e3b2b', wall: '#efe3c8', window: '#6fa8c9', door: '#5a3b2a',
    signPost: '#8a6a44', signBoard: '#d9b87c',
  };
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function drawTile(ch, px, py) {
    // 바탕
    const bg = ch === '.' || ch === 'D' || ch === 'L' || ch === 'G' || ch === 'J' ? PAL.path : PAL.grass;
    rect(px, py, TILE, TILE, bg);
    switch (ch) {
      case '.':
        rect(px + 3, py + 4, 1, 1, PAL.pathDot); rect(px + 11, py + 10, 1, 1, PAL.pathDot); break;
      case 'T':
        rect(px + 7, py + 11, 2, 5, PAL.trunk);
        ctx.fillStyle = PAL.canopy; ctx.beginPath(); ctx.arc(px + 8, py + 7, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = PAL.canopyHi; ctx.beginPath(); ctx.arc(px + 6, py + 5, 3, 0, Math.PI * 2); ctx.fill(); break;
      case ',':
        rect(px, py, TILE, TILE, PAL.tall);
        for (let i = 0; i < 4; i++) { const bx = px + 2 + i * 4, by = py + 4 + (i % 2) * 6; rect(bx, by, 1, 4, PAL.blade); rect(bx + 1, by - 1, 1, 3, PAL.blade); }
        break;
      case ';':
        rect(px, py, TILE, TILE, PAL.wet);
        for (let i = 0; i < 4; i++) { const bx = px + 2 + i * 4, by = py + 3 + (i % 2) * 6; rect(bx, by, 1, 5, PAL.wetBlade); }
        rect(px + 5, py + 13, 3, 1, PAL.wave); break;
      case '~':
        rect(px, py, TILE, TILE, PAL.water);
        { const o = (frame >> 5) % 2 ? 2 : 0; rect(px + 2 + o, py + 5, 5, 1, PAL.wave); rect(px + 8 - o, py + 11, 5, 1, PAL.wave); }
        break;
      case 'B':
        rect(px, py, TILE, TILE, PAL.plank);
        for (let i = 0; i < 4; i++) rect(px + i * 4, py, 1, TILE, PAL.plankLine); break;
      case 'f':
        rect(px + 3, py + 4, 2, 2, '#f2c14e'); rect(px + 10, py + 9, 2, 2, '#e8757f'); rect(px + 6, py + 12, 2, 2, '#ffffff'); break;
      case 'R':
        rect(px, py, TILE, TILE, PAL.roof); rect(px, py + 5, TILE, 1, PAL.roofLine); rect(px, py + 11, TILE, 1, PAL.roofLine); break;
      case 'H':
        rect(px, py, TILE, TILE, PAL.wall); rect(px + 4, py + 4, 8, 6, PAL.window); rect(px + 7, py + 4, 1, 6, PAL.wall); break;
      case 'D': case 'L': case 'G': case 'J': {
        rect(px, py, TILE, TILE, PAL.wall);
        rect(px + 3, py + 3, 10, 13, PAL.door);
        const accent = { D: '#c9a25b', L: '#3d7fc9', G: '#3f9d56', J: '#e0833a' }[ch];
        rect(px + 3, py + 1, 10, 2, accent);
        if (ch === 'G') { ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(px + 8, py + 9, 3, 5, 0.5, 0, Math.PI * 2); ctx.fill(); }
        if (ch === 'J') { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(px + 8, py + 9, 3, 0, Math.PI * 2); ctx.fill(); }
        if (ch === 'L') { rect(px + 6, py + 7, 4, 1, accent); rect(px + 7, py + 6, 2, 3, accent); }
        break;
      }
      case 'S':
        rect(px + 7, py + 8, 2, 8, PAL.signPost); rect(px + 2, py + 3, 12, 7, PAL.signBoard); rect(px + 4, py + 5, 8, 1, PAL.signPost); rect(px + 4, py + 7, 6, 1, PAL.signPost); break;
      default:
        rect(px + 4, py + 6, 1, 1, PAL.grassDot); rect(px + 12, py + 12, 1, 1, PAL.grassDot);
    }
  }
  function drawPerson(px, py, dir, body, cap, bob) {
    const y = py + (bob ? -1 : 0);
    rect(px + 4, y + 8, 8, 6, body);                  // 몸
    rect(px + 4, y + 14, 3, 2, '#3a3a3a'); rect(px + 9, y + 14, 3, 2, '#3a3a3a'); // 발
    rect(px + 4, y + 2, 8, 7, '#f1c79b');             // 얼굴
    rect(px + 3, y + 1, 10, 3, cap);                  // 모자/머리
    ctx.fillStyle = '#222';
    if (dir === 'down') { rect(px + 6, y + 5, 1, 2, '#222'); rect(px + 9, y + 5, 1, 2, '#222'); }
    if (dir === 'left') rect(px + 5, y + 5, 1, 2, '#222');
    if (dir === 'right') rect(px + 10, y + 5, 1, 2, '#222');
    if (dir === 'up') rect(px + 3, y + 3, 10, 3, cap);
  }
  function render() {
    frame++;
    const m = map();
    const W = m.rows[0].length, H = m.rows.length;
    // 플레이어의 픽셀 위치(이동 보간)
    const k = player.moving ? player.t : 1;
    const ppx = (player.fromX + (player.x - player.fromX) * k) * TILE;
    const ppy = (player.fromY + (player.y - player.fromY) * k) * TILE;
    let camX = ppx - ((VW - 1) / 2) * TILE, camY = ppy - ((VH - 1) / 2) * TILE;
    camX = Math.max(0, Math.min(camX, W * TILE - VW * TILE));
    camY = Math.max(0, Math.min(camY, H * TILE - VH * TILE));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
    for (let ty = y0; ty <= y0 + VH; ty++) {
      for (let tx = x0; tx <= x0 + VW; tx++) {
        if (ty < 0 || ty >= H || tx < 0 || tx >= W) continue;
        drawTile(m.rows[ty][tx], Math.round(tx * TILE - camX), Math.round(ty * TILE - camY));
      }
    }
    for (const n of m.npcs) drawPerson(Math.round(n.x * TILE - camX), Math.round(n.y * TILE - camY), 'down', n.color, '#3b3027', false);
    const partner = PARTNERS.find(p => p.id === S.partner);
    drawPerson(Math.round(ppx - camX), Math.round(ppy - camY), player.dir, '#3b5b8c', partner ? partner.color : '#c0563f', player.moving && player.t < 0.5);
    if (isNight()) { ctx.fillStyle = 'rgba(18, 26, 70, 0.45)'; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  let hudNight = null; // HUD에 표시한 낮·밤(실제 시계 모드에서 시간대가 바뀌면 다시 그린다)
  function updateHUD() {
    if (mode === 'title') { $('hud-place').textContent = ''; $('hud-time').textContent = ''; return; }
    hudNight = isNight();
    $('hud-place').textContent = map().name;
    $('hud-time').textContent = hudNight ? '☾ 밤' : '☀ 낮';
  }

  /* ---------------- 이동 ---------------- */
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const STEP_MS = 150;
  let lastT = performance.now();
  function loop(now) {
    const dt = now - lastT; lastT = now;
    if (mode === 'walk') {
      if (player.moving) {
        player.t += dt / STEP_MS;
        if (player.t >= 1) { player.moving = false; player.t = 1; onArrive(); }
      }
      if (!player.moving && mode === 'walk') {
        const d = [...held].pop();
        if (d) tryMove(d);
      }
    }
    render();
    // 같은 지도에 머무는 동안 19시·6시를 지나면 HUD 낮·밤 표시도 바꾼다(약 0.5초마다 확인)
    if (mode !== 'title' && frame % 30 === 0 && isNight() !== hudNight) updateHUD();
    requestAnimationFrame(loop);
  }
  function tryMove(d) {
    player.dir = d;
    const [dx, dy] = DIRS[d];
    const nx = player.x + dx, ny = player.y + dy;
    const ch = tileAt(nx, ny);
    if (DOORS.has(ch)) { held.clear(); enterDoor(ch, nx, ny); return; }
    if (!WALKABLE.has(ch) || npcAt(nx, ny)) return;
    player.fromX = player.x; player.fromY = player.y;
    player.x = nx; player.y = ny; player.t = 0; player.moving = true;
  }
  function onArrive() {
    S.x = player.x; S.y = player.y; S.dir = player.dir;
    const ex = map().exits.find(e => e.x === player.x && e.y === player.y);
    if (ex) { warp(ex.to, ex.tx, ex.ty); return; }
    const ch = tileAt(player.x, player.y);
    if (ch === ',' || ch === ';') {
      player.stepsSinceEnc++;
      if (player.stepsSinceEnc >= 3 && Math.random() < 0.16) {
        player.stepsSinceEnc = 0; held.clear();
        encounter(ch === ',' ? 'forest' : 'wetland');
      }
    }
  }
  function warp(to, x, y) {
    S.map = to; player.x = player.fromX = x; player.y = player.fromY = y; player.moving = false;
    S.x = x; S.y = y;
    updateHUD(); writeSave();
  }
  function facing() { const [dx, dy] = DIRS[player.dir]; return [player.x + dx, player.y + dy]; }

  /* ---------------- 상호작용 ---------------- */
  async function interact() {
    const [fx, fy] = facing();
    const ch = tileAt(fx, fy);
    const n = npcAt(fx, fy);
    if (n) { await say('', n.lines); return; }
    const sign = map().signs[`${fx},${fy}`];
    if (ch === 'S' && sign) { await say('표지판', sign); return; }
    if (DOORS.has(ch)) enterDoor(ch, fx, fy);
  }

  const doneList = () => SPECIES.filter(s => S.dex[s.id] && S.dex[s.id].done);
  async function enterDoor(ch) {
    if (ch === 'D') {
      await say('', ['집에 들어가 푹 쉬었다.', '탐사 기록을 저장했다.']);
      writeSave();
    } else if (ch === 'L') {
      const done = doneList(), n = done.length;
      const hasProducer = done.some(s => s.role === '생산자');
      await say('한결 박사', [
        `도감은 잘 채우고 있니? 지금 관찰을 마친 생물은 ${n}종이구나.`,
        n < 4 ? '광합성 체육관에 가려면 생물 4종 이상, 그중 생산자 1종 이상을 관찰해야 해.'
          : !hasProducer ? '종 수는 충분하지만 아직 생산자가 없구나. 스스로 양분을 만드는 생물도 관찰해 와야 광합성 체육관에 들어갈 수 있어.'
          : '좋아! 잎새마을 광합성 체육관에 도전해 보렴.',
        '낮과 밤에 만나는 생물이 달라. 메뉴의 “시간 설정”에서 탐사 시간을 바꿀 수도 있단다.',
      ]);
    } else if (ch === 'G') {
      gymPhoto();
    } else if (ch === 'J') {
      gymDigest();
    }
  }

  /* ---------------- 조우와 관찰 ---------------- */
  function pickSpecies(habitat) {
    const night = isNight();
    const pool = SPECIES.filter(s => s.habitat === habitat && (s.time === 'both' || (night ? s.time === 'night' : s.time === 'day')));
    const weighted = pool.flatMap(s => (S.dex[s.id] && S.dex[s.id].done ? [s] : [s, s]));
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  function badgeHTML(sp, big, unknown) {
    return `<div class="badge${big ? ' big' : ''}" style="background:${unknown ? '#ddd6c3' : sp.color}">${unknown ? '?' : sp.name[0]}</div>`;
  }
  const ROLE_DESC = { 생산자: '빛에너지로 스스로 양분을 만든다', 소비자: '다른 생물을 먹어 양분을 얻는다', 분해자: '죽은 생물이나 배설물을 분해해 양분을 얻는다' };
  function observationQuestion(sp) {
    if (sp.kind === '식물') return { q: `${josa(sp.name, '은/는')} 양분을 어떻게 얻을까?`, key: 'role', options: ['생산자', '소비자', '분해자'].map(r => ({ v: r, label: `${r} — ${ROLE_DESC[r]}` })), answer: sp.role };
    if (sp.kind === '균류') return { q: `${josa(sp.name, '은/는')} 어느 무리일까? (힌트: 엽록체가 있는지 살펴보자)`, key: 'kind', options: ['식물', '균류', '동물'].map(k => ({ v: k, label: k })), answer: sp.kind };
    const vert = sp.cls.startsWith('척추');
    return { q: `${josa(sp.name, '은/는')} 등뼈(척추)가 있을까?`, key: 'vert', options: [{ v: 'yes', label: '척추동물 — 등뼈가 있다' }, { v: 'no', label: '무척추동물 — 등뼈가 없다' }], answer: vert ? 'yes' : 'no' };
  }
  function speciesCardHTML(sp, full) {
    const t = sp.time === 'night' ? '☾ 밤' : sp.time === 'day' ? '☀ 낮' : '☀☾ 낮·밤';
    // 관찰을 마치기 전에는 무리·분류·역할 칩을 숨긴다. 관찰 질문의 답이 화면에 그대로 보이지 않게 한다.
    const meta = full
      ? `<span class="chip">${sp.kind}</span> <span class="chip">${sp.cls}</span> <span class="chip ok">${sp.role}</span> <span class="chip">${t}</span>`
      : `<span class="chip">${sp.habitat === 'forest' ? '숲' : '습지'}</span> <span class="chip">${t}</span>`;
    return `<div class="species-card">${badgeHTML(sp, true)}<h3>${sp.name}</h3>
      <div class="meta">${meta}</div>
      ${full ? `<p>${sp.fact}</p>` : '<p class="muted">관찰을 마치면 자세한 정보가 기록됩니다.</p>'}</div>`;
  }
  function partnerLine(sp) {
    const p = PARTNERS.find(x => x.id === S.partner);
    if (!p) return '';
    const L = {
      leafy: sp.role === '생산자' ? '이 친구도 나처럼 엽록체로 광합성을 해!' : '이 친구는 광합성을 못 해. 다른 생물에게서 양분을 얻어야 해.',
      mito: sp.role === '분해자' ? '분해자도 양분을 분해해서 에너지를 얻어. 세포 호흡은 모든 생물이 해!' : '살아 있는 생물은 모두 세포 호흡으로 에너지를 얻어.',
      spore: sp.role === '분해자' ? '나랑 같은 균류야! 죽은 나무를 흙으로 돌려보내지.' : '이 친구가 죽으면 결국 분해자가 흙으로 돌려보낼 거야.',
    }[p.id];
    return `<p class="feedback"><b>${p.name}</b>: ${L}</p>`;
  }
  function encounter(habitat) {
    const sp = pickSpecies(habitat);
    if (!sp) return;
    const rec = S.dex[sp.id] || (S.dex[sp.id] = { seen: 0, done: false, first: new Date().toISOString(), atNight: isNight() });
    rec.seen++;
    writeSave();
    const body = openPanel(habitat === 'forest' ? '숲 풀숲 조우!' : '습지 풀숲 조우!', false);
    if (rec.done) {
      body.innerHTML = `<p>${josa(sp.name, '을/를')} 다시 만났다! (${rec.seen}번째)</p>${speciesCardHTML(sp, true)}${partnerLine(sp)}
        <div class="row-btns"><button class="btn primary" id="enc-ok">계속 탐사</button></div>`;
      $('enc-ok').onclick = closePanel; $('enc-ok').focus();
      return;
    }
    const Q = observationQuestion(sp);
    body.innerHTML = `<p>풀숲에서 무언가가 움직인다… <b>${josa(sp.name, '이/가')}</b> 나타났다!</p>
      ${speciesCardHTML(sp, false)}
      <p><b>관찰하기</b> — ${Q.q}</p>
      <div class="choice-list">${Q.options.map(o => `<button class="btn" data-v="${o.v}">${o.label}</button>`).join('')}</div>
      <div class="row-btns"><button class="btn small" id="enc-run">관찰 그만두기</button></div>`;
    $('enc-run').onclick = closePanel;
    body.querySelectorAll('.choice-list .btn').forEach(b => b.addEventListener('click', () => {
      const ok = b.dataset.v === Q.answer;
      const correctLabel = Q.options.find(o => o.v === Q.answer).label;
      if (ok) rec.done = true;
      rec.tries = (rec.tries || 0) + 1;
      if (!ok) rec.wrong = (rec.wrong || 0) + 1;
      writeSave();
      body.innerHTML = `${ok ? `<p class="feedback ok">관찰 성공! <b>${josa(sp.name, '이/가')}</b> 도감에 등록되었다.</p>` : `<p class="feedback bad">아쉽다! 정답은 “${correctLabel}”. 다음에 다시 만나면 관찰을 완성할 수 있다.</p>`}
        ${speciesCardHTML(sp, true)}${partnerLine(sp)}
        <div class="row-btns"><button class="btn primary" id="enc-ok">계속 탐사</button></div>`;
      $('enc-ok').onclick = closePanel; $('enc-ok').focus();
    }));
  }

  /* ---------------- 도감 ---------------- */
  function openDex() {
    const body = openPanel('초록섬 도감', true);
    const done = doneList();
    const seen = SPECIES.filter(s => S.dex[s.id]);
    const cnt = r => done.filter(s => s.role === r).length;
    body.innerHTML = `<div class="dex-summary"><span class="chip ok">관찰 완료 ${done.length}/${SPECIES.length}</span><span class="chip">발견 ${seen.length}</span>
      <span class="chip">생산자 ${cnt('생산자')}</span><span class="chip">소비자 ${cnt('소비자')}</span><span class="chip">분해자 ${cnt('분해자')}</span></div>
      <div class="dex-grid">${SPECIES.map(s => {
        const r = S.dex[s.id];
        const cls = !r ? 'unknown' : r.done ? 'done' : 'seen';
        return `<button class="dex-cell ${cls}" data-id="${s.id}">${badgeHTML(s, false, !r)}${r ? s.name : '???'}<br><span class="muted">${s.habitat === 'forest' ? '숲' : '습지'} · ${s.time === 'night' ? '밤' : s.time === 'day' ? '낮' : '낮·밤'}</span></button>`;
      }).join('')}</div>
      <p class="muted">회색 칸은 아직 만나지 못한 생물이다. 서식지와 활동 시간이 힌트다.</p>`;
    body.querySelectorAll('.dex-cell').forEach(c => c.addEventListener('click', () => {
      const sp = SPECIES_BY_ID[c.dataset.id], r = S.dex[sp.id];
      if (!r) return;
      body.innerHTML = speciesCardHTML(sp, r.done) + `<p class="muted">만난 횟수: ${r.seen}</p><div class="row-btns"><button class="btn" id="dex-back">도감 목록</button></div>`;
      $('dex-back').onclick = openDex;
    }));
  }

  /* ---------------- 메뉴 ---------------- */
  function openMenu() {
    const body = openPanel('메뉴', true);
    const p = PARTNERS.find(x => x.id === S.partner);
    body.innerHTML = `<div class="choice-list">
      <button class="btn" id="m-dex">도감</button>
      <button class="btn" id="m-gym">체육관·배지</button>
      <button class="btn" id="m-time">시간 설정 (지금: ${{ real: '실제 시계', day: '항상 낮', night: '항상 밤' }[S.timeMode]})</button>
      <button class="btn" id="m-rec">기록 보기·제출</button>
      <button class="btn" id="m-save">저장하기</button>
      <button class="btn small" id="m-title">처음 화면</button>
      <button class="btn small" id="m-hub">← 오락실로</button></div>
      ${p ? `<p class="muted">파트너: <b style="color:${p.color}">${p.name}</b> — ${p.desc}</p>` : ''}`;
    $('m-dex').onclick = openDex;
    $('m-gym').onclick = openGyms;
    $('m-time').onclick = () => { S.timeMode = { real: 'day', day: 'night', night: 'real' }[S.timeMode]; writeSave(); updateHUD(); openMenu(); };
    $('m-rec').onclick = openRecords;
    $('m-save').onclick = () => { writeSave(); $('m-save').textContent = '저장했습니다 ✓'; };
    $('m-title').onclick = () => { writeSave(); location.reload(); };
    $('m-hub').onclick = () => { writeSave(); location.href = '../../index.html'; };
  }
  function starsHTML(n) { let h = ''; for (let i = 0; i < 3; i++) h += i < n ? '★' : '<span class="off">★</span>'; return `<span class="stars">${h}</span>`; }
  function openGyms() {
    const body = openPanel('체육관 = 교과 단원', true);
    body.innerHTML = `<ol class="roadmap">${GYMS.map(g => {
      const st = S.badges[g.id];
      return `<li><b>${g.name}</b> <span class="muted">${g.unit}</span><br>${g.ready ? (st ? `${g.badge} ${starsHTML(st)}` : '<span class="muted">도전 전</span>') : '<span class="chip warn">준비 중</span>'}</li>`;
    }).join('')}</ol><p class="muted">체육관 대결의 규칙이 곧 그 단원의 개념입니다.</p>`;
  }
  function recordSummary() {
    const done = doneList();
    const lines = [`[생명 탐사대] ${S.student.id || ''} ${S.student.name || ''}`.trim(),
      `도감: 관찰 완료 ${done.length}/${SPECIES.length} (생산자 ${done.filter(s => s.role === '생산자').length}, 소비자 ${done.filter(s => s.role === '소비자').length}, 분해자 ${done.filter(s => s.role === '분해자').length})`];
    const wrong = Object.entries(S.dex).filter(([, r]) => r.wrong).map(([id, r]) => `${SPECIES_BY_ID[id].name}(${r.wrong})`);
    if (wrong.length) lines.push('관찰 오답: ' + wrong.join(', '));
    GYMS.filter(g => g.ready).forEach(g => { if (S.badges[g.id]) lines.push(`${g.name}: ★${S.badges[g.id]}`); });
    S.records.forEach(r => { if (r.reflection) lines.push(`[${r.gym === 'photo' ? '광합성' : '소화'} 성찰] ${r.reflection}`); });
    return lines.join('\n');
  }
  function openRecords() {
    const body = openPanel('기록 보기·제출', true);
    body.innerHTML = `<p class="muted">선생님께 제출할 때 학번과 이름을 적으세요. 이 기기에만 저장됩니다.</p>
      <div class="row-btns"><input id="r-id" class="btn" style="font-weight:400" placeholder="학번" value="${S.student.id || ''}" maxlength="12"><input id="r-name" class="btn" style="font-weight:400" placeholder="이름" value="${S.student.name || ''}" maxlength="20"></div>
      <textarea id="r-text" readonly>${recordSummary()}</textarea>
      <div class="row-btns"><button class="btn primary" id="r-copy">요약 복사</button><button class="btn" id="r-json">JSON 저장</button></div>
      <p id="r-msg" class="muted"></p>`;
    const sync = () => { S.student = { id: $('r-id').value.trim(), name: $('r-name').value.trim() }; writeSave(); $('r-text').value = recordSummary(); };
    $('r-id').oninput = sync; $('r-name').oninput = sync;
    $('r-copy').onclick = async () => { try { await navigator.clipboard.writeText(recordSummary()); $('r-msg').textContent = '복사했습니다. 과제 제출란에 붙여 넣으세요.'; } catch { $('r-msg').textContent = '복사 권한이 없습니다. 위 글상자를 길게 눌러 복사하세요.'; } };
    $('r-json').onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'bio-quest', exportedAt: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `생명탐사대_${S.student.id || 'noid'}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }

  /* ---------------- 1 체육관: 광합성 ---------------- */
  async function gymPhoto() {
    const done = doneList();
    const hasProducer = done.some(s => s.role === '생산자');
    if (done.length < 4 || !hasProducer) {
      await say('관장 초록', ['광합성 체육관에 온 걸 환영해.', `하지만 아직 이르구나. 생물 4종 이상, 그중 생산자 1종 이상을 관찰해 오렴. (지금 ${done.length}종${hasProducer ? '' : ', 생산자 없음'})`]);
      return;
    }
    await say('관장 초록', [
      '나는 광합성 체육관 관장 초록. 식물은 빛에너지를 이용해 물과 이산화 탄소로 녹말을 만들지.',
      '규칙은 하나야. 광합성량은 빛·물·이산화 탄소 세 요인 가운데 “가장 모자란 요인”이 정해. 이것을 제한 요인이라고 해.',
      '그리고 식물은 밤낮없이 호흡을 해서 매 턴 녹말 1을 쓰지.',
      '기공은 언제든 열고 닫을 수 있어. 턴을 쓰지 않지. 매 턴에는 행동을 하나 고르렴.',
      '10턴 뒤 녹말 6 이상을 모으면 네 승리야. 내 날씨 기술을 버텨 봐!',
    ]);
    let st = B.photoInit();
    const hints = {
      leafy: { 1: '기공을 열어야 이산화 탄소가 들어와! 지금은 닫혀 있어.', 5: '가뭄이 오면 뿌리가 물을 흡수하지 못해. 물이 제한 요인이 되지 않게 조심해!', 7: '밤에는 빛이 0이야. 기공을 열어 두면 물만 빠져나가!' },
      mito: { 1: '광합성으로 만든 녹말 중 일부는 호흡으로 쓰여. 그래서 매 턴 −1이야.', 7: '밤에도 호흡은 계속돼. 녹말이 줄어드는 건 그 때문이야.' },
      spore: { 1: '빛·이산화 탄소·물 세 요인 막대 중 가장 짧은 게 속도를 정해. 그걸 늘리는 행동을 골라!', 9: '마른바람이야! 기공이 열려 있으면 물이 두 배로 빠져.' },
    }[S.partner] || {};
    const partner = PARTNERS.find(p => p.id === S.partner);
    const logs = [];
    let loggedTurn = 0;
    const body = openPanel('광합성 체육관 · 관장 초록', false);
    const NAME = { cloud: '먹구름', drought: '가뭄', night: '밤', wind: '마른바람' };
    // text를 주면 오른쪽 숫자 대신 쓴다. 막대 너비만 max에서 자른다(숫자는 실제 값).
    function meter(label, v, max, limit, goal, text) {
      return `<div class="meter${limit ? ' limit' : ''}"><div class="meter-label"><span>${label}${limit ? ' ← 제한 요인' : ''}</span><span>${text != null ? text : `${v}/${max}`}</span></div>
        <div class="meter-bar"><i style="width:${(Math.min(v, max) / max) * 100}%"></i>${(goal || []).map(g => `<span class="goal" style="left:${(g / max) * 100}%"></span>`).join('')}</div></div>`;
    }
    function draw() {
      const L = st.last;
      const lim = L ? L.limiting : [];
      const upcoming = B.PHOTO.script[st.turn];
      const F = B.PHOTO.maxFactor;
      body.innerHTML = `<div class="battle-top"><span class="chip">턴 ${Math.min(st.turn, 10)}/10</span>
        <span class="chip ${st.stomata ? 'ok' : 'warn'}">기공 ${st.stomata ? '열림' : '닫힘'}</span>
        <span class="chip">물 저장량 ${st.water}/5</span>
        ${Object.keys(st.fx).map(k => `<span class="chip enemy">${NAME[k]} ${st.fx[k]}턴</span>`).join('')}
        ${upcoming && !st.done ? `<span class="chip enemy">다음 턴: 관장이 ${upcoming.name}!</span>` : ''}</div>
        <p class="muted">광합성량 = min(빛, 이산화 탄소, 물) · 녹말 변화 = 광합성량 − 1(호흡)<br>막대: 지난 턴 계산에 쓴 세 요인의 값(모두 0~${F}). 물은 저장량 가운데 한 턴에 최대 ${F}까지 쓴다.</p>
        ${meter('빛', L ? L.light : 0, F, lim.includes('light'))}
        ${meter('이산화 탄소', L ? L.co2 : 0, F, lim.includes('co2'))}
        ${meter('물', L ? L.water : 0, F, lim.includes('water'))}
        ${L && !lim.length ? `<p class="muted">지난 턴은 세 요인이 모두 충분해 광합성량이 최대(${F})였다.</p>` : ''}
        ${meter('녹말', st.starch, 14, false, B.PHOTO.stars, `${st.starch} (승리 ${B.PHOTO.goal} · 별 3개 ${B.PHOTO.stars[2]})`)}
        ${st.done ? '' : `<div class="actions"><button class="btn" data-a="${B.PHOTO.toggle.id}" aria-pressed="${st.stomata}">기공 ${st.stomata ? '닫기' : '열기'} (턴 안 씀)</button>${B.PHOTO.actions.map(a => `<button class="btn" data-a="${a.id}">${a.label}</button>`).join('')}</div>`}
        <ul class="blog">${logs.slice(-8).reverse().map(l => `<li class="${l.t}">${l.text}</li>`).join('')}</ul>`;
      body.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const turn = st.turn;
        if (loggedTurn !== turn) { logs.push({ t: '', text: `— ${turn}턴 —` }); loggedTurn = turn; }
        st = B.photoStep(st, b.dataset.a);
        st.lastLog.forEach(l => logs.push({ t: l.t === 'me' ? '' : l.t, text: l.text }));
        const h = st.turn !== turn && hints[st.turn]; // 기공 전환은 턴을 쓰지 않으므로 힌트도 턴이 넘어갈 때만
        if (h && partner && !st.done) logs.push({ t: 'hint', text: `${partner.name}: ${h}` });
        if (st.done) finish(); else draw();
      }));
    }
    if (hints[1] && partner) logs.push({ t: 'hint', text: `${partner.name}: ${hints[1]}` });
    draw();
    function finish() {
      draw();
      const stars = st.stars || 0;
      const nightTurn = st.history.find(h => h.night);
      const closedAtNight = !!nightTurn && !nightTurn.stomata; // 밤 턴 계산 때 기공이 실제로 닫혀 있었는가
      const top = B.PHOTO.stars[2];
      const msg = !st.win ? `녹말이 ${B.PHOTO.goal}에 못 미쳤다. 매 턴 가장 짧은 막대(제한 요인)를 늘리는 행동을 골라 보자.`
        : stars === 3 ? (closedAtNight ? '완벽해! 밤에 기공을 닫아 물을 아낀 식물의 지혜를 찾아냈구나.' : `녹말 ${top} 이상을 모았구나! 밤에 기공을 어떻게 했는지도 돌아보자.`)
        : closedAtNight ? `밤에 기공을 닫은 건 잘했어! 녹말 ${top}에 도전하려면 어느 턴에 무엇이 제한 요인이었는지 살펴봐.`
        : `좋아! 녹말 ${top}에 도전하려면 밤에 기공을 어떻게 해야 할지 생각해 봐.`;
      const box = document.createElement('div');
      box.innerHTML = `<div class="feedback ${st.win ? 'ok' : 'bad'}"><b>${st.win ? '승리!' : '패배…'}</b> 녹말 ${st.starch} ${starsHTML(stars)}
        <p>${msg}</p></div>
        <p><b>설명해 보기</b> — 이번 대결에서 녹말 생산을 가장 크게 막은 제한 요인은 무엇이었나요? 밤에 기공을 닫는 것이 식물에게 유리한 까닭도 함께 쓰세요.</p>
        <textarea id="refl" placeholder="두세 문장으로 써 보세요."></textarea>
        <div class="row-btns"><button class="btn primary" id="p-done">${st.win ? '배지 받기' : '저장하고 나가기'}</button><button class="btn" id="p-retry">다시 도전</button></div>`;
      body.prepend(box);
      body.scrollTop = 0;
      const save = () => {
        S.records.push({ gym: 'photo', at: new Date().toISOString(), win: st.win, stars, starch: st.starch, history: st.history, reflection: $('refl').value.trim() });
        if (st.win) S.badges.photo = Math.max(S.badges.photo || 0, stars);
        writeSave();
      };
      $('p-retry').onclick = () => { save(); closePanel(); gymPhoto(); };
      $('p-done').onclick = async () => {
        save(); closePanel();
        if (st.win) await say('관장 초록', ['훌륭해! 새잎 배지를 줄게.', '기억해. 광합성 속도는 가장 모자란 요인이 정해. 그리고 식물도 늘 호흡을 한단다.', '다음은 습지길 동쪽의 소화 체육관이야.']);
      };
    }
  }

  /* ---------------- 2 체육관: 소화 ---------------- */
  async function gymDigest() {
    if (!S.badges.photo) { await say('관장 모아', ['소화 체육관이다.', '광합성 체육관의 새잎 배지를 가져오면 상대해 주지.']); return; }
    await say('관장 모아', [
      '나는 소화 체육관 관장 모아! 오늘의 식단은 밥(녹말)·불고기(단백질)·버터(지방)다.',
      '음식은 입 → 위 → 소장을 차례로 지나간다. 장소마다 쓸 수 있는 소화액이 달라.',
      '소화 효소는 정해진 영양소에만 작용한다. 맞지 않으면 효과 없음!',
      '모든 영양소를 흡수할 수 있는 크기까지 분해하고, 알맞은 흡수 통로로 보내라!',
    ]);
    let st = B.digestInit();
    const logs = [];
    const body = openPanel('소화 체육관 · 관장 모아', false);
    const C = B.DIGEST.chains;
    const FOOD = { starch: '밥', protein: '불고기', fat: '버터' };
    function draw() {
      if (st.phase === 'absorb') return drawAbsorb();
      const place = B.DIGEST.places[st.placeIdx];
      const moves = Object.entries(B.DIGEST.moves).filter(([, m]) => m.place.includes(place.id));
      body.innerHTML = `<div class="tract">${B.DIGEST.places.map((p, i) => `<span class="${i === st.placeIdx ? 'on' : i < st.placeIdx ? 'past' : ''}">${p.name}</span>`).join('')}</div>
        <div class="battle-top"><span class="chip">${place.name}: 남은 기회 ${place.turns - st.turnInPlace}</span><span class="chip ${st.wrong ? 'warn' : ''}">효과 없음 ${st.wrong}</span></div>
        <div class="foods">${['starch', 'protein', 'fat'].map(k => {
          const stage = st.food[k];
          const label = k === 'fat' && stage === 0 && st.fatHP < 2 ? '지방(겉만 분해됨)' : C[k][stage];
          return `<div class="food ${stage === 2 ? 'final' : ''}"><span class="muted">${FOOD[k]}</span><b>${label}</b>${stage === 2 ? '<span class="chip ok">흡수 가능</span>' : ''}</div>`;
        }).join('')}</div>
        <div class="actions">${moves.map(([id, m]) => `<button class="btn" data-m="${id}" title="${m.desc}">${m.name}</button>`).join('')}</div>
        <ul class="blog">${logs.slice(-8).reverse().map(l => `<li class="${l.t}">${l.text}</li>`).join('')}</ul>`;
      body.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
        st = B.digestStep(st, b.dataset.m);
        st.lastLog.forEach(l => logs.push({ t: l.t === 'me' || l.t === 'info' ? '' : l.t, text: l.text }));
        if (st.phase === 'fail') finish(null); else draw();
      }));
    }
    function drawAbsorb() {
      const choice = {};
      const NUT = { starch: '포도당', protein: '아미노산', fat: '지방산 + 모노글리세리드' };
      body.innerHTML = `<div class="tract">${B.DIGEST.places.map(p => `<span class="past">${p.name}</span>`).join('')}</div>
        <p><b>흡수</b> — 소장 안쪽 벽의 주름에는 융털이 빽빽하다. 융털 속에는 모세 혈관과 암죽관이 있다. 각 영양소를 알맞은 통로로 보내라!</p>
        ${Object.entries(NUT).map(([k, n]) => `<div class="absorb-row"><b>${n}</b><button class="btn" data-k="${k}" data-v="capillary">모세 혈관</button><button class="btn" data-k="${k}" data-v="lacteal">암죽관</button></div>`).join('')}
        <div class="row-btns"><button class="btn primary" id="ab-go" disabled>흡수시키기</button></div>
        <ul class="blog">${logs.slice(-4).reverse().map(l => `<li class="${l.t}">${l.text}</li>`).join('')}</ul>`;
      body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
        choice[b.dataset.k] = b.dataset.v;
        body.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach(x => x.classList.toggle('sel', x === b));
        $('ab-go').disabled = Object.keys(choice).length < 3;
      }));
      $('ab-go').onclick = () => finish(B.absorbCheck(choice), choice);
    }
    function finish(absorbRes) {
      const stars = B.digestStars(st, absorbRes);
      const win = stars > 0;
      const wrongAbs = absorbRes ? Object.entries(absorbRes).filter(([, v]) => !v).map(([k]) => k) : [];
      const NUT = { starch: '포도당', protein: '아미노산', fat: '지방산·모노글리세리드' };
      body.innerHTML = `<div class="feedback ${win ? 'ok' : 'bad'}"><b>${win ? '승리!' : '패배…'}</b> ${starsHTML(stars)}
        <p>${!win ? '분해되지 않은 영양소는 흡수되지 못한다. 어느 장소에서 어떤 소화액이 나오는지 다시 떠올려 보자.'
          : wrongAbs.length ? `흡수 통로를 잘못 고른 영양소: ${wrongAbs.map(k => NUT[k]).join(', ')}. 물에 잘 녹는 포도당·아미노산은 모세 혈관으로, 지방산·모노글리세리드는 암죽관으로 흡수된다.`
          : st.wrong ? `분해는 성공! 다만 효과 없는 선택이 ${st.wrong}번 있었다.` : '완벽한 소화와 흡수!'}</p></div>
        <p><b>설명해 보기</b> — 쓸개즙에는 소화 효소가 없는데도 지방의 소화를 돕는 까닭은 무엇일까요?</p>
        <textarea id="refl" placeholder="두세 문장으로 써 보세요."></textarea>
        <div class="row-btns"><button class="btn primary" id="d-done">${win ? '배지 받기' : '저장하고 나가기'}</button><button class="btn" id="d-retry">다시 도전</button></div>`;
      const save = () => {
        S.records.push({ gym: 'digest', at: new Date().toISOString(), win, stars, wrong: st.wrong, absorb: absorbRes, history: st.history, reflection: $('refl').value.trim() });
        if (win) S.badges.digest = Math.max(S.badges.digest || 0, stars);
        writeSave();
      };
      $('d-retry').onclick = () => { save(); closePanel(); gymDigest(); };
      $('d-done').onclick = async () => {
        save(); closePanel();
        if (win) await say('관장 모아', ['좋은 소화였다! 융털 배지를 받아라.', '흡수된 영양소는 이제 혈액을 타고 온몸의 세포로 간다. 그 이야기는 다음 체육관(순환·호흡·배설)에서 이어진다!', '(다음 체육관은 준비 중입니다.)']);
      };
    }
    draw();
  }

  /* ---------------- 시작 ---------------- */
  async function intro() {
    await say('한결 박사', [
      '어서 와! 나는 초록섬 생명 연구소의 한결 박사란다.',
      '이 섬의 숲과 습지에는 수많은 생물이 살고 있어. 너에게 탐사 도감을 맡기고 싶구나.',
      '탐사를 도와줄 파트너 요정을 한 명 골라 보렴.',
    ]);
    const pick = await ask('한결 박사', PARTNERS.map(p => `${p.name}: ${p.desc}`).join('\n'), PARTNERS.map(p => ({ label: p.name, value: p.id })));
    S.partner = pick;
    const p = PARTNERS.find(x => x.id === pick);
    await say(p.name, ['잘 부탁해! 같이 섬을 탐사하자!']);
    await say('한결 박사', [
      '도감은 “발견”만으로 채워지지 않아. 생물을 자세히 관찰하고 어느 무리인지 가려야 등록되지.',
      '풀숲에 들어가면 생물을 만날 수 있어. 낮과 밤에 나오는 생물이 다르단다.',
      '북쪽 숲길을 지나면 잎새마을이 나와. 그곳 광합성 체육관에 가려면 생물 4종 이상, 그중 생산자 1종 이상을 관찰해 오렴.',
      '조작: 방향 버튼으로 이동, “확인”으로 말 걸기, “메뉴”로 도감을 연다. 집에 들어가면 저장된단다.',
    ]);
    S.introDone = true;
    writeSave();
  }
  function startGame(fromSave) {
    $('title').hidden = true;
    player.x = player.fromX = S.x; player.y = player.fromY = S.y; player.dir = S.dir || 'down';
    mode = 'walk';
    updateHUD();
    if (!fromSave || !S.introDone) intro();
  }

  /* ---------------- 입력 ---------------- */
  function pressA() {
    if (mode === 'dialog') advanceDialog();
    else if (mode === 'walk' && !player.moving) interact();
  }
  function pressB() {
    if (mode === 'walk') openMenu();
    else if (mode === 'panel' && !$('panel-close').hidden) closePanel();
  }
  document.querySelectorAll('.dir').forEach(btn => {
    const d = btn.dataset.dir;
    const on = e => { e.preventDefault(); held.add(d); btn.classList.add('held'); };
    const off = () => { held.delete(d); btn.classList.remove('held'); };
    btn.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, off));
  });
  $('btn-a').addEventListener('click', pressA);
  $('btn-b').addEventListener('click', pressB);
  $('dialog').addEventListener('click', e => { if (e.target.closest('button')) return; advanceDialog(); });
  $('panel-close').addEventListener('click', closePanel);
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.key]) { held.add(KEYMAP[e.key]); e.preventDefault(); }
    else if (['z', 'Z', 'Enter', ' '].includes(e.key)) {
      if (mode === 'dialog' || mode === 'walk') {
        e.preventDefault(); // 기본 동작(포커스된 버튼 클릭)은 막고 아래에서 한 번만 처리한다
        const choice = mode === 'dialog' && e.target.closest && e.target.closest('#dialog-choices button');
        if (choice) choice.click(); else pressA(); // 선택지에 포커스가 있으면 그 선택지를 고른다
      }
    }
    else if (['x', 'X', 'Escape'].includes(e.key)) { e.preventDefault(); pressB(); }
  });
  document.addEventListener('keyup', e => { if (KEYMAP[e.key]) held.delete(KEYMAP[e.key]); });
  window.addEventListener('blur', () => held.clear());

  const saved = loadSave();
  if (saved && saved.v === 1) $('btn-continue').hidden = false;
  $('btn-new').addEventListener('click', () => {
    if (saved && !confirm('저장된 기록을 지우고 처음부터 시작할까요?')) return;
    S = freshSave(); writeSave(); startGame(false);
  });
  $('btn-continue').addEventListener('click', () => { S = Object.assign(freshSave(), saved); startGame(true); });

  // 오프라인 실행(PWA)

  // 테스트용 훅
  window.__bq = { get S() { return S; }, get mode() { return mode; }, player, warp, encounter, gymPhoto, gymDigest, openDex };
  requestAnimationFrame(loop);
})();
