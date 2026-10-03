// 지도 연결·도달 가능성, 서식지별 낮/밤 생물, 관찰 질문 배정, 체육관 규칙을 검증한다.
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

// 3-1. 관찰 질문 배정(data.js의 ask). 정답 계산은 main.js의 observationQuestions와 같다(tests/quest-e2e.js가 실제 함수와 대조).
// 질문 종류만 보고 답을 짐작하지 못해야 한다: 종류마다 정답이 둘 이상으로 갈리고, 한 정답이 60%를 넘지 않는다.
// ask가 배열이면 차례로 낸다(앞 질문을 맞혀야 다음 질문). 분포는 낼 수 있는 질문 전체로, 풀 조건은 첫 질문으로 센다.
const ASK = { kind: sp => sp.kind, role: sp => sp.role, vert: sp => (sp.cls.startsWith('척추') ? 'yes' : 'no') };
const asks = sp => [].concat(sp.ask);
chk('관찰 질문: 모든 생물에 질문 종류(kind·role·vert)가 정해져 있음', D.SPECIES.every(sp => asks(sp).length && asks(sp).every(k => ASK[k])), D.SPECIES.filter(sp => !asks(sp).every(k => ASK[k])).map(sp => sp.name).join(','));
chk('관찰 질문: 한 생물에게 같은 종류를 두 번 내지 않음', D.SPECIES.every(sp => new Set(asks(sp)).size === asks(sp).length));
chk('관찰 질문: 척추 여부는 동물에게만', D.SPECIES.every(sp => asks(sp).every(k => k !== 'vert' || sp.kind === '동물')));
const askDist = (arr, firstOnly) => { const o = {}; for (const sp of arr) for (const k of firstOnly ? asks(sp).slice(0, 1) : asks(sp)) { if (!ASK[k]) continue; const a = ASK[k](sp); (o[k] = o[k] || {})[a] = (o[k][a] || 0) + 1; } return o; };
const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(' / ');
const dAll = askDist(D.SPECIES);
for (const t of Object.keys(ASK)) {
  const v = Object.values(dAll[t] || {}), n = v.reduce((a, b) => a + b, 0);
  chk(`관찰 질문 ${t}: 정답이 한 가지로 몰리지 않음(${D.SPECIES.length}종 전체)`, v.length >= 2 && Math.max(...v) / n <= 0.6, `${n}문항 ${JSON.stringify(dAll[t] || {})}`);
}
chk('관찰 질문: 무리 질문의 정답에 식물·균류·동물이 모두 있음', ['식물', '균류', '동물'].every(k => (dAll.kind || {})[k] > 0), JSON.stringify(dAll.kind));
chk('관찰 질문: 역할 질문의 정답에 생산자·소비자·분해자가 모두 있음', ['생산자', '소비자', '분해자'].every(r => (dAll.role || {})[r] > 0), JSON.stringify(dAll.role));
const oyster = D.SPECIES.find(s => s.id === 'oyster');
chk('관찰 질문: 느타리(균류·분해자)는 무리 질문을 먼저 받고 이어 역할 질문을 받음', asks(oyster).join() === 'kind,role');
// 생물마다 처음 받는 질문만 세어도 역할 질문의 정답에 분해자가 있어야 한다(M1: 분해자 균류 추가)
const dFirst = askDist(D.SPECIES, true);
chk('관찰 질문: 첫 질문의 정답이 분해자인 생물이 있음', D.SPECIES.some(sp => asks(sp)[0] === 'role' && sp.role === '분해자'), D.SPECIES.filter(sp => asks(sp)[0] === 'role' && sp.role === '분해자').map(sp => sp.name).join(',') || '없음');
chk('관찰 질문: 첫 질문만 세어도 역할 질문의 정답에 생산자·소비자·분해자가 모두 있음', ['생산자', '소비자', '분해자'].every(r => (dFirst.role || {})[r] > 0), JSON.stringify(dFirst.role));
chk('관찰 질문: 분해자는 모두 균류', D.SPECIES.filter(sp => sp.role === '분해자').every(sp => sp.kind === '균류'));
for (const h of ['forest', 'wetland']) for (const t of ['day', 'night']) {
  const pool = D.SPECIES.filter(s => s.habitat === h && (s.time === 'both' || s.time === t));
  const dp = askDist(pool, true);
  chk(`관찰 질문 ${h}/${t}: 첫 질문만으로도 세 종류가 모두 나오고 종류마다 정답이 갈림`, Object.keys(ASK).every(k => dp[k] && Object.keys(dp[k]).length >= 2), fmt(dp));
}

// 4. 광합성 대결 ('stomata'는 기공 열기·닫기 — 턴을 쓰지 않는다)
const run = seq => seq.reduce((s, a) => B.photoStep(s, a), B.photoInit());
const tg = B.photoStep(B.photoInit(), 'stomata');
chk('광합성: 기공 열기·닫기는 턴을 쓰지 않음', tg.turn === 1 && tg.stomata && tg.history.length === 0);
const simple = run(['stomata', ...Array(10).fill('water')]);
chk('광합성: 기공 열고 물만 → 승리(별 1)', simple.win && simple.stars === 1, `녹말 ${simple.starch}`);
const opening = 'stomata water water leaf water leaf water'.split(' ');
const expert = run([...opening, 'stomata', 'leaf', 'stomata', 'water', 'leaf', 'water']); // 7턴(밤)에 닫고 8턴에 다시 연다
const keepOpen = run([...opening, 'leaf', 'water', 'leaf', 'water']);                    // 같은 수순에서 밤에도 열어 둔다
chk('광합성: 밤에 기공 닫기 → 별 3', expert.stars === 3, `녹말 ${expert.starch}`);
chk('광합성: 같은 수순에서 밤에도 기공을 열어 두면 → 별 3 아님', keepOpen.win && keepOpen.stars < 3, `녹말 ${keepOpen.starch}`);
chk('광합성: 기다리기만 → 패배', !run(Array(10).fill('wait')).win);
const t1 = run(['stomata', 'water']);
chk('광합성: 제한 요인 계산(min)', t1.last.P === Math.min(t1.last.light, t1.last.co2, t1.last.water));
const full = expert.history.filter(h => h.P === B.PHOTO.maxFactor);
chk('광합성: 세 요인이 모두 최대인 턴은 제한 요인 없음', full.length > 0 && full.every(h => h.limiting.length === 0));
chk('광합성: 기록에 밤 턴의 기공 상태가 남음', expert.history.some(h => h.night && !h.stomata) && keepOpen.history.some(h => h.night && h.stomata));
// 전수 탐색: 별 3은 밤에 기공을 닫아야만 받을 수 있어야 한다(밤에 닫는 개념과 점수가 일치)
const { finals } = require('./quest-tune-photo.js').explorePhoto();
const maxOf = arr => Math.max(...arr.map(f => f.s.starch));
const maxNightOpen = maxOf(finals.filter(f => f.nightOpen)), maxNightClosed = maxOf(finals.filter(f => !f.nightOpen));
const star3 = B.PHOTO.stars[2];
chk('광합성 전수: 밤에 기공을 연 수열의 최대 녹말 < 별 3 기준', maxNightOpen < star3, `밤 열림 최대 ${maxNightOpen}, 별 3 기준 ${star3}`);
chk('광합성 전수: 밤에 기공을 닫으면 별 3 도달 가능', maxNightClosed >= star3, `밤 닫힘 최대 ${maxNightClosed}`);
chk('광합성 전수: 밤에 기공을 열어도 승리는 가능(별 1~2)', maxNightOpen >= B.PHOTO.goal);

// 5. 소화 대결
const ABS_OK = { starch: 'capillary', protein: 'capillary', fat: 'lacteal' };
const MODEL = ['saliva', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal'];
let d = B.digestInit(); for (const m of MODEL) d = B.digestStep(d, m);
chk('소화: 모범 경로 → 흡수 단계', d.phase === 'absorb' && d.wrong === 0);
chk('소화: 모범 경로는 쓸개즙으로 유화한 뒤 이자액으로 분해', MODEL.indexOf('bile') >= 0 && MODEL.indexOf('bile') < MODEL.indexOf('pancreas') && d.emulsified);
chk('소화: 모범 경로는 입에서 침, 위에서 위액을 씀(장소별 소화액 기록)', d.salivaMouth === true && d.gastricStomach === true, `salivaMouth ${d.salivaMouth}, gastricStomach ${d.gastricStomach}`);
chk('소화: 모범 경로(입 침·위 위액·쓸개즙 유화 뒤 이자액) + 흡수 정답 → 별 3', B.digestStars(d, B.absorbCheck(ABS_OK)) === 3);
chk('소화: 지방을 모세 혈관으로 → 별 1', B.digestStars(d, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'capillary' })) === 1);
let d2 = B.digestInit(); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'chew'); d2 = B.digestStep(d2, 'saliva');
chk('소화: 위에서 침 → 효과 없음(산성)', d2.lastLog.some(l => l.text.includes('산성')));
let d5 = B.digestInit(); for (const m of ['chew', 'chew', 'gastric', 'mix', 'saliva']) d5 = B.digestStep(d5, m);
chk('소화: 소장에서 침 → 효과 없음 + 헛수 1', B.DIGEST.places[d5.placeIdx].id === 'intestine' && d5.food.starch === 0 && d5.wrong === 1 && d5.lastLog.some(l => l.t === 'bad' && l.text.includes('이자액')));
for (const m of ['bile', 'pancreas', 'intestinal']) d5 = B.digestStep(d5, m);
chk('소화: 소장에서 침을 쓴 뒤 바르게 이어 가면 성공하되 별 3은 아님', d5.phase === 'absorb' && B.digestStars(d5, B.absorbCheck({ starch: 'capillary', protein: 'capillary', fat: 'lacteal' })) === 2);
let d3 = B.digestInit(); for (const m of ['chew', 'chew', 'mix', 'mix', 'mix', 'mix', 'mix', 'mix']) d3 = B.digestStep(d3, m);
chk('소화: 분해 안 하면 패배', d3.phase === 'fail');
let d4 = B.digestInit(); for (const m of ['chew', 'chew', 'gastric', 'mix', 'pancreas', 'pancreas', 'intestinal']) d4 = B.digestStep(d4, m);
chk('소화: 쓸개즙 없이도 라이페이스 2번이면 분해(비효율)', d4.phase === 'absorb' && d4.food.fat === 2);
chk('소화: 쓸개즙 미사용 → 헛수 0·흡수 정답이어도 별 2(승리는 함)', !d4.emulsified && d4.wrong === 0 && B.digestStars(d4, B.absorbCheck(ABS_OK)) === 2);
let d6 = B.digestInit(); for (const m of ['saliva', 'chew', 'gastric', 'mix', 'pancreas', 'bile', 'pancreas', 'intestinal']) d6 = B.digestStep(d6, m);
chk('소화: 입 침·위 위액을 쓰고 소장에서 이자액→쓸개즙→이자액이어도 별 3 가능(M3: 유화 전 이자액은 감점 안 함)', d6.phase === 'absorb' && d6.emulsified && B.digestStars(d6, B.absorbCheck(ABS_OK)) === 3);
// 장소별 소화액(M2): 녹말은 입에서 침으로, 단백질은 위에서 위액으로 소화가 시작된다. 빠뜨리면 이겨도 별 2까지
const digestRun = seq => seq.reduce((s, m) => B.digestStep(s, m), B.digestInit());
const missOf = s => (B.digestMissing ? B.digestMissing(s).join() : '(digestMissing 없음)');
for (const [name, seq, miss] of [
  ['입·위에서는 씹기·꿈틀 운동만', ['chew', 'chew', 'mix', 'mix', 'bile', 'pancreas', 'intestinal'], 'saliva,gastric'],
  ['입에서 침만 빠짐', ['chew', 'chew', 'gastric', 'mix', 'bile', 'pancreas', 'intestinal'], 'saliva'],
  ['위에서 위액만 빠짐', ['saliva', 'chew', 'mix', 'mix', 'bile', 'pancreas', 'intestinal'], 'gastric'],
  ['입·위 소화액과 쓸개즙이 모두 빠짐', ['chew', 'chew', 'mix', 'mix', 'pancreas', 'pancreas', 'intestinal'], 'saliva,gastric,bile'],
]) {
  const s = digestRun(seq), st = B.digestStars(s, B.absorbCheck(ABS_OK));
  chk(`소화: ${name} → 헛수 0·흡수 정답이어도 승리·별 2, 빠진 조건 ${miss}`, s.phase === 'absorb' && s.wrong === 0 && st === 2 && missOf(s) === miss, `별 ${st}, 빠진 조건 ${missOf(s)}`);
}
// 전수 탐색: 장소마다 쓸 수 있는 모든 기술 수열을 끝까지 돌린다(약 2만 2천 개)
const dFinals = [];
(function dfs(s) {
  if (s.phase !== 'digest') { dFinals.push(s); return; }
  const place = B.DIGEST.places[s.placeIdx].id;
  for (const [id, m] of Object.entries(B.DIGEST.moves)) if (m.place.includes(place)) dfs(B.digestStep(s, id));
})(B.digestInit());
const dWins = dFinals.filter(s => s.phase === 'absorb');
const bileWins = dWins.filter(s => s.history.some(h => h.move === 'bile' && h.effect)), noBileWins = dWins.filter(s => !s.history.some(h => h.move === 'bile' && h.effect));
const maxStars = arr => Math.max(...arr.map(s => B.digestStars(s, B.absorbCheck(ABS_OK))));
chk('소화 전수: 쓸개즙 없이 이긴 수열은 별 2 이하', noBileWins.length > 0 && maxStars(noBileWins) === 2, `${noBileWins.length}개, 최대 별 ${maxStars(noBileWins)}`);
chk('소화 전수: 쓸개즙을 쓴 수열은 별 3 도달 가능', maxStars(bileWins) === 3, `${bileWins.length}개 중 별 3 ${bileWins.filter(s => B.digestStars(s, B.absorbCheck(ABS_OK)) === 3).length}개`);
chk('소화 전수: emulsified = 쓸개즙이 효과를 낸 수열', dWins.every(s => s.emulsified === bileWins.includes(s)));
// 장소별 소화액(M2): 기록(history)으로 판정한다 — 상태 플래그가 없거나 틀려도 이 단언은 실패한다
const usedAt = (s, move, place) => s.history.some(h => h.move === move && h.place === place && h.effect);
const placeWins = dWins.filter(s => usedAt(s, 'saliva', 'mouth') && usedAt(s, 'gastric', 'stomach'));
const noPlaceWins = dWins.filter(s => !placeWins.includes(s));
const starDist = arr => { const o = { 1: 0, 2: 0, 3: 0 }; for (const s of arr) o[B.digestStars(s, B.absorbCheck(ABS_OK))]++; return JSON.stringify(o); };
chk('소화 전수: 입에서 침이나 위에서 위액을 쓰지 않고 이긴 수열은 별 2 이하', noPlaceWins.length > 0 && maxStars(noPlaceWins) === 2, `${noPlaceWins.length}개, 최대 별 ${maxStars(noPlaceWins)}, 별 분포 ${starDist(noPlaceWins)}`);
chk('소화 전수: 입 침·위 위액·쓸개즙을 모두 제때 쓴 수열은 별 3 도달 가능', maxStars(placeWins.filter(s => bileWins.includes(s))) === 3, `${placeWins.filter(s => bileWins.includes(s)).length}개, 별 분포 ${starDist(placeWins.filter(s => bileWins.includes(s)))}`);
chk('소화 전수: salivaMouth·gastricStomach = 입 침·위 위액이 효과를 낸 수열', dWins.every(s => s.salivaMouth === usedAt(s, 'saliva', 'mouth') && s.gastricStomach === usedAt(s, 'gastric', 'stomach')));
console.log(`소화 전수: 수열 ${dFinals.length}개, 승리 ${dWins.length}개, 별 분포(흡수 정답 가정) ${starDist(dWins)}`);

process.exit(fail ? 1 : 0);
