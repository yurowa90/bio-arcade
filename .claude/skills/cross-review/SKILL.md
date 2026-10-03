---
name: cross-review
description: 생명 오락실의 과학 내용·학생용 문구·코드를 Claude 검토자와 사용자의 GPT(Codex CLI)가 독립적으로 검토하고, 반박 검증으로 오탐을 거른다. 새 게임이나 큰 규칙 변경을 마친 뒤, 또는 "교차 검토", "GPT로도 확인해줘", "과학 내용 검토"라는 요청에 쓴다.
---

# 교차 검토 절차

방식의 근거는 `docs/DECISIONS.md`의 D-002(독립 검토 + 반박 검증), D-003(GPT 연결 방식)에 있다.

## 1. 범위 정하기

검토 단위를 게임(또는 허브·공통)으로 나누고, 단위마다 파일 목록과 과학 초점을 적는다. README의 '게임이 단순화한 것'은 의도된 단순화이므로 오류로 보지 않는다고 검토자에게 알린다.

## 2. 독립 검토

- **Claude 검토자**: 단위마다 서브에이전트 하나. 과학 사실 오류, 오개념을 줄 표현이나 규칙, 교과서 용어 불일치, 재현되는 버그를 찾게 한다. 순수 규칙은 Node로 재현하게 한다.
- **GPT 검토자**: `gpt-reviewer` 서브에이전트를 쓴다(권장). 이 에이전트는 GPT를 읽기 전용·추론 강도 `high`·JSON 스키마 답으로 부르고, 지적을 직접 확인해 판정한 뒤 돌려준다. 직접 부를 때는 임시 폴더를 만들고, 지시문과 발췌를 작은따옴표 heredoc과 `sed -n`으로 `$OUT/prompt.txt`에 쓴 뒤 같은 Bash 실행 안에서 표준 입력으로 넘긴다(Bash 호출 사이에는 변수가 이어지지 않는다).

```bash
OUT=$(mktemp -d "${TMPDIR:-/tmp}/cross-review.XXXXXX")
# … 여기서 $OUT/prompt.txt를 쓴다 …
CODEX=$(command -v codex || echo /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex)
"$CODEX" exec --sandbox read-only --ephemeral --color never -C "$(git rev-parse --show-toplevel)" -o "$OUT/gpt.txt" - < "$OUT/prompt.txt"
```

학생 기록 JSON이나 개인정보가 담긴 파일은 GPT에 넘기지 않는다.

## 3. 반박 검증

지적마다 검증자 2명에게 '반박하라'고 맡긴다. 관점은 하나는 과학·교육 정확성, 하나는 코드 실행 경로로 나눈다. 둘 다 인정하면 '확정', 하나만 인정하면 '의견 갈림', 아니면 기각한다. 확신이 없으면 반박 쪽으로 판정하게 한다.

## 4. 기록과 후속 처리

- 결과를 `docs/review-YYYY-MM-DD.md`에 단위별로 남긴다(확정·의견 갈림·기각과 근거).
- 확정 지적은 게임 단위 커밋으로 고친다. 의견 갈림 지적 중 게임 규칙을 바꿔야 하는 것은 사용자 판단으로 넘기고 `docs/PROGRESS.md`의 미결 사항(다음 M번호)에 올린다.
- 고친 뒤에도 같은 방식(Claude 검증자 + GPT)으로 수정분을 확인하고, 내린 결정은 `docs/DECISIONS.md`에 적는다.
