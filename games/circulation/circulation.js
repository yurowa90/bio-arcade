/* 혈액 순환 일주 — DOM·저장소·시계에 의존하지 않는 규칙.
 * 입력: act(s, { type: pending(s).type, token: pending(s).token, pick, seconds? }).
 * token은 중복 클릭을 막는다. 무시한 입력은 같은 state·events: []·ignored: true,
 * 받아들인 입력은 복사한 state·ignored: false를 반환한다.
 * pick: 이름·경계는 구조 문자열 키, 까닭은 'direction'|'oxygen', 기관은 기관 문자열 키,
 * 주사위는 0|1 또는 '0'|'1'. roll·continue·darkStart에는 pick이 필요 없다.
 * seconds는 직전 입력 이후 경과 초. 유한한 0 이상 숫자만 합산한다.
 * 누락·null·잘못된 시간은 입력을 막지 않고 untimedCount에 센다(시간 합계는 0부터).
 * continue는 피드백을 읽은 뒤 호출한다. 맞힌 답도 화면 연출 뒤 continue를 보낸다.
 * 화면은 pending·events·preview, HUD는 hud, 별·점수·결과 문장·detail은 result(state, playNo)로만 얻는다.
 * stars(final)은 경계 문항 중에도 값을 내므로 검사 전용이다. correct와 FINAL_*도 검사 전용이다.
 * 화면이 읽어도 되는 state 필드는 labels와 practice[].kind·slot·ok뿐이다.
 * 모세 혈관 칸의 bloodIn·bloodOut은 BLOOD 키다. 기존 blood는 bloodOut과 같다.
 * detail의 두 칸 신호는 [연습, 마지막]이고 측정 불가능한 칸은 null이다.
 * 신호                            연습 보기/조건                  마지막 보기/조건
 * pulmonarySwap, systemicSwap     같은 순환의 동맥·정맥          같은 순환의 동맥·정맥
 * circuitSwap                     다른 순환의 같은 종류 혈관     PA↔Ao(VC↔PV는 보기 없음)
 * skip                            측정하지 않음                  VC→PA, PV→Ao
 * ventricleVein                   Ao→PV, PA→VC                   해당 혈관 보기 없음
 * vesselChamber                   심장 방 보기 없음              혈관 자리의 심장 방 보기
 * chamberSide/Type/Diagonal       심장 방 넷                     심장 방 넷
 * reasonOxygen.systemic/pulmonary 방향·산소 까닭 둘               방향·산소 까닭 둘
 */
(function (root) {
  'use strict';
  const LAPS = 3;
  function freeze(x) {
    if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
    return x;
  }
  const BLOOD = freeze({
    high: { label: '산소가 많은 혈액', color: '#e53935', oxygen: 5, co2: 1 },
    low: { label: '산소가 적은 혈액', color: '#6d1b2b', oxygen: 2, co2: 3 },
  });
  const STRUCTURES = freeze({
    RA: { name: '우심방', kind: 'chamber', side: 'right', type: 'atrium', circuit: 'systemic', blood: 'low', explain: '온몸을 돌고 온 혈액이 들어오는 방이다.' },
    RV: { name: '우심실', kind: 'chamber', side: 'right', type: 'ventricle', circuit: 'pulmonary', blood: 'low', explain: '폐로 혈액을 내보내는 방이다.' },
    LA: { name: '좌심방', kind: 'chamber', side: 'left', type: 'atrium', circuit: 'pulmonary', blood: 'high', explain: '폐를 거쳐 온 혈액이 들어오는 방이다.' },
    LV: { name: '좌심실', kind: 'chamber', side: 'left', type: 'ventricle', circuit: 'systemic', blood: 'high', explain: '온몸으로 혈액을 내보내는 방이다.' },
    Ao: { name: '대동맥', kind: 'vessel', type: 'artery', circuit: 'systemic', blood: 'high' },
    VC: { name: '대정맥', kind: 'vessel', type: 'vein', circuit: 'systemic', blood: 'low' },
    PA: { name: '폐동맥', kind: 'vessel', type: 'artery', circuit: 'pulmonary', blood: 'low' },
    PV: { name: '폐정맥', kind: 'vessel', type: 'vein', circuit: 'pulmonary', blood: 'high' },
  });
  const ORGANS = freeze({
    brain: { name: '뇌', row: 5, k: 1, guide: '뇌의 세포에 산소와 포도당을 주고 이산화 탄소를 받는다.' },
    kidney: { name: '콩팥', row: 6, k: 2, guide: '혈액 속 요소 같은 노폐물이 걸러진다. 콩팥의 세포에도 산소와 포도당을 주고 이산화 탄소를 받는다.' },
    leg: { name: '다리 근육', row: 7, k: 3, guide: '다리 근육의 세포에 산소와 포도당을 주고 이산화 탄소를 받는다.' },
  });
  const GUIDES = freeze({
    lung: '폐포의 산소는 모세 혈관으로, 모세 혈관의 이산화 탄소는 폐포로 이동한다.',
    capillary: '모세 혈관에서는 혈액이 가장 느리게 흐르며 물질을 주고받는다.',
    lapEnd: '심장을 두 번 지났다. 심장 칸을 지날 때는 혈액 색이 바뀌지 않았다. 심장은 혈액을 내보낼 뿐, 혈액에 산소를 더하지 않는다.',
  });
  const SQUARES = [];
  function square(id, structure, col, row) {
    const s = STRUCTURES[structure];
    SQUARES.push({ id, structure, col, row, span: 1, kind: s.kind, blood: s.blood, circuit: s.circuit });
  }
  square('RA', 'RA', 1, 3); square('RV', 'RV', 1, 4);
  square('LA', 'LA', 3, 3); square('LV', 'LV', 3, 4);
  square('PA1', 'PA', 2, 2); square('PA2', 'PA', 2, 1);
  square('PV1', 'PV', 4, 1); square('PV2', 'PV', 4, 2);
  SQUARES.push({ id: 'lung', kind: 'capillary', name: '폐의 모세 혈관', col: 2, row: 0, span: 3, bloodIn: 'low', bloodOut: 'high', blood: 'high', circuit: 'pulmonary' });
  for (const [id, o] of Object.entries(ORGANS)) {
    square('Ao' + o.k, 'Ao', 4, o.row); square('VC' + o.k, 'VC', 0, o.row);
    SQUARES.push({ id, kind: 'capillary', name: o.name + '의 모세 혈관', col: 1, row: o.row, span: 3, bloodIn: 'high', bloodOut: 'low', blood: 'low', circuit: 'systemic' });
  }
  freeze(SQUARES);
  const BY_ID = Object.fromEntries(SQUARES.map(s => [s.id, s]));
  const CHAMBERS = ['RA', 'LA', 'RV', 'LV'], VESSELS = ['Ao', 'VC', 'PA', 'PV'];
  // 혈관 3 + 심장 방 1: 산소에 따른 폐혈관 교환과 두 skip을 실제로 선택할 수 있다.
  // 정답 위치는 혈관 네 자리에서 4·2·3·1, 이름 전체에서 각 위치가 두 번이다.
  const NAME_OPTIONS = freeze({
    RA: CHAMBERS.slice(), RV: CHAMBERS.slice(), LA: CHAMBERS.slice(), LV: CHAMBERS.slice(),
    VC: ['RA', 'PA', 'Ao', 'VC'], PA: ['PV', 'PA', 'RA', 'Ao'],
    PV: ['PA', 'LA', 'PV', 'Ao'], Ao: ['Ao', 'VC', 'PA', 'LA'],
  });
  const FINAL_NAMES = freeze(['VC', 'RA', 'RV', 'PA', 'PV', 'LA', 'LV', 'Ao']);
  const FINAL_REASONS = freeze(['Ao', 'VC', 'PA', 'PV']);
  const FINAL_REASON_OPTIONS = freeze({ Ao: ['direction', 'oxygen'], VC: ['oxygen', 'direction'], PA: ['oxygen', 'direction'], PV: ['direction', 'oxygen'] });
  const FINAL_BOUNDARIES = freeze([
    { id: 'pulmonaryEnd', prompt: '폐순환이 끝나는 곳은?', options: ['LA', 'LV'], answer: 'LA' },
    { id: 'systemicStart', prompt: '온몸순환이 시작되는 곳은?', options: CHAMBERS.slice(), answer: 'LV' },
  ]);
  const FILL_ORDER = ['LV', 'Ao', 'VC', 'RA', 'RV', 'PA', 'PV', 'LA'];
  const VALVES = freeze([['RA', 'RV'], ['RV', 'PA1'], ['LA', 'LV'], ['LV', 'Ao1']]);

  function randomValue(n) {
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function rng(seed) { let n = seed >>> 0; return () => randomValue(n = (n + 0x6D2B79F5) >>> 0); }
  function draw(s) { s.random = (s.random + 0x6D2B79F5) >>> 0; return randomValue(s.random); }
  function shuffle(s, keys) {
    const a = keys.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(draw(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function lapPath(organ) {
    const o = ORGANS[organ];
    if (!o) throw new RangeError('기관 키를 확인하세요.');
    const a = [];
    for (let k = 1; k <= o.k; k++) a.push('Ao' + k);
    a.push(organ);
    for (let k = o.k; k >= 1; k--) a.push('VC' + k);
    return a.concat(['RA', 'RV', 'PA1', 'PA2', 'lung', 'PV1', 'PV2', 'LA', 'LV']);
  }
  // pos=-1은 출발 좌심실, to는 path의 인덱스, passed는 지나간 칸 id 목록이다.
  function move(path, pos, steps) {
    if (!Array.isArray(path) || !path.length || path.some(id => !BY_ID[id]) ||
        !Number.isInteger(pos) || pos < -1 || pos >= path.length || !Number.isInteger(steps) || steps < 1 || steps > 6) {
      throw new RangeError('경로·위치·주사위 눈을 확인하세요.');
    }
    let to = pos, stop = pos === path.length - 1 ? 'lapEnd' : null;
    const passed = [];
    for (let n = 0; n < steps && to < path.length - 1; n++) {
      passed.push(path[++to]);
      if (BY_ID[path[to]].kind === 'capillary') { stop = 'capillary'; break; }
      if (to === path.length - 1) { stop = 'lapEnd'; break; }
    }
    return { to, passed, stop };
  }
  function getSquare(sq) { return typeof sq === 'string' ? BY_ID[sq] : sq; }
  function bloodAt(sq) { const s = getSquare(sq); return s ? BLOOD[s.blood] : null; }
  function circuitAt(sq) { const s = getSquare(sq); return s ? s.circuit : null; }
  function preview(s, dice = s.dice) {
    return dice.map((steps, index) => {
      const m = move(s.path, s.pos, steps), sq = BY_ID[s.path[m.to]];
      const label = sq.kind === 'capillary' ? sq.name : s.labels[sq.structure] ? STRUCTURES[sq.structure].name : '이름 없는 칸';
      return { index, steps, ...m, square: sq.id, label: label + (m.stop ? '(멈춤)' : ''), blank: !!sq.structure && !s.labels[sq.structure] };
    });
  }
  function judgeName(slot, pick) {
    const a = STRUCTURES[slot], b = STRUCTURES[pick];
    if (!a || !b) return { ok: false, tag: null };
    if (slot === pick) return { ok: true, tag: null };
    if (a.kind !== b.kind) return { ok: false, tag: a.kind === 'vessel' ? 'vesselChamber' : 'chamberVessel' };
    let tag;
    if (a.kind === 'chamber') tag = a.side === b.side ? 'type' : a.type === b.type ? 'side' : 'diagonal';
    else if (a.circuit === b.circuit) tag = 'arteryVein';
    else if (a.type === b.type) tag = 'circuit';
    else tag = a.type === 'vein' ? 'skip' : 'ventricleVein';
    return { ok: false, tag };
  }
  function judgeReason(vessel, pick) {
    if (!STRUCTURES[vessel] || STRUCTURES[vessel].kind !== 'vessel') return { ok: false, tag: null };
    return { ok: pick === 'direction', tag: pick === 'oxygen' ? 'oxygen' : null };
  }
  function nameExplanation(slot) {
    const x = STRUCTURES[slot];
    return x.kind === 'vessel' ? '이곳은 ' + x.name + '이다.' : x.name + ': ' + x.explain;
  }
  function reasonExplanation(slot, pick) {
    if (pick === 'oxygen') return {
      Ao: '대동맥에 산소가 많은 혈액이 흐르는 것은 맞다. 그러나 「동맥」은 심장에서 나가는 혈액이 흐르는 혈관이라는 뜻이다.',
      VC: '대정맥에 산소가 적은 혈액이 흐르는 것은 맞다. 그러나 「정맥」은 심장으로 들어오는 혈액이 흐르는 혈관이라는 뜻이다.',
      PA: '폐동맥에는 산소가 적은 혈액이 흐른다. 그래도 심장에서 나가는 혈액이 흐르므로 「동맥」이다.',
      PV: '폐정맥에는 산소가 많은 혈액이 흐른다. 그래도 심장으로 들어오는 혈액이 흐르므로 「정맥」이다.',
    }[slot];
    return STRUCTURES[slot].type === 'artery' ? '동맥은 심장에서 나가는 혈액이 흐르는 혈관이다.' : '정맥은 심장으로 들어오는 혈액이 흐르는 혈관이다.';
  }
  function reasonQuestion(slot, keys) {
    const a = STRUCTURES[slot], artery = a.type === 'artery';
    return { prompt: a.name + '을 「' + (artery ? '동맥' : '정맥') + '」이라고 부르는 까닭은?',
      options: keys.map(key => ({ key, label: key === 'direction' ? (artery ? '심장에서 나가는' : '심장으로 들어오는') + ' 혈액이 흘러서' : (artery ? '산소가 많은' : '산소가 적은') + ' 혈액이 흘러서' })) };
  }
  const nameOptions = keys => keys.map(key => ({ key, label: STRUCTURES[key].name }));
  function askName(s, slot, at) {
    s.slot = slot; s.at = at;
    s.phase = at === 'start' ? 'nameStart' : at === 'fill' ? 'fillName' : 'name';
    s.options = STRUCTURES[slot].kind === 'chamber' ? shuffle(s, CHAMBERS) : VESSELS.slice();
  }
  function newGame(seed = 1) {
    if (typeof seed !== 'number' || !Number.isFinite(seed)) throw new TypeError('시드는 유한한 숫자여야 한다.');
    if (!Number.isInteger(seed) && seed > 0 && seed < 1) seed = Math.floor(seed * 2 ** 32);
    const s = { phase: '', revision: 0, random: seed >>> 0, lap: 1, completedLaps: 0, organs: [], path: [], pos: -1,
      square: 'LV', dice: [], labels: {}, practice: [], final: [], boundaries: [], turns: 0, blankOpportunities: 0,
      blankChosen: 0, options: [], slot: null, at: null, after: null, playSec: 0, untimedCount: 0 };
    askName(s, 'LV', 'start');
    return s;
  }
  function pending(s) {
    const p = { type: s.phase, token: s.revision };
    if (['fillName', 'fillReason'].includes(s.phase)) {
      const target = { slot: s.slot, squares: SQUARES.filter(q => q.structure === s.slot).map(q => q.id) };
      return s.phase === 'fillName' ? { ...p, ...target, prompt: '점선으로 표시한 칸의 이름은?', options: nameOptions(s.options) } :
        { ...p, ...target, ...reasonQuestion(s.slot, s.options) };
    }
    if (['nameStart', 'name', 'fillName'].includes(s.phase)) return { ...p, prompt: '이곳의 이름은?', options: nameOptions(s.options) };
    if (['reason', 'fillReason'].includes(s.phase)) return { ...p, ...reasonQuestion(s.slot, s.options) };
    if (s.phase === 'organ') return { ...p, prompt: '이번 바퀴에 들를 기관은?', options: Object.entries(ORGANS).filter(([id]) => !s.organs.includes(id)).map(([key, o]) => ({ key, label: o.name })) };
    if (s.phase === 'die') return { ...p, options: preview(s).map(x => ({ ...x, key: x.index, label: x.steps + '칸 → ' + x.label })) };
    if (s.phase === 'finalName') return { ...p, prompt: '다음에 지나는 곳은?', options: nameOptions(NAME_OPTIONS[FINAL_NAMES[s.final.length]]) };
    if (s.phase === 'finalReason') { const slot = FINAL_REASONS[s.final.length - 8]; return { ...p, ...reasonQuestion(slot, FINAL_REASON_OPTIONS[slot]) }; }
    if (s.phase === 'finalBoundary') { const q = FINAL_BOUNDARIES[s.boundaries.length]; return { ...p, prompt: q.prompt, options: nameOptions(q.options) }; }
    return { ...p, options: [] };
  }
  // 화면에는 노출하지 않는다. 정답 없는 조작은 null이다.
  function correct(s) {
    if (['nameStart', 'name', 'fillName'].includes(s.phase)) return s.slot;
    if (['reason', 'fillReason', 'finalReason'].includes(s.phase)) return 'direction';
    if (s.phase === 'finalName') return FINAL_NAMES[s.final.length];
    if (s.phase === 'finalBoundary') return FINAL_BOUNDARIES[s.boundaries.length].answer;
    return null;
  }
  function copy(s) {
    return { ...s, organs: s.organs.slice(), path: s.path.slice(), dice: s.dice.slice(), labels: { ...s.labels }, options: s.options.slice(),
      practice: s.practice.map(x => ({ ...x })), final: s.final.map(x => ({ ...x })), boundaries: s.boundaries.map(x => ({ ...x })) };
  }
  function nextPractice(s) {
    s.slot = null; s.options = []; s.after = null;
    if (s.completedLaps < LAPS) { s.phase = s.pos === -1 || s.pos === s.path.length - 1 ? 'organ' : 'roll'; return; }
    const missing = FILL_ORDER.find(id => !s.labels[id]);
    if (missing) askName(s, missing, 'fill'); else s.phase = 'darkStart';
  }
  function act(state, action) {
    const p = pending(state);
    const pick = action && state.phase === 'die' && ['0', '1'].includes(action.pick) ? Number(action.pick) : action?.pick;
    if (!action || action.type !== p.type || action.token !== p.token || state.phase === 'end' ||
        (p.options.length && !p.options.some(o => o.key === pick))) {
      return { state, events: [], ignored: true };
    }
    const s = copy(state), events = [], phase = s.phase;
    s.revision++;
    const sec = Number.isFinite(action.seconds) && action.seconds >= 0 ? action.seconds : null;
    if (sec === null) s.untimedCount++; else s.playSec += sec;
    if (phase === 'continue') {
      if (s.after === 'reason') { s.phase = s.at === 'fill' ? 'fillReason' : 'reason'; s.options = shuffle(s, ['direction', 'oxygen']); s.after = null; }
      else nextPractice(s);
    } else if (phase === 'organ') {
      s.organs.push(action.pick); s.lap = s.organs.length; s.path = lapPath(action.pick); s.pos = -1; s.phase = 'roll';
    } else if (phase === 'roll') {
      s.dice = [1 + Math.floor(draw(s) * 6), 1 + Math.floor(draw(s) * 6)]; s.turns++; s.phase = 'die';
      if (preview(s).some(x => x.blank)) s.blankOpportunities++;
      events.push({ type: 'rolled', dice: s.dice.slice() });
    } else if (phase === 'die') {
      const dest = preview(s)[pick];
      if (dest.blank) s.blankChosen++;
      let from = s.square;
      for (const id of dest.passed) {
        events.push({ type: 'step', from, to: id, valve: VALVES.some(v => v[0] === from && v[1] === id) });
        from = id;
      }
      s.pos = dest.to; s.square = dest.square; s.dice = [];
      const sq = BY_ID[s.square];
      if (dest.stop === 'capillary') {
        events.push({ type: 'exchange', square: sq.id, blood: sq.blood, bloodIn: sq.bloodIn, bloodOut: sq.bloodOut,
          text: sq.id === 'lung' ? GUIDES.lung : ORGANS[sq.id].guide, note: GUIDES.capillary });
        s.phase = 'roll';
      } else if (dest.stop === 'lapEnd') {
        s.completedLaps++; events.push({ type: 'lapEnd', lap: s.completedLaps, text: GUIDES.lapEnd }); nextPractice(s);
      } else if (dest.blank) askName(s, sq.structure, 'play');
      else s.phase = 'roll';
    } else if (['nameStart', 'name', 'fillName', 'reason', 'fillReason'].includes(phase)) {
      const kind = phase === 'reason' || phase === 'fillReason' ? 'reason' : 'name';
      const judged = kind === 'name' ? judgeName(s.slot, action.pick) : judgeReason(s.slot, action.pick);
      const record = { kind, slot: s.slot, pick: action.pick, ...judged, order: s.practice.length + 1, at: s.at, lap: s.lap };
      s.practice.push(record);
      if (kind === 'name') s.labels[s.slot] = true;
      events.push({ type: kind === 'name' ? 'nameFeedback' : 'reasonFeedback', ...record,
        text: kind === 'name' ? nameExplanation(s.slot) : reasonExplanation(s.slot, pick) });
      s.after = kind === 'name' && STRUCTURES[s.slot].kind === 'vessel' ? 'reason' : 'next';
      s.phase = 'continue'; s.options = [];
    } else if (phase === 'darkStart') {
      s.phase = 'finalName'; s.slot = null; s.options = [];
      events.push({ type: 'darkStart', landmark: '온몸의 모세 혈관' });
    } else if (phase === 'finalName' || phase === 'finalReason' || phase === 'finalBoundary') {
      const kind = phase === 'finalName' ? 'name' : phase === 'finalReason' ? 'reason' : 'boundary';
      const answer = { pick, sec };
      if (kind === 'boundary') s.boundaries.push(answer); else s.final.push(answer);
      // 고른 답만 돌려준다. 정답 키·정오·꼬리표·남은 빈칸 수를 싣지 않는다.
      events.push({ type: 'finalAnswer', kind, pick: action.pick });
      if (kind === 'name' && (s.final.length === 4 || s.final.length === 8)) events.push({ type: 'landmark', label: s.final.length === 4 ? '폐의 모세 혈관' : '온몸의 모세 혈관' });
      if (kind === 'boundary') { if (s.boundaries.length === 2) { s.phase = 'end'; events.push({ type: 'end' }); } }
      else s.phase = s.final.length < 8 ? 'finalName' : s.final.length < 12 ? 'finalReason' : 'finalBoundary';
    }
    return { state: s, events, ignored: false };
  }
  function grade(final) {
    return final.slice(0, 12).map((x, i) => {
      const kind = i < 8 ? 'name' : 'reason', slot = i < 8 ? FINAL_NAMES[i] : FINAL_REASONS[i - 8];
      return { ...x, kind, slot, ...(kind === 'name' ? judgeName(slot, x.pick) : judgeReason(slot, x.pick)) };
    });
  }
  function counts(final) {
    const a = grade(final);
    return { names: a.filter(x => x.kind === 'name' && x.ok).length, reasons: a.filter(x => x.kind === 'reason' && x.ok).length };
  }
  function stars(final) {
    if (!Array.isArray(final) || final.length !== 12 || !Array.from(final).every((x, i) => x &&
      (i < 8 ? NAME_OPTIONS[FINAL_NAMES[i]] : FINAL_REASON_OPTIONS[FINAL_REASONS[i - 8]]).includes(x.pick))) return null;
    const { names, reasons } = counts(final);
    return names === 8 && reasons === 4 ? 3 : names >= 7 && reasons === 4 ? 2 : names >= 5 ? 1 : 0;
  }
  function practiceRecords(s) {
    return s.practice.map(x => ({ ...x, ...(x.kind === 'name' ? judgeName(x.slot, x.pick) : judgeReason(x.slot, x.pick)) }));
  }
  function scoreParts(s) {
    const records = practiceRecords(s);
    const practice = records.filter(x => x.ok).length * 5;
    const board = records.filter(x => x.kind === 'name' && x.at === 'play' && x.ok).length * 5;
    const final = s.phase === 'end' ? grade(s.final).filter(x => x.ok).length * 10 : 0;
    return { practice, board, final, total: practice + board + final };
  }
  function score(s) { return scoreParts(s).total; }
  function hud(s) {
    const dark = ['finalName', 'finalReason', 'finalBoundary'].includes(s.phase);
    const mode = s.phase === 'end' ? 'end' : dark ? 'dark' : s.phase === 'darkStart' ? 'ready' :
      s.completedLaps === LAPS ? 'fill' : 'practice';
    return { mode, lap: dark || ['darkStart', 'end'].includes(s.phase) ? null : s.phase === 'organ' ? s.completedLaps + 1 : s.lap,
      dark, score: score(s) };
  }
  function detail(s, playNo = 1) {
    if (s.phase !== 'end') return null;
    const practice = practiceRecords(s), final = grade(s.final), d = { practice, final,
      boundaries: s.boundaries.map((x, i) => ({ ...x, id: FINAL_BOUNDARIES[i].id, ok: x.pick === FINAL_BOUNDARIES[i].answer })),
      practiceFirst: practice.filter(x => x.ok).length, finalCorrect: final.filter(x => x.ok).length, playNo,
      pulmonarySwap: [0, 0], systemicSwap: [0, 0], circuitSwap: [0, 0], skip: [null, 0], ventricleVein: [0, null],
      chamberSide: [0, 0], chamberType: [0, 0], chamberDiagonal: [0, 0], vesselChamber: [null, 0], pvToRA: false,
      reasonOxygen: { systemic: [0, 0], pulmonary: [0, 0] }, reasonOxygenNameRight: [], cueConflict: 0,
      firstVessel: null, repeatWrong: [], organs: s.organs.slice(), turns: s.turns,
      blankOpportunities: s.blankOpportunities, blankChosen: s.blankChosen, score: scoreParts(s),
      finalSec: s.final.reduce((n, x) => n + (x.sec ?? 0), 0),
      boundarySec: s.boundaries.reduce((n, x) => n + (x.sec ?? 0), 0),
      playSec: s.playSec, untimedCount: s.untimedCount };
    [practice, final].forEach((records, phase) => records.forEach(x => {
      const structure = STRUCTURES[x.slot];
      if (x.tag === 'arteryVein') d[structure.circuit === 'pulmonary' ? 'pulmonarySwap' : 'systemicSwap'][phase]++;
      const tagKey = { circuit: 'circuitSwap', ventricleVein: 'ventricleVein', side: 'chamberSide', type: 'chamberType', diagonal: 'chamberDiagonal', vesselChamber: 'vesselChamber' }[x.tag];
      if (tagKey && d[tagKey][phase] !== null) d[tagKey][phase]++;
      if (x.tag === 'skip' && phase === 1) d.skip[1]++;
      if (x.tag === 'oxygen') {
        d.reasonOxygen[structure.circuit][phase]++;
        if (phase === 0 && structure.circuit === 'pulmonary') d.cueConflict++;
        if (phase === 0 && records.some(n => n.kind === 'name' && n.slot === x.slot && n.ok)) d.reasonOxygenNameRight.push(x.slot);
      }
    }));
    d.pvToRA = final.some(x => x.slot === 'LA' && x.pick === 'RA');
    const first = practice.find(x => x.kind === 'name' && STRUCTURES[x.slot].kind === 'vessel');
    if (first) d.firstVessel = { vessel: first.slot, name: { ...first }, reason: { ...practice.find(x => x.kind === 'reason' && x.slot === first.slot) } };
    d.repeatWrong = final.filter(x => !x.ok && practice.some(p => !p.ok && p.kind === x.kind && p.slot === x.slot && p.pick === x.pick)).map(x => ({ kind: x.kind, slot: x.slot, pick: x.pick }));
    return d;
  }
  function resultLines(s) {
    if (s.phase !== 'end') return [];
    const d = detail(s), c = counts(s.final), n = stars(s.final);
    const lines = ['마지막 바퀴: 이름 ' + c.names + '/8 · 까닭 ' + c.reasons + '/4',
      '연습 바퀴에서 처음 고른 답 ' + d.practiceFirst + '/12 → 마지막 바퀴 ' + d.finalCorrect + '/12' +
      (d.repeatWrong.length ? ' (연습 때와 같은 오답 ' + d.repeatWrong.length + '개)' : '')];
    const corrections = [], wrongReasons = d.final.filter(x => x.kind === 'reason' && !x.ok);
    if (wrongReasons.length) corrections.push({ priority: 0,
      // 맨 앞 고정이라 결과 순서에는 쓰이지 않는다. 고의 변이 resultOrder가 이 값으로 까닭 줄을 뒤로 보내 실패를 내므로 남긴다.
      order: Math.min(...wrongReasons.map(x => FINAL_NAMES.indexOf(x.slot))),
      text: '동맥은 심장에서 나가는 혈액이 흐르는 혈관이고, 정맥은 심장으로 들어오는 혈액이 흐르는 혈관이다(까닭 ' + wrongReasons.length + '개 틀림).' });
    const nameLines = {
      VC: '온몸의 모세 혈관 다음 혈관은 대정맥이다', RA: '온몸을 돌고 온 혈액이 들어오는 방은 우심방이다',
      RV: '폐로 혈액을 내보내는 방은 우심실이다', PA: '우심실에서 나간 혈액이 지나는 혈관은 폐동맥이다',
      PV: '폐의 모세 혈관 다음 혈관은 폐정맥이다', LA: '폐를 거쳐 온 혈액이 들어오는 방은 좌심방이다',
      LV: '온몸으로 혈액을 내보내는 방은 좌심실이다', Ao: '좌심실에서 나간 혈액이 지나는 혈관은 대동맥이다',
    };
    d.final.filter(x => x.kind === 'name' && !x.ok).forEach(x => corrections.push({
      priority: ['PA', 'PV'].includes(x.slot) ? 1 : 2, order: FINAL_NAMES.indexOf(x.slot),
      text: nameLines[x.slot] + '(고른 답: ' + STRUCTURES[x.pick].name + ').',
    }));
    // 까닭 묶음을 맨 앞에 두고, 선택한 이름 교정만 경로 순서로 놓는다.
    corrections.sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, 2)
      .sort((a, b) => (a.priority === 0 ? -1 : b.priority === 0 ? 1 : a.order - b.order)).forEach(x => lines.push(x.text));
    if (n === 3) lines.push('별 3 조건을 모두 채웠다.');
    else {
      const missingNames = Math.max(0, (n === 0 ? 5 : n === 1 ? 7 : 8) - c.names);
      const missingReasons = n === 1 ? 4 - c.reasons : 0;
      const needs = [];
      if (missingNames) needs.push('이름 ' + missingNames + '개');
      if (missingReasons) needs.push('까닭 ' + missingReasons + '개');
      lines.push('다음 별까지: ' + needs.join(', ') + '를 더 맞히기' + (n === 1 && !missingReasons ? '(까닭은 모두 맞힘)' : '') + '.');
    }
    return lines;
  }
  function result(s, playNo = 1) {
    if (s.phase !== 'end') return null;
    return { stars: stars(s.final), score: score(s), lines: resultLines(s), detail: detail(s, playNo) };
  }
  // policy: 'blank'|'random'|'first' 또는 { dice, organ: 'first'|'random', answer(s,p), visit(s,p,events,next) }.
  // organ: 'random'은 주사위 정책 난수와 독립인 시드 난수로 기관 방문 순서를 섞는다.
  // answer는 문항 입력에만 호출된다. 반환값은 선택지 key이며 생략하면 정답이다.
  function simulate(policy = 'blank', seed = 1) {
    const config = typeof policy === 'string' ? { dice: policy } : policy;
    const random = rng((seed ^ 0xA5A5A5A5) >>> 0);
    const organRandom = rng((seed ^ 0x51ED270B) >>> 0);
    let s = newGame(seed);
    for (let guard = 0; s.phase !== 'end'; guard++) {
      if (guard > 1000) throw new Error('상태 전이가 끝나지 않았다.');
      const p = pending(s); let pick;
      if (p.type === 'organ') pick = p.options[config.organ === 'random' ? Math.floor(organRandom() * p.options.length) : 0].key;
      else if (p.type === 'die') {
        if (typeof config.dice === 'function') pick = config.dice(s, p);
        else if (config.dice === 'random') pick = Math.floor(random() * 2);
        else if (config.dice === 'first') pick = 0;
        else pick = p.options.reduce((best, x) => (Number(x.blank) > Number(best.blank) || (x.blank === best.blank && x.to > best.to)) ? x : best).key;
      } else if (p.options.length) pick = config.answer ? config.answer(s, p) : correct(s);
      const out = act(s, { type: p.type, token: p.token, pick });
      if (config.visit) config.visit(s, p, out.events, out.state);
      s = out.state;
    }
    return s;
  }
  const api = { STRUCTURES, ORGANS, SQUARES, BLOOD, GUIDES, VALVES, NAME_OPTIONS, FINAL_NAMES, FINAL_REASONS, FINAL_REASON_OPTIONS, FINAL_BOUNDARIES,
    LAPS, rng, lapPath, move, preview, bloodAt, circuitAt, judgeName, judgeReason, nameExplanation, reasonExplanation,
    newGame, pending, act, correct, stars, score, hud, detail, resultLines, result, simulate };
  root.Circulation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
