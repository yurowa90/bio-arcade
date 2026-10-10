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
const submitHint = '복사·저장은 제출 완료가 아니다. 선생님이 안내한 곳에 붙여넣거나 파일을 첨부하세요.';
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
const watchErrors = (p, expectedPageError = () => false) => {
  let evidence = { url: p.url(), manifestFailed: false, otherFailed: false };
  p.on('framenavigated', f => { if (f === p.mainFrame()) evidence = { url: f.url(), manifestFailed: false, otherFailed: false }; });
  p.on('requestfailed', r => { if (isFileManifest(r.url())) evidence.manifestFailed = true; else evidence.otherFailed = true; });
  p.on('pageerror', e => { if (!expectedPageError(e)) errors.push(`${p.url()}: ${e.message}`); });
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

// 공통 기록 데이터 층: 기존 높이 검사 밖에서 가상 기기 하나로 한 번 확인한다.
async function recordDataTests(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), hub = await context.newPage();
  let expectedListenerErrors = 0, listenerErrorPending = false;
  watchErrors(page, e => {
    if (listenerErrorPending && e.message === 'T12 리스너 검증') {
      listenerErrorPending = false; expectedListenerErrors++; return true;
    }
    return false;
  });
  watchErrors(hub);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const playWarning = '기록을 저장하지 못했다. 이 화면을 닫으면 이번 판 결과가 남지 않으니 선생님께 보여 주세요.';
  const answerWarning = '답을 저장하지 못했다. 화면을 닫기 전에 답을 따로 적어 두세요.';
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const finish = options => page.evaluate(options => {
    window.__t12Patch = window.Arcade.finish(document.getElementById('overlay'), {
      id: 'mendel', stars: 2, score: 20, detail: {}, lines: ['검증용 결과'],
      reflection: '테스트 결과를 설명하세요.', onRetry: () => {}, ...options,
    });
    const p = window.__t12Patch;
    return { save: p.save, playId: p.playId, best: p.best, firstClear: p.firstClear };
  }, options || {});
  const failStorage = name => page.evaluate(name => {
    window.__t12SetItem ||= Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('가상 저장 실패', name); };
  }, name);
  const restoreStorage = () => page.evaluate(() => {
    if (window.__t12SetItem) Storage.prototype.setItem = window.__t12SetItem;
  });
  const status = id => hub.locator(`.cab[href="games/${id}/index.html"] .record-status`).textContent();
  const statusStars = id => hub.locator(`.cab[href="games/${id}/index.html"] .record-status .stars`).getAttribute('aria-label');
  const warningHidden = () => page.locator('.save-warn').evaluate(el => el.hidden === true);
  const summaryLine = id => hub.evaluate(id => {
    const g = window.Arcade.game(id);
    return document.getElementById('summary').value.split('\n').find(l => l.startsWith(g.title + ' ['));
  }, id);
  const seed = data => page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORE, data });
  const oldAt = '2026-01-01T00:00:00.000Z';
  try {
    console.log('공통 기록 데이터 층');
    await go(page, 'games/mendel/index.html');
    const contracts = await page.evaluate(() => {
      const A = window.Arcade, key = 'bioArcade.v1';
      const defaults = [[], null, 7].map(value => {
        localStorage.setItem(key, JSON.stringify(value)); return A.data();
      });
      const normalized = [[], null, 7].map(value => {
        localStorage.setItem(key, JSON.stringify({ student: value, games: value, extra: '보존' }));
        const before = A.data();
        const game = A.record('mendel', { stars: 2, score: 20, playId: '게임이 넣은 식별자' });
        return { before, extra: A.data().extra, playId: game.plays[0].playId };
      });
      A.clearRecords();
      const gone = A.patchLast('mendel', {}), student = A.setStudent({ id: '20315', name: '테스트' });
      A.record('mendel', { stars: 2, score: 20 });
      const patched = A.patchLast('mendel', { reflection: '성공한 답' });
      const beforeFailure = localStorage.getItem(key), setItem = Storage.prototype.setItem;
      let failedStudent, failedPatch;
      try {
        Storage.prototype.setItem = function () { throw new DOMException('가상 저장 실패', 'SecurityError'); };
        failedStudent = A.setStudent({ id: '20315', name: '테스트' });
        failedPatch = A.patchLast('mendel', { reflection: '실패한 답' });
      } finally { Storage.prototype.setItem = setItem; }
      return { defaults, normalized, gone, student, patched, failedStudent, failedPatch,
        unchanged: localStorage.getItem(key) === beforeFailure };
    });
    check(contracts.defaults.every(d => equal(d, { student: {}, games: {} })), 'T12: load 최상위 배열·null·숫자는 기본값(M17)');
    check(contracts.normalized.every(d => equal(d.before, { student: {}, games: {}, extra: '보존' }) && d.extra === '보존'),
      'T12: 비객체 student·games 정규화·새 판 뒤에도 다른 최상위 키 보존(M39)');
    check(contracts.normalized.every(d => /^[a-z0-9]{12}$/.test(d.playId) && d.playId !== '게임이 넣은 식별자'), 'T12: record 입력 playId를 새 값으로 대체');
    check(equal(contracts.student, { ok: true }) && equal(contracts.patched, { ok: true }) && equal(contracts.gone, { ok: false, errorCode: 'gone' }),
      'T12: setStudent·patchLast 성공·판 없음 반환(M20·M21)');
    check(equal(contracts.failedStudent, { ok: false, errorCode: 'unavailable' }) &&
      equal(contracts.failedPatch, { ok: false, errorCode: 'unavailable' }) && contracts.unchanged, 'T12: setStudent·patchLast 실패 반환·저장값 보존(M20·M21)');

    const randomContracts = await page.evaluate(() => {
      const A = window.Arcade, crypto = window.crypto, random = Math.random;
      const descriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
      const getRandomValues = crypto.getRandomValues;
      let randomCalls = 0, cryptoCalls = 0, result;
      try {
        Math.random = function () { randomCalls++; return random.call(Math); };
        // Crypto.prototype의 메서드를 인스턴스의 자체 속성으로 가려 브라우저의 원형은 보존한다.
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true,
          value(bytes) { cryptoCalls++; return getRandomValues.call(crypto, bytes); } });
        A.record('mendel', { stars: 0, score: 0, detail: {} });
        const withCrypto = { cryptoCalls, randomCalls, playId: A.plays('mendel').at(-1).playId };
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: undefined });
        randomCalls = 0;
        // crypto가 있을 때는 새 값으로 덮여 M10을 가린다. 없을 때만 입력 playId 거르기를 검출한다.
        A.record('mendel', { stars: 0, score: 0, detail: {}, playId: '게임식별자' });
        const record = A.plays('mendel').at(-1), recordRandomCalls = randomCalls;
        // 인출 문항을 넘기지 않아 보기 섞기의 Math.random 호출과 식별자 생성을 구분한다.
        const patch = A.finish(document.getElementById('overlay'), { id: 'mendel', stars: 0, score: 0,
          detail: {}, lines: [], onRetry: () => {} });
        const finish = A.plays('mendel').at(-1), patched = patch({ reflection: '식별자 없는 판 답' });
        const saved = A.plays('mendel').at(-1);
        result = { withCrypto, disabled: typeof crypto.getRandomValues === 'undefined',
          recordHasId: Object.hasOwn(record, 'playId'), recordRandomCalls,
          finishHasId: Object.hasOwn(finish, 'playId'), patchId: patch.playId, save: patch.save, patched,
          sameAt: saved.at === finish.at, reflection: saved.reflection, randomCalls };
      } finally {
        Math.random = random;
        if (descriptor) Object.defineProperty(crypto, 'getRandomValues', descriptor);
        else delete crypto.getRandomValues;
      }
      return { ...result, restored: crypto.getRandomValues === getRandomValues && Math.random === random };
    });
    check(randomContracts.withCrypto.cryptoCalls > 0 && randomContracts.withCrypto.randomCalls === 0 &&
      /^[a-z0-9]{12}$/.test(randomContracts.withCrypto.playId), 'T12: record 식별자는 crypto로만 생성·Math.random 호출 없음');
    check(randomContracts.disabled && !randomContracts.recordHasId, 'T12: crypto 없으면 record 입력 playId도 저장하지 않음(M10)');
    check(randomContracts.recordRandomCalls === 0 && randomContracts.randomCalls === 0,
      'T12: crypto 없는 record·인출 문항 없는 finish는 Math.random으로 대신하지 않음');
    check(!randomContracts.finishHasId && randomContracts.patchId === undefined && equal(randomContracts.save, { ok: true }) &&
      equal(randomContracts.patched, { ok: true }) && randomContracts.sameAt && randomContracts.reflection === '식별자 없는 판 답',
      'T12: crypto 없는 finish는 playId 없이 index·at으로 같은 판의 답 저장');
    check(randomContracts.restored, 'T12: 식별자 검증 뒤 crypto.getRandomValues·Math.random 복원');

    await page.evaluate(() => { window.Arcade.clearRecords(); window.Arcade.setStudent({ id: '20315', name: '테스트' }); });
    const countBefore = await page.evaluate(() => window.Arcade.data().games.mendel?.plays?.length || 0);
    await failStorage('QuotaExceededError');
    let result = await finish({ playScore: 30, cleared: true });
    check(equal(result.save, { ok: false, errorCode: 'quota' }), 'T12: 판 저장 용량 오류 반환');
    check(await page.locator('.save-warn').isVisible() && await page.textContent('.save-warn') === playWarning, 'T12: 판 저장 실패 안내 원문');
    check(await page.evaluate(() => (window.Arcade.data().games.mendel?.plays?.length || 0)) === countBefore, 'T12: 실패한 판은 저장되지 않음');
    check(result.best?.isNew === false && result.firstClear === false, 'T12: 저장 실패는 최고 갱신·첫 완료 아님');
    check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '테스트' })), { ok: false, errorCode: 'gone' }) &&
      await page.textContent('.save-warn') === playWarning, 'T12: 최초 실패 판은 되살리지 않고 판 실패 문구 유지');
    await failStorage('SecurityError');
    result = await finish();
    check(equal(result.save, { ok: false, errorCode: 'unavailable' }), 'T12: 저장 접근 불가 반환');
    await restoreStorage();
    check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '복구 전 답' })), { ok: false, errorCode: 'gone' }) &&
      await page.textContent('.save-warn') === playWarning && !(await warningHidden()), 'T12: 저장소 복구 뒤에도 판 기록 실패 안내 유지');
    result = await finish();
    check(result.save?.ok === true && await warningHidden(), 'T12: 정상 판 저장·안내 숨김');
    await failStorage('QuotaExceededError');
    const unchangedPatch = await page.evaluate(() => {
      const before = localStorage.getItem('bioArcade.v1'), result = window.__t12Patch({});
      return { result, unchanged: localStorage.getItem('bioArcade.v1') === before };
    });
    check(equal(unchangedPatch.result, { ok: true }) && unchangedPatch.unchanged && await warningHidden(), 'T12: 변경 없는 patchPlay는 저장 없이 성공(M16)');
    await page.fill('#ar-refl', '답 저장 실패 테스트');
    await page.waitForFunction(text => document.querySelector('.save-warn')?.textContent === text, answerWarning);
    check(await page.locator('.save-warn').isVisible() && await page.textContent('.save-warn') === answerWarning, 'T12: 설명 답 저장 실패 안내 원문');
    check(equal(await page.evaluate(() => window.__t12Patch({ flowQuizCorrect: true })), { ok: false, errorCode: 'quota' }), 'T12: patchPlay 저장 실패 반환');
    await restoreStorage();
    // 수정 전 warn은 성공 결과에서 즉시 return하므로 답 실패 안내의 hidden·내용을 복구하지 못한다.
    check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '복구한 답' })), { ok: true }) &&
      await page.evaluate(() => window.Arcade.data().games.mendel.plays.at(-1).reflection) === '복구한 답' &&
      await warningHidden() && await page.textContent('.save-warn') === '', 'T12: 같은 판 답 저장 성공 뒤 안내 hidden·내용 비움');

    // input과 카드 제거를 같은 실행 안에서 처리해 300ms 지연 저장 전에 MutationObserver가 정리한다.
    // stopReflection → reflections의 정리 함수 → keepRefl로 마지막 답을 저장한다(D-053).
    // 정리의 keepRefl()을 지운 변이는 finally에서 타이머를 취소하고 active=false로 바꾸므로,
    // 300ms가 지나도 답이 저장되지 않아 아래 두 단언이 각각 실패한다. pagehide 등은 호출하지 않는다.
    for (const removal of ['hidden', 'replace']) {
      await finish();
      const answer = removal === 'hidden' ? '숨기기 직전 마지막 답' : '카드 교체 직전 마지막 답';
      const saved = await page.evaluate(async ({ removal, answer }) => {
        const A = window.Arcade, overlay = document.getElementById('overlay'), textarea = document.getElementById('ar-refl');
        const index = A.plays('mendel').length - 1, at = A.plays('mendel')[index].at;
        textarea.value = answer;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        if (removal === 'hidden') overlay.hidden = true;
        else overlay.innerHTML = '<div class="card">교체한 카드</div>';
        await new Promise(resolve => setTimeout(resolve, 350));
        const play = A.plays('mendel')[index];
        return { sameAt: play.at === at, reflection: play.reflection };
      }, { removal, answer });
      check(saved.sameAt && saved.reflection === answer,
        `T12: 입력 직후 ${removal === 'hidden' ? 'overlay 숨기기' : '카드 교체'} 정리에서 마지막 답 저장(D-053)`);
    }

    // 수정 전: 카드 교체 뒤 warn의 overlay.querySelector가 null → keepRefl 예외로 정리가 중단된다.
    // 따라서 pageerror·정리 뒤 gone·pagehide 무오류 단언이 실패하고, 복구 뒤 patchPlay가 답까지 바꾼다.
    for (const failure of ['QuotaExceededError', null]) {
      await finish();
      await page.evaluate(() => { document.getElementById('ar-refl').value = '정리할 답'; });
      if (failure) await failStorage(failure);
      const errorCount = pageErrors.length;
      await page.evaluate(async () => {
        document.getElementById('overlay').innerHTML = '<div class="card">교체한 카드</div>';
        await new Promise(resolve => setTimeout(resolve, 0)); // MutationObserver의 정리가 끝난 뒤 검사한다.
        window.dispatchEvent(new Event('pagehide')); // 저장소가 아직 실패하는 동안 남은 리스너도 검사한다.
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      const afterCleanup = await page.evaluate(() => localStorage.getItem('bioArcade.v1'));
      await restoreStorage();
      const cleaned = await page.evaluate(() => {
        const result = window.__t12Patch({ reflection: '정리 뒤 오염 금지' });
        window.dispatchEvent(new Event('pagehide'));
        return { result, stored: localStorage.getItem('bioArcade.v1') };
      });
      check(pageErrors.length === errorCount, `T12: 카드 교체·pagehide에서 pageerror 없음(${failure || '저장 성공'})`);
      check(equal(cleaned.result, { ok: false, errorCode: 'gone' }) && cleaned.stored === afterCleanup,
        `T12: 카드 정리 뒤 patchPlay gone·저장 답 불변(${failure || '저장 성공'})`);
    }
    await finish();
    await failStorage('QuotaExceededError');
    const retryErrors = pageErrors.length;
    await page.evaluate(() => { document.getElementById('ar-refl').value = '다시 하기 직전 답'; });
    await page.locator('#ar-retry').tap();
    check(pageErrors.length === retryErrors && equal(await page.evaluate(() => window.__t12Patch({ reflection: '다시 하기 뒤 답' })),
      { ok: false, errorCode: 'gone' }), 'T12: 저장 실패 중 다시 하기에서도 오류 없이 정리');
    await restoreStorage();

    const validated = await page.evaluate(() => {
      const A = window.Arcade, overlay = document.getElementById('overlay');
      const finish = fields => A.finish(overlay, { id: 'mendel', stars: 0, score: 0, detail: {}, lines: [], onRetry: () => {}, ...fields });
      finish({ level: 10, cond: 'x'.repeat(41), playScore: Infinity, maxCombo: NaN, cleared: false, eligible: true });
      const invalid = A.plays('mendel').at(-1);
      finish({ level: 0, cond: 'x'.repeat(40), playScore: 0, maxCombo: 0, cleared: true, eligible: false });
      const valid = A.plays('mendel').at(-1);
      return { invalid: ['level', 'cond', 'playScore', 'maxCombo', 'cleared', 'eligible'].every(k => !(k in invalid)),
        valid: valid.level === 0 && valid.cond.length === 40 && valid.playScore === 0 && valid.maxCombo === 0 && valid.cleared === true && valid.eligible === false };
    });
    check(validated.invalid && validated.valid, 'T12: finish 선택 필드 범위·자료형·경계값 검증');

    // 삭제·같은 위치와 시각의 다른 판을 현재 결과가 덮어쓰지 않는다.
    await finish();
    await go(hub, 'index.html');
    await hub.evaluate(() => window.Arcade.clearRecords());
    check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '삭제 뒤 답' })), { ok: false, errorCode: 'gone' }) &&
      await warningHidden(), 'T12: 허브 삭제 뒤 gone·안내 없음');
    for (const replacement of ['different', 'missing']) {
      await finish();
      const before = await page.evaluate(({ key, replacement }) => {
        const d = JSON.parse(localStorage.getItem(key)), p = d.games.mendel.plays.at(-1);
        if (replacement === 'different') p.playId = 'aaaaaaaaaaaa'; else delete p.playId;
        localStorage.setItem(key, JSON.stringify(d)); return localStorage.getItem(key);
      }, { key: STORE, replacement });
      check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '오염 금지' })), { ok: false, errorCode: 'gone' }) &&
        await page.evaluate(k => localStorage.getItem(k), STORE) === before && await warningHidden(),
      `T12: 같은 index·at의 ${replacement === 'missing' ? 'playId 없는 옛 판' : '다른 playId 판'} 보호`);
    }
    await go(page, 'games/mendel/index.html');
    await seed({ student: {}, games: { mendel: { best: 2, bestScore: 20, plays: [{ at: oldAt, stars: 2, score: 20, detail: {} }] } } });
    await finish();
    check(equal(await page.evaluate(() => window.__t12Patch({ reflection: '새 판 답' })), { ok: true }) &&
      await page.evaluate(() => { const p = window.Arcade.plays('mendel'); return !('reflection' in p[0]) && !('playId' in p[0]) && p[1].reflection === '새 판 답'; }),
    'T12: 앞의 옛 판은 보존하고 새 판에만 답 저장');

    // 옛 기록은 기본 판으로 읽되 놀이 점수 개인 최고로 바꾸지 않는다.
    await go(page, 'games/mendel/index.html');
    await seed({ student: { id: '20315', name: '테스트' }, games: {
      pedigree: { best: 2, bestScore: 20, plays: [{ at: oldAt, stars: 2, score: 20, detail: {} }] },
      glucose: { best: 2, bestScore: 80, plays: [{ at: oldAt, stars: 2, score: 80, detail: { mode: 'basic' } }] },
    } });
    const legacy = await page.evaluate(() => {
      const A = window.Arcade;
      return { plays: A.plays('pedigree', { level: 0 }).length, unlocked: [0, 1, 2].map(l => A.isUnlocked('pedigree', l)),
        best: A.best('glucose'), personal: A.personalBest('pedigree') };
    });
    check(equal(legacy, { plays: 1, unlocked: [true, true, false], best: 2, personal: null }), 'T12: 옛 판·최고 별·처음 판 판별 호환');
    await go(page, 'games/glucose/index.html');
    check(!(await page.isDisabled('#overlay [data-mode="resistance"]')), 'T12: 옛 혈당 별 2의 저항성 버튼 열림');
    await go(page, 'games/pedigree/index.html');
    check(await page.getAttribute('.best .stars', 'aria-label') === '별 2개', 'T12: 옛 가계도 시작 카드 최고 별 유지');
    await go(hub, 'index.html');
    check(await status('pedigree') === '최고 ★★★' && await statusStars('pedigree') === '별 2개' &&
      await summaryLine('pedigree') === '가계도 지뢰찾기 [9과21-05]: 최고 ★2, 1판', 'T12: 옛 허브 칸·요약 원문 유지');
    check(await summaryLine('glucose') === '혈당 지키기 [9과20-03]: 최고 ★2, 1판', 'T12: 옛 혈당 요약 원문 유지');

    // 출처: 배포 커밋 54e5c87 shared/arcade.js의 load·save·setStudent·record·patchLast·patchPlay 쓰기 경로.
    const preserved = await page.evaluate(() => {
      const A = window.Arcade, key = 'bioArcade.v1';
      A.record('mendel', { stars: 2, score: 20, detail: {}, level: 1, cond: 'x', playScore: 40, maxCombo: 3, cleared: true });
      const expected = A.plays('mendel')[0];
      function load() { try { return JSON.parse(localStorage.getItem(key)) || { student: {}, games: {} }; } catch { return { student: {}, games: {} }; } }
      function save(d) { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* 저장 불가 */ } }
      function setStudent(st) { const d = load(); d.student = st; save(d); }
      function record(id, play) {
        const d = load();
        const g = d.games[id] || (d.games[id] = { best: 0, bestScore: 0, plays: [] });
        g.plays.push({ at: new Date().toISOString(), ...play });
        g.best = Math.max(g.best, play.stars || 0);
        g.bestScore = Math.max(g.bestScore, play.score || 0);
        save(d); return g;
      }
      function patchLast(id, patch) { const d = load(); const g = d.games[id]; if (!g || !g.plays.length) return; Object.assign(g.plays[g.plays.length - 1], patch); save(d); }
      const id = 'mendel', playIndex = 0, playAt = expected.at;
      let active = true;
      const patchPlay = patch => {
        if (!active) return;
        const d = load(), play = d.games[id]?.plays[playIndex];
        if (!play || play.at !== playAt) { active = false; return; }
        if (Object.entries(patch).every(([k, v]) => play[k] === v)) return;
        Object.assign(play, patch); save(d);
      };
      setStudent({ id: '20315', name: '테스트' });
      patchLast(id, { reflection: '옛 코드 답' });
      patchPlay({ quizCorrect: true });
      record(id, { stars: 1, score: 10, detail: {} });
      patchLast(id, { reflection: '옛 코드 다음 답' });
      const p = A.plays(id)[0];
      return { expected, actual: p, fields: ['playId', 'level', 'cond', 'playScore', 'maxCombo', 'cleared'].every(k => p[k] === expected[k]), count: A.plays(id).length };
    });
    check(preserved.fields && /^[a-z0-9]{12}$/.test(preserved.actual.playId) && preserved.count === 2 &&
      preserved.actual.reflection === '옛 코드 답' && preserved.actual.quizCorrect === true, 'T12: 배포본 쓰기 경로가 새 판 필드 보존');

    await go(page, 'games/mendel/index.html');
    await page.evaluate(() => window.Arcade.clearRecords());
    result = await finish({ playScore: 30 });
    check(equal(result.best, { previous: null, current: 30, isNew: true }), 'T12: 첫 놀이 점수 최고 갱신');
    result = await finish({ playScore: 20 });
    check(equal(result.best, { previous: 30, current: 20, isNew: false }), 'T12: 낮은 점수 갱신 아님');
    result = await finish({ playScore: 90, eligible: false });
    check(equal(result.best, { previous: 30, current: 90, isNew: false }), 'T12: 제외 판은 최고 갱신 아님');
    await page.evaluate(() => window.Arcade.record('mendel', { stars: 2, score: 20, playScore: 50 }));
    await finish({ playScore: 70, cond: 'x' });
    result = await finish({ playScore: 40, level: 1, cleared: true });
    check(result.firstClear === true, 'T12: 도전 첫 완료');
    result = await finish({ playScore: 40, level: 1, cleared: true });
    check(result.firstClear === false, 'T12: 두 번째 완료는 첫 완료 아님');
    const personal = await page.evaluate(() => {
      const A = window.Arcade;
      return { best: [A.personalBest('mendel', 0)?.playScore, A.personalBest('mendel', 0, 'x')?.playScore, A.personalBest('mendel', 1)?.playScore],
        unlocked: [A.isUnlocked('mendel', 2), A.isUnlocked('mendel', 3)], progress: A.progress('mendel'), firstAt: A.plays('mendel', { level: 1 })[0].at };
    });
    check(equal(personal.best, [50, 70, 40]) && equal(personal.unlocked, [true, false]) && equal(personal.progress.unlocked, [0, 1, 2]), 'T12: 조건별 개인 최고·해금 계산');
    check(personal.progress.total === 7 && personal.progress.levels[0].plays === 5 && personal.progress.levels[1].plays === 2 &&
      personal.progress.levels[1].cleared === personal.firstAt, 'T12: 판 수·첫 완료 시각 계산');
    const conditionContracts = await page.evaluate(() => {
      const A = window.Arcade, at = '2026-01-01T00:00:00.000Z';
      A.record('basepang', { at, stars: 2, score: 20, cond: 'x', playScore: 50 });
      A.record('basepang', { at: '2026-01-02T00:00:00.000Z', stars: 2, score: 20, cond: 'x', playScore: 50 });
      A.record('basepang', { stars: 2, score: 20, cond: 'y', playScore: 90 });
      A.record('basepang', { stars: 2, score: 20, playScore: 100 });
      const best = A.personalBest('basepang', 0, 'x');
      const patch = A.finish(document.getElementById('overlay'), { id: 'basepang', stars: 2, score: 20, detail: {},
        cond: 'x', playScore: 40, lines: [], onRetry: () => {} });
      return { best, previous: patch.best.previous,
        x: A.plays('basepang', { cond: 'x' }).map(p => p.playScore),
        noCond: A.plays('basepang', { cond: undefined }).map(p => p.playScore) };
    });
    check(equal(conditionContracts.best, { playScore: 50, at: oldAt, index: 0 }), 'T12: 개인 최고 동점은 먼저 기록한 index·at(M23)');
    check(conditionContracts.previous === 50, 'T12: finish 이전 최고는 같은 cond끼리만 비교(M40)');
    check(equal(conditionContracts.x, [50, 50, 40]) && equal(conditionContracts.noCond, [100]), 'T12: plays cond x·명시적 undefined 필터(M43)');
    await failStorage('QuotaExceededError');
    result = await finish({ playScore: 100 });
    check(equal(result.best, { previous: 50, current: 100, isNew: false }), 'T12: 저장 실패 점수 갱신 아님');
    await restoreStorage();
    await go(page, 'games/mendel/index.html');

    const scoreboard = await page.evaluate(() => {
      const sb = window.Arcade.scoreboard({ id: 'mendel' }), events = [];
      const off = sb.on(e => events.push(e));
      sb.add(0); sb.set(0); sb.hit(); sb.hit(2); sb.miss(); sb.miss(); sb.add(30); sb.set(51); sb.set(40); sb.add(20);
      const rejected = [NaN, Infinity, -Infinity, '1'].every(n => sb.add(n) === false && sb.set(n) === false) &&
        [0, -1, NaN, Infinity].every(n => sb.hit(n) === false);
      const state = sb.state(), result = sb.result();
      off(); sb.add(1);
      window.__t12Scoreboard = sb;
      return { events, rejected, state, result };
    });
    check(equal(scoreboard.events, [{ type: 'combo', combo: 1 }, { type: 'combo', combo: 3 }, { type: 'break', combo: 3 },
      { type: 'score', score: 30, delta: 30 }, { type: 'score', score: 51, delta: 21 }, { type: 'best', score: 51, best: 50 },
      { type: 'score', score: 40, delta: -11 }, { type: 'score', score: 60, delta: 20 }]), 'T12: 점수·콤보 이벤트 값과 순서·최고 한 번·해제');
    check(scoreboard.rejected && equal(scoreboard.state, { score: 60, combo: 0, maxCombo: 3, best: 50, beatBest: true }) &&
      equal(scoreboard.result, { playScore: 60, maxCombo: 3 }), 'T12: 비유한수 거부·콤보 점수 분리·결과');
    listenerErrorPending = true;
    // evaluate 실패 때도 이벤트 대기 promise의 거부를 처리해 errors·failures 요약까지 진행한다.
    await Promise.all([
      page.waitForEvent('pageerror', { predicate: e => e.message === 'T12 리스너 검증' }),
      page.evaluate(() => {
        const sb = window.Arcade.scoreboard(); window.__t12Received = 0;
        sb.on(() => { throw new Error('T12 리스너 검증'); });
        sb.on(() => { window.__t12Received++; }); sb.add(1);
      }),
    ]);
    await page.waitForFunction(() => window.__t12Received === 1);
    // setTimeout으로 다시 던진 한 건 외의 오류는 watchErrors에 남는다.
    check(expectedListenerErrors === 1 && !listenerErrorPending && await page.evaluate(() => window.__t12Received) === 1, 'T12: 리스너 예외 한 건만 허용·다른 리스너 실행');
    await page.evaluate(() => {
      window.__t12Patch = window.Arcade.finish(document.getElementById('overlay'), { id: 'mendel', stars: 2, score: 20, detail: {},
        lines: ['검증용 결과'], onRetry: () => {}, ...window.__t12Scoreboard.result() });
    });
    check(await page.evaluate(() => { const p = window.Arcade.plays('mendel').at(-1); return p.playScore === 61 && p.maxCombo === 3; }), 'T12: scoreboard.result를 finish로 저장');

    await go(page, 'games/mendel/index.html');
    await page.evaluate(() => {
      const A = window.Arcade; A.clearRecords(); A.setStudent({ id: '20315', name: '테스트' });
      A.record('mendel', { stars: 2, score: 20, detail: {} });
      // 빈 배열 기록은 플레이한 것으로 보지 않는다.
      localStorage.setItem('bioArcade.v1', JSON.stringify({ ...A.data(), games: { ...A.data().games, basepang: { best: 3, bestScore: 30, plays: [] } } }));
    });
    await go(hub, 'index.html');
    check(await status('mendel') === '최고 ★★★' && await statusStars('mendel') === '별 2개' &&
      await summaryLine('mendel') === '멘델의 텃밭 [9과21-04]: 최고 ★2, 1판', 'T12: 기본 판만 있을 때 허브 칸·요약 원문');
    check(await status('basepang') === '아직 안 함', 'T12: 빈 판 배열은 아직 안 함');
    await page.evaluate(() => {
      const A = window.Arcade;
      A.record('mendel', { level: 1, stars: 3, score: 30, detail: {}, cleared: true, reflection: '도전 답' });
      A.record('mendel', { level: 2, stars: 3, score: 30, detail: {}, reflection: '다음 답' });
      A.record('pedigree', { level: 1, stars: 3, score: 30, detail: {}, cleared: true });
      A.record('run', { level: 1, stars: 1, score: 10, detail: {} });
    });
    await hub.reload();
    check(await status('mendel') === '최고 ★★★ · 도전 1 완료' && await statusStars('mendel') === '별 2개', 'T12: 기본 최고 별·가장 높은 도전 완료 표시');
    check(await summaryLine('mendel') === '멘델의 텃밭 [9과21-04]: 최고 ★2, 3판(기본 판 1·도전 1 1·도전 2 1), 도전 1 완료 / 설명(2판): 도전 답 / 설명(3판): 다음 답', 'T12: 난도별 판 수·설명 배열 번호');
    check(await status('pedigree') === '도전 1 완료' && await summaryLine('pedigree') === '가계도 지뢰찾기 [9과21-05]: 기본 판 안 함, 1판(도전 1 1), 도전 1 완료', 'T12: 도전 완료만 있는 허브 칸·요약');
    check(await status('run') === '도전 해 봄' && await summaryLine('run') === '에너지 런 [9과13-05·9과13-02·9과13-03·9과13-04]: 기본 판 안 함, 1판(도전 1 1)', 'T12: 미완료 도전만 있는 허브 칸·요약');
    await page.evaluate(() => window.Arcade.patchLast('mendel', { cleared: true }));
    await hub.reload();
    check(await status('mendel') === '최고 ★★★ · 도전 2 완료' && await statusStars('mendel') === '별 2개' &&
      await summaryLine('mendel') === '멘델의 텃밭 [9과21-04]: 최고 ★2, 3판(기본 판 1·도전 1 1·도전 2 1), 도전 2 완료 / 설명(2판): 도전 답 / 설명(3판): 다음 답',
      'T12: 도전 1·2 모두 완료하면 칸·요약에 가장 높은 도전 2 완료(M19)');

    // 모든 새 필드·옛 필드가 있는 판도 기존 내보내기 구조 안에 그대로 담긴다.
    await page.evaluate(() => window.Arcade.record('glucose', { stars: 2, score: 80, detail: {}, quizCorrect: true, reflection: '테스트', flowQuizCorrect: false,
      level: 1, cond: 'x', playScore: 80, maxCombo: 3, cleared: true, eligible: false }));
    await hub.reload();
    const downloaded = hub.waitForEvent('download'); await hub.locator('#dl').tap();
    const exported = JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
    check(equal(Object.keys(exported).sort(), ['app', 'exportedAt', 'games', 'quest', 'student']) &&
      equal(Object.keys(exported.student).sort(), ['id', 'name']), 'T12: JSON 내보내기 최상위·학생 키 정확히 유지');
    const allowed = new Set(['at', 'playId', 'stars', 'score', 'detail', 'quizCorrect', 'reflection', 'flowQuizCorrect', 'level', 'cond', 'playScore', 'maxCombo', 'cleared', 'eligible']);
    const exportedPlays = Object.values(exported.games).flatMap(g => g.plays);
    check(exportedPlays.length === 6 && exportedPlays.every(p => Object.keys(p).every(k => allowed.has(k)) &&
      /^[a-z0-9]{12}$/.test(p.playId) && !p.playId.includes('20315')), 'T12: 판 키 허용 목록·무작위 playId·학번 미포함');

    await go(page, 'games/mendel/index.html');
    await page.evaluate(() => { window.Arcade.clearRecords(); window.Arcade.setStudent({ id: '20315', name: '테스트' }); });
    await page.reload(); await page.locator('#ar-start').tap(); await page.locator('#t-end').tap();
    await page.waitForSelector('#ar-retry');
    const actual = await page.evaluate(() => {
      const A = window.Arcade, plays = A.plays('mendel'); return { p: plays[0], best: A.best('mendel'), n: plays.length };
    });
    check(await warningHidden() && equal(Object.keys(actual.p).sort(), ['at', 'detail', 'playId', 'score', 'stars']) &&
      /^[a-z0-9]{12}$/.test(actual.p.playId), 'T12: 실제 멘델 판은 새 난도·점수 키 없이 playId만 추가');
    await go(hub, 'index.html');
    check((await status('mendel')).startsWith('최고 ') && !(await status('mendel')).includes('도전') &&
      await summaryLine('mendel') === `멘델의 텃밭 [9과21-04]: 최고 ★${actual.best}, ${actual.n}판` &&
      !(await hub.inputValue('#summary')).includes('도전'), 'T12: 지금 학생 화면·요약에 도전 표시 없음');
    check(await hub.textContent('#msg') === '', 'T12: 정상 저장소 허브 안내 비어 있음');

    await hub.addInitScript(() => {
      window.__t12SetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('가상 저장 실패', 'SecurityError'); };
    });
    await hub.reload();
    check(await hub.textContent('#msg') === '이 브라우저에서는 기록을 저장할 수 없다. 선생님께 알려 주세요.', 'T12: 초기 저장 불가 허브 안내 원문');
  } finally {
    for (const p of [page, hub]) {
      if (!p.isClosed()) await p.evaluate(() => { if (window.__t12SetItem) Storage.prototype.setItem = window.__t12SetItem; }).catch(e => errors.push(String(e)));
    }
    await context.close();
  }
}

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
      await page.waitForFunction(() => document.getElementById('msg').textContent === '복사했다.');
      check(await page.evaluate(() => window.__uxCopied === document.getElementById('summary').value), `허브 ${height}: 요약 복사 성공`);
      check((await page.textContent('#submit-hint')) === submitHint, `허브 ${height}: 복사 뒤 제출 안내 유지`);
      await page.screenshot({ path: path.join(out, `hub-${height}-copy-success.png`) });
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async () => { throw new Error('가상 복사 실패'); } } }));
      await page.locator('#copy').tap();
      await page.waitForFunction(() => document.getElementById('msg').textContent.startsWith('복사하지 못했다.'));
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
    await recordDataTests(browser);
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
