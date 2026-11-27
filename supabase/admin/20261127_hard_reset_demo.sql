-- Run once in the FANPLAY project's SQL Editor after the browser reset release is live.
-- This removes FANPLAY demo data. It keeps schema, functions, policies and other projects.
begin;

do $$
begin
  if to_regclass('fanplay_private.demo_records') is null then
    raise exception 'The FANPLAY demo_records table is missing. Check the selected project.';
  end if;
end;
$$;

create table if not exists fanplay_private.demo_reset_history (
  reset_id text primary key,
  reset_at timestamptz not null default now()
);
alter table fanplay_private.demo_reset_history enable row level security;
revoke all on fanplay_private.demo_reset_history from public,anon,authenticated;

do $$
declare
  reset_id constant text := 'fanplay-demo-20261127';
  targets text;
begin
  insert into fanplay_private.demo_reset_history(reset_id)
    values(reset_id) on conflict do nothing;
  if not found then
    raise notice 'FANPLAY reset was already applied. New records are kept.';
    return;
  end if;

  select string_agg(format('%I.%I','fanplay_private',name),', ' order by name) into targets
  from unnest(array[
    'demo_records','demo_ticket_posts','demo_ticket_likes','demo_ticket_comments',
    'demo_community_requests','demo_community_limits','demo_ticket_reports',
    'demo_moderation_log','demo_career_rankings'
  ]) as known(name)
  where to_regclass(format('%I.%I','fanplay_private',name)) is not null;

  -- An unknown foreign-key dependency must abort this transaction.
  execute 'truncate table '||targets||' restart identity restrict';
  if to_regclass('public.fanplay_demo_feed_updates') is not null then
    update public.fanplay_demo_feed_updates set version=version+1 where id=1;
  end if;
end;
$$;

create or replace function public.fanplay_demo_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ready',true,'version',1,'recordReset',
    (select reset_id from fanplay_private.demo_reset_history order by reset_at desc,reset_id desc limit 1))
$$;
revoke all on function public.fanplay_demo_status() from public,anon,authenticated;
grant execute on function public.fanplay_demo_status() to anon;
notify pgrst,'reload schema';
commit;

select count(*) as remaining_fanplay_demo_accounts from fanplay_private.demo_records;
