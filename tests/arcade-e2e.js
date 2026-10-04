// 휴대폰 화면에서 오락실 허브와 모든 미니게임을 실제로 플레이해 본다.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const root = path.resolve(__dirname, '..');
(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], failures = [], dialogs = [];
  page.on('pageerror', e => errors.push(`${page.url().split('/').slice(-2).join('/')}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // 확인 창은 기록만 하고 [취소]로 닫는다(Playwright 기본 동작과 같음)
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  const check = (ok, msg) => { if (!ok) { failures.push(msg); console.log('실패:', msg); } };
  const STORE = 'bioArcade.v1'; // shared/arcade.js의 KEY
  const QUEST_STORE = 'bioQuest.v1'; // shared/arcade.js의 QUEST_KEY(생명 탐사대 저장)
  const go = p => page.goto('file://' + path.join(root, p));
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const finishCheck = async name => {
    await page.waitForSelector('#overlay:not([hidden]) #ar-retry', { timeout: 90000 });
    const title = await page.textContent('#overlay h2');
    // 인출 문항이 여러 개면(염기쌍 팡의 흐름 문항 등) 하나에 답해야 다음 문항·설명해 보기가 나온다
    for (let i = 0; i < 4; i++) { const opt = await page.$('#overlay .quiz-opts .btn:not([disabled]), #overlay .flow-opts .btn:not([disabled])'); if (!opt) break; await opt.click(); await page.waitForTimeout(150); }
    const t = await page.$('#ar-refl'); if (t) await t.fill(`${name} 성찰 테스트`);
    await page.screenshot({ path: `${out}/${name}-result.png` });
    await page.click('#ar-hub');
    console.log(`${name}: 결과 "${title}" · 가로 넘침 ${await overflow()}`);
  };

  // 허브: 학번만 적고 시작한다. 이름은 기록이 쌓인 뒤 끝에서 채운다(빈 칸 채우기는 확인 창 없이).
  await go('index.html');
  await page.fill('#sid', '20315');
  console.log('허브 게임 칸 수:', await page.locator('.cab').count());
  await page.screenshot({ path: `${out}/hub.png`, fullPage: true });

  // 멘델의 텃밭
  await go('games/mendel/index.html');
  await page.screenshot({ path: `${out}/mendel-intro.png` });
  await page.click('#ar-start');
  await page.click('.pot[data-i="0"]'); await page.click('.pot[data-i="1"]'); await page.click('#t-cross');
  for (let i = 0; i < 4; i++) await page.click(`.seed[data-i="${i}"]`);
  await page.click('#plant');
  await page.click('.pot[data-i="2"]'); await page.click('#t-self');
  await page.screenshot({ path: `${out}/mendel-f2.png` });
  for (let i = 0; i < 6; i++) await page.click(`.seed[data-i="${i}"]`);
  await page.click('#plant');
  await page.click('.pot[data-i="2"]'); await page.click('#t-test');   // F1: 부모를 알아 추론 가능
  await page.click('[data-g]'); await page.click('#gclose');
  await page.click('.pot[data-i="6"]'); await page.click('#t-test');   // F2 하나 검정 교배
  await page.screenshot({ path: `${out}/mendel-test.png` });
  await page.click('[data-g]'); await page.click('#gclose');
  await page.screenshot({ path: `${out}/mendel-garden.png`, fullPage: true });
  await page.click('#t-end');
  await finishCheck('mendel');

  // 가계도 지뢰찾기: 해결기가 찾은 확실한 보인자만 표시
  await go('games/pedigree/index.html');
  await page.click('#ar-start');
  for (let lv = 0; lv < 4; lv++) {
    const must = await page.evaluate(i => window.Pedigree.solve(window.Pedigree.LEVELS[i]).must, lv);
    for (const id of must) await page.click(`.person[data-id="${id}"]`);
    if (lv === 3) await page.click('.person[data-id="k3"]').catch(() => {}); // 발현자 클릭 → 안내만
    if (lv === 2) { await page.click('.person[data-id="h1"]'); } // 남성 오표시(일부러) → 지뢰
    if (lv === 2) await page.screenshot({ path: `${out}/pedigree-marked.png` });
    await page.click('#judge');
    if (lv === 2) await page.screenshot({ path: `${out}/pedigree-judged.png`, fullPage: true });
    await page.click('#judge');
  }
  await finishCheck('pedigree');

  // 염기쌍 팡: 가능한 교환을 찾아 두 단계 모두 끝까지
  await go('games/basepang/index.html');
  await page.click('#ar-start');
  for (let lv = 1; lv <= 2; lv++) {
    for (let guard = 0; guard < 40; guard++) {
      const done = await page.evaluate(() => window.__game.moves() <= 0);
      if (done) break;
      await page.evaluate(() => {
        const B = window.BasePang, g = window.__game.grid(), L = window.__game.level();
        for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const b = { x: x + dx, y: y + dy }; if (b.x >= B.W || b.y >= B.H) continue;
          if (B.findPairs(L, B.swap(g, { x, y }, b)).length) { window.__game.trySwap({ x, y }, b); return; }
        }
      });
      await page.waitForTimeout(430);
      if (lv === 1 && guard === 3) await page.screenshot({ path: `${out}/basepang.png` });
    }
    if (lv === 1) { await page.waitForSelector('#go2'); await page.click('#go2'); await page.screenshot({ path: `${out}/basepang-rna.png` }); }
  }
  await finishCheck('basepang');

  // 혈당 지키기: 캔버스 값은 읽지 않고 주기적으로 눌렀다 뗀다(실시간 45초)
  const playGlucose = async shot => {
    const box = await page.locator('#cv').boundingBox();
    const t0 = Date.now(); let down = false;
    while (Date.now() - t0 < 47000) {
      if (await page.$('#overlay:not([hidden]) #ar-retry')) break;
      if (!down) { await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); down = true; } else { await page.mouse.up(); down = false; }
      await page.waitForTimeout(down ? 500 : 900);
      if (Date.now() - t0 > 20000 && Date.now() - t0 < 21500) await page.screenshot({ path: `${out}/${shot}.png` });
    }
    if (down) await page.mouse.up();
  };
  const glucoseRec = () => page.evaluate(k => ((JSON.parse(localStorage.getItem(k)) || {}).games || {}).glucose || null, STORE);
  await go('games/glucose/index.html');
  await page.click('#ar-start');
  await playGlucose('glucose');
  await finishCheck('glucose');

  // 혈당 지키기 인슐린 저항성 모드: 최고 기록이 별 2개 이상이어야 열린다(games/glucose/game.js unlocked)
  await go('games/glucose/index.html');
  const resBtn = '#overlay [data-mode="resistance"]';
  const best0 = ((await glucoseRec()) || {}).best || 0;
  if (best0 < 2) {
    check(await page.isDisabled(resBtn), `기본 모드 최고 ★${best0}인데 저항성 모드 버튼이 열려 있다`);
    // 저장소에 기본 모드 최고 기록 ★2를 넣어 잠금을 푼다
    await page.evaluate(k => {
      const d = JSON.parse(localStorage.getItem(k)) || { student: {}, games: {} };
      const g = d.games.glucose || (d.games.glucose = { best: 0, bestScore: 0, plays: [] });
      g.best = Math.max(g.best, 2); localStorage.setItem(k, JSON.stringify(d));
    }, STORE);
    await page.reload();
  }
  console.log(`glucose-resistance: 잠금 해제 ${best0 >= 2 ? `기본 모드 실제 기록 ★${best0}` : `기본 모드 ★${best0} → 저장소에 ★2를 넣음`}`);
  check(!(await page.isDisabled(resBtn)), '잠금을 풀었는데 저항성 모드 버튼이 막혀 있다');
  await page.tap(resBtn);
  check(await page.getAttribute(resBtn, 'aria-pressed') === 'true', '저항성 모드 버튼을 탭해도 선택되지 않았다');
  await page.screenshot({ path: `${out}/glucose-resistance-intro.png` });
  const plays0 = ((await glucoseRec()) || { plays: [] }).plays.length;
  await page.click('#ar-start');
  await playGlucose('glucose-resistance');
  await finishCheck('glucose-resistance');
  const gr = await glucoseRec(), lastPlay = gr && gr.plays[gr.plays.length - 1];
  const lastMode = lastPlay && lastPlay.detail ? lastPlay.detail.mode : null;
  console.log(`glucose-resistance: 판 수 ${plays0}→${gr ? gr.plays.length : 0}, 마지막 판 mode = ${lastMode}`);
  check(gr && gr.plays.length === plays0 + 1, '저항성 모드 판이 기록되지 않았다');
  check(lastMode === 'resistance', `저항성 모드 판이 mode '${lastMode}'로 저장됐다`);

  // 에너지 런: 주기적으로 점프(실시간 최대 60초)
  await go('games/run/index.html');
  await page.click('#ar-start');
  const rb = await page.locator('#cv').boundingBox();
  const r0 = Date.now();
  while (Date.now() - r0 < 62000) {
    if (await page.$('#overlay:not([hidden]) #ar-retry')) break;
    await page.mouse.click(rb.x + 200, rb.y + 150);
    await page.waitForTimeout(420);
    if (Date.now() - r0 > 8000 && Date.now() - r0 < 8500) await page.screenshot({ path: `${out}/run.png` });
  }
  await finishCheck('run');

  // 혈액 순환 일주: 출발 이름·까닭·보충 이름 오답을 거치고 마지막 바퀴는 모두 정답으로 플레이한다.
  await go('games/circulation/index.html');
  await page.screenshot({ path: `${out}/circulation-intro.png` });
  const introRules = await page.locator('#overlay li').allTextContents();
  check(introRules[0] === '게임은 혈액 한 방울을 따라 온몸순환과 폐순환을 번갈아 돌지만, 실제 몸에서는 두 순환이 동시에 일어난다. 적혈구가 산소를, 혈장이 이산화 탄소를 나른다.', '순환 D-050 시작 규칙 1줄 불일치');
  check(introRules[1] === '주사위 두 개 가운데 하나를 고른다. 모세 혈관 칸에 닿거나 출발 칸에 돌아오면 남은 눈을 버리고 멈춘다.', '순환 D-050 시작 규칙 2줄 불일치');
  // 보충 문항과 두 번째 기관 검사를 같은 판에서 반드시 거치게 시드만 고정한다.
  await page.evaluate(() => { window.__circRandom = Math.random; Math.random = () => 1 / 2 ** 32; });
  await page.click('#ar-start');
  await page.evaluate(() => { Math.random = window.__circRandom; delete window.__circRandom; });
  await page.evaluate(() => window.__circ.fast(true));
  await page.evaluate(() => {
    window.__toastLog = [];
    const toast = document.getElementById('toast');
    new MutationObserver(() => {
      if (toast.textContent) window.__toastLog.push({ text: toast.textContent, dark: document.body.classList.contains('dark') });
    }).observe(toast, { childList: true, characterData: true, subtree: true });
  });
  // 빠른 재생에서도 매 걸음의 DOM 갱신을 관찰한다. 입력 대기 칸만 재지 않는다.
  await page.evaluate(() => {
    const $ = id => document.getElementById(id), C = window.Circulation;
    const log = window.__circViewLog = { seen: [], failures: [], lungToasts: 0, fade: 0, motion: 0, correctFill: 0, doubleCap: 0 };
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const bounds = (el, stroke = 0) => {
      let b = el.getBoundingClientRect();
      const matrix = el.getScreenCTM?.();
      if (matrix && el.getBBox) {
        const local = el.getBBox();
        const a = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        const z = new DOMPoint(local.x + local.width, local.y + local.height).matrixTransform(matrix);
        b = { left: a.x, top: a.y, right: z.x, bottom: z.y };
      }
      const pad = stroke * (matrix?.a || 1) / 2;
      return { left: b.left - pad, top: b.top - pad, right: b.right + pad, bottom: b.bottom + pad };
    };
    const fail = (ok, msg) => { if (!ok && !log.failures.includes(msg)) log.failures.push(msg); };
    const askedCheck = p => {
      const groups = [...document.querySelectorAll('.square.asked')], expected = p.squares.slice().sort();
      fail(JSON.stringify(groups.map(g => g.dataset.square).sort()) === JSON.stringify(expected) && !document.querySelector('.square.current'), 'R-01/05 보충 해설 점선·현재 칸');
      fail(groups.every(g => g.getAttribute('aria-label').startsWith('점선으로 표시한 칸, ')), 'R-08 묻는 칸 aria-label');
      const chips = document.querySelectorAll('#route .current');
      fail(chips.length === 1 && chips[0].getAttribute('aria-current') === 'true' && chips[0].textContent === (window.__circ.state().labels[p.slot] ? C.STRUCTURES[p.slot].name : '□'), 'R-01/08 보충 칩 강조·aria-current');
    };
    const inspect = () => {
      const d = $('drop'); if (!d || document.body.classList.contains('dark') || document.body.classList.contains('finished')) return;
      const id = d.dataset.square, sq = C.SQUARES.find(q => q.id === id), box = bounds(d);
      if (!log.seen.includes(id)) log.seen.push(id);
      fail(!!sq, 'R-11 방울 위치 식별'); if (!sq) return;
      fail(![...document.querySelectorAll('.square')].some(g => g.dataset.square !== id && [...g.querySelectorAll('rect')].some(r => hit(box, bounds(r)))), `R-11 ${id} 방울·다른 칸`);
      fail(![...document.querySelectorAll('#board text')].some(t => hit(box, bounds(t))), `R-11 ${id} 방울·글자`);
      fail(![...document.querySelectorAll('.square circle')].some(c => hit(box, bounds(c, 0))), `R-11 ${id} 방울·O₂ 점`);
      const rect = document.querySelector(`.square[data-square="${id}"] rect:last-of-type`).getBoundingClientRect();
      fail(sq.kind !== 'capillary' || (id === 'lung' ? box.left > (rect.left + rect.right) / 2 : box.right < (rect.left + rect.right) / 2), `R-11 ${id} 출구 위치`);
      const rings = [...d.querySelectorAll('circle')];
      fail(rings.every(c => c.getAttribute('fill') === 'none' && c.getAttribute('stroke') === '#fff' && c.getAttribute('r') === '2.5' && c.getAttribute('stroke-width') === '1.5'), 'R-07 CO₂ 고리 기호');
      fail(rings.every((c, i) => rings.slice(i + 1).every(other => !hit(bounds(c, 1.5), bounds(other, 1.5)))), 'R-07 CO₂ 고리 간격');
      if (rings.length === 1) fail(rings[0].getAttribute('cx') === '14', 'R-07 하나인 고리 중앙');
      const legend = document.querySelector('.co2-legend rect'), zones = [...document.querySelectorAll('.circuit-name')];
      fail(!!legend && zones.length === 2 && zones.every(t => getComputedStyle(t).fill === 'rgb(36, 91, 121)'), 'R-03 범례 틀·구역 이름 색');
      if (legend) {
        const l = bounds(legend);
        fail(!hit(l, box) && ![...document.querySelectorAll('.square rect, .square circle, .candidate, #board path[marker-end]')].some(el => hit(l, bounds(el))), 'R-03 범례·방울·칸·점·후보·화살표');
        fail(zones.every(t => !hit(l, bounds(t))), 'R-03 범례와 구역 이름 분리');
        fail([...document.querySelectorAll('.co2-legend text')].every(t => { const b = bounds(t); return b.left >= l.left && b.right <= l.right && b.top >= l.top && b.bottom <= l.bottom && parseFloat(getComputedStyle(t).fontSize) >= 16; }), 'R-03 범례 글자 크기·틀 안 배치');
      }
      const candidates = [...document.querySelectorAll('.candidate')];
      const preview = window.__circ.pending().type === 'die' ? C.preview(window.__circ.state()) : [];
      for (const [index, candidate] of candidates.entries()) {
        const b = bounds(candidate);
        // 후보 글리프는 자기 원 안에 있다. 판 칸 이름·범례 글자만 비교한다.
        fail(![...document.querySelectorAll('.square circle')].some(el => hit(b, bounds(el))), 'R-06 후보·O₂ 점');
        if (C.SQUARES.find(q => q.id === preview[index]?.square)?.kind === 'capillary') fail(![...document.querySelectorAll('.square-name, .co2-legend text, .circuit-name, #board path[marker-end]')].some(el => hit(b, bounds(el))), 'R-06 모세 혈관 후보·이름·화살표');
      }
      if (preview.length === 2 && preview[0].square === preview[1].square && C.SQUARES.find(q => q.id === preview[0].square).kind === 'capillary') log.doubleCap++;
      const p = window.__circ.pending();
      // 재생 중에는 판이 직전 상태로 그려지므로, 판은 화면이 지금 그리는 문항(view)과 비교한다.
      const v = window.__circ.view();
      if (v.squares && $('mode').textContent === '보충') askedCheck(v);
      if (p.squares && $('mode').textContent === '3/3바퀴') {
        log.motion++;
        fail(!document.querySelector('.square.asked') && document.querySelector('.square.current')?.dataset.square === id, 'R-05 이동 중 보충 점선 선행');
        const key = sq.structure || (id === 'lung' ? '폐의 모세 혈관' : '온몸의 모세 혈관');
        fail(document.querySelector('#route .current')?.textContent === (C.STRUCTURES[key] ? (window.__circ.state().labels[key] ? C.STRUCTURES[key].name : '□') : key), 'R-05 이동 중 경로 칩');
      }
      const record = window.__circ.state().practice.at(-1), fb = document.querySelector('#ctrl .feedback');
      if (v.type === 'continue' && record?.at === 'fill' && record.kind === 'name' && record.ok && fb) {
        log.correctFill++;
        fail(fb.textContent === `정답! 점선으로 표시한 칸은 ${C.STRUCTURES[record.slot].name}이다.${C.STRUCTURES[record.slot].explain ? ' ' + C.STRUCTURES[record.slot].explain : ''}`, 'D-050 보충 정답 해설');
        askedCheck(v);
      }
    };
    new MutationObserver(inspect).observe($('board'), { childList: true });
    new MutationObserver(() => {
      inspect();
      const t = $('toast');
      if (!t.classList.contains('on') && !document.body.classList.contains('dark')) {
        log.fade++; fail(!!t.textContent, 'R-09 사라지는 토스트 글자 유지');
      }
      if (t.classList.contains('on') && $('drop')?.dataset.square === 'lung') {
        log.lungToasts++;
        fail(t.classList.contains('low') && !hit(bounds(t), bounds($('drop'))) && !hit(bounds(t), bounds(document.querySelector('.square[data-square="lung"]'))) && !hit(bounds(t), bounds($('ctrl'))), 'R-02 폐 토스트·방울·폐 칸·조작 영역');
      }
    }).observe($('toast'), { attributes: true, attributeFilter: ['class'], childList: true });
    inspect();
  });
  check(!/좌심실|우심실/.test(await page.textContent('#route')), '순환 출발 이름을 고르기 전에 경로 칩이 답을 보였다');
  const circulationFits = async height => {
    await page.setViewportSize({ width: 390, height });
    const layout = await page.evaluate(() => {
      const root = document.documentElement, board = document.getElementById('board');
      const font = board.querySelector('.square-name');
      return { x: root.scrollWidth > innerWidth + 1, y: root.scrollHeight > innerHeight + 1,
        bodyY: document.body.scrollHeight > innerHeight + 1,
        font: parseFloat(getComputedStyle(font).fontSize) * board.getScreenCTM().a,
        ctrl: document.getElementById('ctrl').getBoundingClientRect().height,
        clipped: ['route', 'status', 'ctrl'].filter(id => { const el = document.getElementById(id); return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1; }) };
    });
    check(!layout.x && !layout.y && !layout.bodyY, `순환 390×${height}: 화면 넘침 ${JSON.stringify(layout)}`);
    check(layout.font >= 12, `순환 390×${height}: 판 글자 ${layout.font}px`);
    check(!layout.clipped.length, `순환 390×${height}: 영역 안에서 넘침 ${layout.clipped.join(', ')}`);
    check(layout.ctrl === 150, `순환 조작 영역 높이가 ${layout.ctrl}px이다`);
  };
  await circulationFits(844); await circulationFits(660);
  await page.screenshot({ path: `${out}/circulation-board-small.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/circulation-board.png` });
  await page.setViewportSize({ width: 390, height: 660 });
  let intentionalWrong = false, wrongFeedbackSeen = false, reasonWrong = false, reasonFeedbackSeen = false, fillWrong = false, fillFeedbackSeen = false, wrongKind, frozenCircScore, darkNames = 0, darkSeen = false, boundarySeen = 0, circEnded = false, organKeySeen = false;
  const fittedPhases = new Set();
  let co2Shot = false;
  for (let guard = 0; guard < 300; guard++) {
    await page.waitForFunction(() => {
      const p = window.__circ.pending(), ctrl = document.getElementById('ctrl');
      return p.type === 'end' || (Number(ctrl.dataset.token) === p.token && !!ctrl.querySelector('button:not([disabled])'));
    });
    const p = await page.evaluate(() => window.__circ.pending());
    if (p.type === 'end') { circEnded = true; break; }
    const answer = await page.evaluate(() => window.__circ.correct());
    if (['die', 'reason', 'organ', 'fillName', 'fillReason'].includes(p.type) && !fittedPhases.has(p.type)) {
      fittedPhases.add(p.type); await circulationFits(660);
    }
    if (!co2Shot && await page.locator('#drop circle').count() === 3) {
      co2Shot = true;
      await page.locator('#drop').screenshot({ path: `${out}/circulation-co2-three.png` });
    }
    if (p.type === 'die') {
      const buttons = await page.locator('.sheet-opts .btn').evaluateAll(bs => bs.map(b => ({ wordBreak: getComputedStyle(b).wordBreak, height: b.getBoundingClientRect().height })));
      check(buttons.every(b => b.wordBreak === 'keep-all' && b.height <= 64), '순환 주사위 버튼의 낱말 줄바꿈 또는 높이 실패');
    }
    if (p.squares) {
      const target = await page.evaluate(() => ({
        ids: [...document.querySelectorAll('.square.asked')].map(g => g.dataset.square).sort(),
        expected: window.Circulation.SQUARES.filter(q => q.structure === window.__circ.state().slot).map(q => q.id).sort(),
        current: document.querySelectorAll('.square.current').length,
        dashed: [...document.querySelectorAll('.square.asked rect')].every(r => getComputedStyle(r).strokeDasharray !== 'none'),
        route: [...document.querySelectorAll('#route .current')].map(c => c.textContent),
        label: window.__circ.state().labels[window.__circ.state().slot] ? window.Circulation.STRUCTURES[window.__circ.state().slot].name : '□',
        status: document.getElementById('status').textContent,
        aria: [...document.querySelectorAll('.square.asked')].every(g => g.getAttribute('aria-label').startsWith('점선으로 표시한 칸, ')),
        ariaCurrent: document.querySelector('#route .current')?.getAttribute('aria-current'),
      }));
      check(JSON.stringify(target.ids) === JSON.stringify(target.expected) && target.current === 0 && target.dashed && target.aria && target.ariaCurrent === 'true',
        '순환 보충 문항의 점선 칸·현재 위치 강조 실패');
      check(target.route.length === 1 && target.route[0] === target.label && target.status === '보충 문항', '순환 보충 문항 경로 칩·상태 줄 실패');
    }
    if (p.type.startsWith('final')) {
      const view = await page.evaluate(() => ({
        board: getComputedStyle(document.getElementById('board')).visibility,
        route: getComputedStyle(document.getElementById('route')).visibility,
        dark: !document.getElementById('dark').hidden && getComputedStyle(document.getElementById('dark')).visibility,
        boardText: document.getElementById('board').textContent,
        structureNames: Object.values(window.Circulation.STRUCTURES).map(x => x.name),
        score: document.getElementById('score').textContent,
        status: document.getElementById('status').textContent,
        mode: document.getElementById('mode').textContent,
        panel: document.getElementById('dark').textContent,
        ctrl: document.getElementById('ctrl').textContent,
        accessible: [...document.querySelectorAll('#dark, #dark *, #ctrl, #ctrl *, #status, #status *, header, header *')].map(el => (el.getAttribute('aria-label') || '') + (el.getAttribute('title') || '')).join(' '),
        blankHidden: document.getElementById('blank').hidden,
        cursorLast: document.getElementById('trail').lastElementChild.id === 'dark-cursor',
        landmarks: [...document.querySelectorAll('#trail .landmark')].map(x => x.textContent),
        chips: [...document.querySelectorAll('#trail .dark-chip:not(.landmark)')].map(x => x.textContent),
        toast: document.getElementById('toast').classList.contains('on'),
        stars: document.body.innerText.includes('★'),
      }));
      if (!darkSeen) {
        darkSeen = true; frozenCircScore = view.score;
        await page.screenshot({ path: `${out}/circulation-dark.png` });
        await circulationFits(660);
      }
      check(view.board === 'hidden' && view.route === 'hidden' && view.dark === 'visible', '순환 불 꺼진 바퀴의 판·경로 감춤 또는 패널 표시 실패');
      check(!view.structureNames.some(name => view.boardText.includes(name)), '순환 감춘 판 DOM에 구조 이름이 남았다');
      check(view.score === frozenCircScore, '순환 불 꺼진 바퀴에서 점수가 바뀌었다');
      check(view.status === '불 꺼진 바퀴' && !/\d|산소|폐순환|온몸순환/.test(view.status), '순환 불 꺼진 상태 줄에 단서나 숫자가 있다');
      check(view.mode === '불 꺼진 바퀴' && !/\/12|\/8|\d|(한|하나|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열두)\s*(칸|개|문항|번째)/.test(view.mode + view.status + view.panel + view.ctrl + view.accessible), '순환 불 꺼진 화면에 개수가 보인다');
      check(!view.toast && !view.stars, '순환 불 꺼진 바퀴·경계 문항에서 토스트나 별이 보인다');
      check(view.chips.length === darkNames, '순환 패널이 지나온 이름 이외의 빈칸을 그렸다');
      check(view.cursorLast && view.blankHidden === (p.type !== 'finalName'), '순환 방울이 칩 줄 끝에 없거나 까닭·경계 문항에 빈칸이 보인다');
      const expectedLandmarks = ['온몸의 모세 혈관', ...(darkNames >= 4 ? ['폐의 모세 혈관'] : []), ...(darkNames >= 8 ? ['온몸의 모세 혈관'] : [])];
      check(JSON.stringify(view.landmarks) === JSON.stringify(expectedLandmarks), '순환 모세 혈관 표지 칩 순서가 다르다');
      if (p.type === 'finalBoundary') boundarySeen++;
    }
    let key;
    if (!intentionalWrong && p.type === 'nameStart') {
      key = p.options.find(o => o.key !== answer).key; intentionalWrong = true; wrongKind = 'start';
      await page.screenshot({ path: `${out}/circulation-name.png` });
    } else if (!reasonWrong && p.type === 'reason') {
      key = p.options.find(o => o.key !== answer).key; reasonWrong = true; wrongKind = 'reason';
    } else if (!fillWrong && p.type === 'fillName') {
      key = p.options.find(o => o.key !== answer).key; fillWrong = true; wrongKind = 'fill';
    } else if (p.type === 'die') {
      // 빈칸을 피해서 보충 문항을 반드시 남긴다. 보충 없는 시드가 뽑히는 공백을 막는다.
      key = p.options.slice().sort((a, b) => Number(a.blank) - Number(b.blank) || b.steps - a.steps)[0].key;
    } else if (p.type === 'organ') key = p.options[0].key;
    else if (p.options.length) key = answer;
    if (p.type === 'continue') {
      const fb = await page.textContent('#ctrl .feedback');
      check(await page.isVisible('#ctrl .feedback') && (await page.textContent('#ctrl')).includes('계속'), '순환 연습 오답의 해설·계속 버튼이 없다');
      if (wrongKind === 'start') {
        wrongFeedbackSeen = true;
        check(fb.includes('좌심실') && fb.startsWith('고른 답: '), '순환 출발 이름 오답의 정답·고른 답 설명이 없다');
      } else if (wrongKind === 'reason') {
        reasonFeedbackSeen = true;
        const record = await page.evaluate(() => window.__circ.state().practice.at(-1));
        const expected = await page.evaluate(r => window.Circulation.reasonExplanation(r.slot, r.pick), record);
        check(!fb.startsWith('고른 답') && fb === expected, 'R-04 까닭 오답 해설에 머리말이 있거나 해설이 다르다');
      } else if (wrongKind === 'fill') {
        fillFeedbackSeen = true;
        const record = await page.evaluate(() => window.__circ.state().practice.at(-1));
        const expected = await page.evaluate(r => { const S = window.Circulation.STRUCTURES; return `고른 답: ${S[r.pick].name}. 점선으로 표시한 칸은 ${S[r.slot].name}이다.${S[r.slot].explain ? ' ' + S[r.slot].explain : ''}`; }, record);
        check(fb === expected && !!p.squares, 'R-01/04 D-050 보충 오답 해설·점선 유지 실패');
        await page.screenshot({ path: `${out}/circulation-fill-wrong.png` });
      }
      wrongKind = null;
      await circulationFits(660);
    }
    if (p.type === 'organ' && !organKeySeen && await page.evaluate(() => window.Circulation.hud(window.__circ.state()).lap === 2)) {
      organKeySeen = true;
      check(await page.locator('.sheet-opts .btn').nth(0).isDisabled(), 'R-12 첫 기관 버튼이 비활성이 아니다');
      await page.keyboard.press('1');
      check(await page.evaluate(token => window.__circ.pending().token === token, p.token), 'R-12 비활성 기관 번호 1이 다른 기관을 골랐다');
      await page.keyboard.press('2');
      await page.waitForFunction(token => window.__circ.pending().token !== token, p.token);
      check(await page.evaluate(() => window.__circ.state().organs.at(-1) === 'kidney'), 'R-12 숫자 키 2가 콩팥을 고르지 않았다');
      continue;
    }
    await page.click(key === undefined ? '#ctrl button:not([disabled])' : `#ctrl button[data-k="${key}"]:not([disabled])`);
    if (p.type === 'finalName') darkNames++;
  }
  check(circEnded && darkSeen && intentionalWrong && wrongFeedbackSeen && reasonWrong && reasonFeedbackSeen && fillWrong && fillFeedbackSeen && boundarySeen === 2, '순환 플레이·오답 해설 확인·경계 두 문항을 끝내지 못했다');
  check(fittedPhases.has('fillName') && organKeySeen, '순환 보충 문항 또는 두 번째 바퀴 기관 숫자 키 검사가 실행되지 않았다');
  const viewLog = await page.evaluate(() => window.__circViewLog);
  console.log('순환 화면 관찰:', JSON.stringify(viewLog));
  check(viewLog.seen.length === 18 && !viewLog.failures.length, `R-11 순환 18칸 관찰·배치 실패: ${JSON.stringify(viewLog)}`);
  check(viewLog.lungToasts > 0 && viewLog.fade > 0 && viewLog.motion > 0 && viewLog.correctFill > 0 && viewLog.doubleCap > 0, '순환 폐 토스트·사라짐·이동·보충 정답·모세 혈관 후보 둘 관찰 공백');
  const toastLog = await page.evaluate(() => window.__toastLog);
  check(toastLog.filter(x => x.dark).length === 0, '순환 불 꺼진 바퀴에서 토스트가 발생했다');
  check(toastLog.filter(x => x.text === '모세 혈관에서는 혈액이 가장 느리게 흐르며 물질을 주고받는다.').length === 1, '순환 모세 혈관 공통 안내가 정확히 한 번 나오지 않았다');
  check(toastLog.every(x => Array.from(x.text).length <= 85), '순환 토스트가 85자를 넘었다');
  await page.waitForSelector('#overlay #ar-retry');
  const circResult = await page.evaluate(k => {
    const g = JSON.parse(localStorage.getItem(k)).games.circulation, last = g.plays.at(-1);
    return { stars: last.stars, final: last.detail.final, practice: last.detail.practice,
      untimed: last.detail.untimedCount,
      hidden: ['board', 'route', 'dark'].every(id => getComputedStyle(document.getElementById(id)).visibility === 'hidden') };
  }, STORE);
  check(circResult.stars === 3 && circResult.final.length === 12 && circResult.final.every(x => x.ok), '순환 마지막 바퀴 정답 12개·별 3 기록 실패');
  check(circResult.practice.length === 12 && circResult.practice.some(x => !x.ok) && circResult.untimed === 0, '순환 연습 기록 또는 경과 초 기록 실패');
  check(circResult.hidden, '순환 결과 카드 뒤에서 판·칩·패널이 보인다');
  await page.screenshot({ path: `${out}/circulation-result-before-quiz.png` });
  await finishCheck('circulation');
  const circSaved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).games.circulation.plays.at(-1), STORE);
  check(typeof circSaved.quizCorrect === 'boolean' && typeof circSaved.flowQuizCorrect === 'boolean' && circSaved.reflection === 'circulation 성찰 테스트',
    '순환 인출 문항·이어서 떠올리기·설명해 보기 기록 실패');

  // 생명 탐사대로 가는 길과 오락실 복귀
  await go('games/quest/index.html');
  console.log('탐사대 오락실 버튼:', await page.isVisible('#btn-hub'));
  await page.click('#btn-hub');
  await page.waitForTimeout(300);

  // 허브 '앞 학생 기록을 지울까요' 확인 창: 기록이 남은 상태에서
  // 빈 이름 채우기 → 묻지 않음, 학번 20315→20316 → 물음([취소]), 입력을 마친 뒤 20316→20317 → 다시 물음,
  // 한 번의 input으로 값을 통째 바꾸고(붙여넣기와 같음) 더 입력하지 않은 채 칸을 벗어난 뒤 또 바꿔도 다시 물음
  const asked = () => dialogs.filter(m => m.includes('게임 기록이 남아 있어요')).length;
  const edit = async (sel, keys, text) => {
    await page.click(sel); await page.keyboard.press('End');
    for (let i = 0; i < keys; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(text, { delay: 20 });
    await page.click('.marquee'); // 입력칸 밖을 눌러 입력을 마친다(blur)
  };
  const replace = async (sel, text) => { await page.fill(sel, text); await page.click('.marquee'); };
  const a0 = asked();
  await edit('#sname', 0, '테스트');
  check(asked() === a0, '비어 있던 이름을 채웠는데 확인 창이 떴다');
  await edit('#sid', 1, '6');
  check(asked() === a0 + 1, `학번 20315→20316 변경에 확인 창이 ${asked() - a0}번 떴다(1번이어야 함)`);
  await edit('#sid', 1, '7');
  check(asked() === a0 + 2, '[취소] 뒤 학번을 또 바꿨는데 다시 묻지 않았다');
  await replace('#sid', '20318');
  check(asked() === a0 + 3, '학번을 통째 바꿨는데(20317→20318) 묻지 않았다');
  await replace('#sid', '20319');
  check(asked() === a0 + 4, '통째 바꾼 뒤 바로 칸을 벗어났다가 또 바꿨는데(20318→20319) 다시 묻지 않았다');
  check(await page.evaluate(() => window.Arcade.hasRecords()), '[취소]했는데 기록이 지워졌다');
  console.log(`허브 확인 창: 빈 이름 채우기·학번 네 번 변경에서 ${asked() - a0}번(기대 4번)`);

  // 허브 요약의 생명 탐사대 줄: 탐사대 저장(bioQuest.v1)이 있어야 줄이 생긴다(Arcade.questBadges).
  // 이 테스트는 탐사대를 플레이하지 않으므로 배지 기록을 넣고 허브를 다시 연다. 화면 글상자와 '요약 복사' 텍스트 모두
  // 미니게임 줄과 같은 형식으로 성취기준 코드를 적어야 한다. 복사 텍스트는 클립보드를 가로채서 받는다.
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, badges: { photo: 3 } })), QUEST_STORE);
  await page.reload();
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } });
  });
  await page.click('#copy');
  await page.waitForFunction(() => window.__copied !== null);
  const summary = await page.inputValue('#summary'), copied = await page.evaluate(() => window.__copied);
  const questHead = await page.evaluate(() => { const g = window.Arcade.game('quest'); return `${g.title} [${g.standards.join('·')}]: 배지 `; });
  const questLine = t => t.split('\n').find(l => l.startsWith('생명 탐사대')) || '(줄 없음)';
  check(questLine(summary).startsWith(questHead) && questLine(copied).startsWith(questHead),
    `탐사대 요약 줄이 '${questHead}…' 형식이 아니다. 화면: ${questLine(summary)} / 복사: ${questLine(copied)}`);
  console.log('허브 기록 요약:\n' + summary);
  console.log('허브 별 표시:', await page.locator('.cab .stars').allTextContents());
  console.log('errors:', errors.length ? errors : 'none');
  console.log('failures:', failures.length ? failures : 'none');
  if (errors.length || failures.length) process.exitCode = 1;
  await browser.close();
})();
