/* 가계도 지뢰찾기 — 가계도 데이터와 논리 해결기(순수 함수)
 * 해결기는 표현형(발현/정상)과 멘델 유전 규칙을 모두 만족하는 유전자형 조합을 전부 따져 보고,
 * 모든 조합에서 보인자인 사람만 “확실한 보인자”로 판정한다. 정답을 사람이 정하지 않는다.
 */
(function (root) {
  // 상염색체 열성: A(정상) > a
  const AUTO = {
    options: (p) => (p.affected ? ['aa'] : ['AA', 'Aa']),
    gametes: g => [g[0], g[1]],
    child: (f, m) => { const s = new Set(); for (const x of f) for (const y of m) s.add([x, y].sort().join('')); return s; },
    carrier: (g) => g === 'Aa',
  };
  // X 연관 열성(적록 색맹): 여성 XX, 남성 XY
  const XLINK = {
    options: (p) => p.sex === 'M' ? (p.affected ? ['aY'] : ['AY']) : (p.affected ? ['aa'] : ['AA', 'Aa']),
    carrier: (g) => g === 'Aa',
  };
  function consistentX(child, f, m, sex) {
    // 아버지(XY)는 딸에게 X, 아들에게 Y를 준다. 어머니는 X 하나를 준다.
    const mx = [m[0], m[1]];
    if (sex === 'M') return mx.includes(child[0]);
    const fx = f[0];
    return mx.some(x => [fx, x].sort().join('') === child);
  }

  function solve(ped) {
    const people = ped.people;
    const mode = ped.mode;
    const opts = people.map(p => (mode === 'x' ? XLINK : AUTO).options(p));
    const idx = Object.fromEntries(people.map((p, i) => [p.id, i]));
    const always = people.map(() => true), ever = people.map(() => false);
    let count = 0;
    const g = new Array(people.length);
    function ok(i) {
      const p = people[i];
      if (!p.parents) return true;
      const f = g[idx[p.parents[0]]], m = g[idx[p.parents[1]]];
      if (f === undefined || m === undefined) return true;
      if (mode === 'x') return consistentX(g[i], f, m, p.sex);
      return AUTO.child(f, m).has(g[i]);
    }
    // 부모가 먼저 오도록 세대 순서로 탐색
    const order = people.map((p, i) => i).sort((a, b) => people[a].gen - people[b].gen);
    (function rec(k) {
      if (k === order.length) {
        count++;
        people.forEach((p, i) => { const c = (mode === 'x' ? XLINK : AUTO).carrier(g[i]); if (!c) always[i] = false; else ever[i] = true; });
        return;
      }
      const i = order[k];
      for (const o of opts[i]) { g[i] = o; if (ok(i)) rec(k + 1); }
      g[i] = undefined;
    })(0);
    return {
      count,
      must: people.filter((p, i) => count > 0 && always[i]).map(p => p.id),
      maybe: people.filter((p, i) => ever[i] && !always[i]).map(p => p.id),
    };
  }

  // 판정 근거 문장(설명용)
  function reason(ped, id) {
    const P = Object.fromEntries(ped.people.map(p => [p.id, p]));
    const p = P[id];
    const kids = ped.people.filter(c => c.parents && c.parents.includes(id));
    if (ped.mode === 'x') {
      if (p.parents && P[p.parents[0]].affected) return '아버지가 색맹이다. 아버지는 딸에게 자신의 X 염색체(색맹 대립유전자)를 반드시 물려준다.';
      if (kids.some(k => k.sex === 'M' && k.affected)) return '아들이 색맹이다. 아들의 X 염색체는 어머니에게서만 오므로, 정상인 어머니는 보인자다.';
      return '여러 단서를 종합하면 보인자일 수밖에 없다.';
    }
    if (kids.some(k => k.affected)) return '본인은 정상인데 자녀가 발현했다. 자녀는 부모에게서 열성 대립유전자를 하나씩 받았으므로, 본인은 a를 하나 가진 보인자다.';
    if (p.parents && p.parents.some(q => P[q].affected)) return '부모 중 한 사람이 발현(aa)했다. 그 부모는 a만 물려줄 수 있으므로, 정상인 본인은 Aa다.';
    return '여러 단서를 종합하면 보인자일 수밖에 없다.';
  }

  /* 가계도: x는 가로 칸 위치(0~8), gen은 세대(0부터). parents: [아버지, 어머니] */
  const LEVELS = [
    { title: '1단계 · 부모는 정상인데', mode: 'auto', trait: '열성 유전병(상염색체)', people: [
      { id: 'f', sex: 'M', gen: 0, x: 2.5, affected: false },
      { id: 'm', sex: 'F', gen: 0, x: 5.5, affected: false },
      { id: 'c1', sex: 'M', gen: 1, x: 1.5, affected: true, parents: ['f', 'm'] },
      { id: 'c2', sex: 'F', gen: 1, x: 4, affected: false, parents: ['f', 'm'] },
      { id: 'c3', sex: 'M', gen: 1, x: 6.5, affected: false, parents: ['f', 'm'] },
    ], couples: [['f', 'm']] },
    { title: '2단계 · 세 세대', mode: 'auto', trait: '열성 유전병(상염색체)', people: [
      { id: 'gf', sex: 'M', gen: 0, x: 2, affected: true },
      { id: 'gm', sex: 'F', gen: 0, x: 4.5, affected: false },
      { id: 'd1', sex: 'F', gen: 1, x: 2, affected: false, parents: ['gf', 'gm'] },
      { id: 's1', sex: 'M', gen: 1, x: 4.5, affected: false, parents: ['gf', 'gm'] },
      { id: 'h1', sex: 'M', gen: 1, x: 0.3, affected: false },
      { id: 'k1', sex: 'M', gen: 2, x: 0.3, affected: true, parents: ['h1', 'd1'] },
      { id: 'k2', sex: 'F', gen: 2, x: 2, affected: false, parents: ['h1', 'd1'] },
    ], couples: [['gf', 'gm'], ['h1', 'd1']] },
    { title: '3단계 · 적록 색맹', mode: 'x', trait: '적록 색맹(X 염색체 열성)', people: [
      { id: 'gf', sex: 'M', gen: 0, x: 2.5, affected: false },
      { id: 'gm', sex: 'F', gen: 0, x: 5.5, affected: false },
      { id: 's1', sex: 'M', gen: 1, x: 6.5, affected: true, parents: ['gf', 'gm'] },
      { id: 'd1', sex: 'F', gen: 1, x: 3, affected: false, parents: ['gf', 'gm'] },
      { id: 'h1', sex: 'M', gen: 1, x: 1, affected: false },
      { id: 'k1', sex: 'M', gen: 2, x: 0.5, affected: true, parents: ['h1', 'd1'] },
      { id: 'k2', sex: 'F', gen: 2, x: 2, affected: false, parents: ['h1', 'd1'] },
      { id: 'k3', sex: 'M', gen: 2, x: 3.5, affected: false, parents: ['h1', 'd1'] },
    ], couples: [['gf', 'gm'], ['h1', 'd1']] },
    { title: '4단계 · 색맹 할아버지', mode: 'x', trait: '적록 색맹(X 염색체 열성)', people: [
      { id: 'gf', sex: 'M', gen: 0, x: 3, affected: true },
      { id: 'gm', sex: 'F', gen: 0, x: 5, affected: false },
      { id: 'd1', sex: 'F', gen: 1, x: 2, affected: false, parents: ['gf', 'gm'] },
      { id: 's1', sex: 'M', gen: 1, x: 6, affected: false, parents: ['gf', 'gm'] },
      { id: 'h1', sex: 'M', gen: 1, x: 0.3, affected: false },
      { id: 'w1', sex: 'F', gen: 1, x: 7.7, affected: false },
      { id: 'k1', sex: 'M', gen: 2, x: 0.3, affected: true, parents: ['h1', 'd1'] },
      { id: 'k2', sex: 'F', gen: 2, x: 2, affected: false, parents: ['h1', 'd1'] },
      { id: 'k3', sex: 'M', gen: 2, x: 6, affected: true, parents: ['s1', 'w1'] },
      { id: 'k4', sex: 'F', gen: 2, x: 7.7, affected: false, parents: ['s1', 'w1'] },
    ], couples: [['gf', 'gm'], ['h1', 'd1'], ['s1', 'w1']] },
  ];

  const api = { solve, reason, LEVELS };
  root.Pedigree = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
