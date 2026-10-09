'use strict';

const R = require('../../../games/organization/organization');

// 화면의 패 이름을 교과 개념·공개 관계표와 대조한다. 덱 순서·숨은 상태·훅은 읽거나 부르지 않는다.
async function view(h) {
  const hand = await h.loc('#hand [data-tile]').evaluateAll(els => els.map(el => ({ id: el.dataset.tile, name: el.textContent })));
  const board = await h.loc('#board [data-set]').evaluateAll(els => els.map(el => ({
    id: el.dataset.set, kind: el.querySelector('.set-heading').textContent.includes('묶음') ? 'group' : 'line',
    names: [...el.querySelectorAll('.board-tile .tile')].map(t => t.textContent)
  })));
  return { remaining: Number(await h.loc('#turns').textContent()), hand: hand.filter(t => R.tile(t.id)?.name === t.name).map(t => t.id), board: board.map(s => ({ ...s, tiles: s.names.map(name => R.TILES.find(t => t.name === name)?.id) })) };
}
function triples(hand, judge) {
  for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) {
    const ids = [hand[a], hand[b], hand[c]];
    if (judge(ids)) return ids;
  }
  return null;
}
function chains(hand) {
  const found = [];
  function walk(ids) {
    if (ids.length >= 3 && R.validateLine(ids).ok) found.push(ids);
    const last = R.tile(ids.at(-1));
    for (const id of hand) if ((R.RELATIONS[last.id] || []).includes(R.tile(id).id)) walk(ids.concat(id));
  }
  for (const id of hand) walk([id]);
  return found.sort((a, b) => b.length - a.length);
}
function plan(v) {
  const full = new Set(v.board.filter(s => s.kind === 'line' && s.tiles.length === 5).map(s => R.tile(s.tiles[0]).kingdom));
  const lines = chains(v.hand).filter(ids => !full.has(R.tile(ids[0]).kingdom));
  // 묶음을 먼저 내면 줄에 필요한 패를 잃는다. 화면에서 읽은 패만으로 고른다.
  const complete = lines.find(ids => ids.length === 5);
  if (complete) return { type: 'line', ids: complete };
  // 완성에 가까운 부분 사슬부터 양 끝을 늘린다. 놓인 세트는 옮기지 않는다.
  const partials = v.board.filter(s => s.kind === 'line' && s.tiles.length < 5 && !full.has(R.tile(s.tiles[0]).kingdom)).sort((a, b) => b.tiles.length - a.tiles.length);
  for (const set of partials) {
    const id = v.hand.find(id => R.validateLine([...set.tiles, id]).ok);
    if (id) return { type: 'attach', ids: [id], setId: set.id };
  }
  // 3장도 지금 놓을 수 있는 사슬이면 내고, 나중에 붙여 완성한다.
  if (lines.length) return { type: 'line', ids: lines[0] };
  // 손패가 처음 14장보다 늘었을 때만 묶음을 쓴다. 사슬의 기회는 위에서 먼저 고른다.
  if (v.hand.length > R.RULES.handSize) {
    const group = triples(v.hand, ids => R.validateGroup(ids).ok);
    if (group) return { type: 'group', ids: group };
    for (const set of v.board.filter(s => s.kind === 'group')) {
      const id = v.hand.find(id => R.validateGroup([...set.tiles, id]).ok);
      if (id) return { type: 'attach', ids: [id], setId: set.id };
    }
  }
  return { type: 'draw', ids: [] };
}
async function ready(h) { await h.game.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') !== 'true'); }
async function choose(h, ids) {
  await ready(h);
  const selected = h.loc('#hand .tile[aria-pressed="true"]');
  while (await selected.count()) await h.tap(selected.first());
  for (const id of ids) await h.tap(h.loc(`#hand [data-tile="${id}"]`));
}
async function submit(h, action) {
  await choose(h, action.ids);
  if (action.type === 'attach') await h.tap(h.loc(`#board [data-set="${action.setId}"]`));
  const selector = { line: '#play-line', group: '#play-group', attach: '#attach', draw: '#draw' }[action.type];
  await h.tap(h.loc(selector)); await ready(h);
}

module.exports = {
  id: 'organization', title: '구성 단계 잇기', path: 'games/organization/index.html',
  async play(h) {
    const coverage = { practice: false, group: false, chain: false, attached: false, wrong: false, scope: false, draw: false };
    h.result.coverage = coverage;
    await h.step('규칙-읽기', () => h.intro());
    const practiceSkipped = !(await h.loc('#coach').isVisible());
    if (practiceSkipped) h.result.practice = '건너뜀: 기록이 있는 기기';
    else {
      let previous = null;
      // 손패 수만큼만 살펴본다. 정답 목록·연습 진행 상태는 읽지 않고 화면의 내기 버튼을 본다.
      const count = await h.loc('#hand .tile').count();
      for (let i = 0; i < count && await h.loc('#play-line').isDisabled(); i++) {
        const ok = await h.step(`함께-만드는-첫-줄-${i + 1}`, async () => {
          await h.caption(previous ? '방금 고른 것을 이루는 패를 찾아보자.' : '질문에 나온 생물을 먼저 찾아보자.');
          await h.read(h.loc('#coach-question'));
          const question = await h.loc('#coach-question').textContent();
          const hand = await h.loc('#hand .tile').evaluateAll(els => els.filter(el => el.getAttribute('aria-pressed') !== 'true').map(el => el.textContent));
          const tiles = hand.map(name => R.TILES.find(t => t.name === name)).filter(Boolean);
          const answer = previous ? tiles.find(t => (R.RELATIONS[t.id] || []).includes(previous.id)) :
            tiles.find(t => question.includes(t.name));
          h.expect(!!answer, '질문·손패 이름·공개 관계표로 다음 연습 패를 찾지 못했습니다.');
          if (previous?.name === '고양이') {
            await h.caption('위도 먹이를 소화하잖아?');
            await h.tap(h.loc('#hand').getByText('위', { exact: true }));
            h.expect(await h.loc('#feedback').getAttribute('data-kind') === 'error', '위 선택 뒤 연습 안내가 없습니다.');
            await h.read(h.loc('#feedback')); await h.think(900);
            await h.caption('위와 창자가 함께 하는 일 전체를 찾는구나.');
            await h.read(h.loc('#coach-question'));
          }
          await h.tap(h.loc('#hand').getByText(answer.name, { exact: true }));
          h.expect(await h.loc('#feedback').getAttribute('data-kind') === 'guide', '연습 정답을 골라도 다음 질문으로 넘어가지 않습니다.');
          previous = answer;
          await h.read(h.loc('#coach-question'));
        });
        if (!ok) break;
      }
      await h.step('함께-만든-줄과-새-손패', async () => {
        h.expect(await h.loc('#play-line').isEnabled(), '연습 패를 모두 고르지 못했습니다.');
        await h.caption('함께 고른 패를 줄로 놓아 보자.');
        await h.read(h.loc('#coach-question')); await h.tap(h.loc('#play-line'));
        h.expect(await h.loc('#board .stage-name').count() === 5 && await h.loc('#begin-main').isVisible(), '연습 줄을 내도 단계 이름과 새 손패 시작 버튼이 보이지 않습니다.');
        await h.caption('낸 뒤에는 단계 이름이 보이네. 작은 것부터 이어졌다.');
        await h.read(h.loc('#board .set')); await h.read(h.loc('#coach-question')); await h.think(1200);
        await h.mark('연습-줄의-단계-이름');
        await h.caption('이제 새 손패로 스스로 이어 보자.');
        await h.tap(h.loc('#begin-main'));
        h.expect(!(await h.loc('#coach').isVisible()) && await h.loc('#hand .tile').count() === 14, '연습 뒤 새 손패 본게임으로 넘어가지 못했습니다.');
        coverage.practice = true; h.result.practice = '첫 줄 완성 뒤 새 손패로 시작';
      });
    }
    await h.step('손패-훑기', async () => {
      await h.caption('색 말고 이름을 보고 단계를 떠올리자.');
      const tiles = h.loc('#hand [data-tile]');
      for (let i = 0; i < await tiles.count(); i += 3) { const tile = tiles.nth(i); await tile.evaluate(el => el.scrollIntoView({ block: 'center' })); await h.read(tile); }
      await h.read(h.loc('#goal')); await h.think(1200);
      h.result.help = '별도 힌트 버튼 없음. 규칙 카드·목표·관계 피드백을 읽음.';
    });
    let consecutiveDraws = 0, drawIndex = 0;
    const drawCaptions = ['이을 패가 없네. 한 장 더 살펴보자.', '이번 패가 사슬 사이를 채워 줄까.', '이름을 다시 보자. 붙일 곳이 있을까.', '아직 필요한 부분이 없네. 더 뽑아 보자.'];
    for (let turn = 0; turn < 24; turn++) {
      if (await h.loc('#ar-retry').count()) break;
      const v = await view(h);
      // 오개념은 계 혼동을 한 번만 보여 준다. 관계 방향을 오답으로 쓰지 않는다.
      if (!coverage.wrong) {
        const wrongGroup = triples(v.hand, ids => R.validateGroup(ids).reason === 'tissueSystemInAnimal');
        const wrongLine = triples(v.hand, ids => ['systemInPlant', 'tissueSystemInAnimal', 'kingdomMix'].includes(R.validateLine(ids).reason));
        const ids = wrongGroup || wrongLine;
        if (ids) await h.step('헷갈린-관계', async () => {
          await h.caption(wrongGroup ? '기관이랑 조직계, 비슷한 단계 아닐까.' : '식물과 동물도 이렇게 이어질까.');
          await submit(h, { type: wrongGroup ? 'group' : 'line', ids });
          await h.expect(await h.loc('#feedback').getAttribute('data-kind') === 'error', '일부러 틀린 시도에 오답 안내가 없습니다.');
          coverage.wrong = true; await h.read(h.loc('#feedback')); await h.think(900);
        });
      }
      if (!coverage.scope) {
        const ids = triples(v.hand, ids => R.validateLine(ids).reason === 'outOfScope');
        if (ids) await h.step('다루지-않는-연결', async () => {
          await h.caption('조직이 이 기관을 이루기도 하지 않나.');
          await submit(h, { type: 'line', ids });
          await h.expect(await h.loc('#feedback').getAttribute('data-kind') === 'scope', '다루지 않는 연결 안내가 없습니다.');
          coverage.scope = true; await h.read(h.loc('#feedback')); await h.think(1000);
        });
      }
      if (await h.loc('#ar-retry').count()) break;
      // 새 화면의 패 이름과 판의 사슬을 보고 고른다. 뽑기를 억지로 먼저 하지 않는다.
      const action = plan(await view(h));
      consecutiveDraws = action.type === 'draw' ? consecutiveDraws + 1 : 0;
      await h.step(`턴-${String(turn + 1).padStart(2, '0')}-${action.type}`, async () => {
        const captions = { group: '패가 많네. 같은 단계끼리 묶어 보자.', line: action.ids.length === 5 ? '세포부터 개체까지 한 줄이 됐네.' : '이 부분부터 놓고 나중에 이어 보자.', attach: '이미 놓은 사슬에 이어 붙여 보자.' };
        await h.caption(action.type === 'draw' ? drawCaptions[drawIndex++ % drawCaptions.length] : captions[action.type]);
        const before = await h.loc('#turns').textContent();
        await submit(h, action);
        await h.expect(await h.loc('#turns').textContent() !== before || !!(await h.loc('#ar-retry').count()), '탭 뒤 턴이 넘어가지 않았습니다.');
        if (action.type === 'group') coverage.group = true;
        if (action.type === 'line') coverage.chain = true;
        if (action.type === 'attach') coverage.attached = true;
        if (action.type === 'draw') coverage.draw = true;
        if (!(await h.loc('#ar-retry').count())) {
          const placed = h.loc(action.type === 'draw' ? '#hand .tile:last-child' : '#board .set').last();
          if (consecutiveDraws >= 2) { await placed.scrollIntoViewIfNeeded(); await h.think(450); }
          else { await h.read(placed); await h.think(turn < 3 ? 1200 : 450); }
        }
      });
    }
    h.result.optionalScope = coverage.scope ? '안내 관찰' : '건너뜀: 손패에 자연스럽게 가능한 범위 밖 조합이 없었음';
    h.result.optionalGroup = coverage.group ? '묶음 관찰' : '건너뜀: 사슬을 먼저 만들었거나 손패가 많지 않았음';
    for (const key of ['practice', 'chain', 'wrong']) if (!coverage[key] && !(key === 'practice' && practiceSkipped)) {
      await h.step(`누락-${key}`, async () => { throw new Error(`필수 놀이 장면 ${key}를 수행하지 못했습니다. 손패 배분 또는 앞 장면 실패를 확인하세요.`); });
    }
    await h.step('결과와-설명', async () => {
      await h.finish('사람은 세포→조직→기관→기관계→개체다. 해바라기는 세포→조직→조직계→기관→개체다. 동물에는 소화계 같은 기관계, 식물에는 관다발 조직계가 있다.');
    });
  }
};
