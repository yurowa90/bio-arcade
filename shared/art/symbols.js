/* A 도감 기호. DOM 없이도 기하 데이터와 SVG 문자열을 쓸 수 있다. */
(function (root) {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const HEART = {
  "viewBox": [
    0,
    0,
    200,
    210
  ],
  "wall": "M97 25C77 5 26 15 17 50 6 95 16 145 52 178 76 197 108 210 124 205 151 196 176 164 184 127 192 87 180 36 158 23 140 12 115 14 97 25Z",
  "chambers": {
    "RA": "M26 38Q54 17 82 34V64Q64 76 60 82H32Q16 64 26 38Z",
    "RV": "M27 86H75Q58 124 98 180Q46 168 29 128Z",
    "LA": "M118 33Q139 16 162 31L174 61Q167 75 154 84H122Q110 63 118 38Z",
    "LV": "M100 88H151Q165 113 153 137Q145 158 125 175Q105 162 100 138Q96 111 100 88Z"
  },
  "septum": "",
  "valves": {
    "RA:RV": "M46 81L57 89L68 81",
    "RV:PA": "M74.83 82.25L82.46 83.94L82.17 91.75",
    "LA:LV": "M125 82L136 90L147 82",
    "LV:Ao": "M151 95L159 101L151 107"
  },
  "ports": {
    "VC": [
      26,
      46
    ],
    "PA": [
      72,
      92
    ],
    "PV": [
      171,
      52
    ],
    "Ao": [
      157,
      101
    ]
  },
  "vessels": {
    "VC": "M0 46H26",
    "PA": "M72 92L99 80V0",
    "PV": "M200 52H171",
    "Ao": "M157 101H200"
  }
};
  const STYLE = `
.art-icon { width:24px; height:24px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex-shrink:0; vertical-align:middle; }
.art-pip { fill:currentColor; stroke:none; }
.art-die { width:32px; height:32px; flex-shrink:0; vertical-align:middle; }
.art-draw { stroke:var(--outline,#35504a); stroke-width:2.3; stroke-linejoin:round; stroke-linecap:round; }
.art-detail { fill:none; stroke:var(--outline,#35504a); stroke-width:1.8; stroke-linejoin:round; stroke-linecap:round; }
.art-paper { fill:var(--panel,#fffdf5); }
.art-pink { fill:var(--pink,#f4b6a8); }
.art-organ { fill:var(--organ,#df7e70); }
.art-shade { fill:var(--shade,#4c4732); opacity:.16; }
.art-ink-fill { fill:var(--ink,#203d39); }
.art-airway { fill:none; stroke:var(--outline,#35504a); stroke-width:4; stroke-linecap:round; }
.art-tube { fill:none; stroke:var(--organ,#df7e70); stroke-width:7; stroke-linecap:round; }
.art-heart-wall { fill:var(--heart-wall,#ee978b); }
.art-heart-chamber { fill:var(--chamber-fill,#df7e70); stroke:var(--outline,#35504a); stroke-width:2.3; }
.art-heart-port { fill:none; stroke:var(--heart-wall,#ee978b); stroke-width:23; stroke-linejoin:round; }
.art-heart-flow { fill:none; stroke:var(--chamber-fill,#df7e70); stroke-width:14; stroke-linejoin:round; }
.art-valve-outline { fill:none; stroke:var(--outline,#35504a); stroke-width:6.8; stroke-linecap:round; stroke-linejoin:round; }
.art-valves { fill:none; stroke:var(--panel,#fffdf5); stroke-width:3.4; stroke-linecap:round; stroke-linejoin:round; }
.art-blood-high { fill:var(--blood-high,#e53935); }
.art-blood-low { fill:var(--blood-low,#6d1b2b); }
.art-shine { fill:none; stroke:var(--panel,#fffdf5); stroke-width:4; stroke-linecap:round; }
.art-co2 { fill:none; stroke:var(--panel,#fffdf5); stroke-width:4; }
`;
  function heartSymbol() {
    return `<symbol id="art-heart-section" viewBox="${HEART.viewBox.join(' ')}"><path class="art-heart-wall art-draw" d="${HEART.wall}"/>` +
      Object.entries(HEART.chambers).map(([key,d]) => `<path class="art-heart-chamber" data-chamber="${key}" d="${d}"/>`).join('') +
      Object.values(HEART.vessels).map(d => `<path class="art-heart-port" d="${d}"/><path class="art-heart-flow" d="${d}"/>`).join('') +
      Object.values(HEART.valves).map(d => `<path class="art-valve-outline" d="${d}"/><path class="art-valves" d="${d}"/>`).join('') +
      (HEART.septum ? `<path class="art-detail" d="${HEART.septum}"/>` : '') + '</symbol>';
  }
  const ORGANS = {
  "lungs": "<symbol id=\"art-lungs\" viewBox=\"0 0 100 100\"><path class=\"art-pink art-draw\" d=\"M45 25C34 7 15 24 10 45 4 65 7 86 23 89l23-11Z\"/><path class=\"art-pink art-draw\" d=\"M55 25c11-18 30-1 35 20 6 20 3 41-13 44L54 78Z\"/><path class=\"art-shade\" d=\"M10 67q0 25 14 22l21-11V67Q26 81 10 67Zm45 0v11l21 11q14 1 14-22-16 14-35 0Z\"/><path class=\"art-airway\" d=\"M50 7v34M50 36 29 55m21-19 21 19M29 55l-9 12m9-12 7 15m35-15 10 12m-10-12-7 15\"/></symbol>",
  "brain": "<symbol id=\"art-brain\" viewBox=\"0 0 100 100\"><path class=\"art-pink art-draw\" d=\"M49 20C34 5 19 13 19 27 5 28 4 46 12 51 2 67 16 82 28 78c9 16 27 12 28 0 15 4 32-3 29-17 13-8 8-26-4-28 0-17-24-22-32-13Z\"/><path class=\"art-detail\" d=\"M49 20v55M21 30q15-5 14 13M17 53q11-9 20 0m-6 25q6-12-5-17M62 23q-5 16 7 20m-7 12q20-10 17 7M55 77q-1-13 9-13\"/><path class=\"art-shade\" d=\"M10 67q8 14 20 11c10 16 23 7 26 0 15 5 26-3 28-12-19 10-22-1-32 4-15-8-28 9-42-3Z\"/></symbol>",
  "kidney": "<symbol id=\"art-kidney\" viewBox=\"0 0 100 100\"><path class=\"art-organ art-draw\" d=\"M54 12C21 2 10 38 13 61c4 33 43 39 57 18 8-14-18-17-17-30S78 20 54 12Z\"/><path class=\"art-shade\" d=\"M15 57q7 30 29 29c14 1 22-4 26-11 6 26-26 25-40 17Q13 80 15 57Z\"/><path class=\"art-detail\" d=\"M49 29Q25 24 25 51q1 24 23 21\"/><path class=\"art-tube\" d=\"M58 49h28M58 58l16 8v28\"/></symbol>",
  "leg-muscle": "<symbol id=\"art-leg-muscle\" viewBox=\"0 0 100 100\"><path class=\"art-pink art-draw\" d=\"M31 4Q53-2 63 11L60 31 50 49Q49 54 53 60L57 74 53 86 74 92Q80 96 73 98H40L37 91 43 75 34 59Q27 51 30 43L27 24Z\"/><path class=\"art-organ art-draw\" d=\"M33 14Q48 5 55 17L52 32 42 49Q33 43 33 31Z\"/><path class=\"art-shade\" d=\"M48 59L54 74 49 87 71 94H44L42 90 48 76 42 60Z\"/><path class=\"art-detail\" d=\"M39 19L37 35M46 18L42 37M38 51Q43 56 49 51M43 82L49 88M54 92H69\"/></symbol>",
  "drop": "<symbol id=\"art-drop\" viewBox=\"0 0 100 100\"><path class=\"art-blood-high art-draw\" d=\"M50 5C44 26 17 41 17 64a33 31 0 0 0 66 0C83 41 56 26 50 5Z\"/><path class=\"art-shine\" d=\"M36 38Q24 49 26 61\"/><circle class=\"art-co2\" cx=\"50\" cy=\"70\" r=\"8\"/></symbol>",
  "drop-low": "<symbol id=\"art-drop-low\" viewBox=\"0 0 100 100\"><path class=\"art-blood-low art-draw\" d=\"M50 5C44 26 17 41 17 64a33 31 0 0 0 66 0C83 41 56 26 50 5Z\"/><path class=\"art-shine\" d=\"M40 29Q34 33 31 40\"/><g class=\"art-co2\"><circle cx=\"35\" cy=\"56\" r=\"8\"/><circle cx=\"65\" cy=\"56\" r=\"8\"/><circle cx=\"50\" cy=\"78\" r=\"8\"/></g></symbol>",
  "i-back": "<symbol id=\"art-i-back\" viewBox=\"0 0 24 24\"><path d=\"m14 5-7 7 7 7M7 12h13\"/></symbol>",
  "i-help": "<symbol id=\"art-i-help\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5\"/><circle class=\"art-pip\" cx=\"12\" cy=\"17\" r=\".8\"/></symbol>",
  "i-close": "<symbol id=\"art-i-close\" viewBox=\"0 0 24 24\"><path d=\"m6 6 12 12M18 6 6 18\"/></symbol>",
  "i-star": "<symbol id=\"art-i-star\" viewBox=\"0 0 24 24\"><path d=\"m12 2 3 6.3 7 .9-5 4.8 1.2 7-6.2-3.3L5.8 21 7 14 2 9.2l7-.9Z\"/></symbol>",
  "i-check": "<symbol id=\"art-i-check\" viewBox=\"0 0 24 24\"><path d=\"m5 12 4 4 10-10\"/></symbol>",
  "i-lock": "<symbol id=\"art-i-lock\" viewBox=\"0 0 24 24\"><rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3M12 14v3\"/></symbol>",
  "i-dice": "<symbol id=\"art-i-dice\" viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><g class=\"art-pip\"><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><circle cx=\"16\" cy=\"8\" r=\"1.5\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/><circle cx=\"8\" cy=\"16\" r=\"1.5\"/><circle cx=\"16\" cy=\"16\" r=\"1.5\"/></g></symbol>",
  "i-clock": "<symbol id=\"art-i-clock\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 6v6l4 2\"/></symbol>",
  "i-heart": "<symbol id=\"art-i-heart\" viewBox=\"0 0 24 24\"><path d=\"M12 21C9 18 2 13 2 7c0-5 7-6 10-1 3-5 10-4 10 1 0 6-7 11-10 14Z\"/><path d=\"M5 12h4l2-4 3 8 2-4h3\"/></symbol>",
  "i-cross": "<symbol id=\"art-i-cross\" viewBox=\"0 0 24 24\"><path d=\"M5 4v5q0 3 3 3h8q3 0 3 3v5M19 4v5q0 3-3 3H8q-3 0-3 3v5\"/></symbol>"
};
  const PIPS = { 1:[[50,50]], 2:[[31,31],[69,69]], 3:[[31,31],[50,50],[69,69]], 4:[[31,31],[69,31],[31,69],[69,69]], 5:[[31,31],[69,31],[50,50],[31,69],[69,69]], 6:[[31,28],[69,28],[31,50],[69,50],[31,72],[69,72]] };
  function dieSymbol(n) {
    return `<symbol id="art-die-${n}" viewBox="0 0 100 100"><rect class="art-paper art-draw" x="12" y="12" width="76" height="76" rx="16"/><path class="art-shade" d="M12 70Q12 88 30 88H70Q88 88 88 70V62Q83 74 70 74H30Q17 74 12 62Z"/><g class="art-ink-fill">` + PIPS[n].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="6"/>`).join('') + '</g></symbol>';
  }
  function symbols() { return heartSymbol() + Object.values(ORGANS).join('') + Object.keys(PIPS).map(dieSymbol).join(''); }
  function inject(doc) {
    if (!doc?.body || doc.getElementById('art-symbols')) return;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = 'art-symbols'; svg.setAttribute('aria-hidden','true'); svg.setAttribute('width','0'); svg.setAttribute('height','0'); svg.style.position = 'absolute';
    svg.innerHTML = `<style>${STYLE}</style>${symbols()}`;
    doc.body.insertBefore(svg,doc.body.firstChild);
  }
  function icon(name, { label } = {}) {
    if (!ORGANS['i-' + name]) throw new RangeError('아이콘 이름을 확인하세요.');
    return `<svg class="art-icon" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"'}><use href="#art-i-${name}"/></svg>`;
  }
  function die(n) {
    if (!Object.hasOwn(PIPS,n)) throw new RangeError('주사위 눈은 1~6이다.');
    return `<svg class="art-die" viewBox="0 0 100 100" aria-hidden="true"><use href="#art-die-${n}"/></svg>`;
  }
  const api = { HEART, inject, icon, die, symbols };
  root.ArcadeArt = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
