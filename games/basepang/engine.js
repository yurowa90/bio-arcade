/* 염기쌍 팡 — 판 규칙(순수 함수)
 * 애니팡의 “같은 것 3개”를 “상보적인 짝 2개”로 바꿨다. 짝은 사다리의 가로대처럼 가로로 나란해야 한다.
 * 1단계(복제): DNA끼리 A-T(수소 결합 2), G-C(수소 결합 3)
 * 2단계(전사): DNA 주형 염기 옆에 짝이 맞는 RNA 염기 — A→U, T→A, G→C, C→G. RNA에는 T가 없다.
 */
(function (root) {
  const W = 6, H = 8;
  const DNA_COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const RNA_OF = { A: 'U', T: 'A', G: 'C', C: 'G' }; // DNA 주형 → RNA 염기
  const HB = { A: 2, T: 2, U: 2, G: 3, C: 3 };

  function pairOK(level, a, b) {
    if (!a || !b) return false;
    if (level === 1) return a.s === 'D' && b.s === 'D' && DNA_COMP[a.b] === b.b;
    if (a.s === b.s) return false;
    const d = a.s === 'D' ? a : b, r = a.s === 'D' ? b : a;
    return RNA_OF[d.b] === r.b;
  }
  function randomTile(level, rnd) {
    if (level === 1) return { b: 'ATGC'[Math.floor(rnd() * 4)], s: 'D' };
    return rnd() < 0.5 ? { b: 'ATGC'[Math.floor(rnd() * 4)], s: 'D' } : { b: 'AUGC'[Math.floor(rnd() * 4)], s: 'R' };
  }
  // 이웃과 곧바로 짝이 되지 않는 타일 뽑기(저절로 터지는 연쇄를 줄여 “생각하는” 퍼즐로 유지)
  function safeTile(level, grid, x, y, rnd) {
    for (let k = 0; k < 30; k++) {
      const t = randomTile(level, rnd);
      const L = x > 0 ? grid[y][x - 1] : null, R = x < W - 1 ? grid[y][x + 1] : null;
      if (!pairOK(level, L, t) && !pairOK(level, t, R)) return t;
    }
    return randomTile(level, rnd);
  }
  function newBoard(level, rnd = Math.random) {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = safeTile(level, g, x, y, rnd);
    if (!hasMove(level, g)) return newBoard(level, rnd);
    return g;
  }
  // 가로로 이웃한 짝 찾기(왼쪽부터 겹치지 않게)
  function findPairs(level, g) {
    const pairs = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        if (pairOK(level, g[y][x], g[y][x + 1])) { pairs.push({ x, y }); x++; }
      }
    }
    return pairs;
  }
  const clone = g => g.map(r => r.slice());
  function swap(g, a, b) { const n = clone(g); const t = n[a.y][a.x]; n[a.y][a.x] = n[b.y][b.x]; n[b.y][b.x] = t; return n; }
  function hasMove(level, g) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < W - 1 && findPairs(level, swap(g, { x, y }, { x: x + 1, y })).length) return true;
      if (y < H - 1 && findPairs(level, swap(g, { x, y }, { x, y: y + 1 })).length) return true;
    }
    return false;
  }
  // 한 번의 교환 → 터짐·낙하·연쇄를 모두 처리. steps는 화면 연출용
  function resolve(level, g0, rnd = Math.random) {
    let g = clone(g0), score = 0, chain = 0;
    const steps = [], popped = [];
    for (;;) {
      const pairs = findPairs(level, g);
      if (!pairs.length) break;
      chain++;
      const before = clone(g); // 이 연쇄에서 실제로 짝을 이룬 판을 화면에 남긴다.
      let gained = 0;
      for (const p of pairs) {
        const a = g[p.y][p.x], b = g[p.y][p.x + 1];
        const hb = Math.max(HB[a.b], HB[b.b]);
        gained += hb;
        popped.push({ a: a.b + (a.s === 'R' ? '(RNA)' : ''), b: b.b + (b.s === 'R' ? '(RNA)' : ''), hb });
        g[p.y][p.x] = null; g[p.y][p.x + 1] = null;
      }
      gained *= chain; // 연쇄 보너스
      score += gained;
      steps.push({ pairs, gained, chain, grid: before });
      // 낙하
      for (let x = 0; x < W; x++) {
        const col = [];
        for (let y = H - 1; y >= 0; y--) if (g[y][x]) col.push(g[y][x]);
        for (let y = H - 1, i = 0; y >= 0; y--, i++) g[y][x] = col[i] || null;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x]) g[y][x] = safeTile(level, g, x, y, rnd);
    }
    if (!hasMove(level, g)) g = newBoard(level, rnd); // 둘 곳이 없으면 판을 새로 섞는다
    return { grid: g, score, steps, popped };
  }

  const api = { W, H, pairOK, newBoard, findPairs, swap, hasMove, resolve, DNA_COMP, RNA_OF, HB };
  root.BasePang = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
