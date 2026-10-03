#!/bin/bash
# PreToolUse 훅(Bash): 문서로 부탁해서는 지켜지지 않을 수 있는 규칙을 실행 전에 막는다(D-046).
#   git push            → ask  (사용자 확인을 받게 한다)
#   git add . / -A / --all → deny
#   codex exec          → 샌드박스(read-only·workspace-write)를 명시하지 않았거나 danger-full-access면 deny
# 그 밖의 명령은 아무것도 출력하지 않고 통과시킨다. jq가 없거나 입력을 못 읽으면 통과시킨다(막지 못할 뿐 일을 멈추지 않는다).

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0

# 판단에 쓸 문자열을 만든다. 줄 이음(\+줄바꿈)을 잇고, heredoc 본문과 커밋 메시지(-m "…")를 지운다.
# 커밋 메시지나 GPT 지시문 안에 'git add .' 같은 글자가 들어 있어도 막지 않기 위해서다.
read -r -d '' STRIP <<'JQ'
gsub("\\\\\n"; " ")
| gsub("<<-?[ \t]*[\"']?(?<t>[A-Za-z_][A-Za-z0-9_]*)[\"']?[^\n]*\n(?:[\\s\\S]*?\n)?[ \t]*\\k<t>(?=\n|\\z)"; "<<DOC")
| gsub("(?<p>[ \t])(?<f>-[A-Za-z]*m|--message)(?<s>=|[ \t]+)(?:\"(?:[^\"\\\\]|\\\\[\\s\\S])*\"|'[^']*')"; "\(.p)\(.f)\(.s)MSG")
JQ
code=$(printf '%s' "$cmd" | jq -Rrs "$STRIP" 2>/dev/null) || code=$cmd

has() { printf '%s\n' "$code" | grep -Eq -- "$1"; }

# 명령 머리: 줄 처음이나 ; & | ( 공백 뒤의 git. 'git -C 경로 push'처럼 전역 옵션이 앞에 와도 잡는다.
GIT='(^|[;&|({[:space:]])git([[:space:]]+(-[Cc][[:space:]]+[^[:space:];&|]+|-[^[:space:];&|]+))*[[:space:]]+'
END='([[:space:];&|)]|$)'

decision=""; reason=""

if has "${GIT}add([[:space:]]+[^;&|]*)?[[:space:]][\"']?(\\.|\\./|-A|--all|-[a-zA-Z]*A[a-zA-Z]*)[\"']?${END}"; then
  decision="deny"
  reason="변경 파일을 명시해 스테이징한다. git add . / -A / --all은 쓰지 않는다(AGENTS.md)."
fi

# codex exec: 이름이 codex로 끝나는 실행 파일, 또는 codex 경로를 담은 변수("$CODEX" exec)
if [ -z "$decision" ] && printf '%s' "$code" | grep -qi codex \
  && has "(^|[;&|({[:space:]])(\"?[^[:space:];&|\"']*/)?codex\"?[[:space:]]+([^;&|]*[[:space:]])?exec${END}|(^|[;&|({[:space:]])\"?\\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?\"?[[:space:]]+exec${END}" \
  && ! has '(^|[[:space:]])(-h|--help)([[:space:]]|$)'; then
  if has 'danger-full-access|dangerously-bypass-approvals-and-sandbox' \
     || ! has "(^|[[:space:]])(--sandbox([[:space:]]+|=)|-s[[:space:]]*|-c[[:space:]]+[\"']?sandbox_mode=)[\"']*(read-only|workspace-write)"; then
    decision="deny"
    reason="사용자의 Codex 기본값이 danger-full-access라 샌드박스를 명시한다(--sandbox read-only 또는 workspace-write)."
  fi
fi

if [ -z "$decision" ] && has "${GIT}push${END}"; then
  decision="ask"
  reason="push는 사용자가 요청할 때만 한다(AGENTS.md)."
fi

[ -n "$decision" ] || exit 0
jq -n --arg d "$decision" --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
exit 0
