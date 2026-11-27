-- Passwordless classroom demo. Shared IDs load game data, while browser-generated
-- secrets independently determine which public posts and comments can be edited.
begin;

create table if not exists fanplay_private.demo_ticket_posts (
  id uuid primary key default gen_random_uuid(),
  player_id text,
  owner_hash bytea,
  legacy_player_id text,
  legacy_post_id text,
  nickname text not null,
  ticket jsonb not null check (jsonb_typeof(ticket)='object' and octet_length(ticket::text)<=1048576),
  message text not null check (char_length(message)<=300),
  created_at timestamptz default now(),
  unique (legacy_player_id,legacy_post_id)
);
create table if not exists fanplay_private.demo_ticket_likes (
  post_id uuid references fanplay_private.demo_ticket_posts(id) on delete cascade,
  owner_hash bytea,
  primary key(post_id,owner_hash)
);
create table if not exists fanplay_private.demo_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references fanplay_private.demo_ticket_posts(id) on delete cascade,
  owner_hash bytea not null,
  nickname text not null,
  message text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists fanplay_demo_comments_recent on fanplay_private.demo_ticket_comments(post_id,created_at desc,id);
create index if not exists fanplay_demo_posts_recent on fanplay_private.demo_ticket_posts(created_at desc nulls last,id);
alter table fanplay_private.demo_ticket_posts enable row level security;
alter table fanplay_private.demo_ticket_likes enable row level security;
alter table fanplay_private.demo_ticket_comments enable row level security;
revoke all on fanplay_private.demo_ticket_posts,fanplay_private.demo_ticket_likes,fanplay_private.demo_ticket_comments
  from public,anon,authenticated;

create table if not exists public.fanplay_demo_feed_updates (
  id integer primary key check (id=1),
  version bigint not null default 0
);
insert into public.fanplay_demo_feed_updates(id) values(1) on conflict do nothing;
alter table public.fanplay_demo_feed_updates enable row level security;
revoke all on public.fanplay_demo_feed_updates from public,anon,authenticated;
grant select on public.fanplay_demo_feed_updates to anon;
drop policy if exists fanplay_demo_feed_updates_read on public.fanplay_demo_feed_updates;
create policy fanplay_demo_feed_updates_read on public.fanplay_demo_feed_updates for select to anon using (id=1);
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename='fanplay_demo_feed_updates') then
    alter publication supabase_realtime add table public.fanplay_demo_feed_updates;
  end if;
end;
$$;

create or replace function public.fanplay_demo_join(p_player_id text, p_team text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$' then
    raise sqlstate 'PT400' using message='시연용 아이디를 확인해 주세요.';
  end if;
  if p_team is null or p_team not in ('neutral','LG','KT','SSG','NC','두산','KIA','롯데','삼성','한화','키움') then
    raise sqlstate 'PT400' using message='응원팀을 확인해 주세요.';
  end if;
  -- A theme chosen on entry applies only to a new ID.
  insert into fanplay_private.demo_records(player_id,state)
    values (p_player_id,jsonb_build_object('profile',jsonb_build_object('team',p_team)))
    on conflict (player_id) do nothing;
  return public.fanplay_demo_open(p_player_id);
end;
$$;

create or replace function public.fanplay_demo_ticket_feed(
  p_sort text default 'latest', p_page integer default 0,
  p_player_id text default null, p_browser_key text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with viewer as (
    select case when p_player_id ~ '^[a-z0-9_]{3,24}$' and p_browser_key ~ '^[a-f0-9]{64}$'
      then sha256(convert_to(p_player_id||':'||p_browser_key,'UTF8')) end as browser_hash
  ), like_totals as (
    select post_id,count(*) as total,bool_or(owner_hash=viewer.browser_hash) as liked
    from fanplay_private.demo_ticket_likes cross join viewer group by post_id
  ), comment_totals as (
    select post_id,count(*) as total from fanplay_private.demo_ticket_comments group by post_id
  ), candidates as (
    select p.*,coalesce(l.total,0) as likes,coalesce(c.total,0) as replies,coalesce(l.liked,false) as liked,
      case p_sort when 'likes' then coalesce(l.total,0) when 'comments' then coalesce(c.total,0) else 0 end as score
    from fanplay_private.demo_ticket_posts p left join like_totals l on l.post_id=p.id
    left join comment_totals c on c.post_id=p.id
    where p_sort='latest' or (p_sort='likes' and l.total>0) or (p_sort='comments' and c.total>0)
    order by score desc,p.created_at desc nulls last,p.id
    limit (case when p_sort='latest' then 21 else 10 end)
    offset (case when p_sort='latest' then greatest(0,least(coalesce(p_page,0),100000))*20 else 0 end)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'nickname',p.nickname,'text',p.message,'ticket',p.ticket,'likes',p.likes,'createdAt',p.created_at,
    'replyCount',p.replies,'liked',p.liked,'mine',coalesce(p.owner_hash=viewer.browser_hash,false),
    'comments',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'nickname',c.nickname,'text',c.message,
        'mine',coalesce(c.owner_hash=viewer.browser_hash,false)) order by c.created_at,c.id)
      from (select id,owner_hash,nickname,message,created_at from fanplay_private.demo_ticket_comments
        where post_id=p.id order by created_at desc,id limit 15) c
    ),'[]'::jsonb)
  ) order by p.score desc,p.created_at desc nulls last,p.id),'[]'::jsonb) from candidates p cross join viewer;
$$;

create or replace function public.fanplay_demo_ticket_write(
  p_player_id text, p_browser_key text, p_action text,
  p_post_id uuid default null, p_text text default '', p_ticket jsonb default null,
  p_liked boolean default null, p_comment_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare browser_hash bytea;
        display_name text;
        shared_ticket jsonb;
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$'
    or p_browser_key is null or p_browser_key !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message='시연용 아이디와 브라우저를 확인해 주세요.';
  end if;
  select left(nullif(btrim(state->'profile'->>'nickname'),''),24) into display_name
    from fanplay_private.demo_records where player_id=p_player_id;
  if not found then raise sqlstate 'PT401' using message='시연용 아이디로 먼저 시작해 주세요.'; end if;
  display_name := coalesce(display_name,'야구팬');
  browser_hash := sha256(convert_to(p_player_id||':'||p_browser_key,'UTF8'));
  if p_action='post' then
    if p_ticket is null or jsonb_typeof(p_ticket)<>'object' or octet_length(p_ticket::text)>1048576
      or coalesce(p_ticket->>'id','')=''
      or coalesce(p_ticket->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(p_ticket->>'home','')='' or coalesce(p_ticket->>'away','')='' then
      raise sqlstate 'PT400' using message='게시할 티켓을 확인해 주세요. 사진을 포함해 1MB까지 게시할 수 있어요.';
    end if;
    select jsonb_object_agg(key,value) into shared_ticket from jsonb_each(p_ticket)
    where key in ('id','date','home','away','hs','as','stadium','mode','theme','color','photo','note',
      'frameId','backgroundId','stickerIds','badgeId','tag');
    insert into fanplay_private.demo_ticket_posts(player_id,owner_hash,nickname,ticket,message)
    values (p_player_id,browser_hash,display_name,shared_ticket,coalesce(btrim(p_text),'')) returning id into p_post_id;
  elsif p_action='delete' then
    delete from fanplay_private.demo_ticket_posts where id=p_post_id and owner_hash=browser_hash;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 글을 삭제할 수 있어요.'; end if;
  elsif p_action='edit' then
    update fanplay_private.demo_ticket_posts set message=coalesce(btrim(p_text),'') where id=p_post_id and owner_hash=browser_hash;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 글을 수정할 수 있어요.'; end if;
  elsif p_action='like' and p_liked is not null then
    if p_liked then
      insert into fanplay_private.demo_ticket_likes values(p_post_id,browser_hash) on conflict do nothing;
    else
      delete from fanplay_private.demo_ticket_likes where post_id=p_post_id and owner_hash=browser_hash;
    end if;
  elsif p_action='comment' and nullif(btrim(p_text),'') is not null then
    insert into fanplay_private.demo_ticket_comments(post_id,owner_hash,nickname,message)
    values(p_post_id,browser_hash,display_name,btrim(p_text));
  elsif p_action='remove-comment' then
    delete from fanplay_private.demo_ticket_comments where id=p_comment_id and post_id=p_post_id and owner_hash=browser_hash;
    if not found then raise sqlstate 'PT403' using message='처음 작성한 브라우저에서만 댓글을 삭제할 수 있어요.'; end if;
  else
    raise sqlstate 'PT400' using message='요청 내용을 확인해 주세요.';
  end if;
  -- Keep the shared ID's own posting history. Never copy other IDs' posts,
  -- reaction data, photos already in the feed, or browser credentials into it.
  if p_action in ('post','edit','delete') then
    update fanplay_private.demo_records d set state=jsonb_set(d.state,'{posts}',
      coalesce((
        select jsonb_agg(entry) from jsonb_array_elements(
          case when jsonb_typeof(d.state->'posts')='array' then d.state->'posts' else '[]'::jsonb end
        ) entry where entry->>'id' is distinct from p_post_id::text
      ),'[]'::jsonb) || coalesce((
        select jsonb_build_array(jsonb_build_object('id',id,'nickname',nickname,'text',message,'ticket',ticket-'photo',
          'createdAt',created_at))
        from fanplay_private.demo_ticket_posts where id=p_post_id and owner_hash=browser_hash
      ),'[]'::jsonb)),revision=revision+1,updated_at=now() where d.player_id=p_player_id;
  end if;
  update public.fanplay_demo_feed_updates set version=version+1 where id=1;
  return p_post_id;
end;
$$;

revoke all on function public.fanplay_demo_join(text,text), public.fanplay_demo_ticket_feed(text,integer,text,text),
  public.fanplay_demo_ticket_write(text,text,text,uuid,text,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.fanplay_demo_join(text,text), public.fanplay_demo_ticket_feed(text,integer,text,text),
  public.fanplay_demo_ticket_write(text,text,text,uuid,text,jsonb,boolean,uuid) to anon;
notify pgrst, 'reload schema';
commit;
