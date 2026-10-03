---
name: deploy
description: 생명 오락실을 Netlify 학생용 주소(https://bio-arcade-f5u1.netlify.app)에 다시 배포한다. 게임을 추가하거나 고쳐 커밋한 뒤 학생에게 새 판을 보여 줄 때, "배포해줘", "사이트에 올려줘", "Netlify 갱신" 요청에 쓴다. 학생이 쓰는 공개 사이트를 바꾸므로 사용자의 확인을 받은 뒤에만 실행한다.
---

# Netlify 배포 절차

사이트: `bio-arcade-f5u1`(팀 `yurowa90`, 사이트 ID `69ce0fdc-ece2-4493-8b77-f0e2a255e0a3`). GitHub Pages 대신 Netlify를 쓰는 까닭은 `docs/DECISIONS.md` D-039에 있다. 올리는 파일은 학생용 파일(`index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `shared/`, `games/`)뿐이고 문서·테스트·에이전트 설정은 올리지 않는다.

## 1. 사용자 확인 (반드시 먼저)

공개 사이트를 바꾸는 일이다. 아래를 사용자에게 알리고 분명한 허락을 받은 뒤에 2단계로 간다. 허락이 없으면 멈춘다.

- 올릴 커밋(`git log --oneline -1`)과 지난 배포 커밋(`docs/PROGRESS.md` 상태 스냅샷) 사이에 바뀐 게임
- 마지막 검증 결과. `/arcade-verify`(또는 `test-runner`)를 이 커밋에서 돌리지 않았으면 먼저 돌린다

커밋하지 않은 변경이 있으면 배포하지 않는다. 배포는 커밋한 상태(`HEAD`)만 올린다.

## 2. 올리기 전 확인

- 파일을 더하거나 지웠으면 `sw.js`의 `FILES`가 맞는지 본다(`docs/DEVELOPMENT.md` 7절). 오래된 캐시가 남지 않게 하려면 `CACHE` 이름의 번호를 올린다. 둘 다 코드 수정이므로 커밋한 뒤 1단계부터 다시 한다.

## 3. 배포용 폴더 만들기

```bash
D=/tmp/bio-arcade-site-$(git rev-parse --short HEAD); mkdir -p "$D" && git archive HEAD index.html manifest.webmanifest sw.js icons shared games | tar -x -C "$D"
printf '[build]\n  publish = "."\n  command = ""\n' > "$D/netlify.toml"
rg -n -i "github|yurowa|yurosung|gmail" "$D"   # 아무것도 나오지 않아야 한다
```

계정 이름이 나오면 배포하지 않고 사용자에게 알린다(D-039: 배포 파일에서 계정 이름을 뺀다).

## 4. 올리기

Netlify 연결(MCP)의 `deploy-site`를 사이트 ID로 부르면 `npx -y @netlify/mcp@latest --site-id … --proxy-path …` 명령을 준다. 이 명령을 **배포용 폴더 안에서** 실행한다. `--proxy-path`에는 인증 정보가 들어 있으니 문서·커밋·보고에 남기지 않는다.

## 5. 배포 뒤 확인

- 허브와 게임 페이지가 모두 200으로 열린다.
- http가 https로 넘어간다.
- 서비스 워커가 등록되고, 오프라인 새로고침에서 허브와 탐사대가 열린다.
- 페이지에 계정 이름이 없다.

## 6. 기록

`docs/PROGRESS.md` 상태 스냅샷의 '커밋 … 기준 배포'와 최근 작업 기록을 고친다(`/handoff`).
