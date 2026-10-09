---
paths:
  - "games/basepang/**"
  - "games/circulation/**"
  - "games/glucose/**"
  - "games/mendel/**"
  - "games/organization/**"
  - "games/pedigree/**"
  - "games/run/**"
  - "shared/**"
  - "index.html"
---

# 미니게임·허브·공통 코드 작업 규칙

- 시작과 끝은 `A.intro`·`A.finish`로 한다. 결과 카드에 요소를 덧붙일 때는 공통 클릭 처리(`.quiz-opts .btn`)와 겹치지 않는 클래스를 쓴다(`docs/DEVELOPMENT.md` 5절).
- 키 입력은 게임 중이고 입력칸(`input, textarea, select, [contenteditable]`)이 아닐 때만 가로챈다. 그래야 '설명해 보기'에 띄어쓰기가 들어간다.
- 토스트 표시 시간은 모든 미니게임이 같은 규칙으로 글자당 약 70ms, 최소 2.2초, 최대 6초로 맞춘다(가계도도 D-053부터 같다).
- 규칙 모듈은 Node에서 검증할 수 있게 순수 함수로 둔다. 별 기준을 바꾸면 시뮬레이션으로 확인하고 확인 수치를 `docs/DECISIONS.md`의 근거에 남긴다. 에너지 런은 규칙이 `game.js` 안에 있다.
- 바꾸기 전에 해당 게임의 결정을 읽는다: 멘델 D-011~D-013·D-061, 가계도 D-013·D-014·D-061·D-064, 염기쌍 팡 D-015·D-016, 에너지 런 D-017~D-020, 혈당 D-021·D-022·D-054·D-064, 혈액 순환 일주 D-041~D-044·D-047·D-049·D-050·D-061, 구성 단계 잇기 D-051·D-052·D-055~D-059, 허브 D-023, 공통 D-024·D-025·D-053, 그래픽·게임성 D-062~D-064.
- `shared/arcade.js`의 `GAMES`나 `shared/standards.js`를 바꾸면 성취기준 대조 명령(`docs/DEVELOPMENT.md` 3절)을 돌린다.
- 허브(`index.html`)의 학번·이름 확인 창 로직을 고치면 `tests/arcade-e2e.js` 끝의 확인 창 4회 검사를 반드시 돌린다.
- 파일을 더하거나 지우면 `sw.js`의 `FILES`를 다시 만든다(`docs/DEVELOPMENT.md` 7절).
