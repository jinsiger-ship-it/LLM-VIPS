# 데이터 계약과 저장 정책

## 저장소

정식 키: `fanplay-prototype-v1`. 내부 `schemaVersion: 2`. 키를 바꾸어 이전 FANPLAY 데이터를 버리지 않는다. 이 키가 없을 때만 `diamond-v1`을 대체로 읽는다. 읽기만으로 저장소를 덮어쓰지 않고 다음 성공 저장에 새 키를 작성한다. 기존 diamond-v1 값은 남는다.

루트: tickets 배열, posts 배열, career 객체 또는 null, profile 객체, inventory 객체. profile은 nickname, team, featuredTicketId, selectedTitleId. inventory는 itemIds, titleIds 문자열 ID 배열. 기본 닉네임 야구팬, 기본 팀 neutral.

티켓: id/date/stadium/home/away/hs/as/mode/note/tag/theme/color/photo/frameId/stickerIds. 스타일 classic/scoreboard/photo, 컬러 forest/rose/blue/sand, 프레임 default/steady/star, 스티커 rookie/legend. 점수 정수 0~99, 감상 최대 180자, 태그 30자. 날짜는 YYYY-MM-DD 형식 검사와 브라우저 date 입력 검증을 사용한다. 저장값의 날짜가 달력상 실제 날짜인지까지 별도로 엄밀 검사하지는 않는다.

커리어: name, position, stats(숫자 3개), step(정수 0~8), log 배열. 잘못된 career는 null로 복구하고 정상 티켓은 유지한다. stats는 0~100으로 제한한다. 포수·내야수·외야수는 시작 능력치와 야수 문구를 공유한다.

게시글: id, nickname, text, ticket 사본, liked 불리언, comments 배열. 좋아요 수는 로컬 한 사용자 토글 0/1. 댓글은 nickname/text. 복원 시 댓글 최근 100개만 유지하며 게시글 원본 티켓과 독립적인 사본을 사용한다. 게시 시점 시간이나 다중 사용자 ID는 구현하지 않았다.

## 보상과 결말

| ID | 유형 | 조건 |
| --- | --- | --- |
| rookie | 별 스티커 | 8시즌 완주 공통 |
| steady | 포레스트 프레임 / 칭호 | 종합 평균 65 미만 |
| star | 올스타 프레임 / 칭호 | 종합 평균 65 이상 80 미만 |
| legend | 트로피 스티커 / 칭호 | 종합 평균 80 이상 |

투수 시작 능력치 [45,43,44], 야수 [44,45,43]. 선택별 증가 [1,1,0], [3,3,3], [6,5,6]. 최대 능력치 100. 세 능력치의 반올림 전 평균으로 결말을 계산하며 UI 정수 표시는 반올림한다. 일부 선택에서 항상 높은 증감을 주므로 현재는 전략적 최적화보다 선택·보상 연결 시연에 가까운 규칙이다.

모든 보상 지급은 마지막 시즌 선택과 같은 저장 트랜잭션에서 수행한다. 따라서 저장 실패 시 마지막 시즌도 진행되지 않고 보상만 따로 지급되지 않는다. 배열 includes 검사로 중복을 막는다. 정상 완료 커리어를 복원할 때 누락 보상이 있으면 메모리에서 보충하며 다음 성공 저장으로 영속화한다.

## 이전 Diamond 대응

night → steady, gold → star, trophy → legend. 이는 동일 디자인 복제가 아니라 새 디자인의 대응 보상으로 옮긴 것이다. featured → profile.featuredTicketId. 기존 한국어 자유 문자열 titles는 새 결말 ID와 신뢰할 수 있게 대응할 수 없어 자동 변환하지 않는다. 기존 sticker 단일 필드도 신규 stickerIds로 무작정 옮기지 않는다. 기존 theme의 미지원 값은 classic, 프레임 미지정은 default로 복구한다. 기존 사진은 지원 data 이미지 형식일 때만 읽는다.

## 실패와 입력 처리

transact(change)는 JSON 사본 → 사본 변경 → localStorage.setItem → 전역 교체 순서다. 오류 시 false와 안내를 반환하고 전역 상태는 이전 값 그대로 남는다. 티켓 삭제·수정·게시·댓글·좋아요·프로필·대표·게임에서 같은 함수를 사용한다. 입력 문자열은 HTML 출력 시 이스케이프한다. 사진은 JPEG/PNG/WebP MIME, 입력 최대 12MB, 읽기 가능 여부를 검사하며 긴 변 900px와 JPEG 품질 .68로 변환한다. 복원 시 지원 data URL과 크기를 검사하며 외부 주소를 허용하지 않는다.

동시 탭 편집 충돌 병합, 저장소 전체 백업/가져오기 UI, 이전 FANPLAY 원본의 알려지지 않은 필드 변환은 구현하지 않았다. 원본 ZIP이 없어 구체적 필드 차이는 검증할 수 없다.
