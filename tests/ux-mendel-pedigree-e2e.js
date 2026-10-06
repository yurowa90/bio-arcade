// 플레이 테스트에서 확인된 멘델·가계도 지적만 검사한다. 각 단언에 지적 ID와 고친 방법을 적는다.
// PW=... E2E_BROWSER=chromium|webkit E2E_REDUCED_MOTION=0|1 node tests/ux-mendel-pedigree-e2e.js <저장소 밖 캡처 폴더>
const playwright = require(process.env.PW || 'playwright');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || '.');
if (out === root || out.startsWith(root + path.sep)) throw new Error('스크린샷 폴더는 저장소 밖으로 지정하세요.');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const errors = [], failures = [], consoleErrors = [];
  let ignoredManifestErrors = 0, browser;
  const check = (ok, msg) => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
    if (!ok) failures.push(msg);
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
      // arcade-e2e와 같다. WebKit file:// manifest의 확인된 CORS 오류만 제외한다.
      const confirmed = isFileManifest(url) || ((!url || url === evidence.url) && evidence.manifestFailed && !evidence.otherFailed);
      if (browserName === 'webkit' && manifestMessages.has(text) && confirmed) ignoredManifestErrors++;
      else errors.push(text);
    }
  };
  try {
    console.log(`엔진: ${browserName} · 동작 줄이기: ${reducedMotion ? '켬' : '끔'}`);
    browser = await playwright[browserName].launch();
    // 낮은 화면과 긴 화면을 각기 새 가상 기기에서 실행한다. 학생 기록은 테스트 값만 쓴다.
    for (const height of [664, 844]) {
      const context = await browser.newContext({ viewport: { width: 390, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
        ...(reducedMotion ? { reducedMotion: 'reduce' } : {}) });
      // 검정 교배 자료가 실행마다 달라져 단언이 흔들리지 않게 한다(우성·열성 자손을 모두 관찰).
      await context.addInitScript(() => {
        let i = 0;
        const sequence = [0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9];
        Math.random = () => sequence[i++ % sequence.length];
      });
      const page = await context.newPage();
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      watchErrors(page);
      const prefix = `${height}px`;
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      await page.goto('file://' + path.join(root, 'games/mendel/index.html'));
      await page.evaluate(() => window.Arcade.setStudent({ id: '20315', name: '테스트' }));
      await page.click('#ar-start');

      // mendel-4: 화분 유전자형·순종 표지·카드 이름은 12px 이상이다.
      check(await page.$$eval('.pot .gt, .pot .tag, .cardx', els => els.length > 0 && els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)), `${prefix} mendel-4 작은 글자 12px 이상`);
      // mendel-7: Enter로 화분을 골라도 다시 그린 동일 화분에 초점이 남는다.
      await page.focus('.pot[data-i="0"]'); await page.keyboard.press('Enter');
      check(await page.evaluate(() => document.activeElement.matches('.pot[data-i="0"][aria-pressed="true"]')), `${prefix} mendel-7 화분 선택 뒤 초점 유지`);
      await page.click('.pot[data-i="1"]'); await page.click('#t-cross');

      // mendel-3: 씨앗은 폭·높이 44px 이상이고 선택을 ✓와 aria-pressed로 표시한다.
      check(await page.$$eval('button.seed', seeds => seeds.length === 16 && seeds.every(s => { const r = s.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), `${prefix} mendel-3 씨앗 16개 터치 크기 44px 이상`);
      await page.click('.seed[data-i="0"]');
      check(await page.$eval('.seed[data-i="0"]', s => s.getAttribute('aria-pressed') === 'true' && getComputedStyle(s, '::after').content.includes('✓')), `${prefix} mendel-3 선택 씨앗에 ✓ 표시`);
      await page.click('.seed[data-i="0"]');
      check(await page.$eval('.seed[data-i="0"]', s => s.getAttribute('aria-pressed') === 'false' && !getComputedStyle(s, '::after').content.includes('✓')), `${prefix} mendel-3 선택 취소 시 ✓ 제거`);
      await page.click('.seed[data-i="0"]'); await page.click('#plant');
      // mendel-2: 값 16.0은 비율이 아니라 16개 중 기대 개수로 안내한다.
      const note = await page.textContent('#info');
      check(note.includes('관찰 개수 / 기대 개수, 16개 중') && !note.includes('기대 비율') && (await page.textContent('.note-table')).includes('16.0'), `${prefix} mendel-2 노트 제목과 기대 개수 일치`);
      await page.click('.pot[data-i="2"]');
      // mendel-1: 같은 알아내기 버튼에 실제 방법과 하루 비용을 미리 보인다.
      check((await page.textContent('#t-test')).includes('유전자형 알아내기') && (await page.textContent('#t-test')).includes('추론 (하루 안 씀)'), `${prefix} mendel-1 추론 방법·비용 안내`);
      const days = await page.textContent('#days');
      await page.click('#t-test');
      check((await page.textContent('#overlay h2')) === '유전자형 추론' && await page.textContent('#days') === days, `${prefix} mendel-1 추론은 하루를 쓰지 않음`);
      // mendel-5 / D-052 Q6: 첫 추론에서 RRYY 오답을 고르면 실제 부모 생식세포·자손을 함께 설명한다.
      await page.click('[data-g="RRYY"]');
      const why = await page.textContent('#overlay .quiz-fb');
      check(why.includes('아쉽다') && why.includes('부모 RRYY는 RY 생식세포만, rryy는 ry 생식세포만 만든다.') && why.includes('자손은 모두 RrYy가 된다.'), `${prefix} mendel-5 부모 RY·ry와 자손 RrYy 오답 해설`);
      await page.screenshot({ path: path.join(out, `mendel-${height}-wrong.png`) });
      await page.click('#gclose'); await page.click('.pot[data-i="2"]');
      check((await page.textContent('#t-test')).includes('검정 교배 (하루 소요)'), `${prefix} mendel-1 오답 후 검정 교배 안내`);
      await page.click('#t-test');
      check(await page.textContent('#days') === days && await page.$eval('#overlay', el => el.hidden), `${prefix} D-012 첫 누름은 검정 교배 전 안내만 표시`);
      await page.click('#t-test');
      check((await page.textContent('#overlay h2')) === '검정 교배 결과', `${prefix} mendel-1 검정 교배 결과 카드 표시`);
      // 추론 오답 뒤에는 숨은 유전자형으로 노트 기대값이 새지 않는다(D-011 유지).
      await page.click('[data-g="RRYY"]'); await page.click('#gclose');
      check(Number(await page.textContent('#days')) === Number(days) - 1, `${prefix} mendel-1 카드를 닫으면 검정 교배 하루 소요 표시`);
      check(await page.$$eval('.note-table tr:nth-child(2) td span', cells => cells.length === 4 && cells.every(c => c.textContent === '?')), `${prefix} D-011 미확인 부모의 기대 개수는 ? 유지`);
      check(await noOverflow(), `${prefix} 멘델 화면 가로 넘침 없음`);
      // 같은 부모의 자가 수분 추론에서는 생식세포 설명을 한 번만 쓴다.
      await page.reload(); await page.click('#ar-start');
      await page.click('.pot[data-i="0"]'); await page.click('#t-self');
      await page.click('.seed[data-i="0"]'); await page.click('#plant');
      await page.click('.pot[data-i="2"]'); await page.click('#t-test');
      await page.click('[data-g="RrYy"]');
      const selfWhy = await page.textContent('#overlay .quiz-fb');
      check((selfWhy.match(/RRYY는 RY 생식세포만/g) || []).length === 1 && selfWhy.includes('자손은 모두 RRYY가 된다.'), `${prefix} 멘델 자가 수분 부모 생식세포 설명 중복 없음`);

      await page.goto('file://' + path.join(root, 'games/pedigree/index.html'));
      await page.click('#ar-start');
      for (let level = 0; level < 4; level++) {
        const fixture = await page.evaluate(i => {
          const L = window.Pedigree.LEVELS[i], sol = window.Pedigree.solve(L);
          return { correct: sol.must[0], wrong: L.people.find(p => !p.affected && !sol.must.includes(p.id))?.id,
            affected: L.people.find(p => p.affected).id, people: L.people };
        }, level);
        // pedigree-1 / Q8: 인물은 버튼으로 노출하고 성별·발현·표시 상태와 위치를 읽는다.
        check(await page.$$eval('#field .person', (els, people) => els.length === people.length && els.every(el => {
          const p = people.find(p => p.id === el.dataset.id), label = el.getAttribute('aria-label') || '';
          return el.getAttribute('role') === 'button' && el.getAttribute('tabindex') === '0' && label.includes(p.sex === 'M' ? '남성' : '여성') && label.includes(p.affected ? '형질 발현' : '형질 미발현') && label.includes('표시 없음');
        }), fixture.people), `${prefix} pedigree-1 ${level + 1}단계 인물 역할·이름`);
        check(await page.$eval('#field svg', s => s.getAttribute('role') === 'group'), `${prefix} pedigree-1 SVG가 인물 버튼을 숨기지 않음`);
        // pedigree-6: 인물의 투명 터치 영역을 48단위로 넓힌다(390px 화면에서 44px 이상).
        check(await page.$$eval('#field .touch-target', els => els.every(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), `${prefix} pedigree-6 인물 터치 영역 44px 이상`);
        const person = `#field .person[data-id="${fixture.correct}"]`;
        await page.focus(person); await page.keyboard.press('Enter');
        check(await page.$eval(person, el => document.activeElement === el && el.getAttribute('aria-label').includes('보인자로 표시')), `${prefix} pedigree-1 Enter 표시·초점 유지`);
        await page.keyboard.press('Space');
        check((await page.getAttribute(person, 'aria-label')).includes('모름으로 표시'), `${prefix} pedigree-1 Space로 ? 표시`);
        await page.keyboard.press('Enter');
        check((await page.getAttribute(person, 'aria-label')).includes('표시 없음'), `${prefix} pedigree-1 세 번째 선택으로 표시 취소`);
        await page.keyboard.press('Enter');
        await page.focus(`#field .person[data-id="${fixture.affected}"]`); await page.keyboard.press('Enter');
        check((await page.getAttribute(`#field .person[data-id="${fixture.affected}"]`, 'aria-label')).includes('표시 없음'), `${prefix} pedigree-1 발현자는 키보드로도 보인자 표시하지 않음`);
        if (fixture.wrong) await page.click(`#field .person[data-id="${fixture.wrong}"]`);
        await page.click('#judge');
        // pedigree-4: 해설은 다음 단계 버튼보다 앞에 있고, 판정 직후 첫 근거가 화면 안에 있다.
        const feedback = await page.evaluate(() => {
          const result = document.getElementById('result'), button = document.getElementById('judge'), first = result.querySelector('li').getBoundingClientRect();
          return { before: !!(result.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING), top: first.top, bottom: first.bottom, height: innerHeight };
        });
        check(feedback.before && feedback.top >= 0 && feedback.bottom <= feedback.height, `${prefix} pedigree-4 ${level + 1}단계 판정 뒤 근거 먼저 표시`);
        // pedigree-5: 맞힘·오표시를 초록·빨강 이외에 ✓·✗ 기호로 구별한다.
        check((await page.textContent(person)).includes('✓'), `${prefix} pedigree-5 맞힘에 ✓`);
        if (fixture.wrong) check((await page.textContent(`#field .person[data-id="${fixture.wrong}"]`)).includes('✗'), `${prefix} pedigree-5 오표시에 ✗`);
        const judgedLabel = await page.getAttribute(person, 'aria-label');
        await page.focus(person); await page.keyboard.press('Space');
        check(await page.getAttribute(person, 'aria-label') === judgedLabel && await page.getAttribute(person, 'aria-disabled') === 'true', `${prefix} pedigree-1 판정 뒤 키보드 표시 변경 차단`);
        await page.screenshot({ path: path.join(out, `pedigree-${height}-level${level + 1}.png`) });
        // pedigree-7: 다음 단계 첫 갱신 전에도 이전 타이머 값을 보여 주지 않는다.
        await page.evaluate(() => { document.getElementById('timer').textContent = '123'; document.getElementById('judge').click(); });
        if (level < 3) check(await page.textContent('#timer') === '000', `${prefix} pedigree-7 단계 시작 즉시 000`);
      }
      // pedigree-2 / Q3: 결과 카드 문항 곁에는 4단계 형질·관계만 다시 그려 표시·정답·근거는 제외한다.
      const reference = await page.evaluate(() => {
        const ref = document.querySelector('.pedigree-reference'), L = window.Pedigree.LEVELS[3];
        if (!ref) return { present: false };
        return { present: true, ids: [...ref.querySelectorAll('.person')].map(p => p.dataset.id), expected: L.people.map(p => p.id),
          noAnswers: !ref.querySelector('.verdict, [stroke-dasharray], [fill="#6b4fa0"], [stroke="#1f8a4c"], [stroke="#c0392b"], [stroke="#e69138"], ul, li, [role="button"], [tabindex]'),
          alongside: ref.nextElementSibling?.classList.contains('refl'),
          affected: L.people.every(p => ref.querySelector(`[data-id="${p.id}"] > ${p.sex === 'M' ? 'rect:not(.touch-target)' : 'circle'}`)?.getAttribute('fill') === (p.affected ? '#222' : '#fff')) };
      });
      check(reference.present && JSON.stringify(reference.ids) === JSON.stringify(reference.expected) && reference.noAnswers && reference.alongside && reference.affected, `${prefix} pedigree-2 표시·정답 없는 4단계 축소본과 원래 형질 유지`);
      await page.fill('#ar-refl', '가족의 형질을 근거로 판단했다.'); await page.waitForTimeout(500);
      check(await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1).reflection === '가족의 형질을 근거로 판단했다.'), `${prefix} D-051 축소본 추가 뒤 서술 답 자동 저장 유지`);
      await page.screenshot({ path: path.join(out, `pedigree-${height}-reflection.png`) });
      check(await noOverflow(), `${prefix} 가계도 결과 카드 가로 넘침 없음`);
      await page.click('#ar-retry');
      check(await page.textContent('#timer') === '000' && await page.locator('.pedigree-reference:visible').count() === 0, `${prefix} pedigree-7 다시 하기 즉시 초기화`);
      await context.close();
    }
  } catch (e) {
    errors.push(e.stack || e.message);
  } finally {
    finishErrors();
    console.log('errors:', errors.length ? errors : 'none');
    console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
    console.log('failures:', failures.length ? failures : 'none');
    if (errors.length || failures.length) process.exitCode = 1;
    if (browser) await browser.close();
  }
})();
