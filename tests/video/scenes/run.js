'use strict';

const { performance } = require('node:perf_hooks');

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
      // 경계만 스치는 예측은 입력·프레임의 작은 흔들림에 약하다. 벽은 넓게 피하고 중앙에 닿는다.
      if (it.k === 'wall') {
        const distance = Math.abs(x - 110);
        if (distance < 40) {
          const risk = Math.max(0, Math.min(1, (y - v.ground + 65) / 25));
          value -= 180 * risk * (1 - (distance / 40) ** 4) * .02 * v.speed / 52;
        }
        continue;
      }
      if (seen.has(i) || Math.abs(x - 110) >= 20) continue;
      const hit = Math.abs(y - 22 - it.y) < 26;
      if (hit) {
        seen.add(i);
        // 생존에는 장애물 회피와 세포 전달을 우선한다. 물체 개수만 최대화하지 않는다.
        if (it.k === 'cell') {
          value += nutrition && oxygen ? 110 : 10;
          if (nutrition && oxygen) { nutrition--; oxygen--; }
        } else if (it.k === 'o2') {
          value += oxygen < 10 ? 16 : 0;
          oxygen = Math.min(10, oxygen + 1);
        } else { value += nutrition < 10 ? 12 : 0; nutrition = Math.min(10, nutrition + 1); }
      }
    }
  }
  return value;
}
function planJump(v, latency, pending) {
  const baseline = score(v, []);
  let best = { value: baseline + 1, times: null };
  // 기존 예약은 남은 시간만 적용한다. 매번 반응 지연을 더하면 점프가 늦어진다.
  const delays = pending?.length ? [Math.max(latency, pending[0] - v.t)] : [];
  for (let delay = latency; delay <= 1.2; delay += .04) delays.push(delay);
  for (const delay of delays) {
    // 앞 탭과 확인이 끝난 뒤 다음 입력을 보낼 수 있는 간격으로 고른다.
    for (const second of [null, latency + .08, Math.max(.6, latency + .08)]) {
      const times = second === null ? [delay] : [delay, delay + second];
      // 측정 뒤에도 입력이 ±0.08초 흔들릴 수 있으므로 세 예측 중 가장 나쁜 결과를 비교한다.
      const value = Math.min(...[-.08, 0, .08].map(offset => score(v, times.map(time => Math.max(0, time + offset))))) - delay * .1;
      if (value > best.value) best = { value, times };
    }
  }
  return best.times?.map(delay => v.t + delay) || null;
}

function nextJump(v, latency, pending) {
  // 예약한 실제 점프 시각보다 측정한 입력 지연만큼 탭을 먼저 시작한다.
  const times = planJump(v, latency, pending);
  return { times, tap: !!times?.length && v.jumps < 2 && times[0] - v.t <= latency + .04 };
}
function measuredLatency(samples) {
  if (!samples.length) return .45;
  // 지연이 흔들려 매번 예약이 움직이지 않도록 최근 5회의 중앙값을 쓴다.
  const sorted = samples.slice(-5).map(s => s.gameSec).sort((a, b) => a - b);
  return Math.max(.02, sorted[Math.floor(sorted.length / 2)]);
}
async function tapAndMeasure(h, point, before, samples) {
  const instructedAt = performance.now();
  let settled = false, observed = null;
  let previous = { at: instructedAt, t: before.t, jumps: before.jumps };
  // 탭이 끝나기를 기다리지 않고 jumps가 처음 증가할 때까지 함께 관찰한다.
  const tapping = h.tapPoint(point, { fast: true }).finally(() => { settled = true; });
  // 관찰이 실패해도 처리되지 않은 탭 예외를 남기지 않는다.
  tapping.catch(() => {});
  try {
    while (performance.now() - instructedAt < 2000) {
      const current = await view(h), at = performance.now();
      if (current.jumps > previous.jumps) {
        const gameSec = (previous.t + current.t) / 2 - before.t;
        observed = { gameSec, wallSec: ((previous.at + at) / 2 - instructedAt) / 1000,
          uncertaintySec: (at - previous.at) / 1000, at: before.t, observedAt: current.t };
        samples.push(observed); break;
      }
      if (current.done || settled) break;
      previous = { at, t: current.t, jumps: current.jumps };
      await h.page.waitForTimeout(10);
    }
  } finally { await tapping; }
  return observed;
}

module.exports = {
  id: 'run', title: '에너지 런', path: 'games/run/index.html',
  // 브라우저 없이도 녹화와 같은 예약·선행 입력 정책을 검증한다.
  policy: { planJump, nextJump, measuredLatency },
  async play(h) {
    h.result.help = '별도 도움말 버튼 없음. 규칙과 세포 전달 안내를 읽음.';
    // 시작한 뒤에는 이미 달리고 있다. 규칙을 읽고 시작하면 곧바로 물체를 본다.
    await h.step('규칙-읽기', () => h.intro({ readGame: false }));
    await h.step('혈액으로-달리기', async () => {
      const deadline = Date.now() + 68000;
      let pending = null, lastZone = -1, warningSeen = false;
      const samples = [];
      h.result.jumpLatencySamples = samples;
      // 판 중 캔버스 위치는 고정이다. 대상 확인·좌표 계산은 한 번만 한다.
      const point = await h.target(h.loc('#cv'));
      await h.caption('영양소와 산소를 받아 세포에 전해 보자.');
      while (Date.now() < deadline) {
        let v = await view(h), refresh = false;
        if (v.done) break;
        const zone = Math.floor(v.t / 6);
        if (zone !== lastZone) {
          const captions = [
            '소장에서 영양소를 받아 실어 보자.',
            '폐에서 산소도 충분히 받아 가자.',
            '근육 세포 높이에 맞춰 둘 다 전하자.',
            '콩팥에서는 요소가 빠져나가는구나.',
            '다시 소장이다. 영양소를 받아 두자.',
            '이번엔 폐에서 산소도 꼭 받아 가자.',
            '영양소와 산소를 같이 세포에 전하자.',
            '장애물도 보고 세포 높이도 맞춰 보자.',
            '남은 시간에도 영양소를 받아 두자.',
            '마지막 폐다. 이산화 탄소도 줄어드네.'
          ];
          await h.caption(captions[Math.min(zone, captions.length - 1)]);
          refresh = true;
          lastZone = zone;
        }
        if (!warningSeen && v.noO2 > 0 && v.lesson.includes('산소가 없어')) {
          warningSeen = true; h.result.noOxygenFeedback = v.lesson;
          await h.caption('영양소만으로 안 되네. 산소도 있어야 해.');
          await h.mark('산소-누락-안내');
          refresh = true;
        }
        // 자막·사진의 왕복 시간까지 점프 지연으로 세지 않도록 상태를 새로 읽는다.
        if (refresh) v = await view(h);
        if (v.done) break;
        const latency = measuredLatency(samples);
        const action = nextJump(v, latency, pending);
        pending = action.times;
        if (action.tap) {
          const observed = await tapAndMeasure(h, point, v, samples);
          if (!observed) (h.result.notes ||= []).push(`${v.t.toFixed(1)}초 점프 지연: 증가 시각 관찰 못 함`);
          // 2단 점프를 골랐다면 두 번째 입력에도 처음 정한 시점을 유지한다.
          pending.shift();
        }
        await h.think(40);
      }
      await h.expect(await h.loc('#ar-retry').isVisible(), '68초 상한 안에 판이 끝나지 않았습니다.');
      const end = await view(h);
      h.result.seconds = Math.round(end.t * 10) / 10;
      h.result.survived = end.t >= 60;
      h.result.energyMade = end.made; h.result.hits = end.hits;
      h.result.noOxygenMistake = warningSeen;
      h.result.jumpLeadSec = measuredLatency(samples);
      if (!warningSeen) (h.result.notes ||= []).push('자연 판의 산소 부족 안내: 관찰 못 함');
    });
    await h.step('결과와-설명', async () => {
      h.result.stars = Number((await h.loc('.big-stars .stars').getAttribute('aria-label')).match(/\d+/)[0]);
      h.result.score = Number((await h.loc('#dist').textContent()).match(/\d+/)[0]);
      await h.finish('소화계가 영양소를 흡수하고 호흡계가 산소를 받는다. 순환계가 둘을 세포에 전해야 세포 호흡을 한다. 이산화 탄소는 폐로, 요소는 배설계의 콩팥으로 내보낸다.');
    });
  }
};
