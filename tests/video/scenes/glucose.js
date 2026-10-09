'use strict';

async function view(h) {
  return h.page.evaluate(() => {
    const gameDocument = document.getElementById('game').contentDocument;
    const cv = gameDocument.getElementById('cv'), x = Math.round(cv.width * .42);
    // 무대 쪽의 읽기 전용 복사본을 쓴다. 게임 캔버스의 context는 얻지 않는다.
    const probe = window.__videoGlucoseProbe ||= document.createElement('canvas');
    if (probe.width !== 1 || probe.height !== 510) { probe.width = 1; probe.height = 510; }
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, x, 100, 1, 510, 0, 0, 1, 510);
    // 빨간 점의 중심은 y = 600 - (혈당 - 30) / 320 * 490이다.
    const pixels = ctx.getImageData(0, 0, 1, 510).data;
    const rows = [];
    for (let i = 0; i < 510; i++) {
      const p = i * 4;
      if (pixels[p] > 160 && pixels[p + 1] < 100 && pixels[p + 2] < 100) rows.push(i + 100);
    }
    const y = rows.length ? rows[Math.floor(rows.length / 2)] : null;
    const clock = gameDocument.getElementById('clock').textContent;
    const [hour, minute] = clock.split(':').map(Number);
    return { g: y === null ? null : 30 + (600 - y) * 320 / 490,
      t: ((hour - 6) + minute / 60) * 45 / 18,
      toast: gameDocument.getElementById('toast').classList.contains('on') ? gameDocument.getElementById('toast').textContent : '',
      done: !!gameDocument.getElementById('ar-retry') };
  });
}

module.exports = {
  id: 'glucose', title: '혈당 지키기', path: 'games/glucose/index.html',
  async play(h) {
    h.result.help = '별도 힌트 버튼 없음. 시작 규칙·화면 조작 안내를 읽음.';
    await h.step('기본-모드-규칙', async () => {
      await h.tap(h.loc('#overlay [data-mode="normal"]')); await h.intro();
    });
    await h.step('하루-혈당-조절', async () => {
      const deadline = Date.now() + 52000;
      let holding = false, pending = null, wrongStarted = null, corrected = false;
      let last = null, lastCaption = '', warning = false, recoveryCaptionUntil = 0;
      const change = async wanted => {
        if (wanted === holding) return;
        if (wanted) await h.down(h.loc('#cv')); else await h.up();
        holding = wanted;
      };
      try {
        await h.caption('혈당이 높으면 떼는 거였나. 해 보자.');
        while (Date.now() < deadline) {
          const v = await view(h);
          if (v.done) break;
          await h.expect(v.g !== null && Number.isFinite(v.t), '현재 혈당 점이나 시계를 읽지 못했습니다.');
          // 첫 식사에 혈당이 높은데도 손을 떼어 글루카곤을 분비하는 오개념을 한 번 보인다.
          if (!corrected) {
            await change(false);
            if (v.g > 180 && wrongStarted === null) { wrongStarted = Date.now(); h.result.wrongHighAt = Math.round(v.g); }
            if (v.toast.includes('혈당이 너무 높다')) {
              warning = true; h.result.wrongFeedback = v.toast;
              if (wrongStarted !== null && Date.now() - wrongStarted >= 2300) {
                corrected = true; await h.caption('높을 땐 눌러서 인슐린을 내보내는 거네.');
                recoveryCaptionUntil = Date.now() + 2300;
                await h.mark('고혈당-오답-안내');
              }
            }
          }
          if (corrected) {
            const slope = last ? (v.g - last.g) / Math.max(.05, (Date.now() - last.at) / 1000) : 0;
            const predicted = v.g + slope * 1.2;
            const wanted = predicted > 145 ? true : predicted < 100 ? false : holding;
            if (wanted !== holding) {
              if (!pending || pending.wanted !== wanted) pending = { wanted, at: Date.now() + 200 + h.random() * 200 };
              if (Date.now() >= pending.at) { await change(wanted); pending = null; }
            } else pending = null;
            const caption = v.t >= 39 ? '야식 뒤에도 그래프가 오르는지 보자.'
              : v.t >= 32 ? '저녁을 먹으면 조금 일찍 눌러 보자.'
                : v.t >= 24 ? '운동하면 내려가니까 손을 뗄 준비를 하자.'
                  : v.t >= 16 ? '점심 뒤 올라간다. 계속 보고 조절하자.'
                    : '호르몬 효과가 늦으니 오르내림을 미리 보자.';
            if (Date.now() >= recoveryCaptionUntil && caption !== lastCaption) { await h.caption(caption); lastCaption = caption; }
          }
          last = { g: v.g, at: Date.now() };
          await h.think(125);
        }
      } finally { await h.up(); }
      await h.expect(warning && corrected, '혈당이 높은데 손을 뗀 오답과 경고 읽기를 끝내지 못했습니다.');
      await h.expect(await h.loc('#ar-retry').isVisible(), '52초 상한 안에 하루 결과가 나오지 않았습니다.');
      h.result.completedDay = true;
    });
    await h.step('결과와-설명', async () => {
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.score = Number((await h.loc('#tir').textContent()).replace('%', ''));
      await h.finish('누르기는 인슐린, 떼기는 글루카곤 분비다. 혈당이 오르면 인슐린이 낮추고 내려가면 글루카곤이 높인다. 변화를 반대로 줄이는 음성 피드백이다.');
    });
  }
};
