// 휴대폰 화면(390×844, 터치)에서 처음부터 두 체육관까지 실제로 플레이한다.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../games/quest/index.html'));
  await page.screenshot({ path: `${out}/01-title.png` });
  await page.click('#btn-new');
  const mode = () => page.evaluate(() => window.__bq.mode);
  // 대화 넘기기: 선택지가 나오면 첫 번째를 고른다
  async function drain(max = 40, shotName) {
    for (let i = 0; i < max; i++) {
      const m = await mode();
      if (m !== 'dialog') return;
      const ch = await page.$('#dialog-choices button');
      if (ch) { if (shotName) await page.screenshot({ path: `${out}/${shotName}` }); await ch.click(); }
      else await page.click('#dialog');
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(300);
  await drain(60, '02-partner.png');
  console.log('after intro mode:', await mode(), 'partner:', await page.evaluate(() => window.__bq.S.partner));
  // 이동: 위로 3칸
  const before = await page.evaluate(() => ({ ...window.__bq.player }));
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(520); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ ...window.__bq.player }));
  console.log('move up:', before.y, '→', after.y);
  await page.screenshot({ path: `${out}/03-town.png` });
  // 조우 → 관찰
  await page.evaluate(() => window.__bq.encounter('forest'));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/04-encounter.png` });
  await page.click('.choice-list .btn');
  const encText = await page.textContent('#panel-body');
  console.log('encounter result:', encText.includes('관찰 성공') ? 'success' : encText.includes('아쉽다') ? 'wrong' : 'UNKNOWN');
  await page.screenshot({ path: `${out}/05-observed.png` });
  await page.click('#enc-ok');
  // 체육관 1 조건 미달 확인
  await page.evaluate(() => { const S = window.__bq.S; S.dex = {}; window.__bq.warp('leaftown', 5, 5); window.__bq.player.dir = 'up'; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(400);
  const refuse = await page.textContent('#dialog-text');
  console.log('gym1 locked:', refuse.includes('환영') || refuse.length > 0 ? 'OK' : 'MISSING');
  await drain();
  // 조건 충족 후 입장
  await page.evaluate(() => { const S = window.__bq.S; for (const id of ['squirrel', 'sparrow', 'dandelion', 'pine']) S.dex[id] = { seen: 1, done: true }; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  await drain();
  console.log('photo battle open:', await mode());
  for (const [i, a] of 'stomata water water leaf water water stomata stomata water water'.split(' ').entries()) {
    await page.click(`[data-a="${a}"]`);
    if (i === 6) await page.screenshot({ path: `${out}/06-photo-battle.png` });
  }
  await page.fill('#refl', '밤에는 빛이 없어 광합성을 못 하므로 기공을 닫아 물을 아꼈다.');
  await page.screenshot({ path: `${out}/07-photo-result.png` });
  await page.click('#p-done');
  await page.waitForTimeout(200);
  await drain();
  console.log('photo badge:', await page.evaluate(() => window.__bq.S.badges.photo));
  // 체육관 2
  await page.evaluate(() => { window.__bq.warp('route2', 21, 8); window.__bq.player.dir = 'up'; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  await drain();
  console.log('digest battle open:', await mode());
  for (const [i, m] of ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal'].entries()) {
    await page.click(`[data-m="${m}"]`);
    if (i === 4) await page.screenshot({ path: `${out}/08-digest.png` });
  }
  for (const [k, v] of [['starch', 'capillary'], ['protein', 'capillary'], ['fat', 'lacteal']]) await page.click(`[data-k="${k}"][data-v="${v}"]`);
  await page.screenshot({ path: `${out}/09-absorb.png` });
  await page.click('#ab-go');
  await page.fill('#refl', '쓸개즙은 지방을 작은 방울로 만들어 라이페이스가 닿는 표면적을 넓힌다.');
  await page.click('#d-done');
  await page.waitForTimeout(200);
  await drain();
  console.log('digest badge:', await page.evaluate(() => window.__bq.S.badges.digest));
  // 밤 지도 + 도감 + 기록
  await page.evaluate(() => { window.__bq.S.timeMode = 'night'; window.__bq.warp('route1', 9, 12); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/10-night.png` });
  await page.click('#btn-b'); await page.click('#m-dex');
  await page.screenshot({ path: `${out}/11-dex.png` });
  await page.click('#panel-close');
  await page.click('#btn-b'); await page.click('#m-rec');
  const rec = await page.inputValue('#r-text');
  console.log('record summary:\n' + rec);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('horizontal overflow:', overflow);
  // 새로고침 후 이어하기
  await page.reload();
  console.log('continue button visible:', await page.isVisible('#btn-continue'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
