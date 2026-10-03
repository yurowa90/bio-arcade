@AGENTS.md
@docs/PROGRESS.md

# Claude Code 전용 지침

공통 규칙(결정·미결·검증 보고·커밋)은 위에서 불러온 `AGENTS.md`를 따른다. 여기에는 Claude Code에서만 쓰는 장치를 적는다.

## 세션을 시작하거나 압축·재개 뒤 이어갈 때

1. `docs/PROGRESS.md`의 다음 할 일(T번호)과 미결 사항(M번호)을 확인한다.
2. 압축이나 재개 직후에는 SessionStart 훅이 git 상태(브랜치, 최근 커밋, 커밋하지 않은 변경)를 맥락에 넣어 준다. HEAD 커밋이나 push 여부가 PROGRESS의 상태 스냅샷과 다르면 PROGRESS부터 고친다. 커밋하지 않은 변경은 진행 중인 일로 보고, 그 일이 '다음 할 일'에 적혀 있는지만 확인한다.
3. 규칙·수치·문구를 바꾸기 전에 `docs/DECISIONS.md`에서 관련 결정(D번호)을 찾아 읽는다.

## 작업 분담 (사용자 지시, D-045)

**Claude(이 세션)가 총괄 지시 → GPT(Sol·Astra)가 작업 → Claude Opus가 독립 검토.** 코드 작성·수정은 이 순서로 한다. 절차는 `/gpt-delegate`.

- Astra(`gpt-6-astra`): 규칙·알고리즘·전수 탐색처럼 가장 어려운 일. Sol(`gpt-6.1-sol`): 화면·연결·테스트·수정 같은 주력 코딩.
- GPT는 Codex `workspace-write` 샌드박스로 저장소 안에서만 작업하고, 문서 수정과 git 커밋은 하지 않는다. 통합·문서·커밋은 Claude가 한다.
- 검토는 `model: 'opus'` 서브에이전트가 직접 실행해서 한다. GPT의 자체 보고는 주장으로만 다룬다.

## 스킬

| 스킬 | 언제 |
|---|---|
| `/arcade-verify` | 커밋 전, 코드를 바꾼 뒤. 문법·논리 테스트·E2E·성취기준·서비스 워커 목록 검증 |
| `/add-game` | 새 미니게임이나 탐사대 체육관을 추가할 때 |
| `/cross-review` | 과학 내용과 학생용 문구를 Claude와 GPT가 독립 검토하고 반박 검증할 때 |
| `/handoff` | 작업 단위를 마쳤을 때, 커밋 뒤, 결정을 내렸을 때, 세션을 끝내기 전 |
| `/gpt-delegate` | 코드 작성·수정을 GPT(Sol·Astra)에게 맡기고 Opus가 검토할 때(기본 작업 방식) |

검증 스킬 이름을 `verify`로 하지 않은 것은 Claude Code 내장 `/verify`(앱을 띄워 직접 확인)를 가리지 않기 위해서다.

## GPT(사용자의 Codex) 서브에이전트

서브에이전트는 Claude 모델만 쓸 수 있으므로, GPT는 `gpt-reviewer`(`.claude/agents/gpt-reviewer.md`)가 부르는 도구로 연결돼 있다(D-003, D-040).

- **쓰는 때**: 과학 내용·학생용 문구·게임 규칙이 바뀌는 커밋 전(수정 검증), 새 게임이나 별 기준을 정하기 전(설계 의견), 결정 기록·문서의 사실을 대조할 때(내용 검토).
- **부르는 법**: `Agent`의 `subagent_type: gpt-reviewer`, 또는 워크플로의 `agent(…, { agentType: 'gpt-reviewer' })`. 같은 대상을 Claude 검증자에게도 따로 맡겨 병렬로 돌리고, 둘 다 지적한 것을 우선한다.
- **기본값**: 읽기 전용 샌드박스, 추론 강도 `high`(검토 한 번 약 2분), JSON 스키마 답, 시간 초과 때 `exec resume --last`. 사용자의 Codex 기본값은 `xhigh`·`danger-full-access`라서 옵션을 빼먹으면 오래 걸리거나 쓰기 권한으로 돈다.
- **판정**: 중개자는 GPT의 지적을 저장소에서 직접 확인해 [동의/반박/불확실]로 나눈다. 지금까지 GPT 지적의 기각 비율이 높았으므로(112건 중 GPT 41건, 그중 31건 기각) 판정 없이 반영하지 않는다.
- codex 경로: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`(PATH에 없음).

## 폴더별 규칙과 훅

- `.claude/rules/quest.md`, `minigames.md`, `tests.md`는 경로가 맞는 파일을 Read·Edit·Write 도구로 열 때만 불러온다. Bash(`cat`, `sed`)로 읽거나 고치면 불러오지 않고, 압축 뒤에는 그 파일을 다시 열 때까지 빠져 있다. 그래서 해당 경로의 파일을 고치기 전에는 대상 파일을 Read 도구로 먼저 연다.
- `.claude/settings.json`의 SessionStart 훅(`compact`, `resume`)이 `.claude/hooks/session-context.sh`를 실행한다.
- 오래 걸리는 E2E(`arcade-e2e`, 약 2분)는 백그라운드로 돌려도 된다. Bash 호출 사이에는 환경 변수가 이어지지 않으므로 `PW=…`는 명령마다 붙인다.

## Compact instructions (압축 요약 지침)

When compacting, 요약에 반드시 다음을 남긴다.

- 이번 세션에서 수정·생성·삭제한 파일의 전체 목록과, 각 파일이 커밋됐는지 여부와 커밋 해시
- 실행한 검증 명령과 결과 숫자(PASS·FAIL 수, 종료 코드, errors·failures)
- 사용자가 내린 결정과 지시(원문에 가깝게), 아직 답을 받지 못한 질문
- 진행 중인 작업의 다음 단계, 그리고 `docs/PROGRESS.md`·`docs/DECISIONS.md`에 아직 반영하지 않은 내용
- 다른 세션·서브에이전트·백그라운드 작업에 맡긴 일과 그 상태

자동 압축은 예고 없이 일어날 수 있다. 그러니 커밋·결정·작업 단위가 끝날 때마다 `/handoff`로 문서에 남긴다. 사용자가 `/compact`를 하려 하면 먼저 `/handoff`를 돌리자고 권한다. 문서에 남긴 내용은 압축 뒤에도 다시 읽을 수 있다.
