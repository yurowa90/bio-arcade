/* 혈액 한 방울의 이동과 입력 화면. 판단·점수는 규칙 모듈에 맡긴다. */
(function () {
  'use strict';
  const A = window.Arcade, C = window.Circulation;
  const $ = id => document.getElementById(id);
  const squares = Object.fromEntries(C.SQUARES.map(sq => [sq.id, sq]));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  let state, playing = false, busy = false, fast = false, lastInput = 0;
  let shownSquare = 'LV', shownBlood = 'high', feedback = null, noteSeen = false;
  let hudFrom = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, fast ? 0 : ms));
  const xy = sq => ({ x: 7 + sq.col * 70, y: 13 + sq.row * 56, w: sq.span * 70 - 12, h: 44 });
  const center = id => { const p = xy(squares[id]); return [p.x + p.w / 2, p.y + p.h / 2]; };
  const text = (x, y, value, cls = '', anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${value}</text>`;
  function oxygen(x, y, key) {
    return Array.from({ length: C.BLOOD[key].oxygen }, (_, i) => `<circle cx="${x + i * 9}" cy="${y}" r="2.5" fill="#fff"/>`).join('');
  }
  function drawBoard() {
    const dark = C.hud(state).dark;
    const asked = C.pending(hudFrom || state).squares;
    let svg = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="#786b74"/></marker>`;
    for (const sq of C.SQUARES.filter(sq => sq.kind === 'capillary')) {
      // 폐는 왼쪽에서 오른쪽, 기관은 오른쪽에서 왼쪽으로 흐른다.
      svg += `<linearGradient id="blood-${sq.id}" x1="${sq.id === 'lung' ? '0%' : '100%'}" x2="${sq.id === 'lung' ? '100%' : '0%'}"><stop offset="0%" stop-color="${C.BLOOD[sq.bloodIn].color}"/><stop offset="100%" stop-color="${C.BLOOD[sq.bloodOut].color}"/></linearGradient>`;
    }
    svg += `</defs><rect width="360" height="470" rx="12" fill="#fffaf0"/><rect x="140" y="0" width="220" height="173" rx="12" fill="#d9ecfa"/><rect y="286" width="360" height="184" rx="12" fill="#ffe8cd"/>`;
    svg += text(68, 22, '혈액과 O₂ 점(●)') + text(68, 46, '산소가 많은 혈액') + text(68, 94, '산소가 적은 혈액');
    svg += `<rect x="12" y="55" width="112" height="22" rx="6" fill="${C.BLOOD.high.color}"/>${oxygen(42, 66, 'high')}`;
    svg += `<rect x="12" y="103" width="112" height="22" rx="6" fill="${C.BLOOD.low.color}"/>${oxygen(54, 114, 'low')}`;
    svg += text(68, 143, '그림 속 사람이') + text(68, 163, '나를 마주 본다');
    // 범례는 흰 틀로 묶고, 두 구역 이름은 같은 색으로 구역 끝에 둔다.
    svg += '<g class="co2-legend"><rect x="212" y="61" width="70" height="93" rx="6" fill="#fff" stroke="#b4cbd9"/>';
    svg += text(246, 80, '방울 안') + text(246, 97, '○ = CO₂') + text(246, 114, '(혈장의') + text(246, 131, '이산화') + text(246, 148, '탄소)') + '</g>';
    svg += text(180, 465, '온몸순환', 'circuit-name') + text(246, 171, '폐순환', 'circuit-name');
    // 겹치는 기관 가지는 한 번만 그린다. 심장 사이에는 벽을 두고 관은 그 앞을 지난다.
    svg += '<path d="M181 181 V278" stroke="#594650" stroke-width="7"/>';
    const edges = new Set();
    for (const organ of Object.keys(C.ORGANS)) {
      const path = ['LV', ...C.lapPath(organ)];
      for (let i = 1; i < path.length; i++) edges.add(path[i - 1] + ':' + path[i]);
    }
    for (const edge of edges) {
      const [from, to] = edge.split(':'), a = xy(squares[from]), b = xy(squares[to]);
      const [x1, y1] = center(from), [x2, y2] = center(to);
      let d;
      if (from === 'RV' && to === 'PA1') d = `M${a.x + a.w} ${y1} H${x2} V${b.y + b.h}`;
      else if (from === 'VC1' && to === 'RA') d = `M${x1} ${a.y} V${y2} H${b.x}`;
      else if (from === 'PV2' && to === 'LA') d = `M${x1} ${a.y + a.h} V${y2} H${b.x + b.w}`;
      else if (from === 'LV' && to === 'Ao1') d = `M${a.x + a.w} ${y1} H${x2} V${b.y}`;
      else if (to === 'lung') d = `M${x1} ${a.y} V${b.y + b.h}`;
      else if (from === 'lung') d = `M${x2} ${a.y + a.h} V${b.y}`;
      else if (a.y === b.y) d = x2 < x1 ? `M${a.x} ${y1} H${b.x + b.w}` : `M${a.x + a.w} ${y1} H${b.x}`;
      else d = y2 < y1 ? `M${x1} ${a.y} V${b.y + b.h}` : `M${x1} ${a.y + a.h} V${b.y}`;
      svg += `<path d="${d}" fill="none" stroke="#786b74" stroke-width="4" marker-end="url(#arrow)"/>`;
    }
    for (const sq of C.SQUARES) {
      const { x, y, w, h } = xy(sq), blood = C.BLOOD[sq.blood];
      const disclosed = !dark && sq.structure && state.labels[sq.structure];
      const name = sq.kind === 'capillary' ? sq.name : disclosed ? C.STRUCTURES[sq.structure].name : '?';
      const aria = sq.kind === 'capillary' ? `${sq.name}, 들어올 때 ${C.BLOOD[sq.bloodIn].label}, 나갈 때 ${C.BLOOD[sq.bloodOut].label}` :
        (disclosed ? name : '이름 없는 ' + (sq.kind === 'chamber' ? '심장 방' : '혈관')) + ', ' + blood.label;
      const thick = sq.kind === 'chamber' ? { RA: 2, LA: 2, RV: 5, LV: 8 }[sq.id] : 2;
      svg += `<g class="square${asked?.includes(sq.id) ? ' asked' : !asked && shownSquare === sq.id ? ' current' : ''}" data-square="${sq.id}" role="img" aria-label="${asked?.includes(sq.id) ? '점선으로 표시한 칸, ' : ''}${aria}">`;
      if (sq.kind === 'chamber') svg += `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="10" fill="${sq.circuit === 'systemic' ? '#ffd7a6' : '#acd4f0'}"/>`;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${sq.kind === 'vessel' ? 5 : 9}" fill="${sq.kind === 'capillary' ? 'url(#blood-' + sq.id + ')' : blood.color}" stroke="#342129" stroke-width="${thick}"/>`;
      if (sq.kind === 'capillary') {
        const nameX = x + w / 2 - 10;
        svg += text(nameX, y + 18, sq.id === 'lung' ? '폐의' : C.ORGANS[sq.id].name + '의', 'square-name');
        svg += text(nameX, y + 36, '모세 혈관', 'square-name');
        svg += oxygen(x + 7, y + 8, 'low') + oxygen(x + w - 48, y + 8, 'high');
      } else svg += text(x + w / 2, y + 25, name, 'square-name') + oxygen(x + 7, y + 36, sq.blood);
      svg += '</g>';
    }
    for (const [from, to] of C.VALVES) {
      const [x1, y1] = center(from), [x2, y2] = center(to);
      // 꺾인 관에서는 문을 첫 직선 부분에 둔다.
      const vx = from === 'RV' || from === 'LV' ? (x1 + x2) / 2 : x1, vy = from === 'RV' || from === 'LV' ? y1 : (y1 + y2) / 2;
      svg += `<path class="valve" data-edge="${from}:${to}" d="M${vx - 6} ${vy - 6} L${vx} ${vy} L${vx + 6} ${vy - 6}" fill="none" stroke="#fffaf0" stroke-width="3"/>`;
    }
    const list = !dark && C.pending(state).type === 'die' ? C.preview(state) : [];
    for (const candidate of list) {
      const shared = list.filter(c => c.square === candidate.square).length > 1;
      const sq = squares[candidate.square], { x, y, w, h } = xy(sq), dx = shared ? candidate.index * 24 : 0;
      const cx = x + w - (sq.kind === 'capillary' ? 30 : 8) - dx;
      const cy = y + (sq.kind === 'capillary' ? h - 14 : 2);
      svg += `<g><circle class="candidate" cx="${cx}" cy="${cy}" r="12"/>${text(cx, cy + 6, faces[candidate.steps - 1])}</g>`;
    }
    if (!dark) {
      const blood = C.BLOOD[shownBlood], at = xy(squares[shownSquare]);
      const capillary = squares[shownSquare].kind === 'capillary';
      const dropScale = capillary ? 0.6 : 0.45;
      // 심장 방은 둘레 띠 밖 오른쪽 위, 혈관은 위쪽 틈, 모세 혈관은 출구 모서리에 둔다.
      const dx = capillary ? shownSquare === 'lung' ? at.x + at.w - 19 : at.x + 2 :
        squares[shownSquare].kind === 'chamber' ? at.x + at.w + 4 : at.x + at.w - 18;
      const dy = capillary ? at.y + 19 : at.y - 10;
      svg += `<g id="drop" data-square="${shownSquare}" transform="translate(${dx},${dy}) scale(${dropScale})" role="img" aria-label="혈액 한 방울, ${blood.label}, 이산화 탄소 ${blood.co2 === 3 ? '많음' : '적음'}"><path d="M14 0 C11 8 0 16 0 25 A14 13 0 0 0 28 25 C28 16 17 8 14 0" fill="${blood.color}" stroke="#fff" stroke-width="2"/>`;
      const rings = blood.co2 === 3 ? [[9, 23], [19, 23], [14, 31]] : [[14, 26]];
      svg += rings.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="2.5" fill="none" stroke="#fff" stroke-width="1.5"/>`).join('') + '</g>';
    }
    $('board').innerHTML = svg;
  }
  function drawRoute() {
    const sq = squares[shownSquare];
    const current = C.pending(hudFrom || state).slot || sq.structure || (shownSquare === 'lung' ? '폐의 모세 혈관' : sq.kind === 'capillary' ? '온몸의 모세 혈관' : null);
    const chip = key => {
      if (!C.STRUCTURES[key]) return `<span class="chip${current === key ? ' current' : ''}">${key}</span>`;
      const record = state.practice.find(x => x.kind === 'name' && x.slot === key);
      return `<span class="chip ${record ? record.ok ? 'right' : 'fixed' : ''}${current === key ? ' current' : ''}"${current === key ? ' aria-current="true"' : ''}>${state.labels[key] ? C.STRUCTURES[key].name : '□'}</span>`;
    };
    $('route').innerHTML = [['폐순환', ['RV', 'PA', '폐의 모세 혈관', 'PV', 'LA']], ['온몸순환', ['LV', 'Ao', '온몸의 모세 혈관', 'VC', 'RA']]]
      .map(([name, keys]) => `<div class="route-line"><b>${name}:</b>${keys.map(chip).join('<span>→</span>')}</div>`).join('');
  }
  function drawHud() {
    const h = C.hud(hudFrom || state);
    $('mode').textContent = h.mode === 'practice' ? h.lap + '/3바퀴' : { fill: '보충', ready: '연습 끝', dark: '불 꺼진 바퀴', end: '끝' }[h.mode];
    $('score').textContent = h.score + '점';
    const blood = C.BLOOD[shownBlood];
    $('status').textContent = h.dark ? '불 꺼진 바퀴' : h.mode === 'fill' ? '보충 문항' : '지금 혈액: ' + blood.label + ' · 이산화 탄소 ' + (blood.co2 === 3 ? '많음' : '적음') + ' · ' + (C.circuitAt(shownSquare) === 'pulmonary' ? '폐순환' : '온몸순환');
  }
  function dieLabel(o) {
    const sq = squares[o.square], name = o.blank ? '이름 없는 칸' : sq.kind === 'capillary' ? sq.name : C.STRUCTURES[sq.structure].name;
    return faces[o.steps - 1] + ' ' + o.steps + ' → ' + name + (o.stop ? '에서 멈춤' : '');
  }
  function drawCtrl() {
    const p = C.pending(state);
    $('blank').hidden = p.type !== 'finalName';
    // 지나온 칩 뒤에 현재 빈칸을 옮긴다. 앞으로 남은 칸은 만들지 않는다.
    $('trail').appendChild($('dark-cursor'));
    let html = '';
    const button = (label, pick, disabled = false) => `<button class="btn" data-k="${pick}"${disabled || busy ? ' disabled' : ''}>${label}</button>`;
    if (p.type === 'continue') html = `<p class="feedback">${feedbackText(feedback)}</p>${button('계속', '')}`;
    else if (p.type === 'roll') html = button('주사위 굴리기', '');
    else if (p.type === 'darkStart') html = `<p class="prompt">완성된 판을 보고 경로를 떠올리세요.</p>${button('불 끄고 출발', '')}`;
    else if (p.options.length) {
      const reason = /reason/i.test(p.type), die = p.type === 'die';
      const options = p.type === 'organ' ? Object.entries(C.ORGANS).map(([key, o]) => ({ key, label: o.name, disabled: !p.options.some(x => x.key === key) })) : p.options;
      html = `<p class="prompt">${p.prompt || '주사위 하나를 고르세요.'}</p><div class="sheet-opts${reason ? ' reasons' : die ? ' dice' : ''}">${options.map(o => button(die ? dieLabel(o) : o.label, o.key, o.disabled)).join('')}</div>`;
    }
    $('ctrl').innerHTML = `<div class="sheet">${html}</div>`;
    $('ctrl').dataset.token = p.token;
    $('ctrl').querySelectorAll('button').forEach(b => b.addEventListener('click', () => input(b.dataset.k, p)));
  }
  function draw() { drawBoard(); drawRoute(); drawHud(); drawCtrl(); }
  // 연습 해설 한 줄. 화면 글자와 정답 해설의 표시 시간이 같은 문자열을 쓴다.
  function feedbackText(feedback) {
    const target = C.STRUCTURES[feedback.slot];
    // 보충 이름 해설은 '이곳은' 대신 점선 칸을 가리키고(D-050 ④), 심장 방이면 하는 일 문장을 잇는다.
    const explanation = feedback.at === 'fill' && feedback.kind === 'name' ? `점선으로 표시한 칸은 ${target.name}이다.${target.explain ? ' ' + target.explain : ''}` : feedback.text;
    return (feedback.ok ? '정답! ' : feedback.kind === 'name' ? '고른 답: ' + C.STRUCTURES[feedback.pick].name + '. ' : '') + explanation;
  }
  async function toast(value) {
    if (C.hud(state).dark) return;
    $('toast').classList.toggle('low', squares[shownSquare].row <= 2);
    $('toast').textContent = value; $('toast').classList.add('on');
    await wait(Math.min(6000, Math.max(2200, Array.from(value).length * 70)));
    $('toast').classList.remove('on');
  }
  function trail(value, landmark = false) {
    const chip = document.createElement('span'); chip.className = 'dark-chip' + (landmark ? ' landmark' : ''); chip.textContent = value;
    $('trail').appendChild(chip);
  }
  async function replay(events) {
    for (const e of events) {
      if (e.type === 'step') {
        shownSquare = e.to; drawBoard(); drawRoute(); drawHud();
        const gate = e.valve && $('board').querySelector(`[data-edge="${e.from}:${e.to}"]`);
        if (gate) gate.classList.add('open');
        if (!reduced.matches) await wait(220);
        if (gate) gate.classList.remove('open');
      } else if (e.type === 'exchange') {
        shownBlood = e.bloodOut; drawBoard(); drawHud(); await toast(e.text);
        if (!noteSeen) { noteSeen = true; await toast(e.note); }
      } else if (e.type === 'lapEnd') { hudFrom = null; drawBoard(); drawRoute(); drawHud(); await toast(e.text); }
      else if (/Feedback$/.test(e.type)) {
        feedback = e; draw();
        if (e.ok) await wait(Math.min(6000, Math.max(2200, Array.from(feedbackText(e)).length * 70)));
      } else if (e.type === 'darkStart') {
        hudFrom = null;
        document.body.classList.add('dark'); $('dark').hidden = false;
        $('toast').classList.remove('on'); $('toast').textContent = ''; trail(e.landmark, true); draw();
      } else if (e.type === 'finalAnswer' && e.kind === 'name') trail(C.STRUCTURES[e.pick].name);
      else if (e.type === 'landmark') trail(e.label, true);
    }
  }
  async function input(pick, expected = C.pending(state)) {
    if (!playing || busy || !$('overlay').hidden) return;
    const p = C.pending(state);
    const now = performance.now();
    const out = C.act(state, { type: expected.type, token: expected.token, pick, seconds: (now - lastInput) / 1000 });
    if (out.ignored) return;
    lastInput = now; hudFrom = state; state = out.state; busy = true;
    $('ctrl').querySelectorAll('button').forEach(b => { b.disabled = true; });
    await replay(out.events);
    hudFrom = null;
    busy = false;
    if (p.type === 'continue') feedback = null;
    const result = C.result(state, ((A.data().games.circulation || {}).plays || []).length + 1);
    if (result) { finish(result); return; }
    draw();
    if (C.pending(state).type === 'continue' && feedback.ok) await input(undefined);
  }
  function addFlowQuiz(patchPlay) {
    const overlay = $('overlay'), card = overlay.querySelector('.card'), refl = overlay.querySelector('.refl');
    refl.remove();
    const area = document.createElement('div'); area.className = 'flow-quiz';
    const choices = Math.random() < 0.5 ? [0, 1] : [1, 0];
    area.innerHTML = '<p><b>이어서 떠올리기</b> — 좌심실 벽이 가장 두꺼운 까닭은?</p><div class="flow-opts">' + choices.map(i => `<button class="btn" data-flow="${i}">${['온몸으로 혈액을 내보내야 해서', '폐로 혈액을 내보내야 해서'][i]}</button>`).join('') + '</div><p class="flow-fb" hidden></p>';
    overlay.querySelectorAll('.quiz-opts .btn').forEach(b => b.addEventListener('click', () => card.insertBefore(area, card.querySelector('.row')), { once: true }));
    area.querySelectorAll('.btn').forEach(b => b.onclick = () => {
      const ok = b.dataset.flow === '0';
      area.querySelectorAll('.btn').forEach(x => { x.disabled = true; if (x.dataset.flow === '0') x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      const fb = area.querySelector('.flow-fb'); fb.hidden = false;
      fb.textContent = (ok ? '정답! ' : '아쉬워요. ') + '좌심실은 온몸으로 혈액을 내보내는 방이다. 온몸까지 혈액을 보내려면 강하게 수축해야 해서 근육 벽이 가장 두껍다. 심방은 바로 이어진 심실로 혈액을 보내므로 벽이 얇다.';
      patchPlay({ flowQuizCorrect: ok }); card.insertBefore(refl, card.querySelector('.row'));
    });
    refl.querySelector('textarea').placeholder = '발표 원고처럼 네다섯 문장으로 써 보세요.';
  }
  function finish(result) {
    playing = false; document.body.classList.add('finished'); drawHud(); drawCtrl();
    const patchPlay = A.finish($('overlay'), {
      id: 'circulation', ...result,
      quiz: { q: '폐정맥에 흐르는 혈액은?', options: ['산소가 많은 혈액', '산소가 적은 혈액'], answer: 0,
        explain: '폐정맥에는 산소가 많은 혈액이 흐른다. 「정맥」은 심장으로 들어오는 혈액이 흐르는 혈관이라는 뜻이고, 혈액 속 산소의 양과는 상관없다.' },
      reflection: '우심방의 혈액이 몸을 한 바퀴 돌아 다시 우심방으로 오기까지를 발표하듯 순서대로 쓰세요. 지나는 심장의 방과 혈관, 산소를 받는 곳과 내주는 곳을 넣고, 어디까지가 폐순환이고 어디부터가 온몸순환인지 밝히세요.',
      onRetry: start,
    });
    addFlowQuiz(patchPlay);
  }
  function start() {
    state = C.newGame(Math.floor(Math.random() * 2 ** 32));
    playing = true; busy = false; hudFrom = null; feedback = null; noteSeen = false; shownSquare = 'LV'; shownBlood = 'high';
    document.body.classList.remove('dark', 'finished'); $('dark').hidden = true; $('trail').replaceChildren($('dark-cursor'));
    $('toast').textContent = ''; $('toast').classList.remove('on'); lastInput = performance.now(); draw();
  }
  window.__circ = { state: () => state, pending: () => C.pending(state), correct: () => C.correct(state), fast: on => { fast = !!on; }, view: () => C.pending(hudFrom || state) };
  window.addEventListener('keydown', e => {
    if (!playing || busy || !$('overlay').hidden || e.repeat || e.target.closest('input, textarea, select, [contenteditable]') || ([' ', 'Enter'].includes(e.key) && e.target.closest('a, button'))) return;
    const p = C.pending(state);
    if ([' ', 'Enter'].includes(e.key) && ['roll', 'continue', 'darkStart'].includes(p.type)) { e.preventDefault(); input(undefined, p); }
    else if (/^[1-4]$/.test(e.key)) {
      const b = $('ctrl').querySelectorAll('.sheet-opts .btn')[Number(e.key) - 1];
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
  });
  state = C.newGame(1); draw();
  A.intro($('overlay'), { id: 'circulation', rules: [
    '게임은 혈액 한 방울을 따라 온몸순환과 폐순환을 번갈아 돌지만, 실제 몸에서는 두 순환이 동시에 일어난다. 적혈구가 산소를, 혈장이 이산화 탄소를 나른다.',
    '주사위 두 개 가운데 하나를 고른다. 모세 혈관 칸에 닿거나 출발 칸에 돌아오면 남은 눈을 버리고 멈춘다.',
    '이름이 지워진 칸에 이름표를 붙인다. 혈관은 이름을 확인한 뒤, 그 혈관을 「동맥」 또는 「정맥」이라고 부르는 까닭도 고른다.',
    '그림 속 사람이 나를 마주 본다. 화면 왼쪽이 그림 속 사람의 오른쪽이다.',
    '연습 세 바퀴 뒤, 완성된 판을 보고 불을 끈다. 불 꺼진 바퀴는 기억만으로 돌며, 맞힌 개수는 끝에서 알려 준다.',
    '별 3: 지나는 곳 이름과 까닭을 모두 맞힘 / 별 2: 까닭을 모두 맞히고 지나는 곳 이름은 하나까지만 틀림 / 별 1: 지나는 곳 이름을 절반보다 많이 맞힘',
  ], onStart: start });
})();
