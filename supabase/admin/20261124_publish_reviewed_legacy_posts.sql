-- 운영자용. 먼저 결과를 검토하고 공개에 동의한 기존 게시물의 아이디만 입력하세요.
-- 기존 게시물은 작성 시각과 브라우저 소유권을 추측하지 않습니다.
select d.player_id, p->>'id' as post_id, p->>'nickname' as nickname,
  p->>'text' as message, p->'ticket'->>'mode' as ticket_type,
  coalesce(p->'ticket'->>'photo','') <> '' as has_photo
from fanplay_private.demo_records d
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(d.state->'posts')='array' then d.state->'posts' else '[]'::jsonb end
) p;

-- 아래 빈 배열에 { "player_id": "...", "post_id": "..." } 항목을 추가한 뒤,
-- INSERT 문만 실행합니다. 기본 배열은 비어 있으므로 공개되는 글이 없습니다.
-- 이전 공개 범위가 불명확한 사진·메모는 제외합니다.
with approved as (
  select * from jsonb_to_recordset('[]'::jsonb) as ids(player_id text, post_id text)
), selected as (
  select a.player_id,a.post_id,p
  from approved a join fanplay_private.demo_records d using(player_id)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(d.state->'posts')='array' then d.state->'posts' else '[]'::jsonb end
  ) p
  where p->>'id'=a.post_id
)
insert into fanplay_private.demo_ticket_posts(legacy_player_id,legacy_post_id,nickname,ticket,message,created_at)
select player_id,post_id,left(coalesce(nullif(btrim(p->>'nickname'),''),'야구팬'),24),
  (
    select jsonb_object_agg(key,value) from jsonb_each(p->'ticket')
    where key in ('id','date','home','away','hs','as','stadium','mode','theme','color','frameId','backgroundId','stickerIds','badgeId','tag')
  ),
  left(coalesce(p->>'text',''),300),null
from selected
where jsonb_typeof(p->'ticket')='object'
  and (p->'ticket') ?& array['id','date','home','away']
on conflict (legacy_player_id,legacy_post_id) do nothing;
