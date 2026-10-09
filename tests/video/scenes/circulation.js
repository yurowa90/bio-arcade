'use strict';

const NAMES = { RA: '우심방', RV: '우심실', LA: '좌심방', LV: '좌심실', Ao: '대동맥', VC: '대정맥', PA: '폐동맥', PV: '폐정맥' };
// 온몸의 모세 혈관에서 출발해 돌아오는 경로를 배운 학생의 기억.
const REMEMBERED_ROUTE = ['대정맥', '우심방', '우심실', '폐동맥', '폐정맥', '좌심방', '좌심실', '대동맥'];

async function view(h) {
  return h.game.evaluate(() => {
    const p = window.__circ.pending(), ctrl = document.getElementById('ctrl');
    const target = document.querySelector('#board .square.asked, #board .square.current');
    return { type: p.type, token: p.token, prompt: ctrl.querySelector('.prompt')?.textContent || '',
      square: target?.dataset.square,
      buttons: [...ctrl.querySelectorAll('button:not([disabled])')].map(b => ({ key: b.dataset.k, text: b.textContent })),
      feedback: ctrl.querySelector('.feedback')?.textContent,
      mode: document.getElementById('mode').textContent,
      ready: Number(ctrl.dataset.token) === p.token && !!ctrl.querySelector('button:not([disabled])') };
  });
}

module.exports = {
  id: 'circulation', title: '혈액 순환 일주', path: 'games/circulation/index.html',
  async play(h) {
    const deadline = Date.now() + 180000;
    let wrong = false, wrongRead = false, darkNames = 0, darkSeen = false;
    h.result.help = '별도 힌트 버튼 없음. 판 범례·교환 안내·완성 경로를 읽음.';
    await h.step('규칙-읽기', () => h.intro());
    await h.step('판의-방향과-범례', async () => {
      await h.caption('그림 속 사람의 오른쪽이 내 왼쪽이네.');
      await h.read(h.loc('#status')); await h.think(1000);
    });
    for (let turn = 0; turn < 160 && Date.now() < deadline; turn++) {
      if (await h.loc('#ar-retry').count()) break;
      let ok = false;
      await h.step(`입력-${turn + 1}`, async () => {
        await h.game.waitForFunction(() => {
          const p = window.__circ.pending(), ctrl = document.getElementById('ctrl');
          return p.type === 'end' || Number(ctrl.dataset.token) === p.token && !!ctrl.querySelector('button:not([disabled])');
        }, null, { timeout: Math.max(1, Math.min(16000, deadline - Date.now())) });
        const v = await view(h);
        if (v.type === 'end') { ok = true; return; }
        await h.expect(v.ready, '아직 혈액 이동 연출 중입니다.');
        let pick;
        if (['nameStart', 'name', 'fillName'].includes(v.type)) {
          // 현재 칸의 위치는 보이지만 이름은 지워져 있다. 칸 위치와 교과서 경로로 이름을 판단한다.
          const structure = v.square?.replace(/[123]$/, '');
          const name = NAMES[structure];
          await h.expect(!!name, '현재 또는 점선 칸의 위치를 읽지 못했습니다.');
          if (structure === 'PV' && !wrong) {
            await h.caption('산소가 많으니 이건 폐동맥 아닐까.');
            pick = v.buttons.find(b => b.text === '폐동맥'); wrong = true;
          } else {
            if (turn < 8) await h.caption(`${name}을 지나면 어디로 이어질까.`);
            pick = v.buttons.find(b => b.text === name);
          }
          await h.think(450);
        } else if (/reason/i.test(v.type)) {
          await h.caption('혈관 이름은 심장에서 나가고 들어오는 방향이지.');
          pick = v.buttons.find(b => /^심장(에서 나가는|으로 들어오는)/.test(b.text));
          await h.think(450);
        } else if (v.type === 'finalName') {
          if (!darkSeen) { darkSeen = true; await h.caption('이제 판 없이 지나는 순서를 떠올려 보자.'); }
          pick = v.buttons.find(b => b.text === REMEMBERED_ROUTE[darkNames]);
          await h.think(650); darkNames++;
        } else if (v.type === 'finalBoundary') {
          await h.caption('폐순환은 좌심방까지, 온몸순환은 좌심실부터.');
          pick = v.buttons.find(b => b.text === (v.prompt.includes('폐순환') ? '좌심방' : '좌심실'));
          await h.think(650);
        } else if (v.type === 'die') {
          // 보기의 눈이 큰 주사위를 고른다. 감춰진 도착 칸의 이름은 읽지 않는다.
          pick = v.buttons.slice().sort((a, b) => {
            const count = s => Number(s.match(/\s([1-6])\s*→/)?.[1] || 0);
            return count(b.text) - count(a.text);
          })[0];
          if (turn % 8 === 0) await h.caption('이번 주사위는 더 멀리 가는 걸 골라 보자.');
          await h.think(250);
        } else if (v.type === 'organ') {
          pick = v.buttons[0]; await h.caption(`${pick.text}의 모세 혈관도 지나 보자.`);
          await h.think(350);
        } else if (v.type === 'continue') {
          await h.read(h.loc('#ctrl .feedback'));
          if (wrong && v.feedback?.includes('폐정맥')) {
            wrongRead = true; h.result.wrongFeedback = v.feedback;
            await h.caption('산소가 많아도 심장으로 들어가면 정맥이네.');
          }
          pick = v.buttons[0];
        } else if (v.type === 'darkStart') {
          await h.caption('폐에서 산소를 받고 온몸 세포에 내주는구나.');
          await h.read(h.loc('#route')); await h.mark('완성된-경로');
          pick = v.buttons[0];
        } else if (v.type === 'roll') pick = v.buttons[0];
        else throw new Error(`계획에 없는 조작 단계: ${v.type}`);
        await h.expect(!!pick, `화면 보기에서 ${v.type}의 선택을 찾지 못했습니다.`);
        await h.tap(h.loc(`#ctrl button[data-k="${pick.key}"]:not([disabled])`), { fast: true });
        ok = true;
      });
      if (!ok) break;
    }
    h.result.pulmonaryMistake = wrong && wrongRead;
    h.result.darkNames = darkNames;
    if (!h.result.pulmonaryMistake) await h.step('누락-폐정맥-오답', async () => {
      throw new Error('폐정맥을 산소 양으로 잘못 판단한 장면과 오답 해설을 수행하지 못했습니다.');
    });
    await h.step('결과와-설명', async () => {
      await h.expect(await h.loc('#ar-retry').isVisible(), '180초 상한 안에 마지막 바퀴를 끝내지 못했습니다.');
      h.result.completed = true;
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.score = Number((await h.loc('#score').textContent()).replace('점', ''));
      await h.finish('우심방→우심실→폐동맥→폐의 모세 혈관에서 산소 받기→폐정맥→좌심방→좌심실→대동맥→온몸의 모세 혈관에서 산소 주기→대정맥→우심방. 폐순환은 우심실부터 좌심방까지, 온몸순환은 좌심실부터 우심방까지다.');
    });
  }
};
