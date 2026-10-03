#!/bin/bash
# SessionStart 훅(compact·resume): 압축이나 재개 직후 저장소의 실제 상태를 맥락에 넣는다.
# docs/PROGRESS.md는 CLAUDE.md가 가져오므로 여기서는 git 상태만 보탠다.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
echo "## 저장소 실제 상태 (SessionStart 훅, $(date '+%Y-%m-%d %H:%M'))"
echo "- 브랜치: $(git status -sb | head -1 | sed 's/^## //')"
echo "- 최근 커밋:"
git log --oneline -5 | sed 's/^/  - /'
changes=$(git status --porcelain)
if [ -n "$changes" ]; then
  echo "- 커밋하지 않은 변경:"
  echo "$changes" | sed 's/^/  - /'
else
  echo "- 커밋하지 않은 변경: 없음"
fi
echo "- 이어서 작업하기 전에: HEAD 커밋이나 push 여부가 docs/PROGRESS.md의 상태 스냅샷과 다르면 PROGRESS.md부터 고친다. 커밋하지 않은 변경은 진행 중인 일로 보고, 그 일이 PROGRESS.md의 다음 할 일(T번호)에 있는지 확인한다. 결정의 근거는 docs/DECISIONS.md(D번호)에 있다."
exit 0
