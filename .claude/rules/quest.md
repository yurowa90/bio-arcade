---
paths:
  - "games/quest/**"
  - "tests/quest-*.js"
---

# 생명 탐사대 작업 규칙

- 탐사대는 독립 앱이다. `shared/arcade.js`·`shared/arcade.css`를 읽지 않으므로 공통 CSS 규칙(`.btn[hidden]`, 16px 입력칸 등)이 자동으로 적용되지 않는다. 같은 처리를 `games/quest/css/style.css`에 직접 둔다.
- `display`를 준 선택자(`#title { display: grid }`, `#title .btn { display: block }` 등)는 일반 `[hidden] { display: none }`으로 이길 수 없다(ID 선택자의 우선순위가 더 높다). `#title[hidden], #title .btn[hidden] { display: none; }`처럼 같은 선택자에 `[hidden]`을 붙인 규칙을 둔다. 이 함정으로 타이틀이 지도를 가리는 버그가 있었다(2026-10-03 수정). `tests/quest-e2e.js`의 `shown()`은 계산된 display로 가시성을 단언하니, 새로 숨기는 요소도 같은 방식으로 검사한다.
- 규칙(`js/battles.js`)과 데이터(`js/data.js`)는 순수 모듈이다. 바꾸면 `node tests/quest-logic.js`가 FAIL 0이어야 한다. 광합성 수치를 바꾸면 `node tests/quest-tune-photo.js`로 별 분포를 확인한다.
- 바꾸기 전에 관련 결정을 읽는다: 광합성 D-005·D-006, 소화 D-007·D-008, 관찰 질문 D-009, 분류 성취기준 대응 D-010(`docs/DECISIONS.md`).
- 관찰 질문 배정(`data.js`의 `ask`)을 바꾸면 질문 종류별 정답 분포 단언이 다시 맞는지 확인한다.
- 체육관을 열 때는 `docs/DEVELOPMENT.md` 9절 끝의 목록을 따른다. `data.js` `GYMS`의 `ready`와 `shared/arcade.js` `GAMES`의 quest 항목 `gyms`는 손으로 맞춘다.
- 저장 키는 `bioQuest.v1`이다. 구조를 바꾸면 기존 학생 저장과의 호환을 생각한다.
