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
    await h.step('기본-판-고르기', () => h.tap(h.loc('#choose-basic')));
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
        await h.caption(THOUGHTS[level]); await h.think(1000);
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
        await h.think(600); await h.mark(`${level + 1}단계-판정-근거`);
        await h.tap(h.loc('#judge'));
        h.result.levelsCompleted++;
      });
    }
    await h.step('결과와-설명', async () => {
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.completed = h.result.levelsCompleted === 4;
      await h.finish('4단계 왼쪽 딸은 색맹 아버지에게서 a가 있는 X를 받았다. 자신은 정상이라 보인자다. 사람은 교배 실험을 할 수 없어 가족의 형질로 추론한다.');
    });
    // 제작 때 makeBundle(123, 1)을 avoid 없이 만들고 explain·walkthrough를 다시 읽었다.
    // 첫 문제(X, shapeId 4f54f7ed): 발현한 아들 10번→어머니 7번.
    // 정상 아버지 1번→7번의 a는 어머니 2번에게서 왔다. 발현한 아버지 3번→정상 딸 9번.
    // walkthrough는 10→7, 1번 정상→2, 3→9 순서로 설명하며 결론은 2·7·9번이다.
    // 둘째(상염색체, shapeId 469b188d): 발현한 9번→부모 5·6번.
    // 카드 ①: 어머니 1번에게 a 없음→5번의 a는 아버지 2번에게서 왔다.
    // walkthrough는 9→5, 카드 ①→2, 9→6 순서로 설명하며 결론은 2·5·6번이다.
    // 장면 실행 중에는 solve·explain·walkthrough·숨은 유전자형을 읽지 않는다.
    // 213.8초 녹화 뒤 줄인 19초 대기를 유지하고 명시적 생각 대기를 4.8초 더 줄였다.
    // 기본 판 4문제→결과→도전 1 두 문제 구성은 유지한다. 실제 210초 이하는 재녹화로 확인한다.
    const challengeMarks = [['p7', 'p2', 'p9'], ['p5', 'p6', 'p2']];
    const challengeThoughts = [
      ['10번 아들의 X는 어머니 7번에게서 왔다.', '7번의 아버지 1번은 정상. 색맹 대립유전자는 어머니 2번에게서 왔다.', '색맹 아버지 3번의 정상 딸 9번도 보인자다.'],
      ['9번이 aa이므로 부모 5·6번에게 a를 하나씩 받았다.', '①에서 어머니 1번에게는 a가 없다.', '5번의 a는 아버지 2번에게서 왔다. 정상인 2번도 보인자다.'],
    ];
    await h.step('도전-1-고정-문제-열기', async () => {
      await h.goto('games/pedigree/index.html?seed=123');
      await h.intro({ readGame: false }); await h.tap(h.loc('#choose-1'));
      await h.caption('연습용 고정 문제다. 가계도와 자료를 이어 보자.'); await h.read(h.loc('#practice'));
    });
    h.result.challengeProblems = 0;
    for (let i = 0; i < 2; i++) {
      await h.step(`도전-1-${i + 1}-단서-조합`, async () => {
        await h.read(h.loc('#field')); await h.read(h.loc('#clues'));
        for (const thought of challengeThoughts[i]) { await h.caption(thought); await h.think(1000); }
        for (const id of challengeMarks[i]) await h.tap(h.loc(`#field .person[data-id="${id}"]`));
        await h.tap(h.loc('#judge')); await h.read(h.loc('#result'));
        await h.expect((await h.loc('#result').innerText()).includes('완전 해결'), '미리 정한 도전 추론과 판정이 다릅니다.');
        await h.caption('놓침과 지뢰가 없다. 풀이에서 단서를 이어 보자.');
        await h.tap(h.loc('#show-solution')); await h.read(h.loc('#solution'));
        await h.tap(h.loc('#next-step')); await h.read(h.loc('#solution'));
        h.result.challengeProblems++;
        if (i === 0) await h.tap(h.loc('#judge'));
      });
    }
  }
};
