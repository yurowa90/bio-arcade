/* 가계도 지뢰찾기 — 화면과 진행 */
(function () {
  const PD = window.Pedigree, A = window.Arcade;
  const $ = id => document.getElementById(id);
  let li = 0, marks = {}, judged = false, t0 = 0, timerId = null;
  // maleMarkedX: X 염색체 열성 단계에서 남성을 보인자로 표시한 수, maybeMarked: 보인자일 수도 있는 사람을 표시한 수
  const total = { correct: 0, wrong: 0, missed: 0, must: 0, maleMarkedX: 0, maybeMarked: 0, perLevel: [] };
  let sol;

  const X = x => 24 + x * 40, Y = gen => 40 + gen * 105, R = 16;
  function pedigreeHTML(L, interactive = true) {
    const P = Object.fromEntries(L.people.map(p => [p.id, p]));
    const maxGen = Math.max(...L.people.map(p => p.gen));
    const H = Y(maxGen) + 50;
    let s = `<svg viewBox="0 0 360 ${H}" role="${interactive ? 'group' : 'img'}" aria-label="${interactive ? '가계도' : '4단계 가계도: 네모는 남성, 원은 여성, 검게 칠한 사람은 형질 발현'}">`;
    // 부부선과 자녀선
    for (const [a, b] of L.couples) {
      const pa = P[a], pb = P[b];
      s += `<line x1="${X(pa.x)}" y1="${Y(pa.gen)}" x2="${X(pb.x)}" y2="${Y(pb.gen)}" stroke="#333" stroke-width="2"/>`;
      const kids = L.people.filter(k => k.parents && k.parents.includes(a) && k.parents.includes(b));
      if (kids.length) {
        const mx = (X(pa.x) + X(pb.x)) / 2, y0 = Y(pa.gen), ym = y0 + 52;
        const xs = kids.map(k => X(k.x));
        s += `<line x1="${mx}" y1="${y0}" x2="${mx}" y2="${ym}" stroke="#333" stroke-width="2"/>`;
        s += `<line x1="${Math.min(mx, ...xs)}" y1="${ym}" x2="${Math.max(mx, ...xs)}" y2="${ym}" stroke="#333" stroke-width="2"/>`;
        kids.forEach(k => { s += `<line x1="${X(k.x)}" y1="${ym}" x2="${X(k.x)}" y2="${Y(k.gen) - R}" stroke="#333" stroke-width="2"/>`; });
      }
    }
    // 사람
    for (const p of L.people) {
      const cx = X(p.x), cy = Y(p.gen), mk = interactive ? marks[p.id] : undefined;
      const fill = p.affected ? '#222' : '#fff';
      let ring = '';
      let verdict = '';
      if (interactive && judged) {
        const must = sol.must.includes(p.id);
        if (mk === 'c' && must) ring = '#1f8a4c'; else if (mk === 'c' && !must) ring = '#c0392b'; else if (must) ring = '#e69138';
        verdict = ring === '#1f8a4c' ? '✓' : ring === '#c0392b' ? '✗' : ring ? '!' : '';
      }
      const shape = p.sex === 'M'
        ? `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" fill="${fill}" stroke="#222" stroke-width="2.5"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${fill}" stroke="#222" stroke-width="2.5"/>`;
      const half = mk === 'c' && !p.affected ? (p.sex === 'M'
        ? `<rect x="${cx}" y="${cy - R}" width="${R}" height="${2 * R}" fill="#6b4fa0"/>`
        : `<path d="M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} Z" fill="#6b4fa0"/>`) : '';
      const q = mk === 'q' ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="18" font-weight="800" fill="#6b4fa0">?</text>` : '';
      const ringEl = ring ? `<circle cx="${cx}" cy="${cy}" r="${R + 7}" fill="none" stroke="${ring}" stroke-width="4" ${ring === '#e69138' ? 'stroke-dasharray="5 4"' : ''}/>` : '';
      const position = L.people.filter(q => q.gen === p.gen).sort((a, b) => a.x - b.x).findIndex(q => q.id === p.id) + 1;
      const personLabel = `${p.gen + 1}세대 왼쪽에서 ${position}번째, ${p.sex === 'M' ? '남성' : '여성'}, ${p.affected ? '형질 발현' : '형질 미발현'}, ${mk === 'c' ? '보인자로 표시' : mk === 'q' ? '모름으로 표시' : '표시 없음'}`;
      s += `<g class="person" data-id="${p.id}"${interactive ? ` role="button" tabindex="0" aria-label="${personLabel}" aria-disabled="${judged}"` : ''}><rect class="touch-target" x="${cx - 24}" y="${cy - 24}" width="48" height="48" fill="transparent"/>${ringEl}${shape}${half}${q}${verdict ? `<text class="verdict" x="${cx + 22}" y="${cy - 17}" text-anchor="middle" font-size="18" font-weight="800" fill="#222">${verdict}</text>` : ''}</g>`;
    }
    s += '</svg>';
    return s;
  }
  function draw(focusId) {
    const L = PD.LEVELS[li];
    $('field').innerHTML = pedigreeHTML(L);
    $('field').querySelectorAll('.person').forEach(g => {
      g.addEventListener('click', () => tap(g.dataset.id));
      g.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!e.repeat) tap(g.dataset.id);
      });
    });
    if (focusId) $('field').querySelector(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
    const flagged = Object.values(marks).filter(v => v === 'c').length;
    $('mines').textContent = String(sol.must.length - flagged).padStart(3, '0').replace(/^0(?=-)/, '');
    $('lvl').innerHTML = `<b>${L.title}</b> · ${L.trait}`;
    $('stagehud').textContent = `${li + 1}/${PD.LEVELS.length}단계`;
  }
  function tap(id) {
    if (judged) return;
    const L = PD.LEVELS[li], p = L.people.find(q => q.id === id);
    if (p.affected) return toast(L.mode === 'x' && p.sex === 'M'
      ? '발현한 남성은 보인자가 아니다. 하나뿐인 X 염색체에 열성 대립유전자가 있다(XᵃY).'
      : `발현자는 보인자가 아니다. 열성 대립유전자만 두 개 가진다(${L.mode === 'x' ? 'XᵃXᵃ' : 'aa'}).`);
    marks[id] = marks[id] === 'c' ? 'q' : marks[id] === 'q' ? undefined : 'c';
    draw(id);
  }
  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), Math.min(6000, Math.max(2200, Array.from(t).length * 70))); }

  function startLevel() {
    judged = false; marks = {};
    sol = PD.solve(PD.LEVELS[li]);
    $('result').innerHTML = ''; $('judge').textContent = '판정하기'; $('face').disabled = false;
    $('timer').textContent = '000';
    t0 = Date.now(); clearInterval(timerId);
    timerId = setInterval(() => { $('timer').textContent = String(Math.min(999, Math.floor((Date.now() - t0) / 1000))).padStart(3, '0'); }, 500);
    draw();
  }
  const blocked = () => !sol || !$('overlay').hidden;
  function judge() {
    if (blocked()) return;
    if (judged) { // 다음 단계로
      if (li < PD.LEVELS.length - 1) { li++; startLevel(); } else finishAll();
      return;
    }
    judged = true; clearInterval(timerId);
    const L = PD.LEVELS[li];
    const flagged = Object.keys(marks).filter(k => marks[k] === 'c');
    const correct = flagged.filter(id => sol.must.includes(id));
    const wrong = flagged.filter(id => !sol.must.includes(id));
    const missed = sol.must.filter(id => !flagged.includes(id));
    const maleMarkedX = L.mode === 'x' ? wrong.filter(id => L.people.find(q => q.id === id).sex === 'M').length : 0;
    const maybeMarked = wrong.filter(id => sol.maybe.includes(id)).length;
    total.correct += correct.length; total.wrong += wrong.length; total.missed += missed.length; total.must += sol.must.length;
    total.maleMarkedX += maleMarkedX; total.maybeMarked += maybeMarked;
    total.perLevel.push({ level: li + 1, correct: correct.length, wrong: wrong.length, missed: missed.length, maleMarkedX, maybeMarked, seconds: Math.round((Date.now() - t0) / 1000) });
    $('face').disabled = true;
    const maxGen = Math.max(...L.people.map(q => q.gen));
    const baseName = p => {
      const M = p.sex === 'M';
      if (p.gen === 0) return maxGen >= 2 ? (M ? '할아버지' : '할머니') : (M ? '아버지' : '어머니');
      if (!p.parents) return M ? '사위' : '며느리';
      if (p.gen === maxGen && maxGen >= 2) return M ? '손자' : '손녀';
      return M ? '아들' : '딸';
    };
    const name = id => {
      const p = L.people.find(q => q.id === id), n = baseName(p);
      const same = L.people.filter(q => baseName(q) === n).sort((a, b) => a.x - b.x);
      return same.length > 1 ? `${n}(왼쪽에서 ${same.indexOf(p) + 1}번째)` : n;
    };
    const wrongWhy = id => {
      const p = L.people.find(q => q.id === id);
      if (L.mode === 'x' && p.sex === 'M') return '남성은 X 염색체가 하나뿐이라 보인자가 있을 수 없다. 정상 남성은 정상 대립유전자만 가진다.';
      if (sol.maybe.includes(id)) return '보인자일 수도, 아닐 수도 있다. 단서만으로는 확정할 수 없는데 찍었다 — 지뢰!';
      return '주어진 단서로 보면 보인자가 아니다.';
    };
    $('result').innerHTML = `<div class="result">
      <p><b>${wrong.length ? '💥 지뢰를 밟았다!' : missed.length ? '놓친 보인자가 있다' : '완벽한 추론!'}</b> 맞힘 ${correct.length} · 놓침 ${missed.length} · 잘못 표시 ${wrong.length}</p>
      <ul>${correct.map(id => `<li>✅ ${name(id)}: ${PD.reason(L, id)}</li>`).join('')}
        ${missed.map(id => `<li>🟠 ${name(id)}(놓침): ${PD.reason(L, id)}</li>`).join('')}
        ${wrong.map(id => `<li>❌ ${name(id)}: ${wrongWhy(id)}</li>`).join('')}</ul>
      ${sol.maybe.length ? `<p class="note">보인자일 수도 있는 사람: ${sol.maybe.map(name).join(', ')} — 가계도만으로는 알 수 없다(유전자 검사가 필요).</p>` : ''}</div>`;
    $('judge').textContent = li < PD.LEVELS.length - 1 ? '다음 단계 →' : '결과 보기';
    draw();
    $('result').scrollIntoView({ block: 'start' });
  }
  function finishAll() {
    const perfect = total.wrong === 0 && total.missed === 0;
    // 별 1개도 잘못 표시가 확실한 보인자 수의 절반 이하일 때만 준다. 정상인을 전부 찍으면 0개다.
    const stars = perfect ? 3
      : (total.wrong <= 2 && total.correct >= total.must * 0.8) ? 2
      : (total.wrong <= total.must * 0.5 && total.correct >= total.must * 0.5) ? 1 : 0;
    A.finish($('overlay'), {
      id: 'pedigree', stars, score: total.correct * 10 - total.wrong * 5,
      detail: total,
      lines: [`확실한 보인자 ${total.must}명 중 ${total.correct}명을 찾았다. 잘못 표시 ${total.wrong}명.`,
        total.wrong ? '“보인자일 수도 있다”와 “반드시 보인자다”는 다르다. 과학적 추론은 근거가 있는 곳까지만 말한다.' : '근거가 있는 곳까지만 판단했다. 훌륭한 추론이다.'],
      quiz: { q: '어머니가 적록 색맹 보인자이고 아버지는 정상일 때, 아들이 색맹일 확률은?', options: ['1/2', '1/4'], answer: 0,
        explain: '아들의 X 염색체는 어머니에게서 온다. 어머니의 X 두 개 중 색맹 대립유전자를 가진 X를 받을 확률은 1/2이다.' },
      reflection: '4단계 가계도에서 “반드시 보인자인 사람”을 한 명 골라, 그렇게 판단한 근거를 부모와 자녀의 형질로 설명하세요. 사람의 유전을 연구할 때 교배 실험 대신 가계도 분석을 쓰는 까닭도 함께 쓰세요.',
      onRetry: () => { li = 0; Object.assign(total, { correct: 0, wrong: 0, missed: 0, must: 0, maleMarkedX: 0, maybeMarked: 0, perLevel: [] }); startLevel(); },
    });
    // 문항에 필요한 형질·관계만 다시 그린다. 학생 표시·정오 기호·근거 목록은 넣지 않는다.
    const reference = document.createElement('figure');
    reference.className = 'pedigree-reference';
    reference.innerHTML = `<figcaption>4단계 가계도 · ${PD.LEVELS[3].trait}</figcaption>${pedigreeHTML(PD.LEVELS[3], false)}`;
    const reflection = $('overlay').querySelector('#ar-refl');
    reflection.closest('.refl').before(reference);
  }
  $('judge').onclick = judge;
  $('face').onclick = () => { if (!blocked() && !judged) { marks = {}; draw(); } };

  A.intro($('overlay'), {
    id: 'pedigree',
    rules: [
      '가계도에서 <b>반드시 보인자인 사람</b>을 찾아 눌러 ◐ 표시한다. 왼쪽 위 숫자는 확실한 보인자 수에서 ◐ 표시한 수를 뺀 값이다. 표시가 맞았는지는 판정할 때 알 수 있다.',
      '보인자일 수도 있고 아닐 수도 있는 사람에게 표시하면 <b>지뢰</b>! 모르면 “?”로 남겨 두자.',
      '「표시 지우기」는 판정 전에 이 단계의 표시를 모두 지운다. 판정한 뒤에는 꺼진다.',
      '1·2단계는 상염색체 열성 유전, 3·4단계는 X 염색체 열성 유전(적록 색맹)이다.',
      '정답은 가능한 유전자형 조합을 모두 따지는 해결기가 계산한다.',
    ],
    onStart: startLevel,
  });
})();
