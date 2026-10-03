# 진행 상황

최종 갱신: 2026-10-03 · 이 파일은 `CLAUDE.md`가 가져오므로 세션 시작 때마다 맥락에 들어간다. 60줄 안팎으로 유지하고, 지난 내용은 `docs/DECISIONS.md`나 git 기록으로 옮긴다.
번호 규칙: 다음 할 일은 T, 미결 사항은 M. 항목을 지워도 남은 번호는 바꾸지 않고, 새 항목은 다음 번호를 쓴다(다음 번호: T7, M9).

## 상태 스냅샷

- 게임 6종(생명 탐사대, 멘델의 텃밭, 가계도 지뢰찾기, 염기쌍 팡, 에너지 런, 혈당 지키기)과 허브가 동작한다.
- 학생용 주소: https://bio-arcade-f5u1.netlify.app (Netlify, 커밋 bdc2c28 기준 배포). 다시 배포하는 절차는 `/deploy` 스킬(사용자 확인 뒤).
- 마지막 전체 검증(2026-10-03, 커밋 071c3a3): 문법 검사 통과, `quest-logic` 75 PASS, `quest-e2e` 전 항목 OK, `arcade-e2e` 통과(errors·failures none, 확인 창 4번). 탐사대 도감은 19종이다.
- 교차 검토 지적 65건(확정 53, 의견 갈림 12) 가운데 확정 지적은 모두 고쳤고, 의견 갈림 지적은 고치거나 결정으로 정리했다(`docs/DECISIONS.md`).

## 다음 할 일

- **T6 (진행 중) 혈액 순환 일주 구현(D-041~D-047).** 1단계 규칙 모듈 커밋(690a22c), 설계 갱신(3afff80). 2단계는 Sol이 마쳤고 **미커밋**이다(circulation.js·game.js·index.html·circulation-logic.js·arcade-e2e.js·shared/arcade.js·sw.js, 보고: `/private/tmp/claude-501/circ-impl/gpt/screen-report.json`). Sol 보고 circulation-logic PASS 42. Claude가 arcade-e2e를 돌려 통과(errors·failures none, circulation 별 3, 가로 넘침 없음). 다음: Opus 2명 독립 검토(화면·계약 / 과학·문구) → 지적 수정 → README·DEVELOPMENT·rules(minigames paths)·arcade-verify 반영 → `/arcade-verify` → 커밋 → Netlify 재배포(교사 확인 뒤).
- **T2 실기기 확인.** 아이폰 Safari와 안드로이드 Chrome에서 허브 확인 창, PWA 설치·오프라인 실행, 입력칸 자동 확대를 본다. 교사가 시간이 날 때 한다(2026-10-03 보류).

## 교사 판단이 필요한 미결 사항

- 지금은 없다. M1~M8은 2026-10-03에 모두 결정했다(D-031~D-038).

## 알려진 한계

- 가계도 토스트만 글자당 80ms이고 표시 시간 상한이 없다(다른 미니게임은 글자당 70ms, 최대 6초).
- '설명해 보기' 답은 미니게임에서는 '다시 하기'·'오락실로', 탐사대에서는 결과 화면의 버튼을 누를 때 저장된다. 그 전에 탭을 닫으면 잃는다.

## 최근 작업 기록 (최신 순, 5개까지)

- 2026-10-03 T6 1단계: 혈액 순환 일주 규칙 모듈·Node 테스트(690a22c). Astra 구현 → Opus 2명 검토(high 0) → Sol 수정 → 재검토 통과. 교사 결정 D-047(개수 숨김 범위, 정의 문구).
- 2026-10-03 설정 구조 재정리(D-046, d9f30e3): CLAUDE.md 60→38줄·AGENTS.md 80→53줄, `/deploy` 스킬, `test-runner` 서브에이전트, `guard-bash.sh` 훅(push 확인·`git add .` 금지·Codex 샌드박스 강제), 읽기 전용 허용 목록. 작업 분담은 전역 `~/.claude/CLAUDE.md`에도 넣었다(일반 절차는 홈 스킬 `/codex-orchestrate`).
- 2026-10-03 T4 설계 확정: 혈액 순환 일주(설계안 3개 → Claude·GPT 심사 → 종합 → GPT·Claude 재검토 13건 반영 → 교사 결정 8개, D-041~D-044).
- 2026-10-03 Netlify 첫 배포(bio-arcade-f5u1, https·오프라인 확인).
- 2026-10-03 교사 결정 M1~M8·T3(Netlify) 확정(D-031~D-039), GPT 호출 기본값(D-040). M1·M2 구현(c18de9d), M8과 배포 파일 계정 이름 제거(071c3a3).

## 이 문서를 고치는 때

작업 단위를 마쳤을 때, 커밋하거나 push했을 때, 미결 사항이 생기거나 풀렸을 때, 세션을 끝내기 전에 고친다. 절차는 `/handoff` 스킬에 있다.
