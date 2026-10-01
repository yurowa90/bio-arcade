/* 체육관 대결 규칙 — DOM과 무관한 순수 함수 (브라우저·Node 공용)
 * 원작의 턴제 대결 구조를 빌리되, 규칙 자체가 단원 개념이 되도록 설계했다.
 */
(function (root) {
  /* ============ 1 체육관: 광합성 ============
   * 매 턴 광합성량 P = min(빛, 이산화 탄소, 물)  ← 제한 요인(가장 모자란 요인이 속도를 정함)
   * 녹말 변화 = P − 1(호흡은 밤낮없이 늘 일어난다)
   * 기공을 열면 CO2가 들어오지만 물이 빠져나간다(증산 작용).
   */
  const PHOTO = {
    maxTurns: 10,
    goal: 6,          // 이기려면 10턴 뒤 녹말 6 이상
    stars: [6, 7, 8], // 별 1·2·3 기준 (8은 밤에 기공을 닫아 물을 아껴야 도달)
    // 관장 초록의 날씨 기술: 해당 턴 시작 시 발동
    script: {
      2: { id: 'cloud', turns: 2, name: '먹구름', text: '관장 초록이 먹구름을 불렀다! 2턴 동안 빛이 약해진다.' },
      5: { id: 'drought', turns: 3, name: '가뭄', text: '관장 초록이 가뭄을 일으켰다! 3턴 동안 뿌리가 물을 조금밖에 흡수하지 못한다.' },
      7: { id: 'night', turns: 1, name: '밤', text: '관장 초록이 해를 가렸다! 이번 턴은 밤이다. 빛이 없으면 광합성은 멈추고 호흡만 일어난다.' },
      9: { id: 'wind', turns: 1, name: '마른바람', text: '관장 초록이 마른바람을 불렀다! 기공이 열려 있으면 물이 두 배로 빠져나간다.' },
    },
    actions: [
      { id: 'stomata', label: '기공 열기/닫기' },
      { id: 'water', label: '뿌리로 물 흡수' },
      { id: 'leaf', label: '잎을 빛 쪽으로' },
      { id: 'wait', label: '기다리기' },
    ],
  };

  function photoInit() {
    return { turn: 1, starch: 0, water: 2, stomata: false, leafBoost: 0, fx: {}, done: false, win: false, history: [] };
  }

  // 한 턴 진행: 관장 기술 → 플레이어 행동 → 광합성·호흡·증산 계산
  function photoStep(prev, action) {
    const s = JSON.parse(JSON.stringify(prev));
    if (s.done) return s;
    const log = [];
    const ev = PHOTO.script[s.turn];
    if (ev) { s.fx[ev.id] = ev.turns; log.push({ t: 'enemy', text: ev.text }); }
    const drought = s.fx.drought > 0, cloud = s.fx.cloud > 0, night = s.fx.night > 0, wind = s.fx.wind > 0;

    if (action === 'stomata') { s.stomata = !s.stomata; log.push({ t: 'me', text: s.stomata ? '기공을 열었다. 이산화 탄소가 잎 속으로 들어온다.' : '기공을 닫았다. 물이 덜 빠져나가지만 이산화 탄소도 들어오지 못한다.' }); }
    if (action === 'water') { const g = drought ? 1 : 2; s.water = Math.min(5, s.water + g); log.push({ t: 'me', text: `뿌리로 물을 흡수했다(+${g}).${drought ? ' 가뭄이라 조금밖에 흡수하지 못했다.' : ''}` }); }
    if (action === 'leaf') { s.leafBoost = 2; log.push({ t: 'me', text: '잎을 빛 쪽으로 펼쳤다. 2턴 동안 받는 빛이 늘어난다.' }); }
    if (action === 'wait') log.push({ t: 'me', text: '가만히 기다렸다.' });

    const light = night ? 0 : (cloud ? 1 : 2) + (s.leafBoost > 0 ? 1 : 0);
    const co2 = s.stomata ? 3 : 0;
    const water = Math.min(3, s.water);
    const P = Math.min(light, co2, water);
    const factors = { light, co2, water };
    const minV = Math.min(light, co2, water);
    const limiting = Object.keys(factors).filter(k => factors[k] === minV);
    const net = P - 1;
    s.starch = Math.max(0, s.starch + net);

    // 증산: 기공이 열려 있으면 물이 빠져나간다
    if (s.stomata) {
      const loss = wind ? 2 : 1;
      s.water = Math.max(0, s.water - loss);
      if (s.water === 0) { s.stomata = false; log.push({ t: 'warn', text: '물이 바닥나 잎이 시들었다! 기공이 저절로 닫혔다.' }); }
    }
    const NAME = { light: '빛', co2: '이산화 탄소', water: '물' };
    log.push({ t: P > 0 ? 'ok' : 'bad', text: `광합성량 = min(빛 ${light}, 이산화 탄소 ${co2}, 물 ${water}) = ${P}. 제한 요인: ${limiting.map(k => NAME[k]).join('·')}. 호흡 −1 → 녹말 ${net >= 0 ? '+' : ''}${net}` });

    s.history.push({ turn: s.turn, action, light, co2, water, P, net, starch: s.starch, limiting });
    // 효과 지속 시간 감소
    for (const k of Object.keys(s.fx)) { s.fx[k]--; if (s.fx[k] <= 0) delete s.fx[k]; }
    if (s.leafBoost > 0) s.leafBoost--;
    s.lastLog = log; s.last = { light, co2, water, P, net, limiting };
    s.turn++;
    if (s.turn > PHOTO.maxTurns) {
      s.done = true; s.win = s.starch >= PHOTO.goal;
      s.stars = PHOTO.stars.filter(v => s.starch >= v).length;
    }
    return s;
  }

  /* ============ 2 체육관: 소화 ============
   * 음식이 입 → 위 → 소장을 차례로 지난다. 장소마다 쓸 수 있는 소화액이 다르다.
   * 원작의 “속성 상성”을 효소-기질 특이성으로 바꾸었다: 맞지 않으면 “효과 없음”.
   */
  const DIGEST = {
    places: [
      { id: 'mouth', name: '입', turns: 2 },
      { id: 'stomach', name: '위', turns: 2 },
      { id: 'intestine', name: '소장', turns: 4 },
    ],
    // 음식별 분해 단계. 마지막 단계가 흡수 가능한 영양소
    chains: {
      starch: ['녹말', '엿당', '포도당'],
      protein: ['단백질', '폴리펩타이드', '아미노산'],
      fat: ['지방', '작은 지방 방울', '지방산 + 모노글리세리드'],
    },
    moves: {
      chew:     { name: '씹기', place: ['mouth'], desc: '음식을 잘게 부순다(물리적 소화). 화학적으로 분해하지는 않는다.' },
      mix:      { name: '꿈틀 운동', place: ['stomach', 'intestine'], desc: '근육이 오므라들었다 펴지며 음식과 소화액을 섞고 앞으로 보낸다(물리적 소화).' },
      saliva:   { name: '침(아밀레이스)', place: ['mouth', 'stomach', 'intestine'], desc: '녹말 → 엿당' },
      gastric:  { name: '위액(펩신·염산)', place: ['stomach'], desc: '단백질 → 폴리펩타이드' },
      bile:     { name: '쓸개즙', place: ['intestine'], desc: '지방을 작은 방울로 만든다(유화). 소화 효소는 없다.' },
      pancreas: { name: '이자액(아밀레이스·트립신·라이페이스)', place: ['intestine'], desc: '녹말 → 엿당, 단백질 → 폴리펩타이드, 지방 → 지방산 + 모노글리세리드' },
      intestinal: { name: '소장의 소화 효소', place: ['intestine'], desc: '엿당 → 포도당, 폴리펩타이드 → 아미노산' },
    },
    // 흡수 경로(융털): 수용성 → 모세 혈관, 지용성 → 암죽관
    absorb: { starch: 'capillary', protein: 'capillary', fat: 'lacteal' },
  };

  function digestInit() {
    return { placeIdx: 0, turnInPlace: 0, food: { starch: 0, protein: 0, fat: 0 }, fatHP: 2, done: false, phase: 'digest', history: [], wrong: 0 };
  }
  const final = st => st.food.starch === 2 && st.food.protein === 2 && st.food.fat === 2;

  function digestStep(prev, moveId) {
    const s = JSON.parse(JSON.stringify(prev));
    if (s.phase !== 'digest') return s;
    const place = DIGEST.places[s.placeIdx];
    const mv = DIGEST.moves[moveId];
    const log = [];
    const C = DIGEST.chains;
    let effect = false;
    if (!mv) throw new Error('unknown move ' + moveId);
    log.push({ t: 'me', text: `${place.name}에서 ${mv.name}!` });
    if (moveId === 'chew') {
      log.push({ t: 'info', text: '음식이 잘게 부서졌다. 표면적이 넓어져 소화액이 잘 닿는다. 하지만 영양소의 종류는 그대로다(물리적 소화).' });
      effect = true;
    } else if (moveId === 'mix') {
      log.push({ t: 'info', text: '꿈틀 운동으로 음식과 소화액이 잘 섞였다. 영양소의 종류는 그대로다(물리적 소화).' });
      effect = true;
    } else if (moveId === 'saliva') {
      if (place.id === 'stomach') log.push({ t: 'bad', text: '효과 없음! 위의 강한 산성에서는 침 속 아밀레이스가 작용하지 못한다.' });
      else if (s.food.starch === 0) { s.food.starch = 1; effect = true; log.push({ t: 'ok', text: `분해 성공! ${C.starch[0]} → ${C.starch[1]}` }); }
      else log.push({ t: 'bad', text: '효과 없음! 아밀레이스는 녹말만 분해한다. 이미 녹말이 남아 있지 않다.' });
    } else if (moveId === 'gastric') {
      if (s.food.protein === 0) { s.food.protein = 1; effect = true; log.push({ t: 'ok', text: `분해 성공! ${C.protein[0]} → ${C.protein[1]} (펩신은 산성에서 잘 작용한다)` }); }
      else log.push({ t: 'bad', text: '효과 없음! 펩신은 단백질을 분해한다. 녹말과 지방에는 작용하지 않는다.' });
    } else if (moveId === 'bile') {
      if (s.food.fat === 0) { s.food.fat = 1; s.fatHP = 1; effect = true; log.push({ t: 'ok', text: '지방이 작은 방울로 나뉘었다(유화). 쓸개즙에는 소화 효소가 없지만, 라이페이스가 작용할 표면적을 넓혀 준다.' }); }
      else log.push({ t: 'bad', text: '효과 없음! 유화할 지방이 없다.' });
    } else if (moveId === 'pancreas') {
      const done = [];
      if (s.food.starch === 0) { s.food.starch = 1; done.push(`${C.starch[0]} → ${C.starch[1]}`); }
      if (s.food.protein === 0) { s.food.protein = 1; done.push(`${C.protein[0]} → ${C.protein[1]}`); }
      if (s.food.fat < 2) {
        s.fatHP -= 1;
        if (s.fatHP <= 0) { s.food.fat = 2; done.push(`${C.fat[0]} → ${C.fat[2]}`); }
        else done.push('라이페이스가 지방 덩어리의 겉만 조금 분해했다. 쓸개즙으로 먼저 유화하면 한 번에 분해된다');
      }
      if (done.length) { effect = true; log.push({ t: 'ok', text: '이자액 작용! ' + done.join(' / ') }); }
      else log.push({ t: 'bad', text: '효과 없음! 이자액이 분해할 녹말·단백질·지방이 남아 있지 않다.' });
    } else if (moveId === 'intestinal') {
      const done = [];
      if (s.food.starch === 1) { s.food.starch = 2; done.push(`${C.starch[1]} → ${C.starch[2]}`); }
      if (s.food.protein === 1) { s.food.protein = 2; done.push(`${C.protein[1]} → ${C.protein[2]}`); }
      if (done.length) { effect = true; log.push({ t: 'ok', text: '소장 효소 작용! ' + done.join(' / ') }); }
      else log.push({ t: 'bad', text: '효과 없음! 소장의 소화 효소는 엿당과 폴리펩타이드를 마지막 단계로 분해한다. 먼저 앞 단계 분해가 필요하다.' });
    }
    if (!effect) s.wrong++;
    s.history.push({ place: place.id, move: moveId, effect });
    s.turnInPlace++;
    if (final(s)) { s.phase = 'absorb'; log.push({ t: 'ok', text: '모든 영양소가 흡수할 수 있는 크기로 분해되었다! 이제 융털에서 흡수할 차례다.' }); }
    else if (s.turnInPlace >= place.turns) {
      s.placeIdx++; s.turnInPlace = 0;
      if (s.placeIdx >= DIGEST.places.length) { s.phase = 'fail'; s.done = true; log.push({ t: 'bad', text: '분해되지 못한 영양소가 흡수되지 못하고 대장으로 넘어갔다.' }); }
      else log.push({ t: 'info', text: `음식이 ${DIGEST.places[s.placeIdx].name}(으)로 이동했다.` });
    }
    s.lastLog = log;
    return s;
  }

  // 별: 헛수(효과 없음) 0개 + 흡수 모두 정답 = 3, 헛수 2개 이하 = 2, 그 밖 성공 = 1
  function digestStars(st, absorbRes) {
    if (st.phase === 'fail') return 0;
    const allOk = absorbRes && Object.values(absorbRes).every(Boolean);
    if (st.wrong === 0 && allOk) return 3;
    if (st.wrong <= 2 && allOk) return 2;
    return 1;
  }

  function absorbCheck(choice) {
    // choice: {starch:'capillary'|'lacteal', protein:..., fat:...}
    const res = {};
    for (const k of Object.keys(DIGEST.absorb)) res[k] = choice[k] === DIGEST.absorb[k];
    return res;
  }

  const api = { PHOTO, photoInit, photoStep, DIGEST, digestInit, digestStep, digestStars, absorbCheck };
  root.Battles = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
