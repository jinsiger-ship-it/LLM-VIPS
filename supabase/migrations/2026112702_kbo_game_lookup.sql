-- FANPLAY KBO 조회용 스키마. 공개 사용이 허용된 종료 경기만 관리자가 등록합니다.
begin;

create schema if not exists fanplay_private;
revoke all on schema fanplay_private from public, anon, authenticated;

create table if not exists fanplay_private.kbo_games (
  game_date date not null,
  source_id text not null check (char_length(btrim(source_id)) between 1 and 96),
  stadium text not null check (char_length(btrim(stadium)) between 1 and 80),
  home_team text not null check (char_length(btrim(home_team)) between 1 and 40),
  away_team text not null check (char_length(btrim(away_team)) between 1 and 40),
  home_code text not null check (home_code in ('DOOSAN','SAMSUNG','LOTTE','HANWHA','LG','KIA','HEROES','NC','KT','SSG')),
  away_code text not null check (away_code in ('DOOSAN','SAMSUNG','LOTTE','HANWHA','LG','KIA','HEROES','NC','KT','SSG')),
  home_score integer not null check (home_score between 0 and 99),
  away_score integer not null check (away_score between 0 and 99),
  game_time time,
  primary key (game_date, source_id),
  check (home_code <> away_code)
);
alter table fanplay_private.kbo_games enable row level security;
revoke all on fanplay_private.kbo_games from public, anon, authenticated;

create or replace function fanplay_private.kbo_venue_key(name text)
returns text language sql immutable strict set search_path = ''
as $$
  select case
    when key in ('문학','인천','인천문학','인천ssg랜더스필드','ssg랜더스필드') then '문학'
    when key in ('잠실','잠실야구장','서울잠실야구장') then '잠실'
    when key in ('사직','부산사직','사직야구장','부산사직야구장') then '사직'
    when key in ('고척','고척돔','고척스카이돔') then '고척'
    when key in ('수원','수원kt위즈파크','kt위즈파크') then '수원'
    when key in ('대구','대구삼성라이온즈파크','삼성라이온즈파크','라팍') then '대구'
    when key in ('창원','창원nc파크','nc파크') then '창원'
    when key in ('광주','광주기아챔피언스필드','기아챔피언스필드','챔필') then '광주'
    when key in ('대전','대전한화생명볼파크','한화생명볼파크') then '대전'
    else key
  end
  from (select lower(regexp_replace(name, '[[:space:]-]+', '', 'g')) as key) as normalized
$$;
revoke all on function fanplay_private.kbo_venue_key(text) from public, anon, authenticated;

create or replace function public.fanplay_kbo_games(p_date date, p_team text default null, p_stadium text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceId', picked.source_id, 'date', to_char(picked.game_date, 'YYYY-MM-DD'), 'stadium', picked.stadium,
    'home', picked.home_team, 'away', picked.away_team, 'homeScore', picked.home_score, 'awayScore', picked.away_score,
    'time', coalesce(to_char(picked.game_date + picked.game_time, 'HH24:MI'), ''), 'status', 'final'
  ) order by picked.game_time nulls last, picked.source_id), '[]'::jsonb)
  from (
    select g.*
    from fanplay_private.kbo_games as g
    cross join (
      select upper(btrim(coalesce(p_team,''))) as team,
        fanplay_private.kbo_venue_key(coalesce(p_stadium,'')) as stadium
    ) as filters
    where g.game_date = p_date
      and char_length(coalesce(p_team,'')) <= 12 and char_length(coalesce(p_stadium,'')) <= 80
      and (filters.team <> '' or filters.stadium <> '')
      and (filters.team = '' or filters.team in (g.home_code, g.away_code))
      and (filters.stadium = '' or strpos(fanplay_private.kbo_venue_key(g.stadium), filters.stadium) > 0)
    order by g.game_time nulls last, g.source_id
    limit 25
  ) as picked
$$;
revoke all on function public.fanplay_kbo_games(date,text,text) from public, anon, authenticated;
grant usage on schema public to anon;
grant execute on function public.fanplay_kbo_games(date,text,text) to anon;
notify pgrst, 'reload schema';
commit;
