// 휴대폰 화면에서 오락실 허브와 모든 미니게임을 실제로 플레이해 본다.
const playwright = require(process.env.PW || 'playwright');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
const path = require('path');
const root = path.resolve(__dirname, '..');
(async () => {
  const out = process.argv[2] || '.';
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
  const errors = [], failures = [], dialogs = [];
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
    p.on('pageerror', e => errors.push(p.url().replace('file://' + root + '/', '') + ': ' + e.message));
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
    const gameId = name === 'glucose-resistance' ? 'glucose' : name;
    const plays = () => page.evaluate(({ k, id }) => JSON.parse(localStorage.getItem(k))?.games[id]?.plays || [], { k: STORE, id: gameId });
    const before = await plays(), target = before.length - 1;
    const hasFlow = ['basepang', 'circulation'].includes(gameId);
    if (hasFlow) {
      const other = await ctx.newPage();
      if (reducedMotion) await mediaReady.get(other);
      watchErrors(other);
      await other.goto('file://' + path.join(root, 'index.html'));
      await other.evaluate(id => window.Arcade.record(id, { stars: 0, score: 0, detail: {} }), gameId);
      await other.close();
    }
    // 인출 문항이 여러 개면(염기쌍 팡의 흐름 문항 등) 하나에 답해야 다음 문항·설명해 보기가 나온다
    for (let i = 0; i < 4; i++) { const opt = await page.$('#overlay .quiz-opts .btn:not([disabled]), #overlay .flow-opts .btn:not([disabled])'); if (!opt) break; await opt.click(); await page.waitForTimeout(150); }
    const t = await page.$('#ar-refl');
    if (hasFlow) {
      const saved = await plays();
      check(typeof saved[target]?.quizCorrect === 'boolean' && typeof saved[target]?.flowQuizCorrect === 'boolean' &&
        saved[target + 1]?.quizCorrect === undefined && saved[target + 1]?.flowQuizCorrect === undefined,
        `${name}: 다른 탭의 다음 판에 흐름 문항이 섞임`);
    }
    if (t) {
      await t.fill(`${name} 성찰 테스트`);
      await page.waitForTimeout(500);
      const saved = await plays();
      check(saved.length === before.length + Number(hasFlow) && saved[target]?.at === before[target]?.at && saved[target]?.reflection === `${name} 성찰 테스트` &&
        (!hasFlow || !saved[target + 1]?.reflection), `${name}: 버튼 전 0.5초 서술 자동 저장 실패`);
    }
    await page.screenshot({ path: `${out}/${name}-result.png` });
    // 버튼을 거치지 않은 실제 이동에서 300ms를 기다리지 않고 마지막 입력을 보존한다.
    if (name === 'mendel') {
      await page.fill('#ar-refl', 'mendel 이탈 직전 답');
      await go('index.html');
      check((await plays())[target]?.reflection === 'mendel 이탈 직전 답', '멘델: 버튼 없이 페이지 이동한 뒤 마지막 답 유실');
    } else await page.click('#ar-hub');
    console.log(`${name}: 결과 "${title}" · 가로 넘침 ${await overflow()}`);
    return target;
  };

  // 허브: 학번만 적고 시작한다. 이름은 기록이 쌓인 뒤 끝에서 채운다(빈 칸 채우기는 확인 창 없이).
  await go('index.html');
  await page.fill('#sid', '20315');
  console.log('허브 게임 칸 수:', await page.locator('.cab').count());
  await page.screenshot({ path: `${out}/hub.png`, fullPage: true });

  // 멘델의 텃밭
  const checkMendelPrompt = async (kind, required, forbidden = []) => {
    const result = await page.evaluate(k => {
      const label = document.querySelector('#ar-refl').closest('.refl');
      const prompt = [...label.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim().replace(/^—\s*/, '');
      return { prompt, detail: JSON.parse(localStorage.getItem(k)).games.mendel.plays.at(-1).detail };
    }, STORE);
    check(result.detail.reflectionKind === kind && result.detail.reflectionPrompt === result.prompt && required.every(t => result.prompt.includes(t)) && forbidden.every(t => !result.prompt.includes(t)),
      `멘델: ${kind} 문항 선택·화면과 저장 원문 일치 실패`);
  };
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
  await checkMendelPrompt('selfRrYy', ['내 실험 노트의 RrYy 자가 수분 결과', '9:3:3:1', '분리의 법칙과 독립의 법칙']);
  await finishCheck('mendel');

  // 자가 수분 전에 마감하거나 다른 교배만 했을 때, 하지 않은 실험을 설명시키지 않는다.
  await go('games/mendel/index.html'); await page.click('#ar-start');
  await page.click('#t-end');
  await checkMendelPrompt('noExperiment', ['이번 판에서는 아직 교배하지 않았어요.', '예상해 보세요.'], ['9:3:3:1']);
  await page.click('#ar-retry');
  await page.click('.pot[data-i="0"]'); await page.click('.pot[data-i="1"]'); await page.click('#t-cross');
  await page.click('.seed[data-i="0"]'); await page.click('#plant');
  await page.click('#t-end');
  await checkMendelPrompt('otherCross', ['RRYY', 'rryy', '둥글고 황색 16개', '어버이의 대립유전자가 생식세포와 자손에게 전달되는 과정'], ['9:3:3:1', '자가 수분']);
  await page.click('#ar-retry');
  await page.click('.pot[data-i="0"]'); await page.click('#t-self'); await page.click('#plant');
  await page.click('#t-end');
  await checkMendelPrompt('otherCross', ['RRYY', '자가 수분', '둥글고 황색 16개'], ['9:3:3:1']);
  await page.click('#ar-retry');
  await page.click('.pot[data-i="0"]'); await page.click('.pot[data-i="1"]'); await page.click('#t-cross');
  await page.click('.seed[data-i="0"]'); await page.click('#plant');
  await page.click('.pot[data-i="2"]'); await page.click('#t-test');
  await page.click('[data-g="RRYY"]'); await page.click('#gclose'); // 추론을 틀린 뒤 검정 교배
  await page.click('.pot[data-i="2"]'); await page.click('#t-test'); await page.click('#t-test');
  await page.click('[data-g="RRYY"]'); await page.click('#gclose');
  await page.click('#t-end');
  await checkMendelPrompt('testCross', ['검정 교배', '표현형 비율로 어버이의 유전자형', '약 1:1', '이론상 완전히 확실하지는 않은 까닭'], ['9:3:3:1', '자가 수분']);
  // 같은 판에 검정 교배도 있으면 RrYy 자가 수분을 우선한다. 난수만 고정해 기대와 같은 경우·다른 경우를 재현한다.
  await page.click('#ar-retry');
  await page.click('.pot[data-i="0"]'); await page.click('.pot[data-i="1"]'); await page.click('#t-cross');
  await page.click('.seed[data-i="0"]'); await page.click('#plant');
  await page.evaluate(() => {
    const draws = Array.from({ length: 16 }, (_, i) => [8, 4, 2, 1].map(bit => i & bit ? .75 : .25)).flat();
    let at = 0;
    Math.random = () => draws[at++ % draws.length];
  });
  await page.click('.pot[data-i="2"]'); await page.click('#t-self'); await page.click('#plant');
  await page.click('.pot[data-i="2"]'); await page.click('#t-test');
  await page.click('[data-g="RRYY"]'); await page.click('#gclose');
  await page.click('.pot[data-i="2"]'); await page.click('#t-test'); await page.click('#t-test');
  await page.click('[data-g="RrYy"]'); await page.click('#gclose');
  await page.click('#t-end');
  await checkMendelPrompt('selfRrYy', ['둥글고 황색 9개', '둥글고 녹색 3개', '주름지고 황색 3개', '주름지고 녹색 1개', '이번에는 기대와 같게 나왔지만']);
  await page.click('#ar-retry');
  await page.evaluate(() => { Math.random = () => .25; });
  await page.click('.pot[data-i="0"]'); await page.click('.pot[data-i="1"]'); await page.click('#t-cross');
  await page.click('.seed[data-i="0"]'); await page.click('#plant');
  await page.click('.pot[data-i="2"]'); await page.click('#t-self'); await page.click('#plant');
  await page.click('#t-end');
  await checkMendelPrompt('selfRrYy', ['둥글고 황색 16개', '실제 개수가 기대와 다른 까닭'], ['이번에는 기대와 같게']);
  await page.click('#ar-hub');

  // 가계도 지뢰찾기: 해결기가 찾은 확실한 보인자만 표시
  await go('games/pedigree/index.html');
  await page.click('#ar-start');
  await page.click('#choose-basic');
  check(await page.getAttribute('#mines', 'role') === 'status', '가계도 남은 보인자 수 상태 접근성 실패');
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.__pedigreeToastDelays = [];
    window.setTimeout = (fn, ms, ...args) => {
      if (String(fn).includes("classList.remove('on')")) window.__pedigreeToastDelays.push(ms);
      return original(fn, ms, ...args);
    };
  });
  for (let lv = 0; lv < 4; lv++) {
    check(await page.locator('#field .person-number').count() === 0, `가계도 기본 ${lv + 1}단계에 번호 글자가 나타남`);
    check(await page.isEnabled('#face') && (await page.textContent('#face')).startsWith('표시 지우기') && await page.getAttribute('#face', 'title') === '표시 지우기' && await page.getAttribute('#face', 'aria-label') === '표시 지우기',
      `가계도 ${lv + 1}단계 표시 지우기 이름·활성 상태 실패`);
    const must = await page.evaluate(i => window.Pedigree.solve(window.Pedigree.LEVELS[i]).must, lv);
    await page.click(`.person[data-id="${must[0]}"]`);
    await page.click(`.person[data-id="${must[0]}"]`); // ?도 함께 지워야 한다
    const unmarked = await page.evaluate(({ lv, marked }) => window.Pedigree.LEVELS[lv].people.find(p => !p.affected && p.id !== marked).id, { lv, marked: must[0] });
    await page.click(`.person[data-id="${unmarked}"]`);
    await page.click('#face');
    check(await page.$$eval('#field .person', ps => ps.every(p => p.getAttribute('aria-label').endsWith('표시 없음'))) && !(await page.isDisabled('#face')) && await page.textContent('#judge') === '판정하기',
      '가계도 표시 지우기가 모든 표시를 지우지 않거나 판정을 바꿈');
    for (const id of must) await page.click(`.person[data-id="${id}"]`);
    if (lv === 3) {
      await page.click('.person[data-id="k3"]'); // 발현자 클릭 → 안내만
      const timing = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, ms: window.__pedigreeToastDelays.at(-1) }));
      check(timing.ms === Math.min(6000, Math.max(2200, Array.from(timing.text).length * 70)), '가계도 토스트 공통 시간 규칙 불일치');
    }
    if (lv === 2) { await page.click('.person[data-id="h1"]'); } // 남성 오표시(일부러) → 지뢰
    if (lv === 2) await page.screenshot({ path: `${out}/pedigree-marked.png` });
    await page.click('#judge');
    const judgedField = await page.innerHTML('#field');
    check((await page.getAttribute(`#field .person[data-id="${must[0]}"]`, 'aria-label')).includes('판정 결과 맞힘'), '가계도 판정 뒤 접근성 이름에 맞힘 결과 없음');
    const faceOff = await page.$eval('#face', b => ({ disabled: b.disabled, text: b.textContent, label: b.getAttribute('aria-label'), title: b.title }));
    check(faceOff.disabled && faceOff.text.startsWith('표시 지우기') && faceOff.text.includes('판정 뒤 꺼짐') && faceOff.label === '표시 지우기' && faceOff.title === '표시 지우기', '가계도 판정 뒤 표시 지우기의 비활성·시각 표시 실패');
    await page.$eval('#face', b => b.click());
    check(await page.innerHTML('#field') === judgedField, '가계도 판정 뒤 표시 지우기가 판정 결과를 바꿈');
    if (lv === 2) await page.screenshot({ path: `${out}/pedigree-judged.png`, fullPage: true });
    await page.click('#judge');
  }
  check(await page.locator('.pedigree-reference .person-number').count() === 0, '가계도 기본 판 결과 축소본에 번호 글자가 나타남');
  check((await page.textContent('#overlay')).includes('잘못 표시 1명.') && (await page.textContent('#overlay')).includes('과학적 추론은 근거가 있는 곳까지만 말한다.'), '가계도 기본 판 결과 원본 문구 불일치');
  await finishCheck('pedigree');

  // 도전 1도 공개 묶음 시드로 정답을 구하고 실제 버튼으로 표시한다.
  await go('games/pedigree/index.html'); await page.click('#ar-start'); await page.click('#choose-1');
  const challengeMust = await page.evaluate(() => {
    const s = document.getElementById('stage'), P = window.Pedigree;
    return P.solve(P.makeBundle(Number(s.dataset.seed), Number(s.dataset.challenge), { avoid: (s.dataset.avoid || '').split(',').filter(Boolean) })[0]).must;
  });
  for (const id of challengeMust) await page.click(`#field .person[data-id="${id}"]`);
  await page.click('#judge');
  check((await page.textContent('#result')).includes('완전 해결') && await page.isDisabled('#face'), '가계도 도전 1 첫 문제 정답 판정 실패');

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
      // 연쇄마다 중간 판을 재생하므로(플레이 테스트 반영) 고정 대기 대신 터지는 연출이 끝날 때까지 기다린다.
      await page.waitForFunction(() => !document.querySelector('#grid .pop'), null, { timeout: 120000 });
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
      // 심장 방 칸은 이름판 rect 없이 방 그림으로 그린다(그래픽 A). 출구 위치는 모세 혈관 칸만 본다.
      if (sq.kind === 'capillary') {
        const rect = document.querySelector(`.square[data-square="${id}"] rect:last-of-type`).getBoundingClientRect();
        fail(id === 'lung' ? box.left > (rect.left + rect.right) / 2 : box.right < (rect.left + rect.right) / 2, `R-11 ${id} 출구 위치`);
      }
      const rings = [...d.querySelectorAll('circle')];
      fail(rings.every(c => c.getAttribute('fill') === 'none' && c.getAttribute('stroke') === '#fff' && c.getAttribute('r') === '2.5' && c.getAttribute('stroke-width') === '1.5'), 'R-07 CO₂ 고리 기호');
      fail(rings.every((c, i) => rings.slice(i + 1).every(other => !hit(bounds(c, 1.5), bounds(other, 1.5)))), 'R-07 CO₂ 고리 간격');
      if (rings.length === 1) fail(rings[0].getAttribute('cx') === '14', 'R-07 하나인 고리 중앙');
      const legend = document.querySelector('.co2-legend rect'), zones = [...document.querySelectorAll('.circuit-name')];
      // 두 순환 이름은 각 순환의 테두리색으로 쓴다(그래픽 A). 색이 같은 순환과 맞는지는 ux-arcade CI-4가 본다.
      fail(!!legend && zones.length === 2 && zones.map(t => t.dataset.circuit).sort().join() === 'pulmonary,systemic' && getComputedStyle(zones[0]).fill !== getComputedStyle(zones[1]).fill, 'R-03 범례 틀·두 순환 이름의 순환 표시와 색 구분');
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
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // 걸음 사이 대기가 없으면 MutationObserver가 중간 칸을 놓친다.
      // 판·경로·HUD가 모두 갱신된 시점에 같은 검사를 하여 18칸 단언을 유지한다.
      const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty($('status'), 'textContent', {
        get() { return textContent.get.call(this); },
        set(value) {
          textContent.set.call(this, value);
          // 입력 패널 해설은 drawCtrl 뒤의 기존 관찰자가 검사한다.
          if (window.__circ.view().type === 'die') inspect();
        },
      });
    }
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
  let expectedToast = '', exchangeSeen = false;
  const settledCapillaries = new Set();
  for (let guard = 0; guard < 300; guard++) {
    await page.waitForFunction(() => {
      const p = window.__circ.pending(), ctrl = document.getElementById('ctrl');
      return p.type === 'end' || (Number(ctrl.dataset.token) === p.token && !!ctrl.querySelector('button:not([disabled])'));
    });
    const p = await page.evaluate(() => window.__circ.pending());
    if (p.type === 'end') { circEnded = true; break; }
    if (!p.type.startsWith('final')) {
      // 토큰과 활성 입력으로 재생 완료를 기다렸으므로 fast·실제 속도 모두 검사할 수 있다.
      const settled = await page.evaluate(() => {
        const C = window.Circulation, s = window.__circ.state(), p = C.pending(s), h = C.hud(s);
        const sq = C.SQUARES.find(q => q.id === s.square), blood = C.BLOOD[sq.bloodOut || sq.blood];
        const key = p.slot || sq.structure || (sq.id === 'lung' ? '폐의 모세 혈관' : '온몸의 모세 혈관');
        const chips = [...document.querySelectorAll('#route .current')];
        const status = h.mode === 'fill' ? '보충 문항' : `지금 혈액: ${blood.label} · 이산화 탄소 ${blood.co2 === 3 ? '많음' : '적음'} · ${sq.circuit === 'pulmonary' ? '폐순환' : '온몸순환'}`;
        const mode = h.mode === 'practice' ? `${h.lap}/3바퀴` : { fill: '보충', ready: '연습 끝' }[h.mode];
        return {
          square: s.square, capillary: sq.kind === 'capillary',
          drop: document.getElementById('drop')?.dataset.square === s.square,
          blood: document.querySelector('#drop path')?.getAttribute('fill') === blood.color && document.querySelectorAll('#drop circle').length === blood.co2,
          board: p.squares ? document.querySelectorAll('.square.current').length === 0 : document.querySelector('.square.current')?.dataset.square === s.square,
          route: chips.length === 1 && chips[0].textContent === (C.STRUCTURES[key] ? (s.labels[key] ? C.STRUCTURES[key].name : '□') : key),
          hud: document.getElementById('mode').textContent === mode && document.getElementById('score').textContent === `${h.score}점` && document.getElementById('status').textContent === status,
          toastOn: document.getElementById('toast').classList.contains('on'), toast: document.getElementById('toast').textContent,
        };
      });
      check(settled.drop && settled.blood && settled.board && settled.route && settled.hud && !settled.toastOn && settled.toast === expectedToast,
        `순환 재생 뒤 최종 판·방울·경로 칩·HUD·토스트 불일치: ${JSON.stringify(settled)} / 기대 토스트: ${expectedToast}`);
      if (settled.capillary) settledCapillaries.add(settled.square);
    }
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
        trailLabel: document.getElementById('trail-label')?.textContent,
        trailLabelledBy: document.getElementById('trail').getAttribute('aria-labelledby'),
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
      check(view.trailLabel === '내가 고른 경로맞았는지는 바퀴 끝에서 알려 준다.' && view.trailLabelledBy === 'trail-label', '순환 선택한 경로의 이름·정오 공개 시점 안내·접근성 연결 실패');
      check(await page.$$eval('#trail .dark-chip:not(.landmark)', chips => chips.every(c => !c.matches('.right, .wrong') && !/[✓✗]/.test(c.textContent))), '순환 선택한 경로에서 중간 정오를 드러냄');
      // 모든 문항 단계·누적 경로 길이에서 작은 화면의 안내와 경로가 조작판 밖으로 넘치지 않는다.
      await page.setViewportSize({ width: 360, height: 640 });
      const trailFits = await page.evaluate(() => {
        const label = document.getElementById('trail-label'), trail = document.getElementById('trail'), panel = document.getElementById('dark');
        if (!label) return false;
        const l = label.getBoundingClientRect(), t = trail.getBoundingClientRect(), d = panel.getBoundingClientRect(), ctrl = document.getElementById('ctrl').getBoundingClientRect();
        return l.top >= d.top && l.bottom <= t.top && t.bottom <= d.bottom && d.bottom <= ctrl.top &&
          l.left >= 0 && l.right <= innerWidth && trail.scrollWidth <= trail.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 &&
          trail.scrollHeight <= trail.clientHeight + 1 && getComputedStyle(label).visibility === 'visible';
      });
      check(trailFits, `순환 360×640: 선택 경로 안내·칩이 겹치거나 잘림(${darkNames}개, ${p.type})`);
      if (darkNames === 8) await page.screenshot({ path: `${out}/circulation-chosen-path-small.png` });
      await page.setViewportSize({ width: 390, height: 660 });
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
    if (p.type === 'die') {
      // 순수 규칙이 낼 교환·바퀴 종료 안내와 실제 재생 뒤 남은 토스트를 대조한다.
      const events = await page.evaluate(pick => {
        const C = window.Circulation, s = window.__circ.state(), p = C.pending(s);
        return C.act(s, { type: p.type, token: p.token, pick, seconds: 0 }).events.filter(e => ['exchange', 'lapEnd'].includes(e.type));
      }, key);
      for (const e of events) {
        expectedToast = e.type === 'exchange' && !exchangeSeen ? e.note : e.text;
        if (e.type === 'exchange') exchangeSeen = true;
      }
    }
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
  check(['lung', 'brain', 'kidney', 'leg'].every(id => settledCapillaries.has(id)), '순환 폐·세 기관의 교환 뒤 최종 상태 검사 공백');
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
  const circTarget = await finishCheck('circulation');
  const circSaved = await page.evaluate(({ k, i }) => JSON.parse(localStorage.getItem(k)).games.circulation.plays[i], { k: STORE, i: circTarget });
  check(typeof circSaved.quizCorrect === 'boolean' && typeof circSaved.flowQuizCorrect === 'boolean' && circSaved.reflection === 'circulation 성찰 테스트',
    '순환 인출 문항·이어서 떠올리기·설명해 보기 기록 실패');

  // 구성 단계 첫 경험: 연습은 본게임 상태·판 기록과 분리되어야 한다.
  const orgPracticePlays = () => page.evaluate(() => window.Arcade.data().games?.organization?.plays || []);
  const orgPracticeMode = () => page.evaluate(() => window.__org.mode());
  const orgPracticeState = () => page.evaluate(() => window.__org.practice());
  const orgPracticeReady = () => page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') !== 'true');
  const checkOrgPracticeExposure = async label => {
    const exposed = await page.evaluate(() => {
      const R = window.Organization;
      const names = R.TILES.map(t => t.name).sort((a, b) => b.length - a.length);
      let text = [...document.querySelectorAll('#coach, #feedback, #selection, #board, #hand .tile')].map(el => el.innerText).join('\n');
      text += '\n' + [...document.querySelectorAll('#hand [aria-label], #board [aria-label], #hand[aria-label], #board[aria-label]')].map(el => el.getAttribute('aria-label')).join('\n');
      for (const name of names) text = text.split(name).join('');
      return { stages: Object.values(R.STAGES).filter(name => text.includes(name)),
        stageElements: document.querySelectorAll('.stage-name').length,
        numbers: [...document.querySelectorAll('#hand .tile')].some(el => /[0-9]/.test(el.textContent)) };
    });
    check(!exposed.stages.length && exposed.stageElements === 0 && !exposed.numbers,
      `구성 단계 연습 ${label}: 내기 전에 단계 이름·숫자 노출 (${exposed.stages.join(', ')})`);
  };
  const checkOrgPracticeFits = async label => {
    const fits = await page.evaluate(() => {
      const inside = el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1;
      };
      return document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1 &&
        [...document.querySelectorAll('#coach, .board-panel, .hand-panel, .controls .btn:not([hidden])')].every(inside);
    });
    check(fits, `구성 단계 360×640 연습 ${label}: 페이지 넘침 또는 안내·판·손패 패널·버튼이 창 밖에 있음`);
  };
  const checkOrgPracticeNoAction = async label => {
    await orgPracticeReady();
    const before = await orgPracticeState(), plays = await orgPracticePlays();
    await page.evaluate(() => {
      for (const [key, code] of [['ㅣ', 'KeyL'], ['ㅎ', 'KeyG'], ['ㅁ', 'KeyA'], ['ㅇ', 'KeyD'], ['Escape', 'Escape']]) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      }
      window.__org.draw();
    });
    check(JSON.stringify(await orgPracticeState()) === JSON.stringify(before) &&
      await page.evaluate(() => window.__org.state() === null) && (await orgPracticePlays()).length === plays.length && plays.length === 0,
      `구성 단계 연습 ${label}: 단축키·draw 훅이 연습·본게임 상태 또는 판 기록을 바꿈`);
  };
  const doubleTapOrgPractice = async (selector, horizontal = 0.5) => {
    await orgPracticeReady();
    const box = await page.locator(selector).boundingBox();
    check(!!box, `구성 단계 두 번 탭 대상 ${selector}가 안 보임`);
    if (!box) return;
    const x = box.x + box.width * horizontal, y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(120);
    // 전환 뒤 같은 좌표에 나타난 새 버튼을 누르는 실제 터치 경로다.
    await page.touchscreen.tap(x, y);
  };
  const checkOrgFreshMain = async label => {
    const fresh = await page.evaluate(() => window.__org.state());
    check(await orgPracticeMode() === 'main' && fresh?.hand.length === 14 && fresh.turns === 0 &&
      fresh.attemptsRemaining === 3 && fresh.board.length === 0 && fresh.revision === 0 &&
      Object.values(fresh.signals).every(n => n === 0), `구성 단계 ${label}: 새 본게임 손패·턴·시도·판·revision·신호 초기화 실패`);
    check(await page.isHidden('#coach') && await page.isVisible('.goal') &&
      await page.isVisible('#play-line') && await page.isVisible('#play-group') && await page.isVisible('#attach') && await page.isVisible('#draw') &&
      await page.isHidden('#skip-practice') && await page.isHidden('#begin-main'), `구성 단계 ${label}: 본게임 화면 전환 실패`);
  };
  await page.setViewportSize({ width: 360, height: 640 });
  await go('games/organization/index.html');
  check((await orgPracticePlays()).length === 0, '구성 단계 첫 경험 검사 전에 이 기기의 판 기록이 있음');
  const orgRuleItems = page.locator('#overlay .rules > li');
  check(await orgRuleItems.count() === 4 && await orgRuleItems.nth(3).locator('details.more-rules').count() === 1 &&
    await orgRuleItems.nth(3).locator('summary').textContent() === '규칙 더 보기' &&
    await orgRuleItems.nth(3).locator('details').getAttribute('open') === null, '구성 단계 규칙 카드: 핵심 3줄·닫힌 규칙 더 보기 구성 실패');
  check(await page.locator('#overlay .keyboard-hint').count() === 0, '구성 단계 터치 기기 규칙 카드에 키보드 안내가 있음');
  await page.locator('#overlay .card').evaluate(el => { el.scrollTop = 0; });
  const orgIntroFits = await page.evaluate(() => {
    const card = document.querySelector('#overlay .card'), c = card.getBoundingClientRect();
    const b = document.getElementById('ar-start').getBoundingClientRect();
    return card.scrollTop === 0 && b.top >= c.top && b.bottom <= c.bottom && b.left >= c.left && b.right <= c.right &&
      b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth;
  });
  check(orgIntroFits, '구성 단계 360×640 규칙 카드를 스크롤하지 않으면 시작 버튼 전체가 안 보임');
  await page.screenshot({ path: `${out}/organization-intro-360.png` });
  await page.click('#ar-start');
  check(await orgPracticeMode() === 'practice' && await page.isVisible('#coach') && await page.isHidden('.goal') &&
    await page.isVisible('#skip-practice') && await page.isVisible('#play-line') &&
    await page.isHidden('#play-group') && await page.isHidden('#attach') && await page.isHidden('#draw') && await page.isHidden('#begin-main') &&
    await page.locator('#hand .tile').count() === 9 && await page.evaluate(() => window.__org.state() === null), '구성 단계 기록 없는 첫 시작의 연습 화면·상태 분리 실패');
  await checkOrgPracticeFits('질문 1');
  await checkOrgPracticeExposure('질문 1');
  await page.screenshot({ path: `${out}/organization-practice-360.png` });
  await doubleTapOrgPractice('#skip-practice');
  await checkOrgFreshMain('연습 건너뛰기');
  check((await orgPracticePlays()).length === 0, '구성 단계 연습 건너뛰기가 판 기록을 만듦');

  await go('games/organization/index.html'); await page.click('#ar-start');
  check(await orgPracticeMode() === 'practice', '구성 단계 판 기록 없이 재방문했는데 연습을 건너뜀');
  const orgAnswers = (await orgPracticeState()).answers;
  for (let i = 0; i < orgAnswers.length; i++) {
    await orgPracticeReady();
    await checkOrgPracticeFits(`질문 ${i + 1}`);
    await checkOrgPracticeExposure(`질문 ${i + 1}`);
    await checkOrgPracticeNoAction(`질문 ${i + 1}`);
    check(await page.isDisabled('#play-line'), '구성 단계 연습에서 다섯 장을 고르기 전에 줄 내기가 활성');
    const before = await orgPracticeState();
    const wrong = before.hand.filter(id => id !== orgAnswers[i] && !before.chosen.includes(id));
    for (const id of wrong) {
      await page.locator(`#hand [data-tile="${id}"]`).click();
      const message = await page.textContent('#feedback');
      check(await page.locator('#feedback').getAttribute('data-kind') === 'error' && !!message?.trim() &&
        JSON.stringify(await orgPracticeState()) === JSON.stringify(before),
        `구성 단계 연습 질문 ${i + 1} 오답 ${id}: 오류 안내·선택 유지 실패`);
      // 안내 데이터 전체를 복제하지 않고 대표 원문 세 곳만 독립적으로 대조한다.
      if (i === 0) check(message === '고양이 패를 찾아 고르세요. 붉은 패가 동물이다.', '구성 단계 연습 질문 1 오답의 기본 안내 실패');
      if (i === 1 && id === 'stomach:0') check(message === '위는 그 가운데 한 부분이다. 위와 창자 등을 함께 묶은 것을 찾아보세요.', '구성 단계 연습 질문 2 위 near 안내 실패');
      if (i === 3 && id === 'epithelialCell:0') check(message === '상피 세포는 그 층을 이루는 작은 단위다. 상피 세포가 모여 이룬 층을 찾아보세요.', '구성 단계 연습 질문 4 상피 세포 near 안내 실패');
      await checkOrgPracticeExposure(`질문 ${i + 1} 오답 ${id}`);
    }
    if (i === 1) {
      await page.locator(`#hand [data-tile="${before.chosen[0]}"]`).click();
      check(await page.textContent('#feedback') === '이미 고른 패다. 질문에 맞는 다음 패를 고르세요.' &&
        JSON.stringify(await orgPracticeState()) === JSON.stringify(before), '구성 단계 연습 이미 고른 패의 안내·선택 유지 실패');
      await checkOrgPracticeExposure('이미 고른 패');
    }
    const answer = page.locator(`#hand [data-tile="${orgAnswers[i]}"]`);
    await answer.focus(); await page.keyboard.press('Enter');
    check((await orgPracticeState()).step === i + 1 && await answer.getAttribute('aria-pressed') === 'true' &&
      await answer.evaluate(el => el === document.activeElement), `구성 단계 연습 질문 ${i + 1} 정답의 선택·키보드 포커스 유지 실패`);
  }
  await checkOrgPracticeFits('모두 골랐다');
  await checkOrgPracticeExposure('모두 골랐다');
  check(await page.textContent('#coach-question') === '모두 골랐다. ‘줄로 내기’를 누르세요.' &&
    await page.isEnabled('#play-line'), '구성 단계 연습 다섯 장 선택 뒤 내기 안내·활성 실패');
  await doubleTapOrgPractice('#play-line');
  check(await page.locator('#board .set').count() === 1 &&
    JSON.stringify(await page.locator('#board .stage-name').allTextContents()) === JSON.stringify(['세포', '조직', '기관', '기관계', '개체']) &&
    JSON.stringify(await page.locator('#board .board-tile .tile').allTextContents()) === JSON.stringify(['상피 세포', '상피 조직', '위', '소화계', '고양이']) &&
    await page.locator('#hand .tile').count() === 4 && await page.locator('#hand .tile:disabled').count() === 4 &&
    await page.isDisabled('#board .set') && !(await page.textContent('#board')).includes('여기에 붙이기') &&
    await page.isVisible('#begin-main') && await page.isHidden('#skip-practice') && await page.isHidden('#play-line') &&
    await orgPracticeMode() === 'practice' && (await orgPracticeState()).placed &&
    await page.textContent('#selection') === '고른 패 0장' && (await orgPracticePlays()).length === 0 &&
    await page.evaluate(() => window.__org.state() === null), '구성 단계 연습 줄의 정렬·단계 이름·내기 후 화면·기록 분리 실패');
  await checkOrgPracticeNoAction('줄을 낸 뒤');
  await checkOrgPracticeFits('줄을 낸 뒤');
  const orgPracticeLineFits = await page.evaluate(() => {
    const board = document.getElementById('board'), box = board.getBoundingClientRect();
    const inside = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1;
    };
    const set = board.querySelector('.set');
    return !!set && [set, ...set.querySelectorAll('.stage-name, .tile')].every(el => {
      const r = el.getBoundingClientRect();
      return inside(el) && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1;
    }) && inside(document.getElementById('begin-main')) &&
      document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  });
  check(orgPracticeLineFits, '구성 단계 360×640 연습 줄 세트·단계 이름·패·새 손패로 시작이 판·창 밖 또는 페이지 넘침');
  await page.screenshot({ path: `${out}/organization-practice-line-360.png` });
  await doubleTapOrgPractice('#begin-main', 0.75);
  await checkOrgFreshMain('연습 완성 뒤 시작');
  check((await orgPracticePlays()).length === 0, '구성 단계 연습 완성 뒤 시작이 판 기록을 만듦');
  await page.setViewportSize({ width: 390, height: 664 });
  for (let i = 0; i < 20; i++) { await orgPracticeReady(); await page.click('#draw'); }
  await page.waitForSelector('#overlay:not([hidden]) #ar-retry');
  const orgPracticeSaved = await orgPracticePlays();
  check(orgPracticeSaved.length === 1 && orgPracticeSaved[0]?.stars === 0 && orgPracticeSaved[0]?.detail.misconceptionTotal === 0 &&
    await page.evaluate(() => {
      const detail = window.Arcade.data().games.organization.plays[0].detail;
      return [...window.Organization.SIGNALS, 'outOfScope'].every(key => detail[key] === 0);
    }), '구성 단계 연습 오답이 본게임 별·오개념·범위 밖 판 기록에 섞임');
  await page.click('#ar-retry');
  await checkOrgFreshMain('기록 뒤 다시 하기');
  await go('games/organization/index.html'); await page.click('#ar-start');
  await checkOrgFreshMain('기록 있는 기기 재방문');
  await page.setViewportSize({ width: 390, height: 844 });

  // 구성 단계: 상태 주입 없이 시드·실제 뽑기·화면 버튼으로 플레이한다.
  await go('games/organization/index.html');
  await page.screenshot({ path: `${out}/organization-intro.png` });
  const orgIntro = await page.textContent('#overlay .card');
  check(orgIntro.includes('식물의 기관(잎·줄기)은 세 조직계를 모두 가진다. 이 게임의 관계표는 대표 연결만 담았다.') &&
    orgIntro.includes('부분 사슬은 세포부터 개체까지 다 잇지 못한 3~4장 줄이다.') && !orgIntro.includes('두 계'), '구성 단계 인트로 과학 안내·부분 사슬 정의 누락');
  await page.click('#ar-start');
  await page.evaluate(() => window.__org.start(2));
  const orgState = () => page.evaluate(() => window.__org.state());
  const orgReady = () => page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') !== 'true');
  const chooseOrg = async ids => {
    await orgReady();
    // 누를 때마다 눌린 패 목록이 줄므로 .all()의 nth 대신 남은 첫 패를 반복해 누른다
    const pressed = page.locator('#hand .tile[aria-pressed="true"]');
    while (await pressed.count()) await pressed.first().click();
    for (const id of ids) await page.locator(`#hand [data-tile="${id}"]`).click();
  };
  const orgVisible = () => page.evaluate(() => {
    const board = document.getElementById('board'), set = board.lastElementChild;
    if (!set?.matches('.set')) return false;
    const box = board.getBoundingClientRect();
    return [set, ...set.querySelectorAll('.stage-name, .tile')].every(el => {
      const r = el.getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1 &&
        r.top >= 0 && r.bottom <= innerHeight + 1;
    });
  });
  const drawnVisible = () => page.locator('#hand').evaluate(el => {
    const last = el.lastElementChild.getBoundingClientRect(), box = el.getBoundingClientRect();
    return last.top >= box.top - 1 && last.bottom <= box.bottom + 1 && last.bottom <= innerHeight + 1;
  });
  check(await page.title() === '구성 단계 잇기' && await page.locator('.bar b').textContent() === '구성 단계 잇기', '구성 단계 이름 변경 실패');
  check(await page.locator('.keyboard-hint').first().isHidden(), '구성 단계 휴대폰에 Esc 안내가 보임');
  const tileNamesOnly = await page.evaluate(() => [...document.querySelectorAll('#hand .tile')].every(el => {
    const tile = window.Organization.tile(el.dataset.tile);
    return el.textContent === tile.name && !/[0-9]/.test(el.textContent) &&
      el.getAttribute('aria-label') === `${tile.name}, ${tile.kingdom === 'animal' ? '동물' : '식물'}, 고르지 않음`;
  }));
  check(tileNamesOnly && await page.locator('#hand .stage-name').count() === 0, '구성 단계 손패에 단계 숫자·이름이 보이거나 패 이름·계 접근성 표시 누락');
  check(await page.textContent('#goal') === '동물과 식물의 완전한 줄(세포부터 개체까지)을 만드세요', '구성 단계 목표 문구 누락');
  const wrongOrg = await page.evaluate(() => {
    const { hand } = window.__org.state(), R = window.Organization;
    const found = [];
    for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) {
      const ids = [hand[a], hand[b], hand[c]], judgment = R.validateLine(ids);
      if (!judgment.ok && judgment.misconception) found.push({ ids, message: judgment.message, reason: judgment.reason });
      if (found.length === 3) return found;
    }
    return found;
  });
  check(wrongOrg.length === 3, '구성 단계 재현 시드에 틀린 줄 검사 입력이 없음');
  if (wrongOrg.length === 3) {
    const before = await orgState();
    await chooseOrg(wrongOrg[0].ids.slice(0, 1));
    check(await page.isDisabled('#play-line') && await page.isDisabled('#play-group'), '구성 단계 1장 내기 버튼 활성');
    await chooseOrg(wrongOrg[0].ids.slice(0, 2));
    check(await page.isDisabled('#play-line') && await page.isDisabled('#play-group'), '구성 단계 2장 내기 버튼 활성');
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅣ', code: 'KeyL', bubbles: true })));
    check((await orgState()).revision === before.revision, '구성 단계 2장 단축키가 act를 호출함');
    await chooseOrg(wrongOrg[0].ids); await page.dblclick('#play-line');
    const after = await orgState();
    check(after.attemptsRemaining === 2 && after.turns === before.turns && after.revision === before.revision + 1 &&
      after.signals[wrongOrg[0].reason] === 1 && JSON.stringify(after.hand) === JSON.stringify(before.hand),
      '구성 단계 틀린 줄 dblclick의 시도·턴·오개념 중복');
    check(await page.textContent('#feedback') === wrongOrg[0].message && await page.textContent('#attempts') === '2', '구성 단계 틀린 줄의 까닭·남은 시도 표시 실패');
    await page.screenshot({ path: `${out}/organization-wrong.png` });
    await orgReady();
    await page.tap('#play-line'); await page.tap('#play-line');
    check(JSON.stringify(await orgState()) === JSON.stringify(after), '구성 단계 같은 실패 선택 tap 2회가 act를 호출함');
    // 시도 상한 검사는 서로 다른 선택으로 제출한다.
    await chooseOrg(wrongOrg[1].ids); await page.click('#play-line');
    await chooseOrg(wrongOrg[2].ids); await page.click('#play-line');
    const third = await orgState(), fb = await page.textContent('#feedback');
    check(third.turns === before.turns + 1 && third.draws === before.draws + 1 && third.hand.length === before.hand.length + 1 &&
      third.attemptsRemaining === 3 && third.revision === before.revision + 3 && fb.includes('패를 한 장 뽑았다') && fb.includes('다음 턴'),
      '구성 단계 세 번째 실패의 자동 뽑기·턴 전환·안내 실패');
    check(await drawnVisible(), '구성 단계 자동으로 뽑은 패가 안 보임');
  }

  // 실제 두 번 누르기와 길게 누르기: 화면 잠금이 끝나도 repeat 입력은 추가 행동이 아니다.
  await page.evaluate(() => window.__org.start(5));
  await page.dblclick('#draw');
  check((await orgState()).turns === 1 && (await orgState()).draws === 1, '구성 단계 뽑기 dblclick 중복');
  await orgReady();
  await page.tap('#draw'); await page.tap('#draw');
  check((await orgState()).turns === 2 && (await orgState()).draws === 2, '구성 단계 뽑기 tap 2회 중복');
  await orgReady();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅇ', code: 'KeyD', bubbles: true })));
  await orgReady();
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅇ', code: 'KeyD', repeat: true, bubbles: true })); });
  check((await orgState()).turns === 3 && (await orgState()).draws === 3, '구성 단계 한글 자판 D·키 repeat 처리 실패');
  await page.evaluate(() => window.__org.start(5));
  await page.locator('#hand .tile').first().focus();
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  check((await page.textContent('#selection')).startsWith('고른 패 1장'), '구성 단계 Enter를 누른 채로 패 선택이 반복됨');
  await page.keyboard.press('Escape');
  check((await page.textContent('#selection')).startsWith('고른 패 0장'), '구성 단계 Escape 선택 해제 실패');
  const orgKinds = async kinds => {
    const s = await orgState(); const used = new Set();
    return kinds.map(kind => { const id = s.hand.find(h => h.startsWith(kind + ':') && !used.has(h)); used.add(id); return id; });
  };
  await chooseOrg(await orgKinds(['stem', 'digestive', 'human']));
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅣ', code: 'KeyL', bubbles: true })));
  await orgReady();
  const heldLine = await orgState();
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅣ', code: 'KeyL', repeat: true, bubbles: true })); });
  check(heldLine.attemptsRemaining === 2 && heldLine.signals.systemInPlant === 1 && JSON.stringify(await orgState()) === JSON.stringify(heldLine),
    '구성 단계 한글 자판 L·키 repeat 시도·오개념 중복');

  await page.evaluate(() => window.__org.start(7));
  await chooseOrg(await orgKinds(['nerve', 'heart', 'circulatory']));
  await page.click('#play-line'); await orgReady();
  const scopeOrg = await orgState();
  check(scopeOrg.attemptsRemaining === 3 && scopeOrg.turns === 0 && scopeOrg.draws === 0 && scopeOrg.signals.outOfScope === 1 &&
    await page.textContent('#feedback') === '실제로도 이어지지만 이 게임에서는 다루지 않는 연결: 신경 조직 → 심장', '구성 단계 범위 밖의 시도 보존·쌍 안내 실패');
  await page.dblclick('#play-line');
  check(JSON.stringify(await orgState()) === JSON.stringify(scopeOrg), '구성 단계 범위 밖 같은 선택 재제출이 act를 호출함');
  await page.evaluate(() => window.__org.start(7));
  await chooseOrg(await orgKinds(['cardiacCell', 'nerve', 'brain'])); await page.click('#play-line');
  check(await page.textContent('#feedback') === '앞 패가 뒤 패를 이루는 관계가 아니다. 심장 근육 세포 → 신경 조직', '구성 단계 관계 오류에서 틀린 쌍이 안 보임');

  await page.evaluate(() => window.__org.start(5, { turnLimit: 1 }));
  for (const kinds of [['stem', 'digestive', 'human'], ['stem', 'digestive', 'brain'], ['stem', 'digestive', 'stomach']]) {
    await chooseOrg(await orgKinds(kinds)); await page.click('#play-line');
  }
  const lastFailText = await page.textContent('#overlay .card');
  check(lastFailText.split('정해진 턴을 모두 썼다').length - 1 === 1 && !/손패.*남/.test(lastFailText) && lastFailText.includes('완전한 줄: 동물 0개, 식물 0개'),
    '구성 단계 마지막 턴 세 번째 실패의 결과 반복·목표 요약 실패');
  await page.click('#ar-retry');

  // 한글 자판 G·A, 묶음 단계 표시와 붙일 곳 선택 해제.
  await page.evaluate(() => window.__org.start(5));
  await chooseOrg(await orgKinds(['stomach', 'brain', 'leaf']));
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅎ', code: 'KeyG', bubbles: true })));
  await orgReady();
  check((await orgState()).board[0].kind === 'group' && (await page.locator('#board .stage-name').allTextContents()).every(t => t === '기관'), '구성 단계 한글 자판 G·묶음 단계 표시 실패');
  await chooseOrg(await orgKinds(['stem']));
  await page.locator('#board .set-target').click();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅁ', code: 'KeyA', bubbles: true })));
  await orgReady();
  check((await orgState()).board[0].tiles.length === 4 && await page.locator('#board .set-target').getAttribute('aria-pressed') === 'false' && await page.isDisabled('#attach'),
    '구성 단계 한글 자판 A·붙이기 뒤 대상 선택 해제 실패');
  check(await page.locator('#stage .toast.on').count() === 0, '구성 단계 토스트가 피드백과 중복되거나 목표를 덮음');

  // 작은 세로 화면에서 여러 세트·긴 이름·묶음도 새로 낸 세트 전체가 보인다.
  for (const [width, height] of [[390, 664], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__org.start(266));
    const sixCells = await page.evaluate(() => [...new Map(window.__org.state().hand.filter(id => window.Organization.tile(id).stage === 'cell')
      .map(id => [window.Organization.tile(id).id, id])).values()]);
    check(sixCells.length === 6, '구성 단계 6장 묶음 재현 시드 불일치');
    await chooseOrg(sixCells); await page.click('#play-group');
    check(await orgVisible(), `구성 단계 ${width}×${height} 6장 묶음·긴 세포 이름·단계가 판·화면 밖`);
    await page.screenshot({ path: `${out}/organization-group6-${width}-${height}.png` });
    await page.evaluate(() => window.__org.start(66));
    await chooseOrg(await orgKinds(['xylemCell', 'xylem', 'vascular', 'leaf', 'bean'])); await page.click('#play-line');
    check(await orgVisible() && JSON.stringify(await page.locator('#board .stage-name').allTextContents()) === JSON.stringify(['세포', '조직', '조직계', '기관', '개체']),
      `구성 단계 ${width}×${height} 새 완전한 줄·긴 이름·단계가 판·화면 밖`);
    await page.screenshot({ path: `${out}/organization-line5-${width}-${height}.png` });
    await page.evaluate(() => window.__org.start(11, { turnLimit: 21 }));
    for (let step = 0; step < 20; step++) {
      await orgReady();
      const plan = await page.evaluate(() => {
        const R = window.Organization, { hand } = window.__org.state();
        for (const stage of Object.keys(R.STAGES)) {
          const unique = [...new Map(hand.filter(id => R.tile(id).stage === stage).map(id => [R.tile(id).id, id])).values()];
          if (unique.length >= 3) return { kind: 'group', ids: unique };
        }
        for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) {
          const ids = [hand[a], hand[b], hand[c]];
          if (R.validateLine(ids).ok) return { kind: 'line', ids };
        }
        return null;
      });
      if (plan) {
        await chooseOrg(plan.ids); await page.click(plan.kind === 'line' ? '#play-line' : '#play-group');
        check(await orgVisible(), `구성 단계 ${width}×${height} 새 ${plan.kind} 세트·단계 이름이 판·화면 밖: 턴 ${step + 1}`);
        check(await page.locator('#board .set').last().locator('.stage-name').count() === plan.ids.length, '구성 단계 낸 묶음·줄의 단계 이름 누락');
      } else {
        await page.click('#draw');
        check(await drawnVisible(), `구성 단계 ${width}×${height} 뽑은 패가 화면 밖`);
      }
    }
    check((await orgState()).board.length > 1, '구성 단계 새 세트 자동 스크롤 검사에 세트가 부족함');
    await page.screenshot({ path: `${out}/organization-board-${width}-${height}.png` });
  }

  // 기본 20턴의 마지막 손패는 34장이다. 화면 검사 동안 결과 카드에 가리지 않도록 상한만 21로 둔다.
  await page.evaluate(() => window.__org.start(2, { turnLimit: 21 }));
  for (let i = 0; i < 20; i++) { await page.click('#draw'); await orgReady(); }
  check((await orgState()).hand.length === 34, '구성 단계 34장 손패 재현 실패');
  for (const [width, height] of [[390, 664], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const fit = await page.evaluate(() => {
      const hand = document.getElementById('hand'), board = document.getElementById('board'), goal = document.getElementById('goal');
      // 연습 전용 버튼(연습 건너뛰기·새 손패로 시작)은 본게임에서 숨는다. 보이는 버튼만 잰다.
      const buttons = [...document.querySelectorAll('.controls .btn:not([hidden])')];
      if (buttons.length !== 4) return { fits: false, buttons: buttons.length };
      const cards = [...hand.querySelectorAll('.tile')], rects = cards.map(el => el.getBoundingClientRect());
      const overlaps = rects.some((r, i) => rects.slice(i + 1).some(q => r.left < q.right - 1 && r.right > q.left + 1 && r.top < q.bottom - 1 && r.bottom > q.top + 1));
      const visible = el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; };
      return { fits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1 &&
        [hand, board, goal, ...buttons].every(visible), overlaps,
        scrolls: hand.scrollHeight > hand.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(hand).overflowY),
        readable: cards.every(el => el.clientWidth >= el.scrollWidth && parseFloat(getComputedStyle(el).fontSize) >= 12 && el.getBoundingClientRect().height >= 44) &&
          buttons.every(el => el.getBoundingClientRect().height >= 44 && el.getBoundingClientRect().width >= 44) };
    });
    check(fit.fits && !fit.overlaps && fit.scrolls && fit.readable, `구성 단계 34장 ${width}×${height} 화면 넘침·겹침·스크롤·크기 실패: ${JSON.stringify(fit)}`);
    await page.locator('#hand').evaluate(el => { el.scrollTop = el.scrollHeight; });
    // WebKit은 뷰포트를 바꾼 직후 스크롤·배치가 한두 프레임 늦게 자리 잡는다. 한 번만 재면 간헐 실패가 나므로 2초 안에 조건이 서는지 기다린다
    const lastRowVisible = await page.waitForFunction(() => {
      const el = document.getElementById('hand');
      if (el.scrollTop < el.scrollHeight - el.clientHeight - 1) el.scrollTop = el.scrollHeight;
      const last = el.lastElementChild.getBoundingClientRect(), box = el.getBoundingClientRect();
      return el.scrollTop > 0 && last.top >= box.top && last.bottom <= box.bottom + 1 && last.bottom <= innerHeight + 1;
    }, null, { timeout: 2000 }).then(() => true, () => false);
    check(lastRowVisible, '구성 단계 손패 마지막 줄 스크롤 실패');
    await page.screenshot({ path: `${out}/organization-hand34-${width}-${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 664 });
  await page.evaluate(() => window.__org.start(2));
  let attachedOrg = false;
  for (let step = 0; step < 20 && (await orgState()).phase === 'playing'; step++) {
    const line = await page.evaluate(() => {
      const full = window.Organization.completed(window.__org.state());
      return window.__org.completeLines().find(l => !full[l.kingdom]) || null;
    });
    if (!line) { await orgReady(); await page.click('#draw'); continue; }
    if (!attachedOrg) {
      await chooseOrg(line.tiles.slice(0, 3).reverse()); await page.click('#play-line');
      const set = (await orgState()).board.at(-1);
      check(set.tiles.length === 3, '구성 단계 부분 사슬 놓기 실패');
      await chooseOrg(line.tiles.slice(3).reverse());
      await page.locator(`#board [data-set="${set.id}"]`).click(); await page.click('#attach');
      check(await page.locator(`#board [data-set="${set.id}"]`).getAttribute('aria-pressed') === 'false', '구성 단계 줄 붙이기 뒤 대상 선택 유지');
      attachedOrg = true;
    } else {
      await chooseOrg(line.tiles.slice().reverse()); await page.click('#play-line');
    }
    const sortedOrg = await page.evaluate(() => window.__org.state().board.every(set => set.tiles.every((id, i) =>
      i === 0 || window.Organization.tile(id).number > window.Organization.tile(set.tiles[i - 1]).number)));
    check(sortedOrg, '구성 단계 제출·붙이기 뒤 줄 자동 정렬 실패');
    const stageLabels = await page.locator('#board .stage-name').allTextContents();
    const expectedStages = await page.evaluate(() => window.__org.state().board.flatMap(s =>
      window.Organization.tile(s.tiles[0]).kingdom === 'animal' ? ['세포', '조직', '기관', '기관계', '개체'] : ['세포', '조직', '조직계', '기관', '개체']));
    check(JSON.stringify(stageLabels) === JSON.stringify(expectedStages), '구성 단계 낸 줄의 단계 이름·순서 표시 실패');
  }
  const orgFinal = await orgState();
  check(orgFinal.phase === 'won' && attachedOrg && orgFinal.turnLimit === 20, '구성 단계 기본 20턴에서 붙이기·동물과 식물 완성 실패');
  check(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).games.organization.plays.at(-1).stars === 3, STORE), '구성 단계 결과 별 3 기록 실패');
  await page.locator('#ar-refl').focus(); await page.keyboard.type('단계'); await page.keyboard.press('Space'); await page.keyboard.type('비교');
  check(await page.inputValue('#ar-refl') === '단계 비교', '구성 단계 결과 입력칸 키보드 띄어쓰기 실패');
  await finishCheck('organization');
  await page.setViewportSize({ width: 390, height: 844 });

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

  // 별도 가상 기기에서 재시도·다른 탭·삭제 경로를 확인한다(기존 플레이 기록은 보존).
  const saveCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const resultPage = await saveCtx.newPage(), hubPage = await saveCtx.newPage();
  if (reducedMotion) await Promise.all([mediaReady.get(resultPage), mediaReady.get(hubPage)]);
  watchErrors(resultPage); watchErrors(hubPage);
  await resultPage.goto('file://' + path.join(root, 'games/mendel/index.html'));
  await resultPage.click('#ar-start'); await resultPage.click('#t-end');
  const resultPlays = () => resultPage.evaluate(k => JSON.parse(localStorage.getItem(k))?.games.mendel?.plays || [], STORE);
  await resultPage.evaluate(() => { window.__oldReflection = document.getElementById('ar-refl'); });
  await hubPage.goto('file://' + path.join(root, 'index.html'));
  // 다른 탭의 뒤 판이 추가되어도 열린 결과는 원래 판만 고쳐야 한다.
  await hubPage.evaluate(() => window.Arcade.record('mendel', { stars: 0, score: 0, detail: {} }));
  await resultPage.fill('#ar-refl', '첫 판 답');
  await resultPage.waitForTimeout(500);
  let savedPlays = await resultPlays();
  check(savedPlays.length === 2 && savedPlays[0].reflection === '첫 판 답' && !savedPlays[1].reflection, '다른 탭의 다음 판에 서술 답이 섞임');
  await resultPage.fill('#ar-refl', '   '); await resultPage.waitForTimeout(500);
  check((await resultPlays())[0]?.reflection === '', '미니게임 공백 답이 이전 답을 지우지 않음');
  await resultPage.fill('#ar-refl', '숨김 직전 답');
  await resultPage.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  check((await resultPlays())[0]?.reflection === '숨김 직전 답', '미니게임 hidden 이벤트 즉시 저장 실패');
  await resultPage.fill('#ar-refl', 'pagehide 직전 답');
  await resultPage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  check((await resultPlays())[0]?.reflection === 'pagehide 직전 답', '미니게임 pagehide 즉시 저장 실패');
  // 링크 이동만 막아 클릭 뒤에도 같은 카드의 입력·재시도 저장이 살아 있는지 확인한다.
  await resultPage.evaluate(() => document.getElementById('ar-hub').addEventListener('click', e => e.preventDefault(), { once: true }));
  await resultPage.fill('#ar-refl', '오락실 클릭 직전 답'); await resultPage.click('#ar-hub');
  check((await resultPlays())[0]?.reflection === '오락실 클릭 직전 답', '오락실로 클릭 즉시 저장 실패');
  await resultPage.fill('#ar-refl', '오락실 클릭 뒤 답'); await resultPage.waitForTimeout(500);
  check((await resultPlays())[0]?.reflection === '오락실 클릭 뒤 답', '오락실로 클릭 뒤 입력 저장 실패');
  await resultPage.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await resultPage.fill('#ar-refl', '복원 뒤 답'); await resultPage.waitForTimeout(500);
  check((await resultPlays())[0]?.reflection === '복원 뒤 답', 'pageshow persisted 뒤 입력 저장 실패');
  await resultPage.fill('#ar-refl', '재시도 전 답'); await resultPage.click('#ar-retry');
  await resultPage.click('#t-end');
  await resultPage.evaluate(() => {
    window.__oldReflection.value = '닫힌 카드 오염';
    window.__oldReflection.dispatchEvent(new Event('input'));
  });
  await resultPage.fill('#ar-refl', '다음 판 답'); await resultPage.waitForTimeout(500);
  savedPlays = await resultPlays();
  check(savedPlays.length === 3 && savedPlays[0].reflection === '재시도 전 답' && !savedPlays[1].reflection && savedPlays[2].reflection === '다음 판 답', '다시 하기 뒤 이전 타이머·리스너가 판 기록을 오염시킴');
  // 같은 답으로 여러 이벤트를 보내도 기록은 추가되지 않는다.
  await resultPage.evaluate(() => { document.getElementById('ar-refl').dispatchEvent(new Event('compositionend')); window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide')); });
  check((await resultPlays()).length === 3, '같은 답 반복 저장으로 판이 늘어남');
  hubPage.on('dialog', d => d.accept());
  await hubPage.click('#clear');
  await resultPage.fill('#ar-refl', '삭제 뒤 입력'); await resultPage.waitForTimeout(500);
  check(await hubPage.evaluate(k => localStorage.getItem(k) === null, STORE), '허브 삭제 뒤 입력 저장이 기록을 되살림');
  await resultPage.fill('#ar-refl', '삭제 뒤 이탈');
  await resultPage.goto('file://' + path.join(root, 'index.html'));
  check(await hubPage.evaluate(k => localStorage.getItem(k) === null, STORE), '허브 삭제 뒤 이탈 저장이 기록을 되살림');
  await saveCtx.close();
  finishErrors();
  console.log('errors:', errors.length ? errors : 'none');
  console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
  console.log('failures:', failures.length ? failures : 'none');
  if (errors.length || failures.length) process.exitCode = 1;
  await browser.close();
})();
