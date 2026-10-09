'use strict';

// 검은 자녀에게 부모가 a를 하나씩 주며, 정상인 딸은 색맹 아버지의 X를 받는다.
// 화면에 나온 가족 관계로 미리 정한 추론이다. 해결기 정답·숨은 유전자형은 읽지 않는다.
const MARKS = [['f', 'm'], ['d1', 's1', 'h1'], ['gm', 'd1'], ['d1', 'w1']];
const THOUGHTS = [
  '발현한 자녀에게 부모가 a를 하나씩 줬겠네.',
  '아버지가 aa면 정상인 자녀도 a가 있겠다.',
  '아들의 X는 엄마에게서 오는 거였지.',
  '색맹 아버지의 정상인 딸은 보인자겠네.'
];

module.exports = {
  id: 'pedigree', title: '가계도 지뢰찾기', path: 'games/pedigree/index.html',
  async play(h) {
    h.result.levelsCompleted = 0;
    await h.step('규칙-읽기', () => h.intro());
    await h.step('범례-도움말', async () => {
      await h.caption('검은 사람과 반만 칠한 사람은 다르네.');
      await h.read(h.loc('.legend'));
      h.result.help = '별도 힌트 버튼 없음. 범례와 단계별 판정 근거를 읽음.';
    });
    for (let level = 0; level < 4; level++) {
      await h.step(`${level + 1}단계-가족-추론`, async () => {
        await h.caption(THOUGHTS[level]);
        await h.expect((await h.loc('#stagehud').textContent()).startsWith(`${level + 1}/`), '계획한 가계도 단계가 아닙니다.');
        await h.read(h.loc('#lvl')); await h.read(h.loc('#field'));
        await h.caption(THOUGHTS[level]); await h.think(2300);
        for (const id of MARKS[level]) await h.tap(h.loc(`#field .person[data-id="${id}"]`));
        if (level === 0) {
          await h.caption('정상인 딸도 보인자일까. 표시해 보자.');
          await h.tap(h.loc('#field .person[data-id="c2"]'));
        }
        if (level === 2) {
          await h.caption('정상인 아빠도 보인자일 수 있지 않을까.');
          await h.tap(h.loc('#field .person[data-id="h1"]'));
        }
        await h.tap(h.loc('#judge'));
        await h.read(h.loc('#result'));
        const feedback = await h.loc('#result').innerText();
        if (level === 0) {
          await h.expect(feedback.includes('확정할 수 없는데'), '가능성과 확정을 혼동한 오답 안내가 없습니다.');
          await h.caption('일 수도 있다는 말로는 확정 못 하는구나.');
          h.result.maybeMistake = true;
        }
        if (level === 2) {
          await h.expect(feedback.includes('남성은 X 염색체가 하나뿐'), '남성 보인자 오답 안내가 없습니다.');
          await h.caption('X가 하나니까 정상 남성은 보인자가 아니네.');
          h.result.maleMistake = true;
        }
        await h.think(1800); await h.mark(`${level + 1}단계-판정-근거`);
        await h.tap(h.loc('#judge'));
        h.result.levelsCompleted++;
      });
    }
    await h.step('결과와-설명', async () => {
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.completed = h.result.levelsCompleted === 4;
      await h.finish('4단계 왼쪽 딸은 색맹 아버지에게서 a가 있는 X를 받았다. 자신은 정상이라 보인자다. 사람은 교배 실험을 할 수 없어 가족의 형질로 추론한다.');
    });
  }
};
