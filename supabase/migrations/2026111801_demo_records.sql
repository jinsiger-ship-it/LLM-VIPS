-- FANPLAY 과제용 공유 기록. 아이디를 아는 누구나 조회·수정 가능 (본인 인증 아님).
-- Supabase SQL Editor에서 전체를 실행하세요. 기존 기록을 삭제하지 않습니다.
begin;
create schema if not exists fanplay_private;
revoke all on schema fanplay_private from public, anon, authenticated;
create table if not exists fanplay_private.demo_records (
  player_id text primary key check (player_id ~ '^[a-z0-9_]{3,24}$'),
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint demo_state_size check (octet_length(state::text) <= 5242880),
  constraint demo_state_object check (jsonb_typeof(state) = 'object')
);
alter table fanplay_private.demo_records enable row level security;
revoke all on fanplay_private.demo_records from public, anon, authenticated;

create or replace function public.fanplay_demo_status()
returns jsonb language sql security invoker set search_path = ''
as $$ select jsonb_build_object('ready',true,'version',1); $$;

-- 목록 조회와 임의 SQL은 제공하지 않습니다. 지정한 아이디 한 개만 반환합니다.
create or replace function public.fanplay_demo_open(p_player_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r fanplay_private.demo_records%rowtype;
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$' then
    raise sqlstate 'PT400' using message = '아이디는 소문자·숫자·밑줄 3~24자로 입력해 주세요.';
  end if;
  insert into fanplay_private.demo_records(player_id) values(p_player_id)
    on conflict(player_id) do nothing;
  select * into r from fanplay_private.demo_records where player_id=p_player_id;
  return jsonb_build_object('username',r.player_id,'state',r.state,'revision',r.revision,'updated_at',r.updated_at);
end;
$$;

create or replace function public.fanplay_demo_save(p_player_id text, p_revision integer, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r fanplay_private.demo_records%rowtype;
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$' or p_revision is null or p_revision<0 then
    raise sqlstate 'PT400' using message='아이디와 저장 버전을 확인해 주세요.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text)>5242880 then
    raise sqlstate 'PT413' using message='기록은 5MB 이하로 저장해 주세요. 사진 수를 줄일 수 있어요.';
  end if;
  update fanplay_private.demo_records
    set state=p_state,revision=revision+1,updated_at=now()
    where player_id=p_player_id and revision=p_revision returning * into r;
  if not found then
    raise sqlstate 'PT409' using message='다른 기기에서 기록이 바뀌었어요. 현재 기록을 내려받은 뒤 온라인 기록을 다시 불러와 주세요.';
  end if;
  return jsonb_build_object('username',r.player_id,'state',r.state,'revision',r.revision,'updated_at',r.updated_at);
end;
$$;

revoke all on function public.fanplay_demo_status() from public,anon,authenticated;
revoke all on function public.fanplay_demo_open(text) from public,anon,authenticated;
revoke all on function public.fanplay_demo_save(text,integer,jsonb) from public,anon,authenticated;
grant usage on schema public to anon;
grant execute on function public.fanplay_demo_status() to anon;
grant execute on function public.fanplay_demo_open(text) to anon;
grant execute on function public.fanplay_demo_save(text,integer,jsonb) to anon;
notify pgrst, 'reload schema';
commit;
