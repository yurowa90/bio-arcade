// 공통·허브 플레이 테스트 회귀 검사. 실제 학생 자료나 외부 전송은 쓰지 않는다.
// hub-1·mendel-6·basepang-4·run-6·glucose-5: 시작 카드 안 복귀 링크로 허브 이동, 기록 불변.
// circulation-6(검증 B CI-5): preventScroll 포커스로 390×664에서도 오마주·제목이 보임.
// 공통 터치 높이(검증 B CI-6): 시작 뒤 헤더 링크 44px 이상, 가로 넘침·링크 가림 없음.
// hub-2·hub-4(D-054 Q7): 버튼 아래 상태 영역, 복사 성공·실패, 복사·저장 뒤 제출 안내.
// hub-3: 탐사대는 배지 N/M, 미니게임은 최고 별, 기록 없음과 별 0 구분(계산 규칙 유지).
// mendel-8: 공통 결과 버튼 줄을 sticky로 고정. 처음·중간·끝에서 탭 가능하고 서술 칸도 접근 가능.
const playwright = require(process.env.PW || 'playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
const out = process.argv[2] && path.resolve(process.argv[2]);
if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
if (!out || !path.relative(root, out).startsWith('..' + path.sep)) {
  throw new Error('인자로 저장소 밖 스크린샷 폴더를 지정하세요.');
}
const STORE = 'bioArcade.v1', QUEST_STORE = 'bioQuest.v1';
const games = ['mendel', 'pedigree', 'basepang', 'run', 'glucose', 'circulation'];
const submitHint = '복사·저장은 제출 완료가 아닙니다. 선생님이 안내한 곳에 붙여넣거나 파일을 첨부하세요.';
const errors = [], failures = [], consoleErrors = [];
let ignoredManifestErrors = 0, assertions = 0;
const check = (ok, msg) => {
  assertions++;
  if (!ok) { failures.push(msg); console.log('실패:', msg); }
};
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
  p.on('pageerror', e => errors.push(`${p.url()}: ${e.message}`));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text(), url = m.location().url || '';
    if (isFileManifest(url) && manifestMessages.has(text)) evidence.manifestFailed = true;
    consoleErrors.push({ text, url, evidence });
  });
};
const finishErrors = () => {
  for (const { text, url, evidence } of consoleErrors) {
    // arcade-e2e와 같이 WebKit의 file:// manifest 오류만 요청 근거와 함께 거른다.
    const confirmed = isFileManifest(url) || ((!url || url === evidence.url) && evidence.manifestFailed && !evidence.otherFailed);
    if (browserName === 'webkit' && manifestMessages.has(text) && confirmed) ignoredManifestErrors++;
    else errors.push(text);
  }
};
const go = (page, file) => page.goto(pathToFileURL(path.join(root, file)).href);
const stored = page => page.evaluate(keys => keys.map(k => localStorage.getItem(k)), [STORE, QUEST_STORE]);

// 요소의 전체 높이가 카드·화면 안에 있고 가운데를 실제로 탭할 수 있는지 확인한다.
const resultGeometry = page => page.evaluate(() => {
  const card = document.querySelector('#overlay .card'), c = card.getBoundingClientRect();
  const reachable = id => {
    const el = document.getElementById(id), r = el.getBoundingClientRect();
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return r.top >= Math.max(0, c.top) && r.bottom <= Math.min(innerHeight, c.bottom) &&
      r.left >= 0 && r.right <= innerWidth && el.contains(hit);
  };
  return { bounded: c.top >= 0 && c.bottom <= innerHeight, retry: reachable('ar-retry'), hub: reachable('ar-hub'),
    overflow: document.documentElement.scrollWidth > innerWidth + 1 };
});

(async () => {
  console.log(`엔진: ${browserName} · 동작 줄이기: ${reducedMotion ? '켬' : '끔'}`);
  fs.mkdirSync(out, { recursive: true });
  let browser;
  try {
    browser = await playwright[browserName].launch();
    for (const height of [664, 844]) {
      const context = await browser.newContext({ viewport: { width: 390, height }, hasTouch: true, isMobile: true,
        deviceScaleFactor: 2, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      watchErrors(page);
      page.on('dialog', d => { failures.push(`예상하지 않은 확인 창: ${d.message()}`); d.dismiss().catch(() => {}); });
      await go(page, 'index.html');
      await page.evaluate(() => { window.Arcade.clearRecords(); window.Arcade.setStudent({ id: '20315', name: '테스트' }); });

      for (const id of games) {
        await go(page, `games/${id}/index.html`);
        await page.waitForSelector('#ar-start');
        const before = await stored(page);
        const intro = await page.evaluate(() => {
          const overlay = document.getElementById('overlay'), card = overlay.querySelector('.card');
          const c = card.getBoundingClientRect(), homage = card.querySelector('.homage').getBoundingClientRect();
          const title = card.querySelector('h2').getBoundingClientRect(), hub = document.getElementById('ar-intro-hub');
          return { top: homage.top >= Math.max(0, c.top) && title.bottom <= Math.min(innerHeight, c.bottom),
            scroll: card.scrollTop, overlayScroll: overlay.scrollTop, focus: document.activeElement.id,
            hub: !!hub && !hub.closest('[inert]') && hub.textContent === '← 오락실',
            target: hub?.getAttribute('href'), background: document.querySelector('.bar').hasAttribute('inert'),
            motion: matchMedia('(prefers-reduced-motion: reduce)').matches };
        });
        check(intro.top && intro.scroll === 0 && intro.overlayScroll === 0, `${id} ${height}: 시작 카드 오마주·제목과 맨 위 유지`);
        check(intro.focus === 'ar-start', `${id} ${height}: 시작 버튼 포커스`);
        check(intro.hub && intro.target === '../../index.html', `${id} ${height}: 시작 카드 복귀 링크`);
        check(intro.background, `${id} ${height}: 카드 뒤 inert 유지`);
        check(intro.motion === reducedMotion, `${id} ${height}: 동작 줄이기 설정`);
        await page.screenshot({ path: path.join(out, `${id}-${height}-intro.png`) });
        if (intro.hub) {
          await page.locator('#ar-intro-hub').tap();
          await page.waitForURL(pathToFileURL(path.join(root, 'index.html')).href);
          check(JSON.stringify(await stored(page)) === JSON.stringify(before), `${id} ${height}: 시작 전 복귀로 기록 변동 없음`);
        }

        await go(page, `games/${id}/index.html`);
        await page.locator('#ar-start').tap();
        const header = await page.evaluate(() => {
          const link = document.querySelector('.bar a'), r = link.getBoundingClientRect();
          const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
          return { height: r.height, visible: r.top >= 0 && r.bottom <= innerHeight && link.contains(hit),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            stageBottom: document.getElementById('stage').getBoundingClientRect().bottom };
        });
        check(header.height >= 44 && header.visible, `${id} ${height}: 헤더 복귀 링크 44px 이상·탭 가능`);
        check(!header.overflow, `${id} ${height}: 헤더 확장 뒤 가로 넘침 없음`);
        if (id === 'circulation') check(header.stageBottom <= height + 1, `circulation ${height}: 남은 높이에 판 배치`);
      }

      await go(page, 'index.html');
      check((await page.textContent('#submit-hint')) === submitHint, `허브 ${height}: 제출 안내 원문`);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__uxCopied = text; } } }));
      await page.locator('#copy').tap();
      await page.waitForFunction(() => document.getElementById('msg').textContent === '복사했습니다.');
      check(await page.evaluate(() => window.__uxCopied === document.getElementById('summary').value), `허브 ${height}: 요약 복사 성공`);
      check((await page.textContent('#submit-hint')) === submitHint, `허브 ${height}: 복사 뒤 제출 안내 유지`);
      await page.screenshot({ path: path.join(out, `hub-${height}-copy-success.png`) });
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async () => { throw new Error('가상 복사 실패'); } } }));
      await page.locator('#copy').tap();
      await page.waitForFunction(() => document.getElementById('msg').textContent.startsWith('복사하지 못했습니다.'));
      const feedback = await page.evaluate(() => {
        const msg = document.getElementById('msg'), r = msg.getBoundingClientRect(), panel = msg.parentElement.getBoundingClientRect();
        const buttons = ['copy', 'dl', 'clear'].map(id => document.getElementById(id).getBoundingClientRect());
        return msg.getAttribute('role') === 'status' && msg.getAttribute('aria-live') === 'polite' &&
          getComputedStyle(msg).display === 'block' && r.top >= Math.max(...buttons.map(b => b.bottom)) &&
          r.left >= panel.left && r.right <= panel.right && msg.scrollWidth <= msg.clientWidth + 1;
      });
      check(feedback, `허브 ${height}: 성공·실패 상태를 버튼 아래 블록으로 표시`);
      check((await page.textContent('#msg')).includes('글상자를 길게 눌러 복사하세요.'), `허브 ${height}: 실패 뒤 수동 복사 안내`);
      await page.screenshot({ path: path.join(out, `hub-${height}-copy-failure.png`) });
      const downloadReady = page.waitForEvent('download');
      await page.locator('#dl').tap();
      const download = await downloadReady;
      check(download.suggestedFilename().normalize('NFC') === '생명오락실_20315.json', `허브 ${height}: JSON 저장 파일명`);
      check((await page.textContent('#submit-hint')) === submitHint, `허브 ${height}: 저장 뒤 제출 안내 유지`);

      // 광합성 별 3·소화 배지 없음의 평균 내림(1)은 바꾸지 않고 화면만 배지 1/2로 바꾼다.
      await page.evaluate(({ store, questStore }) => {
        localStorage.setItem(store, JSON.stringify({ student: { id: '20315', name: '테스트' }, games: {} }));
        window.Arcade.record('mendel', { stars: 0, score: 0, detail: {} });
        localStorage.setItem(questStore, JSON.stringify({ badges: { photo: 3 } }));
      }, { store: STORE, questStore: QUEST_STORE });
      await page.reload();
      const status = file => page.locator(`.cab[href="games/${file}/index.html"] .record-status`);
      check((await status('quest').textContent()) === '배지 1/2' && await status('quest').locator('.stars').count() === 0,
        `허브 ${height}: 탐사대 체육관 배지 수 표시`);
      check(await page.evaluate(() => window.Arcade.best('quest')) === 1, `허브 ${height}: 탐사대 기존 평균 계산 유지`);
      check((await status('basepang').textContent()) === '아직 안 함', `허브 ${height}: 기록 없는 게임 표시`);
      check((await status('mendel').textContent()).startsWith('최고 ') &&
        await status('mendel').locator('.stars').getAttribute('aria-label') === '별 0개', `허브 ${height}: 플레이한 별 0 구분`);
      await page.screenshot({ path: path.join(out, `hub-${height}-record-status.png`), fullPage: true });

      // 실제 멘델 종료 카드와 긴 공통 카드 모두 확인한다. CSS 선언만 검사하지 않는다.
      await go(page, 'games/mendel/index.html');
      await page.locator('#ar-start').tap();
      await page.locator('#t-end').tap();
      await page.waitForSelector('#ar-retry');
      const actual = await resultGeometry(page);
      check(actual.bounded && actual.retry && actual.hub && !actual.overflow, `mendel ${height}: 실제 결과 버튼이 온전히 보임`);
      await page.screenshot({ path: path.join(out, `mendel-${height}-result.png`) });
      await page.evaluate(() => window.Arcade.finish(document.getElementById('overlay'), {
        id: 'mendel', stars: 0, score: 0, detail: {},
        lines: Array.from({ length: 16 }, (_, i) => `테스트 결과 ${i + 1}: 긴 결과 카드의 스크롤을 확인합니다.`),
        quiz: { q: '검증용 질문', options: ['첫째', '둘째'], answer: 0, explain: '검증용 해설' },
        reflection: '테스트 결과를 설명하세요.', onRetry: () => { window.__uxRetried = true; },
      }));
      check(await page.evaluate(() => { const c = document.querySelector('#overlay .card'); return c.scrollHeight > c.clientHeight; }),
        `공통 결과 ${height}: 스크롤이 필요한 긴 카드 조건`);
      for (const fraction of [0, 0.5, 1]) {
        await page.evaluate(f => { const c = document.querySelector('#overlay .card'); c.scrollTop = (c.scrollHeight - c.clientHeight) * f; }, fraction);
        const geo = await resultGeometry(page);
        check(geo.bounded && geo.retry && geo.hub && !geo.overflow, `공통 결과 ${height}: 스크롤 ${fraction}에서 두 버튼 탭 가능`);
      }
      await page.locator('#ar-refl').fill('테스트');
      await page.evaluate(() => document.getElementById('ar-refl').scrollIntoView({ block: 'center' }));
      check(await page.evaluate(() => {
        const card = document.querySelector('#overlay .card').getBoundingClientRect();
        const input = document.getElementById('ar-refl').getBoundingClientRect();
        const buttons = document.querySelector('.card-actions').getBoundingClientRect();
        return input.top >= card.top && input.bottom <= buttons.top;
      }), `공통 결과 ${height}: 고정 버튼이 서술 칸을 가리지 않음`);
      await page.screenshot({ path: path.join(out, `common-${height}-reflection.png`) });
      await page.locator('#ar-retry').tap();
      check(await page.evaluate(() => window.__uxRetried === true && document.getElementById('overlay').hidden &&
        window.Arcade.data().games.mendel.plays.at(-1).reflection === '테스트'), `공통 결과 ${height}: 다시 하기·서술 저장 유지`);
      await context.close();
    }
  } catch (e) {
    errors.push(e.stack || String(e));
  } finally {
    finishErrors();
    console.log('단언:', assertions);
    console.log('errors:', errors.length ? errors : 'none');
    console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
    console.log('failures:', failures.length ? failures : 'none');
    if (errors.length || failures.length) process.exitCode = 1;
    if (browser) await browser.close();
  }
})();
