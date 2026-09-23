-- One-time schema for the season-aggregate ABS challenge team leaderboard.
-- Single writer: scripts/fetch_abs_challenge_leaderboard.py (see that
-- script's header). Backs src/lib/abs-challenges.ts ("Who's challenging"
-- and "Leaderboards" boxes on /mlb/abs) — this replaces a live,
-- request-time fetch to Baseball Savant's abs-challenges leaderboard CSV
-- export, which started 500ing in Sept 2026 regardless of query params.
--
-- Keyed by team_id (MLB's own numeric team id, e.g. 121 = NYM), not
-- team_abbr — Savant's own abbreviation for a couple of teams (e.g. "AZ")
-- doesn't match this codebase's MLB_TEAMS abbreviations ("ARI"), so the
-- numeric id is the only unambiguous join key. Readers map id -> abbr via
-- MLB_TEAMS the same way abs-challenge-log.ts already does.
--
-- Run this in the Supabase SQL editor before the script's first run.

create table if not exists abs_challenge_team_leaderboard (
  team_id integer not null,
  season integer not null,
  -- Batter-initiated (challenging called strikes) — challengeType=batting-team
  batting_challenges integer not null default 0,
  batting_overturns integer not null default 0,
  batting_confirms integer not null default 0,
  batting_success_rate numeric,
  -- Pitcher/catcher-initiated (challenging called balls) — challengeType=catching-team
  pitching_challenges integer not null default 0,
  pitching_overturns integer not null default 0,
  pitching_confirms integer not null default 0,
  pitching_success_rate numeric,
  -- Combined, both directions
  total_challenges integer not null default 0,
  total_overturns integer not null default 0,
  total_success_rate numeric,
  updated_at timestamptz not null default now(),
  primary key (team_id, season)
);
