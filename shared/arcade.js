/* 생명 오락실 — 공통 틀: 게임 목록, 기록 저장, 시작·결과 화면, 성취기준 표시 */
(function (root) {
  const KEY = 'bioArcade.v1';

  // 오락실 게임 목록 (허브와 각 게임이 함께 쓴다)
  const GAMES = [
    { id: 'quest', title: '생명 탐사대', path: 'games/quest/index.html', color: '#2f7d55',
      homage: '포켓몬스터 레드·그린 (게임보이, 1996)', genre: '수집 RPG',
      pitch: '초록섬 풀숲에서 생물을 관찰해 도감을 채우고, 광합성·소화 체육관에 도전한다.',
      standards: ['9과02-04', '9과12-01', '9과12-02', '9과13-01'], target: 'C~B' },
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
      pitch: '가만히 있어도 줄어드는 에너지! 영양소와 산소를 모으고 노폐물을 내보내며 달린다.',
      standards: ['9과13-05', '9과13-02', '9과13-03', '9과13-04'], target: 'C~A' },
    { id: 'glucose', title: '혈당 지키기', path: 'games/glucose/index.html', color: '#3d85c6',
      homage: '놈(NOM, 피처폰) · 플래피 버드 (2013)', genre: '원버튼',
      pitch: '누르면 인슐린, 떼면 글루카곤. 하루 동안 혈당을 정상 범위 안에 붙잡아 둔다.',
      standards: ['9과20-03'], target: 'D~B' },
  ];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { student: {}, games: {} }; } catch { return { student: {}, games: {} }; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 불가 */ } }

  const Arcade = {
    GAMES,
    game(id) { return GAMES.find(g => g.id === id); },
    data: load,
    student() { return load().student || {}; },
    setStudent(st) { const d = load(); d.student = st; save(d); },
    best(id) {
      if (id === 'quest') { // 생명 탐사대는 자체 저장을 쓴다: 배지 별의 평균
        try { const q = JSON.parse(localStorage.getItem('bioQuest.v1')); const b = q && q.badges ? Object.values(q.badges) : []; return b.length ? Math.round(b.reduce((a, c) => a + c, 0) / b.length) : 0; } catch { return 0; }
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
      const g = Arcade.game(id);
      overlay.hidden = false;
      overlay.innerHTML = `<div class="card">
        <p class="homage">오마주: ${g.homage}</p>
        <h2>${g.title}</h2>
        <p>${g.pitch}</p>
        <ul class="rules">${rules.map(r => `<li>${r}</li>`).join('')}</ul>
        ${Arcade.standardsHTML(g.standards, g.target)}
        <p class="best">최고 기록 ${Arcade.stars(Arcade.best(id))}</p>
        <button class="btn primary big" id="ar-start">시작</button></div>`;
      overlay.querySelector('#ar-start').onclick = () => { overlay.hidden = true; onStart(); };
      overlay.querySelector('#ar-start').focus();
    },

    /* 결과 화면: 별 → 인출 문항(2지) → 설명해 보기 → 다시/오락실
     * quiz: { q, options:[...], answer, explain }  reflection: 문항 문자열 */
    finish(overlay, { id, stars, score, lines, detail, quiz, reflection, onRetry }) {
      Arcade.record(id, { stars, score, detail });
      overlay.hidden = false;
      const opts = quiz ? quiz.options.map((o, i) => ({ o, i })).sort(() => Math.random() - 0.5) : [];
      overlay.innerHTML = `<div class="card">
        <h2>${stars > 0 ? '성공!' : '다시 도전!'}</h2>
        <p class="big-stars">${Arcade.stars(stars)}</p>
        ${lines.map(l => `<p>${l}</p>`).join('')}
        ${quiz ? `<div class="quiz"><p><b>한 번 더 떠올리기</b> — ${quiz.q}</p>
          <div class="quiz-opts">${opts.map(({ o, i }) => `<button class="btn" data-i="${i}">${o}</button>`).join('')}</div>
          <p class="quiz-fb" hidden></p></div>` : ''}
        ${reflection ? `<label class="refl"><b>설명해 보기</b> — ${reflection}<textarea id="ar-refl" placeholder="두세 문장으로 써 보세요."></textarea></label>` : ''}
        <div class="row"><button class="btn" id="ar-retry">다시 하기</button><a class="btn primary" id="ar-hub" href="../../index.html">오락실로</a></div></div>`;
      if (quiz) overlay.querySelectorAll('.quiz-opts .btn').forEach(b => b.onclick = () => {
        const ok = +b.dataset.i === quiz.answer;
        overlay.querySelectorAll('.quiz-opts .btn').forEach(x => { x.disabled = true; if (+x.dataset.i === quiz.answer) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        const fb = overlay.querySelector('.quiz-fb'); fb.hidden = false;
        fb.textContent = (ok ? '정답! ' : '아쉬워요. ') + quiz.explain;
        Arcade.patchLast(id, { quizCorrect: ok });
      });
      const keepRefl = () => { const t = overlay.querySelector('#ar-refl'); if (t && t.value.trim()) Arcade.patchLast(id, { reflection: t.value.trim() }); };
      overlay.querySelector('#ar-retry').onclick = () => { keepRefl(); overlay.hidden = true; onRetry(); };
      overlay.querySelector('#ar-hub').onclick = keepRefl;
    },
  };

  root.Arcade = Arcade;
  if (typeof module !== 'undefined') module.exports = Arcade;
})(typeof window !== 'undefined' ? window : globalThis);
