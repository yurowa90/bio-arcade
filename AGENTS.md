# 생명 오락실(bio-arcade) 작업 규칙

이 저장소에서 일하는 모든 코딩 에이전트(Claude Code, Codex 등)가 매번 알아야 할 사실과 규칙이다. Claude Code 전용 설정은 `CLAUDE.md`에 있다.

## 프로젝트

중2~고1 통합과학1 생명과학을 복습하는 미니게임 모음이다. 빌드 단계와 의존 패키지가 없는 정적 웹앱(HTML·CSS·JS)이고, 휴대폰 세로 화면과 PWA 설치를 기준으로 만든다.
사용자는 고등학교 과학 교사이자 교육출판 편집자다. 과학 내용과 문장의 정확성을 코드만큼 중요하게 본다.

## 먼저 읽을 문서

- `docs/PROGRESS.md`: 현재 상태, 다음 할 일(T), 교사 판단이 필요한 미결 사항(M). 작업 전에 읽는다.
- `docs/DECISIONS.md`: 결정과 근거, 버린 대안(D). 규칙·수치·문구를 바꾸기 전에 관련 결정을 읽는다. 기록하는 법은 그 문서 머리말에 있다.
- `docs/DEVELOPMENT.md`: 모듈 관례, 저장 키, 테스트 환경, 새 게임 추가 절차, 함정.
- `.claude/rules/*.md`(경로별 규칙)와 `.claude/skills/*/SKILL.md`(검증·게임 추가·교차 검토·인수인계·배포 절차): Claude Code 형식이지만 다른 에이전트도 해당 경로를 고치기 전에 읽는다.
- `docs/recovery-manifest.md`, `docs/review-2026-10-01.md`는 당시 기록이라 숫자가 현재와 다르다. 현재 상태의 근거로 쓰지 않는다.

## 구조

```
index.html            허브(게임 칸, 학번·이름, 기록 요약·제출, 기록 지우기)
shared/               미니게임 공통: arcade.js(window.Arcade, GAMES, 기록), arcade.css, standards.js(성취기준 발췌)
games/<id>/           게임마다 index.html + game.js(화면). 규칙 모듈: basepang/engine.js, circulation/circulation.js,
                      glucose/model.js, mendel/genetics.js, pedigree/pedigree.js. run(에너지 런)은 규칙이 game.js 안에 있다
games/quest/          생명 탐사대 — 독립 앱. shared/를 읽지 않고 저장 키도 따로 쓴다
tests/                quest-logic.js·circulation-logic.js·glucose-logic.js·quest-tune-photo.js(Node),
                      arcade-e2e.js·quest-e2e.js·ux-common-e2e.js·ux-arcade-e2e.js·ux-mendel-pedigree-e2e.js(Playwright)
sw.js, manifest.webmanifest, icons/   PWA
```

## 명령

Node는 `.node-version`(24.21.0)을 fnm으로 쓴다. 설치 단계는 없다. E2E 스크린샷 폴더는 반드시 저장소 밖으로 준다.

```bash
export FNM_DIR="$HOME/Library/Application Support/fnm"; eval "$(fnm env)"
for f in $(git ls-files '*.js'); do node --check "$f" || echo "FAIL $f"; done
node tests/quest-logic.js                                   # 탐사대 규칙·전수 탐색 단언
node tests/circulation-logic.js                             # 혈액 순환 일주 규칙·별 전수 분포·시뮬레이션(약 1분)
node tests/glucose-logic.js                                 # 혈당 지키기 별 기준·전략별 분포
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/quest-e2e.js /tmp/bio-arcade-e2e/quest     # 약 15초
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/arcade-e2e.js /tmp/bio-arcade-e2e/arcade   # 약 3분
for s in ux-common ux-arcade ux-mendel-pedigree; do PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/$s-e2e.js /tmp/bio-arcade-e2e/$s; done   # 플레이 테스트 반영 화면 검사, 각 수 초
# 엔진·설정: E2E_BROWSER=webkit, E2E_REDUCED_MOTION=1 (docs/DEVELOPMENT.md 8절)
```

## 지킬 것

- 식별자는 영어, 주석·화면 문구·문서·커밋 메시지는 한국어로 쓴다. 상투구와 과장된 의의 부여를 쓰지 않는다.
- 게임 규칙은 Node에서도 도는 순수 함수 모듈로 두고 화면 코드(`game.js`)와 나눈다. 파일을 더하거나 지우면 `sw.js`의 `FILES`를 다시 만든다.
- `display`를 준 선택자에 `hidden`을 쓰면 같은 선택자에 `[hidden]`을 붙인 규칙(`.btn[hidden]` 등)을 함께 둔다.
- 화면 용어는 한국 중학교·통합과학 교과서를 따른다(순종·잡종, 대립유전자, 보인자, 세포 호흡, 유화, 모세 혈관). 생명과학Ⅰ 용어(동형 접합 등)는 쓰지 않는다.
- 과학을 단순화하면 README의 '게임이 단순화한 것'에 적는다. 적지 않은 단순화는 오류로 본다. 가르치려는 개념과 반대되는 전략에 점수를 주지 않고, 별 기준을 바꾸면 시뮬레이션이나 전수 탐색으로 확인한다.
- 게임 점수는 성취수준이 아니다. 원작의 이름·캐릭터·그림·상징은 쓰지 않고 구조와 조작감만 빌린다(오마주 표기 `homage`는 둔다).
- 학생 기록은 기기의 localStorage에만 두고 앱이 밖으로 보내지 않는다. 실제 학생 이름·학번·성적·학교 정보를 코드·테스트·커밋·로그·문서에 넣지 않는다(테스트는 20315, '테스트' 같은 가상 값). 학생 기록 JSON을 외부 모델(GPT 등)에 보내지 않는다.
- 실행한 명령의 출력으로 보고한다. 돌리지 않은 검증은 '미실행'이라고 적는다.
- 변경 파일을 명시해 스테이징한다(`git add .` 금지). 커밋은 게임 단위로 나누고 제목은 `<게임 이름 | 허브·공통 | 문서>: <바꾼 내용>`으로 쓴다. push는 사용자가 요청할 때만 한다. 기본 브랜치는 `main`.
- 교사 판단이 필요한 선택은 추측으로 정하지 않고 사용자에게 묻거나 PROGRESS의 미결 사항(M)에 올린다. 결정은 내린 자리에서 DECISIONS에, 상태는 작업 단위마다 PROGRESS에 남긴다(Claude Code는 `/handoff`).
