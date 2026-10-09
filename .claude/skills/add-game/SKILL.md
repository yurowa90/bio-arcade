---
name: add-game
description: 생명 오락실에 새 미니게임을 추가하거나 생명 탐사대에 체육관을 열 때 쓴다. 로드맵 게임(반응 속도 배구 등) 착수나 "게임 하나 더 만들자"는 요청에 해당한다. 파일 구성, GAMES 등록, 성취기준, 서비스 워커, README, E2E, 결정 기록까지 빠짐없이 챙기는 체크리스트다.
---

# 새 게임 추가 체크리스트

시작하기 전에 `docs/DEVELOPMENT.md`의 2·3·9절과 `docs/DECISIONS.md`의 D-026(점수≠성취수준, 원작 자산 미사용), D-027(테스트 원칙)을 읽는다.

## 설계 단계 (코드 전에 사용자와 맞출 것)

- 겨냥 성취기준 코드와 수준(C~A 등), 게임 규칙이 어떤 개념을 그대로 체험하게 하는지 한 문장으로 정한다.
- 규칙이 가르치려는 개념과 반대 전략에 점수를 주지 않는지, 별 기준을 어떻게 검증할지(시뮬레이션·전수 탐색) 정한다.
- 과학적 단순화를 목록으로 적는다. 교사 판단이 필요한 선택은 사용자에게 묻는다.
- 핵심 플레이 60초를 장면·행동·반응으로 적는다(학생이 무엇을 보고, 누르고, 무엇이 돌아오는지). 개념을 설명하지 않고 겪게 하는 장면인지 본다(D-060).
- 설계 문서 머리에 '확정 규칙 1쪽'(핵심 경험, 학습 목표, 유지할 것, 이번 범위, 미정)을 두고 확정 사항과 AI 제안을 나눠 적는다.
- 화면을 구현하기 전에 핵심 60초 장면의 움직이는 시안 2~3개(HTML 아티팩트 등)를 나란히 보여 교사가 고르게 한다. 멋져도 핵심 경험과 이어지지 않는 요소는 보류한다.

## 구현 단계

1. `games/<id>/index.html` — 기존 게임을 본뜬다. `../../` 경로, `#overlay`, `#toast`, 스크립트 순서(`standards.js` → `arcade.js` → 규칙 모듈 → `game.js`).
2. `games/<id>/<규칙>.js` — 순수 함수 모듈(브라우저 전역 + `module.exports`). Node로 규칙을 검증할 수 있어야 한다.
3. `games/<id>/game.js` — `A.intro`로 시작, `A.finish`로 끝. `detail`에 오개념 신호, 2지 인출 문항, '설명해 보기' 문항. 키 입력은 게임 중이고 입력칸이 아닐 때만 가로챈다. 입력칸 16px. `display`를 준 선택자에 `hidden`을 쓰면 같은 선택자에 `[hidden]`을 붙인 규칙을 둔다.
4. `shared/arcade.js`의 `GAMES`에 항목 추가(`id, title, path, color, homage, genre, pitch, standards, target`).
5. `shared/standards.js`에 새 코드 추가(원본 `yurowa90/teacher-essaytest`의 `standards-data.js`, 띄어쓰기 보정).
6. `sw.js`의 `FILES` 재생성(`git add` 뒤).
7. README: '게임과 성취기준' 표, '게임이 단순화한 것', 로드맵에서 해당 행 삭제.
8. `tests/arcade-e2e.js`: 에너지 런 블록 뒤에 플레이와 `finishCheck('<id>')`. 무작위 판이면 `window.__game` 같은 테스트 훅을 둔다.
9. `.claude/rules/minigames.md`의 `paths`에 `"games/<id>/**"`를 넣고, 결정 번호 줄에 새 게임의 D번호를 더한다.

10. `tests/video/scenes/<id>.js`: 학생처럼 끝까지 해 보는 플레이 영상 장면(D-060). 형식은 기존 장면을 본뜬다.

화면을 만드는 동안 실시간 미리보기(`preview_start`의 arcade, http://localhost:8765)를 띄워 교사가 해 보며 피드백하게 한다. 휴대폰은 같은 와이파이에서 맥의 주소:8765로 연다. 피드백은 장면·행동·반응 단위로 받아 고치고 새로 고침으로 확인한다. Opus 독립 검토는 작업 단위로 묶어 한다.

생명 탐사대 체육관은 `docs/DEVELOPMENT.md` 9절 끝의 경로를 따른다.

## 마무리

- `/arcade-verify`로 전체 검증을 돌린다.
- `tests/video/play.js`로 플레이 영상을 만들어 교사에게 보낸다(출력 폴더는 저장소 밖).
- 과학 내용은 `/cross-review`로 Claude와 GPT의 교차 검토를 받는다.
- 설계 결정은 `docs/DECISIONS.md`에, 상태는 `docs/PROGRESS.md`에 남긴다(`/handoff`).
- 커밋은 `<게임 이름>: <내용>` 형식으로, 게임 단위로 나눈다.
