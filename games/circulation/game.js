/* 혈액 한 방울의 이동과 입력 화면. 판단·점수는 규칙 모듈에 맡긴다. */
(function () {
  'use strict';
  const A = window.Arcade, C = window.Circulation, Art = window.ArcadeArt, Board = window.CirculationBoard;
  Art.inject(document);
  document.querySelector('.bar a').innerHTML = Art.icon('back') + '오락실';
  const $ = id => document.getElementById(id);
  const squares = Object.fromEntries(C.SQUARES.map(sq => [sq.id, sq]));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state, playing = false, busy = false, fast = false, lastInput = 0;
  let shownSquare = 'LV', shownBlood = 'high', feedback = null, noteSeen = false;
  let hudFrom = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, fast ? 0 : ms));
  function drawBoard() {
    const dark = C.hud(state).dark;
    const asked = C.pending(hudFrom || state).squares;
    $('board').innerHTML = Board.svg({
      dark, labels: state.labels, asked,
      current: shownSquare, dropSquare: shownSquare, dropBlood: shownBlood,
      candidates: !dark && C.pending(state).type === 'die' ? C.preview(state) : [],
    });
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
    $('score').innerHTML = '<b>' + h.score + '</b>점';
    const best = A.data().games.circulation?.bestScore;
    $('best').textContent = '내 최고 ' + (Number.isFinite(best) ? best : '—');
    const blood = C.BLOOD[shownBlood];
    $('status').textContent = h.dark ? '불 꺼진 바퀴' : h.mode === 'fill' ? '보충 문항' : '지금 혈액: ' + blood.label + ' · 이산화 탄소 ' + (blood.co2 === 3 ? '많음' : '적음') + ' · ' + (C.circuitAt(shownSquare) === 'pulmonary' ? '폐순환' : '온몸순환');
  }
  function dieLabel(o) {
    const sq = squares[o.square], name = o.blank ? '이름 없는 칸' : sq.kind === 'capillary' ? sq.name : C.STRUCTURES[sq.structure].name;
    return Art.die(o.steps) + '<span>' + o.steps + '칸 → ' + name + (o.stop ? '에서 멈춤' : '') + '</span>';
  }
  function drawCtrl() {
    const p = C.pending(state);
    $('blank').hidden = p.type !== 'finalName';
    // 지나온 칩 뒤에 현재 빈칸을 옮긴다. 앞으로 남은 칸은 만들지 않는다.
    $('trail').appendChild($('dark-cursor'));
    let html = '';
    const button = (label, pick, disabled = false) => `<button class="btn" data-k="${pick}"${disabled && p.type === 'organ' ? ` aria-label="${label}, 이미 들른 기관"` : ''}${disabled || busy ? ' disabled' : ''}>${disabled && p.type === 'organ' ? Art.icon('check') : ''}${label}</button>`;
    if (p.type === 'continue') html = `<p class="feedback">${feedbackText(feedback)}</p>${button('계속', '')}`;
    else if (p.type === 'roll') html = button(Art.icon('dice') + '주사위 굴리기', '');
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
    drawHud(); addFlowQuiz(patchPlay);
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
