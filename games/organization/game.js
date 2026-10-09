/* 구성 단계 화면. 판정·턴 전환·결과와 기록 문장은 규칙 모듈에 맡긴다. */
(function () {
  'use strict';
  const A = window.Arcade, R = window.Organization;
  const $ = id => document.getElementById(id);
  const kingdomName = key => key === 'animal' ? '동물' : '식물';
  const snapshot = value => JSON.parse(JSON.stringify(value));
  const PRACTICE_HAND = ['stomach:0', 'guardCell:0', 'cat:0', 'epithelium:0', 'sunflower:0', 'digestive:0', 'epithelialCell:0', 'heart:0', 'epidermis:0'];
  const PRACTICE_QUESTIONS = [
    { answer: 'cat:0', question: '함께 이을 생물은 고양이다. 손패에서 고양이를 고르세요.',
      guide: '고양이 패를 찾아 고르세요. 붉은 패가 동물이다.' },
    { answer: 'digestive:0', question: '고양이를 이루는 것 가운데, 위와 창자 등으로 이루어져 먹이를 소화하고 영양소를 흡수하는 것은?',
      guide: '먹이를 소화하고 영양소를 흡수하는 일을 함께 하는 것 전체를 찾아보세요.',
      near: { stomach: '위는 그 가운데 한 부분이다. 위와 창자 등을 함께 묶은 것을 찾아보세요.' } },
    { answer: 'stomach:0', question: '소화계를 이루는 것 가운데, 먹이를 잠시 담아 두고 소화하는 주머니는?',
      guide: '소화계 안에서 먹이를 잠시 담아 두는 주머니를 찾아보세요.',
      near: { heart: '심장은 혈액을 온몸으로 내보낸다. 먹이를 담아 두는 주머니를 찾아보세요.' } },
    { answer: 'epithelium:0', question: '위를 이루는 것 가운데, 위의 안쪽 면을 덮는 얇은 층은?',
      guide: '위는 고양이의 몸에 있다. 붉은 패 가운데 위의 안쪽 면을 덮는 얇은 층을 찾아보세요.',
      near: { epithelialCell: '상피 세포는 그 층을 이루는 작은 단위다. 상피 세포가 모여 이룬 층을 찾아보세요.',
        epidermis: '표피 조직은 식물의 겉을 덮는다. 붉은 패 가운데 고양이 위의 안쪽 면을 덮는 층을 찾아보세요.' } },
    { answer: 'epithelialCell:0', question: '상피 조직을 이루는 것은?',
      guide: '상피 조직은 고양이의 몸에 있다. 붉은 패에서 상피 조직을 이루는 것을 찾아보세요.',
      near: { guardCell: '공변세포는 식물의 표피에 있다. 붉은 패에서 찾아보세요.' } }
  ];
  const PRACTICE_READY = '모두 골랐다. ‘줄로 내기’를 누르세요.';
  let state = null, playing = false, selected = new Set(), target = null, busy = false, busyTimer, lastFailure = null;
  let practice = null;
  function feedback(message, kind = 'guide') {
    $('feedback').textContent = message;
    $('feedback').dataset.kind = kind;
    $('feedback').scrollTop = 0;
    fitPanels();
  }
  function selectionView() {
    if (practice) {
      $('selection').textContent = `고른 패 ${practice.placed ? 0 : practice.chosen.length}장`;
      $('play-line').disabled = practice.placed || practice.step < PRACTICE_QUESTIONS.length;
      return;
    }
    $('selection').textContent = `고른 패 ${selected.size}장 · ${target === null ? '붙일 곳 미선택' : '붙일 곳 선택됨'}`;
    const hint = document.createElement('span'); hint.className = 'keyboard-hint'; hint.textContent = ' (선택 해제: Esc)'; $('selection').append(hint);
    $('play-line').disabled = $('play-group').disabled = !playing || selected.size < 3;
    $('attach').disabled = !playing || selected.size === 0 || target === null;
    $('draw').disabled = !playing || !state?.deck.length;
  }
  function tileButton(id) {
    const t = R.tile(id), button = document.createElement('button');
    button.className = `tile ${t.kingdom}`;
    button.dataset.tile = id;
    button.textContent = t.name;
    const update = () => {
      const chosen = practice ? practice.chosen.includes(id) : selected.has(id);
      button.setAttribute('aria-pressed', String(chosen));
      button.setAttribute('aria-label', `${t.name}, ${kingdomName(t.kingdom)}, ${chosen ? '고름' : '고르지 않음'}`);
    };
    button.onclick = () => {
      if (practice) { choosePractice(id); update(); return; }
      if (!playing || busy) return;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      update(); selectionView();
    };
    button.disabled = !!practice?.placed;
    update(); return button;
  }
  function setView(set, interactive = true) {
    // 세트 전체가 붙일 곳 버튼이다. 별도 44px 막대 없이 머리줄과 패를 함께 누른다.
    const chosen = interactive && target === set.id;
    const box = document.createElement('button'); box.className = `set set-target${chosen ? ' chosen' : ''}`;
    box.dataset.set = set.id;
    const heading = document.createElement('span'); heading.className = 'set-heading';
    const label = set.kind === 'line' ? `${kingdomName(R.tile(set.tiles[0]).kingdom)} ${set.tiles.length === 5 ? '완전한 줄' : '부분 사슬'}` : `${R.STAGES[R.tile(set.tiles[0]).stage]} 묶음`;
    heading.textContent = interactive ? `${label} · ${chosen ? '붙일 곳으로 고름' : '여기에 붙이기'}` : label;
    box.setAttribute('aria-label', `${label}: ${set.tiles.map(id => R.tile(id).name).join(', ')}${interactive ? `, 붙일 곳 ${chosen ? '고름' : '고르지 않음'}` : ''}`);
    box.setAttribute('aria-pressed', String(chosen));
    box.disabled = !interactive || !playing;
    if (interactive) box.onclick = () => { if (busy) return; target = target === set.id ? null : set.id; render(); $('board').querySelector(`[data-set="${set.id}"]`).focus({ preventScroll: true }); };
    const tiles = document.createElement('span'); tiles.className = 'set-tiles';
    tiles.style.setProperty('--tile-count', set.tiles.length);
    // 단계 이름은 낸 뒤에만 보인다. 묶음에도 같은 단계 이름을 표시한다.
    for (const id of set.tiles) {
      const t = R.tile(id), item = document.createElement('span'); item.className = 'board-tile';
      const stage = document.createElement('span'); stage.className = 'stage-name'; stage.textContent = R.STAGES[t.stage]; item.append(stage);
      const tile = document.createElement('span'); tile.className = `tile ${t.kingdom}`; tile.textContent = t.name;
      tile.setAttribute('aria-label', `${t.name}, ${kingdomName(t.kingdom)}, ${R.STAGES[t.stage]}`);
      item.append(tile); tiles.append(item);
    }
    box.append(heading, tiles); return box;
  }
  function render() {
    if (practice) { renderPractice(); return; }
    if (!state) return;
    const handScroll = $('hand').scrollTop, boardScroll = $('board').scrollTop;
    $('turns').textContent = Math.max(0, state.turnLimit - state.turns);
    $('attempts').textContent = state.attemptsRemaining;
    $('hand-count').textContent = state.hand.length;
    const full = R.completed(state);
    $('completed').textContent = `동물 ${full.animal ? '완성' : '미완성'} · 식물 ${full.plant ? '완성' : '미완성'}`;
    $('hand').replaceChildren(...state.hand.map(tileButton));
    $('board').replaceChildren();
    if (!state.board.length) {
      const empty = document.createElement('p'); empty.className = 'empty-board';
      empty.textContent = '아직 내놓은 패가 없다. 손패에서 줄이나 묶음을 만들어 보세요.';
      $('board').append(empty);
    }
    for (const set of state.board) $('board').append(setView(set));
    $('hand').scrollTop = handScroll; $('board').scrollTop = boardScroll;
    selectionView(); fitPanels();
  }
  function fitPanels() {
    const boardPanel = document.querySelector('.board-panel'), handPanel = document.querySelector('.hand-panel');
    // 임시 비율로 먼저 실제 여유 공간을 재측정한다(긴 피드백·회전으로 공간이 달라진다).
    boardPanel.style.flex = '1 1 0';
    const total = boardPanel.getBoundingClientRect().height + handPanel.getBoundingClientRect().height;
    const sets = [...$('board').querySelectorAll('.set')];
    const tallest = Math.max(0, ...sets.map(el => el.getBoundingClientRect().height));
    // 판에는 온전한 세트 하나, 손패에는 최소 한 줄(60px)을 확보한다.
    const boardHeight = Math.min(total - 100, Math.max(total * (sets.length ? 0.52 : 0.35), tallest + 36));
    boardPanel.style.flex = `0 0 ${Math.max(85, boardHeight)}px`;
  }
  function reveal(el) { if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
  function holdInput() {
    busy = true; $('stage').setAttribute('aria-busy', 'true');
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { busy = false; $('stage').setAttribute('aria-busy', 'false'); }, 400);
  }
  function submit(action) {
    if (!playing || busy) return null;
    const signature = JSON.stringify({ ...action, moves: action.moves?.map(move => ({ ...move, tiles: move.tiles.slice().sort() })) });
    if (signature === lastFailure) return null;
    holdInput();
    // 실패여도 새 revision이다. 자동 뽑기가 된 실패에는 draw를 다시 호출하지 않는다.
    const response = R.act(state, { ...action, token: state.revision });
    state = response.state;
    if (response.accepted || response.turnAdvanced) { selected.clear(); target = null; lastFailure = null; }
    else lastFailure = signature;
    selected = new Set([...selected].filter(id => state.hand.includes(id)));
    playing = state.phase === 'playing';
    render();
    if (response.message) {
      feedback(response.message, response.reason === 'outOfScope' ? 'scope' : 'error');
    } else {
      feedback(action.type === 'draw' ? '한 장을 뽑고 다음 턴으로 넘어갔다.' : '패를 내고 다음 턴으로 넘어갔다. 완전한 줄을 이어 보세요.');
    }
    // 안내 길이에 따른 판·손패 높이 조정이 끝난 뒤 새 항목을 보인다.
    if (response.accepted && action.type === 'play') {
      const move = action.moves.at(-1), setId = move.type === 'attach' ? move.setId : state.board.at(-1).id;
      reveal($('board').querySelector(`[data-set="${setId}"]`));
    }
    if ((response.accepted && action.type === 'draw') || response.autoDrawn) reveal($('hand').lastElementChild);
    if (!playing) {
      const report = R.result(state);
      // 마지막 턴의 세 번째 실패도 카드 뒤에 가려지지 않게 모듈 안내를 결과에 남긴다.
      A.finish($('overlay'), { ...report, lines: response.message ? [response.message, ...report.lines] : report.lines, onRetry: start });
    }
    return response;
  }
  function place(kind) { return selected.size < 3 ? null : submit({ type: 'play', moves: [{ type: 'place', kind, tiles: [...selected] }] }); }
  function attach() {
    if (target === null || !selected.size) return null;
    // 줄은 양 끝 어디에 제출하든 단계 순서로 정렬된다. 묶음도 끝에만 붙인다.
    return submit({ type: 'play', moves: [{ type: 'attach', setId: target, side: 'end', tiles: [...selected] }] });
  }
  function hasPlayed() {
    // 기존 판 기록만 읽어 재방문·다시 하기는 연습을 건너뛴다. 새 저장 키는 만들지 않는다.
    // 허브의 기록 지우기로 함께 초기화되어 공용 기기의 다음 학생은 다시 연습한다.
    // 공통 기록 층의 A.plays(사본 API)가 있으면 그것을, 없으면 지금 저장 구조를 읽는다.
    try {
      const plays = typeof A.plays === 'function' ? A.plays('organization') : A.data().games?.organization?.plays;
      return Array.isArray(plays) && plays.length > 0;
    } catch { return false; }
  }
  function begin() { if (hasPlayed()) start(); else startPractice(); holdInput(); }
  function modeView() {
    $('coach').hidden = !practice;
    document.querySelector('.goal').hidden = !!practice;
    $('board-title').textContent = practice ? '판' : '판 — 붙일 줄·묶음을 눌러 고르세요';
    $('play-line').hidden = !!practice?.placed;
    for (const id of ['play-group', 'attach', 'draw']) $(id).hidden = !!practice;
    $('skip-practice').hidden = !practice || practice.placed;
    $('begin-main').hidden = !practice?.placed;
  }
  function coachView() {
    $('coach-label').textContent = practice.placed ? '첫 줄 완성' : '함께 만드는 첫 줄 · 기록하지 않는 연습';
    $('coach-question').textContent = practice.placed ? '고양이의 완전한 줄이다. 낸 줄은 단계 순서로 놓이고, 낸 뒤에야 단계 이름이 보인다.' :
      PRACTICE_QUESTIONS[practice.step]?.question || PRACTICE_READY;
  }
  function practiceHand() { return PRACTICE_HAND.filter(id => !practice.placed || !practice.chosen.includes(id)); }
  function renderPractice() {
    const handScroll = $('hand').scrollTop;
    coachView();
    const hand = practiceHand();
    $('hand-count').textContent = hand.length;
    $('hand').replaceChildren(...hand.map(tileButton));
    $('board').replaceChildren();
    if (practice.placed) {
      const tiles = practice.chosen.slice().sort((a, b) => R.tile(a).number - R.tile(b).number);
      $('board').append(setView({ id: 'practice', kind: 'line', tiles }, false));
    } else {
      const empty = document.createElement('p'); empty.className = 'empty-board';
      empty.textContent = '질문에 맞는 패를 고르면 ✓가 붙는다. 다 고른 뒤 줄로 내면 이곳에 놓인다.';
      $('board').append(empty);
    }
    $('hand').scrollTop = handScroll;
    selectionView(); fitPanels();
  }
  function startPractice() {
    // 연습에는 본게임 상태를 만들지 않는다. 판정도 validateLine만 쓰고 act·결과 기록은 부르지 않는다.
    state = null; playing = false; selected.clear(); target = null; lastFailure = null; busy = false;
    clearTimeout(busyTimer); $('stage').setAttribute('aria-busy', 'false');
    practice = { step: 0, chosen: [], placed: false };
    modeView(); renderPractice();
    $('hand').scrollTop = $('board').scrollTop = 0;
    feedback('질문을 읽고 손패에서 알맞은 패를 고르세요. 연습은 턴·시도·별·기록에 들어가지 않는다.', 'guide');
    $('coach-question').focus({ preventScroll: true });
  }
  function choosePractice(id) {
    if (busy || practice.placed) return;
    if (practice.step === PRACTICE_QUESTIONS.length) { feedback(PRACTICE_READY); return; }
    if (practice.chosen.includes(id)) { feedback('이미 고른 패다. 질문에 맞는 다음 패를 고르세요.'); return; }
    const question = PRACTICE_QUESTIONS[practice.step];
    if (id !== question.answer) { feedback(question.near?.[R.tile(id).id] || question.guide, 'error'); return; }
    practice.chosen.push(id); practice.step++;
    // 손패는 다시 그리지 않는다. 누른 버튼의 aria만 tileButton에서 갱신해 포커스를 유지한다.
    coachView(); selectionView();
    feedback(practice.step < PRACTICE_QUESTIONS.length ? '맞다.' : PRACTICE_READY, 'guide');
  }
  function placePractice() {
    if (busy || practice.placed || practice.step !== PRACTICE_QUESTIONS.length) return;
    const tiles = practice.chosen.slice().sort((a, b) => R.tile(a).number - R.tile(b).number);
    const judgment = R.validateLine(tiles);
    if (!judgment.ok || !judgment.complete) { feedback(judgment.message || '완전한 줄을 놓을 수 없다.', 'error'); return; }
    practice.placed = true;
    modeView(); renderPractice();
    feedback('이제 새 손패 14장으로 동물과 식물의 완전한 줄을 스스로 만들어 보세요. 연습한 줄과 손패는 새 판으로 넘어가지 않는다.');
    $('begin-main').focus({ preventScroll: true });
    reveal($('board').querySelector('.set'));
    holdInput();
  }
  function start(seed, options) {
    practice = null; modeView();
    state = R.newGame(Number.isInteger(seed) ? seed : Math.floor(Math.random() * 0x100000000), options);
    playing = true; selected.clear(); target = null; lastFailure = null; busy = false;
    clearTimeout(busyTimer); $('stage').setAttribute('aria-busy', 'false');
    feedback('줄은 앞 패가 뒤 패를 이루는 관계로 잇는다. 묶음에는 같은 단계의 서로 다른 예를 모은다.');
    render(); $('hand').scrollTop = $('board').scrollTop = 0;
  }
  $('play-line').onclick = () => practice ? placePractice() : place('line');
  $('play-group').onclick = () => place('group');
  $('attach').onclick = attach;
  $('draw').onclick = () => submit({ type: 'draw' });
  $('skip-practice').onclick = $('begin-main').onclick = () => {
    if (practice && !busy) { start(); holdInput(); $('hand').focus({ preventScroll: true }); }
  };
  window.addEventListener('keydown', e => {
    if (!playing || !$('overlay').hidden || e.isComposing || e.ctrlKey || e.altKey || e.metaKey ||
      e.target.closest('input, textarea, select, [contenteditable]')) return;
    document.body.classList.add('keyboard-used');
    if (e.repeat || busy) { e.preventDefault(); return; }
    if (e.code === 'Escape') { e.preventDefault(); selected.clear(); target = null; render(); }
    else if (e.code === 'KeyL' && selected.size >= 3) { e.preventDefault(); place('line'); }
    else if (e.code === 'KeyG' && selected.size >= 3) { e.preventDefault(); place('group'); }
    else if (e.code === 'KeyA' && target !== null && selected.size) { e.preventDefault(); attach(); }
    else if (e.code === 'KeyD') { e.preventDefault(); submit({ type: 'draw' }); }
  });
  window.addEventListener('resize', fitPanels);

  // 테스트 전용: 상태 복사본과 현재 손패의 완전한 줄만 돌려주며 실제 act로 플레이한다.
  function completeLines() {
    if (!state) return [];
    const found = [];
    function walk(ids) {
      const last = R.tile(ids.at(-1));
      if (ids.length === 5) {
        if (R.validateLine(ids).ok) found.push({ kingdom: last.kingdom, tiles: ids });
        return;
      }
      for (const id of state.hand) if ((R.RELATIONS[last.id] || []).includes(R.tile(id).id)) walk(ids.concat(id));
    }
    for (const id of state.hand) if (R.tile(id).stage === 'cell') walk([id]);
    return found;
  }
  window.__org = {
    state: () => state ? snapshot(state) : null, completeLines,
    mode: () => practice ? 'practice' : state ? 'main' : 'intro',
    practice: () => practice ? snapshot({ ...practice, hand: practiceHand(), answers: PRACTICE_QUESTIONS.map(q => q.answer) }) : null,
    // 난수 시드·턴 상한으로 재현한다. 패를 주입하거나 규칙을 건너뛰지 않는다.
    start, draw: () => submit({ type: 'draw' })
  };
  A.intro($('overlay'), { id: 'organization', rules: [
    `<b>${R.RULES.turnLimit}턴 안에 동물과 식물의 완전한 줄</b>(세포부터 개체까지)을 만드세요.`,
    '줄은 앞 패가 뒤 패를 <b>이루는 관계</b>로 잇는다. 붉은색은 동물, 초록색은 식물이다.',
    '묶음은 <b>같은 구성 단계의 서로 다른 예</b>를 3장 이상 모은다.',
    `<details class="more-rules"><summary>규칙 더 보기</summary><ul>${[
      '줄은 3장 이상이다. 낸 뒤에는 단계 순서로 자동 정렬된다. 부분 사슬은 세포부터 개체까지 다 잇지 못한 3~4장 줄이다.',
      '묶음에는 같은 이름을 두 장 넣을 수 없다. 묶음은 완전한 줄을 대신하지 않는다.',
      '패에는 이름만 있고 단계 숫자는 없다. 단계 이름은 줄이나 묶음을 낸 뒤에 보인다.',
      '식물의 기관(잎·줄기)은 세 조직계를 모두 가진다. 이 게임의 관계표는 대표 연결만 담았다.',
      '패를 고르고 줄·묶음으로 내세요. 붙이기는 판에서 붙일 곳도 고르세요. 낸 패는 옮길 수 없다.',
      '한 장 뽑기와 패 내기는 한 턴을 쓴다. 손패를 비울 필요는 없다.',
      '별 3개: 동물과 식물의 완전한 줄 각각. 별 2개: 완전한 줄 하나 이상. 별 1개: 동물과 식물에서 각각 4장 이상의 부분 사슬.',
      '틀린 시도는 까닭을 보고 다시 해 보세요. 한 턴에 3번 틀리면 자동으로 한 장을 뽑고 턴을 넘긴다. 다루지 않는 참 연결과 3장 미만 선택은 시도를 깎지 않는다.',
      '이 기기에 이 게임 기록이 없으면 첫 줄을 함께 만드는 연습부터 한다. 연습은 턴·시도·별·기록에 들어가지 않고, 건너뛸 수 있다.'
    ].concat(matchMedia('(hover: hover) and (pointer: fine)').matches
      // 터치 화면에서는 안내 글이 숨겨져 빈 글머리표만 남으므로 키보드·마우스 기기에서만 넣는다
      ? ['<span class="keyboard-hint">키보드: Tab·Enter로 패와 붙일 곳 선택, L 줄, G 묶음, A 붙이기, D 뽑기, Esc 선택 해제.</span>'] : [])
      .map(rule => `<li>${rule}</li>`).join('')}</ul></details>`
  ], onStart: begin });
})();
