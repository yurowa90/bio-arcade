@AGENTS.md
@docs/PROGRESS.md

# Claude Code 전용 지침 (공통 규칙은 위의 AGENTS.md)

## 세션을 시작하거나 압축·재개 뒤 이어갈 때

1. `docs/PROGRESS.md`의 다음 할 일(T)과 미결 사항(M)을 본다.
2. SessionStart 훅이 넣어 준 git 상태(HEAD, push 여부)가 PROGRESS의 상태 스냅샷과 다르면 PROGRESS부터 고친다.

## 작업 분담 (D-045)

Claude(이 세션)가 지시서를 쓰고 통합·문서·커밋을 맡는다. GPT(Astra는 어려운 규칙·알고리즘, Sol은 화면·연결·수정)가 Codex `workspace-write`로 코드를 쓴다.
Claude Opus 서브에이전트가 직접 실행해 검토하고, GPT의 자체 보고는 주장으로만 다룬다. 절차는 `/gpt-delegate`.
GPT에게 검토 의견을 받을 때는 `gpt-reviewer` 서브에이전트를 쓴다(기본값·판정 원칙은 `.claude/agents/gpt-reviewer.md`).

## 스킬·서브에이전트·규칙·훅

- `/arcade-verify`: 커밋 전 검증. 출력이 길면 `test-runner` 서브에이전트에 맡겨 요약만 받는다.
- `/add-game`: 새 미니게임이나 탐사대 체육관 추가.
- `/cross-review`: 과학 내용·학생용 문구의 Claude·GPT 교차 검토.
- `/handoff`: 작업 단위·커밋·결정 뒤, 세션을 끝내기 전 문서 갱신.
- `/gpt-delegate`: 코드 작성·수정을 GPT에 맡기고 Opus가 검토(기본 작업 방식).
- `/deploy`: Netlify 학생용 주소 재배포. 사용자 확인 뒤에만.
- `.claude/rules/*.md`는 경로가 맞는 파일을 Read·Edit·Write 도구로 열 때만 불러온다. 그 경로를 고치기 전에 대상 파일을 Read로 먼저 연다.
- `guard-bash.sh`(PreToolUse)가 `git push`는 사용자 확인을 받게 하고, `git add .`·`-A`와 샌드박스를 명시하지 않은 `codex exec`는 막는다.

## Compact instructions (압축 요약 지침)

When compacting, 요약에 반드시 다음을 남긴다.

- 이번 세션에서 수정·생성·삭제한 파일 목록, 각 파일의 커밋 여부와 커밋 해시
- 실행한 검증 명령과 결과 숫자(PASS·FAIL 수, 종료 코드, errors·failures)
- 사용자가 내린 결정과 지시(원문에 가깝게), 아직 답을 받지 못한 질문
- 진행 중인 작업의 다음 단계, `docs/PROGRESS.md`·`docs/DECISIONS.md`에 아직 반영하지 않은 내용
- 다른 세션·서브에이전트·백그라운드 작업에 맡긴 일과 그 상태

자동 압축은 예고 없이 일어난다. 커밋·결정·작업 단위가 끝날 때마다 `/handoff`로 문서에 남긴다. 사용자가 `/compact`를 하려 하면 먼저 `/handoff`를 권한다.
