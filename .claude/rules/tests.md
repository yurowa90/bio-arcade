---
paths:
  - "tests/**"
---

# 테스트 작업 규칙

- 늘 통과하는 검사를 만들지 않는다. 새 단언은 수정 전 코드에서 실패하고 수정 뒤에 통과하는지 확인한다.
- E2E는 화면 오류나 실패 판정이 있으면 종료 코드 1로 끝나야 한다. 판정 함수는 파일마다 인자 순서가 다르다. `arcade-e2e.js`는 `check(ok, msg)`(실패를 `failures`에 쌓고 끝에서 종료 코드 1), `quest-e2e.js`는 `check(name, cond, extra)`(실패하면 `FAIL` 줄과 종료 코드 1)를 쓴다.
- E2E는 `require(process.env.PW || 'playwright')`로 Playwright를 찾는다. 이 맥에서는 `PW="$HOME/.cache/bio-arcade-tools/node_modules/playwright"`를 명령마다 붙인다.
- 스크린샷 폴더는 저장소 밖으로 준다.
- 테스트 입력의 학번·이름은 가상 값(예: 20315, '테스트')만 쓴다.
