// 광합성 대결의 모든 수열을 전수 탐색해 별 기준과 난이도를 확인한다.
// 매 턴 선택 = 기공 상태(열림·닫힘, 바꾸는 데 턴을 쓰지 않음) × 행동 3가지 → 6^10 ≈ 6천만 수열.
// 앞으로의 진행은 상태(턴·녹말·물·기공·잎·날씨)만으로 정해지므로, 같은 상태에 이른 수열을 하나로
// 합쳐 개수만 더한다. 그래서 모든 수열을 하나하나 돌린 것과 결과가 같다.
const B = require('../games/quest/js/battles.js');

// 반환: { finals: [{ s, nightOpen, count, seq }], total }
function explorePhoto() {
  const keyOf = (s, nightOpen) => { const { history, lastLog, last, ...rest } = s; return JSON.stringify(rest) + '|' + nightOpen; };
  let cur = new Map([[keyOf(B.photoInit(), false), { s: B.photoInit(), nightOpen: false, count: 1, seq: [] }]]);
  for (let t = 1; t <= B.PHOTO.maxTurns; t++) {
    const next = new Map();
    for (const v of cur.values()) {
      for (const open of [true, false]) {
        const s1 = v.s.stomata === open ? v.s : B.photoToggle(v.s);
        for (const a of B.PHOTO.actions.map(x => x.id)) {
          const n = B.photoStep(s1, a);
          const h = n.history[n.history.length - 1];
          const nightOpen = v.nightOpen || (h.night && h.stomata);
          const k = keyOf(n, nightOpen);
          const e = next.get(k);
          if (e) e.count += v.count;
          else next.set(k, { s: n, nightOpen, count: v.count, seq: [...v.seq, `${open ? '열림' : '닫힘'}:${a}`] });
        }
      }
    }
    cur = next;
  }
  const finals = [...cur.values()];
  return { finals, total: finals.reduce((a, f) => a + f.count, 0) };
}

if (require.main === module) {
  const { finals, total } = explorePhoto();
  const best = arr => arr.reduce((b, f) => (!b || f.s.starch > b.s.starch ? f : b), null);
  const bo = best(finals.filter(f => f.nightOpen)), bc = best(finals.filter(f => !f.nightOpen));
  const pct = c => (c / total * 100).toFixed(4) + '%';
  console.log('수열 수', total, '/ 서로 다른 끝 상태', finals.length);
  console.log('goal', B.PHOTO.goal, 'stars', B.PHOTO.stars.join(','));
  console.log('밤에 기공을 연 수열의 최대 녹말', bo.s.starch, '—', bo.seq.join(' '));
  console.log('밤에 기공을 닫은 수열의 최대 녹말', bc.s.starch, '—', bc.seq.join(' '));
  for (let n = 0; n <= 3; n++) {
    const c = finals.filter(f => (f.s.stars || 0) === n).reduce((a, f) => a + f.count, 0);
    console.log(`별 ${n}: ${pct(c)}`);
  }
  console.log('마구 눌러서 이길 확률', pct(finals.filter(f => f.s.win).reduce((a, f) => a + f.count, 0)));
  // 순진한 전략들(기공 'stomata'는 턴을 쓰지 않음)
  const run = seq => seq.reduce((s, a) => B.photoStep(s, a), B.photoInit());
  const opening = 'stomata water water leaf water leaf water'.split(' '); // 1~6턴: 물을 모아 두고 잎·물 번갈아
  const naive = {
    '기다리기만': Array(10).fill('wait'),
    '기공 열고 기다리기': ['stomata', ...Array(10).fill('wait')],
    '물만 흡수(기공 닫힘)': Array(10).fill('water'),
    '기공 열고 물만 흡수': ['stomata', ...Array(10).fill('water')],
    '물을 모아 두고 잎·물 번갈아, 밤에도 기공 열어 둠': [...opening, 'leaf', 'water', 'leaf', 'water'],
    '물을 모아 두고 잎·물 번갈아, 밤에 기공 닫음': [...opening, 'stomata', 'leaf', 'stomata', 'water', 'leaf', 'water'],
  };
  for (const [k, seq] of Object.entries(naive)) { const r = run(seq); console.log(k, '→ 녹말', r.starch, r.win ? `WIN ★${r.stars}` : 'lose'); }
}

module.exports = { explorePhoto };
