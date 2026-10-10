// 지도 연결·도달 가능성, 서식지별 낮/밤 생물, 관찰 질문 배정, 체육관 규칙을 검증한다.
const D = require('../games/quest/js/data.js');
const { MAPS } = require('../games/quest/js/mapdata.js');
const B = require('../games/quest/js/battles.js');
const { normalizeSave, buildRecordSummary } = require('../games/quest/js/main.js');
let pass = 0, fail = 0;
const chk = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const WALK = new Set('.=YFPgfB:,;');
const ALLOWED = new Set([...WALK, ...'T~RHXSDLGJ']);
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const key = p => `${p.map}:${p.x},${p.y}`;
const walkable = p => {
  const m = MAPS[p.map];
  return !!m && WALK.has(m.rows[p.y]?.[p.x]) && !m.doors[`${p.x},${p.y}`] && !m.npcs.some(n => n.x === p.x && n.y === p.y);
};

// 1. 지도 모양·허용 기호
chk('지도는 school·park 두 장', Object.keys(MAPS).sort().join() === 'park,school');
for (const [id, m] of Object.entries(MAPS)) {
  chk(`${id} 직사각형`, m.rows.length > 0 && m.rows[0].length > 0 && m.rows.every(r => r.length === m.rows[0].length));
  const unknown = [...new Set(m.rows.join(''))].filter(ch => !ALLOWED.has(ch));
  chk(`${id} 허용된 칸 기호만 사용`, unknown.length === 0, unknown.join(','));
  for (const ex of m.exits) {
    chk(`${id} 출구 ${ex.x},${ex.y}와 ${ex.to} 도착 칸은 걸을 수 있음`,
      walkable({ map: id, x: ex.x, y: ex.y }) && walkable({ map: ex.to, x: ex.tx, y: ex.ty }));
  }
}

// 2. 학교 시작점에서 출구를 포함한 BFS. 문·표지판·사람은 밟지 않고 맞닿은 칸으로 간다.
function reachable(start, includeExits = true) {
  const seen = new Set(), queue = [];
  const visit = p => {
    if (!walkable(p) || seen.has(key(p))) return;
    seen.add(key(p)); queue.push(p);
  };
  visit(start);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], m = MAPS[p.map];
    if (includeExits) for (const ex of m.exits.filter(e => e.x === p.x && e.y === p.y)) {
      visit({ map: ex.to, x: ex.tx, y: ex.ty });
    }
    for (const [dx, dy] of DIRS) visit({ map: p.map, x: p.x + dx, y: p.y + dy });
  }
  return seen;
}
const start = { ...MAPS.school.start, map: 'school' };
chk('학교 시작점은 걸을 수 있음', walkable(start));
const seen = reachable(start);
const maps = new Set([...seen].map(k => k.split(':')[0]));
chk('모든 지도에 도달 가능', Object.keys(MAPS).every(m => maps.has(m)), [...maps].join(','));
const adjacent = (map, x, y) => DIRS.some(([dx, dy]) => seen.has(key({ map, x: x + dx, y: y + dy })));
for (const [id, doors] of [['school', 'DLJ'], ['park', 'G']]) {
  const m = MAPS[id];
  for (const door of doors) {
    const cells = Object.entries(m.doors).filter(([, ch]) => ch === door).map(([key]) => {
      const [x, y] = key.split(',').map(Number); return { x, y };
    });
    const rowCells = m.rows.flatMap((row, y) => [...row].flatMap((ch, x) => ch === door ? [`${x},${y}`] : []));
    chk(`문 데이터와 행 기호 일치: ${id}:${door}`, cells.every(({ x, y }) => m.rows[y]?.[x] === door) &&
      rowCells.length === cells.length && rowCells.every(key => m.doors[key] === door));
    chk(`문 도달: ${id}:${door}`, cells.length > 0 && cells.every(({ x, y }) => adjacent(id, x, y)));
  }
}
// 표지판·NPC 앞에 설 수 있는가
for (const [id, m] of Object.entries(MAPS)) {
  for (const s of Object.keys(m.signs)) {
    const [x, y] = s.split(',').map(Number);
    chk(`${id} 표지판 ${s} 접근`, m.rows[y]?.[x] === 'S' && adjacent(id, x, y));
  }
  for (const n of m.npcs) chk(`${id} 인물 ${n.id} 접근`, adjacent(id, n.x, n.y));
  for (const ex of m.exits) chk(`${id} 출구 ${ex.x},${ex.y} 도달`, seen.has(key({ map: id, x: ex.x, y: ex.y })));
}
// 도착 칸에서 공원 안만 걸어 귀환 출구에 닿고, 학교로 돌아온 뒤 시작점에도 닿아야 한다.
const toPark = MAPS.school.exits.filter(ex => ex.to === 'park');
chk('학교에서 공원으로 가는 출구가 있음', toPark.length > 0);
for (const ex of toPark) {
  const parkSeen = reachable({ map: 'park', x: ex.tx, y: ex.ty }, false);
  const back = MAPS.park.exits.filter(e => e.to === 'school');
  chk(`출구 왕복: school ${ex.x},${ex.y} → park → school 시작점`, back.some(e =>
    parkSeen.has(key({ map: 'park', x: e.x, y: e.y })) &&
    reachable({ map: 'school', x: e.tx, y: e.ty }, false).has(key(start))));
}
for (const [id, tile] of [['school', ':'], ['school', ','], ['park', ';']]) {
  chk(`${id} 조우 풀숲(${tile}) 도달 가능`, MAPS[id].rows.some((row, y) =>
    [...row].some((ch, x) => ch === tile && seen.has(key({ map: id, x, y })))));
}

// 저장 위치를 복구해도 관찰·대결 기록과 미완료 인트로는 보존한다.
const legacySave = { v: 1, map: 'school', x: start.x, y: start.y, introDone: false,
  dex: { retired: { done: true, wrong: 2 }, dandelion: { done: true, wrong: 1 } },
  records: [{ gym: 'photo', reflection: '테스트 답' }], badges: { photo: 2 }, student: { id: '20315', name: '테스트' } };
for (const [name, patch] of [
  ['막힌 칸', { x: 0, y: 0 }], ['x 없음', { x: undefined }], ['y 없음', { y: undefined }],
  ['문자 좌표', { x: String(start.x), y: String(start.y) }], ['NaN', { x: NaN }],
  ['무한대', { y: Infinity }], ['소수 좌표', { x: start.x + .5 }], ['없는 지도', { map: 'removed' }],
  ...Object.entries(MAPS).flatMap(([map, m]) => [
    [`${map} 지도 밖`, { map, x: -1, y: -1 }],
    ...m.npcs.map(n => [`${map} NPC ${n.id}`, { map, x: n.x, y: n.y }]),
    ...Object.keys(m.doors).map(key => { const [x, y] = key.split(',').map(Number); return [`${map} 문 ${key}`, { map, x, y }]; }),
  ]),
]) {
  const state = normalizeSave({ ...legacySave, ...patch }, MAPS), expected = MAPS[patch.map] || MAPS.school;
  chk(`저장 복구: ${name} → 해당 지도 시작점`, state.map === expected.id && state.x === expected.start.x && state.y === expected.start.y);
}
for (const [map, m] of Object.entries(MAPS)) for (const [name, tiles] of [['길', '.=YFPgfB'], ['조우 풀숲', ':,;']]) {
  const cells = m.rows.flatMap((row, y) => [...row].flatMap((ch, x) => tiles.includes(ch) &&
    walkable({ map, x, y }) && (x !== m.start.x || y !== m.start.y) ? [{ x, y }] : []));
  const cell = cells[0], state = normalizeSave({ ...legacySave, map, ...cell }, MAPS);
  chk(`저장 복구: ${map} 정상 ${name} 위치는 유지`, !!cell && state.map === map && state.x === cell.x && state.y === cell.y);
}
const migrated = normalizeSave(legacySave, MAPS);
chk('옛 저장: avatar·partner 없음은 선택 대기 값으로 남김', migrated.avatar === null && migrated.partner === null);
chk('옛 저장: introDone false 유지', migrated.introDone === false);
chk('옛 저장: 도감·배지·대결 기록 보존', JSON.stringify(legacySave.dex) === JSON.stringify(migrated.dex) &&
  migrated.badges.photo === 2 && migrated.records[0].reflection === '테스트 답');
const completedLegacy = normalizeSave({ ...legacySave, introDone: true }, MAPS);
chk('옛 저장: 완료 인트로는 유지하고 빠진 프로필만 질문 대기', completedLegacy.introDone === true && completedLegacy.avatar === null && completedLegacy.partner === null);
const profileSave = normalizeSave({ ...legacySave, avatar: 'f', partner: 'mito', introDone: true }, MAPS);
chk('프로필이 있는 저장은 선택 값·정상 위치 유지', profileSave.avatar === 'f' && profileSave.partner === 'mito' && profileSave.x === start.x && profileSave.y === start.y);
for (const dir of ['up', 'down', 'left', 'right']) {
  chk(`저장 방향: ${dir} 유지`, normalizeSave({ ...legacySave, dir }, MAPS).dir === dir);
}
for (const dir of [undefined, null, '', 'east', 'diagonal', 1, {}, ['up']]) {
  chk(`저장 방향: ${JSON.stringify(dir)} → down`, normalizeSave({ ...legacySave, dir }, MAPS).dir === 'down');
}
const summary = buildRecordSummary(migrated, D.SPECIES, D.GYMS);
chk('제출 요약: 없는 생물 id 건너뜀·현재 생물만 집계', summary.includes(`관찰 완료 1/${D.SPECIES.length}`) && summary.includes('서양민들레(1)') && !summary.includes('retired'));
chk('제출 요약: 체육관은 원래 이름: ★개수 형식', summary.split('\n').includes(`${D.GYMS.find(g => g.id === 'photo').name}: ★2`));
chk('제출 요약 뒤에도 없는 생물 기록은 저장에 보존', migrated.dex.retired.done && migrated.dex.retired.wrong === 2 && legacySave.dex.retired.wrong === 2);

// 캔버스 자원 검사는 브라우저 없이 생성 크기·재사용·해제를 확인한다.
const render = require('../games/quest/js/maprender.js');
const previousDocument = global.document, previousMaps = global.QuestMaps;
const canvases = [];
const makeCanvas = () => {
  const c = { width: 176, height: 144, calls: [], drawn: [], getBoundingClientRect: () => ({ width: 100 }) };
  const context = { canvas: c, imageSmoothingEnabled: false, fillStyle: '',
    fillRect(...args) { c.calls.push([this.fillStyle, ...args]); }, clearRect() {}, drawImage(floor) { c.drawn.push(floor); } };
  c.getContext = () => context;
  return c;
};
try {
  global.document = { createElement: () => { const c = makeCanvas(); canvases.push(c); return c; } };
  const makeMap = id => ({ id, width: 80, height: 72, rows: Array(72).fill('.'.repeat(80)), doors: {}, npcs: [], exits: [] });
  const firstMap = makeMap('first'), nextMap = makeMap('next');
  global.QuestMaps = { MAPS: { first: firstMap, next: nextMap } };
  firstMap.exits = [{ x: 40, y: 36, group: 'east', arrow: 'east' }, { x: 41, y: 36, group: 'east' }];
  const screen = makeCanvas(), p = { x: 40, y: 36, dir: 'down', moving: false };
  render.drawWorld(screen.getContext(), firstMap, p);
  chk('지도 바닥: 첫 화면의 조각만 생성(최대 4개)', canvases.length > 0 && canvases.length <= 4 && canvases.every(c => c.width === 176 && c.height === 144));
  chk('출구 표지: group의 arrow 칸만 도트 화살표 표시', canvases.reduce((n, c) => n + c.calls.filter(call => call[0] === '#fffdf0').length, 0) === 21);
  const initialCount = canvases.length;
  render.drawWorld(screen.getContext(), firstMap, p);
  chk('지도 바닥: 같은 카메라 조각 재사용', canvases.length === initialCount);
  render.drawWorld(screen.getContext(), firstMap, { ...p, x: 60 });
  chk('지도 바닥: 새 카메라 영역만 추가 생성', canvases.length > initialCount && canvases.length <= initialCount + 4);
  const previousFloors = [...canvases];
  render.drawWorld(screen.getContext(), nextMap, p);
  chk('지도 바닥: 지도 전환 때 이전 캔버스 해제', previousFloors.every(c => c.width === 0 && c.height === 0));
  nextMap.exits = [{ x: 60, y: 36 }];
  const beforeArrow = canvases.length;
  render.drawWorld(screen.getContext(), nextMap, { ...p, x: 60 });
  chk('출구 표지: 옛 데이터는 출구 위치로 화살표 방향 계산', canvases.slice(beforeArrow).some(c => c.calls.some(call => call[0] === '#fffdf0')));
  // 지도 안쪽에서는 가장 가까운 경계가 남쪽이어도 명시한 방향을 따른다.
  const arrowDots = arrow => {
    const m = makeMap('arrow-' + arrow);
    m.exits = [{ x: 40, y: 36, arrow }];
    global.QuestMaps.MAPS[m.id] = m;
    const before = canvases.length;
    render.drawWorld(screen.getContext(), m, p);
    const dots = canvases.slice(before).flatMap(c => c.calls.filter(call => call[0] === '#fffdf0').map(call => call.slice(1, 3)));
    const minX = Math.min(...dots.map(d => d[0])), minY = Math.min(...dots.map(d => d[1]));
    return dots.map(([x, y]) => [x - minX, y - minY]);
  };
  for (const [arrow, alias, axis, head, stem] of [
    ['east', 'right', 0, 5, 0], ['west', 'left', 0, 3, 8],
    ['north', 'up', 1, 3, 8], ['south', 'down', 1, 5, 0],
  ]) {
    const dots = arrowDots(arrow);
    chk(`출구 방향: 안쪽 출구의 ${arrow}는 데이터 방향으로 그림`, dots.length === 21 &&
      dots.filter(d => d[axis] === head).length === 7 && dots.filter(d => d[axis] === stem).length === 1);
    chk(`출구 방향: ${arrow}·${alias}는 같은 도트`, JSON.stringify(dots) === JSON.stringify(arrowDots(alias)));
  }
  const cacheMap = makeMap('cache');
  global.QuestMaps.MAPS.cache = cacheMap;
  const visitChunk = (col, row) => {
    screen.drawn.length = 0;
    render.drawWorld(screen.getContext(), cacheMap, { ...p, x: col * 11 + 5, y: row * 9 + 4 });
    return screen.drawn[0];
  };
  const cacheStart = canvases.length, oldest = visitChunk(0, 0), second = visitChunk(1, 0);
  let withinLimit = true;
  for (let i = 2; i < 30; i++) {
    visitChunk(i % 6, Math.floor(i / 6));
    withinLimit &&= canvases.slice(cacheStart).filter(c => c.width > 0).length <= 30;
  }
  chk('지도 바닥: 30개까지 서로 다른 조각 생성', canvases.length - cacheStart === 30);
  chk('지도 바닥: 최근 사용 조각은 다시 그리지 않음', visitChunk(0, 0) === oldest && canvases.length - cacheStart === 30);
  visitChunk(0, 5);
  chk('지도 바닥: 캐시 상한 30조각', withinLimit && canvases.slice(cacheStart).filter(c => c.width > 0).length === 30);
  chk('지도 바닥: 가장 오래 안 쓴 조각부터 해제', oldest.width === 176 && second.width === 0 && second.height === 0);
  const beforeRevisit = canvases.length, recreated = visitChunk(1, 0);
  chk('지도 바닥: 버린 조각은 재방문 때 재생성', canvases.length === beforeRevisit + 1 && recreated !== second &&
    recreated.width === 176 && recreated.calls.length > 0 && canvases.slice(cacheStart).filter(c => c.width > 0).length === 30);
  const mini = makeCanvas();
  render.drawMini(mini.getContext(), nextMap, 0, 0);
  const marker = mini.calls.at(-1), scale = mini.getBoundingClientRect().width / mini.width;
  chk('미니맵 주인공: 최소 2×2픽셀·화면 5px, 가장자리에서도 온전히 표시',
    marker[3] >= 2 && marker[4] >= 2 && marker[3] * scale >= 5 && marker[4] * scale >= 5 &&
    marker[1] >= 0 && marker[2] >= 0 && marker[1] + marker[3] <= mini.width && marker[2] + marker[4] <= mini.height);
  // 기존 NPC의 기본 교복과 새 kind/look 메타가 같은 도트를 내는지 비교한다.
  const npcDots = npc => {
    nextMap.npcs = [npc]; screen.calls.length = 0;
    render.drawWorld(screen.getContext(), nextMap, p);
    return JSON.stringify(screen.calls);
  };
  const senior = { id: 'senior', x: 42, y: 36 }, walker = { id: 'walker', x: 42, y: 36 };
  chk('NPC 기본값: senior는 student/m', npcDots(senior) === npcDots({ ...senior, kind: 'student', look: 'm' }));
  chk('NPC 기본값: 나머지는 adult', npcDots(walker) === npcDots({ ...walker, kind: 'adult', look: 'm' }));
  chk('NPC 메타: 학생 look f와 m은 서로 다른 도트',
    npcDots({ ...senior, kind: 'student', look: 'f' }) !== npcDots({ ...senior, kind: 'student', look: 'm' }));
} finally {
  if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
  if (previousMaps === undefined) delete global.QuestMaps; else global.QuestMaps = previousMaps;
}

// 3. 생물 목록과 서식지·시간별 풀
const habitats = ['campus', 'hill', 'park'];
chk('서식지는 학교 단지·뒷산·생태공원', Object.keys(D.HABITATS || {}).sort().join() === 'campus,hill,park');
for (const [id, name, tile] of [['campus', '학교 단지', ':'], ['hill', '학교 뒷산', ','], ['park', '저수지 생태공원', ';']]) {
  chk(`${id} 서식지 이름·조우 기호`, D.HABITATS?.[id]?.name === name && D.HABITATS?.[id]?.tile === tile);
}
chk('생물 28종', D.SPECIES.length === 28);
chk('생물 id 중복 없음', new Set(D.SPECIES.map(s => s.id)).size === D.SPECIES.length);
chk('모든 생물의 서식지가 HABITATS에 있음', D.SPECIES.every(s => Object.hasOwn(D.HABITATS || {}, s.habitat)));
chk('모든 생물의 관찰 시간이 낮·밤·둘 다 중 하나', D.SPECIES.every(s => ['day', 'night', 'both'].includes(s.time)));
const rare = D.SPECIES.filter(s => s.rare === true);
chk('드문 생물은 맹꽁이 한 종', rare.length === 1 && rare[0].id === 'narrowfrog' && rare[0].name === '맹꽁이');
chk('민들레는 서양민들레로 구별해 표시', !D.SPECIES.some(s => s.name === '민들레') && D.SPECIES.find(s => s.id === 'dandelion')?.name === '서양민들레');
for (const h of habitats) for (const t of ['day', 'night']) {
  const pool = D.SPECIES.filter(s => s.habitat === h && (s.time === 'both' || s.time === t));
  chk(`${h}/${t} 생물 ${pool.length}종`, pool.length >= 3, pool.map(s => s.name).join(','));
  chk(`${h}/${t} 생산자 관찰 가능`, pool.some(s => s.role === '생산자'));
}
const campusDay = D.SPECIES.filter(s => s.habitat === 'campus' && (s.time === 'both' || s.time === 'day'));
chk('체육관 입장 조건(4종·생산자) 낮 학교 단지만으로 충족 가능', campusDay.length >= 4 && campusDay.some(s => s.role === '생산자'));

// 3-1. 관찰 질문 배정(data.js의 ask). 정답 계산은 main.js의 observationQuestions와 같다(tests/quest-e2e.js가 실제 함수와 대조).
// 질문 종류만 보고 답을 짐작하지 못해야 한다: 종류마다 정답이 둘 이상으로 갈리고, 한 정답이 60%를 넘지 않는다.
// ask가 배열이면 차례로 낸다(앞 질문을 맞혀야 다음 질문). 분포는 낼 수 있는 질문 전체로, 풀 조건은 첫 질문으로 센다.
const ASK = { kind: sp => sp.kind, role: sp => sp.role, vert: sp => (sp.cls.startsWith('척추') ? 'yes' : 'no') };
const asks = sp => [].concat(sp.ask);
chk('관찰 질문: 모든 생물에 질문 종류(kind·role·vert)가 정해져 있음', D.SPECIES.every(sp => asks(sp).length && asks(sp).every(k => ASK[k])), D.SPECIES.filter(sp => !asks(sp).every(k => ASK[k])).map(sp => sp.name).join(','));
chk('관찰 질문: 한 생물에게 같은 종류를 두 번 내지 않음', D.SPECIES.every(sp => new Set(asks(sp)).size === asks(sp).length));
chk('관찰 질문: 척추 여부는 동물에게만', D.SPECIES.every(sp => asks(sp).every(k => k !== 'vert' || sp.kind === '동물')));
const askDist = (arr, firstOnly) => { const o = {}; for (const sp of arr) for (const k of firstOnly ? asks(sp).slice(0, 1) : asks(sp)) { if (!ASK[k]) continue; const a = ASK[k](sp); (o[k] = o[k] || {})[a] = (o[k][a] || 0) + 1; } return o; };
const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(' / ');
const dAll = askDist(D.SPECIES);
for (const t of Object.keys(ASK)) {
  const v = Object.values(dAll[t] || {}), n = v.reduce((a, b) => a + b, 0);
  chk(`관찰 질문 ${t}: 정답이 한 가지로 몰리지 않음(${D.SPECIES.length}종 전체)`, v.length >= 2 && Math.max(...v) / n <= 0.6, `${n}문항 ${JSON.stringify(dAll[t] || {})}`);
}
chk('관찰 질문: 무리 질문의 정답에 식물·균류·동물이 모두 있음', ['식물', '균류', '동물'].every(k => (dAll.kind || {})[k] > 0), JSON.stringify(dAll.kind));
chk('관찰 질문: 역할 질문의 정답에 생산자·소비자·분해자가 모두 있음', ['생산자', '소비자', '분해자'].every(r => (dAll.role || {})[r] > 0), JSON.stringify(dAll.role));
const shaggymane = D.SPECIES.find(s => s.id === 'shaggymane');
chk('관찰 질문: 먹물버섯(균류·분해자)은 무리 질문을 먼저 받고 이어 역할 질문을 받음', shaggymane?.kind === '균류' && shaggymane.role === '분해자' && asks(shaggymane).join() === 'kind,role');
// 생물마다 처음 받는 질문만 세어도 역할 질문의 정답에 분해자가 있어야 한다(M1: 분해자 균류 추가)
const dFirst = askDist(D.SPECIES, true);
chk('관찰 질문: 첫 질문의 정답이 분해자인 생물이 있음', D.SPECIES.some(sp => asks(sp)[0] === 'role' && sp.role === '분해자'), D.SPECIES.filter(sp => asks(sp)[0] === 'role' && sp.role === '분해자').map(sp => sp.name).join(',') || '없음');
chk('관찰 질문: 첫 질문만 세어도 역할 질문의 정답에 생산자·소비자·분해자가 모두 있음', ['생산자', '소비자', '분해자'].every(r => (dFirst.role || {})[r] > 0), JSON.stringify(dFirst.role));
chk('관찰 질문: 분해자는 모두 균류', D.SPECIES.filter(sp => sp.role === '분해자').every(sp => sp.kind === '균류'));
for (const h of habitats) for (const t of ['day', 'night']) {
  const pool = D.SPECIES.filter(s => s.habitat === h && (s.time === 'both' || s.time === t));
  const dp = askDist(pool, true);
  chk(`관찰 질문 ${h}/${t}: 첫 질문만으로도 세 종류가 모두 나오고 종류마다 정답이 갈림`, Object.keys(ASK).every(k => dp[k] && Object.keys(dp[k]).length >= 2), fmt(dp));
}

// 4. 광합성 대결 ('stomata'는 기공 열기·닫기 — 턴을 쓰지 않는다)
const run = seq => seq.reduce((s, a) => B.photoStep(s, a), B.photoInit());
const tg = B.photoStep(B.photoInit(), 'stomata');
chk('광합성: 기공 열기·닫기는 턴을 쓰지 않음', tg.turn === 1 && tg.stomata && tg.history.length === 0);
const simple = run(['stomata', ...Array(10).fill('water')]);
chk('광합성: 기공 열고 물만 → 승리(별 1)', simple.win && simple.stars === 1, `녹말 ${simple.starch}`);
const opening = 'stomata water water leaf water leaf water'.split(' ');
const expert = run([...opening, 'stomata', 'leaf', 'stomata', 'water', 'leaf', 'water']); // 7턴(밤)에 닫고 8턴에 다시 연다
const keepOpen = run([...opening, 'leaf', 'water', 'leaf', 'water']);                    // 같은 수순에서 밤에도 열어 둔다
chk('광합성: 밤에 기공 닫기 → 별 3', expert.stars === 3, `녹말 ${expert.starch}`);
chk('광합성: 같은 수순에서 밤에도 기공을 열어 두면 → 별 3 아님', keepOpen.win && keepOpen.stars < 3, `녹말 ${keepOpen.starch}`);
chk('광합성: 기다리기만 → 패배', !run(Array(10).fill('wait')).win);
const t1 = run(['stomata', 'water']);
chk('광합성: 제한 요인 계산(min)', t1.last.P === Math.min(t1.last.light, t1.last.co2, t1.last.water));
const full = expert.history.filter(h => h.P === B.PHOTO.maxFactor);
chk('광합성: 세 요인이 모두 최대인 턴은 제한 요인 없음', full.length > 0 && full.every(h => h.limiting.length === 0));
chk('광합성: 기록에 밤 턴의 기공 상태가 남음', expert.history.some(h => h.night && !h.stomata) && keepOpen.history.some(h => h.night && h.stomata));
// 전수 탐색: 별 3은 밤에 기공을 닫아야만 받을 수 있어야 한다(밤에 닫는 개념과 점수가 일치)
const { finals } = require('./quest-tune-photo.js').explorePhoto();
const maxOf = arr => Math.max(...arr.map(f => f.s.starch));
const maxNightOpen = maxOf(finals.filter(f => f.nightOpen)), maxNightClosed = maxOf(finals.filter(f => !f.nightOpen));
const star3 = B.PHOTO.stars[2];
chk('광합성 전수: 밤에 기공을 연 수열의 최대 녹말 < 별 3 기준', maxNightOpen < star3, `밤 열림 최대 ${maxNightOpen}, 별 3 기준 ${star3}`);
chk('광합성 전수: 밤에 기공을 닫으면 별 3 도달 가능', maxNightClosed >= star3, `밤 닫힘 최대 ${maxNightClosed}`);
chk('광합성 전수: 밤에 기공을 열어도 승리는 가능(별 1~2)', maxNightOpen >= B.PHOTO.goal);

// 5. 소화 대결
const ABS_OK = { starch: 'capillary', protein: 'capillary', fat: 'lacteal' };
const MODEL = ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal'];
let d = B.digestInit(); for (const m of MODEL) d = B.digestStep(d, m);
chk('소화: 모범 경로 → 흡수 단계', d.phase === 'absorb' && d.wrong === 0);
chk('소화: 모범 경로는 쓸개즙으로 유화한 뒤 이자액으로 분해', MODEL.indexOf('bile') >= 0 && MODEL.indexOf('bile') < MODEL.indexOf('pancreas') && d.emulsified);
chk('소화: 모범 경로는 입에서 침, 위에서 위액을 씀(장소별 소화액 기록)', d.salivaMouth === true && d.gastricStomach === true, `salivaMouth ${d.salivaMouth}, gastricStomach ${d.gastricStomach}`);
chk('소화: 모범 경로(입 침·위 위액·쓸개즙 유화 뒤 이자액) + 흡수 정답 → 별 3', B.digestStars(d, B.absorbCheck(ABS_OK)) === 3);
chk('소화: 지방을 모세 혈관으로 → 별 1', B.digestStars(d, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'capillary' })) === 1);
let d2 = B.digestInit(); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'saliva');
chk('소화: 위에서 침 → 효과 없음(산성)', d2.lastLog.some(l => l.text.includes('산성')));
let d5 = B.digestInit(); for (const m of ['chew', 'chew', 'gastric', 'mix', 'saliva']) d5 = B.digestStep(d5, m);
chk('소화: 소장에서 침 → 효과 없음 + 헛수 1', B.DIGEST.places[d5.placeIdx].id === 'intestine' && d5.food.starch === 0 && d5.wrong === 1 && d5.lastLog.some(l => l.t === 'bad' && l.text.includes('이자액')));
for (const m of ['bile', 'pancreas', 'intestinal']) d5 = B.digestStep(d5, m);
chk('소화: 소장에서 침을 쓴 뒤 바르게 이어 가면 성공하되 별 3은 아님', d5.phase === 'absorb' && B.digestStars(d5, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'lacteal' })) === 2);
let d3 = B.digestInit(); for (const m of ['chew', 'chew', 'mix', 'mix', 'mix', 'mix', 'mix', 'mix']) d3 = B.digestStep(d3, m);
chk('소화: 분해 안 하면 패배', d3.phase === 'fail');
let d4 = B.digestInit(); for (const m of ['chew', 'chew', 'gastric', 'mix', 'pancreas', 'pancreas', 'intestinal']) d4 = B.digestStep(d4, m);
chk('소화: 쓸개즙 없이도 라이페이스 2번이면 분해(비효율)', d4.phase === 'absorb' && d4.food.fat === 2);
chk('소화: 쓸개즙 미사용 → 헛수 0·흡수 정답이어도 별 2(승리는 함)', !d4.emulsified && d4.wrong === 0 && B.digestStars(d4, B.absorbCheck(ABS_OK)) === 2);
let d6 = B.digestInit(); for (const m of ['saliva', 'chew', 'gastric', 'mix', 'pancreas', 'bile', 'pancreas', 'intestinal']) d6 = B.digestStep(d6, m);
chk('소화: 입 침·위 위액을 쓰고 소장에서 이자액→쓸개즙→이자액이어도 별 3 가능(M3: 유화 전 이자액은 감점 안 함)', d6.phase === 'absorb' && d6.emulsified && B.digestStars(d6, B.absorbCheck(ABS_OK)) === 3);
// 장소별 소화액(M2): 녹말은 입에서 침으로, 단백질은 위에서 위액으로 소화가 시작된다. 빠뜨리면 이겨도 별 2까지
const digestRun = seq => seq.reduce((s, m) => B.digestStep(s, m), B.digestInit());
const missOf = s => (B.digestMissing ? B.digestMissing(s).join() : '(digestMissing 없음)');
for (const [name, seq, miss] of [
  ['입·위에서는 씹기·꿈틀 운동만', ['chew', 'chew', 'mix', 'mix', 'bile', 'pancreas', 'intestinal'], 'saliva,gastric'],
  ['입에서 침만 빠짐', ['chew', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal'], 'saliva'],
  ['위에서 위액만 빠짐', ['saliva', 'chew', 'mix', 'mix', 'bile', 'pancreas', 'intestinal'], 'gastric'],
  ['입·위 소화액과 쓸개즙이 모두 빠짐', ['chew', 'chew', 'mix', 'mix', 'pancreas', 'pancreas', 'intestinal'], 'saliva,gastric,bile'],
]) {
  const s = digestRun(seq), st = B.digestStars(s, B.absorbCheck(ABS_OK));
  chk(`소화: ${name} → 헛수 0·흡수 정답이어도 승리·별 2, 빠진 조건 ${miss}`, s.phase === 'absorb' && s.wrong === 0 && st === 2 && missOf(s) === miss, `별 ${st}, 빠진 조건 ${missOf(s)}`);
}
// 전수 탐색: 장소마다 쓸 수 있는 모든 기술 수열을 끝까지 돌린다(약 2만 2천 개)
const dFinals = [];
(function dfs(s) {
  if (s.phase !== 'digest') { dFinals.push(s); return; }
  const place = B.DIGEST.places[s.placeIdx].id;
  for (const [id, m] of Object.entries(B.DIGEST.moves)) if (m.place.includes(place)) dfs(B.digestStep(s, id));
})(B.digestInit());
const dWins = dFinals.filter(s => s.phase === 'absorb');
const bileWins = dWins.filter(s => s.history.some(h => h.move === 'bile' && h.effect)), noBileWins = dWins.filter(s => !s.history.some(h => h.move === 'bile' && h.effect));
const maxStars = arr => Math.max(...arr.map(s => B.digestStars(s, B.absorbCheck(ABS_OK))));
chk('소화 전수: 쓸개즙 없이 이긴 수열은 별 2 이하', noBileWins.length > 0 && maxStars(noBileWins) === 2, `${noBileWins.length}개, 최대 별 ${maxStars(noBileWins)}`);
chk('소화 전수: 쓸개즙을 쓴 수열은 별 3 도달 가능', maxStars(bileWins) === 3, `${bileWins.length}개 중 별 3 ${bileWins.filter(s => B.digestStars(s, B.absorbCheck(ABS_OK)) === 3).length}개`);
chk('소화 전수: emulsified = 쓸개즙이 효과를 낸 수열', dWins.every(s => s.emulsified === bileWins.includes(s)));
// 장소별 소화액(M2): 기록(history)으로 판정한다 — 상태 플래그가 없거나 틀려도 이 단언은 실패한다
const usedAt = (s, move, place) => s.history.some(h => h.move === move && h.place === place && h.effect);
const placeWins = dWins.filter(s => usedAt(s, 'saliva', 'mouth') && usedAt(s, 'gastric', 'stomach'));
const noPlaceWins = dWins.filter(s => !placeWins.includes(s));
const starDist = arr => { const o = { 1: 0, 2: 0, 3: 0 }; for (const s of arr) o[B.digestStars(s, B.absorbCheck(ABS_OK))]++; return JSON.stringify(o); };
chk('소화 전수: 입에서 침이나 위에서 위액을 쓰지 않고 이긴 수열은 별 2 이하', noPlaceWins.length > 0 && maxStars(noPlaceWins) === 2, `${noPlaceWins.length}개, 최대 별 ${maxStars(noPlaceWins)}, 별 분포 ${starDist(noPlaceWins)}`);
chk('소화 전수: 입 침·위 위액·쓸개즙을 모두 제때 쓴 수열은 별 3 도달 가능', maxStars(placeWins.filter(s => bileWins.includes(s))) === 3, `${placeWins.filter(s => bileWins.includes(s)).length}개, 별 분포 ${starDist(placeWins.filter(s => bileWins.includes(s)))}`);
chk('소화 전수: salivaMouth·gastricStomach = 입 침·위 위액이 효과를 낸 수열', dWins.every(s => s.salivaMouth === usedAt(s, 'saliva', 'mouth') && s.gastricStomach === usedAt(s, 'gastric', 'stomach')));
console.log(`소화 전수: 수열 ${dFinals.length}개, 승리 ${dWins.length}개, 별 분포(흡수 정답 가정) ${starDist(dWins)}`);

// 결과 추가와 서술 갱신은 같은 저장 형식에서 서로 독립이다.
const { appendBattleRecord, patchBattleReflection } = require('../games/quest/js/main.js');
const savedResults = { records: [], badges: {} };
const firstResult = appendBattleRecord(savedResults, { gym: 'photo', win: true, stars: 3 });
chk('결과 직후 대결 기록 1개·최고 배지 저장', savedResults.records.length === 1 && savedResults.badges.photo === 3 && savedResults.records[0].reflection === '');
chk('서술 갱신은 공백 제거·대결 추가 없음', patchBattleReflection(savedResults, firstResult, '  테스트 답  ') && savedResults.records.length === 1 && savedResults.records[0].reflection === '테스트 답');
chk('같은 답 반복 갱신은 쓰기 생략', !patchBattleReflection(savedResults, firstResult, '테스트 답') && savedResults.records.length === 1);
// 같은 밀리초의 두 판도 번호로 구별하며, 이전 미래 시각에 새 시각을 맞추지 않는다.
const NativeDate = Date, nowAt = '2026-10-05T00:00:00.000Z';
global.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [nowAt])); } static now() { return NativeDate.parse(nowAt); } };
const secondResult = appendBattleRecord(savedResults, { gym: 'photo', win: true, stars: 1 });
const sameTimeResults = { records: [], badges: {} };
const sameFirst = appendBattleRecord(sameTimeResults, { gym: 'photo', win: true, stars: 3 });
const sameSecond = appendBattleRecord(sameTimeResults, { gym: 'photo', win: true, stars: 1 });
const futureResults = { records: [{ at: '2030-01-01T00:00:00.000Z', gym: 'photo' }], badges: {} };
const currentResult = appendBattleRecord(futureResults, { gym: 'photo', win: true, stars: 2 });
global.Date = NativeDate;
chk('새 판 시각은 현재 기기 시각·미래 기록에 묶이지 않음', currentResult.at === nowAt);
chk('탐사대 제출 기록은 at 키가 맨 앞', Object.keys(futureResults.records[1])[0] === 'at');
patchBattleReflection(sameTimeResults, sameFirst, '같은 시각 첫 판');
chk('같은 시각도 판 번호로 구별·최고 배지 유지', sameFirst.at === sameSecond.at && sameFirst.index !== sameSecond.index && sameTimeResults.records[0].reflection === '같은 시각 첫 판' && sameTimeResults.records[1].reflection === '' && savedResults.badges.photo === 3);
patchBattleReflection(savedResults, firstResult, '첫 판 수정');
chk('새 판 뒤 이전 판 갱신은 대상 판만 수정', savedResults.records[0].reflection === '첫 판 수정' && savedResults.records[1].reflection === '');
chk('탐사대 빈 답은 D-053 ④에 따라 이전 답을 지움', patchBattleReflection(savedResults, firstResult, '   ') && savedResults.records[0].reflection === '');
chk('삭제된 저장에는 대상 판 갱신 없음', !patchBattleReflection(null, firstResult, '되살림 금지'));
const replacedResults = { records: [{ ...savedResults.records[1], at: '2030-01-01T00:00:00.000Z' }], badges: {} };
chk('지운 뒤 같은 판 번호라도 시각이 다르면 갱신 없음', !patchBattleReflection(replacedResults, firstResult, '오염 금지') && replacedResults.records[0].reflection === '');
appendBattleRecord(savedResults, { gym: 'digest', win: false, stars: 0 });
chk('패배 기록도 남고 패배로 배지를 만들지 않음', savedResults.records.length === 3 && !savedResults.badges.digest);

console.log(`검사 결과: PASS ${pass}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
