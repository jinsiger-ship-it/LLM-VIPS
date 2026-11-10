# FANPLAY

[모바일 사이트 열기](https://jinsiger-ship-it.github.io/LLM-VIPS/)

야구 관람 티켓을 만들고 수집하며 선수 커리어 게임을 즐기는 모바일 웹앱입니다. GitHub Pages에서 만든 기록은 브라우저에 저장됩니다.

같은 브라우저의 이전 FANPLAY 기록은 첫 실행에 읽어옵니다. 이후 메인과 보관본의 기록은 별도로 저장됩니다.

## 파일 구성

- `index.html` · 모바일 사이트 진입점
- `pages/`, `js/`, `css/` · 보관 화면, JavaScript, 스타일
- `docs/`, `tests/` · 개발 문서와 자동 검사
- `data/kbo/` · 추후 KBO 기록 파일을 둘 자리
- `database/` · 로컬 계정 데이터베이스 위치와 운영 안내

## 로컬 계정 실행

Node.js 24 이상으로 저장소 폴더에서 `node server.cjs`를 실행합니다. [로컬 마이페이지](http://127.0.0.1:8080/#profile)에서 회원가입과 로그인을 사용할 수 있습니다. 비회원 기록은 브라우저에, 로그인 후 저장한 티켓과 게임 기록은 로컬 SQLite DB에 보관합니다.

`node tests/integration.cjs`, `node tests/screens.cjs`, `node tests/accounts.cjs`로 검사할 수 있습니다. 실제 SQLite 파일은 Git과 Pages 배포 대상에서 제외됩니다. [DB 안내](database/README.md)

## 보관본

- [기존 v1.1 화면](pages/fanplay-v1.1/index.html) · [10주차 와이어프레임](pages/wireframe/10week_wireframe.html)
- [11월 6일 FANPLAY](snapshots/2026-11-06-fanplay/) · [11월 10일 모바일](snapshots/2026-11-10-fanplay-mobile/)
- [11월 2일 Diamond Memories](snapshots/2026-11-02-diamond-memories/)
