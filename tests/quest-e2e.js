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
  // 확인 항목: 실패하면 FAIL을 찍고 종료 코드를 1로 둔다
  const check = (name, cond, extra = '') => { if (!cond) process.exitCode = 1; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
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
  // 대화 한 묶음을 끝까지 넘기며 모든 줄을 모은다(선택지가 나오면 멈춘다)
  async function readDialog(max = 30) {
    const lines = [];
    for (let i = 0; i < max && (await mode()) === 'dialog'; i++) {
      // 타자 효과가 진행 중이면(▼ 표시 숨김, 선택지 없음) 한 번 눌러 줄을 끝까지 보인다
      if ((await page.$('#dialog-next[hidden]')) && !(await page.$('#dialog-choices button'))) { await page.click('#dialog'); await page.waitForTimeout(30); }
      const t = await page.textContent('#dialog-text');
      if (lines[lines.length - 1] !== t) lines.push(t);
      if (await page.$('#dialog-choices button')) break;
      await page.click('#dialog'); await page.waitForTimeout(30);
    }
    return lines;
  }
  await page.waitForTimeout(300);
  // 인트로는 키보드만으로 진행한다: Enter로 대사를 넘기고, 선택지에서 Tab → Enter로 두 번째 파트너를 고른다
  for (let i = 0; i < 40 && !(await page.$('#dialog-choices button')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(40); }
  await page.screenshot({ path: `${out}/02-partner.png` });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check('키보드로 파트너 선택(Tab → Enter)', (await page.evaluate(() => window.__bq.S.partner)) === 'mito');
  for (let i = 0; i < 40 && (await mode()) === 'dialog'; i++) { await page.keyboard.press(i % 2 ? 'Enter' : ' '); await page.waitForTimeout(40); }
  console.log('after intro mode:', await mode(), 'partner:', await page.evaluate(() => window.__bq.S.partner));
  check('키보드로 인트로 끝까지 진행', (await mode()) === 'walk' && (await page.evaluate(() => window.__bq.S.introDone)));
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
  const preMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('관찰 전 카드에 무리·분류·역할 칩이 없음', !/식물|동물|균류|척추|생산자|소비자|분해자/.test(preMeta), preMeta.replace(/\s+/g, ' ').trim());
  await page.click('.choice-list .btn');
  const encText = await page.textContent('#panel-body');
  console.log('encounter result:', encText.includes('관찰 성공') ? 'success' : encText.includes('아쉽다') ? 'wrong' : 'UNKNOWN');
  await page.screenshot({ path: `${out}/05-observed.png` });
  await page.click('#enc-ok');
  // 체육관 1 조건 미달 확인: 비생산자 4종만 관찰 → 박사는 생산자를 더 관찰하라 하고, 관장은 입장을 거절한다
  await page.evaluate(() => { const S = window.__bq.S; S.dex = {}; for (const id of ['squirrel', 'sparrow', 'cabbagebutterfly', 'oyster']) S.dex[id] = { seen: 1, done: true }; window.__bq.warp('town', 15, 5); window.__bq.player.dir = 'up'; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  const doctor = await readDialog();
  check('생산자 없이 4종이면 박사가 도전하라고 하지 않음', doctor.some(l => l.includes('생산자가 없')) && !doctor.some(l => l.includes('도전해 보렴')), doctor[1] || '');
  await drain();
  await page.evaluate(() => { window.__bq.warp('leaftown', 5, 5); window.__bq.player.dir = 'up'; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  const refuse = await readDialog();
  await drain();
  check('gym1 locked(생산자 없음)', refuse.some(l => l.includes('아직 이르구나') && l.includes('생산자 없음')) && (await mode()) === 'walk' && !(await page.$('[data-a]')), refuse.join(' / '));
  await page.evaluate(() => { window.__bq.S.dex = {}; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  const refuse0 = await readDialog();
  await drain();
  check('gym1 locked(관찰 0종)', refuse0.some(l => l.includes('아직 이르구나') && l.includes('지금 0종')) && (await mode()) === 'walk' && !(await page.$('[data-a]')), refuse0.join(' / '));
  // 조건 충족 후 입장
  await page.evaluate(() => { const S = window.__bq.S; for (const id of ['squirrel', 'sparrow', 'dandelion', 'pine']) S.dex[id] = { seen: 1, done: true }; });
  await page.dispatchEvent('.dir.up', 'pointerdown'); await page.waitForTimeout(80); await page.dispatchEvent('.dir.up', 'pointerup');
  await page.waitForTimeout(300);
  await drain();
  console.log('photo battle open:', await mode());
  check('photo battle open', (await mode()) === 'panel' && !!(await page.$('[data-a]')));
  // 기공(stomata)은 턴을 쓰지 않는다: 1턴 전에 열고, 7턴(밤)에 닫았다가 8턴에 다시 연다
  for (const [i, a] of 'stomata water water leaf water leaf water stomata leaf stomata water leaf water'.split(' ').entries()) {
    await page.click(`[data-a="${a}"]`);
    if (i === 7) await page.screenshot({ path: `${out}/06-photo-battle.png` });
  }
  const photoRes = await page.$eval('#panel-body .feedback', el => el.textContent.replace(/\s+/g, ' ').trim());
  // 별 표시는 꺼진 별도 ★ 글자로 그리므로, 켜진 별 수는 .off가 아닌 별로 센다
  const photoStars = await page.$eval('#panel-body .feedback .stars', el => 3 - el.querySelectorAll('.off').length);
  const starchLabel = await page.$$eval('#panel-body .meter', ms => ms.map(m => m.querySelector('.meter-label').textContent.replace(/\s+/g, ' ').trim()).find(t => t.startsWith('녹말')));
  check('광합성 결과: 밤에 닫으면 별 3 + 칭찬', photoStars === 3 && photoRes.includes('밤에 기공을 닫아'), `별 ${photoStars} · ${photoRes}`);
  check('녹말 막대 숫자 = 결과 녹말', starchLabel.includes((photoRes.match(/녹말 (\d+)/) || [])[1] + ' '), starchLabel);
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
  // 실제 시계 모드에서 같은 지도에 머무는 동안 19시가 되면 HUD도 밤으로 바뀌는가
  await page.click('#panel-close');
  await page.evaluate(() => { window.__bq.S.timeMode = 'real'; window.__fakeH = 18; Date.prototype.getHours = function () { return window.__fakeH; }; window.__bq.warp('route1', 9, 12); });
  await page.waitForTimeout(200);
  const hud18 = await page.textContent('#hud-time');
  await page.evaluate(() => { window.__fakeH = 19; });
  await page.waitForTimeout(1200);
  const hud19 = await page.textContent('#hud-time');
  check('실제 시계: 19시가 지나면 HUD가 밤으로 바뀜', hud18.includes('낮') && hud19.includes('밤'), `${hud18} → ${hud19}`);
  // 새로고침 후 이어하기
  await page.reload();
  console.log('continue button visible:', await page.isVisible('#btn-continue'));
  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
