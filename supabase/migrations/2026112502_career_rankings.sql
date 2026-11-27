-- Optional public demo league. Registration uses an existing retired save.
begin;

create table if not exists fanplay_private.demo_career_rankings (
  player_id text not null references fanplay_private.demo_records(player_id) on delete cascade,
  position text not null check(position in ('투수','타자')),
  career_id text not null,
  entry_id uuid not null default gen_random_uuid(),
  nickname text not null,
  name text not null,
  seasons integer not null,
  appearances integer not null,
  score numeric not null,
  registered_at timestamptz not null default now(),
  primary key(player_id,position)
);
create index if not exists fanplay_pitcher_rank on fanplay_private.demo_career_rankings(score asc,appearances desc,entry_id) where position='투수';
create index if not exists fanplay_batter_rank on fanplay_private.demo_career_rankings(score desc,appearances desc,entry_id) where position='타자';
alter table fanplay_private.demo_career_rankings enable row level security;
revoke all on fanplay_private.demo_career_rankings from public,anon,authenticated;

create or replace function public.fanplay_demo_career_rankings(p_position text)
returns jsonb language sql stable security definer set search_path='' as $$
 with shortlist as (
   (select nickname,name,position,seasons,appearances,score,entry_id from fanplay_private.demo_career_rankings
    where p_position='투수' and position='투수' order by score,appearances desc,entry_id limit 10)
   union all
   (select nickname,name,position,seasons,appearances,score,entry_id from fanplay_private.demo_career_rankings
    where p_position='타자' and position='타자' order by score desc,appearances desc,entry_id limit 10)
 )
 select coalesce(jsonb_agg(jsonb_build_object('nickname',nickname,'name',name,'position',position,
   'seasons',seasons,'sample',appearances,'score',round(score,case when p_position='투수' then 2 else 3 end))
   order by (case when p_position='투수' then score else -score end),appearances desc,entry_id),'[]'::jsonb)
 from shortlist
$$;

create or replace function public.fanplay_demo_career_rank_write(p_player_id text,p_position text,p_action text,p_career_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare private_save jsonb;
        selected jsonb;
        results jsonb;
        season_count integer;
        valid_seasons integer;
        total_amount integer;
        total_score integer;
        amount_key text;
        score_key text;
begin
  if p_player_id is null or p_player_id !~ '^[a-z0-9_]{3,24}$' or coalesce(p_position,'') not in ('투수','타자')
     or coalesce(p_action,'') not in ('register','cancel') or coalesce(p_career_id,'') !~ '^[a-z0-9-]{1,48}$' then
    raise sqlstate 'PT400' using message='순위에 등록할 선수와 포지션을 확인해 주세요.';
  end if;
  select state into private_save from fanplay_private.demo_records where player_id=p_player_id;
  if not found then raise sqlstate 'PT401' using message='시연용 아이디로 먼저 들어와 주세요.'; end if;
  if p_action='cancel' then
    delete from fanplay_private.demo_career_rankings where player_id=p_player_id and position=p_position and career_id=p_career_id;
    return found;
  end if;
  select candidate into selected from (
    select private_save->'career' candidate,0 priority
    union all
    select item,1 from jsonb_array_elements(case when jsonb_typeof(private_save->'careerHistory')='array' then private_save->'careerHistory' else '[]'::jsonb end) item
    union all
    select item->'career',2 from jsonb_array_elements(case when jsonb_typeof(private_save->'savedCareers')='array' then private_save->'savedCareers' else '[]'::jsonb end) item
  ) options where candidate->>'id'=p_career_id order by priority limit 1;
  results:=selected->'log';
  if selected is null or selected->>'retired' is distinct from 'true'
     or selected->>'position' is distinct from p_position or coalesce(selected->>'rules','') !~ '^[3-8]$'
     or coalesce(selected->>'step','') !~ '^[78]$' or jsonb_typeof(results) is distinct from 'array'
     or jsonb_typeof(selected->'moves') is distinct from 'array' then
    raise sqlstate 'PT400' using message='완료한 은퇴 기록만 순위에 올릴 수 있어요.';
  end if;
  season_count:=(selected->>'step')::integer;
  if jsonb_array_length(results)<>season_count or jsonb_array_length(selected->'moves') not between season_count and 64 then
    raise sqlstate 'PT400' using message='전체 시즌과 선택 기록이 필요해요.';
  end if;
  amount_key:=case when p_position='투수' then 'innings' else 'atBats' end;
  score_key:=case when p_position='투수' then 'earnedRuns' else 'hits' end;
  select count(*),sum((entry->'record'->>amount_key)::integer),sum((entry->'record'->>score_key)::integer)
    into valid_seasons,total_amount,total_score
    from jsonb_array_elements(results) with ordinality records(entry,seq)
    where entry->>'season'=seq::text and entry->'record'->>amount_key ~ '^[0-9]{1,3}$'
      and entry->'record'->>score_key ~ '^[0-9]{1,3}$';
  if valid_seasons<>season_count or total_amount<(case when p_position='투수' then 100 else 300 end)
     or total_score>total_amount then
    raise sqlstate 'PT400' using message='정상 시즌 기록과 최소 기준이 필요해요. 투수 100이닝 · 타자 300타수';
  end if;
  insert into fanplay_private.demo_career_rankings(player_id,position,career_id,nickname,name,seasons,appearances,score)
    values(p_player_id,p_position,p_career_id,
      coalesce(left(nullif(btrim(private_save->'profile'->>'nickname'),''),24),'야구팬'),
      coalesce(left(nullif(btrim(selected->>'name'),''),24),'신인 선수'),
      season_count,total_amount,total_score::numeric*(case when p_position='투수' then 9 else 1 end)/total_amount)
    on conflict(player_id,position) do update set career_id=excluded.career_id,nickname=excluded.nickname,
      name=excluded.name,seasons=excluded.seasons,appearances=excluded.appearances,score=excluded.score,registered_at=now();
  return true;
end;
$$;

create or replace function public.fanplay_demo_career_rank_status(p_player_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('position',position,'careerId',career_id,'name',name)
    order by position),'[]'::jsonb)
  from fanplay_private.demo_career_rankings where player_id=p_player_id and p_player_id ~ '^[a-z0-9_]{3,24}$'
$$;

revoke all on function public.fanplay_demo_career_rankings(text),
  public.fanplay_demo_career_rank_write(text,text,text,text),public.fanplay_demo_career_rank_status(text) from public,anon,authenticated;
grant execute on function public.fanplay_demo_career_rankings(text),
  public.fanplay_demo_career_rank_write(text,text,text,text),public.fanplay_demo_career_rank_status(text) to anon;
notify pgrst,'reload schema';
commit;
