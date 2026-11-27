-- Keep legacy login available for old clients without creating a record.
begin;

create or replace function public.fanplay_demo_open(p_player_id text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select public.fanplay_demo_resume(p_player_id);
$$;

create or replace function public.fanplay_demo_join(p_player_id text, p_team text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  id text := lower(btrim(p_player_id));
  new_record fanplay_private.demo_records%rowtype;
begin
  if id is null or id !~ '^[a-z0-9_]{3,24}$' then
    raise sqlstate 'PT400' using message='아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.';
  end if;
  if p_team is null or p_team not in ('neutral','LG','KT','SSG','NC','두산','KIA','롯데','삼성','한화','키움') then
    raise sqlstate 'PT400' using message='응원팀을 확인해 주세요.';
  end if;
  insert into fanplay_private.demo_records(player_id,state)
    values (id,jsonb_build_object('profile',jsonb_build_object('team',p_team)))
    on conflict (player_id) do nothing returning * into new_record;
  if not found then
    raise sqlstate 'PT409' using message='이미 가입한 아이디예요. 로그인하거나 다른 아이디를 입력해 주세요.';
  end if;
  return jsonb_build_object('username',new_record.player_id,'state',new_record.state,
    'revision',new_record.revision,'updated_at',new_record.updated_at);
end;
$$;

revoke all on function public.fanplay_demo_join(text,text) from public,anon,authenticated;
grant execute on function public.fanplay_demo_join(text,text) to anon;
notify pgrst, 'reload schema';
commit;
