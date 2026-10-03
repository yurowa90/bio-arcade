# 개발 안내

구조, 코드 관례, 저장 키, 테스트 방법, 새 게임 추가 절차, 함정을 모았다. 규칙은 `AGENTS.md`, 결정의 근거는 `docs/DECISIONS.md`, 현재 상태는 `docs/PROGRESS.md`에 있다.

## 1. 파일 구조

| 경로 | 역할 |
|---|---|
| `index.html` | 허브. `GAMES`로 게임 칸을 그리고 학번·이름, 기록 요약(요약 복사·JSON 저장·기록 지우기), 공용 기기 확인 창을 맡는다. https일 때만 `sw.js`를 등록한다. |
| `manifest.webmanifest`, `icons/` | PWA 설정과 아이콘(180·192·512). |
| `sw.js` | 서비스 워커. `CACHE='bio-arcade-v2'`, `FILES`(7절 명령으로 생성), 네트워크 우선 후 캐시 대체, 정상 응답만 캐시. |
| `shared/arcade.js` | `window.Arcade`: `GAMES` 목록, 기록 저장, 시작·결과 카드, 모달 처리, 성취기준 표시, 탐사대 배지 읽기, 기록 지우기. |
| `shared/arcade.css` | 미니게임 공통 스타일(세로 휴대폰 기준). |
| `shared/standards.js` | `window.ARCADE_STANDARDS`: 2022 개정 성취기준 13개 코드, 성취수준 65개 발췌. |
| `games/basepang/` | 염기쌍 팡. `engine.js`(`window.BasePang`, 판·짝 규칙·연쇄), `game.js`(화면·오개념 신호·흐름 문항). |
| `games/glucose/` | 혈당 지키기. `model.js`(`window.GlucoseModel`, 45초=하루 모델·별), `game.js`(캔버스·모드 선택). |
| `games/mendel/` | 멘델의 텃밭. `genetics.js`(`window.Genetics`), `game.js`(화분·교배·검정 교배·추론). |
| `games/pedigree/` | 가계도 지뢰찾기. `pedigree.js`(`window.Pedigree`, 단계 데이터·유전자형 조합 전수 해결기), `game.js`. |
| `games/run/` | 에너지 런. `game.js` 하나(구간 `ZONES`, 아이템 묶음 `DECK`, 세포 전달). 규칙 모듈이 따로 없다. |
| `games/quest/` | 생명 탐사대. **독립 앱**: `shared/`를 읽지 않는다. `js/data.js`(`window.GameData`: 생물 18종, 지도 4개, 체육관), `js/battles.js`(`window.Battles`: 광합성·소화 규칙), `js/main.js`(이동·대화·관찰·도감·체육관·저장), `css/style.css`. |
| `tests/` | `quest-logic.js`(Node 단언), `quest-tune-photo.js`(광합성 난이도 보고), `arcade-e2e.js`·`quest-e2e.js`(Playwright). |
| `docs/` | 진행 상황, 결정 기록, 이 문서, 당시 기록 2개(복구 기록서, 교차 검토 결과). |

## 2. 모듈 관례

- 순수 규칙 모듈은 브라우저 전역과 Node `require`에 함께 쓰이는 형태다: `(function (root) { … root.X = api; if (typeof module !== 'undefined') module.exports = api; })(typeof window !== 'undefined' ? window : globalThis);`
- 화면 파일 `game.js`는 `(function () { const A = window.Arcade; const $ = id => document.getElementById(id); … })();` 형태의 즉시 실행 함수이고 브라우저 전용이다.
- `shared/standards.js`만 최상위에서 `window.ARCADE_STANDARDS = […]`를 쓴다. Node에서 읽으려면 `global.window = global`을 먼저 둔다.
- 게임 페이지의 스크립트 순서: `../../shared/standards.js` → `../../shared/arcade.js` → 규칙 모듈 → `game.js`. 각 페이지는 `../../shared/arcade.css`, `../../manifest.webmanifest`, `../../icons/icon-180.png`를 링크하고 `<div class="overlay" id="overlay" hidden></div>`를 둔다.

## 3. 게임 등록과 성취기준

`shared/arcade.js`의 `GAMES` 배열 항목: `id`, `title`, `path`(`games/<id>/index.html`), `color`, `homage`, `genre`, `pitch`, `standards`(코드 배열), `target`(겨냥 수준). 생명 탐사대만 `gyms: [{ id, name }]`가 더 있고, `games/quest/js/data.js`의 `GYMS` 중 `ready: true`인 것과 손으로 맞춘다. 배열 순서가 허브 칸과 요약의 순서다.

`shared/standards.js` 항목: `{ code, subject, area, text, levels: [{ level: 'A'~'E', text }] }`. 원본은 GitHub `yurowa90/teacher-essaytest`의 `standards-data.js`이고, 발췌할 때 PDF 추출 띄어쓰기 오류를 바로잡는다. `GAMES`에 있는 코드가 여기 없으면 시작 카드에서 조용히 빠진다. 대조 명령:

```bash
node -e "global.window=global; const S=require('./shared/standards.js'); const A=require('./shared/arcade.js'); const used=new Set(A.GAMES.flatMap(g=>g.standards)); const have=new Set(S.map(s=>s.code)); console.log('없는 코드:', [...used].filter(c=>!have.has(c)), '안 쓰는 코드:', [...have].filter(c=>!used.has(c)))"
```

## 4. 기록 저장(localStorage)

- `bioArcade.v1`(`shared/arcade.js`): `{ student: { id, name }, games: { [gameId]: { best, bestScore, plays: [{ at, stars, score, detail, quizCorrect?, reflection?, flowQuizCorrect? }] } } }`. 읽기·쓰기는 try/catch로 감싼다.
- `bioQuest.v1`(`games/quest/js/main.js`): 탐사대 전용. 위치, 도감, 배지, 시간 모드, 체육관 기록, 학번·이름, 인트로 완료 여부.
- 허브의 `Arcade.hasRecords()`는 `bioArcade.v1`의 `games`에 게임 기록이 하나라도 있거나 `bioQuest.v1` 키가 있으면 참이다. 학번·이름만 저장된 상태는 기록 없음으로 본다. `clearRecords()`는 두 키를 모두 지운다. 'JSON 저장'은 `생명오락실_<학번>.json`으로 내려받는다.
- 기록은 기기 밖으로 보내지 않는다. `detail`에는 교사가 볼 오개념 신호를 넣는다.

## 5. 결과 화면 API (`window.Arcade`)

- `A.intro(overlay, { id, rules: [HTML], onStart })`: 시작 카드.
- `A.finish(overlay, { id, stars(0~3), score, lines: [HTML], detail, quiz: { q, options(2개), answer, explain }, reflection, onRetry })`: 기록을 먼저 저장하고 결과 카드를 띄운다. 인출 문항 정답 여부는 고르는 즉시, '설명해 보기' 답은 '다시 하기'(`#ar-retry`)나 '오락실로'(`#ar-hub`)를 누를 때 저장된다.
- 그 밖: `A.GAMES`, `A.game(id)`, `A.data()`, `A.student()`, `A.setStudent()`, `A.record()`, `A.patchLast()`, `A.best()`, `A.questBadges()`, `A.hasRecords()`, `A.clearRecords()`, `A.standards()`, `A.standardsHTML()`, `A.stars()`.
- 결과 카드를 꾸밀 때는 공통 클릭 처리(`.quiz-opts .btn`)에 걸리지 않게 클래스를 따로 쓴다. 혈당은 `addModePicker`, 염기쌍 팡은 `addFlowQuiz`(`.flow-quiz`, `.flow-opts`)를 쓴다.
- 모달: intro·finish가 뜨면 overlay의 형제 요소에 `inert`를 달고, 캡처 단계 keydown을 끊는다. 게임이 같은 overlay의 `hidden`을 직접 바꿔도 MutationObserver가 맞춘다.
- 토스트: 공용 함수가 없다. 게임마다 `#toast`와 자체 `toast()`가 있고, 표시 시간은 글자당 약 70ms(최소 2.2초, 최대 6초)다. 가계도만 글자당 80ms이고 상한이 없다(`Math.max(2200, t.length * 80)`). 탐사대에는 토스트가 없고 대화창을 쓴다.

## 6. 테스트 훅

- `window.__game`(염기쌍 팡): `grid()`, `level()`, `moves()`, `trySwap(a, b)`.
- `window.__bq`(탐사대): 상태 `S`, `mode`, `player`, `warp(map, x, y)`, `encounter(habitat, sp?)`, `observationQuestions(sp)`, `gymPhoto`, `gymDigest`, `openDex`.
- E2E는 전역 모듈도 직접 쓴다(`window.Pedigree.solve`, `window.BasePang.findPairs`, `window.GameData.SPECIES`). 혈당·에너지 런·멘델은 DOM 선택자와 포인터로 조작한다.

## 7. 서비스 워커 캐시 목록

`sw.js`의 `FILES`는 `'./'`와 git이 추적하는 `games/`·`icons/`·`shared/`·`index.html`·`manifest.webmanifest`를 C 로캘로 정렬한 목록이다. 파일을 더하면 `git add`, 지우면 `git rm` 뒤에 아래 출력으로 `const FILES = [`와 `];` 사이를 바꾼다. 목록에 있는데 실제로 없는 경로가 있으면 설치(`cache.addAll`)가 실패하고, 목록에서 빠진 파일은 오프라인에서 열리지 않는다. 오류 응답이 캐시됐을 수 있으면 `CACHE` 이름의 번호를 올린다.

```bash
(echo "  './',"; git ls-files games icons shared index.html manifest.webmanifest | LC_ALL=C sort | sed "s/.*/  '&',/")
```

## 8. 테스트 환경

Node는 저장소의 `.node-version`(24.21.0)을 fnm으로 쓴다(D-030). `package.json`과 의존 패키지는 없다.

```bash
export FNM_DIR="$HOME/Library/Application Support/fnm"; eval "$(fnm env)"
```

Playwright는 저장소 밖 `~/.cache/bio-arcade-tools`에 pnpm으로 설치한다(D-029). 한 번만 하면 된다.

```bash
mkdir -p ~/.cache/bio-arcade-tools && cd ~/.cache/bio-arcade-tools && { [ -f package.json ] || echo '{"name":"bio-arcade-tools","private":true}' > package.json; } && pnpm add playwright@1.63.0
```

브라우저는 `~/Library/Caches/ms-playwright/chromium_headless_shell-1243`을 쓴다. 다른 컴퓨터에서 브라우저가 없으면 `cd ~/.cache/bio-arcade-tools && pnpm exec playwright install chromium-headless-shell`이 필요할 수 있다(미검증).

| 명령 | 걸리는 시간 | 통과 기준 |
|---|---|---|
| `node tests/quest-logic.js` | 1초 미만 | `FAIL` 0, 종료 코드 0 |
| `node tests/quest-tune-photo.js` | 1초 미만 | 보고만 한다. 광합성 규칙을 바꿀 때 별 분포를 본다 |
| `PW=~/.cache/bio-arcade-tools/node_modules/playwright node tests/arcade-e2e.js <저장소 밖 폴더>` | 약 2분 | `errors: none`, `failures: none`, 종료 코드 0 |
| `PW=~/.cache/bio-arcade-tools/node_modules/playwright node tests/quest-e2e.js <저장소 밖 폴더>` | 약 15초 | `FAIL` 없음, `errors: none`, 종료 코드 0 |

E2E는 서버 없이 `file://`로 페이지를 연다. 화면을 직접 보려면 저장소 루트에서 `python3 -m http.server 18923 --bind 127.0.0.1`을 띄운다(8765·8791은 이 맥의 다른 도구와 겹친 적이 있어 피한다). 서비스 워커는 https에서만 등록되므로 로컬 서버에서는 오프라인 캐시가 동작하지 않는다.

## 9. 새 게임 추가

허브 칸은 `GAMES`에서 자동으로 그려지므로 `index.html`은 고치지 않는다. 절차는 `/add-game` 스킬에도 있다.

1. `games/<id>/index.html`을 기존 게임(예: `games/glucose/index.html`)을 본떠 만든다. 결과 카드의 '오락실로' 링크가 `../../index.html`이므로 반드시 `games/<id>/` 깊이에 둔다.
2. 규칙은 `games/<id>/<이름>.js`에 순수 함수 모듈로 두고, 화면은 `game.js`에서 `A.intro`로 시작해 `A.finish`로 끝낸다. 키 입력은 게임 중이고 입력칸이 아닐 때만 가로챈다.
3. `shared/arcade.js`의 `GAMES`에 항목을 추가한다.
4. 새 성취기준 코드는 `shared/standards.js`에 넣고 3절의 대조 명령으로 확인한다.
5. 7절의 명령으로 `sw.js`의 `FILES`를 다시 만든다.
6. README의 '게임과 성취기준' 표, '게임이 단순화한 것', 로드맵을 고친다.
7. `tests/arcade-e2e.js`의 에너지 런 블록 뒤에 플레이와 `finishCheck('<id>')`를 넣는다.
8. `.claude/rules/minigames.md`의 `paths`에 `"games/<id>/**"`를 넣고, 결정 번호 줄에 새 게임의 D번호를 더한다.
9. 8절의 검증을 모두 돌리고 스크린샷에서 가로 넘침과 화면을 눈으로 확인한다.

생명 탐사대에 체육관을 열 때는 경로가 다르다. `data.js` `GYMS`의 `ready: true`, `battles.js`의 규칙과 내보내기, `main.js`의 체육관 함수와 문 연결, `shared/arcade.js` `GAMES`의 `quest.gyms`, `tests/quest-logic.js`와 `tests/quest-e2e.js`를 함께 고친다.

## 10. 함정

코드와 실행으로 확인한 것이다.

1. **`hidden`과 `display`.** 요소에 `display`를 주면 `hidden` 속성이 무시된다. 일반 `[hidden]` 규칙은 ID·클래스 선택자보다 우선순위가 낮아 이기지 못하므로, 같은 선택자에 `[hidden]`을 붙인 규칙(`.btn[hidden]`, `#title[hidden]`)을 둔다. 탐사대 타이틀 버그(T1)가 이 때문이고, 공통 CSS는 `.btn[hidden]` 규칙으로 막았다. 염기쌍 팡은 `.refl { display: block }` 때문에 '설명해 보기'를 숨기지 않고 DOM에서 떼었다 붙인다.
2. **탐사대는 독립 앱이다.** 공통 CSS·JS·토스트를 쓰지 않고 학번·이름도 따로 받는다. 체육관을 열면 9절 끝의 여섯 곳을 함께 고친다.
3. **E2E 스크린샷 폴더**를 빼면 현재 폴더에 PNG가 쌓인다. 저장소 밖 폴더를 준다.
4. **`arcade-e2e`는 실시간 플레이**라 2분 넘게 걸린다. 판정 함수는 `check(ok, msg)`이고, `quest-e2e`는 `check(name, cond, extra)`로 인자 순서가 다르다. 확인 창은 모두 [취소]로 처리하므로 [확인]으로 지우는 경로와 '기록 지우기' 버튼은 E2E가 다루지 않는다.
5. **Space 키.** 혈당·에너지 런은 게임 중이고 입력칸이 아닐 때만 기본 동작을 막는다. 그래야 '설명해 보기'에 띄어쓰기가 들어간다.
6. **입력칸은 16px 이상.** 그보다 작으면 iOS Safari가 화면을 확대한다.
7. **허브 확인 창 로직**은 blur 시점에 기록 주인을 확정하고 한글 조합(`isComposing`)을 따로 처리한다. 고친 뒤에는 E2E 끝의 확인 창 4회 검사를 반드시 돌린다.
8. **`sw.js`의 `FILES`는 손으로 관리한다.** 등록은 허브에서, https일 때만 한다.
9. **`docs/`의 당시 기록**(복구 기록서, 교차 검토 결과)은 숫자가 현재와 다르다. 현재 상태는 이 문서와 `docs/PROGRESS.md`를 본다.
10. **gpt-reviewer**는 발췌를 임시 파일과 표준 입력으로 넘긴다. 코드 발췌를 셸 인자로 넘기면 백틱·`${}`가 치환된다.
