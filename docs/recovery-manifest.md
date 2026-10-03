# bio-arcade 복구 기록서

> 이 문서는 2026-10-01 복구 당시의 기록이다. 이후 수정으로 숫자와 동작이 바뀌었으니 현재 상태는 `docs/PROGRESS.md`와 `docs/DEVELOPMENT.md`를, 결정은 `docs/DECISIONS.md`를 본다.

클라우드 세션(`claude.ai/code/session_01VEWxAFQcSmZdFHH7Me8kV2`)의 컨테이너에만 있던 bio-arcade 저장소를, 텔레포트로 넘어온 그 세션의 대화 기록을 근거로 재작성한 결과다.
원본은 GitHub에 push된 적이 없고 로컬 `/Users/yurosung/Projects/bio-arcade`도 비어 있었으므로, 대화 기록이 유일한 출처다.

- 작성 위치: `/Users/yurosung/Projects/biology/.bio-arcade-recovery/` (저장소 루트 구조 그대로)
- 작성 파일: **35개** (원래 커밋 `78338b9` 시점의 추적 파일 수와 일치)
- biology 저장소의 기존 추적 파일은 건드리지 않았다. 작업 전 `git status --porcelain`이 비어 있었고, 이 폴더는 추적되지 않는 새 디렉터리다.
- git `init`/`commit`/`push`는 하지 않았다.

## 1. 원래 커밋 2개

두 커밋 모두 클라우드 컨테이너의 `/home/user/bio-arcade`에서 만들어졌고 remote가 없었다. 브랜치명은 `claude/ecstatic-euler-9j8len`.

### `bd3c89e` — 생명 오락실: 오마주 생명과학 미니게임 모음 초판

```
생명 오락실: 오마주 생명과학 미니게임 모음 초판

- 허브: 게임 선택, 학번·이름, 전체 기록 요약·JSON 제출, PWA 설치·오프라인
- 생명 탐사대(포켓몬 레드·그린 구조): 도감 관찰, 광합성·소화 체육관
- 멘델의 텃밭(농장+교배 수집): 표현형·유전자형 카드, 검정 교배
- 가계도 지뢰찾기: 유전자형 조합 전수 해결기로 확실한 보인자 판정
- 염기쌍 팡(애니팡): 상보적 짝 규칙, DNA 복제 → 전사(A→U)
- 에너지 런(쿠키런): 포도당+산소 세포 호흡, 폐·콩팥 노폐물 배출
- 혈당 지키기(놈·플래피): 인슐린/글루카곤 음성 피드백, 인슐린 저항성 모드
- 성취기준·성취수준: teacher-essaytest 데이터에서 발췌(2022 개정)
- 검증: 유전 비율·해결기·혈당 난이도 시뮬레이션, 휴대폰 화면 E2E

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VEWxAFQcSmZdFHH7Me8kV2
```

포함 파일 34개 — 아래 2번 표에서 `.claude/agents/gpt-reviewer.md`를 제외한 전부. (당시 `git ls-files | wc -l` 출력이 34였다.)

### `78338b9` — GPT 교차 검증 서브에이전트 설정과 로컬 작업 안내 추가

```
GPT 교차 검증 서브에이전트 설정과 로컬 작업 안내 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VEWxAFQcSmZdFHH7Me8kV2
```

포함 파일 2개:
- `.claude/agents/gpt-reviewer.md` (신규)
- `README.md` (끝에 “로컬 작업 + GPT 교차 검증 (선택)” 절 추가)

> 복구본의 `README.md`는 두 커밋의 내용을 합친 최종 상태다.

## 2. 파일별 복구 출처와 패치

“원본 출처”는 대화 기록에서 그 파일의 내용이 어떤 형태로 남아 있었는지를 뜻한다.
“적용 방법”에서 **패치 스크립트 재실행**은 전사에 남은 python/sed 코드를 그대로 다시 돌린 것이고, **패치 반영 직접 작성**은 1~2줄짜리 변경이라 최종 상태를 바로 쓴 것이다.

| 경로 | 원본 출처 | 적용한 패치 | 적용 방법 | 확신 |
|---|---|---|---|---|
| `index.html` (허브) | Write 입력 | 없음 | 그대로 | 확실 |
| `manifest.webmanifest` | heredoc | 없음 | 그대로 | 확실 |
| `sw.js` | heredoc + `find` 생성 | 없음 | 같은 `find` 명령으로 캐시 목록 재생성(28개 항목) | 확실 |
| `README.md` | heredoc + 추가 heredoc | 커밋 2의 GPT 절 추가 | 합쳐서 작성 | 확실 |
| `.gitignore` | heredoc | 없음 | 그대로 | 확실 |
| `.claude/agents/gpt-reviewer.md` | heredoc | 없음 | 그대로 | 확실 |
| `shared/arcade.js` | Write 입력 | 없음 | 그대로 | 확실 |
| `shared/arcade.css` | Write 입력 | 없음 | 그대로 | 확실 |
| `shared/standards.js` | **스크립트 생성(전사에 내용 없음)** | “단백질 이 → 단백질이” sed 보정 | 전사의 추출 스크립트를 `yurowa90/teacher-essaytest`에 재실행 + sed | 확실(아래 3번 대조) |
| `icons/icon-192.png` | **스크립트 생성(전사에 내용 없음)** | — | 전사의 캔버스 드로잉을 chrome-headless-shell로 재렌더 | 확실(아래 4번) |
| `icons/icon-512.png` | 〃 | — | 〃 | 확실 |
| `icons/icon-180.png` | 〃 | — | 〃 | 확실 |
| `games/quest/js/data.js` | Write 입력 | 잎새마을 행 길이(21→20자), route2 출구 2개→1개(x:19) | **패치 스크립트 재실행** | 확실 |
| `games/quest/js/battles.js` | Write 입력 | ① 광합성 goal 8→6 + `stars:[6,7,8]` + 승패 판정을 10턴 종료로 이동 ② `mix`(꿈틀 운동) 수단 추가 + `digestStars()` 추가 + api 내보내기 | **패치 스크립트 재실행** | 확실 |
| `games/quest/js/main.js` | Write 입력 | serviceWorker 등록 줄 삭제, 메뉴에 `m-hub` 버튼·핸들러 추가 | **패치 스크립트 재실행** | 확실 |
| `games/quest/index.html` | Write 입력 | manifest·icon 경로 `../../`, 타이틀에 `btn-hub` 링크 추가 | **패치 스크립트 재실행** | 확실 |
| `games/quest/css/style.css` | Write 입력 | `#title .btn`에 `text-decoration:none; text-align:center` | **패치 스크립트 재실행** | 확실 |
| `games/mendel/genetics.js` | Write 입력 | 없음 | 그대로 | 확실 |
| `games/mendel/index.html` | Write 입력 | 없음 | 그대로 | 확실 |
| `games/mendel/game.js` | Write 입력 | `gclose` 핸들러에 `S.sel = []` 추가 | 패치 반영 직접 작성 | 확실 |
| `games/pedigree/pedigree.js` | Write 입력 | 없음 | 그대로 | 확실 |
| `games/pedigree/index.html` | heredoc | 없음 | 그대로 | 확실 |
| `games/pedigree/game.js` | Write 입력 | `name()` 함수를 세대·관계 기반 호칭으로 교체 | 패치 반영 직접 작성 | 확실 |
| `games/basepang/engine.js` | Write 입력 | 없음 | 그대로 | 확실 |
| `games/basepang/index.html` | heredoc | 없음 | 그대로 | 확실 |
| `games/basepang/game.js` | heredoc | ① RNA 결합 집계 분기 수정 ② `window.__game` 테스트 훅 추가 | 패치 반영 직접 작성 | 확실 |
| `games/glucose/model.js` | heredoc | sed 격자 탐색 후 확정값: 호르몬 지연 `1.6`초, 글루카곤 계수 `12` | 패치 반영 직접 작성 | 확실(아래 3번 수치 일치) |
| `games/glucose/index.html` | heredoc | 없음 | 그대로 | 확실 |
| `games/glucose/game.js` | heredoc | 없음 | 그대로 | 확실 |
| `games/run/index.html` | heredoc | 없음 | 그대로 | 확실 |
| `games/run/game.js` | heredoc | 없음 | 그대로 | 확실 |
| `tests/quest-logic.js` | heredoc | 경로 sed(`../js/` → `../games/quest/js/`) | 경로 반영해 작성 | 확실 |
| `tests/quest-tune-photo.js` | heredoc | 경로 sed(동일) | 경로 반영해 작성 | 확실 |
| `tests/quest-e2e.js` | heredoc | 경로 sed(`../index.html` → `../games/quest/index.html`) | 경로 반영해 작성 | 확실 |
| `tests/arcade-e2e.js` | heredoc | 없음(제거했던 한 줄을 원래 위치에 되살림) | 그대로 | 확실(아래 6번) |

## 3. 복구본이 클라우드 때와 같은 결과를 내는지 대조

재작성이 맞는지 확인하려고, 클라우드에서 찍어 두었던 검증 출력과 같은 명령을 돌려 숫자를 맞췄다. 모두 일치했다.

| 검증 | 클라우드 출력 | 복구본 출력 |
|---|---|---|
| quest 지도 크기·출구 | town 20×12, route1 20×20, leaftown 20×12(출구 19,5), route2 24×12 | 동일 |
| 광합성 전문가 경로 | 녹말 8 / win / ★3 | 동일 |
| 광합성 단순 경로 | 녹말 6 / win / ★1 | 동일 |
| 광합성 무행동 | 패배 | 동일 |
| 소화 모범 경로 | absorb 단계, 헛수 0, ★3 | 동일 |
| 가계도 해결기 1~4단계 | 조합 4/4/2/8, 확실 `f,m` / `d1,s1,h1` / `gm,d1` / `d1,w1` | 동일 |
| 멘델 F2 비율 | 9.02:2.97:3.01:1.01 | 9.05:2.97:3.00:0.98 (난수라 소수점만 다름) |
| 멘델 검정 교배 | RY:rY ≈ 1:1, Ry·ry 0 | 동일 |
| 염기쌍 짝 규칙 5종 | true false true false true | 동일 |
| 혈당 기본 g>140 | TIR 100%, 저혈당 0.0초, 최고 175 | 동일 |
| 혈당 기본 g>120 | 100% / 0.0 / 156 | 동일 |
| 혈당 저항성 g>140 | 55% / 0.0 / 227 | 동일 |
| 혈당 저항성 예측형 | 90% / 0.0 / 199 | 동일 |
| `tests/quest-logic.js` | 전체 PASS | 36개 PASS, FAIL 0 |
| 성취기준 발췌 | 14개 코드 / 70개 성취수준 | 동일 |

## 4. 아이콘 재생성

이 맥에는 playwright 패키지가 없었지만 `~/Library/Caches/ms-playwright`에 `chrome-headless-shell`(1243)이 있어, 전사의 캔버스 드로잉 코드를 그대로 담은 HTML을 같은 렌더러로 스크린샷했다.

| 파일 | 클라우드 크기 | 복구본 크기 | 해상도 |
|---|---|---|---|
| `icons/icon-180.png` | 5267 B | 5269 B | 180×180 |
| `icons/icon-192.png` | 5435 B | 5437 B | 192×192 |
| `icons/icon-512.png` | 14565 B | 14567 B | 512×512 |

2바이트 차이는 PNG 인코더 버전 차이로 보이며, 그림 내용(풀숲 위 돋보기 속 잎)은 눈으로 확인했다.

## 5. 클라우드 절대경로 처리

지시 4번 항목. 최종 35개 파일에서 `/home/user` 류의 절대경로는 **발견되지 않았다**(`grep -rn "/home/user"` 결과 0건).
테스트가 쓰는 경로는 모두 저장소 루트 기준 상대경로다.

- `tests/quest-logic.js`, `tests/quest-tune-photo.js`: `require('../games/quest/js/...')`
- `tests/quest-e2e.js`: `path.resolve(__dirname, '../games/quest/index.html')`
- `tests/arcade-e2e.js`: `path.resolve(__dirname, '..')`

브라우저 실행 파일은 `process.env.PW` 환경 변수로 받으므로 경로가 박혀 있지 않다.

## 6. 불확실 항목 (1건)

**`tests/arcade-e2e.js`의 혈당 구간 한 줄.** 클라우드 원본에는 혈당 게임을 자동 플레이하는 반복문 안에 다음 줄이 있었다.

```js
const txt = await page.evaluate(() => 0); // 캔버스 값은 읽지 않고 주기적으로 눌렀다 뗀다
```

`txt`를 어디서도 쓰지 않는 죽은 코드여서 복구본에서는 제거했다. 동작에는 영향이 없다고 판단했지만, “원본과 바이트 단위로 같게” 두는 편이 낫다면 위 줄을 되살리면 된다. 이 한 줄 외에 의도적으로 바꾼 곳은 없다.

## 7. 처리하지 못한 것 (2건)

1. **임시 clone 폴더 `_tmp-teacher-essaytest/`가 남아 있다.** 성취기준 추출이 끝난 뒤 지우려 했으나 이 세션의 권한 설정이 `rm -rf`를 거부했다. 복구 산출물이 아니므로 폴더를 옮기기 전에 지워야 한다(약 4MB, `yurowa90/teacher-essaytest`의 얕은 clone).
2. **브라우저 E2E 테스트는 돌리지 못했다.** playwright npm 패키지가 없어 `tests/arcade-e2e.js`와 `tests/quest-e2e.js`를 실행하지 못했다. 문법 검사(`node --check`)만 통과한 상태다. 실행하려면 `npm install -g playwright` 또는 프로젝트에 설치한 뒤 `PW=$(npm root -g)/playwright node tests/arcade-e2e.js <폴더>`로 돌리면 된다. 순수 로직 테스트(`tests/quest-logic.js`)는 실제로 돌려 36개 전부 통과했다.

## 8. 개인정보 점검

지시 5번 항목. 실제 학생 데이터는 들어 있지 않다. 학번·이름 형태의 문자열은 `tests/arcade-e2e.js`의 자동 플레이 입력값 `'20315'`, `'테스트'` 한 곳뿐이며 가상 값이다.
게임이 저장하는 학번·이름은 모두 브라우저 `localStorage`에만 머물고 저장소에 들어가지 않는다.

## 9. 다음 단계 (옮기는 쪽에서 할 일)

1. `_tmp-teacher-essaytest/` 삭제
2. 이 폴더를 `/Users/yurosung/Projects/bio-arcade/`로 옮기기 (그곳에는 `.git`만 있고 remote가 `yurowa90/bio-arcade`로 잡혀 있음, 커밋 0개)
3. 파일을 명시해 스테이징하고 커밋. 원래 커밋 2개로 나눌지, 복구본 1개로 합칠지는 판단 필요
4. push는 사용자 요청이 있을 때만
5. playwright 설치 후 E2E 2종 실행 권장


## 8. 이동 후 조치 (2026-10-01, Bio-arcade 프로젝트 설정 세션)

- 35개 파일을 `/Users/yurosung/Projects/bio-arcade`로 옮겼다. `_tmp-teacher-essaytest/`는 원 세션에서 삭제가 거부된 폴더라 옮기지도 지우지도 않고 사용자 판단에 맡겼다.
- 6번의 한 줄을 원본 위치(혈당 반복문 안, `const done` 다음 줄, 공백 4칸)에 되살렸다. 이제 의도적으로 바꾼 곳은 없다.
