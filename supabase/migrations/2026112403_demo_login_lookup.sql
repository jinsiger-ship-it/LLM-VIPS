-- Read an existing shared demo ID without creating one.
begin;

create or replace function public.fanplay_demo_resume(p_player_id text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$' then
    raise sqlstate 'PT400' using message='시연용 아이디를 확인해 주세요.';
  end if;
  return (
    select jsonb_build_object('username',player_id,'state',state,'revision',revision,'updated_at',updated_at)
    from fanplay_private.demo_records where player_id=p_player_id
  );
end;
$$;

revoke all on function public.fanplay_demo_resume(text) from public,anon,authenticated;
grant execute on function public.fanplay_demo_resume(text) to anon;
notify pgrst, 'reload schema';
commit;
