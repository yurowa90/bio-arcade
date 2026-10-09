'use strict';

async function view(h) {
  return h.game.evaluate(() => {
    const s = window.__run.state();
    const cv = document.getElementById('cv');
    // 다음 아이템 일정(queue)은 읽지 않는다. 보이는 물체·몸 높이·계기판 수치를 읽는다.
    return { t: s.t, y: s.y, vy: s.vy, jumps: s.jumps, ground: cv.height - 60,
      speed: s.t > 0 ? s.x / s.t : 230, nutrition: s.nut.length, oxygen: s.O,
      items: s.items.filter(it => !it.got && it.x >= 84 && it.x <= cv.width).map(it => ({ x: it.x, y: it.y, k: it.k, z: it.z })),
      noO2: s.stats.cellsNoO2, made: s.made, hits: s.stats.hits,
      lesson: document.getElementById('lesson').textContent,
      done: !!document.getElementById('ar-retry') };
  });
}
function score(v, jumpTimes) {
  let y = v.y, vy = v.vy, jumps = v.jumps, value = -jumpTimes.length;
  let nextJump = 0, nutrition = v.nutrition, oxygen = v.oxygen;
  const seen = new Set();
  // 화면에 들어온 물체만 거리 / 현재 속도로 예측한다. 미래 일정은 읽지 않는다.
  for (let t = .02; t <= 1.8; t += .02) {
    if (nextJump < jumpTimes.length && t >= jumpTimes[nextJump]) {
      if (jumps >= 2) return -Infinity;
      vy = jumps ? -560 : -620; jumps++;
      nextJump++;
    }
    vy += 1500 * .02; y += vy * .02;
    if (y >= v.ground) { y = v.ground; vy = 0; jumps = 0; }
    for (let i = 0; i < v.items.length; i++) {
      const it = v.items[i], x = it.x - v.speed * t;
      if (seen.has(i) || Math.abs(x - 110) >= 26) continue;
      const hit = it.k === 'wall' ? y > v.ground - 40 : Math.abs(y - 22 - it.y) < 34;
      if (hit) {
        seen.add(i);
        // 생존에는 장애물 회피와 세포 전달을 우선한다. 물체 개수만 최대화하지 않는다.
        if (it.k === 'wall') value -= 180;
        else if (it.k === 'cell') {
          value += nutrition && oxygen ? 65 : 30;
          if (nutrition && oxygen) { nutrition--; oxygen--; }
        } else if (it.k === 'o2') {
          // 첫 폐에서는 산소를 두 개만 보충해 뒤의 세포에서 부족을 경험한다.
          // 전부 건너뛰어 첫 세포 구간의 에너지 공급까지 잃지는 않는다.
          value += v.t + t < 12.3 && oxygen >= 5 ? -60 : oxygen < 10 ? 12 : 0;
          oxygen = Math.min(10, oxygen + 1);
        } else { value += nutrition < 10 ? 12 : 0; nutrition = Math.min(10, nutrition + 1); }
      }
    }
  }
  return value;
}
function planJump(v, reaction, pending) {
  const baseline = score(v, []);
  let best = { value: baseline + 1, times: null };
  // 기존 예약은 남은 시간만 적용한다. 매번 반응 지연을 더하면 점프가 늦어진다.
  const delays = pending?.length ? [Math.max(0, pending[0] - v.t)] : [];
  for (let delay = reaction; delay <= 1.2; delay += .06) delays.push(delay);
  for (const delay of delays) {
    for (const second of [null, .2, .4, .6]) {
      const times = second === null ? [delay] : [delay, delay + second];
      const value = score(v, times) - delay * .1;
      if (value > best.value) best = { value, times };
    }
  }
  return best.times?.map(delay => v.t + delay) || null;
}

module.exports = {
  id: 'run', title: '에너지 런', path: 'games/run/index.html',
  async play(h) {
    h.result.help = '별도 도움말 버튼 없음. 규칙과 세포 전달 안내를 읽음.';
    // 시작한 뒤에는 이미 달리고 있다. 규칙을 읽고 시작하면 곧바로 물체를 본다.
    await h.step('규칙-읽기', () => h.intro({ readGame: false }));
    await h.step('혈액으로-달리기', async () => {
      const deadline = Date.now() + 68000;
      let pending = null, lastZone = -1, warningSeen = false;
      await h.caption('영양소가 많으면 산소는 조금만 받아도 될까.');
      while (Date.now() < deadline) {
        const v = await view(h);
        if (v.done) break;
        const zone = Math.floor(v.t / 6);
        if (zone !== lastZone) {
          const captions = [
            '소장에서 영양소를 받아 실어 보자.',
            '산소를 조금만 받아도 충분할까.',
            '세포에 영양소를 주면 에너지가 생길까.',
            '콩팥에서는 요소가 빠져나가는구나.',
            '다시 소장이다. 영양소를 받아 두자.',
            '이번엔 폐에서 산소도 꼭 받아 가자.',
            '영양소와 산소를 같이 세포에 전하자.',
            '장애물도 보고 세포 높이도 맞춰 보자.',
            '남은 시간에도 영양소를 받아 두자.',
            '마지막 폐다. 이산화 탄소도 줄어드네.'
          ];
          await h.caption(captions[Math.min(zone, captions.length - 1)]);
          lastZone = zone;
        }
        if (!warningSeen && v.noO2 > 0 && v.lesson.includes('산소가 없어')) {
          warningSeen = true; h.result.noOxygenFeedback = v.lesson;
          await h.caption('영양소만으로 안 되네. 산소도 있어야 해.');
          await h.mark('산소-누락-안내');
        }
        pending = planJump(v, .2 + h.random() * .2, pending);
        if (pending?.length && v.t >= pending[0]) {
          if (v.jumps < 2) await h.tap(h.loc('#cv'), { fast: true });
          // 2단 점프를 골랐다면 두 번째 입력에도 처음 정한 시점을 유지한다.
          pending.shift();
        }
        await h.think(80);
      }
      await h.expect(await h.loc('#ar-retry').isVisible(), '68초 상한 안에 판이 끝나지 않았습니다.');
      const end = await view(h);
      h.result.seconds = Math.round(end.t * 10) / 10;
      h.result.survived = end.t >= 60;
      h.result.energyMade = end.made; h.result.hits = end.hits;
      h.result.noOxygenMistake = warningSeen;
    });
    if (!h.result.noOxygenMistake) await h.step('누락-산소-오개념', async () => {
      throw new Error('자연 판에서 영양소만 있는 세포 전달과 산소 부족 안내를 관찰하지 못했습니다.');
    });
    await h.step('결과와-설명', async () => {
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.score = Number((await h.loc('#dist').textContent()).match(/\d+/)[0]);
      await h.finish('소화계가 영양소를 흡수하고 호흡계가 산소를 받는다. 순환계가 둘을 세포에 전해야 세포 호흡을 한다. 이산화 탄소는 폐로, 요소는 배설계의 콩팥으로 내보낸다.');
    });
  }
};
