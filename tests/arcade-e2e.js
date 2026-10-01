// 휴대폰 화면에서 오락실 허브와 모든 미니게임을 실제로 플레이해 본다.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const root = path.resolve(__dirname, '..');
(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url().split('/').slice(-2).join('/')}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const go = p => page.goto('file://' + path.join(root, p));
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const finishCheck = async name => {
    await page.waitForSelector('#overlay:not([hidden]) #ar-retry', { timeout: 90000 });
    const title = await page.textContent('#overlay h2');
    const opt = await page.$('#overlay .quiz-opts .btn'); if (opt) await opt.click();
    const t = await page.$('#ar-refl'); if (t) await t.fill(`${name} 성찰 테스트`);
    await page.screenshot({ path: `${out}/${name}-result.png` });
    await page.click('#ar-hub');
    console.log(`${name}: 결과 "${title}" · 가로 넘침 ${await overflow()}`);
  };

  // 허브
  await go('index.html');
  await page.fill('#sid', '20315'); await page.fill('#sname', '테스트');
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

  // 혈당 지키기: 혈당이 높을 때만 누르는 단순 조절(실시간 45초)
  await go('games/glucose/index.html');
  await page.click('#ar-start');
  const box = await page.locator('#cv').boundingBox();
  const t0 = Date.now(); let down = false;
  while (Date.now() - t0 < 47000) {
    const done = await page.$('#overlay:not([hidden]) #ar-retry'); if (done) break;
    const txt = await page.evaluate(() => 0); // 캔버스 값은 읽지 않고 주기적으로 눌렀다 뗀다
    if (!down) { await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); down = true; } else { await page.mouse.up(); down = false; }
    await page.waitForTimeout(down ? 500 : 900);
    if (Date.now() - t0 > 20000 && Date.now() - t0 < 21500) await page.screenshot({ path: `${out}/glucose.png` });
  }
  if (down) await page.mouse.up();
  await finishCheck('glucose');

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
  const summary = await page.inputValue('#summary');
  console.log('허브 기록 요약:\n' + summary);
  console.log('허브 별 표시:', await page.locator('.cab .stars').allTextContents());
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
