-- Pong.AI leaderboard schema for Supabase (Postgres)
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.
--
-- Security model:
--   • Anyone (anon key) can READ game_results.
--   • Nobody can INSERT/UPDATE/DELETE the table directly.
--   • New results go through submit_game_result(), which validates the payload
--     and computes the score server-side, so clients cannot post a raw score.

create extension if not exists pgcrypto;

-- ─── Table ─────────────────────────────────────────────────────────────────
create table if not exists public.game_results (
    id                  uuid        primary key default gen_random_uuid(),
    player_name         text        not null check (char_length(player_name) between 1 and 14),
    difficulty          text        not null check (difficulty in ('easy', 'medium', 'hard', 'extreme')),
    theme               text        not null check (theme in ('neon', 'retro', 'synthwave', 'arctic')),
    match_format        text        not null check (match_format in ('one', 'best3', 'best5', 'best7')),
    won                 boolean     not null,
    games_won_player    int         not null check (games_won_player between 0 and 4),
    games_won_ai        int         not null check (games_won_ai     between 0 and 4),
    final_points_player int         not null check (final_points_player between 0 and 500),
    final_points_ai     int         not null check (final_points_ai     between 0 and 500),
    total_points_player int         not null check (total_points_player between 0 and 5000),
    total_points_ai     int         not null check (total_points_ai     between 0 and 5000),
    deuce_count         int         not null default 0 check (deuce_count   between 0 and 5000),
    longest_rally       int         not null default 0 check (longest_rally between 0 and 100000),
    duration_sec        int         not null default 0 check (duration_sec  between 0 and 86400),
    score               int         not null,
    created_at          timestamptz not null default now(),
    check (won = (games_won_player > games_won_ai))
);

create index if not exists game_results_difficulty_score_idx on public.game_results (difficulty, score desc);
create index if not exists game_results_score_idx            on public.game_results (score desc);
create index if not exists game_results_created_at_idx       on public.game_results (created_at desc);

-- ─── Row level security: public read, no direct writes ────────────────────
alter table public.game_results enable row level security;

drop policy if exists "Public read" on public.game_results;
create policy "Public read" on public.game_results
    for select to anon, authenticated using (true);

revoke insert, update, delete on public.game_results from anon, authenticated;

-- ─── Score formula (single source of truth) ───────────────────────────────
-- Score = (points won × 10 + 100 per game won + 50 for winning the match)
--         × difficulty multiplier (Easy ×1, Medium ×1.5, Hard ×2, Extreme ×3)
create or replace function public.compute_score(
    p_difficulty text, p_total_points_player int, p_games_won_player int, p_won boolean
) returns int
language sql immutable as $$
    select round(
        (p_total_points_player * 10 + p_games_won_player * 100 + case when p_won then 50 else 0 end)
        * case p_difficulty
            when 'easy'    then 1
            when 'medium'  then 1.5
            when 'hard'    then 2
            when 'extreme' then 3
            else 1
          end
    )::int;
$$;

-- ─── Submit a finished match ───────────────────────────────────────────────
-- Called from the browser via POST /rest/v1/rpc/submit_game_result
-- Returns { id, score, rank_difficulty, rank_overall }.
create or replace function public.submit_game_result(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_games_needed int;
    v_row          public.game_results;
begin
    v_games_needed := case p->>'match_format'
        when 'one'   then 1
        when 'best3' then 2
        when 'best5' then 3
        when 'best7' then 4
    end;
    if v_games_needed is null then
        raise exception 'Invalid match_format';
    end if;

    -- The winner must have exactly the number of games the format requires.
    if greatest((p->>'games_won_player')::int, (p->>'games_won_ai')::int) <> v_games_needed
       or least((p->>'games_won_player')::int, (p->>'games_won_ai')::int) >= v_games_needed then
        raise exception 'Games won do not match the match format';
    end if;

    insert into public.game_results (
        player_name, difficulty, theme, match_format, won,
        games_won_player, games_won_ai,
        final_points_player, final_points_ai,
        total_points_player, total_points_ai,
        deuce_count, longest_rally, duration_sec, score
    ) values (
        btrim(p->>'player_name'),
        p->>'difficulty',
        p->>'theme',
        p->>'match_format',
        (p->>'won')::boolean,
        (p->>'games_won_player')::int,
        (p->>'games_won_ai')::int,
        (p->>'final_points_player')::int,
        (p->>'final_points_ai')::int,
        (p->>'total_points_player')::int,
        (p->>'total_points_ai')::int,
        coalesce((p->>'deuce_count')::int, 0),
        coalesce((p->>'longest_rally')::int, 0),
        coalesce((p->>'duration_sec')::int, 0),
        public.compute_score(
            p->>'difficulty',
            (p->>'total_points_player')::int,
            (p->>'games_won_player')::int,
            (p->>'won')::boolean
        )
    )
    returning * into v_row;

    return jsonb_build_object(
        'id',              v_row.id,
        'score',           v_row.score,
        'rank_difficulty', (select count(*) + 1 from public.game_results
                            where difficulty = v_row.difficulty and score > v_row.score),
        'rank_overall',    (select count(*) + 1 from public.game_results
                            where score > v_row.score)
    );
end;
$$;

revoke all on function public.submit_game_result(jsonb) from public;
grant execute on function public.submit_game_result(jsonb) to anon, authenticated;

-- ─── Per-player aggregates for the "Players" tab ──────────────────────────
-- Called via POST /rest/v1/rpc/leaderboard_players
create or replace function public.leaderboard_players(p_difficulty text default null, p_limit int default 50)
returns table (player_name text, matches bigint, wins bigint, best_score int)
language sql stable
set search_path = public
as $$
    select player_name,
           count(*)                     as matches,
           count(*) filter (where won)  as wins,
           max(score)                   as best_score
    from public.game_results
    where p_difficulty is null or difficulty = p_difficulty
    group by player_name
    order by best_score desc, matches desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

grant execute on function public.leaderboard_players(text, int) to anon, authenticated;
