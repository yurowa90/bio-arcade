// 휴대폰 화면(390×844, 터치)에서 처음부터 두 체육관까지 실제로 플레이한다.
const playwright = require(process.env.PW || 'playwright');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
const path = require('path');
const fs = require('fs');
const { speciesWeight } = require('../games/quest/js/main');
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
  const pageErrors = [];
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
    p.on('pageerror', e => pageErrors.push(e.message));
    p.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text(), url = m.location().url || '';
      if (isFileManifest(url) && manifestMessages.has(text)) evidence.manifestFailed = true;
      consoleErrors.push({ text, url, evidence });
    });
  };
  const finishErrors = () => {
    errors.push(...pageErrors);
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
  const questURL = 'file://' + path.resolve(__dirname, '../games/quest/index.html');
  // 문·표지판·출구·풀숲은 생성된 지도에서 찾는다. 기본 접근 방향은 남쪽에서 위를 보는 것이다.
  const approach = (mapId, kind, value) => page.evaluate(({ mapId, kind, value }) => {
    const m = window.QuestMaps.MAPS[mapId], walk = new Set('.=YFPgfB:,;');
    const dirs = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]];
    const targets = kind === 'door' ? Object.entries(m.doors).filter(([, door]) => door === value).map(([key]) => key.split(',').map(Number))
      : kind === 'sign' ? Object.entries(m.signs).filter(([, lines]) => lines.some(line => line.includes(value))).map(([key]) => key.split(',').map(Number))
        : kind === 'exit' ? m.exits.filter(e => e.to === value).map(e => [e.x, e.y])
          : m.rows.flatMap((row, y) => [...row].flatMap((ch, x) => ch === value ? [[x, y]] : []));
    for (const [x, y] of targets) for (const [dir, dx, dy] of dirs) {
      const px = x - dx, py = y - dy;
      if (!walk.has(m.rows[py]?.[px]) || m.doors[`${px},${py}`] || m.npcs.some(n => n.x === px && n.y === py) || m.exits.some(e => e.x === px && e.y === py)) continue;
      window.__bq.warp(mapId, px, py); window.__bq.player.dir = dir;
      return { dir, x, y, fromX: px, fromY: py };
    }
    throw new Error(`접근할 수 있는 칸이 없음: ${mapId} ${kind} ${value}`);
  }, { mapId, kind, value });
  const step = async dir => {
    const before = await page.evaluate(() => ({ x: window.__bq.player.x, y: window.__bq.player.y, map: window.__bq.S.map }));
    await page.dispatchEvent(`.dir.${dir}`, 'pointerdown');
    try {
      await page.waitForFunction(p => {
        const q = window.__bq;
        return q.player.x !== p.x || q.player.y !== p.y || q.S.map !== p.map || q.mode !== 'walk';
      }, before, { timeout: 2000 });
    } finally { await page.dispatchEvent(`.dir.${dir}`, 'pointerup'); }
    await page.waitForFunction(() => !window.__bq.player.moving, null, { timeout: 2000 });
  };
  const enterDoor = async (mapId, door) => { const p = await approach(mapId, 'door', door); await step(p.dir); };
  const keyboardChoices = async p => {
    for (let i = 0; i < 40 && await p.evaluate(() => window.__bq.mode === 'dialog') && !(await p.$('#dialog-choices button')); i++) {
      await p.keyboard.press('Enter'); await p.waitForTimeout(40);
    }
    return p.$$eval('#dialog-choices button', bs => bs.map(b => b.textContent));
  };
  await page.goto('file://' + path.resolve(__dirname, '../games/quest/index.html'));
  await page.screenshot({ path: `${out}/01-title.png` });
  // 화면에 실제로 보이는지: hidden 속성이 아니라 계산된 display와 isVisible로 판단한다(CSS가 hidden을 덮는 함정 대비)
  const shown = sel => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }, sel);
  check('저장이 없으면 이어하기 버튼이 보이지 않음', !(await shown('#btn-continue')));
  const titleText = await page.textContent('#title');
  check('시작 화면은 신항고 생태 도감이며 옛 지명·호칭이 없음', titleText.includes('신항고 생태 도감') && !/초록섬|한결 박사/.test(titleText));
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
      // 타자 효과가 진행 중이면(다음 줄 표시 숨김, 선택지 없음) 한 번 눌러 줄을 끝까지 보인다
      if ((await page.$('#dialog-next[hidden]')) && !(await page.$('#dialog-choices button'))) { await page.click('#dialog'); await page.waitForTimeout(30); }
      const t = await page.textContent('#dialog-text');
      if (lines[lines.length - 1] !== t) lines.push(t);
      if (await page.$('#dialog-choices button')) break;
      await page.click('#dialog'); await page.waitForTimeout(30);
    }
    return lines;
  }
  await page.waitForTimeout(300);
  // 인트로는 키보드만으로 진행한다. 남학생을 고른 뒤 두 번째 파트너를 고른다.
  const avatarChoices = await keyboardChoices(page);
  check('처음 시작에 남학생·여학생 선택지가 있음', avatarChoices.join() === '남학생,여학생');
  await page.screenshot({ path: `${out}/02-avatar.png` });
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const partnerChoices = await keyboardChoices(page);
  check('남학생 선택이 m으로 저장되고 파트너 고르기로 이어짐',
    (await page.evaluate(() => window.__bq.S.avatar)) === 'm' && (await questSave()).avatar === 'm' &&
    partnerChoices.join() === (await page.evaluate(() => window.GameData.PARTNERS.map(p => p.name).join())));
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
  // 여학생은 별도 가상 기기에서 고른다. 선택 직후 저장과 이어하기도 확인한다.
  const avatarCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const avatarPage = await avatarCtx.newPage();
  if (reducedMotion) await mediaReady.get(avatarPage);
  watchErrors(avatarPage);
  await avatarPage.goto(questURL); await avatarPage.click('#btn-new'); await keyboardChoices(avatarPage);
  await avatarPage.keyboard.press('Tab'); await avatarPage.keyboard.press('Enter'); await avatarPage.waitForTimeout(100);
  const femalePartners = await keyboardChoices(avatarPage);
  check('여학생 선택이 f로 저장되고 파트너 고르기로 이어짐', await avatarPage.evaluate(() =>
    window.__bq.S.avatar === 'f' && JSON.parse(localStorage.getItem('bioQuest.v1')).avatar === 'f') && femalePartners.join() === partnerChoices.join());
  await avatarPage.keyboard.press('Enter');
  for (let i = 0; i < 40 && await avatarPage.evaluate(() => window.__bq.mode === 'dialog'); i++) {
    await avatarPage.keyboard.press('Enter'); await avatarPage.waitForTimeout(40);
  }
  await avatarPage.reload(); await avatarPage.click('#btn-continue');
  check('여학생 아바타는 이어하기 뒤에도 유지', await avatarPage.evaluate(() => window.__bq.S.avatar === 'f' && window.__bq.mode === 'walk'));
  await avatarCtx.close();
  // 가상 저장으로 걷는 화면을 연 뒤, 미니맵을 펼친 상태에서 인트로 대화를 다시 연다.
  for (const viewport of [{ width: 375, height: 812 }, { width: 360, height: 640 }]) {
    const dialogCtx = await createContext({ viewport, hasTouch: true, isMobile: true });
    const dialogPage = await dialogCtx.newPage();
    if (reducedMotion) await mediaReady.get(dialogPage);
    watchErrors(dialogPage);
    await dialogPage.addInitScript(saved => localStorage.setItem('bioQuest.v1', JSON.stringify(saved)), await questSave());
    dialogPage.on('dialog', d => d.accept());
    await dialogPage.goto(questURL); await dialogPage.click('#btn-continue');
    await dialogPage.click('#minimap-toggle');
    const miniShown = () => dialogPage.evaluate(() => {
      const tools = document.getElementById('map-tools'), mini = document.getElementById('minimap');
      return getComputedStyle(tools).display !== 'none' && tools.getClientRects().length > 0 &&
        getComputedStyle(mini).display !== 'none' && mini.getClientRects().length > 0;
    });
    check(`${viewport.width}px 대화 전 미니맵 펼침`, await miniShown() && await dialogPage.getAttribute('#minimap-toggle', 'aria-expanded') === 'true');
    // 타이틀의 시작 버튼 핸들러로 인트로를 다시 열며 미니맵 펼침 상태는 그대로 둔다.
    await dialogPage.dispatchEvent('#btn-new', 'click');
    await keyboardChoices(dialogPage); await dialogPage.keyboard.press('Enter');
    const choices = await keyboardChoices(dialogPage);
    const dialogGeometry = await dialogPage.evaluate(() => {
      const tools = document.getElementById('map-tools'), dialog = document.getElementById('dialog');
      const bounds = dialog.getBoundingClientRect();
      return { hidden: getComputedStyle(tools).display === 'none' && tools.getClientRects().length === 0,
        above: Number(getComputedStyle(dialog).zIndex) > Number(getComputedStyle(tools).zIndex),
        clear: [...document.querySelectorAll('#dialog-choices button')].every(b => {
          const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom &&
            b.contains(document.elementFromPoint(x, y));
        }) };
    });
    check(`${viewport.width}px 파트너 대화는 미니맵을 숨기고 모든 선택지 가운데가 가려지지 않음`,
      choices.join() === partnerChoices.join() && dialogGeometry.hidden && dialogGeometry.above && dialogGeometry.clear, JSON.stringify(dialogGeometry));
    await dialogPage.screenshot({ path: `${out}/dialog-minimap-${viewport.width}.png` });
    await dialogPage.keyboard.press('Enter');
    for (let i = 0; i < 40 && await dialogPage.evaluate(() => window.__bq.mode === 'dialog'); i++) {
      await dialogPage.keyboard.press('Enter'); await dialogPage.waitForTimeout(40);
    }
    check(`${viewport.width}px 대화 종료 뒤 이전 미니맵 펼침 상태 복원`,
      await dialogPage.evaluate(() => window.__bq.mode === 'walk' && !document.getElementById('screen').classList.contains('dialog-open')) &&
      await miniShown() && await dialogPage.getAttribute('#minimap-toggle', 'aria-expanded') === 'true');
    await dialogCtx.close();
  }
  check('인물은 mapdata의 NPC 목록 그대로 사용', await page.evaluate(() => window.__bq.npcs === window.QuestMaps.MAPS[window.__bq.S.map].npcs));
  check('학교 지도 이름이 HUD에 표시됨', (await page.textContent('#hud-place')) === '신항고와 정원');
  check('390×844 미니맵은 처음에 접힘', !(await shown('#minimap')) && await page.getAttribute('#minimap-toggle', 'aria-expanded') === 'false');
  await page.click('#minimap-toggle');
  const miniGeometry = await page.evaluate(() => {
    const map = document.getElementById('map').getBoundingClientRect(), mini = document.getElementById('minimap').getBoundingClientRect();
    const cx = map.left + map.width / 2, cy = map.top + map.height / 2;
    // 가운데 한 칸의 면적까지 비워 두어 주인공을 가리지 않는지 확인한다.
    const hw = map.width / (document.getElementById('map').width / 16) / 2;
    const hh = map.height / (document.getElementById('map').height / 16) / 2;
    return { inside: mini.left >= map.left && mini.right <= map.right && mini.top >= map.top && mini.bottom <= map.bottom,
      corner: mini.left >= cx && mini.top < cy && map.right - mini.right <= 12,
      clear: mini.right <= cx - hw || mini.left >= cx + hw || mini.bottom <= cy - hh || mini.top >= cy + hh };
  });
  check('편 미니맵은 지도 창 안 오른쪽 위에 있고 주인공 칸을 가리지 않음', await shown('#minimap') && await page.getAttribute('#minimap-toggle', 'aria-expanded') === 'true' && miniGeometry.inside && miniGeometry.corner && miniGeometry.clear, JSON.stringify(miniGeometry));
  await page.screenshot({ path: `${out}/03-minimap.png` });
  await page.click('#minimap-toggle');
  // 카메라가 지도 끝에서 멈추면 주인공이 가운데를 벗어난다. 출구 칸도 실제 화면 좌표로 검사한다.
  for (const width of [375, 480]) {
    await page.setViewportSize({ width, height: 844 });
    if (!(await shown('#minimap'))) await page.click('#minimap-toggle');
    for (const [mapId, location] of [['school', 'start'], ['school', 'exit'], ['park', 'exit']]) {
      await page.evaluate(({ mapId, location }) => {
        const m = window.QuestMaps.MAPS[mapId], p = location === 'start' ? m.start : m.exits[0];
        window.__bq.warp(mapId, p.x, p.y);
      }, { mapId, location });
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => {
        const q = window.__bq, m = window.QuestMaps.MAPS[q.S.map];
        const canvas = document.getElementById('map'), bounds = canvas.getBoundingClientRect();
        const scale = bounds.width / canvas.width, px = q.player.x * 16, py = q.player.y * 16;
        const cx = Math.round(Math.max(0, Math.min(px - 80, m.width * 16 - canvas.width)));
        const cy = Math.round(Math.max(0, Math.min(py - 64, m.height * 16 - canvas.height)));
        const player = { left: bounds.left + (px - cx) * scale, top: bounds.top + (py - cy) * scale };
        player.right = player.left + 16 * scale; player.bottom = player.top + 16 * scale;
        const mini = document.getElementById('minimap').getBoundingClientRect();
        const overlap = r => r.left < mini.right && r.right > mini.left && r.top < mini.bottom && r.bottom > mini.top;
        return { clear: !overlap(player), hudClear: [...document.querySelectorAll('#hud > span')].every(el => !overlap(el.getBoundingClientRect())),
          inside: mini.left >= bounds.left && mini.right <= bounds.right && mini.top >= bounds.top && mini.bottom <= bounds.bottom,
          side: document.getElementById('map-tools').classList.contains('mini-left') ? 'left' : 'right' };
      });
      check(`${width}px ${mapId} ${location} 미니맵은 주인공·HUD와 겹치지 않음`, geometry.clear && geometry.hudClear && geometry.inside, JSON.stringify(geometry));
      await page.screenshot({ path: `${out}/minimap-${width}-${mapId}-${location}.png` });
    }
    await page.click('#minimap-toggle');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  check('방향 버튼은 문자 글리프 없이 SVG로 표시', await page.$$eval('.dir', bs => bs.length === 4 && bs.every(b => !b.textContent.trim() && !!b.querySelector('svg use'))));
  check('낮밤 HUD는 문자 글리프 없이 SVG와 낮·밤 글자로 표시', await page.$eval('#hud-time', el => !!el.querySelector('svg use') && /^(낮|밤)$/.test(el.textContent.trim())));
  // 표지판도 좌표 대신 데이터에서 찾아 확인 버튼으로 읽는다.
  const sign = await approach('school', 'sign', '신항고 교정');
  // 옮긴 직후 걷는 중이면 확인 버튼이 무시되므로, 걷기가 끝난 뒤 누른다(부하가 큰 기기에서 생긴 간헐 실패)
  await page.waitForFunction(() => window.__bq.mode === 'walk' && !window.__bq.player.moving, null, { timeout: 2000 });
  await page.click('#btn-a'); const signLines = await readDialog(); await drain();
  check('새 교정 표지판을 읽을 수 있음', signLines.some(l => l.includes('신항고 교정')) && (await mode()) === 'walk', `${sign.x},${sign.y}`);
  for (const [from, to, name] of [['school', 'park', '저수지 생태공원'], ['park', 'school', '신항고와 정원']]) {
    const exit = await approach(from, 'exit', to); await step(exit.dir);
    check(`출구 이동 ${from} → ${to}와 HUD 이름`, (await page.evaluate(() => window.__bq.S.map)) === to && (await page.textContent('#hud-place')) === name);
  }
  // 세 풀숲 기호에서 실제 이동·걸음 조건을 거쳐 조우한다. 난수는 조우 판정에만 고정하고 복원한다.
  for (const [mapId, tile, habitat] of [['school', ':', 'campus'], ['school', ',', 'hill'], ['park', ';', 'park']]) {
    const grass = await approach(mapId, 'tile', tile);
    await page.evaluate(() => { window.__bq.S.timeMode = 'day'; window.__bq.player.stepsSinceEnc = 2; window.__questRandom = Math.random; Math.random = () => 0; });
    try { await step(grass.dir); await page.waitForFunction(() => !!document.querySelector('.species-card'), null, { timeout: 2000 }); }
    finally { await page.evaluate(() => { Math.random = window.__questRandom; delete window.__questRandom; }); }
    const encounterHabitat = await page.evaluate(() => {
      const name = document.querySelector('.species-card h3').textContent;
      const sp = window.GameData.SPECIES.find(s => s.name === name);
      return { habitat: sp.habitat, name, meta: document.querySelector('.species-card .meta').textContent, reset: window.__bq.player.stepsSinceEnc === 0 };
    });
    const habitatName = await page.evaluate(id => window.GameData.HABITATS[id].name, habitat);
    check(`풀숲 ${tile} → ${habitat} 조우와 서식지 이름표`, (await mode()) === 'panel' && encounterHabitat.habitat === habitat && encounterHabitat.meta.includes(habitatName) && encounterHabitat.reset, encounterHabitat.name);
    await page.click('#enc-run');
  }
  // 이동 검사는 생성된 학교 시작점에서 남쪽 한 칸을 확인한다.
  await page.evaluate(() => { const s = window.QuestMaps.MAPS.school.start; window.__bq.warp('school', s.x, s.y); });
  const before = await page.evaluate(() => ({ ...window.__bq.player }));
  await page.dispatchEvent('.dir.down', 'pointerdown'); await page.waitForTimeout(520); await page.dispatchEvent('.dir.down', 'pointerup');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ ...window.__bq.player }));
  check('방향 버튼으로 아래로 이동', after.y > before.y && after.x === before.x, `y ${before.y} → ${after.y}`);
  await page.screenshot({ path: `${out}/03-school.png` });
  // 같은 서식지의 식물·동물·균류가 관찰 전 같은 문장 틀로 나온다.
  for (const [habitat, ids, place] of [['campus', ['dandelion', 'sparrow', 'shaggymane'], '풀숲을'], ['park', ['waterpepper', 'carp'], '물가를']]) {
    for (const id of ids) {
      const lead = await page.evaluate(({ habitat, id }) => {
        const sp = window.GameData.SPECIES.find(s => s.id === id);
        const previous = window.__bq.S.dex[id];
        delete window.__bq.S.dex[id]; window.__bq.encounter(habitat, sp);
        const text = document.querySelector('#panel-body > p').textContent;
        const ch = sp.name.slice(-1).charCodeAt(0), object = sp.name + ((ch - 0xac00) % 28 ? '을' : '를');
        if (previous) window.__bq.S.dex[id] = previous;
        return { text, object };
      }, { habitat, id });
      check(`조우 첫 문장 ${habitat}/${id} 중립 문장`, lead.text === `${place} 살피다가 ${lead.object} 발견했다!`, lead.text);
      await page.click('#enc-run');
    }
  }
  // 조우 → 관찰
  await page.evaluate(() => window.__bq.encounter('campus'));
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
  // 먹물버섯: 무리 질문을 맞히면 카드를 가린 채 역할 질문이 이어지고, 둘 다 맞혀야 관찰이 완성된다
  const oy = await qOf('shaggymane');
  const meetShaggymane = () => page.evaluate(() => { const S = window.__bq.S; delete S.dex.shaggymane; window.__bq.encounter('campus', window.GameData.SPECIES.find(s => s.id === 'shaggymane')); });
  await page.click('#enc-ok');
  await meetShaggymane();
  await page.waitForTimeout(60);
  const oyFirst = await page.textContent('#panel-body');
  check('먹물버섯 1단계: 무리 질문, 질문 수(하나 더)는 미리 보이지 않음', oy.qs.map(Q => Q.key).join() === 'kind,role' && (await screenMatches(oy.qs[0])) && !oyFirst.includes('하나 더'), oy.qs[0].q);
  await page.click('.choice-list .btn[data-v="균류"]');
  const oyMid = await page.textContent('#panel-body');
  const oyMidMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('먹물버섯 2단계: 무리를 맞히면 역할 질문이 이어짐(카드는 계속 가림, 아직 미등록)', oyMid.includes('하나 더 관찰해 보자') && (await screenMatches(oy.qs[1])) && !/균류|분해자/.test(oyMidMeta) && !(await page.evaluate(() => window.__bq.S.dex.shaggymane.done)), oyMid.match(/맞았다![^.]*\./)?.[0] || '');
  const oyMidView = await page.evaluate(() => ({ top: document.getElementById('panel-body').scrollTop, focus: !!document.activeElement.closest('.choice-list') }));
  check('먹물버섯 2단계: 화면 맨 위에서 시작하고(맞았다 안내가 보임) 키보드 초점은 선택지에 있음', oyMidView.top === 0 && oyMidView.focus, JSON.stringify(oyMidView));
  await page.screenshot({ path: `${out}/04b-shaggymane-role.png` });
  await page.click('.choice-list .btn[data-v="소비자"]');
  const oyWrong = await page.textContent('#panel-body');
  const oyRec = await page.evaluate(() => ({ ...window.__bq.S.dex.shaggymane }));
  check('먹물버섯 2단계 오답: 정답(분해자)을 알려 주고 관찰 미완성', oyWrong.includes('아쉽다') && oyWrong.includes('정답은 “분해자') && !oyRec.done && oyRec.wrong === 1 && oyRec.tries === 2, JSON.stringify(oyRec));
  // quest-2: 계속 탐사에 초점이 있어도 오답 해설 전체가 본문 맨 위에 보인다.
  const feedbackVisible = () => page.evaluate(() => {
    const body = document.getElementById('panel-body'), fb = body.querySelector('.feedback');
    const b = body.getBoundingClientRect(), f = fb.getBoundingClientRect();
    return body.scrollTop === 0 && f.top >= b.top && f.bottom <= b.bottom && document.activeElement.id === 'enc-ok';
  });
  check('quest-2 오답 직후 해설이 가려지지 않음', await feedbackVisible());
  await page.click('#enc-ok');
  await meetShaggymane();
  await page.waitForTimeout(60);
  await page.click('.choice-list .btn[data-v="균류"]');
  await page.click('.choice-list .btn[data-v="분해자"]');
  check('먹물버섯: 무리·역할을 모두 맞히면 관찰 성공', (await page.textContent('#panel-body')).includes('관찰 성공') && (await page.evaluate(() => window.__bq.S.dex.shaggymane.done)));
  check('quest-2 정답 직후 성공 안내가 가려지지 않음', await feedbackVisible());
  // 생물 전체: 실제 함수가 내는 질문 종류와 정답 분포(질문 종류만 보고 답을 짐작할 수 없어야 한다)
  const nSpecies = await page.evaluate(() => window.GameData.SPECIES.length);
  check('지역 생물 목록은 28종', nSpecies === 28);
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
  await page.evaluate(() => { const S = window.__bq.S; delete S.dex.bluemold; window.__bq.encounter('hill', window.GameData.SPECIES.find(s => s.id === 'bluemold')); });
  await page.waitForTimeout(60);
  const bmMeta = await page.$eval('#panel-body .species-card .meta', el => el.textContent);
  check('푸른곰팡이: 첫 질문이 역할 질문(정답 분해자)이고 관찰 전 카드에 무리·역할 칩이 없음', bm.qs.map(Q => Q.key).join() === 'role' && bm.qs[0].answer === '분해자' && (await screenMatches(bm.qs[0])) && !/균류|분해자/.test(bmMeta), bm.qs[0].q);
  await page.click('.choice-list .btn[data-v="분해자"]');
  check('푸른곰팡이: 분해자를 고르면 관찰 성공·도감 등록', (await page.textContent('#panel-body')).includes('관찰 성공') && (await page.evaluate(() => window.__bq.S.dex.bluemold.done)));
  await page.screenshot({ path: `${out}/05b-bluemold.png` });
  await page.click('#enc-ok');
  // 생태 지도는 메뉴를 통해 연다. 각 칸의 이름·상태를 실제 도감 기록과 대조한다.
  await page.evaluate(() => window.__bq.encounter('park', window.GameData.SPECIES.find(s => s.id === 'waterpepper')));
  for (const Q of (await qOf('waterpepper')).qs) await page.click(`.choice-list .btn[data-v="${Q.answer}"]`);
  await page.click('#enc-ok'); await page.click('#btn-b'); await page.click('#m-eco');
  check('메뉴에서 생태 지도가 열림', (await mode()) === 'panel' && (await page.textContent('#panel-title')) === '생태 지도');
  const eco = await page.evaluate(() => {
    const { SPECIES, HABITATS } = window.GameData, dex = window.__bq.S.dex;
    return [...document.querySelectorAll('.eco-group')].map(group => {
      const name = group.querySelector('h3').textContent, id = Object.keys(HABITATS).find(id => HABITATS[id].name === name);
      const species = SPECIES.filter(s => s.habitat === id), cells = [...group.querySelectorAll('.eco-cell')];
      return { name, count: cells.length, observed: cells.filter(el => el.classList.contains('done')).map(el => el.querySelector('span:not(.eco-dot)').textContent),
        unknown: cells.filter(el => !el.classList.contains('done') && !el.classList.contains('seen')).length,
        matches: cells.length === species.length && cells.every((el, i) => {
          const sp = species[i], r = dex[sp.id], text = el.querySelector('span:not(.eco-dot)').textContent;
          return text === (r ? sp.name : '?') && el.classList.contains('done') === !!r?.done &&
            el.classList.contains('seen') === (!!r && !r.done) && el.querySelector('small').textContent === (r?.done ? '관찰 완료' : r ? '관찰 전' : '아직 못 만남') &&
            !!el.querySelector('use[href="#q-sun"]') === (sp.time === 'day') && !!el.querySelector('use[href="#q-moon"]') === (sp.time === 'night');
        }) };
    });
  });
  check('생태 지도 세 구역의 칸 수 합은 28', eco.map(g => g.name).join() === '학교 단지,학교 뒷산,저수지 생태공원' && eco.reduce((n, g) => n + g.count, 0) === 28, eco.map(g => `${g.name} ${g.count}`).join(' / '));
  check('생태 지도는 구역마다 관찰한 생물 이름과 못 만난 ? 칸을 표시', eco.every(g => g.matches && g.observed.length > 0 && g.unknown > 0), eco.map(g => `${g.name}: ${g.observed.join(', ')}`).join(' / '));
  check('생태 지도에 OpenStreetMap 출처 표시', (await page.textContent('.eco-credit')).includes('ⓒ OpenStreetMap'));
  for (const width of [360, 375]) {
    await page.setViewportSize({ width, height: 844 });
    const labels = await page.$$eval('.eco-label b, .eco-label span, .eco-distance, .eco-north', els => els.map(el => ({
      text: el.textContent, size: parseFloat(getComputedStyle(el).fontSize), width: el.getBoundingClientRect().width,
    })));
    check(`${width}px 생태 지도 이름표 실제 글자 10px 이상`, labels.length === 8 && labels.every(l => l.size >= 10), JSON.stringify(labels));
    await page.screenshot({ path: `${out}/eco-label-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const locked = await page.$$eval('.eco-regions li', els => els.filter(el => el.textContent.includes('준비 중')).map(el => ({ text: el.textContent, lock: !!el.querySelector('svg use[href="#q-lock"]') })));
  check('평택 탐사 지역의 준비 중 지역은 잠금 SVG와 글자로 표시', (await page.textContent('.eco-regions h3')) === '평택 탐사 지역' && locked.length === 3 && ['평택항 바닷가', '오성면 논', '부락산'].every(name => locked.some(r => r.lock && r.text.includes(name))), JSON.stringify(locked));
  await page.screenshot({ path: `${out}/05c-eco-map.png` }); await page.click('#panel-close');
  // pickSpecies가 쓰는 순수 가중치 함수를 직접 검사해 무작위 표본의 흔들림을 피한다.
  const parkNight = await page.evaluate(() => window.GameData.SPECIES.filter(s => s.habitat === 'park' && s.time !== 'day'));
  const frog = parkNight.find(s => s.id === 'narrowfrog'), common = parkNight.filter(s => !s.rare);
  check('밤 공원의 맹꽁이는 rare이며 다른 생물보다 낮은 조우 가중치', !!frog?.rare && common.length > 0 && [false, true].every(done => {
    const dex = done ? Object.fromEntries(parkNight.map(s => [s.id, { done: true }])) : {};
    return speciesWeight(frog, dex) > 0 && common.every(s => speciesWeight(frog, dex) === speciesWeight(s, dex) * 0.5);
  }));
  // 체육관 1 조건 미달 확인: 비생산자 4종만 관찰 → 선생님은 생산자를 더 관찰하라 하고, 관장은 입장을 거절한다
  await page.evaluate(() => { const S = window.__bq.S; S.dex = {}; for (const id of ['redsquirrel', 'sparrow', 'cabbagebutterfly', 'shaggymane']) S.dex[id] = { seen: 1, done: true }; });
  await enterDoor('school', 'L');
  await page.waitForTimeout(300);
  const doctor = await readDialog();
  check('생산자 없이 4종이면 선생님이 도전하라고 하지 않음', doctor.some(l => l.includes('생산자가 없')) && !doctor.some(l => l.includes('도전해 보렴')), doctor[1] || '');
  await drain();
  await enterDoor('park', 'G');
  await page.waitForTimeout(300);
  const refuse = await readDialog();
  await drain();
  check('gym1 locked(생산자 없음)', refuse.some(l => l.includes('아직 이르구나') && l.includes('생산자 없음')) && (await mode()) === 'walk' && !(await page.$('[data-a]')), refuse.join(' / '));
  await page.evaluate(() => { window.__bq.S.dex = {}; });
  await enterDoor('park', 'G');
  await page.waitForTimeout(300);
  const refuse0 = await readDialog();
  await drain();
  check('gym1 locked(관찰 0종)', refuse0.some(l => l.includes('아직 이르구나') && l.includes('지금 0종')) && (await mode()) === 'walk' && !(await page.$('[data-a]')), refuse0.join(' / '));
  // 조건 충족 후 입장
  await page.evaluate(() => { const S = window.__bq.S; for (const id of ['redsquirrel', 'sparrow', 'dandelion', 'pine']) S.dex[id] = { seen: 1, done: true }; });
  await enterDoor('park', 'G');
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
  // 켜진 별 수는 SVG 별 가운데 .off가 아닌 별로 센다
  const photoStars = await page.$eval('#panel-body .feedback .stars', el => 3 - el.querySelectorAll('.off').length);
  const starchLabel = await page.$$eval('#panel-body .meter', ms => ms.map(m => m.querySelector('.meter-label').textContent.replace(/\s+/g, ' ').trim()).find(t => t.startsWith('녹말')));
  check('광합성 결과: 밤에 닫으면 별 3 + 칭찬', photoStars === 3 && photoRes.includes('밤에 기공을 닫아'), `별 ${photoStars} · ${photoRes}`);
  check('quest-5 D-054 Q5 서술 범위를 멈춘 턴 하나로 좁힘', (await page.textContent('#panel-body')).includes('광합성이 멈춘 턴 하나를 골라') && !(await page.textContent('#panel-body')).includes('가장 크게 막은'));
  check('녹말 막대 숫자 = 결과 녹말', starchLabel.includes((photoRes.match(/녹말 (\d+)/) || [])[1] + ' '), starchLabel);
  let stored = await questSave();
  check('광합성 버튼 전 결과 기록 1개·별 3 배지가 저장됨', stored.records.filter(r => r.gym === 'photo').length === 1 && stored.badges.photo === 3);
  const photoHistory = stored.records.find(r => r.gym === 'photo').history;
  check('광합성 결과 전체 기록은 기본 접힘·1턴부터 마지막 턴까지 있음',
    await page.locator('.photo-history').count() === 1 && await page.$eval('.photo-history', d => !d.open) &&
    !(await page.isVisible('.photo-turn[data-turn="1"]')) && await page.locator('.photo-turn').count() === 10 &&
    (await page.textContent('.photo-history summary')).includes('1~10턴'));
  // 진행 중의 8줄 로그와 구별해, 결과의 새 목록을 펼쳐 처음 턴·멈춘 턴도 읽는다.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.click('.photo-history summary');
  const fullPhoto = await page.evaluate(history => {
    const turns = [...document.querySelectorAll('.photo-turn')];
    const body = document.getElementById('panel-body');
    const values = turns.every((el, i) => {
      const h = history[i];
      if (!h) return false;
      const fields = Object.fromEntries([...el.querySelectorAll('dl > div')].map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
      const before = i ? history[i - 1].starch : 0, delta = h.starch - before;
      const action = window.Battles.PHOTO.actions.find(a => a.id === h.action).label;
      return Number(el.dataset.turn) === h.turn && el.querySelector('.turn-action').textContent.includes(action) &&
        el.querySelector('.turn-action').textContent.includes(h.night ? '밤' : '낮') &&
        el.querySelector('.turn-action').textContent.includes(h.stomata ? '기공 열림' : '기공 닫힘') &&
        fields['빛'] === String(h.light) && fields['이산화 탄소'] === String(h.co2) && fields['물'] === String(h.water) &&
        fields['광합성량'] === String(h.P) && fields['호흡'] === '1' && fields['광합성량 − 호흡'] === `${h.net >= 0 ? '+' : ''}${h.net}` &&
        fields['녹말 변화'] === `${before} → ${h.starch} (${delta >= 0 ? '+' : ''}${delta})` &&
        el.classList.contains('stopped') === (h.P === 0) && el.querySelector('b').textContent.includes('광합성 멈춤') === (h.P === 0);
    });
    return { values: turns.length === history.length && values,
      stops: turns.filter(el => el.classList.contains('stopped')).map(el => Number(el.dataset.turn)),
      stopStyle: turns.filter(el => el.classList.contains('stopped')).every(el => parseFloat(getComputedStyle(el).borderLeftWidth) >= 4 &&
        getComputedStyle(el.querySelector('b')).color !== getComputedStyle(turns.find(t => !t.classList.contains('stopped')).querySelector('b')).color),
      readable: turns.every(el => parseFloat(getComputedStyle(el).fontSize) >= 14 && el.scrollWidth <= el.clientWidth + 1),
      fits: body.scrollWidth <= body.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
      open: document.querySelector('.photo-history').open };
  }, photoHistory);
  check('광합성 결과 10턴의 행동·요인·광합성량·호흡·실제 녹말 변화가 저장 기록과 일치', fullPhoto.values);
  check('광합성이 멈춘 턴은 색과 글자로 표시(밤 7턴 포함)', fullPhoto.stopStyle && fullPhoto.stops.includes(7) && fullPhoto.stops.length === photoHistory.filter(h => h.P === 0).length);
  check('광합성 360×640 전체 기록을 펼쳐도 글자가 읽히고 가로 넘침 없음', fullPhoto.open && fullPhoto.readable && fullPhoto.fits);
  await page.locator('.photo-turn').last().scrollIntoViewIfNeeded();
  check('광합성 마지막 턴까지 패널 안에서 스크롤해 읽음', await page.locator('.photo-turn').last().evaluate(el => {
    const r = el.getBoundingClientRect(), p = document.getElementById('panel-body').getBoundingClientRect();
    return r.top >= p.top && r.bottom <= p.bottom + 1;
  }));
  await page.screenshot({ path: `${out}/07-photo-history-small.png` });
  check('광합성 전체 기록 열람은 history 저장 형식을 바꾸지 않음', JSON.stringify((await questSave()).records.find(r => r.gym === 'photo').history) === JSON.stringify(photoHistory) &&
    photoHistory.every(h => Object.keys(h).sort().join() === 'P,action,co2,light,limiting,net,night,starch,stomata,turn,water'));
  await page.click('.photo-history summary');
  check('광합성 전체 기록을 다시 접을 수 있음', !(await page.isVisible('.photo-turn[data-turn="1"]')));
  await page.setViewportSize({ width: 390, height: 844 });
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
  await enterDoor('school', 'J');
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
  await page.evaluate(() => { window.__bq.S.timeMode = 'night'; const start = window.QuestMaps.MAPS.school.start; window.__bq.warp('school', start.x, start.y); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/10-night.png` });
  await page.click('#btn-b'); await page.click('#m-dex');
  check('도감 제목은 신항고 생태 도감', (await page.textContent('#panel-title')) === '신항고 생태 도감');
  // quest-8: 발견과 관찰 완료는 테두리 색 외에 글자·기호로도 구별한다.
  check('quest-8 도감 완료는 확인 아이콘과 관찰 완료 글자로 표시', (await page.textContent('.dex-cell.done .dex-state')).includes('관찰 완료') && await page.$eval('.dex-cell.done .dex-state', el => !!el.querySelector('svg use[href="#q-check"]')));
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
  await page.evaluate(() => { window.__bq.S.timeMode = 'real'; window.__fakeH = 18; Date.prototype.getHours = function () { return window.__fakeH; }; const start = window.QuestMaps.MAPS.school.start; window.__bq.warp('school', start.x, start.y); });
  await page.waitForTimeout(200);
  const hud18 = await page.textContent('#hud-time');
  const sunIcon = await page.$eval('#hud-time', el => !!el.querySelector('svg use[href="#q-sun"]') && el.textContent.trim() === '낮');
  await page.evaluate(() => { window.__fakeH = 19; });
  await page.waitForTimeout(1200);
  const hud19 = await page.textContent('#hud-time');
  check('실제 시계: 19시가 지나면 HUD가 밤으로 바뀜', hud18.includes('낮') && hud19.includes('밤'), `${hud18} → ${hud19}`);
  check('낮·밤 전환 모두 문자 글리프 없이 해당 SVG를 표시', sunIcon && await page.$eval('#hud-time', el => !!el.querySelector('svg use[href="#q-moon"]') && el.textContent.trim() === '밤'));
  // 새로고침 후 이어하기
  await page.reload();
  check('저장 뒤 새로고침하면 이어하기 버튼이 보임', await page.isVisible('#btn-continue'));

  // 지도·생물 목록이 바뀌기 전 저장: 없는 생물 기록은 숨기되 저장에서는 지우지 않는다.
  const legacyCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const legacy = await legacyCtx.newPage();
  if (reducedMotion) await mediaReady.get(legacy);
  watchErrors(legacy);
  await legacy.goto(questURL);
  const oldSave = { v: 1, partner: 'leafy', map: 'route2', x: 21, y: 8, dir: 'up', timeMode: 'day', introDone: true,
    dex: { squirrel: { seen: 2, done: true, wrong: 1 }, oyster: { seen: 1, done: true, wrong: 1 } }, badges: { photo: 2 },
    records: [{ at: '2026-10-01T00:00:00.000Z', gym: 'photo', win: true, stars: 2, reflection: '빛과 물의 영향을 관찰했다.' }], student: { id: '', name: '' } };
  await legacy.evaluate(s => localStorage.setItem('bioQuest.v1', JSON.stringify(s)), oldSave);
  await legacy.reload(); await legacy.click('#btn-continue');
  const legacyChoices = await keyboardChoices(legacy);
  check('avatar 없는 옛 저장은 한결 선생님의 성별 질문만 표시', legacyChoices.join() === '남학생,여학생' &&
    await legacy.textContent('#dialog-text') === '너는 누구니?' && await legacy.textContent('#dialog-name') === '한결 선생님');
  await legacy.click('#dialog-choices button:nth-child(2)');
  await legacy.waitForFunction(() => window.__bq.mode === 'walk');
  check('옛 저장에서 고른 성별 저장', await legacy.evaluate(() => JSON.parse(localStorage.getItem('bioQuest.v1')).avatar === 'f'));
  const migrated = await legacy.evaluate(() => {
    const q = window.__bq, start = window.QuestMaps.MAPS.school.start;
    return { start: q.S.map === 'school' && q.player.x === start.x && q.player.y === start.y && q.S.x === start.x && q.S.y === start.y,
      mode: q.mode, badges: q.S.badges, records: q.S.records };
  });
  check('옛 route2 저장은 오류 없이 학교 시작점으로 이어짐', migrated.start && migrated.mode === 'walk');
  check('옛 저장의 광합성 배지 2와 대결 기록 1개 유지', migrated.badges.photo === 2 && JSON.stringify(migrated.records) === JSON.stringify(oldSave.records));
  await legacy.click('#btn-b'); await legacy.click('#m-rec');
  const legacySummary = await legacy.inputValue('#r-text');
  check('옛 저장 기록 요약은 없는 생물 이름·id를 건너뜀', !/다람쥐|느타리|squirrel|oyster|undefined/.test(legacySummary) && legacySummary.includes('관찰 완료 0/28') && legacySummary.includes('★2') && legacySummary.includes(oldSave.records[0].reflection));
  await legacy.click('#panel-close'); await legacy.click('#btn-b'); await legacy.click('#m-dex');
  check('옛 저장 도감은 새 28종만 표시하고 완료로 세지 않음', await legacy.locator('.dex-cell').count() === 28 && await legacy.locator('.dex-cell.done').count() === 0);
  await legacy.click('#panel-close'); await legacy.click('#btn-b'); await legacy.click('#m-save');
  const persistedLegacy = await legacy.evaluate(() => JSON.parse(localStorage.getItem('bioQuest.v1')));
  check('다시 저장해도 옛 dex id·배지·기록은 지워지지 않음', persistedLegacy.map === 'school' && JSON.stringify(persistedLegacy.dex) === JSON.stringify(oldSave.dex) && persistedLegacy.badges.photo === 2 && JSON.stringify(persistedLegacy.records) === JSON.stringify(oldSave.records));
  await legacy.click('#panel-close'); await legacy.click('#btn-b'); await legacy.click('#m-avatar');
  check('메뉴 캐릭터 바꾸기는 남학생·여학생만 질문', (await keyboardChoices(legacy)).join() === '남학생,여학생' && await legacy.textContent('#dialog-text') === '너는 누구니?');
  await legacy.click('#dialog-choices button:first-child');
  await legacy.waitForFunction(() => window.__bq.mode === 'panel');
  check('캐릭터 바꾸기 선택값 저장', await legacy.evaluate(() => window.__bq.S.avatar === 'm' && JSON.parse(localStorage.getItem('bioQuest.v1')).avatar === 'm'));
  await legacy.reload(); await legacy.click('#btn-continue');
  check('다시 이어하기는 성별 질문 반복 없음', await legacy.evaluate(() => window.__bq.mode === 'walk' && window.__bq.S.avatar === 'm'));
  // partner만 없는 저장은 성별을 다시 묻지 않고 파트너만 골라 저장한다.
  await legacy.evaluate(() => { const s = JSON.parse(localStorage.getItem('bioQuest.v1')); delete s.partner; localStorage.setItem('bioQuest.v1', JSON.stringify(s)); });
  await legacy.reload(); await legacy.click('#btn-continue');
  check('partner 없는 저장은 파트너 선택만 표시', (await keyboardChoices(legacy)).join() === partnerChoices.join());
  await legacy.click('#dialog-choices button:first-child'); await keyboardChoices(legacy);
  await legacy.waitForFunction(() => window.__bq.mode === 'walk');
  check('옛 저장에서 고른 파트너 저장', await legacy.evaluate(() => JSON.parse(localStorage.getItem('bioQuest.v1')).partner === 'leafy'));
  // 막힌 좌표 저장을 이어한 뒤, 실제 방향 입력으로 걸을 수 있어야 한다.
  await legacy.evaluate(() => { const s = JSON.parse(localStorage.getItem('bioQuest.v1')); s.map = 'school'; s.x = 0; s.y = 0; localStorage.setItem('bioQuest.v1', JSON.stringify(s)); });
  await legacy.reload(); await legacy.click('#btn-continue');
  check('막힌 칸 저장은 학교 시작점에서 재개', await legacy.evaluate(() => {
    const q = window.__bq, s = window.QuestMaps.MAPS.school.start; return q.player.x === s.x && q.player.y === s.y;
  }));
  const startY = await legacy.evaluate(() => window.__bq.player.y);
  await legacy.dispatchEvent('.dir.down', 'pointerdown');
  await legacy.waitForFunction(y => window.__bq.player.y > y, startY, { timeout: 2000 });
  await legacy.dispatchEvent('.dir.down', 'pointerup');
  check('막힌 칸 복구 뒤 방향 버튼으로 이동 가능', await legacy.evaluate(y => window.__bq.player.y > y, startY));
  await legacy.evaluate(() => { const s = JSON.parse(localStorage.getItem('bioQuest.v1')); s.introDone = false; localStorage.setItem('bioQuest.v1', JSON.stringify(s)); });
  await legacy.reload(); await legacy.click('#btn-continue'); await legacy.click('#dialog');
  check('introDone false 저장은 소개 첫 문장부터 재시작·도감 기록 유지',
    (await legacy.textContent('#dialog-text')).startsWith('어서 와!') && await legacy.evaluate(s =>
      JSON.stringify(window.__bq.S.dex) === JSON.stringify(s.dex) && JSON.stringify(window.__bq.S.records) === JSON.stringify(s.records), oldSave));
  await legacyCtx.close();

  // 별도 가상 기기에서 결과 재시도·이탈·허브 삭제를 검사한다.
  const saveCtx = await createContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const resultPage = await saveCtx.newPage(), hubPage = await saveCtx.newPage();
  if (reducedMotion) await Promise.all([mediaReady.get(resultPage), mediaReady.get(hubPage)]);
  watchErrors(resultPage); watchErrors(hubPage);
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
      await ux.evaluate(() => { delete window.__bq.S.dex.shaggymane; window.__bq.encounter('campus', window.GameData.SPECIES.find(s => s.id === 'shaggymane')); });
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
  check('페이지 오류 0', pageErrors.length === 0, String(pageErrors.length));
  check('콘솔 오류 0(기존 WebKit file:// manifest 예외 적용)', errors.length === pageErrors.length, String(errors.length - pageErrors.length));
  console.log('errors:', errors.length ? errors : 'none');
  console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
  console.log('failures:', failures.length ? failures : 'none');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
