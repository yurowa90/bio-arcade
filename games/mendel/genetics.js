/* 멘델의 텃밭 — 유전 규칙(순수 함수). 완두 씨 모양 R(둥근) > r(주름), 색깔 Y(황색) > y(녹색).
 * 두 유전자는 서로 다른 염색체에 있다고 보고 독립적으로 생식세포에 나뉘어 들어간다(분리·독립의 법칙).
 */
(function (root) {
  const SHAPE = ['R', 'r'], COLOR = ['Y', 'y'];
  const norm = pair => pair.slice().sort((a, b) => (a === a.toUpperCase() ? -1 : 1) - (b === b.toUpperCase() ? -1 : 1)).join('');
  const genotype = p => norm(p.shape) + norm(p.color);
  const round = p => p.shape.includes('R');
  const yellow = p => p.color.includes('Y');
  const phenoKey = p => (round(p) ? 'R' : 'r') + (yellow(p) ? 'Y' : 'y');
  const PHENO_NAME = { RY: '둥글고 황색', Ry: '둥글고 녹색', rY: '주름지고 황색', ry: '주름지고 녹색' };
  const ALL_GENOTYPES = ['RRYY', 'RRYy', 'RrYY', 'RrYy', 'RRyy', 'Rryy', 'rrYY', 'rrYy', 'rryy'];

  function fromGenotype(g) { return { shape: [g[0], g[1]], color: [g[2], g[3]] }; }
  function gamete(p, rnd) { return { s: p.shape[rnd() < 0.5 ? 0 : 1], c: p.color[rnd() < 0.5 ? 0 : 1] }; }
  function cross(a, b, n, rnd = Math.random) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const ga = gamete(a, rnd), gb = gamete(b, rnd);
      out.push({ shape: [ga.s, gb.s], color: [ga.c, gb.c] });
    }
    return out;
  }
  function tally(plants) {
    const t = { RY: 0, Ry: 0, rY: 0, ry: 0 };
    plants.forEach(p => t[phenoKey(p)]++);
    return t;
  }
  // 겉모습(표현형)으로 가능한 유전자형 후보
  function candidates(p) { return ALL_GENOTYPES.filter(g => phenoKey(fromGenotype(g)) === phenoKey(p)); }
  // 기대 비율(정확한 확률) — 실험 노트 비교용
  function expected(a, b) {
    const t = { RY: 0, Ry: 0, rY: 0, ry: 0 };
    for (const s1 of a.shape) for (const s2 of b.shape) for (const c1 of a.color) for (const c2 of b.color) t[phenoKey({ shape: [s1, s2], color: [c1, c2] })] += 1 / 16;
    return t;
  }

  const api = { genotype, round, yellow, phenoKey, PHENO_NAME, ALL_GENOTYPES, fromGenotype, cross, tally, candidates, expected };
  root.Genetics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
