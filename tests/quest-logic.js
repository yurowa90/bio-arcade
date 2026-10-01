// 지도 연결·도달 가능성, 서식지별 낮/밤 생물, 체육관 규칙을 검증한다.
const D = require('../games/quest/js/data.js');
const B = require('../games/quest/js/battles.js');
let fail = 0;
const chk = (name, cond, extra = '') => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const WALK = new Set(['.', ',', ';', 'f', 'B']);

// 1. 지도 모양
for (const [id, m] of Object.entries(D.MAPS)) chk(`${id} 직사각형`, m.rows.every(r => r.length === m.rows[0].length));

// 2. 새싹마을 시작점에서 모든 지도·문으로 갈 수 있는가 (지도 사이 출구 포함 BFS)
const start = { map: 'town', x: 9, y: 5 };
const seen = new Set(); const q = [start]; const reachedDoors = new Set();
const key = p => `${p.map}:${p.x},${p.y}`;
seen.add(key(start));
while (q.length) {
  const p = q.shift(); const m = D.MAPS[p.map];
  const ex = m.exits.find(e => e.x === p.x && e.y === p.y);
  if (ex) { const n = { map: ex.to, x: ex.tx, y: ex.ty }; if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); } }
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const x = p.x + dx, y = p.y + dy;
    if (y < 0 || y >= m.rows.length || x < 0 || x >= m.rows[0].length) continue;
    const ch = m.rows[y][x];
    if ('DLGJ'.includes(ch)) reachedDoors.add(`${p.map}:${ch}`);
    if (!WALK.has(ch) || m.npcs.some(n => n.x === x && n.y === y)) continue;
    const n = { map: p.map, x, y };
    if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); }
  }
}
const maps = new Set([...seen].map(k => k.split(':')[0]));
chk('모든 지도에 도달 가능', Object.keys(D.MAPS).every(m => maps.has(m)), [...maps].join(','));
for (const d of ['town:D', 'town:L', 'leaftown:G', 'leaftown:D', 'route2:J']) chk(`문 도달: ${d}`, reachedDoors.has(d));
// 표지판·NPC 앞에 설 수 있는가
for (const [id, m] of Object.entries(D.MAPS)) {
  for (const s of Object.keys(m.signs)) {
    const [x, y] = s.split(',').map(Number);
    chk(`${id} 표지판 ${s} 접근`, [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has(`${id}:${x+dx},${y+dy}`)));
  }
  for (const n of m.npcs) chk(`${id} 인물 ${n.id} 접근`, [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has(`${id}:${n.x+dx},${n.y+dy}`)));
}
// 풀숲 존재
chk('숲 풀숲(,) 도달 가능', [...seen].some(k => { const [m, xy] = k.split(':'); const [x, y] = xy.split(',').map(Number); return D.MAPS[m].rows[y][x] === ','; }));
chk('습지 풀숲(;) 도달 가능', [...seen].some(k => { const [m, xy] = k.split(':'); const [x, y] = xy.split(',').map(Number); return D.MAPS[m].rows[y][x] === ';'; }));

// 3. 서식지·시간별 생물 풀
for (const h of ['forest', 'wetland']) for (const t of ['day', 'night']) {
  const pool = D.SPECIES.filter(s => s.habitat === h && (s.time === 'both' || s.time === t));
  chk(`${h}/${t} 생물 ${pool.length}종`, pool.length >= 3, pool.map(s => s.name).join(','));
}
chk('낮에 생산자 관찰 가능', D.SPECIES.some(s => s.role === '생산자' && s.time !== 'night'));
chk('밤에도 생산자 관찰 가능', D.SPECIES.some(s => s.role === '생산자' && s.time !== 'day'));
chk('체육관 입장 조건(4종·생산자) 낮 숲만으로 충족 가능', D.SPECIES.filter(s => s.habitat === 'forest' && s.time !== 'night').length >= 4);

// 4. 광합성 대결
const run = seq => seq.reduce((s, a) => B.photoStep(s, a), B.photoInit());
const simple = run(['stomata', ...Array(9).fill('water')]);
chk('광합성: 기공 열고 물 관리 → 승리(별 1)', simple.win && simple.stars === 1, `녹말 ${simple.starch}`);
const expert = run('stomata water water leaf water water stomata stomata water water'.split(' '));
chk('광합성: 밤에 기공 닫기 → 별 3', expert.stars === 3, `녹말 ${expert.starch}`);
chk('광합성: 기다리기만 → 패배', !run(Array(10).fill('wait')).win);
const t1 = B.photoStep(B.photoInit(), 'stomata');
chk('광합성: 제한 요인 계산(min)', t1.last.P === Math.min(t1.last.light, t1.last.co2, t1.last.water));

// 5. 소화 대결
let d = B.digestInit(); for (const m of ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal']) d = B.digestStep(d, m);
chk('소화: 모범 경로 → 흡수 단계', d.phase === 'absorb' && d.wrong === 0);
chk('소화: 흡수 정답 → 별 3', B.digestStars(d, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'lacteal' })) === 3);
chk('소화: 지방을 모세 혈관으로 → 별 1', B.digestStars(d, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'capillary' })) === 1);
let d2 = B.digestInit(); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'saliva');
chk('소화: 위에서 침 → 효과 없음(산성)', d2.lastLog.some(l => l.text.includes('산성')));
let d3 = B.digestInit(); for (const m of ['chew', 'chew', 'mix', 'mix', 'mix', 'mix', 'mix', 'mix']) d3 = B.digestStep(d3, m);
chk('소화: 분해 안 하면 패배', d3.phase === 'fail');
let d4 = B.digestInit(); for (const m of ['chew', 'chew', 'gastric', 'mix', 'pancreas', 'pancreas', 'intestinal']) d4 = B.digestStep(d4, m);
chk('소화: 쓸개즙 없이도 라이페이스 2번이면 분해(비효율)', d4.phase === 'absorb' && d4.food.fat === 2);

process.exit(fail ? 1 : 0);
