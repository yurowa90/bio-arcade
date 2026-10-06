// 휴대폰 화면(390×844, 터치)에서 처음부터 두 체육관까지 실제로 플레이한다.
const playwright = require(process.env.PW || 'playwright');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
const path = require('path');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || '.';
  fs.mkdirSync(out, { recursive: true });
  console.log(`엔진: ${browserName} · 동작 줄이기: ${reducedMotion ? '켬' : '끔'}`);
  const browser = await playwright[browserName].launch();
  const mediaReady = new WeakMap();
  const createContext = async options => {
    // 컨텍스트 설정은 팝업도 첫 문서부터 같은 미디어 설정을 물려받게 한다.
    const context = await browser.newContext(reducedMotion ? { ...options, reducedMotion: 'reduce' } : options);
    if (reducedMotion) context.on('page', p => {
      const ready = p.emulateMedia({ reducedMotion: 'reduce' });
      mediaReady.set(p, ready);
      ready.catch(e => { console.error('동작 줄이기 설정 실패:', e.message); process.exitCode = 1; });
    });
    return context;
  };
  const ctx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (reducedMotion) await mediaReady.get(page);
  const errors = [];
  const consoleErrors = [];
  let ignoredManifestErrors = 0;
  const isFileManifest = url => {
    try { const u = new URL(url); return u.protocol === 'file:' && u.pathname.endsWith('/manifest.webmanifest') && !u.search && !u.hash; } catch { return false; }
  };
  const manifestMessages = new Set([
    'Origin null is not allowed by Access-Control-Allow-Origin. Status code: 0',
    'Failed to load resource: Origin null is not allowed by Access-Control-Allow-Origin. Status code: 0',
  ]);
  const watchErrors = p => {
    let evidence = { url: p.url(), manifestFailed: false, otherFailed: false };
    p.on('framenavigated', f => { if (f === p.mainFrame()) evidence = { url: f.url(), manifestFailed: false, otherFailed: false }; });
    p.on('requestfailed', r => { if (isFileManifest(r.url())) evidence.manifestFailed = true; else evidence.otherFailed = true; });
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text(), url = m.location().url || '';
      if (isFileManifest(url) && manifestMessages.has(text)) evidence.manifestFailed = true;
      consoleErrors.push({ text, url, evidence });
    });
  };
  const finishErrors = () => {
    for (const { text, url, evidence } of consoleErrors) {
      // WebKit은 file:// manifest만 CORS로 막는다. https에서는 없으며, 다른 요청·문구는 실패로 남긴다.
      // 첫 문장은 위치가 비어 있을 수 있어 같은 문서의 실패 요청(또는 두 번째 문장의 manifest URL)로 확인한다.
      const confirmed = isFileManifest(url) || ((!url || url === evidence.url) && evidence.manifestFailed && !evidence.otherFailed);
      if (browserName === 'webkit' && manifestMessages.has(text) && confirmed) ignoredManifestErrors++;
      else errors.push(text);
    }
  };
  watchErrors(page);
  // 확인 항목: 실패하면 FAIL을 찍고 종료 코드를 1로 둔다
  const failures = [];
  const check = (name, cond, extra = '') => { if (!cond) { failures.push(name); process.exitCode = 1; } console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
  const questSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('bioQuest.v1')));
  await page.goto('file://' + path.resolve(__dirname, '../games/quest/index.html'));
  await page.screenshot({ path: `${out}/01-title.png` });
  // 화면에 실제로 보이는지: hidden 속성이 아니라 계산된 display와 isVisible로 판단한다(CSS가 hidden을 덮는 함정 대비)
  const shown = sel => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }, sel);
  check('저장이 없으면 이어하기 버튼이 보이지 않음', !(await shown('#btn-continue')));
  await page.click('#btn-new');
  await page.waitForTimeout(100);
  check('처음부터를 누르면 타이틀이 사라짐', !(await shown('#title')));
  const topAtMap = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el ? (el.id || el.className || el.tagName) : null; });
  check('지도 가운데를 가리는 타이틀 요소가 없음', !(await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(el && el.closest('#title')); })), String(topAtMap));
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
  // quest-6: 파트너 선택도 최소 44px 터치 높이를 확보한다.
  check('quest-6 파트너 선택 높이 44px 이상', await page.$$eval('#dialog-choices button', bs => bs.length > 0 && bs.every(b => b.getBoundingClientRect().height >= 44)));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check('키보드로 파트너 선택(Tab → Enter)', (await page.evaluate(() => window.__bq.S.partner)) === 'mito');
  for (let i = 0; i < 40 && (await mode()) === 'dialog'; i++) { await page.keyboard.press(i % 2 ? 'Enter' : ' '); await page.waitForTimeout(40); }
  console.log('after intro mode:', await mode(), 'partner:', await page.evaluate(() => window.__bq.S.partner));
  check('키보드로 인트로 끝까지 진행', (await mode()) === 'walk' && (await page.evaluate(() => window.__bq.S.introDone)));
  // 이동: 시작 칸(9,5) 바로 위(9,4)는 표지판이라 막힌다. 아래 칸(9,6)은 빈 길이므로 아래로 움직여 좌표가 바뀌는지 본다
  const before = await page.evaluate(() => ({ ...window.__bq.player }));
  await page.dispatchEvent('.dir.down', 'pointerdown'); await page.waitForTimeout(520); await page.dispatchEvent('.dir.down', 'pointerup');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ ...window.__bq.player }));
  check('방향 버튼으로 아래로 이동', after.y > before.y && after.x === before.x, `y ${before.y} → ${after.y}`);
  await page.screenshot({ path: `${out}/03-town.png` });
  // 조우 → 관찰
  await page.evaluate(() => window.__bq.encounter('forest'));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/04-encounter.png` });
  const preMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('관찰 전 카드에 무리·분류·역할 칩이 없음', !/식물|동물|균류|척추|생산자|소비자|분해자/.test(preMeta), preMeta.replace(/\s+/g, ' ').trim());
  // 화면의 질문·힌트·선택지가 main.js의 observationQuestions(data.js의 ask)와 같은지 보고, 정답을 차례로 골라 도감에 등록한다
  const qOf = id => page.evaluate(id => { const sp = window.GameData.SPECIES.find(s => s.id === id); return { ask: [].concat(sp.ask), qs: window.__bq.observationQuestions(sp) }; }, id);
  const screenMatches = async Q => {
    const body = await page.textContent('#panel-body');
    const btns = await page.$$eval('.choice-list .btn', bs => bs.map(b => b.dataset.v));
    return body.includes(Q.q) && (await page.textContent('#panel-body .q-hint')).includes(Q.hint) && btns.join() === Q.options.map(o => o.v).join();
  };
  const encName = await page.textContent('#panel-body .species-card h3');
  const encId = await page.evaluate(name => window.GameData.SPECIES.find(s => s.name === name).id, encName);
  const enc = await qOf(encId);
  let encShown = enc.qs.map(Q => Q.key).join() === enc.ask.join();
  for (const Q of enc.qs) { encShown = encShown && (await screenMatches(Q)); await page.click(`.choice-list .btn[data-v="${Q.answer}"]`); }
  check('조우 화면: data.js의 ask대로 질문과 힌트가 나옴', encShown, `${encName}: ${enc.ask.join('→')}`);
  const encText = await page.textContent('#panel-body');
  check('조우: 정답을 고르면 관찰 성공·도감 등록', encText.includes('관찰 성공') && (await page.evaluate(id => window.__bq.S.dex[id].done, encId)));
  // 느타리: 무리 질문을 맞히면 카드를 가린 채 역할 질문이 이어지고, 둘 다 맞혀야 관찰이 완성된다
  const oy = await qOf('oyster');
  const meetOyster = () => page.evaluate(() => { const S = window.__bq.S; delete S.dex.oyster; window.__bq.encounter('forest', window.GameData.SPECIES.find(s => s.id === 'oyster')); });
  await page.click('#enc-ok');
  await meetOyster();
  await page.waitForTimeout(60);
  const oyFirst = await page.textContent('#panel-body');
  check('느타리 1단계: 무리 질문, 질문 수(하나 더)는 미리 보이지 않음', oy.qs.map(Q => Q.key).join() === 'kind,role' && (await screenMatches(oy.qs[0])) && !oyFirst.includes('하나 더'), oy.qs[0].q);
  await page.click('.choice-list .btn[data-v="균류"]');
  const oyMid = await page.textContent('#panel-body');
  const oyMidMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('느타리 2단계: 무리를 맞히면 역할 질문이 이어짐(카드는 계속 가림, 아직 미등록)', oyMid.includes('하나 더 관찰해 보자') && (await screenMatches(oy.qs[1])) && !/균류|분해자/.test(oyMidMeta) && !(await page.evaluate(() => window.__bq.S.dex.oyster.done)), oyMid.match(/맞았다![^.]*\./)?.[0] || '');
  const oyMidView = await page.evaluate(() => ({ top: document.getElementById('panel-body').scrollTop, focus: !!document.activeElement.closest('.choice-list') }));
  check('느타리 2단계: 화면 맨 위에서 시작하고(맞았다 안내가 보임) 키보드 초점은 선택지에 있음', oyMidView.top === 0 && oyMidView.focus, JSON.stringify(oyMidView));
  await page.screenshot({ path: `${out}/04b-oyster-role.png` });
  await page.click('.choice-list .btn[data-v="소비자"]');
  const oyWrong = await page.textContent('#panel-body');
  const oyRec = await page.evaluate(() => ({ ...window.__bq.S.dex.oyster }));
  check('느타리 2단계 오답: 정답(분해자)을 알려 주고 관찰 미완성', oyWrong.includes('아쉽다') && oyWrong.includes('정답은 “분해자') && !oyRec.done && oyRec.wrong === 1 && oyRec.tries === 2, JSON.stringify(oyRec));
  // quest-2: 계속 탐사에 초점이 있어도 오답 해설 전체가 본문 맨 위에 보인다.
  const feedbackVisible = () => page.evaluate(() => {
    const body = document.getElementById('panel-body'), fb = body.querySelector('.feedback');
    const b = body.getBoundingClientRect(), f = fb.getBoundingClientRect();
    return body.scrollTop === 0 && f.top >= b.top && f.bottom <= b.bottom && document.activeElement.id === 'enc-ok';
  });
  check('quest-2 오답 직후 해설이 가려지지 않음', await feedbackVisible());
  await page.click('#enc-ok');
  await meetOyster();
  await page.waitForTimeout(60);
  await page.click('.choice-list .btn[data-v="균류"]');
  await page.click('.choice-list .btn[data-v="분해자"]');
  check('느타리: 무리·역할을 모두 맞히면 관찰 성공', (await page.textContent('#panel-body')).includes('관찰 성공') && (await page.evaluate(() => window.__bq.S.dex.oyster.done)));
  check('quest-2 정답 직후 성공 안내가 가려지지 않음', await feedbackVisible());
  // 생물 전체: 실제 함수가 내는 질문 종류와 정답 분포(질문 종류만 보고 답을 짐작할 수 없어야 한다)
  const nSpecies = await page.evaluate(() => window.GameData.SPECIES.length);
  const qAll = await page.evaluate(() => window.GameData.SPECIES.flatMap(sp => window.__bq.observationQuestions(sp).map((Q, i) => ({ name: sp.name, kind: sp.kind, ask: [].concat(sp.ask)[i], first: i === 0, key: Q.key, answer: Q.answer, ok: Q.options.some(o => o.v === Q.answer), hint: Q.hint }))));
  const qDist = {};
  for (const r of qAll) (qDist[r.key] = qDist[r.key] || {})[r.answer] = (qDist[r.key][r.answer] || 0) + 1;
  console.log(`관찰 질문 분포(${nSpecies}종, 낼 수 있는 질문 전체):`, JSON.stringify(qDist));
  check('관찰 질문: 모든 생물이 ask대로 질문받고 정답이 선택지에 있음', qAll.every(r => r.key === r.ask && r.ok && r.hint));
  check('관찰 질문: 척추 질문은 동물에게만', qAll.every(r => r.key !== 'vert' || r.kind === '동물'));
  check('관찰 질문: 종류마다 정답이 둘 이상으로 갈리고 한 정답이 60%를 넘지 않음', Object.values(qDist).every(v => { const n = Object.values(v); return n.length >= 2 && Math.max(...n) / n.reduce((a, b) => a + b, 0) <= 0.6; }));
  check('관찰 질문: 역할 질문에서 분해자도 정답으로 나옴', (qDist.role || {})['분해자'] > 0, JSON.stringify(qDist.role));
  const firstDecomposer = qAll.filter(r => r.first && r.key === 'role' && r.answer === '분해자').map(r => r.name);
  check('관찰 질문: 첫 질문의 정답이 분해자인 생물이 있음', firstDecomposer.length > 0, firstDecomposer.join(',') || '없음');
  const kindHint = qAll.find(r => r.key === 'kind').hint;
  check('무리 질문 힌트: 엽록체 유무만으로 균류와 동물을 가르게 하지 않음', /균류와 동물/.test(kindHint), kindHint);
  await page.screenshot({ path: `${out}/05-observed.png` });
  await page.click('#enc-ok');
  // 푸른곰팡이(균류·분해자): 첫 질문이 역할 질문이고, 분해자를 고르면 한 번에 관찰이 완성된다
  const bm = await qOf('bluemold');
  await page.evaluate(() => { const S = window.__bq.S; delete S.dex.bluemold; window.__bq.encounter('forest', window.GameData.SPECIES.find(s => s.id === 'bluemold')); });
  await page.waitForTimeout(60);
  const bmMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('푸른곰팡이: 첫 질문이 역할 질문(정답 분해자)이고 관찰 전 카드에 무리·역할 칩이 없음', bm.qs.map(Q => Q.key).join() === 'role' && bm.qs[0].answer === '분해자' && (await screenMatches(bm.qs[0])) && !/균류|분해자/.test(bmMeta), bm.qs[0].q);
  await page.click('.choice-list .btn[data-v="분해자"]');
  check('푸른곰팡이: 분해자를 고르면 관찰 성공·도감 등록', (await page.textContent('#panel-body')).includes('관찰 성공') && (await page.evaluate(() => window.__bq.S.dex.bluemold.done)));
  await page.screenshot({ path: `${out}/05b-bluemold.png` });
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
  // quest-3: 지난 턴이 없는 첫 화면은 세 요인 0 막대 대신 계산 전 안내를 보인다.
  check('quest-3 첫 턴은 계산 전 안내와 녹말 막대만 표시', (await page.textContent('.factor-pending')).includes('아직 계산 전') && await page.locator('.meter').count() === 1);
  // quest-7: 패널 방향키는 기본 스크롤을 막지 않고, 행동으로 갱신해도 같은 버튼에 초점을 둔다.
  check('quest-7 패널에서는 방향키 기본 동작을 막지 않음', await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    document.dispatchEvent(e); return !e.defaultPrevented;
  }));
  // 기공(stomata)은 턴을 쓰지 않는다: 1턴 전에 열고, 7턴(밤)에 닫았다가 8턴에 다시 연다
  for (const [i, a] of 'stomata water water leaf water leaf water stomata leaf stomata water leaf water'.split(' ').entries()) {
    await page.click(`[data-a="${a}"]`);
    if (i === 0) check('quest-7 기공 전환 뒤 같은 행동 버튼에 초점 유지', await page.evaluate(() => document.activeElement.dataset.a === 'stomata'));
    if (i === 7) await page.screenshot({ path: `${out}/06-photo-battle.png` });
  }
  const photoRes = await page.$eval('#panel-body .feedback', el => el.textContent.replace(/\s+/g, ' ').trim());
  // 별 표시는 꺼진 별도 ★ 글자로 그리므로, 켜진 별 수는 .off가 아닌 별로 센다
  const photoStars = await page.$eval('#panel-body .feedback .stars', el => 3 - el.querySelectorAll('.off').length);
  const starchLabel = await page.$$eval('#panel-body .meter', ms => ms.map(m => m.querySelector('.meter-label').textContent.replace(/\s+/g, ' ').trim()).find(t => t.startsWith('녹말')));
  check('광합성 결과: 밤에 닫으면 별 3 + 칭찬', photoStars === 3 && photoRes.includes('밤에 기공을 닫아'), `별 ${photoStars} · ${photoRes}`);
  check('quest-5 D-054 Q5 서술 범위를 멈춘 턴 하나로 좁힘', (await page.textContent('#panel-body')).includes('광합성이 멈춘 턴 하나를 골라') && !(await page.textContent('#panel-body')).includes('가장 크게 막은'));
  check('녹말 막대 숫자 = 결과 녹말', starchLabel.includes((photoRes.match(/녹말 (\d+)/) || [])[1] + ' '), starchLabel);
  let stored = await questSave();
  check('광합성 버튼 전 결과 기록 1개·별 3 배지가 저장됨', stored.records.filter(r => r.gym === 'photo').length === 1 && stored.badges.photo === 3);
  await page.fill('#refl', '밤에는 빛이 없어 광합성을 못 하므로 기공을 닫아 물을 아꼈다.');
  await page.waitForTimeout(500);
  check('광합성 버튼 전 0.5초 서술 답 저장', (await questSave()).records.find(r => r.gym === 'photo')?.reflection === '밤에는 빛이 없어 광합성을 못 하므로 기공을 닫아 물을 아꼈다.');
  await page.screenshot({ path: `${out}/07-photo-result.png` });
  await page.click('#p-done');
  await page.waitForTimeout(200);
  await drain();
  check('광합성 결과 버튼 뒤에도 대결은 1개', (await questSave()).records.filter(r => r.gym === 'photo').length === 1);
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
  const digestStarsOn = () => page.$eval('#panel-body .feedback .stars', el => 3 - el.querySelectorAll('.off').length);
  const bileRes = await page.$eval('#panel-body .feedback', el => el.textContent.replace(/\s+/g, ' ').trim());
  check('소화 결과: 쓸개즙으로 유화한 뒤 분해 → 별 3', (await digestStarsOn()) === 3 && bileRes.includes('완벽한'), bileRes);
  stored = await questSave();
  check('소화 버튼 전 결과 기록 1개·별 3 배지가 저장됨', stored.records.filter(r => r.gym === 'digest').length === 1 && stored.badges.digest === 3);
  await page.fill('#refl', '쓸개즙은 지방을 작은 방울로 만들어 라이페이스가 닿는 표면적을 넓힌다.');
  await page.waitForTimeout(500);
  check('소화 버튼 전 0.5초 서술 답 저장', (await questSave()).records.find(r => r.gym === 'digest')?.reflection === '쓸개즙은 지방을 작은 방울로 만들어 라이페이스가 닿는 표면적을 넓힌다.');
  await page.fill('#refl', '   '); await page.waitForTimeout(500);
  check('탐사대 공백 답은 D-053 ④에 따라 이전 답을 지움', (await questSave()).records.find(r => r.gym === 'digest')?.reflection === '');
  await page.fill('#refl', '쓸개즙은 지방을 작은 방울로 만들어 라이페이스가 닿는 표면적을 넓힌다.');
  await page.click('#d-done');
  await page.waitForTimeout(200);
  await drain();
  check('소화 결과 버튼 뒤에도 대결은 1개', (await questSave()).records.filter(r => r.gym === 'digest').length === 1);
  console.log('digest badge:', await page.evaluate(() => window.__bq.S.badges.digest));
  // 다시 도전: 쓸개즙 없이 이자액 두 번 → 이기지만 별 2, 결과에 유화 안내
  await page.evaluate(() => { window.__bq.gymDigest(); });
  await page.waitForTimeout(200);
  await drain();
  for (const m of ['saliva', 'chew', 'gastric', 'mix', 'pancreas', 'pancreas', 'intestinal']) await page.click(`[data-m="${m}"]`);
  for (const [k, v] of [['starch', 'capillary'], ['protein', 'capillary'], ['fat', 'lacteal']]) await page.click(`[data-k="${k}"][data-v="${v}"]`);
  await page.click('#ab-go');
  const noBileRes = await page.$eval('#panel-body .feedback', el => el.textContent.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${out}/09b-digest-nobile.png` });
  check('소화 결과: 쓸개즙 없이 분해 → 승리·별 2 + 유화 안내', noBileRes.includes('승리') && (await digestStarsOn()) === 2 && /유화/.test(noBileRes) && /표면적/.test(noBileRes) && /소화 효소가 없/.test(noBileRes), noBileRes);
  check('소화 결과: 입에서 침·위에서 위액을 썼으면 장소별 소화액 안내는 없음', !noBileRes.includes('분해되기 시작한다') && (noBileRes.match(/별 3개는/g) || []).length === 1, noBileRes);
  await page.click('#d-done');
  await page.waitForTimeout(200);
  await drain();
  // 다시 도전: 입·위에서 침·위액을 쓰지 않으면(씹기·꿈틀 운동만) 이기지만 별 2, 빠진 소화액만 안내한다
  async function digestRetry(moves, shot) {
    await page.evaluate(() => { window.__bq.gymDigest(); });
    await page.waitForTimeout(200);
    await drain();
    for (const m of moves) await page.click(`[data-m="${m}"]`);
    for (const [k, v] of [['starch', 'capillary'], ['protein', 'capillary'], ['fat', 'lacteal']]) await page.click(`[data-k="${k}"][data-v="${v}"]`);
    await page.click('#ab-go');
    const res = await page.$eval('#panel-body .feedback', el => el.textContent.replace(/\s+/g, ' ').trim());
    const stars = await digestStarsOn();
    if (shot) await page.screenshot({ path: `${out}/${shot}` });
    await page.click('#d-done');
    await page.waitForTimeout(200);
    await drain();
    return { res, stars, star3: (res.match(/별 3개는/g) || []).length };
  }
  const noPlace = await digestRetry(['chew', 'chew', 'mix', 'mix', 'bile', 'pancreas', 'intestinal'], '09c-digest-noplace.png');
  check('소화 결과: 입·위에서 침·위액 없이 분해 → 승리·별 2 + 침·위액 안내(유화 안내 없음)', noPlace.res.includes('승리') && noPlace.stars === 2 && noPlace.res.includes('녹말은 입에서 침으로, 단백질은 위에서 위액으로 분해되기 시작한다') && !noPlace.res.includes('유화하기 전에') && noPlace.res.includes('별 3개는 입에서 침을, 위에서 위액을 써야 받을 수 있다') && noPlace.star3 === 1, noPlace.res);
  const noSalivaBile = await digestRetry(['chew', 'chew', 'gastric', 'mix', 'pancreas', 'pancreas', 'intestinal'], '09d-digest-nosaliva-nobile.png');
  check('소화 결과: 침·쓸개즙이 빠지면 빠진 것만 안내하고 별 3 조건은 한 문장', noSalivaBile.res.includes('승리') && noSalivaBile.stars === 2 && noSalivaBile.res.includes('녹말은 입에서 침으로 분해되기 시작한다') && !noSalivaBile.res.includes('단백질은 위에서') && /유화/.test(noSalivaBile.res) && noSalivaBile.res.includes('별 3개는 입에서 침을 쓰고, 쓸개즙으로 지방을 유화한 뒤 이자액으로 분해해야 받을 수 있다') && noSalivaBile.star3 === 1, noSalivaBile.res);
  const lastDigest = await page.evaluate(() => window.__bq.S.records.filter(r => r.gym === 'digest').map(r => ({ stars: r.stars, saliva: r.salivaMouth, gastric: r.gastricStomach, emulsified: r.emulsified })));
  const expectDigest = [{ stars: 3, saliva: true, gastric: true, emulsified: true }, { stars: 2, saliva: true, gastric: true, emulsified: false }, { stars: 2, saliva: false, gastric: false, emulsified: true }, { stars: 2, saliva: false, gastric: true, emulsified: false }];
  check('소화 기록: 입 침·위 위액·유화 여부가 남고, 배지는 더 높은 별을 유지', JSON.stringify(lastDigest) === JSON.stringify(expectDigest) && (await page.evaluate(() => window.__bq.S.badges.digest)) === 3, JSON.stringify(lastDigest));
  // 밤 지도 + 도감 + 기록
  await page.evaluate(() => { window.__bq.S.timeMode = 'night'; window.__bq.warp('route1', 9, 12); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/10-night.png` });
  await page.click('#btn-b'); await page.click('#m-dex');
  // quest-8: 발견과 관찰 완료는 테두리 색 외에 글자·기호로도 구별한다.
  check('quest-8 도감 완료는 ✓ 관찰 완료로 표시', (await page.textContent('.dex-cell.done .dex-state')).includes('✓ 관찰 완료'));
  check('quest-6 패널 닫기 높이 44px 이상', await page.$eval('#panel-close', b => b.getBoundingClientRect().height >= 44));
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

  // 별도 가상 기기에서 결과 재시도·이탈·허브 삭제를 검사한다.
  const saveCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const resultPage = await saveCtx.newPage(), hubPage = await saveCtx.newPage();
  if (reducedMotion) await Promise.all([mediaReady.get(resultPage), mediaReady.get(hubPage)]);
  watchErrors(resultPage); watchErrors(hubPage);
  const questURL = 'file://' + path.resolve(__dirname, '../games/quest/index.html');
  const hubURL = 'file://' + path.resolve(__dirname, '../index.html');
  await resultPage.goto(questURL);
  const seed = await questSave(); seed.records = []; seed.badges = { photo: 3 }; seed.student = { id: '20315', name: '테스트' };
  await resultPage.evaluate(s => localStorage.setItem('bioQuest.v1', JSON.stringify(s)), seed);
  await resultPage.reload(); await resultPage.click('#btn-continue');
  const resultSave = () => resultPage.evaluate(() => JSON.parse(localStorage.getItem('bioQuest.v1')));
  const drainResult = async () => {
    for (let i = 0; i < 40 && await resultPage.evaluate(() => window.__bq.mode === 'dialog'); i++) {
      const choice = await resultPage.$('#dialog-choices button');
      if (choice) await choice.click(); else await resultPage.click('#dialog');
      await resultPage.waitForTimeout(60);
    }
  };
  const completeDigest = async () => {
    await drainResult();
    for (const m of ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal']) await resultPage.click(`[data-m="${m}"]`);
    for (const [k, v] of [['starch', 'capillary'], ['protein', 'capillary'], ['fat', 'lacteal']]) await resultPage.click(`[data-k="${k}"][data-v="${v}"]`);
    await resultPage.click('#ab-go');
  };
  await resultPage.evaluate(() => { window.__bq.gymDigest(); }); await completeDigest();
  await resultPage.evaluate(() => { window.__oldReflection = document.getElementById('refl'); });
  await resultPage.fill('#refl', '다시 도전 전 답'); await resultPage.click('#d-retry');
  await completeDigest();
  check('다시 도전은 대결마다 기록 1개', (await resultSave()).records.length === 2);
  await resultPage.evaluate(() => { window.__oldReflection.value = '닫힌 카드 오염'; window.__oldReflection.dispatchEvent(new Event('input')); });
  await resultPage.fill('#refl', '둘째 대결 답'); await resultPage.waitForTimeout(500);
  stored = await resultSave();
  check('다시 도전 뒤 타이머·리스너 정리와 판 분리', stored.records.length === 2 && stored.records[0].reflection === '다시 도전 전 답' && stored.records[1].reflection === '둘째 대결 답');
  await hubPage.goto(hubURL);
  await hubPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bioQuest.v1'));
    const last = s.records.at(-1);
    s.records.push({ ...last, at: new Date(Date.parse(last.at) + 1).toISOString(), reflection: '' });
    localStorage.setItem('bioQuest.v1', JSON.stringify(s));
  });
  await resultPage.fill('#refl', '고정한 둘째 대결 답'); await resultPage.waitForTimeout(500);
  stored = await resultSave();
  check('탐사대 다른 탭이 뒤 판을 더해도 대상 판만 갱신', stored.records.length === 3 && stored.records[1].reflection === '고정한 둘째 대결 답' && stored.records[2].reflection === '');
  await resultPage.fill('#refl', '탐사대 숨김 직전 답');
  await resultPage.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState;
  });
  check('탐사대 hidden 이벤트 즉시 저장', (await resultSave()).records[1]?.reflection === '탐사대 숨김 직전 답');
  await resultPage.fill('#refl', '탐사대 pagehide 직전 답');
  await resultPage.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide')); });
  stored = await resultSave();
  check('탐사대 pagehide 반복 저장은 대결 추가 없음', stored.records.length === 3 && stored.records[1].reflection === '탐사대 pagehide 직전 답' && stored.records[2].reflection === '');
  await resultPage.fill('#refl', '탐사대 실제 이동 직전 답');
  await resultPage.goto(hubURL);
  stored = await resultSave();
  check('탐사대 버튼 없는 실제 이동 뒤 결과·배지·서술 보존', stored.records.length === 3 && stored.badges.digest === 3 && stored.records[1].reflection === '탐사대 실제 이동 직전 답' && stored.records[2].reflection === '');
  await resultPage.goto(questURL); await resultPage.click('#btn-continue');
  await resultPage.evaluate(() => { window.__bq.gymDigest(); }); await completeDigest();
  await hubPage.goto(hubURL); hubPage.on('dialog', d => d.accept()); await hubPage.click('#clear');
  await resultPage.fill('#refl', '삭제 뒤 입력'); await resultPage.waitForTimeout(500);
  check('허브 삭제 뒤 탐사대 입력 저장은 복구하지 않음', await hubPage.evaluate(() => localStorage.getItem('bioQuest.v1') === null));
  await resultPage.fill('#refl', '삭제 뒤 버튼'); await resultPage.click('#d-done'); await drainResult();
  // 메뉴의 일반 writeSave도 삭제된 세션을 복구하지 않는다.
  await resultPage.click('#btn-b'); await resultPage.click('#m-save');
  await resultPage.goto(hubURL);
  check('허브 삭제 뒤 탐사대 버튼·일반 저장·이탈은 복구하지 않음', await hubPage.evaluate(() => localStorage.getItem('bioQuest.v1') === null));
  await saveCtx.close();

  // quest-1·2·4·6: 긴/짧은 화면 모두 오답·정답 피드백, 남는 높이, 즉시 재도전을 검사한다.
  const uxCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ux = await uxCtx.newPage();
  if (reducedMotion) await mediaReady.get(ux);
  watchErrors(ux);
  await ux.goto(questURL);
  await ux.evaluate(s => localStorage.setItem('bioQuest.v1', JSON.stringify(s)), { ...seed, records: [], introDone: true });
  await ux.reload(); await ux.click('#btn-continue');
  const panelHeights = [];
  for (const height of [844, 664]) {
    await ux.setViewportSize({ width: 390, height });
    const mapHeight = await ux.$eval('#screen', el => el.getBoundingClientRect().height);
    for (const answer of ['소비자', '분해자']) {
      await ux.evaluate(() => { delete window.__bq.S.dex.oyster; window.__bq.encounter('forest', window.GameData.SPECIES.find(s => s.id === 'oyster')); });
      check(`quest-6 ${height}px 관찰 그만두기 높이 44px 이상`, await ux.$eval('#enc-run', el => el.getBoundingClientRect().height >= 44));
      await ux.click('[data-v="균류"]'); await ux.click(`[data-v="${answer}"]`);
      const geometry = await ux.evaluate(() => {
        const body = document.getElementById('panel-body'), f = body.querySelector('.feedback').getBoundingClientRect(), b = body.getBoundingClientRect(), s = document.getElementById('screen').getBoundingClientRect();
        return { top: body.scrollTop, visible: f.top >= b.top && f.bottom <= b.bottom, screen: s.height, bottom: s.bottom, focus: document.activeElement.id };
      });
      check(`quest-2 ${height}px ${answer === '소비자' ? '오답' : '정답'} 직후 해설 전체 표시`, geometry.top === 0 && geometry.visible && geometry.focus === 'enc-ok', JSON.stringify(geometry));
      if (answer === '소비자') panelHeights.push(geometry.screen);
      check(`quest-1 ${height}px 패널을 열면 남는 높이를 활용`, geometry.screen > mapHeight + 100 && geometry.bottom <= height);
      await ux.screenshot({ path: `${out}/ux-${height}-${answer === '소비자' ? 'wrong' : 'right'}.png` });
      await ux.click('#enc-ok');
      check(`quest-1 ${height}px 닫으면 지도 비율 복원`, Math.abs(await ux.$eval('#screen', el => el.getBoundingClientRect().height) - mapHeight) < 1);
    }
  }
  check('quest-1 패널 높이가 화면 높이에 따라 증가', panelHeights[0] - panelHeights[1] >= 170);
  // 대사가 끝나야 풀리는 Promise를 evaluate의 반환값으로 넘기지 않는다.
  const drainGymDialog = async () => {
    await ux.evaluate(() => { document.activeElement.blur(); });
    for (let i = 0; i < 40 && await ux.evaluate(() => window.__bq.mode === 'dialog'); i++) {
      await ux.keyboard.press('Enter'); await ux.waitForTimeout(30);
    }
    await ux.waitForFunction(() => window.__bq.mode === 'panel' && document.getElementById('dialog').hidden);
  };
  await ux.evaluate(() => { window.__bq.gymPhoto(); });
  await drainGymDialog();
  for (let i = 0; i < 10; i++) await ux.click('[data-a="water"]');
  await ux.click('#p-retry');
  check('quest-4 광합성 다시 도전은 규칙 대사 없이 첫 턴', await ux.evaluate(() => window.__bq.mode === 'panel' && document.getElementById('dialog').hidden && !!document.querySelector('.factor-pending') && document.querySelector('.battle-top').textContent.includes('턴 1/10')));
  // 소화도 결과의 다시 도전 버튼에서 규칙 반복을 생략한다.
  await ux.evaluate(() => { window.__bq.S.badges.photo = 3; window.__bq.gymDigest(); });
  await drainGymDialog();
  for (const m of ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal']) await ux.click(`[data-m="${m}"]`);
  for (const [k, v] of [['starch', 'capillary'], ['protein', 'capillary'], ['fat', 'lacteal']]) await ux.click(`[data-k="${k}"][data-v="${v}"]`);
  await ux.click('#ab-go'); await ux.click('#d-retry');
  check('quest-4 소화 다시 도전은 규칙 대사 없이 입에서 시작', await ux.evaluate(() => window.__bq.mode === 'panel' && document.getElementById('dialog').hidden && document.querySelector('.tract .on')?.textContent === '입'));
  await uxCtx.close();
  finishErrors();
  console.log('errors:', errors.length ? errors : 'none');
  console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
  console.log('failures:', failures.length ? failures : 'none');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
