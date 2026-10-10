// 플레이 테스트에서 확인된 멘델·가계도 지적만 검사한다. 각 단언에 지적 ID와 고친 방법을 적는다.
// PW=... E2E_BROWSER=chromium|webkit E2E_REDUCED_MOTION=0|1 node tests/ux-mendel-pedigree-e2e.js <저장소 밖 캡처 폴더>
const playwright = process.argv.includes('--pedigree-logic-only') ? null : require(process.env.PW || 'playwright');
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
  // 브라우저 없이 화면의 채점·기록·배치 계산을 확인한다.
  // PW=... node tests/ux-mendel-pedigree-e2e.js /tmp/bio-pedigree-pure --pedigree-logic-only
  function pedigreeCalculations() {
    const assert = require('node:assert/strict'), P = require('../games/pedigree/pedigree.js'), V = require('../games/pedigree/game.js');
    // 고정 문제: 10번→7번→2번은 두 번의 유전, 9번은 한 번의 유전이다.
    const depthPed = P.makeBundle(123, 1)[0];
    const depthDetail = V.problemDetail(depthPed, V.grade(depthPed, P.solve(depthPed), {}, depthPed.mode),
      P.solve(depthPed).must.length, 8, depthPed.mode, P.deduce(depthPed));
    assert.equal(depthDetail.maxDepth, 2, 'must에 이르는 유전 깊이는 두 번의 유전이다');
    // 카드 산수는 유전 횟수를 늘리지 않는다. 9번 제외→11번→8번→4번의 유전은 세 번이다.
    const cardPed = P.makeBundle(123, 1)[2];
    const cardDetail = V.problemDetail(cardPed, V.grade(cardPed, P.solve(cardPed), {}, cardPed.mode),
      P.solve(cardPed).must.length, 8, cardPed.mode, P.deduce(cardPed));
    assert.equal(cardDetail.maxDepth, 3, '카드 산수를 포함한 옛 사슬 깊이 5가 아니라 유전 깊이 3을 기록한다');
    // 이전 형식·다른 도전은 건너뛰고, 같은 도전의 최근 12판만 반복 회피에 쓴다.
    const old = { detail: { kind: 'challenge', level: 1, problems: [{ shapeId: '000000ff' }] } };
    const recent = Array.from({ length: 12 }, (_, i) => ({ detail: { kind: 'challenge', level: 1,
      problems: [{ shapeId: i.toString(16).padStart(8, '0') }, { shapeId: '00000000' }, {}, { shapeId: '잘못된 값' }] } }));
    const history = [old, ...recent, { detail: { kind: 'basic', level: 0 } },
      { detail: { kind: 'challenge', level: 2, problems: [{ shapeId: 'ffffffff' }] } }];
    assert.deepEqual(V.collectAvoid(history, 1), Array.from({ length: 12 }, (_, i) => i.toString(16).padStart(8, '0')));
    assert.deepEqual(V.collectAvoid(history, 2), ['ffffffff']);
    assert.deepEqual(V.collectAvoid([{ detail: { kind: 'challenge', level: 1 } }], 1), []);
    assert.match(depthDetail.shapeId, /^[0-9a-f]{8}$/);
    assert.equal(depthDetail.shapeId, depthPed.shapeId);
    assert(!('witness' in depthDetail));
    const malformed = [null, 7, [], { detail: null }, { detail: [] },
      { detail: { kind: 'challenge', level: 1, problems: {} } },
      { detail: { kind: 'challenge', level: 1, problems: '잘못된 값' } }];
    assert.deepEqual(V.collectAvoid([...malformed, ...history], 1), Array.from({ length: 12 }, (_, i) => i.toString(16).padStart(8, '0')),
      'null·배열이 아닌 자료가 섞여도 반복 회피 계산을 멈추지 않는다');
    assert.deepEqual(V.collectAvoid(null, 1), []);
    // 문턱은 맞힘 비율이 아닌 놓침 수로 정한다. 고정 연습은 해금 기록을 만들지 않는다.
    const summary = (missed, fixedSeed = false, challenge = 1) => V.finishSummary(
      { correct: 8 - missed, wrong: 0, missed, must: 8, perLevel: [
        { mode: 'auto', chosenMode: 'auto' }, { mode: 'x', chosenMode: 'auto' },
        { mode: 'auto', chosenMode: 'auto' }, { mode: 'x', chosenMode: 'x' }] },
      { challenge, fixedSeed, basicEligible: true, playScore: 20, maxCombo: 2, bundleSeed: 123 });
    for (const missed of [0, 1, 2]) {
      const result = summary(missed);
      assert.equal('cleared' in result, missed <= 1);
      assert.equal('cleared' in result.detail, missed <= 1);
      if (missed <= 1) { assert.equal(result.cleared, true); assert.equal(result.detail.cleared, true); }
    }
    const practice = summary(0, true);
    assert(!('cleared' in practice)); assert(!('cleared' in practice.detail));
    assert.equal(practice.eligible, false);
    assert.equal(practice.lines[1], '연습용 고정 문제라 도전 2를 여는 기록에 넣지 않는다.');
    assert.deepEqual(summary(0, false, 0).lines, ['확실한 보인자 8명 중 8명을 찾았다. 잘못 표시 0명.', '근거가 있는 곳까지만 판단했다. 훌륭한 추론이다.']);
    assert.equal(summary(0, false, 2).lines[1], '유전 방식을 맞힌 문제 3/4.');
    assert(!summary(0, false, 2).lines.some(line => line.includes('문턱')));
    assert.deepEqual(summary(0, true, 2).lines.slice(1), ['유전 방식을 맞힌 문제 3/4.', '연습용 고정 문제라 최고 기록에 넣지 않는다.']);
    const wrongBasic = V.finishSummary({ correct: 7, wrong: 1, missed: 1, must: 8 },
      { challenge: 0, fixedSeed: false, basicEligible: true, playScore: 0, maxCombo: 0 });
    assert.deepEqual(wrongBasic.lines, ['확실한 보인자 8명 중 7명을 찾았다. 잘못 표시 1명.',
      '“보인자일 수도 있다”와 “반드시 보인자다”는 다르다. 과학적 추론은 근거가 있는 곳까지만 말한다.']);
    // 실제 select 이벤트 경로를 최소 DOM으로 실행한다. 생성 한도 오류만 복구한다.
    const vm = require('node:vm');
    function selection(makeBundle, search = '', plays = [], kind = 1, fallback = false) {
      const elements = new Map();
      const element = id => {
        if (!elements.has(id)) elements.set(id, { hidden: true, dataset: {}, addEventListener() {}, focus() {} });
        return elements.get(id);
      };
      const document = { getElementById: element, querySelectorAll: () => [] };
      let intro;
      const window = { Pedigree: { makeBundle }, Arcade: { intro: (_, options) => { intro = options; },
        ...(!fallback ? { isUnlocked: () => true } : {}), data: () => ({ games: { pedigree: { plays } } }) },
        addEventListener() {}, scrollTo() {} };
      const context = { window, document, location: { search }, URLSearchParams,
        clearInterval() {}, clearTimeout() {},
        crypto: { getRandomValues: array => { array[0] = 456; return array; } } };
      vm.runInNewContext(fs.readFileSync(path.join(root, 'games/pedigree/game.js'), 'utf8'), context);
      return Object.assign(() => element(`choose-${kind}`).onclick(), { stage: element('stage'),
        chooser: () => intro.onStart(), choose2: element('choose-2'), chooserPanel: element('chooser'),
        challengeIntro: element('challenge-intro') });
    }
    const corruptHistory = [...malformed, { detail: { kind: 'challenge', level: 1, cleared: true } }, ...history];
    const recover = selection(P.makeBundle, '', corruptHistory, 2, true);
    assert.doesNotThrow(recover.chooser);
    assert.equal(recover.chooserPanel.hidden, false); assert.equal(recover.choose2.disabled, false);
    assert.doesNotThrow(recover);
    assert.equal(recover.challengeIntro.hidden, false, '잘못된 기록이 섞여도 도전 2 안내로 시작한다');
    const locked = selection(P.makeBundle, '', malformed, 2, true);
    assert.doesNotThrow(locked.chooser); assert.equal(locked.choose2.disabled, true);
    const seededHistory = selection(P.makeBundle, '', [{ detail: { kind: 'challenge', level: 1, cleared: true, fixedSeed: true } }], 2, true);
    seededHistory.chooser(); assert.equal(seededHistory.choose2.disabled, true, '옛 고정 연습 기록도 대체 해금 계산에서 제외한다');
    const bug = new TypeError('검증용 코드 오류');
    assert.throws(selection(() => { throw bug; }), e => e === bug, '생성 외 코드 오류는 다시 던진다');
    assert.throws(selection(() => { throw null; }), e => e === null, 'Error 객체가 아닌 예외도 가리지 않는다');
    const exhausted = Object.assign(new Error('검증용 생성 한도'), { code: 'PEDIGREE_GENERATION_EXHAUSTED' });
    let attempts = 0;
    assert.doesNotThrow(selection(() => { attempts++; throw exhausted; }));
    assert.equal(attempts, 4, '생성 한도 오류만 최초 시도와 재시도 세 번으로 제한한다');
    attempts = 0;
    assert.doesNotThrow(selection(() => { attempts++; throw exhausted; }, '?seed=123'));
    assert.equal(attempts, 1, '고정 시드는 생성 실패 뒤 무작위 시드로 바뀌지 않는다');
    let generated;
    const previousShapes = P.makeBundle(456, 2).map(p => p.shapeId);
    const selectionHistory = [{ detail: { kind: 'challenge', level: 2,
      problems: previousShapes.map(shapeId => ({ shapeId })) } }];
    const choose = selection((seed, challenge, options) => {
      generated = P.makeBundle(seed, challenge, options); return generated;
    }, '', selectionHistory, 2);
    choose();
    assert.equal(choose.stage.dataset.avoid, previousShapes.join(','), '실제 선택 경로가 같은 도전 기록의 모양을 공개한다');
    assert(generated.every(p => !previousShapes.includes(p.shapeId)), '실제 선택 경로도 기록 모양을 피한 묶음을 만든다');
    const fixedChoose = selection((...args) => {
      assert.equal(args.length, 2, '고정 시드 판에는 avoid 옵션을 넘기지 않는다');
      assert.equal(args[0], 123); return P.makeBundle(...args);
    }, '?seed=123', selectionHistory, 2);
    fixedChoose(); assert.equal(fixedChoose.stage.dataset.avoid, '');
    const recentChoose = selection(P.makeBundle, '', [...malformed, ...history], 2);
    recentChoose(); assert.equal(recentChoose.stage.dataset.avoid, 'ffffffff');
    const twelveChoose = selection(() => { throw exhausted; }, '', [...malformed, ...history], 1);
    twelveChoose();
    assert.equal(twelveChoose.stage.dataset.avoid, '00000000,00000001,00000002,00000003,00000004,00000005,00000006,00000007,00000008,00000009,0000000a,0000000b',
      '실제 선택 data-avoid는 최근 12판을 중복 제거한 정확한 목록이다');
    const first = P.makeBundle(123, 1), firstShapes = first.map(p => p.shapeId);
    const second = P.makeBundle(123, 1, { avoid: firstShapes });
    assert(second.every(p => !firstShapes.includes(p.shapeId)), '같은 시드도 avoid가 있으면 직전 묶음의 모양을 피한다');
    let count = 0;
    const overlap = (a, b) => a.left < b.right - 1e-8 && b.left < a.right - 1e-8 && a.top < b.bottom - 1e-8 && b.top < a.bottom - 1e-8;
    const centered = (p, r) => ({ left: V.X(p.x) - r, right: V.X(p.x) + r, top: V.Y(p.gen) - r, bottom: V.Y(p.gen) + r });
    for (const challenge of [1, 2]) for (let seed = 0; seed < 200; seed++) for (const ped of P.makeBundle(seed, challenge)) {
      count++;
      const sol = P.solve(ped), marks = Object.fromEntries(sol.must.map(id => [id, 'c']));
      const result = V.grade(ped, sol, marks, ped.mode);
      assert(result.perfect); assert.equal(result.correct.length, sol.must.length);
      if (challenge === 2) assert(!V.grade(ped, sol, marks, ped.mode === 'x' ? 'auto' : 'x').perfect);
      const all = Object.fromEntries(ped.people.filter(p => !p.affected).map(p => [p.id, 'c']));
      const wrong = V.grade(ped, sol, all, ped.mode);
      assert.equal(wrong.wrong.length, Object.keys(all).length - sol.must.length);
      const detail = V.problemDetail(ped, wrong, sol.must.length, 8, ped.mode, P.deduce(ped));
      assert(detail.maxDepth >= 1); assert.match(detail.shapeId, /^[0-9a-f]{8}$/);
      assert.equal(detail.shapeId, ped.shapeId);
      assert.equal(typeof detail.must, 'number'); assert.equal(typeof detail.correct, 'number');
      assert.equal(detail.cards, ped.cards.length); assert.equal(detail.seconds, 8);
      assert(!('witness' in detail)); assert(!JSON.stringify(detail).includes('witness')); assert(!('people' in detail));
      assert(!/"(AA|Aa|aa|AY|aY)"/.test(JSON.stringify(detail)), '다른 키나 배열에도 숨은 유전자형을 기록하지 않는다');
      const targets = ped.people.map(p => centered(p, 25));
      targets.forEach((a, i) => targets.slice(i + 1).forEach(b => assert(!overlap(a, b))));
      ped.people.forEach(p => ped.people.filter(q => q !== p).forEach(q => {
        const badge = { left: V.X(p.x) - 7, right: V.X(p.x) + 7, top: V.Y(p.gen) - 19, bottom: V.Y(p.gen) - 5 };
        const number = { left: V.X(q.x) - 8, right: V.X(q.x) + 8, top: V.Y(q.gen) + 26, bottom: V.Y(q.gen) + 40 };
        assert(!overlap(badge, centered(q, 24.5))); assert(!overlap(badge, number));
      }));
    }
    for (const [total, expected] of [
      [{ correct: 8, wrong: 0, missed: 0, must: 8 }, 3],
      [{ correct: 7, wrong: 1, missed: 1, must: 8 }, 2],
      [{ correct: 8, wrong: 2, missed: 2, must: 10 }, 2],
      [{ correct: 8, wrong: 3, missed: 2, must: 10 }, 1],
      [{ correct: 4, wrong: 4, missed: 4, must: 8 }, 1],
      [{ correct: 8, wrong: 9, missed: 0, must: 8 }, 0],
    ]) assert.equal(V.starsFor(total), expected);
    check(true, `가계도 순수 계산 ${count}문제: 채점·방식 오답·유전 깊이·최근 12판 회피·고정 시드·생성 오류 구별·shapeId·기록 비밀 제외·터치/배지 좌표·별 경계`);
  }

  // 화면과 해결기는 같은 공개 시드·도전을 읽는다. 정답/유전자형을 화면 상태에 주입하지 않는다.
  async function challengeChecks(page, prefix) {
    const fixture = i => page.evaluate(i => {
      const stage = document.getElementById('stage'), P = window.Pedigree;
      const ped = P.makeBundle(Number(stage.dataset.seed), Number(stage.dataset.challenge), { avoid: (stage.dataset.avoid || '').split(',').filter(Boolean) })[i], sol = P.solve(ped);
      const w = P.walkthrough(ped);
      return { mode: ped.mode, must: sol.must, maybe: sol.maybe, normal: ped.people.filter(p => !p.affected).map(p => p.id),
        affected: ped.people.find(p => p.affected)?.id, walk: [...w.modeSteps, ...w.steps],
        cards: ped.cards.map(c => c.text), tests: ped.cards.filter(c => c.type === 'noA').length,
        publicShape: JSON.stringify({ people: ped.people, couples: ped.couples, cards: ped.cards }) };
    }, i);
    const tapIds = async ids => { for (const id of ids) await page.click(`#field .person[data-id="${id}"]`); };
    const touchGeometry = () => page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#field .touch-target')].map(el => el.getBoundingClientRect());
      const overlap = (a, b) => a.left < b.right - .01 && b.left < a.right - .01 && a.top < b.bottom - .01 && b.top < a.bottom - .01;
      return boxes.length > 0 && boxes.every(r => r.width >= 44 && r.height >= 44)
        && boxes.every((a, i) => boxes.slice(i + 1).every(b => !overlap(a, b)));
    });
    const verdictGeometry = () => page.evaluate(() => {
      const people = [...document.querySelectorAll('#field .person')], overlap = (a, b) => a.left < b.right - .01 && b.left < a.right - .01 && a.top < b.bottom - .01 && b.top < a.bottom - .01;
      return people.every(p => [...p.querySelectorAll('.verdict')].every(v => {
        const box = v.getBoundingClientRect();
        return people.filter(q => q !== p).every(q => [...q.querySelectorAll('.verdict, .verdict-ring, .person-number')].every(el => !overlap(box, el.getBoundingClientRect())));
      }));
    });
    // 기록을 미리 넣어 회피 목록을 확률과 무관하게 확인한다. 실제 학생 자료는 쓰지 않는다.
    await page.evaluate(() => {
      const data = window.Arcade.data();
      const recent = Array.from({ length: 13 }, (_, i) => ({ detail: { kind: 'challenge', level: 1,
        problems: [{ shapeId: i.toString(16).padStart(8, '0') }, { shapeId: '00000001' }] } }));
      data.games.pedigree.plays.push(null, { detail: { kind: 'challenge', level: 1, problems: {} } },
        ...recent, { detail: { kind: 'challenge', level: 2, problems: [{ shapeId: 'ffffffff' }] } });
      localStorage.setItem('bioArcade.v1', JSON.stringify(data));
    });
    await page.reload(); await page.click('#ar-start');
    check(await page.isVisible('#chooser') && await page.isDisabled('#choose-2'), `${prefix} 이상한 기록을 건너뛰고 판 고르기·도전 2 잠김`);
    await page.click('#choose-1');
    check(await page.getAttribute('#stage', 'data-avoid') === '00000001,00000002,00000003,00000004,00000005,00000006,00000007,00000008,00000009,0000000a,0000000b,0000000c',
      `${prefix} 실제 도전 시작: 최근 12판 shapeId를 중복 제거한 정확한 data-avoid`);
    const initial = await page.evaluate(() => {
      const svg = document.querySelector('#field svg').getBoundingClientRect(), first = document.querySelector('#clues .conditions li').getBoundingClientRect(), judge = document.querySelector('#judge').getBoundingClientRect();
      return { scroll: scrollY, svgBottom: svg.bottom, firstTop: first.top, judgeTop: judge.top, judgeBottom: judge.bottom, height: innerHeight };
    });
    check(initial.scroll === 0 && initial.svgBottom <= initial.height && initial.firstTop < initial.judgeTop && initial.judgeTop <= initial.height && initial.judgeBottom <= initial.height,
      `${prefix} 도전 첫 화면 가계도·자료 첫 줄·판정 단추`);
    check(await touchGeometry(), `${prefix} 도전 터치 44px 이상·서로 겹침 없음`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${prefix} 도전 가로 넘침 없음`);
    for (let i = 0; i < 4; i++) {
      const f = await fixture(i); await tapIds(f.must); await page.click('#judge');
      check((await page.textContent('#result')).includes('완전 해결') && await page.isDisabled('#face'), `${prefix} 도전 1 ${i + 1} 정답·표시 지우기 끔`);
      check((await page.textContent('#face')).startsWith('표시 지우기') && (await page.textContent('#face')).includes('판정 뒤 꺼짐')
        && await page.getAttribute('#face', 'aria-label') === '표시 지우기' && await page.getAttribute('#face', 'title') === '표시 지우기', `${prefix} 표시 지우기 이름·꺼진 상태 글자`);
      await page.click('#judge');
    }
    const rec = await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1));
    check(rec.detail.kind === 'challenge' && rec.detail.level === 1 && rec.detail.cleared === true && rec.detail.eligible === true
      && rec.detail.playScore === 40 && rec.detail.maxCombo === 4 && rec.detail.problems.length === 4
      && rec.detail.problems.every(p => Number.isInteger(p.maxDepth) && p.maxDepth >= 1 && /^[0-9a-f]{8}$/.test(p.shapeId))
      && !('witness' in rec.detail) && !JSON.stringify(rec).includes('witness') && !/"(AA|Aa|aa|AY|aY)"/.test(JSON.stringify(rec.detail)), `${prefix} 도전 기록·문턱 통과·다른 키와 배열도 숨은 유전자형 제외`);
    const referenceClues = () => page.evaluate(() => {
      const stage = document.getElementById('stage'), P = window.Pedigree;
      const L = P.makeBundle(Number(stage.dataset.seed), Number(stage.dataset.challenge),
        { avoid: (stage.dataset.avoid || '').split(',').filter(Boolean) })[3];
      const ref = document.querySelector('.pedigree-reference');
      return { cards: L.cards.length, matching: !!ref && JSON.stringify([...ref.querySelectorAll('[data-reference-card]')].map(c => c.textContent)) === JSON.stringify(L.cards.map(c => c.text)),
        conditions: ref?.querySelectorAll('.conditions li').length === 2,
        tests: !L.cards.some(c => c.type === 'noA') || !!ref?.querySelector('table[aria-label="유전자 검사 결과"]'),
        noAnswers: !!ref && !ref.querySelector('.carrier-fill, .verdict, .verdict-ring, .proof-ring, [role="button"], [tabindex]') };
    });
    const ref = await referenceClues();
    check(ref.matching && ref.conditions && ref.tests && ref.noAnswers, `${prefix} 도전 축소본에 마지막 문제 조건·카드·검사 표만 유지`);
    await page.click('#ar-retry');
    await page.click('#choose-1');
    const repeated = await page.evaluate(() => {
      const s = document.getElementById('stage'), avoid = (s.dataset.avoid || '').split(',').filter(Boolean);
      return { avoid, shapes: window.Pedigree.makeBundle(Number(s.dataset.seed), Number(s.dataset.challenge), { avoid }).map(p => p.shapeId) };
    });
    const firstShapes = rec.detail.problems.map(p => p.shapeId);
    check(firstShapes.every(id => repeated.avoid.includes(id)) && repeated.shapes.every(id => !firstShapes.includes(id)),
      `${prefix} 도전 1 연속 두 묶음: 첫 기록 shapeId를 data-avoid에 넣고 모양 중복 없음`);
    for (let i = 0; i < 4; i++) { const f = await fixture(i); await tapIds(f.must); await page.click('#judge'); await page.click('#judge'); }
    check(await page.evaluate(shapes => {
      const d = window.Arcade.data().games.pedigree.plays.at(-1).detail;
      return JSON.stringify(d.problems.map(p => p.shapeId)) === JSON.stringify(shapes) && !('witness' in d) && !JSON.stringify(d).includes('witness') && !/"(AA|Aa|aa|AY|aY)"/.test(JSON.stringify(d));
    }, repeated.shapes), `${prefix} 둘째 묶음 기록에 실제 shapeId만 저장·witness 제외`);
    await page.click('#ar-retry');
    check(await page.isEnabled('#choose-2'), `${prefix} 기록 뒤 도전 2 열림`);
    for (const missed of [2, 1]) {
      await page.click('#choose-1');
      for (let i = 0; i < 4; i++) {
        const f = await fixture(i); await tapIds(i === 0 ? f.must.slice(missed) : f.must);
        await page.click('#judge'); await page.click('#judge');
      }
      check(await page.evaluate(missed => {
        const r = window.Arcade.data().games.pedigree.plays.at(-1), d = r.detail;
        return d.wrong === 0 && d.missed === missed && (missed === 1 ? d.cleared === true : !('cleared' in d) && !('cleared' in r));
      }, missed), `${prefix} 문턱 경계: 지뢰 0·놓침 ${missed}명인 묶음 ${missed === 1 ? 'cleared 있음' : 'cleared 없음'}`);
      await page.click('#ar-retry');
    }
    await page.click('#choose-2');
    const expectedFacts = [
      '아들의 X 염색체는 어머니에게서만 온다. 그래서 X 염색체 열성 형질은 아들이 발현하면 어머니가 a를 가지고, 어머니가 발현하면 아들도 모두 발현한다.',
      '딸은 아버지와 어머니에게서 X 염색체를 하나씩 받는다. 그래서 X 염색체 열성 형질은 딸이 발현하면 아버지도 발현하고, 아버지가 발현하면 딸은 a를 가지며, 아버지가 정상인 딸에게 a가 있으면 그 a는 어머니에게서 왔다.',
      '상염색체 유전에서는 아들과 딸 모두 부모에게서 대립유전자를 하나씩 받는다. 그래서 발현한 자녀의 부모는 모두 a를 가지고, 발현한 부모의 자녀는 모두 a를 가지며, 부모 한 사람에게 a가 없으면 자녀의 a는 다른 한 사람에게서 왔다.',
      '남성은 X 염색체가 하나라 X 염색체 열성 형질의 보인자가 될 수 없다.',
    ];
    check(await page.isVisible('#challenge-intro') && await page.$$eval('#challenge-intro li', (els, facts) =>
      JSON.stringify(els.map(el => el.textContent)) === JSON.stringify(facts), expectedFacts), `${prefix} 도전 2 시작 사실 네 문장 일치`);
    await page.click('#challenge-start');
    check(await page.textContent('#mines') === '---' && await page.$eval('#facts', el => !el.open), `${prefix} 도전 2 숫자 숨김·사실 기본 접힘`);
    await page.click('#facts summary');
    check(await page.$$eval('#facts li', (els, facts) => JSON.stringify(els.map(el => el.textContent)) === JSON.stringify(facts), expectedFacts) && await page.$eval('#facts', el => el.open), `${prefix} 판단에 쓰는 사실 다시 펼침`);
    await page.click('#facts summary');
    const hidden = await fixture(0);
    if (hidden.affected) {
      await page.click(`#field .person[data-id="${hidden.affected}"]`);
      check(await page.textContent('#toast') === '발현자는 보인자가 아니다. 열성 대립유전자만 가진다.', `${prefix} 숨긴 방식은 발현자 토스트로 드러나지 않음`);
    }
    await page.click('#judge');
    check(await page.textContent('#toast') === '유전 방식을 먼저 고른다' && await page.isEnabled('#face'), `${prefix} 유전 방식 미선택 판정 차단`);
    await page.click(`[data-mode="${hidden.mode === 'x' ? 'auto' : 'x'}"]`);
    await tapIds(hidden.normal); await page.click('#judge');
    const modeText = await page.textContent('#result .mode-reason');
    check(modeText.includes('모순') && modeText.includes('사실 ') && (await page.textContent('#result')).includes('유전 방식이 맞지 않는다'), `${prefix} 틀린 방식의 모순·사실·제목`);
    check((await page.textContent('#result .chosen-mode')).includes(hidden.mode === 'x' ? '상염색체 유전' : 'X 염색체 유전')
      && await page.$$eval('[data-mode]', els => els.every(b => b.disabled)), `${prefix} 고른 방식 결과 표시·고르기 꺼짐`);
    check(await page.$eval('#result .result', el => el.firstElementChild.classList.contains('mode-reason'))
      && await page.$$eval('#result li', els => els.every(el => !el.textContent.includes('모순이므로'))), `${prefix} 방식 판단은 결과 맨 위 한 번`);
    check(await verdictGeometry(), `${prefix} 정상인 모두 표시한 판정 기호·다른 고리·번호 충돌 없음`);
    await page.click('#show-solution');
    for (const [i, step] of hidden.walk.entries()) {
      const emphasized = await page.$$eval('#field .proof-ring', els => els.map(el => el.parentElement.dataset.id).sort());
      const cards = await page.$$eval('#clues .card-btn.active', els => els.map(el => Number(el.dataset.card)).sort());
      check(JSON.stringify(emphasized) === JSON.stringify([...step.people].sort()) && JSON.stringify(cards) === JSON.stringify([...step.cards].sort())
        && await page.textContent('#step-text') === step.text, `${prefix} 풀이 ${i + 1} 사람·카드·문장 일치`);
      if (i + 1 < hidden.walk.length) await page.click('#next-step');
    }
    await page.click('#prev-step'); await page.click('#next-step');
    await page.click('#judge');
    const hidden2 = await fixture(1); await page.click(`[data-mode="${hidden2.mode}"]`); await page.click('#judge');
    check((await page.textContent('#field')).includes('!') && await verdictGeometry(), `${prefix} 놓침 ! 기호 충돌 없음`);
    check(await page.$$eval('#field .person', els => els.filter(el => el.querySelector('.verdict')?.textContent.includes('!')).every(el => el.getAttribute('aria-label').includes('판정 결과 놓침'))), `${prefix} 판정 뒤 놓침을 접근성 이름으로 읽음`);
    await page.click('#judge');
    for (let i = 2; i < 4; i++) { const f = await fixture(i); await page.click(`[data-mode="${f.mode}"]`); await tapIds(f.must); await page.click('#judge'); await page.click('#judge'); }
    check((await page.textContent('#overlay')).includes('유전 방식을 맞힌 문제 3/4.') && !(await page.textContent('#overlay')).includes('문턱'), `${prefix} 도전 2 결과에는 방식 정답 수만 표시`);
    // 고정 시드는 새로 열어도 같은 문제이며 실제 기록에서 제외 표시를 보존한다.
    await page.evaluate(() => { const data = window.Arcade.data(); data.games.pedigree.plays = []; localStorage.setItem('bioArcade.v1', JSON.stringify(data)); });
    await page.goto('file://' + path.join(root, 'games/pedigree/index.html') + '?seed=123');
    await page.click('#ar-start'); await page.click('#choose-1');
    const fixed = await fixture(0);
    await page.click(`#field .person[data-id="${fixed.affected}"]`);
    check(await page.textContent('#toast') === '발현한 남성은 보인자가 아니다. 하나뿐인 X 염색체에 색맹 대립유전자가 있다(XᵃY).', `${prefix} 도전 1 색맹 남성 토스트 용어`);
    await tapIds([fixed.maybe[0]]); await page.click('#judge');
    check((await page.textContent('#result')).includes('가계도와 자료로는 색맹 대립유전자가 있는지 정할 수 없는데 표시했다 — 지뢰!'), `${prefix} 도전 1 색맹일 수도 있는 사람의 오표시 문장`);
    await page.reload(); await page.click('#ar-start'); await page.click('#choose-1');
    check((await fixture(0)).publicShape === fixed.publicShape && await page.getAttribute('#stage', 'data-seed') === '123'
      && await page.getAttribute('#stage', 'data-avoid') === '' && await page.isVisible('#practice'), `${prefix} seed=123 같은 묶음·연습 표시`);
    for (let i = 0; i < 4; i++) {
      const f = await fixture(i);
      if (i === 2) check(f.mode === 'x' && f.tests > 0
        && await page.$$eval('#clues table thead th', els => els.map(el => el.textContent).join('|') === '사람|색맹 대립유전자')
        && await page.$$eval('#clues table tbody td', els => els.length > 0 && els.every(el => el.textContent === '없음')), `${prefix} 도전 1 X 검사 표 색맹 대립유전자·없음`);
      await tapIds(f.must); await page.click('#judge'); await page.click('#judge');
    }
    check(await page.evaluate(() => { const r = window.Arcade.data().games.pedigree.plays.at(-1), d = r.detail; return d.eligible === false && d.fixedSeed === true && d.seed === 123 && !('cleared' in r) && !('cleared' in d) && d.problems.every(p => /^[0-9a-f]{8}$/.test(p.shapeId)) && !('witness' in d) && !/"(AA|Aa|aa|AY|aY)"/.test(JSON.stringify(d)); }), `${prefix} 고정 문제 eligible false·cleared 없음·유전자형 제외`);
    check((await page.textContent('#overlay')).includes('연습용 고정 문제라 도전 2를 여는 기록에 넣지 않는다.'), `${prefix} 고정 연습은 해금 기록에서 제외한다고 안내`);
    const fixedRef = await referenceClues();
    check(fixedRef.cards > 0 && fixedRef.matching && fixedRef.conditions && fixedRef.tests && fixedRef.noAnswers, `${prefix} 카드가 있는 고정 마지막 문제의 축소본 자료 유지`);
    await page.screenshot({ path: path.join(out, `pedigree-${prefix.replace(/[^\w-]/g, '-')}-challenge.png`) });
    await page.click('#ar-retry'); check(await page.isDisabled('#choose-2'), `${prefix} 고정 문제 완전 해결 뒤에도 도전 2 잠김`);
    // 뒤의 작은 화면 도전 2 검사를 위한 가상 해금 기록이다.
    await page.evaluate(() => { const data = window.Arcade.data(); data.games.pedigree.plays.push({ detail: { kind: 'challenge', level: 1, cleared: true } }); localStorage.setItem('bioArcade.v1', JSON.stringify(data)); });
  }

  // 카드 ②가 판정 줄 뒤에 가려지거나 방식 고르기가 화면 밖이면 잡는다.
  // 360×640, 도전마다 무작위 묶음 5개 × 문제 4개를 첫 화면에서 측정한다.
  async function firstScreenChecks(page) {
    for (const challenge of [1, 2]) {
      const seeds = new Set();
      for (let bundle = 0; bundle < 5; bundle++) {
        await page.goto('file://' + path.join(root, 'games/pedigree/index.html'));
        await page.click('#ar-start'); await page.click(`#choose-${challenge}`);
        if (challenge === 2) await page.click('#challenge-start');
        seeds.add(await page.getAttribute('#stage', 'data-seed'));
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const view = await page.evaluate(i => {
            const rect = el => el.getBoundingClientRect();
            const actions = rect(document.getElementById('actions'));
            const judge = rect(document.getElementById('judge'));
            const notice = document.getElementById('more-clues'), n = rect(notice);
            const rows = [...document.querySelectorAll('#clues .conditions li, #clues [data-card], #clues table tr, #clues caption')];
            const modes = [...document.querySelectorAll('[data-mode]')];
            return { scroll: scrollY, svgAbove: rect(document.querySelector('#field svg')).bottom <= actions.top + .5,
              firstVisible: rect(rows[0]).top >= 0 && rect(rows[0]).bottom <= actions.top + .5,
              allAbove: rows.length > 0 && rows.every(el => rect(el).bottom <= actions.top + .5),
              notice: !notice.hidden && notice.textContent.includes('아래에 있다') && n.top >= 0 && n.bottom <= judge.top && n.bottom <= innerHeight,
              judgeVisible: judge.top >= 0 && judge.bottom <= innerHeight && judge.height >= 44 && judge.width >= 44
                && document.getElementById('judge').scrollWidth <= document.getElementById('judge').clientWidth,
              modesVisible: modes.length === 2 && modes.every(el => { const r = rect(el); return r.top >= 0 && Math.abs(r.top - judge.top) <= 1 && Math.abs(r.bottom - judge.bottom) <= 1 && r.bottom <= innerHeight
                && r.height >= 44 && r.width >= 44 && el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight
                && el.hasAttribute('aria-pressed') && el.getAttribute('aria-label') === (el.dataset.mode === 'auto' ? '상염색체 유전 고르기' : 'X 염색체 유전 고르기'); }),
              touch: [...document.querySelectorAll('#clues [data-card], #field .touch-target')].every(el => { const r = rect(el); return r.width >= 44 && r.height >= 44; }),
              noOverflow: document.documentElement.scrollWidth <= innerWidth,
              typography: ['body', '.lvl', '.clues', '.card-btn', '#judge', '.face'].every(selector =>
                [...document.querySelectorAll(selector)].every(el => parseFloat(getComputedStyle(el).fontSize) >= 15))
                && ['.playhud', '.legend'].every(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) >= 12)
                && getComputedStyle(document.body).wordBreak === 'keep-all' && getComputedStyle(document.body).overflowWrap === 'break-word',
              mode: window.Pedigree.makeBundle(Number(document.getElementById('stage').dataset.seed), Number(document.getElementById('stage').dataset.challenge),
                { avoid: (document.getElementById('stage').dataset.avoid || '').split(',').filter(Boolean) })[i].mode };
          }, i);
          const label = `360×640 도전 ${challenge} 묶음 ${bundle + 1} 문제 ${i + 1}`;
          check(view.scroll === 0 && view.svgAbove && view.firstVisible && view.judgeVisible && (view.allAbove || view.notice), `${label} 자료 전체 또는 아래 자료 안내·판정 줄`);
          check(view.touch && view.noOverflow && view.typography, `${label} 터치 44px·본문 15px·보조 12px·낱말 줄바꿈·가로 넘침 없음`);
          if (challenge === 2) {
            check(view.modesVisible, `${label} 고르기·판정 한 줄·44px·글자 잘림 없음·온전한 접근성 이름`);
            await page.click(`[data-mode="${view.mode}"]`);
            check(await page.getAttribute(`[data-mode="${view.mode}"]`, 'aria-pressed') === 'true', `${label} 고른 방식 눌림 상태`);
          }
          await page.click('#judge'); await page.click('#judge');
        }
        const record = await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1));
        check(record.detail.problems.length === 4 && record.detail.problems.every(p => Number.isInteger(p.maxDepth) && p.maxDepth >= 1 && /^[0-9a-f]{8}$/.test(p.shapeId))
          && !('witness' in record.detail) && !JSON.stringify(record).includes('witness') && !/"(AA|Aa|aa|AY|aY)"/.test(JSON.stringify(record.detail)), `360×640 도전 ${challenge} 묶음 ${bundle + 1} 유전 깊이·8자리 shapeId·유전자형 제외`);
      }
      check(seeds.size === 5, `360×640 도전 ${challenge} 서로 다른 무작위 묶음 5개`);
    }
  }

  async function pedigreeChecks(page, prefix, height) {
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      await page.goto('file://' + path.join(root, 'games/pedigree/index.html'));
      await page.click('#ar-start');
      check(await page.isVisible('#chooser') && await page.isDisabled('#choose-2'), `${prefix} 판 고르기·빈 도전 기록 잠금`);
      await page.click('#choose-basic');
      check(await page.getAttribute('#mines', 'role') === 'status' && (await page.getAttribute('#mines', 'aria-label')).startsWith('남은 보인자 수'), `${prefix} 남은 보인자 수를 상태로 읽음`);
      for (let level = 0; level < 4; level++) {
        const fixture = await page.evaluate(i => {
          const L = window.Pedigree.LEVELS[i], sol = window.Pedigree.solve(L);
          return { correct: sol.must[0], wrong: L.people.find(p => !p.affected && !sol.must.includes(p.id))?.id,
            affected: L.people.find(p => p.affected).id, people: L.people };
        }, level);
        // pedigree-1 / Q8: 인물은 버튼으로 노출하고 성별·발현·표시 상태와 위치를 읽는다.
        check(await page.$$eval('#field .person', (els, people) => els.length === people.length && els.every(el => {
          const p = people.find(p => p.id === el.dataset.id), label = el.getAttribute('aria-label') || '';
          const position = people.filter(q => q.gen === p.gen).sort((a, b) => a.x - b.x).findIndex(q => q.id === p.id) + 1;
          return el.getAttribute('role') === 'button' && el.getAttribute('tabindex') === '0'
            && label === `${p.gen + 1}세대 왼쪽에서 ${position}번째, ${p.sex === 'M' ? '남성' : '여성'}, ${p.affected ? '형질 발현' : '형질 미발현'}, 표시 없음`;
        }), fixture.people), `${prefix} pedigree-1 ${level + 1}단계 인물 역할·이름`);
        check(await page.locator('#field .person-number').count() === 0, `${prefix} 기본 ${level + 1}단계 번호 글자 없음`);
        check(await page.$eval('#field svg', s => s.getAttribute('role') === 'group'), `${prefix} pedigree-1 SVG가 인물 버튼을 숨기지 않음`);
        // pedigree-6: 인물의 투명 터치 영역을 50단위로 넓힌다(390px 화면에서 44px 이상).
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
        check((await page.getAttribute(person, 'aria-label')).includes('판정 결과 맞힘') && (!fixture.wrong || (await page.getAttribute(`#field .person[data-id="${fixture.wrong}"]`, 'aria-label')).includes('판정 결과 잘못 표시')), `${prefix} 판정 뒤 맞힘·잘못 표시 접근성 이름`);
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
          noAnswers: !ref.querySelector('.verdict, .verdict-ring, .proof-ring, [stroke-dasharray], .carrier-fill, [stroke="#1f8a4c"], [stroke="#c0392b"], [stroke="#e69138"], ul, li, [role="button"], [tabindex]'),
          alongside: ref.nextElementSibling?.classList.contains('refl'),
          affected: L.people.every(p => ref.querySelector(`[data-id="${p.id}"] > ${p.sex === 'M' ? 'rect:not(.touch-target)' : 'circle'}`) && getComputedStyle(ref.querySelector(`[data-id="${p.id}"] > ${p.sex === 'M' ? 'rect:not(.touch-target)' : 'circle'}`)).fill === (p.affected ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)')) };
      });
      check(reference.present && JSON.stringify(reference.ids) === JSON.stringify(reference.expected) && reference.noAnswers && reference.alongside && reference.affected && await page.locator('.pedigree-reference .person-number').count() === 0, `${prefix} pedigree-2 번호·표시·정답 없는 4단계 축소본과 원래 형질 유지`);
      check((await page.textContent('#overlay')).includes('잘못 표시') && (await page.textContent('#overlay')).includes('과학적 추론은 근거가 있는 곳까지만 말한다.'), `${prefix} 기본 판 오표시 결과 원본 문구`);
      await page.fill('#ar-refl', '가족의 형질을 근거로 판단했다.'); await page.waitForTimeout(500);
      check(await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1).reflection === '가족의 형질을 근거로 판단했다.'), `${prefix} D-053 축소본 추가 뒤 서술 답 자동 저장 유지`);
      await page.screenshot({ path: path.join(out, `pedigree-${height}-reflection.png`) });
      check(await noOverflow(), `${prefix} 가계도 결과 카드 가로 넘침 없음`);
      const firstBasic = await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1).detail);
      check(firstBasic.kind === 'basic' && firstBasic.level === 0 && firstBasic.eligible === true, `${prefix} 기본 판 첫 기록 eligible true`);
      await page.click('#ar-retry');
      check(await page.isVisible('#chooser') && await page.textContent('#timer') === '000' && await page.locator('.pedigree-reference:visible').count() === 0, `${prefix} pedigree-7 판 고르기 복귀·즉시 초기화`);
      await page.click('#choose-basic');
      for (let i = 0; i < 4; i++) {
        const ids = await page.evaluate(i => window.Pedigree.solve(window.Pedigree.LEVELS[i]).must, i);
        for (const id of ids) await page.click(`#field .person[data-id="${id}"]`);
        await page.click('#judge'); await page.click('#judge');
      }
      check(await page.evaluate(() => window.Arcade.data().games.pedigree.plays.at(-1).detail.eligible === false), `${prefix} 기본 판 두 번째 eligible false`);
      check((await page.textContent('#overlay')).includes('근거가 있는 곳까지만 판단했다. 훌륭한 추론이다.'), `${prefix} 기본 판 정답 결과 원본 문구`);
      await page.click('#ar-retry');
      await challengeChecks(page, prefix);
  }

  try {
    // 순수 계산 검사(별 경계, 고정 시드 해금, 회피 목록 등)는 기본 실행에서도 먼저 돌린다.
    pedigreeCalculations();
    if (process.argv.includes('--pedigree-logic-only')) return;
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
      // mendel-5 / D-054 Q6: 첫 추론에서 RRYY 오답을 고르면 실제 부모 생식세포·자손을 함께 설명한다.
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

      await pedigreeChecks(page, prefix, height);
      await context.close();
    }
    // 가장 작은 화면은 가계도만 추가로 확인한다. 멘델의 기존 검사 범위는 유지한다.
    const small = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true,
      ...(reducedMotion ? { reducedMotion: 'reduce' } : {}) });
    const smallPage = await small.newPage(); watchErrors(smallPage);
    await smallPage.goto('file://' + path.join(root, 'games/pedigree/index.html'));
    await smallPage.evaluate(() => window.Arcade.setStudent({ id: '20315', name: '테스트' }));
    await pedigreeChecks(smallPage, '360×640', 640);
    await firstScreenChecks(smallPage);
    await small.close();
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
