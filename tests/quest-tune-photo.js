// 광합성 대결의 최선 수를 전수 탐색해 난이도를 확인한다(4^10 ≈ 100만).
const B = require('../games/quest/js/battles.js');
const acts = B.PHOTO.actions.map(a => a.id);
let best = -1, bestSeq = null, count = 0, wins = 0;
function dfs(s, seq) {
  if (s.turn > B.PHOTO.maxTurns || s.done) {
    count++; if (s.win) wins++;
    if (s.starch > best || (s.win && s.starch >= best)) { best = s.starch; bestSeq = seq.slice(); }
    return;
  }
  for (const a of acts) { seq.push(a); dfs(B.photoStep(s, a), seq); seq.pop(); }
}
dfs(B.photoInit(), []);
console.log('goal', B.PHOTO.goal, 'best starch', best, 'win rate of random play', (wins / count * 100).toFixed(2) + '%');
console.log('best seq', bestSeq.join(' '));
// 순진한 전략들
const run = seq => seq.reduce((s, a) => B.photoStep(s, a), B.photoInit());
const naive = {
  '기다리기만': Array(10).fill('wait'),
  '기공 열고 기다리기': ['stomata', ...Array(9).fill('wait')],
  '물만 흡수': Array(10).fill('water'),
};
for (const [k, seq] of Object.entries(naive)) { const r = run(seq); console.log(k, '→ 녹말', r.starch, r.win ? 'WIN' : 'lose'); }
