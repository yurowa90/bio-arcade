# 생명 오락실(bio-arcade) 작업 규칙

이 파일은 이 저장소에서 일하는 모든 코딩 에이전트(Claude Code, Codex 등)가 따르는 공통 규칙이다.
Claude Code 전용 설정은 `CLAUDE.md`에 있다.

## 프로젝트 한 줄 요약

중2~고1 통합과학1 생명과학을 복습하는 미니게임 모음이다. 빌드 단계와 의존 패키지가 없는 정적 웹앱(HTML·CSS·JS)이고, 휴대폰 세로 화면과 PWA 설치를 기준으로 만든다.
사용자는 고등학교 과학 교사이자 교육출판 편집자다. 과학 내용과 문장의 정확성을 코드만큼 중요하게 본다.

## 먼저 읽을 문서

- `docs/PROGRESS.md`: 현재 상태, 다음 할 일(T번호), 교사 판단이 필요한 미결 사항(M번호). 작업을 시작하기 전에 읽는다.
- `docs/DECISIONS.md`: 결정과 그 근거, 검토한 대안(D번호). 규칙·수치·문구를 바꾸기 전에 관련 결정을 찾아 읽는다.
- `docs/DEVELOPMENT.md`: 구조, 모듈 관례, 저장 키, 테스트 환경, 새 게임 추가 절차, 함정.
- `.claude/rules/*.md`(폴더별 규칙), `.claude/skills/*/SKILL.md`(검증·게임 추가·교차 검토·인수인계 절차): Claude Code 형식이지만 다른 에이전트도 해당 폴더를 고치기 전에 읽는다.
- `docs/recovery-manifest.md`, `docs/review-2026-10-01.md`: 당시 기록이다. 숫자가 현재와 다르니 현재 상태의 근거로 쓰지 않는다.

## 구조

```
index.html            허브(게임 칸, 학번·이름, 기록 요약·제출, 기록 지우기)
shared/               미니게임 공통: arcade.js(window.Arcade, GAMES, 기록), arcade.css, standards.js(성취기준 발췌)
games/<id>/           게임마다 index.html + game.js(화면). 규칙 모듈: basepang/engine.js, glucose/model.js,
                      mendel/genetics.js, pedigree/pedigree.js. run(에너지 런)은 규칙이 game.js 안에 있다
games/quest/          생명 탐사대 — 독립 앱. shared/를 읽지 않고 저장 키도 따로 쓴다
tests/                quest-logic.js·quest-tune-photo.js(Node), arcade-e2e.js·quest-e2e.js(Playwright)
sw.js, manifest.webmanifest, icons/   PWA
```

## 명령

Node는 `.node-version`(24.21.0)을 fnm으로 쓴다. 의존 패키지가 없으므로 설치 단계는 없다.

```bash
export FNM_DIR="$HOME/Library/Application Support/fnm"; eval "$(fnm env)"
node tests/quest-logic.js                                   # 탐사대 규칙·전수 탐색 단언
for f in $(git ls-files '*.js'); do node --check "$f" || echo "FAIL $f"; done
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/arcade-e2e.js /tmp/bio-arcade-e2e/arcade   # 약 2분
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/quest-e2e.js /tmp/bio-arcade-e2e/quest     # 약 15초
```

E2E의 스크린샷 폴더는 반드시 저장소 밖으로 준다. Playwright 설치는 `docs/DEVELOPMENT.md`의 '테스트 환경'에 있다.

## 코드 관례

- 식별자는 영어, 주석·화면 문구·문서·커밋 메시지는 한국어로 쓴다.
- 게임 규칙은 브라우저와 Node 양쪽에서 쓰는 순수 함수 모듈로 두고 화면 코드(`game.js`)와 나눈다. 에너지 런은 아직 규칙이 `game.js` 안에 있으니, 규칙을 바꾸면 완벽 플레이 시뮬레이션을 따로 돌린다.
- 새 게임은 `shared/arcade.js`의 `GAMES`에 등록하면 허브 칸이 자동으로 생긴다. 절차는 `docs/DEVELOPMENT.md`의 '새 게임 추가'를 따른다.
- 파일을 더하거나 지우면 `sw.js`의 `FILES` 목록을 다시 만든다.
- `display`를 준 선택자에 `hidden`을 쓰면, 같은 선택자에 `[hidden]`을 붙인 규칙(예: `.btn[hidden]`, `#title[hidden]`)을 함께 둔다. 일반 `[hidden]` 규칙은 ID·클래스 선택자보다 우선순위가 낮아 이기지 못한다.

## 과학 내용과 화면 문구

- 한국 중학교·통합과학 교과서 용어를 쓴다. 예: 순종·잡종, 대립유전자, 보인자, 세포 호흡, 유화, 모세 혈관. 고등학교 생명과학Ⅰ 용어(동형 접합 등)는 화면에 쓰지 않는다.
- 게임을 위해 과학을 단순화하면 README의 '게임이 단순화한 것'에 적는다. 적지 않은 단순화는 오류로 본다.
- 게임 규칙이 가르치려는 개념과 반대되는 전략에 점수를 주지 않는다. 별 기준을 바꾸면 가능한 수순을 시뮬레이션이나 전수 탐색으로 확인한다. 탐사대는 `tests/quest-logic.js`에 단언으로 고정하고, 미니게임은 확인 수치를 `docs/DECISIONS.md`의 근거에 남긴다.
- 게임 점수는 성취수준이 아니다. 수준 판단은 '설명해 보기' 서술 답과 수업 산출물로 한다.
- 원작의 캐릭터·그림·상징과 원작 이름을 우리 게임의 제목·화면 요소로 쓰지 않고 구조와 조작감만 빌린다. 출처를 밝히는 오마주 표기(`homage`)는 둔다.
- 문서와 화면 문구에 과장된 의의 부여, 상투구, 불필요한 3단 병렬을 쓰지 않는다.

## 개인정보

- 학생 기록은 기기의 localStorage에 저장하고 앱이 서버로 자동 전송하지 않는다. 학생이 요약 복사·JSON 저장으로 직접 제출하는 기능만 있다.
- 실제 학생 이름·학번·성적·학교 정보를 코드·테스트·커밋·로그·문서에 넣지 않는다. 테스트에는 가상 값(예: 20315, '테스트')만 쓴다.
- 학생 기록 JSON을 외부 모델(GPT 등)에 보내지 않는다.

## 검증과 커밋

- 실행한 명령의 출력으로 보고한다. 돌리지 않은 검증은 '미실행'이라고 적는다.
- 변경 파일을 명시해 스테이징한다. `git add .`을 쓰지 않는다.
- 커밋은 게임 단위로 나눈다. 제목 형식: `<게임 이름 | 허브·공통 | 문서>: <바꾼 내용>`.
- 사용자가 요청하지 않으면 push하지 않는다. 기본 브랜치는 `main`.

## 결정과 진행 상황을 문서로 남긴다

- 결정을 내리면 그 자리에서 `docs/DECISIONS.md`에 항목을 추가하고 색인 표에도 한 줄 넣는다. 나중에 몰아 쓰면 근거를 잃는다.
- 이전 결정을 뒤집기 전에 사용자에게 근거를 들어 확인한다. 뒤집을 때는 원래 항목을 지우지 않고 상태를 `대체됨(D-0NN)`으로 바꾼다.
- 교사의 판단이 필요한 선택은 추측으로 정하지 말고 사용자에게 묻거나 `docs/PROGRESS.md`의 미결 사항(M번호)에 올린다.
- 작업 단위를 마치거나 세션을 끝내기 전에 `docs/PROGRESS.md`의 상태 스냅샷, 다음 할 일, 미결 사항을 고친다. 항목을 지워도 남은 항목의 T·M 번호는 바꾸지 않는다.
