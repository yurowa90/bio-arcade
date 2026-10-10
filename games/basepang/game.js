/* 염기쌍 팡 — 화면과 진행 */
(function () {
  const B = window.BasePang, A = window.Arcade;
  const $ = id => document.getElementById(id);
  const MOVES = 15;
  const STARS = { 1: [80, 160, 260], 2: [40, 70, 110] };
  const nextStar = (lv, points) => {
    const target = STARS[lv].find(v => points < v);
    return target === undefined ? '별 3개 기준에 도달했다.' : `다음 별까지 ${target - points}점 남았다.`;
  };
  let level, grid, moves, score, sel = null, busy = false, replayT, skipReplay = null, replayTexts = [];
  const rec = { levelScores: {}, invalid: { total: 0, dnaDnaInTx: 0, sameBase: 0, purinePurine: 0 }, bonds: { AT: 0, GC: 0, DNA_RNA: 0 } };

  function legend() {
    const text = level === 1
      ? '<b>1단계 · DNA 복제</b><br>가로로 나란한 두 염기가 짝이면 팡! <b>A=T</b> 수소 결합 2개(2점), <b>G≡C</b> 수소 결합 3개(3점). 연쇄가 이어지면 점수만 2배, 3배로 오르고, 짝 하나의 수소 결합 수는 그대로다.'
      : '<b>2단계 · 전사 (RNA 만들기)</b><br>네모 = DNA 주형, 동그라미 = RNA. <b>DNA 옆에 짝이 맞는 RNA</b>가 오면 팡! DNA A → RNA <b>U</b>, T → A, G → C, C → G. RNA에는 T가 없다. 이번 단계에서 DNA끼리는 짝짓지 않는다.';
    const key = level === 1 ? '<b>DNA 복제</b> · A=T · G≡C' : 'DNA A → RNA <b>U</b>, T → A, G → C, C → G';
    $('legend').innerHTML = `<span class="legend-key">${key}</span><details class="legend-details"><summary>설명</summary><div class="legend-body">${text}<div id="chain-log"></div></div></details>`;
    $('lvhud').textContent = `${level}/2단계`;
  }
  // 판의 실제 남은 폭·높이에서 간격과 테두리 안쪽 여백을 뺀다. 높이 경계 없이 같은 계산을 쓴다.
  function fitBoard() {
    const board = $('grid').parentElement;
    const rect = board.getBoundingClientRect();
    const size = Math.min((rect.width - 27) / B.W, (rect.height - 33) / B.H);
    $('grid').style.setProperty('--tile-size', `${Math.max(44, Math.floor(size * 64) / 64)}px`);
  }
  new ResizeObserver(fitBoard).observe($('grid').parentElement);
  function replayLogHTML() {
    return replayTexts.length ? `<b>마지막 이동 · 연쇄 다시 읽기</b><ol>${replayTexts.map(t => `<li>${t}</li>`).join('')}</ol>` : '';
  }
  function appendReplayLog(ov) {
    const log = document.createElement('details');
    log.className = 'replay-history';
    log.innerHTML = `<summary>마지막 이동 · 연쇄 다시 읽기</summary><ol>${replayTexts.map(t => `<li>${t}</li>`).join('')}</ol>`;
    ov.querySelector('.card').append(log);
  }
  function render(pops = []) {
    const key = new Set(pops.flatMap(p => [`${p.x},${p.y}`, `${p.x + 1},${p.y}`]));
    const f = document.activeElement, focused = f && f !== $('grid') && $('grid').contains(f) ? [f.dataset.x, f.dataset.y] : null;
    $('grid').innerHTML = grid.map((row, y) => row.map((t, x) => {
      const on = sel && sel.x === x && sel.y === y;
      return `<button class="tile ${t.s} b-${t.b} ${on ? 'sel' : ''} ${key.has(`${x},${y}`) ? 'pop' : ''}" data-x="${x}" data-y="${y}" aria-label="${y + 1}행 ${x + 1}열, ${t.s === 'R' ? 'RNA' : 'DNA'} ${t.b}${on ? ', 고른 칸' : ''}">${t.b}</button>`;
    }).join('')).join('');
    if (focused) { const n = $('grid').querySelector(`[data-x="${focused[0]}"][data-y="${focused[1]}"]`); if (n) n.focus(); }
    $('score').textContent = score;
    $('moves').textContent = moves;
  }
  let toastT;
  // 표시 시간은 글자 수에 비례한다(글자당 70ms). 짧은 문구도 2.2초는 보이고, 긴 문구도 6초를 넘지 않는다.
  const toastMs = t => Math.min(6000, Math.max(2200, Array.from(t).length * 70));
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), toastMs(t)); }

  // 잘못된 교환의 까닭을 판별해 오개념 신호로 기록.
  // a = 학생이 옮긴 타일의 처음 칸(밀기의 출발 칸, 두 칸 누르기의 첫 칸), b = 그 타일이 도착한 칸.
  // 옮긴 타일의 새 좌우 이웃만 본다. 이웃마다 까닭이 엇갈리면 어느 쪽과 짝지으려 했는지 알 수 없으므로 세지 않는다.
  function whyInvalid(g, a, b) {
    const s = B.swap(g, a, b), t = s[b.y][b.x];
    const kinds = [s[b.y][b.x - 1], s[b.y][b.x + 1]].filter(Boolean).map(n =>
      level === 2 && t.s === 'D' && n.s === 'D' && B.DNA_COMP[t.b] === n.b ? 'dnaDna'
        : t.b === n.b ? 'same'
          : 'AG'.includes(t.b) && 'AG'.includes(n.b) ? `purine:${n.b}` : 'none');
    // 2단계에서 DNA끼리 상보적으로 놓았다면 1단계 짝 규칙을 그대로 쓴 것이다
    if (kinds.includes('dnaDna')) { rec.invalid.dnaDnaInTx++; return '전사 중이다! DNA끼리가 아니라 DNA 옆에 RNA 염기가 와야 한다.'; }
    const one = kinds.length && kinds.every(k => k === kinds[0]) ? kinds[0] : null;
    if (one === 'same') { rec.invalid.sameBase++; return `${t.b}와 ${t.b}: 같은 염기끼리는 짝이 아니다. 상보적인 짝이어야 터진다!`; }
    if (one && one.startsWith('purine:')) { const n = one.slice(7); rec.invalid.purinePurine++; return `${t.b}와 ${n}는 둘 다 크기가 큰 염기(퓨린)라 짝을 이루지 않는다.`; }
    return level === 1 ? '짝이 생기지 않았다. A의 짝은 T, G의 짝은 C!' : '짝이 생기지 않았다. DNA A↔RNA U, T↔A, G↔C, C↔G!';
  }
  function trySwap(a, b) {
    if (busy || moves <= 0) return;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return;
    const ta = grid[a.y][a.x], tb = grid[b.y][b.x];
    if (ta.b === tb.b && ta.s === tb.s) { toast('똑같은 타일끼리 바꾸면 판이 그대로다.'); sel = null; render(); return; }
    const s = B.swap(grid, a, b);
    const first = B.findPairs(level, s);
    if (!first.length) { rec.invalid.total++; toast(whyInvalid(grid, a, b)); sel = null; render(); return; }
    busy = true; moves--; sel = null;
    const r = B.resolve(level, s);
    r.popped.forEach(p => {
      if (p.a.includes('RNA') || p.b.includes('RNA')) { rec.bonds.DNA_RNA++; return; }
      const k = [p.a[0], p.b[0]].sort().join(''); if (k === 'AT') rec.bonds.AT++; else rec.bonds.GC++;
    });
    // 기본 재생 시간은 유지하되 판·토스트를 누르면 끝낸다. 건너뛴 단계도 설명에서 다시 읽을 수 있다.
    replayTexts = r.steps.map(step => `${step.chain}연쇄 · 짝 ${step.pairs.length}쌍 · 수소 결합 합계 ${step.gained / step.chain}개 · +${step.gained}점`);
    $('chain-log').innerHTML = replayLogHTML();
    $('toast').classList.add('replaying');
    $('toast').title = '탭으로 건너뛰기. 설명에서 모든 연쇄 문구를 다시 읽을 수 있다.';
    const finishReplay = () => {
      clearTimeout(replayT); skipReplay = null;
      $('toast').classList.remove('replaying'); $('toast').removeAttribute('title');
      grid = r.grid; busy = false; render();
      if (moves <= 0) levelEnd();
    };
    const play = i => {
      if (i === r.steps.length) {
        finishReplay();
        return;
      }
      const step = r.steps[i];
      grid = step.grid; score += step.gained; render(step.pairs);
      const text = replayTexts[i];
      toast(text);
      skipReplay = () => {
        score += r.steps.slice(i + 1).reduce((sum, s) => sum + s.gained, 0);
        toast(replayTexts[replayTexts.length - 1]);
        finishReplay();
      };
      replayT = setTimeout(() => play(i + 1), toastMs(text));
    };
    play(0);
  }
  function levelEnd() {
    rec.levelScores[level] = score;
    const st = STARS[level].filter(v => score >= v).length;
    if (level === 1) {
      const ov = $('overlay'); ov.hidden = false;
      ov.innerHTML = `<div class="card"><h2>1단계 끝!</h2><p class="big-stars">${A.stars(st)}</p><p>점수 ${score}. A=T ${rec.bonds.AT}쌍, G≡C ${rec.bonds.GC}쌍.</p><p>${nextStar(1, score)}</p>
        <p>이제 <b>전사</b>다. DNA의 한 가닥을 주형으로 RNA를 만든다. RNA에는 T 대신 <b>U</b>가 들어간다.</p>
        <p>짝이 터져 사라지는 것은 점수 연출이며, 실제 주형 DNA는 남는다. 복제의 짝은 주형 염기와 새 뉴클레오타이드다.</p><button class="btn primary big" id="go2">2단계 시작</button></div>`;
      $('go2').onclick = () => { ov.hidden = true; start(2); };
      appendReplayLog(ov);
      $('go2').focus();
      return;
    }
    const s1 = STARS[1].filter(v => rec.levelScores[1] >= v).length, s2 = st;
    const stars = Math.min(s1, s2);
    const patchPlay = A.finish($('overlay'), {
      id: 'basepang', stars, score: rec.levelScores[1] + rec.levelScores[2], detail: rec,
      lines: [`복제 ${rec.levelScores[1]}점 · 전사 ${rec.levelScores[2]}점 (두 단계 중 낮은 별이 최종 별)`,
        `복제: ${nextStar(1, rec.levelScores[1])} 전사: ${nextStar(2, rec.levelScores[2])}`,
        `짝 지은 수: A=T ${rec.bonds.AT} · G≡C ${rec.bonds.GC} · DNA–RNA ${rec.bonds.DNA_RNA}. 헛손질 ${rec.invalid.total}번`,
        rec.invalid.sameBase ? `염기를 같은 염기 옆으로 옮긴 적이 ${rec.invalid.sameBase}번 있었다. 이 게임에서는 “같은 것”이 아니라 “짝”이 터진다!` : ''].filter(Boolean),
      quiz: { q: 'DNA 주형 가닥의 염기 서열이 TAC일 때, 전사로 만들어지는 RNA의 염기 서열은?', options: ['AUG', 'ATG'], answer: 0,
        explain: 'T→A, A→U, C→G. RNA에는 T 대신 U가 들어가므로 AUG가 된다.' },
      reflection: '해설을 참고해 정리해 보세요. DNA가 복제될 때와 유전자의 정보가 RNA로 전사될 때 게임 속 “짝 규칙”이 어떻게 쓰이는지 설명하세요. 이어서 그 RNA의 정보로 단백질이 만들어지는 과정을 설명하세요.',
      onRetry: () => { rec.levelScores = {}; Object.assign(rec.invalid, { total: 0, dnaDnaInTx: 0, sameBase: 0, purinePurine: 0 }); Object.assign(rec.bonds, { AT: 0, GC: 0, DNA_RNA: 0 }); start(1); },
    });
    addFlowQuiz($('overlay'), patchPlay);
    appendReplayLog($('overlay'));
  }

  // 10통과1-03-06: 게임은 전사(DNA → RNA)까지만 다루므로, 번역(RNA → 단백질)을 묻는 인출 문항을 하나 더 붙인다.
  // 공통 결과 화면(Arcade.finish)은 문항을 하나만 받으므로 첫 문항 아래에 덧붙인다.
  // 공통 문항의 클릭 처리(.quiz-opts .btn, .quiz-fb)에 걸리지 않게 클래스 이름을 따로 쓰고, 정답 여부는 flowQuizCorrect로 남긴다.
  // 전사로 만든 RNA가 모두 번역의 주형이 되는 것은 아니므로(rRNA는 리보솜을 이루고, tRNA는 아미노산을 나른다) 문항은 유전자의 정보를 담은 RNA(mRNA)로 한정한다.
  // 학생 화면에는 성취기준 문구대로 'RNA'만 쓰고 'mRNA'라는 말은 쓰지 않는다.
  // '단백질 정보를 담은 RNA'라고 쓰면 정답이 문제에 드러나므로 '유전자의 정보'로 적는다.
  const FLOW_QUIZ = {
    q: '전사로 만든 RNA 가운데 유전자의 정보를 담은 RNA는 리보솜으로 간다. 리보솜에서 이 RNA의 정보에 따라 만들어지는 것은?', options: ['단백질', 'DNA'], answer: 0,
    explain: '리보솜에서 이 RNA의 염기 서열에 따라 단백질이 만들어진다. 이 과정을 번역이라고 한다. 유전자의 정보는 DNA → RNA(전사) → 단백질(번역) 순서로 전달된다.',
  };
  function addFlowQuiz(ov, patchPlay) {
    const first = ov.querySelector('.quiz'), card = ov.querySelector('.card'); if (!card) return;
    // '설명해 보기' 문항에 '단백질'이 들어 있어 같은 화면에 두면 이 문항의 답이 미리 드러난다.
    // 그래서 답을 고르기 전에는 떼어 두었다가 고른 뒤 이 문항 아래에 다시 붙인다.
    // 숨기지 않고 떼는 까닭: 공통 CSS(.refl display:block)가 hidden 속성을 덮어쓰고,
    // 공통 코드의 성찰 저장(keepRefl)은 같은 textarea를 참조하므로 다시 붙이면 그대로 저장된다.
    const refl = card.querySelector('.refl');
    const box = document.createElement('div'); box.className = 'quiz flow-quiz';
    const opts = FLOW_QUIZ.options.map((o, i) => ({ o, i })).sort(() => Math.random() - 0.5);
    box.innerHTML = `<p><b>이어서 떠올리기</b> — ${FLOW_QUIZ.q}</p>
      <div class="flow-opts">${opts.map(({ o, i }) => `<button class="btn" data-i="${i}">${o}</button>`).join('')}</div>
      <p class="flow-fb"${refl ? '' : ' hidden'}>${refl ? '답을 고르면 ‘설명해 보기’가 나온다.' : ''}</p>`;
    if (first) first.after(box); else card.insertBefore(box, refl || card.querySelector('.row'));
    if (refl) refl.remove();
    const btns = box.querySelectorAll('.flow-opts .btn');
    btns.forEach(btn => btn.onclick = () => {
      const ok = +btn.dataset.i === FLOW_QUIZ.answer;
      btns.forEach(x => { x.disabled = true; if (+x.dataset.i === FLOW_QUIZ.answer) x.classList.add('right'); });
      if (!ok) btn.classList.add('wrong');
      const fb = box.querySelector('.flow-fb'); fb.hidden = false;
      fb.textContent = (ok ? '정답! ' : '아쉽다. ') + FLOW_QUIZ.explain;
      if (refl && !refl.isConnected) box.after(refl);
      patchPlay({ flowQuizCorrect: ok });
    });
  }
  function start(lv) {
    clearTimeout(replayT); skipReplay = null; replayTexts = [];
    clearTimeout(toastT); $('toast').classList.remove('on'); $('toast').textContent = '';
    level = lv; grid = B.newBoard(lv); moves = MOVES; score = 0; sel = null; busy = false; legend(); render();
    fitBoard();
  }

  // 입력: 밀기(스와이프) 또는 두 칸 차례로 누르기. 키보드는 Tab으로 칸을 옮기고 Enter·Space로 누른다.
  function tap(x, y) {
    if (busy) { if (skipReplay) skipReplay(); return; }
    if (moves <= 0) return;
    if (sel && Math.abs(sel.x - x) + Math.abs(sel.y - y) === 1) { trySwap(sel, { x, y }); return; }
    sel = sel && sel.x === x && sel.y === y ? null : { x, y };
    render();
  }
  let down = null, lastPointerUp = -Infinity;
  $('grid').addEventListener('pointerdown', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    down = { x: +t.dataset.x, y: +t.dataset.y, px: e.clientX, py: e.clientY };
  });
  // 포인터 입력 직후 따라오는 click은 이미 pointerup에서 처리했다. 키보드로 누른 click은 detail이 0이다.
  $('grid').addEventListener('click', e => {
    if (e.detail !== 0 && performance.now() - lastPointerUp < 800) return;
    const t = e.target.closest('.tile'); if (!t) return;
    tap(+t.dataset.x, +t.dataset.y);
  });
  $('grid').addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down.px, dy = e.clientY - down.py;
    const d = down; down = null; lastPointerUp = performance.now();
    if (busy) { if (skipReplay) skipReplay(); return; }
    if (Math.hypot(dx, dy) > 18) {
      const b = Math.abs(dx) > Math.abs(dy) ? { x: d.x + Math.sign(dx), y: d.y } : { x: d.x, y: d.y + Math.sign(dy) };
      if (b.x >= 0 && b.x < B.W && b.y >= 0 && b.y < B.H) trySwap({ x: d.x, y: d.y }, b);
      return;
    }
    tap(d.x, d.y);
  });
  $('toast').addEventListener('click', () => { if (skipReplay) skipReplay(); });

  window.__game = { grid: () => grid, level: () => level, moves: () => moves, trySwap }; // 테스트용
  A.intro($('overlay'), {
    id: 'basepang',
    rules: [
      '옆 칸과 <b>밀어서 바꾸기</b>(또는 두 칸을 차례로 누르기).',
      '<b>같은 염기 3개가 아니라, 짝이 맞는 염기 2개</b>가 가로로 나란하면 터진다.',
      '1단계 복제: A=T(수소 결합 2), G≡C(수소 결합 3). 2단계 전사: DNA 주형 옆에 짝이 맞는 RNA 염기.',
      `각 단계 이동 ${MOVES}번. 짝이 안 생기는 이동은 되돌아가고 까닭을 알려 준다.`,
      '별 1·2·3개 기준: 복제 80·160·260점, 전사 40·70·110점. 두 단계 중 낮은 별이 최종 별이다.',
    ],
    onStart: () => start(1),
  });
})();
