-- Additive upgrade. Existing posts, replies, reactions and demo records stay in place.
begin;

alter table fanplay_private.demo_ticket_posts add column if not exists hidden_at timestamptz;
alter table fanplay_private.demo_ticket_posts add column if not exists photo_thumbnail text;
create index if not exists fanplay_demo_visible_latest on fanplay_private.demo_ticket_posts(created_at desc nulls last,id) where hidden_at is null;
create table if not exists fanplay_private.demo_community_requests (
  owner_hash bytea not null,
  action text not null,
  request_id uuid not null,
  payload_hash bytea not null,
  result_id uuid,
  primary key(owner_hash,action,request_id)
);
create table if not exists fanplay_private.demo_community_limits (
  player_id text not null,
  action text not null,
  window_start timestamptz not null,
  count integer not null,
  primary key(player_id,action)
);
create table if not exists fanplay_private.demo_ticket_reports (
  post_id uuid references fanplay_private.demo_ticket_posts(id) on delete cascade,
  owner_hash bytea,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key(post_id,owner_hash)
);
create table if not exists fanplay_private.demo_moderation_log (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  action text not null,
  reason text not null,
  actor text not null,
  acted_at timestamptz not null default now()
);
alter table fanplay_private.demo_community_requests enable row level security;
alter table fanplay_private.demo_community_limits enable row level security;
alter table fanplay_private.demo_ticket_reports enable row level security;
alter table fanplay_private.demo_moderation_log enable row level security;
revoke all on fanplay_private.demo_community_requests,fanplay_private.demo_community_limits,
  fanplay_private.demo_ticket_reports,fanplay_private.demo_moderation_log from public,anon,authenticated;

create or replace function fanplay_private.demo_actor_hash(p_player_id text,p_browser_key text)
returns bytea language sql immutable set search_path='' as $$
  select case when p_player_id ~ '^[a-z0-9_]{3,24}$' and p_browser_key ~ '^[a-f0-9]{64}$'
    then sha256(convert_to(p_player_id||':'||p_browser_key,'UTF8')) end
$$;

create or replace function fanplay_private.demo_limit(p_player_id text,p_action text,p_max integer)
returns void language plpgsql set search_path='' as $$
declare minute_start timestamptz:=date_trunc('minute',clock_timestamp());
        attempts integer;
begin
  insert into fanplay_private.demo_community_limits as current(player_id,action,window_start,count)
    values(p_player_id,p_action,minute_start,1)
  on conflict(player_id,action) do update set
    count=case when current.window_start=excluded.window_start then current.count+1 else 1 end,
    window_start=excluded.window_start
  returning count into attempts;
  if attempts>p_max then raise sqlstate 'PT429' using message='요청이 많아요. 잠시 뒤 다시 시도해 주세요.'; end if;
end;
$$;

create or replace function public.fanplay_demo_ticket_write_v2(
  p_player_id text,p_browser_key text,p_action text,p_post_id uuid default null,
  p_text text default '',p_ticket jsonb default null,p_liked boolean default null,p_comment_id uuid default null,
  p_request_id uuid default null,p_include_photo boolean default false,p_include_note boolean default false,
  p_thumbnail text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare browser_hash bytea:=fanplay_private.demo_actor_hash(p_player_id,p_browser_key);
        display_name text;
        shared_ticket jsonb;
        clean_text text:=btrim(coalesce(p_text,''));
        payload_hash bytea;
        old_request fanplay_private.demo_community_requests%rowtype;
        written_id uuid:=p_post_id;
        checked_date date;
begin
  if browser_hash is null then raise sqlstate 'PT400' using message='시연용 아이디와 브라우저를 확인해 주세요.'; end if;
  select coalesce(left(nullif(btrim(state->'profile'->>'nickname'),''),24),'야구팬') into display_name
    from fanplay_private.demo_records where player_id=p_player_id;
  if not found then raise sqlstate 'PT401' using message='시연용 아이디로 먼저 시작해 주세요.'; end if;

  if p_action in ('post','comment') and p_request_id is not null then
    payload_hash:=sha256(convert_to(jsonb_build_array(p_post_id,clean_text,p_ticket,p_include_photo,p_include_note,p_thumbnail)::text,'UTF8'));
    insert into fanplay_private.demo_community_requests(owner_hash,action,request_id,payload_hash)
      values(browser_hash,p_action,p_request_id,payload_hash) on conflict do nothing;
    if not found then
      select r.* into old_request from fanplay_private.demo_community_requests r
        where r.owner_hash=browser_hash and r.action=p_action and r.request_id=p_request_id;
      if old_request.payload_hash<>payload_hash then raise sqlstate 'PT409' using message='다른 내용에는 새 게시 요청이 필요해요.'; end if;
      return old_request.result_id;
    end if;
  end if;
  if p_action<>'post' and not exists(select 1 from fanplay_private.demo_ticket_posts p where p.id=p_post_id and p.hidden_at is null) then
    raise sqlstate 'PT404' using message='이 게시글을 찾을 수 없어요.';
  end if;

  if p_action='post' then
    perform fanplay_private.demo_limit(p_player_id,'post',16);
    if p_ticket is null or jsonb_typeof(p_ticket)<>'object' or octet_length(p_ticket::text)>1048576
      or coalesce(p_ticket->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or char_length(btrim(coalesce(p_ticket->>'id',''))) not between 1 and 160
      or char_length(btrim(coalesce(p_ticket->>'home',''))) not between 1 and 40
      or char_length(btrim(coalesce(p_ticket->>'away',''))) not between 1 and 40
      or char_length(clean_text)>300 then raise sqlstate 'PT400' using message='게시할 티켓과 글을 확인해 주세요. 티켓은 1MB까지 올릴 수 있어요.'; end if;
    begin checked_date:=(p_ticket->>'date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise sqlstate 'PT400' using message='경기 날짜가 올바르지 않아요.';
    end;
    select jsonb_object_agg(key,value) into shared_ticket from jsonb_each(p_ticket)
      where key in ('id','date','home','away','hs','as','stadium','mode','theme','color','frameId','backgroundId','stickerIds','badgeId','tag')
        or (key='note' and p_include_note and jsonb_typeof(value)='string')
        or (key='photo' and p_include_photo and jsonb_typeof(value)='string'
          and (p_ticket->>'photo') ~* '^data:image/(jpeg|png|webp);base64,[a-z0-9+/=]+$');
    if not (coalesce(p_include_photo,false) and shared_ticket ? 'photo' and coalesce(octet_length(p_thumbnail),0)<=65536
        and coalesce(p_thumbnail,'') ~* '^data:image/jpeg;base64,[a-z0-9+/=]+$') then p_thumbnail:=null; end if;
    insert into fanplay_private.demo_ticket_posts(player_id,owner_hash,nickname,ticket,message,photo_thumbnail)
      values(p_player_id,browser_hash,display_name,shared_ticket,clean_text,p_thumbnail) returning id into written_id;
  elsif p_action='edit' then
    perform fanplay_private.demo_limit(p_player_id,'edit',30);
    if char_length(clean_text)>300 then raise sqlstate 'PT400' using message='글은 300자까지 적을 수 있어요.'; end if;
    update fanplay_private.demo_ticket_posts set message=clean_text where id=p_post_id and owner_hash=browser_hash and hidden_at is null;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 글을 수정할 수 있어요.'; end if;
  elsif p_action='delete' then
    perform fanplay_private.demo_limit(p_player_id,'edit',30);
    delete from fanplay_private.demo_ticket_posts where id=p_post_id and owner_hash=browser_hash and hidden_at is null;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 글을 삭제할 수 있어요.'; end if;
  elsif p_action='like' and p_liked is not null then
    perform fanplay_private.demo_limit(p_player_id,'like',120);
    if p_liked then insert into fanplay_private.demo_ticket_likes values(p_post_id,browser_hash) on conflict do nothing;
    else delete from fanplay_private.demo_ticket_likes where post_id=p_post_id and owner_hash=browser_hash; end if;
    if not found then return written_id; end if;
  elsif p_action='comment' then
    perform fanplay_private.demo_limit(p_player_id,'comment',40);
    if char_length(clean_text) not between 1 and 200 then raise sqlstate 'PT400' using message='댓글은 1~200자로 적어 주세요.'; end if;
    insert into fanplay_private.demo_ticket_comments(post_id,owner_hash,nickname,message)
      values(p_post_id,browser_hash,display_name,clean_text) returning id into written_id;
  elsif p_action='remove-comment' then
    perform fanplay_private.demo_limit(p_player_id,'comment',40);
    delete from fanplay_private.demo_ticket_comments where id=p_comment_id and post_id=p_post_id and owner_hash=browser_hash;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 댓글을 삭제할 수 있어요.'; end if;
  elsif p_action='report' then
    perform fanplay_private.demo_limit(p_player_id,'report',8);
    if char_length(clean_text) not between 1 and 200 then raise sqlstate 'PT400' using message='신고 사유는 1~200자로 적어 주세요.'; end if;
    insert into fanplay_private.demo_ticket_reports(post_id,owner_hash,reason) values(p_post_id,browser_hash,clean_text)
      on conflict do nothing;
    return written_id;
  else
    raise sqlstate 'PT400' using message='요청 내용을 확인해 주세요.';
  end if;

  if p_action in ('post','comment') and p_request_id is not null then
    update fanplay_private.demo_community_requests r set result_id=written_id
      where r.owner_hash=browser_hash and r.action=p_action and r.request_id=p_request_id;
  end if;
  update public.fanplay_demo_feed_updates set version=version+1 where id=1;
  return written_id;
end;
$$;

-- Previous clients keep their original RPC and visibility consent flow.
create or replace function public.fanplay_demo_ticket_write(
  p_player_id text,p_browser_key text,p_action text,p_post_id uuid default null,
  p_text text default '',p_ticket jsonb default null,p_liked boolean default null,p_comment_id uuid default null)
returns uuid language sql security definer set search_path='' as $$
  select public.fanplay_demo_ticket_write_v2(p_player_id,p_browser_key,p_action,p_post_id,p_text,p_ticket,
    p_liked,p_comment_id,null,true,true)
$$;

create or replace function fanplay_private.demo_comment_rows(p_post_id uuid,p_viewer bytea,p_after_time timestamptz,p_after_id uuid,p_limit integer)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'text',message,'createdAt',created_at,
    'mine',coalesce(owner_hash=p_viewer,false)) order by created_at desc,id),'[]'::jsonb)
  from (
    select c.* from fanplay_private.demo_ticket_comments c where c.post_id=p_post_id and
      (p_after_id is null or c.created_at<p_after_time or (c.created_at=p_after_time and c.id>p_after_id))
    order by c.created_at desc,c.id limit p_limit
  ) page
$$;

create or replace function fanplay_private.demo_feed_rows(p_sort text,p_page integer,p_after_time timestamptz,p_after_id uuid,p_viewer bytea,p_legacy boolean)
returns jsonb language sql stable set search_path='' as $$
 with ids as (
   (select p.id,p.created_at,0::bigint score from fanplay_private.demo_ticket_posts p
     where p_sort='latest' and p.hidden_at is null and
       (p_after_id is null or coalesce(p.created_at,'-infinity')<coalesce(p_after_time,'-infinity')
         or (p.created_at is not distinct from p_after_time and p.id>p_after_id))
     order by p.created_at desc nulls last,p.id
     limit 21 offset (case when p_legacy then greatest(0,least(coalesce(p_page,0),100000))*20 else 0 end))
   union all
   (select p.id,p.created_at,count(*) score from fanplay_private.demo_ticket_posts p
     join fanplay_private.demo_ticket_likes l on l.post_id=p.id where p_sort='likes' and p.hidden_at is null
     group by p.id order by score desc,p.created_at desc nulls last,p.id limit 10)
   union all
   (select p.id,p.created_at,count(*) score from fanplay_private.demo_ticket_posts p
     join fanplay_private.demo_ticket_comments c on c.post_id=p.id where p_sort='comments' and p.hidden_at is null
     group by p.id order by score desc,p.created_at desc nulls last,p.id limit 10)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'text',p.message,
   'createdAt',p.created_at,'ticket',case when p_legacy then p.ticket else p.ticket-'photo' end,
   'thumbnail',case when not p_legacy then p.photo_thumbnail end,'hasPhoto',coalesce(nullif(p.ticket->>'photo',''),'')<>'',
   'mine',coalesce(p.owner_hash=p_viewer,false),'likes',likes.total,'liked',likes.mine,
   'replyCount',(select count(*) from fanplay_private.demo_ticket_comments c where c.post_id=p.id),
   'comments',case when p_legacy then fanplay_private.demo_comment_rows(p.id,p_viewer,null,null,15) else '[]'::jsonb end
 ) order by ids.score desc,p.created_at desc nulls last,p.id),'[]'::jsonb)
 from ids join fanplay_private.demo_ticket_posts p on p.id=ids.id
 cross join lateral (
   select count(*) total,coalesce(bool_or(l.owner_hash=p_viewer),false) mine
   from fanplay_private.demo_ticket_likes l where l.post_id=p.id
 ) likes
$$;

create or replace function public.fanplay_demo_ticket_feed(
  p_sort text default 'latest',p_page integer default 0,p_player_id text default null,p_browser_key text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select fanplay_private.demo_feed_rows(p_sort,p_page,null,null,fanplay_private.demo_actor_hash(p_player_id,p_browser_key),true)
$$;

create or replace function public.fanplay_demo_ticket_feed_v2(
  p_sort text default 'latest',p_after_time timestamptz default null,p_after_id uuid default null,
  p_player_id text default null,p_browser_key text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select fanplay_private.demo_feed_rows(p_sort,0,p_after_time,p_after_id,fanplay_private.demo_actor_hash(p_player_id,p_browser_key),false)
$$;

create or replace function public.fanplay_demo_ticket_comments(
  p_post_id uuid,p_after_time timestamptz default null,p_after_id uuid default null,
  p_player_id text default null,p_browser_key text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from fanplay_private.demo_ticket_posts p where p.id=p_post_id and p.hidden_at is null)
    then fanplay_private.demo_comment_rows(p_post_id,fanplay_private.demo_actor_hash(p_player_id,p_browser_key),p_after_time,p_after_id,16)
    else '[]'::jsonb end
$$;

create or replace function public.fanplay_demo_ticket_photo(p_post_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select p.ticket->>'photo' from fanplay_private.demo_ticket_posts p where p.id=p_post_id and p.hidden_at is null
$$;

create or replace function fanplay_private.demo_moderate(p_post_id uuid,p_action text,p_reason text)
returns void language plpgsql set search_path='' as $$
begin
  if p_action not in ('hide','restore','delete') or char_length(btrim(coalesce(p_reason,''))) not between 1 and 300 then
    raise sqlstate 'PT400' using message='처리 방법과 사유를 입력해 주세요.';
  end if;
  if p_action='delete' then delete from fanplay_private.demo_ticket_posts where id=p_post_id;
  else update fanplay_private.demo_ticket_posts set hidden_at=case when p_action='hide' then now() end where id=p_post_id;
  end if;
  if not found then raise sqlstate 'PT404' using message='이 게시글을 찾을 수 없어요.'; end if;
  insert into fanplay_private.demo_moderation_log(post_id,action,reason,actor) values(p_post_id,p_action,btrim(p_reason),current_user);
  update public.fanplay_demo_feed_updates set version=version+1 where id=1;
end;
$$;

revoke all on function fanplay_private.demo_actor_hash(text,text),fanplay_private.demo_limit(text,text,integer),
  fanplay_private.demo_comment_rows(uuid,bytea,timestamptz,uuid,integer),
  fanplay_private.demo_feed_rows(text,integer,timestamptz,uuid,bytea,boolean),
  fanplay_private.demo_moderate(uuid,text,text) from public,anon,authenticated;
revoke all on function public.fanplay_demo_ticket_write_v2(text,text,text,uuid,text,jsonb,boolean,uuid,uuid,boolean,boolean,text),
  public.fanplay_demo_ticket_feed_v2(text,timestamptz,uuid,text,text),
  public.fanplay_demo_ticket_comments(uuid,timestamptz,uuid,text,text),public.fanplay_demo_ticket_photo(uuid) from public,anon,authenticated;
grant execute on function public.fanplay_demo_ticket_write_v2(text,text,text,uuid,text,jsonb,boolean,uuid,uuid,boolean,boolean,text),
  public.fanplay_demo_ticket_feed_v2(text,timestamptz,uuid,text,text),
  public.fanplay_demo_ticket_comments(uuid,timestamptz,uuid,text,text),public.fanplay_demo_ticket_photo(uuid) to anon;
notify pgrst,'reload schema';
commit;
