---
name: gpt-delegate
description: 구현·수정 작업을 사용자의 GPT 모델(Codex CLI의 Sol·Astra)에게 맡기고 Claude Opus가 독립 검토하는 절차. 사용자가 정한 기본 작업 방식(총괄 Claude → 작업 GPT → 검토 Opus, D-045)이라, 코드 작성·수정이 필요한 작업에서는 이 절차로 진행한다. "GPT한테 시켜", "Sol로", "Astra로" 요청에도 쓴다.
---

# GPT 작업 위임 절차

역할(D-045): **Claude(세션)** 가 총괄해 지시서를 쓰고 통합·커밋한다. **GPT** 가 실제 작업을 한다. **Claude Opus** 가 결과를 독립 검토한다. GPT의 자체 보고는 검토 근거로 쓰지 않는다.

## 1. 모델 고르기

| 모델 | Codex 이름 | 맡길 일 |
|---|---|---|
| Astra | `gpt-6-astra` | 가장 어려운 일: 규칙·알고리즘, 전수 탐색·시뮬레이션, 과학 내용이 얽힌 판정 로직 |
| Sol | `gpt-6.1-sol` | 주력 코딩: 화면, 연결 작업, 테스트 보강, 검토 지적 수정 |

추론 강도는 `high`를 기본으로 한다. 사용자의 Codex 기본값(`xhigh`)은 작업 하나가 수십 분 걸릴 수 있다.

## 2. 지시서 쓰기

임시 폴더(`/private/tmp/claude-501/<작업>/gpt/`)에 지시서 `*-prompt.txt`와 보고 스키마 `report-schema.json`을 쓴다(작은따옴표 heredoc). 지시서에 반드시 넣을 것:

- 먼저 읽을 문서: `AGENTS.md`, 해당 설계 문서, 관련 결정 번호(`docs/DECISIONS.md`), 참고 구현 파일
- 만들거나 고칠 **파일 목록**(그 밖은 건드리지 않는다)
- 설계에 없는 부분은 GPT가 정하되 `decisions`에 이유를 적게 한다
- 금지: 문서 수정, git 상태를 바꾸는 명령(add·commit·checkout·reset·stash·rm), 파일 삭제, 금지 용어(`AGENTS.md`)
- 끝나기 전에 돌릴 검증 명령과, 결과를 `tests`에 적으라는 지시
- 다음 작업자에게 넘길 내용은 `open`에

보고 스키마의 필드: `summary`, `files`, `decisions`, `numbers`, `tests`, `deviations`, `open`.

## 3. 실행(백그라운드)

```bash
C=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex; G=<임시 폴더>
"$C" exec -m gpt-6-astra --sandbox workspace-write --color never -C "$(git rev-parse --show-toplevel)" \
  -c model_reasoning_effort='"high"' --output-schema "$G/report-schema.json" -o "$G/report.json" - < "$G/prompt.txt" > "$G/log.txt" 2>&1
```

- 10분을 넘기기 쉬우므로 Bash의 `run_in_background`로 돌리고 완료 알림을 기다린다.
- 샌드박스는 `workspace-write`(저장소 안에서만 쓰기)다. `danger-full-access`로 돌리지 않는다.
- 끝나면 `git status`로 지시서 밖의 파일이 바뀌지 않았는지, 커밋이 생기지 않았는지 확인한다.

## 4. Opus 독립 검토

검토는 `model: 'opus'` 서브에이전트(또는 워크플로 `agent(…, { model: 'opus' })`)에게 맡긴다. 검토자에게는 설계 문서와 결정, 바뀐 파일 목록만 주고, GPT 보고는 '주장'으로만 건넨다. 검토자는 직접 실행해 확인한다(Node 테스트, Playwright 화면, 수치 재계산). 과학 내용이 있으면 과학 정확성 관점과 코드 관점을 나눠 두 명에게 맡긴다.

## 5. 수정 지시와 반복

high·medium 지적이 있으면 지적 원문을 새 지시서에 붙여 같은 모델(또는 Sol)에게 다시 맡긴다. 수정 뒤 Opus가 '원래 지적이 해결됐는가'를 중심으로 다시 검토한다. 두 번 돌아도 남는 지적은 사용자에게 알린다.

## 6. 통합

통과하면 Claude가 문서(`README`, `AGENTS.md`, `docs/`)를 맞추고, `/arcade-verify`로 전체를 검증한 뒤 게임 단위로 커밋한다. 커밋 메시지에 작업 모델과 검토 모델을 적는다(예: '작업: GPT-6-Astra, 검토: Claude Opus').
