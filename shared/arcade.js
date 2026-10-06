/* 생명 오락실 — 공통 틀: 게임 목록, 기록 저장, 시작·결과 화면, 성취기준 표시 */
(function (root) {
  const KEY = 'bioArcade.v1';
  const QUEST_KEY = 'bioQuest.v1'; // 생명 탐사대 자체 저장

  // 오락실 게임 목록 (허브와 각 게임이 함께 쓴다)
  const GAMES = [
    { id: 'quest', title: '생명 탐사대', path: 'games/quest/index.html', color: '#2f7d55',
      homage: '포켓몬스터 레드·그린 (게임보이, 1996)', genre: '수집 RPG',
      pitch: '초록섬 풀숲에서 생물을 관찰해 도감을 채우고, 광합성·소화 체육관에 도전한다.',
      standards: ['9과02-04', '9과12-01', '9과12-02', '9과13-01'], target: 'C~B',
      // 열려 있는 체육관(games/quest/js/data.js의 GYMS 중 ready: true). 체육관을 열면 여기에도 더한다.
      gyms: [{ id: 'photo', name: '광합성 체육관' }, { id: 'digest', name: '소화 체육관' }] },
    { id: 'mendel', title: '멘델의 텃밭', path: 'games/mendel/index.html', color: '#6aa84f',
      homage: '팜빌·에브리타운 농장 + 포켓몬 금·은 키우미집 교배 (2009~2012)', genre: '교배 수집',
      pitch: '완두를 교배해 모양·색깔 카드를 모은다. 겉모습이 같아도 유전자형이 다를 수 있다!',
      standards: ['9과21-04'], target: 'C~A' },
    { id: 'pedigree', title: '가계도 지뢰찾기', path: 'games/pedigree/index.html', color: '#8e7cc3',
      homage: '지뢰찾기 (윈도우 기본 게임)', genre: '논리 퍼즐',
      pitch: '겉으로 드러난 형질이라는 단서만으로 숨은 보인자를 찾아낸다. 찍으면 터진다!',
      standards: ['9과21-05'], target: 'C~A' },
    { id: 'basepang', title: '염기쌍 팡', path: 'games/basepang/index.html', color: '#e06666',
      homage: '애니팡 (카카오 게임, 2012)', genre: '짝 맞추기 퍼즐',
      pitch: '같은 것 셋이 아니라, 짝이 맞는 염기(A-T, G-C)를 나란히 놓아야 터진다.',
      standards: ['10통과1-02-05', '10통과1-03-06'], target: 'C~B' },
    { id: 'run', title: '에너지 런', path: 'games/run/index.html', color: '#f1a33c',
      homage: '쿠키런 (카카오 게임, 2013)', genre: '러너',
      pitch: '가만히 있어도 줄어드는 세포의 에너지! 영양소와 산소를 실어 세포에 전하며 달린다. 노폐물은 폐와 콩팥을 지날 때 빠져나간다.',
      standards: ['9과13-05', '9과13-02', '9과13-03', '9과13-04'], target: 'C~A' },
    { id: 'circulation', title: '혈액 순환 일주', path: 'games/circulation/index.html', color: '#c0392b',
      homage: '모두의마블 (카카오 게임, 2013)', genre: '주사위 보드게임',
      pitch: '혈액 한 방울이 되어 주사위로 온몸과 폐를 돈다. 이름이 지워진 심장 방과 혈관에 이름표를 붙이고, 불 꺼진 마지막 바퀴는 기억만으로 돈다.',
      standards: ['9과13-02'], target: 'C~A' },
    { id: 'glucose', title: '혈당 지키기', path: 'games/glucose/index.html', color: '#3d85c6',
      homage: '놈(NOM, 피처폰) · 플래피 버드 (2013)', genre: '원버튼',
      pitch: '누르면 인슐린, 떼면 글루카곤. 하루 동안 혈당을 목표 범위 안에 붙잡아 둔다.',
      standards: ['9과20-03'], target: 'D~B' },
  ];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { student: {}, games: {} }; } catch { return { student: {}, games: {} }; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 불가 */ } }

  /* 시작·결과 카드(overlay)가 떠 있는 동안 뒤쪽 게임 화면을 조작하지 못하게 한다.
   * - 뒤쪽 요소에 inert: 탭 이동·포커스·클릭이 닿지 않는다.
   * - keydown을 window 캡처 단계에서 끊는다: 게임이 window·document에 단 키 처리(Space 점프 등)가
   *   카드 뒤에서 돌지 않는다. 기본 동작은 막지 않으므로 카드의 버튼 누르기와 서술 답 입력은 그대로 된다.
   *   keyup은 끊지 않는다(누르고 있던 키가 눌린 채로 남지 않게). */
  const modals = new Set();   // Arcade가 시작·결과 카드에 쓴 overlay
  const inerted = new Map();  // overlay → 이 코드가 inert를 단 요소들
  const reflections = new WeakMap();
  function stopReflection(overlay) { const stop = reflections.get(overlay); if (stop) { reflections.delete(overlay); stop(); } }
  function setBackdrop(overlay, on) {
    const marked = inerted.get(overlay) || [];
    if (!on) { marked.forEach(el => el.removeAttribute('inert')); inerted.delete(overlay); return; }
    if (marked.length) return;
    for (let el = overlay; el.parentElement && el !== document.body; el = el.parentElement) {
      for (const sib of el.parentElement.children) {
        if (sib === el || sib.hasAttribute('inert') || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
        sib.setAttribute('inert', ''); marked.push(sib);
      }
    }
    inerted.set(overlay, marked);
  }
  function showModal(overlay) {
    if (!modals.has(overlay)) {
      modals.add(overlay);
      // 게임이 같은 overlay를 직접 여닫아도(멘델·염기쌍 팡의 중간 카드) 뒤쪽 상태를 맞춘다
      if (typeof MutationObserver !== 'undefined') new MutationObserver(() => setBackdrop(overlay, !overlay.hidden)).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
    }
    overlay.hidden = false; setBackdrop(overlay, true);
  }
  function hideModal(overlay) { stopReflection(overlay); overlay.hidden = true; setBackdrop(overlay, false); }
  if (typeof document !== 'undefined' && typeof root.addEventListener === 'function') {
    root.addEventListener('keydown', e => {
      for (const o of modals) if (!o.hidden && o.isConnected) { e.stopImmediatePropagation(); return; }
    }, true);
  }

  const Arcade = {
    GAMES,
    game(id) { return GAMES.find(g => g.id === id); },
    data: load,
    student() { return load().student || {}; },
    setStudent(st) { const d = load(); d.student = st; save(d); },
    // 이 기기에 게임 기록이 남아 있는가(탐사대 저장 포함)
    hasRecords() {
      if (Object.keys(load().games || {}).length) return true;
      try { return localStorage.getItem(QUEST_KEY) !== null; } catch { return false; }
    },
    // 공용 기기에서 학생이 바뀔 때: 학번·이름과 모든 기록(탐사대 저장 포함)을 이 기기에서 지운다
    clearRecords() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(QUEST_KEY); } catch { /* 저장소를 쓸 수 없음 */ }
    },
    // 생명 탐사대 배지: 열려 있는 체육관마다 별(배지를 못 받았으면 0). 탐사대 저장이 없으면 null
    questBadges() {
      let q = null; try { q = JSON.parse(localStorage.getItem(QUEST_KEY)); } catch { q = null; }
      if (!q) return null;
      const badges = q.badges || {};
      const list = Arcade.game('quest').gyms.map(g => ({ ...g, stars: badges[g.id] || 0 }));
      return { got: list.filter(g => g.stars).length, total: list.length, list };
    },
    best(id) {
      if (id === 'quest') { // 열려 있는 체육관 전체의 평균(배지 없는 체육관은 0), 내림
        const q = Arcade.questBadges();
        return q && q.total ? Math.floor(q.list.reduce((a, g) => a + g.stars, 0) / q.total) : 0;
      }
      const g = load().games[id]; return g ? g.best : 0;
    },
    record(id, play) {
      const d = load();
      const g = d.games[id] || (d.games[id] = { best: 0, bestScore: 0, plays: [] });
      g.plays.push({ at: new Date().toISOString(), ...play });
      g.best = Math.max(g.best, play.stars || 0);
      g.bestScore = Math.max(g.bestScore, play.score || 0);
      save(d);
      return g;
    },
    // 방금 저장한 판에 퀴즈 결과·성찰을 덧붙인다
    patchLast(id, patch) { const d = load(); const g = d.games[id]; if (!g || !g.plays.length) return; Object.assign(g.plays[g.plays.length - 1], patch); save(d); },

    standards(codes) { const all = root.ARCADE_STANDARDS || []; return codes.map(c => all.find(s => s.code === c)).filter(Boolean); },
    standardsHTML(codes, target) {
      const list = Arcade.standards(codes);
      return `<details class="std"><summary>성취기준 ${list.map(s => `<span class="code">[${s.code}]</span>`).join(' ')}${target ? ` <span class="lv">겨냥 수준 ${target}</span>` : ''}</summary>
        ${list.map(s => `<div class="std-item"><b>[${s.code}]</b> ${s.text}
          <ol class="levels">${s.levels.map(l => `<li><b>${l.level}</b> ${l.text}</li>`).join('')}</ol></div>`).join('')}
        <p class="note">게임 점수는 성취수준이 아닙니다. 수준 판단은 끝의 “설명해 보기” 답과 수업 속 산출물로 하세요.</p></details>`;
    },

    stars(n) { let h = ''; for (let i = 0; i < 3; i++) h += i < n ? '★' : '<span class="off">★</span>'; return `<span class="stars" aria-label="별 ${n}개">${h}</span>`; },

    // 시작 안내 카드
    intro(overlay, { id, rules, onStart }) {
      stopReflection(overlay);
      const g = Arcade.game(id);
      showModal(overlay);
      overlay.innerHTML = `<div class="card" role="dialog" aria-modal="true">
        <p class="homage">오마주: ${g.homage}</p>
        <h2>${g.title}</h2>
        <p>${g.pitch}</p>
        <ul class="rules">${rules.map(r => `<li>${r}</li>`).join('')}</ul>
        ${Arcade.standardsHTML(g.standards, g.target)}
        <p class="best">최고 기록 ${Arcade.stars(Arcade.best(id))}</p>
        <button class="btn primary big" id="ar-start">시작</button>
        <a class="btn big" id="ar-intro-hub" href="../../index.html">← 오락실</a></div>`;
      overlay.querySelector('#ar-start').onclick = () => { hideModal(overlay); onStart(); };
      overlay.scrollTop = 0;
      overlay.querySelector('#ar-start').focus({ preventScroll: true });
    },

    /* 결과 화면: 별 → 인출 문항(2지) → 설명해 보기 → 다시/오락실
     * quiz: { q, options:[...], answer, explain }  reflection: 문항 문자열 */
    finish(overlay, { id, stars, score, lines, detail, quiz, reflection, onRetry }) {
      stopReflection(overlay);
      const recorded = Arcade.record(id, { stars, score, detail });
      const playIndex = recorded.plays.length - 1, playAt = recorded.plays[playIndex].at;
      let active = true;
      const patchPlay = patch => {
        if (!active) return;
        const d = load(), play = d.games[id]?.plays[playIndex];
        // 마지막 판을 찾지 않는다. 지웠거나 다른 판으로 바뀌었으면 쓰지 않는다.
        if (!play || play.at !== playAt) { active = false; return; }
        if (Object.entries(patch).every(([k, v]) => play[k] === v)) return;
        Object.assign(play, patch); save(d);
      };
      showModal(overlay);
      const opts = quiz ? quiz.options.map((o, i) => ({ o, i })).sort(() => Math.random() - 0.5) : [];
      overlay.innerHTML = `<div class="card" role="dialog" aria-modal="true">
        <h2>${stars > 0 ? '성공!' : '다시 도전!'}</h2>
        <p class="big-stars">${Arcade.stars(stars)}</p>
        ${lines.map(l => `<p>${l}</p>`).join('')}
        ${quiz ? `<div class="quiz"><p><b>한 번 더 떠올리기</b> — ${quiz.q}</p>
          <div class="quiz-opts">${opts.map(({ o, i }) => `<button class="btn" data-i="${i}">${o}</button>`).join('')}</div>
          <p class="quiz-fb" hidden></p></div>` : ''}
        ${reflection ? `<label class="refl"><b>설명해 보기</b> — ${reflection}<textarea id="ar-refl" placeholder="두세 문장으로 써 보세요."></textarea></label>` : ''}
        <div class="row card-actions"><button class="btn" id="ar-retry">다시 하기</button><a class="btn primary" id="ar-hub" href="../../index.html">오락실로</a></div></div>`;
      if (quiz) overlay.querySelectorAll('.quiz-opts .btn').forEach(b => b.onclick = () => {
        const ok = +b.dataset.i === quiz.answer;
        overlay.querySelectorAll('.quiz-opts .btn').forEach(x => { x.disabled = true; if (+x.dataset.i === quiz.answer) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        const fb = overlay.querySelector('.quiz-fb'); fb.hidden = false;
        fb.textContent = (ok ? '정답! ' : '아쉬워요. ') + quiz.explain;
        patchPlay({ quizCorrect: ok });
      });
      // 흐름 문항이 label을 잠시 떼었다 붙여도 같은 textarea와 리스너를 쓴다.
      const textarea = overlay.querySelector('#ar-refl'), card = overlay.querySelector('.card');
      let timer;
      const keepRefl = () => { clearTimeout(timer); const answer = textarea?.value.trim(); if (answer !== undefined) patchPlay({ reflection: answer }); };
      const input = () => { clearTimeout(timer); timer = setTimeout(keepRefl, 300); };
      const hidden = () => { if (document.visibilityState === 'hidden') keepRefl(); };
      const deleted = e => { if ((e.key === KEY || e.key === null) && e.newValue === null) active = false; };
      textarea?.addEventListener('input', input);
      textarea?.addEventListener('compositionend', input);
      root.addEventListener('pagehide', keepRefl);
      root.addEventListener('storage', deleted);
      document.addEventListener('visibilitychange', hidden);
      const observer = new MutationObserver(() => { if (overlay.hidden || !overlay.contains(card) || !overlay.isConnected) stopReflection(overlay); });
      observer.observe(overlay, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
      reflections.set(overlay, () => {
        keepRefl(); active = false; clearTimeout(timer); observer.disconnect();
        textarea?.removeEventListener('input', input);
        textarea?.removeEventListener('compositionend', input);
        root.removeEventListener('pagehide', keepRefl);
        root.removeEventListener('storage', deleted);
        document.removeEventListener('visibilitychange', hidden);
      });
      overlay.querySelector('#ar-retry').onclick = () => { keepRefl(); hideModal(overlay); onRetry(); };
      // 뒤로 가기로 결과 카드가 복원되어도 같은 판의 입력 저장을 계속한다.
      overlay.querySelector('#ar-hub').onclick = keepRefl;
      // 포커스를 카드로 옮긴다. 버튼이 아니므로 게임 중 누르던 Space·Enter가 '다시 하기'를 누르지 않는다.
      card.tabIndex = -1; card.focus({ preventScroll: true });
      return patchPlay;
    },
  };

  root.Arcade = Arcade;
  if (typeof module !== 'undefined') module.exports = Arcade;
})(typeof window !== 'undefined' ? window : globalThis);
