/* 멘델의 텃밭 — 화면과 진행 */
(function () {
  const G = window.Genetics, A = window.Arcade;
  const $ = id => document.getElementById(id);
  const POTS = 12, DAYS = 24, N_SEEDS = 16;
  let S, uid = 0;
  const TESTER = Object.assign(G.fromGenotype('rryy'), { known: true }); // 검정 교배 상대(열성 순종)

  function newPlant(shape, color, extra) { return Object.assign({ id: ++uid, shape, color, known: false }, extra || {}); }
  function reset() {
    const P1 = newPlant(['R', 'R'], ['Y', 'Y'], { known: true, tag: '순종' });
    const P2 = newPlant(['r', 'r'], ['y', 'y'], { known: true, tag: '순종' });
    S = { pots: [P1, P2, ...Array(POTS - 2).fill(null)], sel: [], days: DAYS, over: false,
      pheno: new Set(['RY', 'ry']), geno: new Set(['RRYY', 'rryy']), notes: [], tests: 0, wrongTests: 0, inferred: 0, wrongInfers: 0 };
    lockStage(false);
    render();
    info('가게에서 순종 완두 두 그루를 받았다. 둥글고 황색(RRYY), 주름지고 녹색(rryy). 두 화분을 눌러 골라 교배해 보자!');
  }

  /* ---------- 그리기 ---------- */
  function peaSVG(p) {
    const fill = G.yellow(p) ? '#f2c94c' : '#7cb342', stroke = G.yellow(p) ? '#b8912a' : '#4e7a26';
    if (G.round(p)) return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="${fill}" stroke="${stroke}" stroke-width="3"/><circle cx="14" cy="14" r="4" fill="#fff" opacity=".45"/></svg>`;
    return `<svg viewBox="0 0 40 40"><path d="M20 5 L25 11 L34 12 L30 20 L34 28 L25 29 L20 35 L15 29 L6 28 L10 20 L6 12 L15 11 Z" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/></svg>`;
  }
  const potName = p => `${G.PHENO_NAME[G.phenoKey(p)]}, 유전자형 ${p.known ? G.genotype(p) : '모름'}${p.tag ? `, ${p.tag}` : ''}`;
  function render() {
    $('garden').innerHTML = S.pots.map((p, i) => p
      ? `<button class="pot ${S.sel.includes(i) ? 'sel' : ''}" data-i="${i}" aria-pressed="${S.sel.includes(i)}" aria-label="${potName(p)}">${p.tag ? `<span class="tag">${p.tag}</span>` : ''}${peaSVG(p)}<span class="gt">${p.known ? G.genotype(p) : '?'}</span></button>`
      : `<button class="pot empty" data-i="${i}" aria-label="빈 화분">빈 화분</button>`).join('');
    $('garden').querySelectorAll('.pot').forEach(b => b.onclick = () => {
      const i = +b.dataset.i; if (!S.pots[i]) return;
      S.sel = S.sel.includes(i) ? S.sel.filter(x => x !== i) : [...S.sel, i].slice(-2);
      render();
      const p = S.pots[i];
      if (S.sel.includes(i)) info(`${G.PHENO_NAME[G.phenoKey(p)]} 완두 — 유전자형 ${p.known ? G.genotype(p) : '모름'}${p.from ? ` (부모: ${p.from})` : ''}`);
    });
    $('days').textContent = S.days;
    $('cardcount').textContent = `${S.geno.size}/9`;
  }
  function cardsHTML() {
    const pk = ['RY', 'Ry', 'rY', 'ry'];
    return `<h3>표현형 카드 ${S.pheno.size}/4</h3><div class="cards">${pk.map(k => {
      const p = { shape: [k[0], k[0]], color: [k[1], k[1]] };
      return `<div class="cardx ${S.pheno.has(k) ? 'got' : ''}">${S.pheno.has(k) ? peaSVG(p) : '?'}${G.PHENO_NAME[k]}</div>`;
    }).join('')}</div>
      <h3>유전자형 카드 ${S.geno.size}/9 <span style="font-weight:400">— 검정 교배나 추론으로 확인해야 얻는다</span></h3>
      <div class="cards g9">${G.ALL_GENOTYPES.map(g => `<div class="cardx ${S.geno.has(g) ? 'got' : ''}">${S.geno.has(g) ? peaSVG(G.fromGenotype(g)) : '?'}${S.geno.has(g) ? g : ''}</div>`).join('')}</div>`;
  }
  function notesHTML() {
    if (!S.notes.length) return '';
    return `<h3>실험 노트 (관찰 수 / 기대 비율)</h3><table class="note-table"><tr><th>교배</th><th>둥·황</th><th>둥·녹</th><th>주·황</th><th>주·녹</th></tr>
      ${S.notes.slice(-4).reverse().map(n => { const e = noteExpected(n); return `<tr><td>${noteLabel(n)}</td>${['RY', 'Ry', 'rY', 'ry'].map(k => `<td>${n.tally[k]}<br><span style="color:#888">${e ? (e[k] * 16).toFixed(1) : '?'}</span></td>`).join('')}</tr>`; }).join('')}</table>
      <p class="note">회색 숫자는 16개 중 이론상 기대되는 개수. 부모의 유전자형을 알아야 계산할 수 있어서, 모르는 동안은 ?로 둔다. 개수가 적으면 우연 때문에 기대와 조금씩 다를 수 있다.</p>`;
  }
  function info(msg) { $('info').innerHTML = `<p>${msg}</p>${cardsHTML()}${notesHTML()}`; }
  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }

  /* ---------- 행동 ---------- */
  // 남은 날이 0이 되어도 바로 끝내지 않는다. 지금 띄운 화면(씨앗 심기·유전자형 문항)을 닫을 때 끝낸다.
  function spendDay() { S.days--; }
  // 오버레이가 떠 있는 동안 뒤쪽 화면(화분·도구 버튼)이 키보드로 눌리지 않게 막는다
  function lockStage(on) { $('stage').inert = on; }
  function focusCard() { const c = $('overlay').querySelector('.card'); if (c) { c.tabIndex = -1; c.focus({ preventScroll: true }); } }
  function openOverlay(html) { const ov = $('overlay'); ov.hidden = false; ov.innerHTML = html; lockStage(true); focusCard(); return ov; }
  function closeOverlay(msg) {
    $('overlay').hidden = true; lockStage(false); S.sel = []; render(); info(msg);
    if (S.days <= 0) end();
  }
  const busy = () => !S || S.over || !$('overlay').hidden;
  const label = p => `${G.PHENO_NAME[G.phenoKey(p)]}${p.known ? `(${G.genotype(p)})` : ''}`;
  // 노트 이름과 기대 개수는 그릴 때마다 계산한다. 기대 개수는 부모의 유전자형을 가정해야 구할 수 있으므로,
  // 유전자형을 아직 모르는 부모가 있으면 비워 둔다(숨은 유전자형이 기대값으로 새지 않게).
  const noteLabel = n => n.kind === 'self' ? `${label(n.a)} 자가 수분` : n.kind === 'test' ? `${label(n.a)} × rryy(검정)` : `${label(n.a)} × ${label(n.b)}`;
  const noteExpected = n => n.a.known && n.b.known ? G.expected(n.a, n.b) : null;
  // 새로 나온 겉모습을 표현형 카드로 등록한다(교배·자가 수분·검정 교배 모두)
  function collectPheno(tally) {
    const fresh = Object.keys(tally).filter(k => tally[k] > 0 && !S.pheno.has(k));
    fresh.forEach(k => S.pheno.add(k));
    return fresh;
  }
  const newPhenoHTML = ks => ks.length ? `<p><b>새 표현형 카드!</b> ${ks.map(k => G.PHENO_NAME[k]).join(', ')}</p>` : '';

  // 부모 유전자형을 알면 자손 유전자형이 하나로 정해지는가? (추론 가능 여부)
  function inferable(a, b) {
    if (!a.known || !b.known) return null;
    const set = new Set();
    for (const s1 of a.shape) for (const s2 of b.shape) for (const c1 of a.color) for (const c2 of b.color) set.add(G.genotype({ shape: [s1, s2], color: [c1, c2] }));
    return set.size === 1 ? [...set][0] : null;
  }

  function doCross(a, b, kind) {
    const kids = G.cross(a, b, N_SEEDS);
    const tally = G.tally(kids);
    S.notes.push({ kind, a, b, tally });
    const newPheno = collectPheno(tally);
    const inf = inferable(a, b);
    spendDay();
    showOffspring(kids, tally, newPheno, `${label(a)}${kind === 'self' ? ' 자가 수분' : ` × ${label(b)}`}`, inf);
  }
  function showOffspring(kids, tally, newPheno, title, inf) {
    const free = S.pots.filter(p => !p).length;
    const keep = new Set();
    const ov = openOverlay(`<div class="card"><h2>씨앗 16개 수확!</h2><p>${title}</p>
      <p>${Object.entries(tally).filter(([, v]) => v).map(([k, v]) => `${G.PHENO_NAME[k]} ${v}개`).join(' · ')}</p>
      ${newPhenoHTML(newPheno)}
      ${inf ? `<p class="note">부모의 유전자형을 모두 알고 있다. 이 자손들의 유전자형은 추론할 수 있다!</p>` : ''}
      <p>빈 화분 <b>${free}</b>개. 심을 씨앗을 고르세요.</p>
      <div class="offspring">${kids.map((k, i) => `<button class="seed" data-i="${i}" aria-label="${G.PHENO_NAME[G.phenoKey(k)]}" aria-pressed="false">${peaSVG(k)}</button>`).join('')}</div>
      <div class="row"><button class="btn primary" id="plant">고른 씨앗 심기</button></div></div>`);
    ov.querySelectorAll('.seed').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (keep.has(i)) keep.delete(i); else if (keep.size < free) keep.add(i); else return toast(`빈 화분이 ${free}개뿐이다`);
      b.classList.toggle('keep', keep.has(i)); b.setAttribute('aria-pressed', keep.has(i));
    });
    $('plant').onclick = () => {
      for (const i of keep) {
        const slot = S.pots.findIndex(p => !p);
        const k = kids[i];
        S.pots[slot] = newPlant(k.shape, k.color, { from: title, infer: inf });
      }
      closeOverlay(`${keep.size}그루를 심었다. 유전자형은 아직 “?”다. 검정 교배나 추론으로 알아내자.`);
    };
  }

  // how: 'test'(검정 교배, opt.tally = 화면에 나온 자손 집계) 또는 'infer'(추론, opt.why = 정답의 까닭)
  function askGenotype(p, how, evidenceHTML, opt = {}) {
    const cands = G.candidates(p), truth = G.genotype(p);
    // 검정 교배는 화면에 나온 자손으로 판단한다. 자손이 16개뿐이라 잡종(이형 접합)인데도 열성 자손이
    // 하나도 안 나올 수 있다(유전자 하나당 (1/2)^16). 그때도 자료에 맞는 판단(동형 접합)을 정답으로 본다.
    // 다만 열성 자손이 없다는 사실은 동형 접합을 확정하지 못하므로, 해설은 '가능성이 높다'로 쓰고
    // 표본 한계 안내를 실제 유전자형과 상관없이 늘 붙인다(같은 자료에는 같은 설명).
    const t = opt.tally;
    const key = how !== 'test' ? truth
      : (G.round(p) ? (t.rY + t.ry ? 'Rr' : 'RR') : 'rr') + (G.yellow(p) ? (t.Ry + t.ry ? 'Yy' : 'YY') : 'yy');
    const ov = openOverlay(`<div class="card"><h2>${how === 'test' ? '검정 교배 결과' : '유전자형 추론'}</h2>
      <p>${G.PHENO_NAME[G.phenoKey(p)]} 완두${p.from ? ` (부모: ${p.from})` : ''}</p>${evidenceHTML}
      <p><b>이 완두의 유전자형은?</b></p><div class="quiz-opts">${cands.map(g => `<button class="btn" data-g="${g}">${g}</button>`).join('')}</div>
      <p class="quiz-fb" hidden></p><div class="row"><button class="btn primary" id="gclose" hidden>확인</button></div></div>`);
    ov.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const ok = b.dataset.g === key, match = key === truth;
      ov.querySelectorAll('[data-g]').forEach(x => { x.disabled = true; if (x.dataset.g === key) x.classList.add('right'); });
      if (!ok) { b.classList.add('wrong'); if (how === 'test') S.wrongTests++; else S.wrongInfers++; }
      const fb = ov.querySelector('.quiz-fb'); fb.hidden = false;
      fb.innerHTML = ok ? (match ? `정답! <b>${truth}</b> 카드를 얻었다.` : '이번 자료로는 맞는 판단이다.') : `아쉽다. ${match ? '정답은' : '이번 자료로 판단하면'} <b>${key}</b>.`;
      if (how === 'test') {
        const ks = key.slice(0, 2), kc = key.slice(2);
        const shapeWhy = ks === 'Rr' ? '주름진 자손이 나왔으니 r을 하나 가진 Rr이다' : ks === 'RR' ? '자손이 모두 둥글었으니 RR일 가능성이 높다' : '주름진 모양은 열성 형질이므로 rr이다';
        const colorWhy = kc === 'Yy' ? '녹색 자손이 나왔으니 y를 하나 가진 Yy다' : kc === 'YY' ? '자손이 모두 황색이었으니 YY일 가능성이 높다' : '녹색은 열성 형질이므로 yy다';
        fb.innerHTML += ` 까닭: 검정 교배 상대(rryy)는 열성 대립유전자만 주므로, 자손의 겉모습으로 이 완두가 준 대립유전자를 알 수 있다. 모양은 ${shapeWhy}. 색깔은 ${colorWhy}.`;
        const homo = [ks === 'RR' && ['주름진 자손', 'Rr', '모양', 'RR'], kc === 'YY' && ['녹색 자손', 'Yy', '색깔', 'YY']].filter(Boolean);
        const homoTrait = `${homo.map(h => h[2]).join('·')}이 순종(${homo.map(h => h[3]).join(', ')})`;
        if (homo.length) fb.innerHTML += ` 다만 ${homo.map(h => h[0]).join('이나 ')}이 없다고 ${homoTrait}이라고 확정되지는 않는다. ${homo.map(h => h[1]).join('이나 ')}처럼 잡종이어도 자손 ${N_SEEDS}개에서 열성 형질이 하나도 나타나지 않을 수 있다. 그 확률이 ${homo.length > 1 ? '유전자마다 ' : ''}1/2을 ${N_SEEDS}번 곱한 값(${(2 ** N_SEEDS).toLocaleString('ko-KR')}분의 1)으로 아주 낮아서 ${homoTrait}이라고 판단한다.`;
        if (!match) fb.innerHTML += ` 그런데 이 완두의 실제 유전자형은 <b>${truth}</b>다. 바로 그 드문 경우가 일어났다.${ok ? ` <b>${truth}</b> 카드를 얻었다.` : ''}`;
      } else fb.innerHTML += ` 까닭: ${opt.why}`;
      if (ok) { p.known = true; S.geno.add(truth); if (how !== 'test') S.inferred++; }
      $('gclose').hidden = false;
    });
    $('gclose').onclick = () => closeOverlay(p.known ? `${G.genotype(p)} 확인 완료!` : '다른 완두로 다시 도전해 보자.');
  }

  $('t-cross').onclick = () => {
    if (busy()) return;
    if (S.sel.length !== 2) return toast('화분 2개를 골라야 교배할 수 있다');
    if (!S.pots.some(p => !p)) return toast('빈 화분이 없다. 먼저 화분을 비우자');
    doCross(S.pots[S.sel[0]], S.pots[S.sel[1]], 'cross');
  };
  $('t-self').onclick = () => {
    if (busy()) return;
    if (S.sel.length !== 1) return toast('화분 1개를 골라야 자가 수분할 수 있다');
    if (!S.pots.some(p => !p)) return toast('빈 화분이 없다. 먼저 화분을 비우자');
    const p = S.pots[S.sel[0]]; doCross(p, p, 'self');
  };
  $('t-test').onclick = () => {
    if (busy()) return;
    if (S.sel.length !== 1) return toast('유전자형을 알아낼 화분 1개를 고르자');
    const p = S.pots[S.sel[0]];
    if (p.known) return toast('이미 유전자형을 아는 완두다');
    if (G.phenoKey(p) === 'ry') return askGenotype(p, 'infer', '<p class="note">주름지고 녹색인 형질은 둘 다 열성이다. 열성 형질이 겉으로 드러나려면 열성 대립유전자만 가져야 한다.</p>',
      { why: '주름진 모양과 녹색은 둘 다 열성 형질이다. 열성 형질은 열성 대립유전자만 가질 때 나타나므로 rr, yy다.' });
    if (p.infer) return askGenotype(p, 'infer', `<p class="note">부모(${p.from})의 유전자형을 모두 알고 있다. 부모가 만들 수 있는 생식세포를 떠올려 보자.</p>`,
      { why: '부모가 만들 수 있는 생식세포의 조합이 한 가지뿐이면 자손의 유전자형도 하나로 정해진다.' });
    // 검정 교배: 열성 순종(rryy)과 교배
    const kids = G.cross(p, TESTER, N_SEEDS);
    const t = G.tally(kids);
    S.tests++; spendDay();
    S.notes.push({ kind: 'test', a: p, b: TESTER, tally: t });
    const newPheno = collectPheno(t);
    askGenotype(p, 'test', `<p>주름지고 녹색인 순종(rryy)과 교배해 씨앗 16개를 얻었다.</p><div class="offspring">${kids.map(k => `<div class="seed">${peaSVG(k)}</div>`).join('')}</div>
      <p>${Object.entries(t).filter(([, v]) => v).map(([k, v]) => `${G.PHENO_NAME[k]} ${v}개`).join(' · ')}</p>${newPhenoHTML(newPheno)}`, { tally: t });
  };
  $('t-drop').onclick = () => {
    if (busy()) return;
    if (!S.sel.length) return toast('비울 화분을 고르자');
    S.sel.forEach(i => { S.pots[i] = null; }); S.sel = []; render(); info('화분을 비웠다.');
  };
  $('t-end').onclick = () => { if (!busy()) end(); };

  function end() {
    if (!S || S.over) return; // 한 판에 한 번만 기록한다
    S.over = true; lockStage(true);
    const g = S.geno.size, ph = S.pheno.size;
    // 결과 화면이 실험 노트를 가리므로, 설명해 보기에 쓸 RrYy 자가 수분 기록을 문항에 함께 적는다
    // 유전자형을 확인했거나 부모로부터 추론할 수 있는 완두의 기록만 쓴다(숨은 유전자형을 드러내지 않게)
    const f2 = S.notes.find(n => n.kind === 'self' && (n.a.known || n.a.infer) && G.genotype(n.a) === 'RrYy');
    const f2same = f2 && f2.tally.RY === 9 && f2.tally.Ry === 3 && f2.tally.rY === 3 && f2.tally.ry === 1;
    const stars = ph < 4 ? 0 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5 ? 1 : 0;
    A.finish($('overlay'), {
      id: 'mendel', stars, score: g * 10 + ph * 5,
      detail: { geno: [...S.geno], pheno: [...S.pheno], daysUsed: DAYS - S.days, tests: S.tests, wrongTests: S.wrongTests, inferred: S.inferred, wrongInfers: S.wrongInfers,
        notes: S.notes.map(n => ({ label: noteLabel(n), tally: n.tally, expected: G.expected(n.a, n.b) })) },
      lines: [`표현형 카드 ${ph}/4 · 유전자형 카드 ${g}/9`, `검정 교배 ${S.tests}번(오답 ${S.wrongTests}) · 추론 등록 ${S.inferred}번(오답 ${S.wrongInfers}) · ${DAYS - S.days}일 사용`,
        ph < 4 ? '표현형 네 가지를 모두 모아야 별을 받는다. 잡종 1대를 자가 수분해 보자!' : g < 9 ? '겉모습이 같아도 유전자형이 다를 수 있다. 검정 교배로 더 확인해 보자.' : '모든 카드를 모았다. 멘델도 감탄할 텃밭이다!'],
      quiz: { q: '둥글고 황색인 완두의 유전자형을 알아내려면 어떤 완두와 교배해야 할까?', options: ['주름지고 녹색인 순종(rryy)', '둥글고 황색인 순종(RRYY)'], answer: 0,
        explain: '열성 순종은 열성 대립유전자만 주므로, 자손의 겉모습에 상대 완두의 대립유전자가 그대로 드러난다(검정 교배).' },
      reflection: f2
        ? `내 실험 노트의 RrYy 자가 수분 결과는 ${['RY', 'Ry', 'rY', 'ry'].map(k => `${G.PHENO_NAME[k]} ${f2.tally[k]}개`).join(' · ')}예요(16개 중 기대 개수는 차례대로 9, 3, 3, 1개). 네 가지 표현형이 약 9:3:3:1로 나오는 까닭을 분리의 법칙과 독립의 법칙으로 설명하세요. ${f2same ? '이번에는 기대와 같게 나왔지만, 씨앗 수가 적으면 기대와 다르게 나올 수 있는 까닭도 함께 쓰세요.' : '실제 개수가 기대와 다른 까닭도 함께 쓰세요.'}`
        : '잡종 1대(RrYy)를 자가 수분하면 네 가지 표현형이 약 9:3:3:1로 나와요. 그 까닭을 분리의 법칙과 독립의 법칙으로 설명하세요. 씨앗 수가 16개처럼 적으면 실제 개수가 이 비율과 다를 수 있는 까닭도 함께 쓰세요.',
      onRetry: reset,
    });
    focusCard();
  }

  lockStage(true);
  A.intro($('overlay'), {
    id: 'mendel',
    rules: [
      '화분 두 개를 골라 <b>교배</b>하거나, 한 개를 골라 <b>자가 수분</b>하면 씨앗 16개가 나온다(하루 소요).',
      '새로운 겉모습이 나오면 <b>표현형 카드</b>를 얻는다.',
      '유전자형(예: RrYy)은 겉으로 보이지 않는다. <b>검정 교배</b>나 <b>추론</b>으로 맞혀야 <b>유전자형 카드</b>를 얻는다.',
      `${DAYS}일 안에 카드를 최대한 모으자. 별: 표현형 4장 + 유전자형 5·7·9장`,
    ],
    onStart: reset,
  });
})();
