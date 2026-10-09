'use strict';

module.exports = {
  id: 'hub', title: '생명 오락실', path: 'index.html',
  async play(h) {
    await h.step('첫-화면', async () => {
      await h.caption('어떤 게임부터 해 볼까.'); await h.read(h.loc('.marquee')); await h.think(3000);
    });
    await h.step('가상-학생-입력', async () => {
      await h.caption('학번과 이름을 먼저 적자.');
      await h.type(h.loc('#sid'), '20315'); await h.type(h.loc('#sname'), '테스트');
      await h.tap(h.loc('.marquee')); await h.think(1800);
      await h.expect(await h.loc('#sid').inputValue() === '20315' && await h.loc('#sname').inputValue() === '테스트', '가상 학생 입력값이 다릅니다.');
    });
    await h.step('게임-목록', async () => {
      const cards = h.loc('#cabinets .cab');
      const captions = {
        quest: '섬을 걸으며 생물을 관찰하는구나.', mendel: '완두를 키우는 게임이 있네.',
        pedigree: '가족의 형질을 보고 추론해 볼까.', basepang: '염기는 어떤 짝끼리 맞출까.',
        run: '혈액이 되어 물질을 나르는구나.', circulation: '심장과 혈관을 따라 한 바퀴 돌아볼까.',
        organization: '세포부터 생물까지 이어 보자.', glucose: '혈당 그래프를 보며 조절하는구나.'
      };
      for (let i = 0; i < await cards.count(); i++) {
        const card = cards.nth(i);
        await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
        const id = (await card.getAttribute('href')).split('/')[1];
        await h.caption(captions[id] || '이 게임은 어떤 놀이일까.');
        await h.read(card); await h.think(1600); await h.mark(`게임-칸-${i + 1}`);
      }
    });
    await h.step('기록-요약과-제출-안내', async () => {
      await h.loc('#summary').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await h.caption('아직 한 게임 기록은 없네.'); await h.read(h.loc('.panel-dark').first()); await h.think(2200);
      await h.caption('복사한 다음 선생님께 보내는 거구나.'); await h.read(h.loc('#submit-hint')); await h.think(2500);
      // 실제 허브에는 제출 확인 창이 없다. 복사·다운로드는 실행하지 않는다.
      h.result.submission = { status: '건너뜀', reason: '제출 확인 창 없음. 요약 복사·JSON 저장은 즉시 실행되므로 안내만 읽음.' };
    });
    await h.step('기록-지우기-취소', async () => {
      const before = h.result.dialogs?.length || 0;
      await h.caption('지우면 되돌릴 수 없네. 취소하자.'); await h.tap(h.loc('#clear'));
      await h.expect((h.result.dialogs?.length || 0) === before + 1, '기록 지우기 확인 창을 관찰하지 못했습니다.');
      await h.read(h.loc('#summary')); await h.think(2600);
      await h.expect(await h.loc('#sid').inputValue() === '20315' && await h.loc('#sname').inputValue() === '테스트', '취소 뒤 학생 입력이 보존되지 않았습니다.');
    });
    await h.step('멘델-방문', async () => {
      await h.caption('멘델의 텃밭부터 둘러보자.');
      await h.tap(h.loc('.cab[href="games/mendel/index.html"]'));
      await h.loc('#ar-start').waitFor({ state: 'visible' });
      h.expect(h.game.url().endsWith('/games/mendel/index.html'), '게임 iframe이 멘델로 이동하지 않았습니다.');
      await h.caption('완두를 교배하고 자손을 살펴보는구나.'); await h.read(h.loc('#overlay .card')); await h.think(3500);
    });
    await h.step('오락실-복귀', async () => {
      await h.caption('규칙을 봤으니 오락실로 돌아가자.');
      await h.tap(h.loc('#ar-intro-hub')); await h.loc('#cabinets').waitFor({ state: 'visible' });
      await h.caption('다음엔 무엇을 해 볼까.');
      await h.read(h.loc('.marquee')); await h.think(3200);
      h.result.completed = true; h.result.returnedHub = true;
    });
  }
};
