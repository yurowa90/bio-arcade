/* 가계도 지뢰찾기 — 화면과 진행 */
(function (root) {
  'use strict';
  const X = x => 24 + x * 40, Y = gen => 40 + gen * 105, R = 16;
  // 화면·기록에 쓰는 계산. 숨은 유전자형이나 정답 목록을 기록하지 않는다.
  function grade(ped, sol, marks, chosenMode) {
    const flagged = Object.keys(marks).filter(id => marks[id] === 'c');
    const correct = flagged.filter(id => sol.must.includes(id));
    const wrong = flagged.filter(id => !sol.must.includes(id));
    const missed = sol.must.filter(id => !flagged.includes(id));
    const modeWrong = !!ped.modeHidden && chosenMode !== ped.mode;
    return { correct, wrong, missed, modeWrong, perfect: !modeWrong && !wrong.length && !missed.length,
      maleMarkedX: ped.mode === 'x' ? wrong.filter(id => ped.people.find(p => p.id === id).sex === 'M').length : 0,
      maybeMarked: wrong.filter(id => sol.maybe.includes(id)).length };
  }
  function starsFor(total) {
    return total.wrong === 0 && total.missed === 0 ? 3
      : total.wrong <= 2 && total.correct >= total.must * .8 ? 2
        : total.wrong <= total.must * .5 && total.correct >= total.must * .5 ? 1 : 0;
  }
  function collectAvoid(plays, level) {
    const recent = (Array.isArray(plays) ? plays : []).filter(p => isRecord(p) && isRecord(p.detail)
      && p.detail.kind === 'challenge' && p.detail.level === level && Array.isArray(p.detail.problems)).slice(-12);
    return [...new Set(recent.flatMap(p => p.detail.problems.filter(isRecord).map(problem => problem.shapeId))
      .filter(id => typeof id === 'string' && /^[0-9a-f]{8}$/.test(id)))];
  }
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function finishSummary(total, { challenge, fixedSeed, basicEligible, playScore, maxCombo, bundleSeed }) {
    const extra = { level: challenge, playScore, maxCombo, eligible: challenge ? !fixedSeed : basicEligible };
    const cleared = !!challenge && !fixedSeed && total.wrong === 0 && total.missed <= 1;
    if (challenge) { extra.cond = challenge === 1 ? 'mix' : 'hidden'; if (cleared) extra.cleared = true; }
    const detail = challenge ? { kind: 'challenge', ...extra, seed: bundleSeed, fixedSeed,
      correct: total.correct, wrong: total.wrong, missed: total.missed, must: total.must,
      maleMarkedX: total.maleMarkedX, maybeMarked: total.maybeMarked, problems: total.perLevel }
      : { ...total, kind: 'basic', ...extra };
    const lines = challenge
      ? [`확실한 보인자 ${total.must}명 중 ${total.correct}명을 찾았다. 놓침 ${total.missed}명 · 지뢰 ${total.wrong}명.`,
        challenge === 2 ? `유전 방식을 맞힌 문제 ${total.perLevel.filter(p => p.chosenMode === p.mode).length}/4.`
          : fixedSeed ? '연습용 고정 문제라 도전 2를 여는 기록에 넣지 않는다.'
            : cleared ? '문턱 통과: 지뢰 0, 놓친 보인자 1명 이하로 끝냈다.' : '문턱: 한 묶음을 지뢰 0, 놓친 보인자 1명 이하로 끝낸다.',
        ...(challenge === 2 && fixedSeed ? ['연습용 고정 문제라 최고 기록에 넣지 않는다.'] : [])]
      : [`확실한 보인자 ${total.must}명 중 ${total.correct}명을 찾았다. 잘못 표시 ${total.wrong}명.`,
        total.wrong ? '“보인자일 수도 있다”와 “반드시 보인자다”는 다르다. 과학적 추론은 근거가 있는 곳까지만 말한다.' : '근거가 있는 곳까지만 판단했다. 훌륭한 추론이다.'];
    return { ...extra, detail, lines };
  }
  function problemDetail(ped, result, must, seconds, chosenMode, deduction) {
    // maxDepth는 반드시 보인자(must)에 이르는 유전 깊이의 최댓값이다.
    const targets = new Set((deduction?.must || []).map(id => `${id}:hasA`));
    const maxDepth = Math.max(0, ...(deduction?.steps || []).filter(s => targets.has(s.key)).map(s => s.geneticDepth));
    return { seed: ped.seed, shapeId: ped.shapeId, mode: ped.mode, ...(ped.modeHidden ? { chosenMode } : {}), must,
      correct: result.correct.length, wrong: result.wrong.length, missed: result.missed.length,
      maleMarkedX: result.maleMarkedX, maybeMarked: result.maybeMarked, seconds, perfect: result.perfect,
      cards: (ped.cards || []).length, maxDepth };
  }
  if (typeof module !== 'undefined') module.exports = { X, Y, grade, starsFor, collectAvoid, problemDetail, finishSummary };
  if (typeof document === 'undefined') return;
  const PD = root.Pedigree, A = root.Arcade, $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FACTS = [
    '아들의 X 염색체는 어머니에게서만 온다. 그래서 X 염색체 열성 형질은 아들이 발현하면 어머니가 a를 가지고, 어머니가 발현하면 아들도 모두 발현한다.',
    '딸은 아버지와 어머니에게서 X 염색체를 하나씩 받는다. 그래서 X 염색체 열성 형질은 딸이 발현하면 아버지도 발현하고, 아버지가 발현하면 딸은 a를 가지며, 아버지가 정상인 딸에게 a가 있으면 그 a는 어머니에게서 왔다.',
    '상염색체 유전에서는 아들과 딸 모두 부모에게서 대립유전자를 하나씩 받는다. 그래서 발현한 자녀의 부모는 모두 a를 가지고, 발현한 부모의 자녀는 모두 a를 가지며, 부모 한 사람에게 a가 없으면 자녀의 a는 다른 한 사람에게서 왔다.',
    '남성은 X 염색체가 하나라 X 염색체 열성 형질의 보인자가 될 수 없다.',
  ];
  const factsHTML = () => `<ol>${FACTS.map(t => `<li>${t}</li>`).join('')}</ol>`;
  let li = 0, challenge = 0, bundle = [], bundleSeed, fixedSeed = false, basicEligible = false;
  let marks = {}, judged = false, chosenMode = null, sol, t0 = 0, timerId;
  let total, playScore = 0, combo = 0, maxCombo = 0;
  let walk, walkIndex = 0, solutionOpen = false, flashPeople = [], flashCards = [], flashT, toastT;
  const current = () => bundle[li];
  const records = () => {
    const plays = A.data().games?.pedigree?.plays;
    return Array.isArray(plays) ? plays.filter(isRecord) : [];
  };
  const unlocked = () => typeof A.isUnlocked === 'function' ? A.isUnlocked('pedigree', 2)
    : records().some(p => isRecord(p.detail) && p.detail.kind === 'challenge' && p.detail.level === 1
      && p.detail.fixedSeed !== true && (p.cleared === true || p.detail.cleared === true));
  function chooser() {
    clearInterval(timerId); clearTimeout(flashT); sol = undefined;
    $('problem').hidden = true; $('chooser').hidden = false; $('challenge-intro').hidden = true;
    $('stagehud').textContent = ''; $('timer').textContent = '000';
    delete $('stage').dataset.seed; delete $('stage').dataset.challenge; $('stage').dataset.avoid = '';
    $('choose-2').disabled = !unlocked();
    $('unlock-note').textContent = unlocked() ? '도전 1의 문턱을 통과했다. 유전 방식도 함께 추리한다.'
      : '도전 1 한 묶음을 지뢰 0, 놓친 보인자 1명 이하로 끝내면 열린다.';
    window.scrollTo(0, 0); $('choose-basic').focus({ preventScroll: true });
  }
  const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  function select(kind) {
    if (kind === 2 && !unlocked()) return;
    challenge = kind; li = 0; playScore = combo = maxCombo = 0;
    total = { correct: 0, wrong: 0, missed: 0, must: 0, maleMarkedX: 0, maybeMarked: 0, perLevel: [] };
    $('chooser').hidden = true;
    if (!challenge) {
      bundle = PD.LEVELS;
      basicEligible = !records().some(p => !p.detail?.kind || p.detail.kind === 'basic');
      fixedSeed = false; delete $('stage').dataset.seed; delete $('stage').dataset.challenge; $('stage').dataset.avoid = '';
      startLevel(); return;
    }
    const value = new URLSearchParams(location.search).get('seed');
    fixedSeed = value !== null && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value));
    bundleSeed = fixedSeed ? Number(value) >>> 0 : randomSeed();
    const avoid = fixedSeed ? [] : collectAvoid(records(), challenge);
    $('stage').dataset.avoid = avoid.join(',');
    const retries = fixedSeed ? 0 : 3;
    let made = false;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        bundle = fixedSeed ? PD.makeBundle(bundleSeed, challenge) : PD.makeBundle(bundleSeed, challenge, { avoid });
        made = true; break;
      }
      catch (e) {
        if (e?.code !== 'PEDIGREE_GENERATION_EXHAUSTED') throw e;
        if (attempt < retries) bundleSeed = randomSeed();
      }
    }
    if (!made) {
      $('problem').hidden = true; $('challenge-intro').hidden = false;
      $('challenge-intro').innerHTML = '<p>문제를 만들지 못했다. 판 고르기에서 다시 시작한다.</p><button class="btn" id="back-chooser">판 고르기로</button>';
      $('back-chooser').onclick = chooser; return;
    }
    $('stage').dataset.seed = bundleSeed; $('stage').dataset.challenge = challenge;
    if (challenge === 2) {
      $('problem').hidden = true; $('challenge-intro').hidden = false;
      $('challenge-intro').innerHTML = `<h2>유전 방식을 가르는 사실</h2>${factsHTML()}<button class="btn primary big" id="challenge-start">시작</button>`;
      $('challenge-start').onclick = () => { $('challenge-intro').hidden = true; startLevel(); };
      $('challenge-start').focus({ preventScroll: true });
    } else startLevel();
  }
  function pedigreeHTML(L, interactive = true) {
    const P = Object.fromEntries(L.people.map(p => [p.id, p]));
    const H = Y(Math.max(...L.people.map(p => p.gen))) + 50;
    let s = `<svg viewBox="0 0 360 ${H}" role="${interactive ? 'group' : 'img'}" aria-label="가계도: 네모는 남성, 원은 여성, 검게 칠한 사람은 형질 발현">`;
    for (const [a, b] of L.couples) {
      const pa = P[a], pb = P[b], mx = (X(pa.x) + X(pb.x)) / 2, y0 = Y(pa.gen), ym = y0 + 52;
      s += `<line x1="${X(pa.x)}" y1="${y0}" x2="${X(pb.x)}" y2="${Y(pb.gen)}" class="family-line"/>`;
      const kids = L.people.filter(k => k.parents?.includes(a) && k.parents.includes(b));
      if (kids.length) {
        const xs = kids.map(k => X(k.x));
        s += `<path d="M${mx},${y0}V${ym}M${Math.min(mx, ...xs)},${ym}H${Math.max(mx, ...xs)}" class="family-line"/>`;
        kids.forEach(k => { s += `<line x1="${X(k.x)}" y1="${ym}" x2="${X(k.x)}" y2="${Y(k.gen) - R}" class="family-line"/>`; });
      }
    }
    const active = new Set(interactive ? [...flashPeople, ...(solutionOpen ? walk[walkIndex].people : [])] : []);
    for (const [i, p] of L.people.entries()) {
      const cx = X(p.x), cy = Y(p.gen), mk = interactive ? marks[p.id] : undefined;
      const fill = p.affected ? 'var(--affected)' : 'var(--normal)';
      let ring = '', verdict = '';
      if (interactive && judged) {
        const must = sol.must.includes(p.id);
        if (mk === 'c' && must) { ring = 'var(--ok)'; verdict = '✓'; }
        else if (mk === 'c') { ring = 'var(--bad)'; verdict = '✗'; }
        else if (must) { ring = 'var(--missed)'; verdict = '!'; }
      }
      const shape = p.sex === 'M'
        ? `<rect x="${cx - R}" y="${cy - R}" width="32" height="32" fill="${fill}" stroke="var(--outline)" stroke-width="2.3"/>`
        : `<circle cx="${cx}" cy="${cy}" r="16" fill="${fill}" stroke="var(--outline)" stroke-width="2.3"/>`;
      const half = mk === 'c' && !p.affected ? (p.sex === 'M'
        ? `<rect x="${cx}" y="${cy - R}" width="16" height="32" class="carrier-fill"/>`
        : `<path d="M${cx},${cy - R}A16,16 0 0 1 ${cx},${cy + R}Z" class="carrier-fill"/>`) : '';
      const q = mk === 'q' ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="var(--font-svg-question)" font-weight="800" fill="var(--accent)">?</text>` : '';
      const position = L.people.filter(q => q.gen === p.gen).sort((a, b) => a.x - b.x).findIndex(q => q.id === p.id) + 1;
      const verdictLabel = verdict === '✓' ? '맞힘' : verdict === '✗' ? '잘못 표시' : verdict === '!' ? '놓침' : '';
      const label = `${challenge ? `${p.num || i + 1}번, ` : ''}${p.gen + 1}세대 왼쪽에서 ${position}번째, ${p.sex === 'M' ? '남성' : '여성'}, ${p.affected ? '형질 발현' : '형질 미발현'}, ${mk === 'c' ? '보인자로 표시' : mk === 'q' ? '모름으로 표시' : '표시 없음'}${verdictLabel ? `, 판정 결과 ${verdictLabel}` : ''}`;
      s += `<g class="person" data-id="${p.id}"${challenge ? ` data-num="${p.num || i + 1}"` : ''}${interactive ? ` role="button" tabindex="0" aria-label="${label}" aria-disabled="${judged}"` : ''}>`;
      if (interactive) s += `<rect class="touch-target" x="${cx - 25}" y="${cy - 25}" width="50" height="50" fill="transparent"/>`;
      if (ring) s += `<circle class="verdict-ring" cx="${cx}" cy="${cy}" r="23" fill="none" stroke="${ring}" stroke-width="3" ${verdict === '!' ? 'stroke-dasharray="5 4"' : ''}/>`;
      s += shape + half + q;
      // 사람 중심 위의 작은 배지로 이웃 사람과 번호를 피한다.
      if (verdict) s += `<g class="verdict" data-art="교체 예정"><circle cx="${cx}" cy="${cy - 12}" r="7" fill="var(--panel)"/><text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="var(--font-svg-label)" font-weight="800" fill="${ring}">${verdict}</text></g>`;
      if (challenge) s += `<text class="person-number" x="${cx}" y="${cy + 38}" text-anchor="middle" font-size="var(--font-svg-label)" font-weight="700">${p.num || i + 1}</text>`;
      if (active.has(p.id)) s += `<circle class="proof-ring" cx="${cx}" cy="${cy}" r="24" fill="none" stroke="var(--proof)" stroke-width="2.3" pointer-events="none"/>`;
      s += '</g>';
    }
    return s + '</svg>';
  }
  function draw(focusId) {
    const L = current();
    $('field').innerHTML = pedigreeHTML(L);
    $('field').querySelectorAll('.person').forEach(g => {
      g.onclick = () => tap(g.dataset.id);
      g.onkeydown = e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); if (!e.repeat) tap(g.dataset.id);
      };
    });
    if (focusId) $('field').querySelector(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
    const count = sol.must.length - Object.values(marks).filter(v => v === 'c').length;
    $('mines').textContent = challenge === 2 ? '---' : String(count).padStart(3, '0').replace(/^0(?=-)/, '');
    $('mines').setAttribute('aria-label', challenge === 2 ? '남은 보인자 수 숨김' : `남은 보인자 수 ${count}명`);
    $('mines').title = challenge === 2 ? '유전 방식을 추리하므로 남은 수는 숨긴다' : '확실한 보인자 수에서 ◐ 표시한 수를 뺀 값(맞았는지는 판정할 때 알 수 있다)';
    $('lvl').textContent = challenge ? `도전 ${challenge} · ${li + 1}/4 · ${challenge === 2 ? '형질 (가) — 열성, 유전 방식 숨김' : L.mode === 'x' ? 'X 염색체 열성 유전 · 적록 색맹' : '상염색체 열성 유전'}` : `${L.title} · ${L.trait}`;
    $('stagehud').textContent = challenge ? '' : `${li + 1}/4단계`;
    $('playhud').textContent = `점수 ${playScore} · 연속 ${combo}`;
    $('practice').hidden = !challenge || !fixedSeed;
    document.querySelectorAll('[data-mode]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mode === chosenMode)); b.disabled = judged; });
  }
  function tap(id) {
    if (judged) return;
    const L = current(), p = L.people.find(q => q.id === id);
    if (p.affected) return toast(challenge === 2 ? '발현자는 보인자가 아니다. 열성 대립유전자만 가진다.' : L.mode === 'x' && p.sex === 'M'
      ? `발현한 남성은 보인자가 아니다. 하나뿐인 X 염색체에 ${challenge === 1 ? '색맹 대립유전자' : '열성 대립유전자'}가 있다(XᵃY).`
      : `발현자는 보인자가 아니다. ${challenge === 1 && L.mode === 'x' ? '색맹 대립유전자' : '열성 대립유전자'}만 두 개 가진다(${L.mode === 'x' ? 'XᵃXᵃ' : 'aa'}).`);
    marks[id] = marks[id] === 'c' ? 'q' : marks[id] === 'q' ? undefined : 'c'; draw(id);
  }
  function toast(text) {
    $('toast').textContent = text; $('toast').classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(() => $('toast').classList.remove('on'), Math.min(6000, Math.max(2200, Array.from(text).length * 70)));
  }
  function conditionsHTML(L) {
    return `<ul class="conditions"><li>○ 이 형질은 열성이다.</li><li>○ ${challenge === 2 ? '이 형질의 유전자가 상염색체에 있는지 X 염색체에 있는지는 알려 주지 않는다.' : `이 형질의 유전자는 ${L.mode === 'x' ? 'X 염색체에 있다. 이 형질은 적록 색맹이다.' : '상염색체에 있다.'}`}</li></ul>`;
  }
  function cardsHTML(L, interactive = true, active = new Set()) {
    const cards = L.cards || [], tests = cards.filter(c => c.type === 'noA');
    const text = cards.map((c, i) => interactive
      ? `<button class="card-btn${active.has(i + 1) ? ' active' : ''}" data-card="${i + 1}" aria-label="${esc(c.text)} 해당 사람 강조">${esc(c.text)}</button>`
      : `<p class="reference-card" data-reference-card="${i + 1}">${esc(c.text)}</p>`).join('');
    if (!tests.length) return text;
    const number = c => L.people.find(p => p.id === c.id).num;
    return text + (challenge === 1 && L.mode === 'x'
      ? `<table aria-label="유전자 검사 결과"><thead><tr><th scope="col">사람</th><th scope="col">색맹 대립유전자</th></tr></thead><tbody>${tests.map(c => `<tr><th scope="row">${number(c)}번</th><td>없음</td></tr>`).join('')}</tbody></table>`
      : `<table aria-label="유전자 검사 결과"><tbody><tr><th scope="row">유전자 검사</th><td>${tests.map(c => `${number(c)}번: a 없음`).join(' · ')}</td></tr></tbody></table>`);
  }
  function clues() {
    const L = current(), active = new Set([...flashCards, ...(solutionOpen ? walk[walkIndex].cards : [])]);
    const facts = $('facts'); $('problem').append(facts);
    $('clues').innerHTML = '<h2>자료</h2>' + conditionsHTML(L) + cardsHTML(L, true, active);
    $('clues').append($('facts'));
    requestClueNotice();
    $('clues').querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
      const n = Number(b.dataset.card), c = L.cards[n - 1];
      clearTimeout(flashT); flashPeople = c.ids || [c.id]; flashCards = [n]; draw(); clues();
      $('clues').querySelector(`[data-card="${n}"]`)?.focus({ preventScroll: true });
      flashT = setTimeout(() => { flashPeople = []; flashCards = []; if (sol) { draw(); clues(); } }, 1500);
    });
  }
  let noticeFrame;
  function requestClueNotice() {
    cancelAnimationFrame(noticeFrame);
    noticeFrame = requestAnimationFrame(updateClueNotice);
  }
  function updateClueNotice() {
    if (!sol || judged || $('problem').hidden) { $('more-clues').hidden = true; return; }
    const notice = $('more-clues');
    // 안내가 켜지며 하단 줄 높이가 변하는 진동을 피하도록 안내 한 줄 공간을 미리 뺀다.
    const controlsTop = (challenge === 2 ? $('mode-picker') : $('judge')).getBoundingClientRect().top;
    const limit = controlsTop - 24;
    const rows = [...$('clues').querySelectorAll('.conditions li, [data-card], table tr, #facts[open] li')];
    const covered = rows.find(el => el.getBoundingClientRect().bottom > limit);
    notice.hidden = !covered;
    if (covered) notice.textContent = covered.dataset.card
      ? `자료 ${['①', '②'][Number(covered.dataset.card) - 1]} 아래에 있다 · 내려서 확인하세요`
      : covered.closest('table') ? '검사 표가 아래에 있다 · 내려서 확인하세요'
        : '자료 일부가 아래에 있다 · 내려서 확인하세요';
  }
  window.addEventListener('scroll', requestClueNotice, { passive: true });
  window.addEventListener('resize', requestClueNotice);
  $('facts').addEventListener('toggle', requestClueNotice);
  function renderSolution() {
    $('solution').hidden = !solutionOpen;
    if (!solutionOpen) return;
    const step = walk[walkIndex];
    $('step-text').textContent = step.text; $('step-count').textContent = `풀이 ${walkIndex + 1}/${walk.length}`;
    $('solution').dataset.people = JSON.stringify(step.people); $('solution').dataset.cards = JSON.stringify(step.cards);
    $('prev-step').disabled = walkIndex === 0; $('next-step').disabled = walkIndex === walk.length - 1;
  }
  function startLevel() {
    judged = false; marks = {}; chosenMode = null; solutionOpen = false; walkIndex = 0;
    clearTimeout(flashT); clearTimeout(toastT); flashPeople = []; flashCards = []; $('toast').classList.remove('on');
    sol = PD.solve(current());
    $('problem').hidden = false; $('result').innerHTML = ''; $('judge').textContent = '판정하기'; $('judge').classList.remove('judged'); $('actions').classList.remove('judged'); $('face').disabled = false; $('face').textContent = '표시 지우기';
    $('solution').hidden = true; $('mode-picker').hidden = challenge !== 2; $('facts').hidden = challenge !== 2; $('facts').open = false; $('more-clues').hidden = true;
    $('timer').textContent = '000'; t0 = Date.now(); clearInterval(timerId);
    timerId = setInterval(() => { $('timer').textContent = String(Math.min(999, Math.floor((Date.now() - t0) / 1000))).padStart(3, '0'); }, 500);
    draw(); clues(); window.scrollTo(0, 0); updateClueNotice(); requestClueNotice();
  }
  const blocked = () => !sol || !$('overlay').hidden;
  function basicName(L, id) {
    const maxGen = Math.max(...L.people.map(p => p.gen));
    const base = p => p.gen === 0 ? maxGen >= 2 ? p.sex === 'M' ? '할아버지' : '할머니' : p.sex === 'M' ? '아버지' : '어머니'
      : !p.parents ? p.sex === 'M' ? '사위' : '며느리' : p.gen === maxGen && maxGen >= 2 ? p.sex === 'M' ? '손자' : '손녀' : p.sex === 'M' ? '아들' : '딸';
    const p = L.people.find(p => p.id === id), n = base(p), same = L.people.filter(p => base(p) === n).sort((a, b) => a.x - b.x);
    return same.length > 1 ? `${n}(왼쪽에서 ${same.indexOf(p) + 1}번째)` : n;
  }
  function judge() {
    if (blocked()) return;
    if (judged) { if (li < bundle.length - 1) { li++; startLevel(); } else finishAll(); return; }
    if (challenge === 2 && !chosenMode) return toast('유전 방식을 먼저 고른다');
    const L = current(), result = grade(L, sol, marks, chosenMode), seconds = Math.round((Date.now() - t0) / 1000);
    judged = true; clearInterval(timerId);
    for (const k of ['correct', 'wrong', 'missed']) total[k] += result[k].length;
    total.must += sol.must.length; total.maleMarkedX += result.maleMarkedX; total.maybeMarked += result.maybeMarked;
    if (result.perfect) { playScore += 10; combo++; maxCombo = Math.max(maxCombo, combo); } else combo = 0;
    const deduction = challenge ? PD.deduce(L) : null;
    const detail = problemDetail(L, result, sol.must.length, seconds, chosenMode, deduction);
    total.perLevel.push(challenge ? detail : { level: li + 1, correct: detail.correct, wrong: detail.wrong, missed: detail.missed, maleMarkedX: detail.maleMarkedX, maybeMarked: detail.maybeMarked, seconds });
    $('face').disabled = true; $('face').innerHTML = '표시 지우기<small>판정 뒤 꺼짐</small>';
    $('actions').classList.add('judged'); $('more-clues').hidden = true;
    const explanation = challenge ? PD.explain({ ...L, modeHidden: false }) : null;
    const name = id => challenge ? `${L.people.find(p => p.id === id).num}번` : basicName(L, id);
    const why = id => challenge ? explanation[id].chain.slice(-2).join(' ') : PD.reason(L, id);
    const wrongWhy = id => {
      const p = L.people.find(p => p.id === id);
      if (L.mode === 'x' && p.sex === 'M') return '남성은 X 염색체가 하나뿐이라 보인자가 될 수 없다. 정상 남성은 정상 대립유전자만 가진다.';
      if (sol.maybe.includes(id)) return challenge ? `가계도와 자료로는 ${challenge === 1 && L.mode === 'x' ? '색맹 대립유전자' : 'a'}가 있는지 정할 수 없는데 표시했다 — 지뢰!` : '보인자일 수도, 아닐 수도 있다. 단서만으로는 확정할 수 없는데 찍었다 — 지뢰!';
      return challenge ? explanation[id].chain.at(-1) : '주어진 단서로 보면 보인자가 아니다.';
    };
    const w = challenge ? PD.walkthrough(L) : null;
    walk = w ? [...w.modeSteps, ...w.steps] : [];
    const modeConclusion = w?.modeSteps.find(s => s.text.includes('모순이므로'));
    const modeText = modeConclusion ? [...w.modeSteps.map(s => s.text)].join(' ') : '';
    $('result').innerHTML = `<div class="result">${modeText ? `<p class="mode-reason"><b>유전 방식 판단</b> — ${esc(modeText)}</p>` : ''}
      ${challenge === 2 ? `<p class="chosen-mode">고른 방식: ${chosenMode === 'x' ? 'X 염색체 유전' : '상염색체 유전'}</p>` : ''}
      <p><b>${result.modeWrong ? '유전 방식이 맞지 않는다' : result.perfect ? challenge ? '완전 해결' : '완벽한 추론!' : result.wrong.length ? '지뢰를 밟았다!' : '놓친 보인자가 있다'}</b></p>
      <p>맞힘 ${result.correct.length} · 놓침 ${result.missed.length} · 잘못 표시 ${result.wrong.length}${challenge ? ` · 이 문제 점수 ${result.perfect ? 10 : 0}` : ''}</p>
      <ul>${result.correct.map(id => `<li data-art="교체 예정">✓ ${name(id)}: ${esc(why(id))}</li>`).join('')}${result.missed.map(id => `<li data-art="교체 예정">! ${name(id)}(놓침): ${esc(why(id))}</li>`).join('')}${result.wrong.map(id => `<li data-art="교체 예정">✗ ${name(id)}: ${esc(wrongWhy(id))}</li>`).join('')}</ul>
      ${!challenge && sol.maybe.length ? `<p class="note">보인자일 수도 있는 사람: ${sol.maybe.map(name).join(', ')} — 가계도만으로는 알 수 없다(유전자 검사가 필요).</p>` : ''}
      ${challenge ? '<button class="btn" id="show-solution" aria-expanded="false" aria-controls="solution">풀이 보기</button>' : ''}</div>`;
    if (challenge) $('show-solution').onclick = () => {
      solutionOpen = !solutionOpen; clearTimeout(flashT); flashPeople = []; flashCards = [];
      $('show-solution').setAttribute('aria-expanded', String(solutionOpen)); $('show-solution').textContent = solutionOpen ? '풀이 닫기' : '풀이 보기';
      draw(); clues(); renderSolution();
      if (solutionOpen) $('field').scrollIntoView({ block: 'start' });
    };
    // art: 교체 예정 다음 문제·단계의 화살표
    $('judge').textContent = li < bundle.length - 1 ? challenge ? '다음 문제 →' : '다음 단계 →' : '결과 보기';
    $('judge').classList.add('judged'); draw(); $('result').scrollIntoView({ block: 'start' });
  }
  function finishAll() {
    A.finish($('overlay'), {
      id: 'pedigree', stars: starsFor(total), score: total.correct * 10 - total.wrong * 5,
      ...finishSummary(total, { challenge, fixedSeed, basicEligible, playScore, maxCombo, bundleSeed }),
      quiz: { q: '어머니가 적록 색맹 보인자이고 아버지는 정상일 때, 아들이 색맹일 확률은?', options: ['1/2', '1/4'], answer: 0,
        explain: '아들의 X 염색체는 어머니에게서 온다. 어머니의 X 두 개 중 색맹 대립유전자를 가진 X를 받을 확률은 1/2이다.' },
      reflection: challenge ? '마지막 문제에서 반드시 보인자인 사람 한 명을 골라, 두 가지 이상의 단서를 어떻게 이어서 판단했는지 쓰세요.'
        : '4단계 가계도에서 “반드시 보인자인 사람”을 한 명 골라, 그렇게 판단한 근거를 부모와 자녀의 형질로 설명하세요. 사람의 유전을 연구할 때 교배 실험 대신 가계도 분석을 쓰는 까닭도 함께 쓰세요.',
      onRetry: chooser,
    });
    const L = current(), reference = document.createElement('figure');
    reference.className = 'pedigree-reference';
    reference.innerHTML = `<figcaption>${challenge ? '마지막 문제' : '4단계'} 가계도 · ${esc(L.trait)}</figcaption>${challenge ? conditionsHTML(L) + cardsHTML(L, false) : ''}${pedigreeHTML(L, false)}`;
    $('overlay').querySelector('#ar-refl').closest('.refl').before(reference);
  }
  $('facts').innerHTML = '<summary>판단에 쓰는 사실</summary>' + factsHTML();
  $('choose-basic').onclick = () => select(0); $('choose-1').onclick = () => select(1); $('choose-2').onclick = () => select(2);
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (!judged) { chosenMode = b.dataset.mode; draw(); } });
  $('prev-step').onclick = () => { walkIndex = Math.max(0, walkIndex - 1); draw(); clues(); renderSolution(); };
  $('next-step').onclick = () => { walkIndex = Math.min(walk.length - 1, walkIndex + 1); draw(); clues(); renderSolution(); };
  $('judge').onclick = judge;
  $('face').onclick = () => { if (!blocked() && !judged) { marks = {}; draw(); } };
  A.intro($('overlay'), {
    id: 'pedigree', rules: [
      '반드시 보인자인 사람을 눌러 ◐ 표시한다. 한 번 더 누르면 ? 모름, 다시 누르면 표시가 없어진다. 보인자일 수도 있는 사람에게 표시하면 지뢰다.',
      '「표시 지우기」는 판정 전에 표시를 모두 지운다. 판정 뒤에는 꺼진다.',
      '기본 판은 고정 4문제다. 1·2단계는 상염색체 열성 유전, 3·4단계는 X 염색체 열성 유전(적록 색맹)이다.',
      '도전 1 · 단서 조합은 가계도와 자료를 이어 푼다. 판마다 새 문제 4개가 나온다.',
      '도전 2 · 유전 방식 추리는 시작 안내와 자료 칸의 네 가지 사실로 상염색체 유전인지 X 염색체 유전인지도 고른다. 도전 1 한 묶음을 지뢰 0, 놓친 보인자 1명 이하로 끝내면 열린다.',
      '왼쪽 숫자는 확실한 보인자 수에서 ◐ 표시한 수를 뺀 값이다. 도전 2에서는 숨긴다. 표시가 맞는지는 판정할 때 알 수 있다.',
    ], onStart: chooser,
  });
})(typeof window !== 'undefined' ? window : globalThis);
