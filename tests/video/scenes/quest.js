'use strict';

const { MAPS, SPECIES } = require('../../../games/quest/js/data');
const DIRS = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
const WALKABLE = new Set(['.', 'f', ',', ';', 'B']);

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
      await h.read(h.loc('#dialog-choices')); await h.caption('광합성 이야기를 같이 해 줄 친구를 고르자.');
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
function firstDirection(from, target) {
  // 공개 지도에서 막힌 칸과 인물을 피한다. 이동·조우 훅은 호출하지 않는다.
  const key = p => `${p.map}:${p.x},${p.y}`;
  const queue = [{ ...from, first: null }], seen = new Set([key(from)]);
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index];
    if (p.map === target.map && p.x === target.x && p.y === target.y) return p.first;
    const map = MAPS[p.map];
    for (const [dir, dx, dy] of DIRS) {
      let next = { map: p.map, x: p.x + dx, y: p.y + dy, first: p.first || dir };
      if (!WALKABLE.has(map.rows[next.y]?.[next.x]) || map.npcs.some(n => n.x === next.x && n.y === next.y)) continue;
      const exit = map.exits.find(e => e.x === next.x && e.y === next.y);
      if (exit) next = { ...next, map: exit.to, x: exit.tx, y: exit.ty };
      if (!seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
    }
  }
  throw new Error(`공개 지도에서 목적지까지 길이 없습니다: ${key(target)}`);
}
async function walkTo(h, target, deadline, observe) {
  for (let guard = 0; guard < 180 && Date.now() < deadline; guard++) {
    const s = await state(h);
    if (s.mode === 'panel' && await h.loc('.species-card').count()) { await observe(); continue; }
    if (s.mode === 'dialog') { await dialog(h); continue; }
    await h.expect(s.mode === 'walk', '이동 중 예상하지 못한 패널이 열렸습니다.');
    if (s.map === target.map && s.x === target.x && s.y === target.y) return;
    await move(h, firstDirection(s, target));
  }
  throw new Error('시간 상한 안에 걸어서 목적지에 도착하지 못했습니다.');
}
async function observe(h, coverage) {
  const name = await h.loc('.species-card h3').textContent();
  const species = SPECIES.find(s => s.name === name);
  await h.expect(!!species, '만난 생물 이름을 확인하지 못했습니다.');
  for (let question = 0; question < 3; question++) {
    const options = await h.loc('#panel-body .choice-list [data-v]').evaluateAll(els => els.map(el => el.dataset.v));
    if (!options.length) break; // 이미 관찰한 생물의 재회 화면
    if (coverage.encounters < 3) await h.read(h.loc('#panel-body'));
    else await h.think(850);
    await h.read(h.loc('.q-hint'));
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
      }
    }
    await h.caption(caption);
    await h.tap(h.loc(`#panel-body [data-v="${choice}"]`));
    if (choice !== answer) {
      await h.expect((await h.loc('#panel-body .feedback.bad').textContent()).includes('정답은'), '관찰 오답 안내가 없습니다.');
      coverage.wrong = true; coverage.wrongSpecies = name;
      await h.read(h.loc('#panel-body .feedback.bad')); await h.read(h.loc('.species-card'));
      await h.mark('관찰-오답과-안내'); break;
    }
  }
  if (await h.loc('#enc-ok').count()) {
    if (coverage.encounters < 3) await h.read(h.loc('#panel-body'));
    else await h.think(800);
    await h.tap(h.loc('#enc-ok'), { fast: true });
  }
  coverage.encounters++;
}

module.exports = {
  id: 'quest', title: '생명 탐사대', path: 'games/quest/index.html',
  async play(h) {
    const deadline = Date.now() + 195000;
    const coverage = { encounters: 0, wrong: false, hint: false, gym: false };
    h.result.coverage = coverage;
    const encounter = async () => {
      let ok = false;
      await h.step(`풀숲-관찰-${coverage.encounters + 1}`, async () => { await observe(h, coverage); ok = true; });
      await h.expect(ok, '관찰 단계가 실패하여 이동을 이어 갈 수 없습니다.');
    };
    await h.step('처음-화면과-박사-소개', async () => {
      await h.caption('섬을 걸어서 생물을 찾아보자.'); await h.read(h.loc('.title-card'));
      await h.tap(h.loc('#btn-new')); await dialog(h);
    });
    await h.step('숲까지-걸어가기', async () => {
      await h.caption('방향 버튼으로 북쪽 숲길에 가 보자.');
      await walkTo(h, { map: 'route1', x: 9, y: 12 }, deadline, encounter);
    });
    // 생산자 포함 네 종을 모을 때까지 공개 지도의 풀숲을 왕복한다.
    const searchUntil = Math.min(deadline - 65000, Date.now() + 75000);
    for (let lap = 0; lap < 90 && Date.now() < searchUntil; lap++) {
      const s = await state(h);
      const producer = s.done.some(id => SPECIES.find(sp => sp.id === id)?.role === '생산자');
      if (s.done.length >= 4 && producer && coverage.wrong) break;
      let ok = false;
      await h.step(`풀숲-걷기-${lap + 1}`, async () => {
        if (lap % 10 === 0) await h.caption(lap ? '다른 생물도 만나서 도감을 채워 보자.' : '진한 풀숲을 걸으면 생물을 만난다 했지.');
        await walkTo(h, { map: 'route1', x: lap % 2 ? 9 : 12, y: 12 }, searchUntil, encounter);
        ok = true;
      });
      if (!ok) break;
    }
    await h.step('도감-등록-확인', async () => {
      if ((await state(h)).mode === 'panel' && await h.loc('#enc-ok').count()) await h.tap(h.loc('#enc-ok'));
      await h.tap(h.loc('#btn-b')); await h.tap(h.loc('#m-dex'));
      await h.caption('발견과 관찰 완료가 따로 표시되네.');
      await h.read(h.loc('.dex-summary'));
      const completed = h.loc('.dex-cell').filter({ hasText: '관찰 완료' });
      await h.expect(await completed.count() > 0, '자연 조우로 도감 등록을 한 종도 마치지 못했습니다.');
      await h.tap(completed.first()); await h.read(h.loc('#panel-body'));
      await h.mark('도감-상세'); await h.tap(h.loc('#panel-close'));
      h.result.registeredSpecies = (await state(h)).done;
    });
    if (!coverage.wrong) await h.step('누락-관찰-오답', async () => { throw new Error('시간 안에 계획한 오개념 관찰 질문을 만나지 못했습니다.'); });
    const s = await state(h);
    const eligible = s.done.length >= 4 && s.done.some(id => SPECIES.find(sp => sp.id === id)?.role === '생산자');
    if (eligible && Date.now() < deadline - 45000) {
      let entered = false;
      await h.step('광합성-체육관까지-걷기', async () => {
        await h.caption('네 종을 관찰했으니 광합성 체육관으로 가자.');
        await walkTo(h, { map: 'leaftown', x: 5, y: 5 }, deadline - 35000, encounter);
        await move(h, 'up'); await dialog(h);
        await h.expect(await h.loc('[data-a="stomata"]').isVisible(), '조건을 채웠지만 체육관 대결이 열리지 않았습니다.');
        entered = true;
      });
      if (entered) await h.step('광합성-열-턴과-결과', async () => {
        for (let turn = 1; turn <= 10 && Date.now() < deadline - 10000; turn++) {
          const text = await h.loc('.battle-top').innerText();
          const open = text.includes('기공 열림'), night = text.includes('다음 턴: 관장이 밤!');
          if (open === night) await h.tap(h.loc('[data-a="stomata"]'), { fast: true });
          const water = Number(text.match(/물 저장량 (\d+)/)?.[1]);
          const drought = text.includes('가뭄') && !text.includes('가뭄 0턴');
          const action = night ? 'wait' : water <= 3 && !drought ? 'water' : 'leaf';
          await h.caption(night ? '밤에는 빛이 없으니 기공을 닫아 물을 아끼자.' : drought ? '가뭄엔 물을 못 받네. 남은 요인을 보자.' : action === 'water' ? '물이 모자라기 전에 뿌리로 받아 두자.' : '빛도 모자라면 잎을 빛 쪽으로 펼치자.');
          await h.think(550); await h.tap(h.loc(`[data-a="${action}"]`), { fast: true });
          if (turn < 3 || night) await h.read(h.loc('.blog li').first());
        }
        await h.expect(await h.loc('#p-done').isVisible(), '시간 상한 안에 광합성 열 턴을 끝내지 못했습니다.');
        h.result.gymText = await h.loc('#panel-body .feedback').first().innerText();
        h.result.stars = 3 - await h.loc('#panel-body .feedback').first().locator('.stars .off').count();
        h.result.win = h.result.gymText.includes('승리!');
        await h.read(h.loc('#panel-body .feedback').first()); await h.mark('체육관-결과');
        await h.type(h.loc('#refl'), '밤에는 빛이 없어 광합성이 멈췄다. 기공을 닫으면 물을 아낀다. 밤에도 호흡해서 녹말은 줄었다.');
        await h.tap(h.loc('#p-done')); await dialog(h);
        coverage.gym = true; h.result.reachedResult = true;
      });
    } else {
      h.result.gymStatus = eligible ? '시간 부족으로 건너뜀' : '자연 조우로 생산자 포함 4종 조건을 채우지 못함';
      await h.step('체육관-미진행', async () => { throw new Error(h.result.gymStatus); });
    }
    await h.step('메뉴에서-오락실로', async () => {
      if ((await state(h)).mode === 'dialog') await dialog(h);
      if ((await state(h)).mode === 'panel') {
        await h.expect(await h.loc('#panel-close').isVisible(), '닫을 수 없는 대결 화면이 남았습니다.');
        await h.tap(h.loc('#panel-close'));
      }
      await h.caption('오늘 관찰한 생물부터 기억해 두자.');
      await h.tap(h.loc('#btn-b')); await h.tap(h.loc('#m-hub'));
      await h.loc('#cabinets').waitFor({ state: 'visible' });
      await h.caption('다음엔 무엇을 해 볼까.'); await h.read(h.loc('#summary'));
      h.result.returnedHub = true;
    });
  }
};
