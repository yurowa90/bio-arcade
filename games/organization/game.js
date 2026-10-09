/* 구성 단계 화면. 판정·턴 전환·결과와 기록 문장은 규칙 모듈에 맡긴다. */
(function () {
  'use strict';
  const A = window.Arcade, R = window.Organization;
  const $ = id => document.getElementById(id);
  const kingdomName = key => key === 'animal' ? '동물' : '식물';
  const snapshot = value => JSON.parse(JSON.stringify(value));
  let state = null, playing = false, selected = new Set(), target = null, busy = false, busyTimer, lastFailure = null;
  function feedback(message, kind = 'guide') {
    $('feedback').textContent = message;
    $('feedback').dataset.kind = kind;
    $('feedback').scrollTop = 0;
    fitPanels();
  }
  function selectionView() {
    $('selection').textContent = `고른 패 ${selected.size}장 · ${target === null ? '붙일 곳 미선택' : '붙일 곳 선택됨'}`;
    const hint = document.createElement('span'); hint.className = 'keyboard-hint'; hint.textContent = ' (선택 해제: Esc)'; $('selection').append(hint);
    $('play-line').disabled = $('play-group').disabled = !playing || selected.size < 3;
    $('attach').disabled = !playing || selected.size === 0 || target === null;
    $('draw').disabled = !playing || !state.deck.length;
  }
  function tileButton(id) {
    const t = R.tile(id), button = document.createElement('button');
    button.className = `tile ${t.kingdom}`;
    button.dataset.tile = id;
    button.textContent = t.name;
    const update = () => {
      const chosen = selected.has(id);
      button.setAttribute('aria-pressed', String(chosen));
      button.setAttribute('aria-label', `${t.name}, ${kingdomName(t.kingdom)}, ${chosen ? '고름' : '고르지 않음'}`);
    };
    button.onclick = () => {
      if (!playing || busy) return;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      update(); selectionView();
    };
    update(); return button;
  }
  function render() {
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
    for (const set of state.board) {
      // 세트 전체가 붙일 곳 버튼이다. 별도 44px 막대 없이 머리줄과 패를 함께 누른다.
      const box = document.createElement('button'); box.className = `set set-target${target === set.id ? ' chosen' : ''}`;
      box.dataset.set = set.id;
      const choose = document.createElement('span'); choose.className = 'set-heading';
      const label = set.kind === 'line' ? `${kingdomName(R.tile(set.tiles[0]).kingdom)} ${set.tiles.length === 5 ? '완전한 줄' : '부분 사슬'}` : `${R.STAGES[R.tile(set.tiles[0]).stage]} 묶음`;
      choose.textContent = `${label} · ${target === set.id ? '붙일 곳으로 고름' : '여기에 붙이기'}`;
      box.setAttribute('aria-label', `${label}: ${set.tiles.map(id => R.tile(id).name).join(', ')}, 붙일 곳 ${target === set.id ? '고름' : '고르지 않음'}`);
      box.setAttribute('aria-pressed', String(target === set.id));
      box.disabled = !playing;
      box.onclick = () => { if (busy) return; target = target === set.id ? null : set.id; render(); $('board').querySelector(`[data-set="${set.id}"]`).focus({ preventScroll: true }); };
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
      box.append(choose, tiles); $('board').append(box);
    }
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
  function submit(action) {
    if (!playing || busy) return null;
    const signature = JSON.stringify({ ...action, moves: action.moves?.map(move => ({ ...move, tiles: move.tiles.slice().sort() })) });
    if (signature === lastFailure) return null;
    busy = true; $('stage').setAttribute('aria-busy', 'true');
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { busy = false; $('stage').setAttribute('aria-busy', 'false'); }, 400);
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
  function start(seed, options) {
    state = R.newGame(Number.isInteger(seed) ? seed : Math.floor(Math.random() * 0x100000000), options);
    playing = true; selected.clear(); target = null; lastFailure = null; busy = false;
    clearTimeout(busyTimer); $('stage').setAttribute('aria-busy', 'false');
    feedback('줄은 앞 패가 뒤 패를 이루는 관계로 잇는다. 묶음에는 같은 단계의 서로 다른 예를 모은다.');
    render(); $('hand').scrollTop = $('board').scrollTop = 0;
  }
  $('play-line').onclick = () => place('line');
  $('play-group').onclick = () => place('group');
  $('attach').onclick = attach;
  $('draw').onclick = () => submit({ type: 'draw' });
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
    // 난수 시드·턴 상한으로 재현한다. 패를 주입하거나 규칙을 건너뛰지 않는다.
    start, draw: () => submit({ type: 'draw' })
  };
  A.intro($('overlay'), { id: 'organization', rules: [
    '줄은 앞 패가 뒤 패를 <b>이루는 관계</b>로 이어진 3장 이상이다. 낸 뒤에는 단계 순서로 자동 정렬된다. 부분 사슬은 세포부터 개체까지 다 잇지 못한 3~4장 줄이다.',
    '묶음은 <b>같은 구성 단계의 서로 다른 예</b> 3장 이상이다. 같은 이름을 두 장 넣을 수 없다.',
    '붉은색은 동물, 초록색은 식물이다. 패에는 이름만 있고 단계 숫자는 없다. 단계 이름은 줄이나 묶음을 낸 뒤에 보인다.',
    '식물의 기관(잎·줄기)은 세 조직계를 모두 가진다. 이 게임의 관계표는 대표 연결만 담았다.',
    '패를 고르고 줄·묶음으로 내세요. 붙이기는 판에서 붙일 곳도 고르세요. 낸 패는 옮길 수 없다.',
    `<b>${R.RULES.turnLimit}턴 안에 동물과 식물의 완전한 줄(세포부터 개체까지)</b>을 만드세요. 한 장 뽑기와 패 내기는 한 턴을 쓴다. 손패를 비울 필요는 없다.`,
    '별 3개: 동물과 식물의 완전한 줄 각각. 별 2개: 완전한 줄 하나 이상. 별 1개: 동물과 식물에서 각각 4장 이상의 부분 사슬.',
    '틀린 시도는 까닭을 보고 다시 해 보세요. 한 턴에 3번 틀리면 자동으로 한 장을 뽑고 턴을 넘긴다. 다루지 않는 참 연결과 3장 미만 선택은 시도를 깎지 않는다.'
  ].concat(matchMedia('(hover: hover) and (pointer: fine)').matches
    // 터치 화면에서는 안내 글이 숨겨져 빈 글머리표만 남으므로 키보드·마우스 기기에서만 넣는다
    ? ['<span class="keyboard-hint">키보드: Tab·Enter로 패와 붙일 곳 선택, L 줄, G 묶음, A 붙이기, D 뽑기, Esc 선택 해제.</span>'] : []), onStart: start });
})();
