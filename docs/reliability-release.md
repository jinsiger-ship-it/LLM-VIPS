# FANPLAY v0.10.0 운영 적용

공개 앱과 운영 Supabase는 별도로 배포한다. 새 SQL은 기존 `fanplay_private.demo_records`, 게시물, 댓글, 좋아요에 대한 정리나 초기화를 수행하지 않는다. 운영 프로젝트에서 SQL 전체를 순서대로 한 번씩 실행한다.

1. [커뮤니티 안정성 SQL](../supabase/migrations/2026112501_community_reliability.sql)을 실행한다. 기존 RPC 주소는 유지된다. 이전 앱도 같은 글을 읽고 게시할 수 있으며, 새 게시와 댓글은 개인 저장 버전을 바꾸지 않는다.
2. [선수 랭킹 SQL](../supabase/migrations/2026112502_career_rankings.sql)을 실행한다. 등재를 선택한 은퇴 선수만 등록하며, 개인 저장과 시연 아이디는 공개 목록에 포함하지 않는다.
3. SQL Editor에서 다음 두 조회가 JSON 배열을 반환하는지 확인한다. 빈 배열도 정상이다.

```sql
select public.fanplay_demo_ticket_feed_v2('latest');
select public.fanplay_demo_career_rankings('투수');
```

SQL 적용 전 공개 앱은 이전 커뮤니티 RPC를 사용한다. 이 기간에는 기존 게시·좋아요·댓글을 이용할 수 있고, 커서 페이지 이동·이전 댓글·요청 재전송 중복 방지·선수 랭킹은 각 SQL을 적용한 뒤 사용할 수 있다. 새 페이지에서 사진과 메모는 각각 선택하며, 구형 브라우저에서 보는 이미 공개된 게시물의 공개 범위는 유지된다.

## 운영자 게시 관리

공유 아이디로 로그인하는 참가자에게 운영 권한을 부여하지 않는다. 프로젝트 운영자가 SQL Editor에서 `fanplay_private.demo_ticket_reports`의 신고를 확인하고, 사유와 함께 아래 함수를 호출한다. 우선 `hide`를 사용하면 피드·댓글·원본 사진 조회에서 모두 숨길 수 있고, `restore`로 다시 공개할 수 있다. `delete`는 해당 게시물의 반응과 댓글까지 영구 삭제한다. 모든 운영자 조작은 `fanplay_private.demo_moderation_log`에 남는다.

```sql
select post_id, reason, created_at
from fanplay_private.demo_ticket_reports
order by created_at desc;

select fanplay_private.demo_moderate('<확인한 게시물 UUID>', 'hide', '처리 사유');
```

선수 랭킹의 ERA와 타율은 은퇴 시 보관된 경기 기록으로 서버가 계산한다. 시연용 공유 아이디는 실제 본인 인증이나 부정 경쟁 방지용 계정이 아니다. 등록한 기록은 공개 시점 스냅샷이며, 다시 등록하거나 직접 취소하면 반영된다.

## 돌아가기

공개 배포 장애가 있으면 원인을 확인하고, 필요한 경우 앱 변경 PR의 병합 커밋을 되돌려 직전 Pages 버전을 다시 배포한다. 운영 SQL을 초기화하거나 테이블을 지울 필요는 없다. 이전 앱의 RPC도 다시 확인하고, 새 앱을 복구한 뒤 동일 아이디의 기록과 게시물·댓글이 모두 유지되는지 검사한다.

로컬 테스트는 Node 24에서 `npm ci`, `npm test`, Chromium 설치 후 `npm run test:browser` 순서로 실행한다. 테스트 DB는 메모리에만 생성한다.
