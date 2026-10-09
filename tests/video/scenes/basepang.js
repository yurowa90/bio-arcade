'use strict';

const B = require('../../../games/basepang/engine');

async function board(h) {
  // 타일의 행·열·DNA/RNA·염기는 화면의 접근성 이름에도 공개되어 있다.
  const tiles = await h.loc('#grid .tile').evaluateAll(els => els.map(el => ({
    x: Number(el.dataset.x), y: Number(el.dataset.y), b: el.textContent,
    s: el.classList.contains('R') ? 'R' : 'D'
  })));
  const grid = Array.from({ length: B.H }, () => Array(B.W));
  for (const t of tiles) grid[t.y][t.x] = { b: t.b, s: t.s };
  await h.expect(tiles.length === B.W * B.H, '판의 모든 타일을 읽지 못했습니다.');
  return grid;
}
function moves(grid, level) {
  const choices = [];
  for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const a = { x, y }, b = { x: x + dx, y: y + dy };
      if (b.x < 0 || b.y < 0 || b.x >= B.W || b.y >= B.H) continue;
      const t = grid[y][x], other = grid[b.y][b.x];
      if (t.s === other.s && t.b === other.b) continue;
      const next = B.swap(grid, a, b), pairs = B.findPairs(level, next);
      const neighbors = [next[b.y][b.x - 1], next[b.y][b.x + 1]].filter(Boolean);
      const wrong = !pairs.length && (level === 2 && t.s === 'D' && neighbors.some(n => n.s === 'D' && B.DNA_COMP[t.b] === n.b)
        ? 'dnaDna' : neighbors.length && neighbors.every(n => n.b === t.b) ? 'same' : null);
      choices.push({ a, b, pairs: pairs.length, wrong });
    }
  }
  return choices;
}
async function swap(h, move) {
  for (const t of [move.a, move.b]) await h.tap(h.loc(`#grid .tile[data-x="${t.x}"][data-y="${t.y}"]`));
}
async function settle(h, first) {
  if (await h.loc('#grid .pop').count()) {
    // 탭으로 연쇄 연출을 끝내는 것은 게임이 제공하는 조작이다.
    await h.think(first ? 1600 : 450);
    if (await h.loc('#toast.replaying').count()) await h.tap(h.loc('#toast.replaying'), { fast: true });
  }
  await h.game.waitForFunction(() => !document.querySelector('#grid .pop'), null, { timeout: 7000 });
}

module.exports = {
  id: 'basepang', title: '염기쌍 팡', path: 'games/basepang/index.html',
  async play(h) {
    const deadline = Date.now() + 170000;
    const mistakes = { same: false, dnaDna: false };
    h.result.mistakes = mistakes;
    h.result.levelScores = [];
    await h.step('규칙-읽기', () => h.intro());
    await h.step('짝-규칙-설명', async () => {
      await h.caption('같은 글자가 아니라 짝을 맞추는 거네.');
      await h.tap(h.loc('.legend-details summary')); await h.read(h.loc('.legend-body'));
      await h.tap(h.loc('.legend-details summary'));
      h.result.help = '설명 펼치기와 연쇄 다시 읽기를 사용함.';
    });
    for (let level = 1; level <= 2; level++) {
      for (let turn = 0; turn < 15 && Date.now() < deadline; turn++) {
        let ok = false;
        await h.step(`${level}단계-이동-${turn + 1}`, async () => {
          await h.expect((await h.loc('#lvhud').textContent()).startsWith(`${level}/`), '계획한 염기쌍 단계가 아닙니다.');
          const choices = moves(await board(h), level);
          const kind = level === 1 ? 'same' : 'dnaDna';
          const wrong = !mistakes[kind] && choices.find(m => m.wrong === kind);
          if (wrong) {
            await h.caption(kind === 'same' ? '같은 염기끼리 모으면 터지지 않을까.' : '전사도 DNA A 옆에 DNA T를 놓으면 될까.');
            await swap(h, wrong);
            const text = await h.loc('#toast').textContent();
            await h.expect(text.includes(kind === 'same' ? '같은 염기끼리는 짝이 아니다' : 'DNA끼리가 아니라'), '계획한 무효 이동의 안내가 없습니다.');
            mistakes[kind] = true;
            await h.read(h.loc('#toast')); await h.mark(`${kind}-오답-안내`);
          }
          const valid = moves(await board(h), level).filter(m => m.pairs > 0);
          await h.expect(valid.length > 0, '화면에서 짝을 만드는 이동을 찾지 못했습니다.');
          const move = valid[Math.floor(h.random() * valid.length)];
          const before = Number(await h.loc('#moves').textContent());
          if (turn % 4 === 0) await h.caption(level === 1
            ? ['A와 T를 가로로 붙여 보자.', 'G와 C는 수소 결합이 세 개였지.', '연쇄 점수랑 결합 수는 다르네.', '남은 이동도 짝을 찾아보자.'][Math.floor(turn / 4)]
            : ['동그라미 RNA와 네모 DNA를 보자.', 'DNA A의 짝은 RNA U였지.', 'RNA에는 T가 없다는 걸 기억하자.', '마지막까지 가로 짝을 찾아보자.'][Math.floor(turn / 4)]);
          await h.think(turn < 2 ? 1500 : 350);
          await swap(h, move); await settle(h, turn === 0);
          await h.expect(Number(await h.loc('#moves').textContent()) === before - 1, '유효 이동 횟수가 줄지 않았습니다.');
          ok = true;
        });
        if (!ok) break;
      }
      if (level === 1) await h.step('전사로-넘어가기', async () => {
        await h.expect(await h.loc('#go2').isVisible(), '복제 단계를 끝내지 못했습니다.');
        h.result.levelScores[0] = Number(await h.loc('#score').textContent());
        await h.read(h.loc('#overlay .card')); await h.caption('이번엔 RNA니까 T 대신 U네.');
        await h.tap(h.loc('#go2')); await h.read(h.loc('#legend'));
      });
    }
    for (const kind of ['same', 'dnaDna']) if (!mistakes[kind]) await h.step(`누락-${kind}`, async () => {
      throw new Error(`자연 판에서 ${kind} 오답 장면을 수행하지 못했습니다.`);
    });
    await h.step('결과와-설명', async () => {
      await h.expect(await h.loc('#ar-retry').isVisible(), '시간 상한 안에 두 단계를 끝내지 못했습니다.');
      h.result.levelScores[1] = Number(await h.loc('#score').textContent());
      h.result.score = h.result.levelScores.reduce((sum, n) => sum + n, 0);
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.completed = true;
      await h.finish('복제는 A와 T, G와 C가 짝이다. 전사는 DNA A에 RNA U가 온다. 그 RNA의 정보를 리보솜이 읽어 단백질을 만드는 것이 번역이다.');
    });
  }
};
