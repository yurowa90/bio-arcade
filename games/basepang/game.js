/* 염기쌍 팡 — 화면과 진행 */
(function () {
  const B = window.BasePang, A = window.Arcade;
  const $ = id => document.getElementById(id);
  const MOVES = 15;
  const STARS = { 1: [80, 160, 260], 2: [40, 70, 110] };
  let level, grid, moves, score, sel = null, busy = false;
  const rec = { levelScores: {}, invalid: { total: 0, dnaDnaInTx: 0, sameBase: 0, purinePurine: 0 }, bonds: { AT: 0, GC: 0, AU: 0 } };

  function legend() {
    $('legend').innerHTML = level === 1
      ? '<b>1단계 · DNA 복제</b><br>가로로 나란한 두 염기가 짝이면 팡! <b>A=T</b> 수소 결합 2개, <b>G≡C</b> 수소 결합 3개(점수도 3). 연쇄가 이어지면 점수가 배로 오른다.'
      : '<b>2단계 · 전사 (RNA 만들기)</b><br>네모 = DNA 주형, 동그라미 = RNA. <b>DNA 옆에 짝이 맞는 RNA</b>가 오면 팡! DNA A → RNA <b>U</b>, T → A, G → C, C → G. RNA에는 T가 없다. 이번 단계에서 DNA끼리는 짝짓지 않는다.';
    $('lvhud').textContent = `${level}/2단계`;
  }
  function render(pops = []) {
    const key = new Set(pops.flatMap(p => [`${p.x},${p.y}`, `${p.x + 1},${p.y}`]));
    $('grid').innerHTML = grid.map((row, y) => row.map((t, x) =>
      `<button class="tile ${t.s} b-${t.b} ${sel && sel.x === x && sel.y === y ? 'sel' : ''} ${key.has(`${x},${y}`) ? 'pop' : ''}" data-x="${x}" data-y="${y}" aria-label="${t.s === 'R' ? 'RNA' : 'DNA'} ${t.b}">${t.b}</button>`).join('')).join('');
    $('score').textContent = score;
    $('moves').textContent = moves;
  }
  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

  // 잘못된 교환의 까닭을 판별해 오개념 신호로 기록
  function whyInvalid(g, a, b) {
    const s = B.swap(g, a, b);
    const cells = [a, b];
    for (const c of cells) for (const dx of [-1, 1]) {
      const n = s[c.y] && s[c.y][c.x + dx]; const t = s[c.y][c.x];
      if (!n) continue;
      if (level === 2 && t.s === 'D' && n.s === 'D' && B.DNA_COMP[t.b] === n.b) { rec.invalid.dnaDnaInTx++; return '전사 중이다! DNA끼리가 아니라 DNA 옆에 RNA 염기가 와야 한다.'; }
      if (t.b === n.b) { rec.invalid.sameBase++; return `${t.b}와 ${n.b}: 같은 염기끼리는 짝이 아니다. 애니팡과 다르다!`; }
      if ('AG'.includes(t.b) && 'AG'.includes(n.b)) { rec.invalid.purinePurine++; return `${t.b}와 ${n.b}는 둘 다 크기가 큰 염기(퓨린)라 짝을 이루지 않는다.`; }
    }
    return level === 1 ? '짝이 생기지 않았다. A의 짝은 T, G의 짝은 C!' : '짝이 생기지 않았다. DNA A↔RNA U, T↔A, G↔C, C↔G!';
  }
  function trySwap(a, b) {
    if (busy || moves <= 0) return;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return;
    const s = B.swap(grid, a, b);
    const first = B.findPairs(level, s);
    if (!first.length) { rec.invalid.total++; toast(whyInvalid(grid, a, b)); sel = null; render(); return; }
    busy = true; moves--; sel = null;
    grid = s; render(first);
    const r = B.resolve(level, s);
    r.popped.forEach(p => {
      if (p.a.includes('RNA') || p.b.includes('RNA')) { rec.bonds.AU++; return; }
      const k = [p.a[0], p.b[0]].sort().join(''); if (k === 'AT') rec.bonds.AT++; else rec.bonds.GC++;
    });
    const best = r.steps[r.steps.length - 1];
    toast(`수소 결합 +${r.score}${best.chain > 1 ? ` · ${best.chain}연쇄!` : ''}`);
    setTimeout(() => { score += r.score; grid = r.grid; busy = false; render(); if (moves <= 0) levelEnd(); }, 380);
  }
  function levelEnd() {
    rec.levelScores[level] = score;
    const st = STARS[level].filter(v => score >= v).length;
    if (level === 1) {
      const ov = $('overlay'); ov.hidden = false;
      ov.innerHTML = `<div class="card"><h2>1단계 끝!</h2><p class="big-stars">${A.stars(st)}</p><p>점수 ${score}. A=T ${rec.bonds.AT}쌍, G≡C ${rec.bonds.GC}쌍.</p>
        <p>이제 <b>전사</b>다. DNA의 한 가닥을 주형으로 RNA를 만든다. RNA에는 T 대신 <b>U</b>가 들어간다.</p><button class="btn primary big" id="go2">2단계 시작</button></div>`;
      $('go2').onclick = () => { ov.hidden = true; start(2); };
      return;
    }
    const s1 = STARS[1].filter(v => rec.levelScores[1] >= v).length, s2 = st;
    const stars = Math.min(s1, s2);
    A.finish($('overlay'), {
      id: 'basepang', stars, score: rec.levelScores[1] + rec.levelScores[2], detail: rec,
      lines: [`복제 ${rec.levelScores[1]}점 · 전사 ${rec.levelScores[2]}점 (두 단계 중 낮은 별이 최종 별)`,
        `짝 지은 수: A=T ${rec.bonds.AT} · G≡C ${rec.bonds.GC} · DNA–RNA ${rec.bonds.AU}. 헛손질 ${rec.invalid.total}번`,
        rec.invalid.sameBase ? '같은 염기끼리 붙이려 한 적이 있다. 이 게임에서는 “같은 것”이 아니라 “짝”이 터진다!' : ''].filter(Boolean),
      quiz: { q: 'DNA 주형 가닥의 염기 서열이 TAC일 때, 전사로 만들어지는 RNA의 염기 서열은?', options: ['AUG', 'ATG'], answer: 0,
        explain: 'T→A, A→U, C→G. RNA에는 T 대신 U가 들어가므로 AUG가 된다.' },
      reflection: 'DNA가 두 가닥의 염기쌍으로 이루어져 있다는 사실이 유전 정보를 복제하고 전사하는 데 왜 중요한지, 게임 속 “짝 규칙”을 근거로 설명하세요.',
      onRetry: () => { rec.levelScores = {}; Object.assign(rec.invalid, { total: 0, dnaDnaInTx: 0, sameBase: 0, purinePurine: 0 }); Object.assign(rec.bonds, { AT: 0, GC: 0, AU: 0 }); start(1); },
    });
  }
  function start(lv) { level = lv; grid = B.newBoard(lv); moves = MOVES; score = 0; sel = null; busy = false; legend(); render(); }

  // 입력: 밀기(스와이프) 또는 두 칸 차례로 누르기
  let down = null;
  $('grid').addEventListener('pointerdown', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    down = { x: +t.dataset.x, y: +t.dataset.y, px: e.clientX, py: e.clientY };
  });
  $('grid').addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down.px, dy = e.clientY - down.py;
    const d = down; down = null;
    if (Math.hypot(dx, dy) > 18) {
      const b = Math.abs(dx) > Math.abs(dy) ? { x: d.x + Math.sign(dx), y: d.y } : { x: d.x, y: d.y + Math.sign(dy) };
      if (b.x >= 0 && b.x < B.W && b.y >= 0 && b.y < B.H) trySwap({ x: d.x, y: d.y }, b);
      return;
    }
    if (sel && Math.abs(sel.x - d.x) + Math.abs(sel.y - d.y) === 1) { trySwap(sel, { x: d.x, y: d.y }); return; }
    sel = sel && sel.x === d.x && sel.y === d.y ? null : { x: d.x, y: d.y };
    render();
  });

  window.__game = { grid: () => grid, level: () => level, moves: () => moves, trySwap }; // 테스트용
  A.intro($('overlay'), {
    id: 'basepang',
    rules: [
      '옆 칸과 <b>밀어서 바꾸기</b>(또는 두 칸을 차례로 누르기).',
      '<b>같은 염기 3개가 아니라, 짝이 맞는 염기 2개</b>가 가로로 나란하면 터진다.',
      '1단계 복제: A=T(수소 결합 2), G≡C(수소 결합 3). 2단계 전사: DNA 주형 옆에 짝이 맞는 RNA 염기.',
      `각 단계 이동 ${MOVES}번. 짝이 안 생기는 이동은 되돌아가고 까닭을 알려 준다.`,
    ],
    onStart: () => start(1),
  });
})();
