'use strict';

async function clearPots(h) {
  const selected = h.loc('#garden .pot[aria-pressed="true"]');
  while (await selected.count()) await h.tap(selected.first());
}
async function selectPot(h, index) { await clearPots(h); await h.tap(h.loc(`#garden .pot[data-i="${index}"]`)); }

// 검정 교배로 실제 보이는 씨앗의 모양·색을 읽는다. 숨은 부모 유전자형은 읽지 않는다.
async function evidenceAnswer(h) {
  return h.loc('#overlay .offspring .seed svg').evaluateAll(seeds => {
    if (!seeds.length) return null; // 열성 표현형은 검정 교배 대신 추론 문항을 띄운다.
    const wrinkled = seeds.some(svg => svg.querySelector('path'));
    const green = seeds.some(svg => svg.querySelector('[fill="#7cb342"]'));
    const title = document.querySelector('#overlay .card > p').textContent;
    return (title.includes('주름지고') ? 'rr' : wrinkled ? 'Rr' : 'RR') + (title.includes('녹색') ? 'yy' : green ? 'Yy' : 'YY');
  });
}
async function answerGenotype(h, wrong = false) {
  await h.loc('#overlay [data-g]').first().waitFor({ state: 'visible' });
  await h.read(h.loc('#overlay .card'));
  const key = await evidenceAnswer(h) || 'rryy';
  const candidates = await h.loc('#overlay [data-g]').evaluateAll(els => els.map(el => el.dataset.g));
  const choice = wrong ? (candidates.includes('RRYY') && key !== 'RRYY' ? 'RRYY' : candidates.find(g => g !== key)) : key;
  await h.expect(!!choice && candidates.includes(choice), `자료에 맞는 유전자형 보기 없음: ${key}`);
  await h.caption(wrong ? (choice === 'RRYY' ? '둥글면 순종 아닐까. 일단 골라 보자.' : '잡종의 자손이니 이것도 잡종일까.') : '열성 자손이 있으면 작은 글자도 있겠네.');
  await h.tap(h.loc(`#overlay [data-g="${choice}"]`));
  await h.read(h.loc('#overlay .quiz-fb')); await h.think(1800); await h.mark(wrong ? '겉모습으로-순종-오판' : '자료로-판단');
  await h.tap(h.loc('#gclose')); await h.read(h.loc('#info > p').first());
}

module.exports = {
  id: 'mendel', title: '멘델의 텃밭', path: 'games/mendel/index.html',
  async play(h) {
    await h.step('규칙-읽기', async () => {
      h.expect(h.game.url().endsWith('/games/mendel/index.html'), '게임 iframe의 멘델 화면을 찾지 못했습니다.');
      await h.intro();
    });
    const crossed = await h.step('순종끼리-교배', async () => {
      await h.caption('순종 둘을 교배하면 어떻게 될까.');
      await h.tap(h.loc('.pot[data-i="0"]')); await h.tap(h.loc('.pot[data-i="1"]')); await h.tap(h.loc('#t-cross'));
      await h.read(h.loc('#overlay .card')); await h.think(1800);
      for (let i = 0; i < 2; i++) await h.tap(h.loc(`.seed[data-i="${i}"]`));
      await h.tap(h.loc('#plant')); await h.read(h.loc('#info'));
    });
    if (crossed) {
      await h.step('잡종-1대-추론', async () => {
        await selectPot(h, 2); await h.tap(h.loc('#t-test')); await h.read(h.loc('#overlay .card'));
        await h.caption('부모에게 RY와 ry를 하나씩 받겠네.');
        await h.tap(h.loc('[data-g="RrYy"]')); await h.read(h.loc('#overlay .quiz-fb')); await h.think(2000); await h.tap(h.loc('#gclose'));
      });
      const harvested = await h.step('자가-수분과-씨앗-선택', async () => {
        await selectPot(h, 2); await h.caption('같은 완두인데 자손은 다를까.'); await h.tap(h.loc('#t-self'));
        await h.read(h.loc('#overlay .card')); await h.think(2300);
        // 첫 씨앗은 가능한 한 둥글고 황색으로 고른다. 나머지는 화면의 서로 다른 표현형부터.
        const seeds = await h.loc('#overlay button.seed').evaluateAll(els => els.map(el => ({ index: el.dataset.i, phenotype: el.getAttribute('aria-label') })));
        const picked = [], add = seed => { if (seed && !picked.includes(seed.index)) picked.push(seed.index); };
        add(seeds.find(s => s.phenotype === '둥글고 황색'));
        for (const phenotype of ['둥글고 녹색', '주름지고 황색', '주름지고 녹색']) add(seeds.find(s => s.phenotype === phenotype));
        for (const seed of seeds) { if (picked.length >= 5) break; add(seed); }
        h.result.plantedPhenotypes = picked.map(index => seeds.find(s => s.index === index).phenotype);
        for (const index of picked) await h.tap(h.loc(`button.seed[data-i="${index}"]`));
        await h.tap(h.loc('#plant')); await h.read(h.loc('#info'));
      });
      if (harvested) {
        // 화분 0~3은 부모와 1대 두 그루. 이번 수확은 화면의 빈 화분 4번부터 심어진다.
        await h.step('검정-교배-오개념', async () => { await selectPot(h, 4); await h.tap(h.loc('#t-test')); await answerGenotype(h, true); });
        await h.step('다시-검정-교배', async () => {
          await h.caption('겉모습만 보고 순종이라 하면 안 되네.');
          await selectPot(h, 4); await h.tap(h.loc('#t-test')); await answerGenotype(h);
        });
        for (let index = 5; index <= 6; index++) await h.step(`다른-완두-${index}`, async () => {
          await selectPot(h, index); await h.tap(h.loc('#t-test')); await answerGenotype(h);
        });
      }
    }
    await h.step('실험-노트', async () => {
      await h.caption('딱 9대 3대 3대 1은 아니구나.');
      await h.loc('#info').evaluate(el => el.scrollIntoView({ block: 'end' }));
      await h.read(h.loc('.note-table')); await h.read(h.loc('#info .note')); await h.think(2200);
      h.result.help = '별도 도움말 버튼 없음. 추론·검정 교배의 까닭과 실험 노트 안내를 읽음.';
    });
    await h.step('실험-마치기', async () => {
      await h.caption('카드를 다 모으진 못했지만 정리해 보자.'); await h.tap(h.loc('#t-end'));
      await h.finish('R과 r, Y와 y가 나뉘고 서로 따로 조합된다. 그래서 네 겉모습이 나온다. 씨앗이 16개라 우연히 비율이 달라질 수 있다.');
    });
  }
};
