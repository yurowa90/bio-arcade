---
name: arcade-verify
description: 생명 오락실 변경을 검증한다. 커밋하기 전, 게임 규칙·화면·공통 코드를 고친 뒤, 또는 "검증해줘", "테스트 돌려줘"라는 요청에 쓴다. 문법 검사, 탐사대 논리 테스트, 휴대폰 화면 E2E, 성취기준 대조, 서비스 워커 목록 확인을 차례로 돌리고 결과를 보고한다.
---

# 검증 절차

바뀐 범위에 맞춰 필요한 단계만 돌린다. 판단이 서지 않으면 전부 돌린다. 결과는 명령과 출력 근거로 보고하고, 돌리지 않은 단계는 '미실행'이라고 밝힌다.
Bash 호출 사이에는 환경 변수가 이어지지 않는다. 그래서 아래 명령은 줄마다 따로 실행해도 되도록 필요한 변수를 줄 안에 둔다.
출력이 길어 메인 대화의 맥락을 아껴야 하면 `test-runner` 서브에이전트에 맡기고 단계별 요약만 받는다.

## 0. 준비

```bash
export FNM_DIR="$HOME/Library/Application Support/fnm"; eval "$(fnm env)"; cd "$(git rev-parse --show-toplevel)" && node -v && git status -sb
```

Node는 `.node-version`(24.21.0)이어야 한다. Playwright가 `~/.cache/bio-arcade-tools/node_modules/playwright`에 없으면 `docs/DEVELOPMENT.md` 8절의 설치 명령을 먼저 실행한다.

## 1. 문법 검사 (항상)

```bash
for f in $(git ls-files '*.js'); do node --check "$f" || echo "FAIL $f"; done
```

아직 추적되지 않은 새 파일은 따로 `node --check` 한다.

## 2. 규칙 테스트 (게임 규칙이나 tests/를 바꿨을 때)

```bash
node tests/quest-logic.js          # 탐사대. FAIL 0이어야 한다
node tests/quest-tune-photo.js     # 광합성 규칙을 바꿨다면 별 분포를 확인한다
node tests/circulation-logic.js    # 혈액 순환 일주. 종료 코드 0
node tests/glucose-logic.js        # 혈당 지키기 별 기준. 종료 코드 0
node tests/organization-logic.js   # 구성 단계 잇기. FAIL 0(--acceptance로 전략별 별 분포)
node tests/pedigree-logic.js       # 가계도 해결기·추론 엔진·도전 후보표. PASS 수와 FAIL 0(약 1분)
```

## 3. 성취기준 대조 (shared/arcade.js의 GAMES나 shared/standards.js를 바꿨을 때)

`docs/DEVELOPMENT.md` 3절의 대조 명령을 돌린다. 두 배열이 모두 비어야 한다.

## 4. 서비스 워커 목록 (파일을 더하거나 지웠을 때)

`docs/DEVELOPMENT.md` 7절의 재생성 명령 출력과 `sw.js`의 `FILES` 본문이 같은지 비교한다.

## 5. 휴대폰 화면 E2E (화면·공통 코드·허브를 바꿨을 때, 코드 커밋 전)

스크린샷은 저장소 밖에 둔다. arcade-e2e는 오래 걸리므로 백그라운드로 돌려도 된다.

```bash
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/quest-e2e.js /tmp/bio-arcade-e2e/quest     # 약 15초
PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/arcade-e2e.js /tmp/bio-arcade-e2e/arcade   # 약 2분
for s in ux-common ux-arcade ux-mendel-pedigree; do PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright" node tests/$s-e2e.js /tmp/bio-arcade-e2e/$s; done   # 플레이 테스트 반영 화면 검사(D-054)
```

통과 기준: 종료 코드 0, `errors: none`, `failures: none`(arcade), `FAIL` 줄 없음(quest). 자동 플레이 결과가 "다시 도전!"인 것은 정상이다.

`quest-e2e`는 타이틀·'이어하기'처럼 단언을 둔 요소만 가시성을 검사한다. 화면을 바꿨다면 스크린샷 몇 장을 직접 열어 겹침·잘림·가로 넘침을 본다.

## 6. 보고와 기록

- 단계별로 명령, 핵심 출력(PASS 수, errors, 종료 코드), 실패 원인을 적는다.
- 커밋 전 검증이면 결과를 `docs/PROGRESS.md`의 상태 스냅샷에 반영한다.

이 스킬 이름을 `verify`로 하지 않은 것은 Claude Code 내장 `/verify`(앱을 띄워 직접 확인)를 가리지 않기 위해서다.
