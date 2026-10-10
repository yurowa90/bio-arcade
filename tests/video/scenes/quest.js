'use strict';

const { SPECIES } = require('../../../games/quest/js/data');
const { MAPS } = require('../../../games/quest/js/mapdata');
const DIRS = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
const WALKABLE = new Set('.=YFPgfB:,;');
const ROUTES = new Map();

async function state(h) {
  return h.game.evaluate(() => {
    const q = window.__bq;
    return { map: q.S.map, x: q.player.x, y: q.player.y, moving: q.player.moving, mode: q.mode,
      done: Object.entries(q.S.dex).filter(([, record]) => record.done).map(([id]) => id) };
  });
}
async function dialog(h) {
  for (let i = 0; i < 24 && (await state(h)).mode === 'dialog'; i++) {
    const choices = h.loc('#dialog-choices button');
    // 한 번 눌러 타자 효과를 끝낸 뒤, 완성된 문장을 읽고 다음 줄로 간다.
    if (!(await choices.count()) && await h.loc('#dialog-next').getAttribute('hidden') !== null) await h.tap(h.loc('#dialog'), { fast: true });
    await h.read(h.loc('#dialog-text'));
    if (await choices.count()) {
      const labels = await choices.allTextContents();
      await h.caption(labels.includes('남학생') ? '나를 고르자.' : '탐사를 같이 할 파트너를 고르자.');
      await h.read(h.loc('#dialog-choices'));
      await h.tap(choices.first());
    } else await h.tap(h.loc('#dialog'), { fast: true });
    await h.think(80);
  }
  await h.expect((await state(h)).mode !== 'dialog', '대화가 24줄 안에 끝나지 않았습니다.');
}
async function move(h, direction) {
  await h.game.waitForFunction(() => !window.__bq.player.moving, null, { timeout: 1500 });
  const before = await state(h);
  await h.expect(before.mode === 'walk', '걸을 수 있는 화면이 아닙니다.');
  await h.down(h.loc(`.dir[data-dir="${direction}"]`));
  try {
    await h.game.waitForFunction(old => {
      const q = window.__bq;
      return q.player.x !== old.x || q.player.y !== old.y || q.S.map !== old.map || q.mode !== 'walk';
    }, before, { timeout: 1000 });
  } finally { await h.up(); }
  await h.game.waitForFunction(() => !window.__bq.player.moving || window.__bq.mode !== 'walk', null, { timeout: 1500 });
}
function distances(origin) {
  // 이번 영상은 학교 지도 안에서 걷는다. 출구를 밟아 다른 지도로 넘어가는 경로는 제외한다.
  const map = MAPS[origin.map], width = map.rows[0].length, size = width * map.rows.length;
  // NPC는 생성된 데이터의 전원을 장애물로 쓴다. 학생을 별도 좌표로 넣지 않는다.
  const blocked = new Set([...map.npcs, ...map.exits].map(p => p.y * width + p.x));
  for (const key of Object.keys(map.doors)) { const [x, y] = key.split(',').map(Number); blocked.add(y * width + x); }
  const distance = new Int32Array(size).fill(-1), queue = new Int32Array(size);
  const walkable = (x, y) => x >= 0 && x < width && y >= 0 && y < map.rows.length &&
    WALKABLE.has(map.rows[y][x]) && !blocked.has(y * width + x);
  if (!walkable(origin.x, origin.y)) throw new Error('걷기 목적지가 막힌 칸입니다.');
  let head = 0, tail = 1;
  queue[0] = origin.y * width + origin.x; distance[queue[0]] = 0;
  while (head < tail) {
    const cell = queue[head++], x = cell % width, y = Math.floor(cell / width);
    for (const [, dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, next = ny * width + nx;
      if (!walkable(nx, ny) || distance[next] !== -1) continue;
      distance[next] = distance[cell] + 1; queue[tail++] = next;
    }
  }
  return { width, distance, cells: queue.subarray(0, tail) };
}
function grassTargets(from, tile) {
  // 시작점에서 가장 가까운 도달 가능한 풀숲 두 칸을 고른다. 좌표를 고정하지 않는다.
  const { width, cells } = distances(from), map = MAPS[from.map];
  for (const cell of cells) {
    const x = cell % width, y = Math.floor(cell / width);
    if (map.rows[y][x] !== tile) continue;
    for (const [, dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (map.rows[ny]?.[nx] === tile && !map.doors[`${nx},${ny}`] && !map.npcs.some(n => n.x === nx && n.y === ny) && !map.exits.some(e => e.x === nx && e.y === ny)) {
        return [{ map: from.map, x, y }, { map: from.map, x: nx, y: ny }];
      }
    }
  }
  throw new Error(`걸어서 갈 수 있는 ${tile} 풀숲 두 칸이 없습니다.`);
}
function routeTo(target) {
  const key = `${target.map}:${target.x},${target.y}`;
  // 큰 지도도 목표마다 BFS를 한 번만 하고, 매 걸음에는 거리 배열만 읽는다.
  if (!ROUTES.has(key)) ROUTES.set(key, distances(target));
  return ROUTES.get(key);
}
function firstDirection(from, target) {
  if (from.map !== target.map) throw new Error('이번 걷기 영상은 같은 지도 안의 경로만 지원합니다.');
  const { width, distance } = routeTo(target), current = distance[from.y * width + from.x];
  if (current === 0) return null;
  for (const [dir, dx, dy] of DIRS) {
    const x = from.x + dx, y = from.y + dy;
    if (current > 0 && x >= 0 && x < width && y >= 0 && y < MAPS[from.map].rows.length && distance[y * width + x] === current - 1) return dir;
  }
  throw new Error(`공개 지도에서 목적지까지 길이 없습니다: ${target.map}:${target.x},${target.y}`);
}
async function walkTo(h, target, deadline, observe) {
  for (let guard = 0; guard < 180 && Date.now() < deadline; guard++) {
    const s = await state(h);
    if (s.mode === 'panel' && await h.loc('.species-card').count()) {
      if (await observe() === false) return false;
      continue;
    }
    if (s.mode === 'dialog') { await dialog(h); continue; }
    await h.expect(s.mode === 'walk', '이동 중 예상하지 못한 패널이 열렸습니다.');
    if (s.map === target.map && s.x === target.x && s.y === target.y) return true;
    await move(h, firstDirection(s, target));
  }
  return false; // 걷기 마감은 정상 종료다. 열린 관찰은 도감 확인 전에 마친다.
}
async function observe(h, coverage) {
  const startedAt = Date.now();
  const name = await h.loc('.species-card h3').textContent();
  const species = SPECIES.find(s => s.name === name);
  await h.expect(!!species, '만난 생물 이름을 확인하지 못했습니다.');
  for (let question = 0; question < 3; question++) {
    const options = await h.loc('#panel-body .choice-list [data-v]').evaluateAll(els => els.map(el => el.dataset.v));
    if (!options.length) break; // 이미 관찰한 생물의 재회 화면
    await h.caption('몸의 특징과 양분을 얻는 방법을 살펴보자.');
    await h.think(1800);
    await h.think(1000); // 화면에 나온 질문과 힌트를 읽는다.
    coverage.hint = true;
    const answer = options.includes('yes') ? (species.cls.startsWith('척추') ? 'yes' : 'no')
      : options.includes('식물') ? species.kind : species.role;
    let choice = answer, caption = '양분을 얻는 방법과 몸의 특징을 떠올리자.';
    if (!coverage.wrong) {
      if (species.kind === '균류' && options.includes('식물')) {
        choice = '식물'; caption = '땅에 붙은 버섯은 식물 아닐까.';
      } else if (species.kind === '균류' && options.includes('생산자')) {
        choice = '생산자'; caption = '곰팡이도 자라니 스스로 양분을 만들까.';
      } else if (answer === 'no' && options.includes('yes')) {
        choice = 'yes'; caption = '몸이 단단한 곤충은 등뼈도 있지 않을까.';
      } else if (species.role === '소비자' && options.includes('생산자')) {
        choice = '생산자'; caption = '곡식을 먹는 동물도 생산자일까.';
      } else {
        // 어떤 생물을 먼저 만나도 질문이 있으면 오답을 한 번 경험한다.
        choice = options.find(option => option !== answer);
        caption = '아는 생물이니 이 답일까. 골라 보자.';
      }
    }
    await h.caption(caption);
    await h.tap(h.loc(`#panel-body [data-v="${choice}"]`));
    if (choice !== answer) {
      await h.expect((await h.loc('#panel-body .feedback.bad').textContent()).includes('정답은'), '관찰 오답 안내가 없습니다.');
      coverage.wrong = true; coverage.wrongSpecies = name;
      await h.caption(options.includes('yes') ? '등뼈가 있는지로 나누는 거였네.'
        : options.includes('식물') ? '겉모습만으로 무리를 정하면 안 되네.'
          : '양분을 얻는 방법으로 나누는 거였네.');
      // 오답 질문형 자막을 바로 바꾸고 정답·생물 설명을 함께 읽는다.
      await h.think(4000);
      await h.mark('관찰-오답과-안내'); break;
    }
  }
  if (await h.loc('#enc-ok').count()) {
    if (!(await h.loc('#panel-body .feedback.bad').count())) await h.caption('도감에 남는 특징을 다시 읽어 보자.');
    // 조우 한 번의 읽기 시간은 약 8~10초. 여러 질문·탭에 쓴 시간도 센다.
    await h.think(Math.max(1800, 9000 - (Date.now() - startedAt) / h.config.pace));
    await h.tap(h.loc('#enc-ok'), { fast: true });
  }
  coverage.encounters++;
}

module.exports = {
  id: 'quest', title: '생명 탐사대', path: 'games/quest/index.html',
  async play(h) {
    ROUTES.clear();
    await h.expect(await h.game.evaluate(() => {
      const q = window.__bq;
      return q.npcs === window.QuestMaps.MAPS[q.S.map].npcs;
    }), 'NPC는 지도 데이터에서 읽어야 합니다.');
    const deadline = Date.now() + 195000;
    const searchUntil = deadline - 35000; // 도감 읽기와 허브 복귀 시간을 남긴다.
    const coverage = { encounters: 0, wrong: false, hint: false };
    h.result.coverage = coverage;
    const encounter = async () => {
      let ok = false;
      await h.step(`풀숲-관찰-${coverage.encounters + 1}`, async () => { await observe(h, coverage); ok = true; });
      await h.expect(ok, '관찰 단계가 실패하여 이동을 이어 갈 수 없습니다.');
      return coverage.encounters < 4;
    };
    const settle = async () => {
      const s = await state(h);
      if (s.mode === 'panel' && await h.loc('.species-card').count() && !(await h.loc('#panel-close').isVisible())) await encounter();
      if ((await state(h)).mode === 'dialog') await dialog(h);
    };
    await h.step('처음-화면과-선생님-소개', async () => {
      await h.caption('학교와 둘레를 걸으며 생물을 찾아보자.'); await h.read(h.loc('.title-card'));
      await h.tap(h.loc('#btn-new')); await dialog(h);
    });
    const garden = grassTargets(await state(h), ':');
    await h.step('정원까지-걸어가기', async () => {
      await h.caption('방향 버튼으로 정원 풀숲에 가 보자.');
      h.result.reachedGarden = await walkTo(h, garden[0], searchUntil, encounter);
    });
    // 종 수·생산자 여부는 목표에 넣지 않는다. 자연 조우 3~4회를 보고 마친다.
    let grass = garden, triedHill = false;
    for (let lap = 0; lap < 90 && Date.now() < searchUntil && coverage.encounters < 4; lap++) {
      // 정원 관찰 세 번 뒤, 걸음 수와 남은 시간을 보고 뒷산까지 갈 수 있으면 이어 간다.
      if (coverage.encounters >= 3 && !triedHill) {
        triedHill = true;
        const from = await state(h), hill = grassTargets(from, ',');
        const route = routeTo(hill[0]), steps = route.distance[from.y * route.width + from.x];
        if (steps >= 0 && Date.now() + steps * 900 + 15000 < searchUntil) {
          await h.step('뒷산-산길까지-걸어가기', async () => {
            await h.caption('북쪽 산길의 풀숲도 살펴보자.');
            h.result.reachedHill = await walkTo(h, hill[0], searchUntil, encounter);
          });
          if (h.result.reachedHill) grass = hill;
          if (coverage.encounters >= 4) break;
        } else (h.result.notes ||= []).push('뒷산 산길: 남은 시간에 맞춰 다음 탐사로 남김');
      }
      let ok = false;
      await h.step(`풀숲-걷기-${lap + 1}`, async () => {
        await h.caption(lap ? '다른 생물도 만나서 도감을 채워 보자.' : '진한 풀숲을 걸으면 생물을 만난다 했지.');
        await walkTo(h, grass[lap % 2 ? 0 : 1], searchUntil, encounter);
        ok = true;
      });
      if (!ok) break;
    }
    await h.step('걷기-마무리', async () => {
      await settle();
      h.result.walkStatus = Date.now() >= searchUntil ? '걷기 마감으로 정상 종료' : '조우 목표를 보고 종료';
      if (coverage.encounters < 3) (h.result.notes ||= []).push(`자연 조우 ${coverage.encounters}회: 걷기 마감 안에 3~4회 관찰 못 함`);
      if (!coverage.wrong) (h.result.notes ||= []).push('관찰 오답 해설: 질문 조우를 관찰 못 함');
      await h.caption('오늘 만난 생물을 도감에서 확인하자.');
    });
    await h.step('도감-등록-확인', async () => {
      await h.tap(h.loc('#btn-b')); await h.tap(h.loc('#m-dex'));
      await h.caption('발견과 관찰 완료가 따로 표시되네.');
      await h.read(h.loc('.dex-summary'));
      const discovered = h.loc('.dex-cell.done, .dex-cell.seen');
      if (await discovered.count()) {
        await h.tap(discovered.first()); await h.read(h.loc('#panel-body'));
        await h.mark('도감-상세');
      } else (h.result.notes ||= []).push('도감 상세: 자연 조우한 생물 관찰 못 함');
      await h.tap(h.loc('#panel-close'));
      h.result.registeredSpecies = (await state(h)).done;
      coverage.dex = true;
    });
    await h.step('메뉴에서-오락실로', async () => {
      await settle();
      if ((await state(h)).mode === 'panel') {
        await h.expect(await h.loc('#panel-close').isVisible(), '닫을 수 없는 관찰 화면이 남았습니다.');
        await h.tap(h.loc('#panel-close'));
      }
      await h.caption('오늘 관찰한 생물부터 기억해 두자.');
      await h.tap(h.loc('#btn-b')); await h.tap(h.loc('#m-hub'));
      await h.loc('#cabinets').waitFor({ state: 'visible' });
      await h.caption('다음엔 무엇을 해 볼까.'); await h.read(h.loc('#summary'));
      h.result.returnedHub = true;
      h.result.completed = !!coverage.dex;
    });
  }
};
