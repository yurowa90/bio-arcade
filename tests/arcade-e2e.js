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

  const summary = await page.inputValue('#summary');
  console.log('허브 기록 요약:\n' + summary);
  console.log('허브 별 표시:', await page.locator('.cab .stars').allTextContents());
  console.log('errors:', errors.length ? errors : 'none');
  console.log('failures:', failures.length ? failures : 'none');
  if (errors.length || failures.length) process.exitCode = 1;
  await browser.close();
})();
