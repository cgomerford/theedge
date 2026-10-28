-- x9Stuff Lab: the in-house pitch grades, shaped like the model's CSV outputs (mockups/front-office-pitch-grades.html) so the page maps 1:1.
--
-- Single writer: scripts/load_stuff_lab.py (reads the model's CSVs: models/reports/stuff_v1.0_<season>_*.csv today, and the full
-- edge_pitch_model outputs when that exists). Every grade column is nullable: Stuff Grade v1.0 fills stuff_grade only; command, overall,
-- the six sub-grades, the pressure profile and actual run value stay NULL until the full model writes them, and the page shows a
-- "Pending" block for a NULL, never a guess.
--
-- Scale: 100 = league average, every 10 points = one standard deviation, higher = better for the pitcher (Stuff Grade v1.0 is 50-based
-- with the same 10-point SD, so the loader adds 50). rv columns are runs saved per 100 pitches, positive = better for the pitcher.

create table if not exists public.stuff_lab_pitch_grades (
  season int not null, pitcher_id int not null, pitch_type text not null,
  player_name text, p_throws char(1),
  pitches int not null, usage_pct numeric(5,1),
  velo numeric(5,1), ivb numeric(5,1), hb numeric(5,1), spin int,
  actual_rv_per100 numeric(6,2), expected_rv_per100 numeric(6,2),
  stuff_grade numeric(5,1), command_grade numeric(5,1), overall_grade numeric(5,1),
  miss_bats_grade numeric(5,1), chase_grade numeric(5,1), steal_strikes_grade numeric(5,1),
  ground_balls_grade numeric(5,1), pop_ups_grade numeric(5,1), weak_contact_grade numeric(5,1),
  sample_note text, model_version text not null, updated_at timestamptz not null default now(),
  primary key (season, pitcher_id, pitch_type)
);

create table if not exists public.stuff_lab_pitcher_grades (
  season int not null, pitcher_id int not null,
  player_name text, p_throws char(1),
  pitches int not null,
  velo numeric(5,1), ivb numeric(5,1), hb numeric(5,1), spin int,
  actual_rv_per100 numeric(6,2), expected_rv_per100 numeric(6,2),
  stuff_grade numeric(5,1), command_grade numeric(5,1), overall_grade numeric(5,1),
  miss_bats_grade numeric(5,1), chase_grade numeric(5,1), steal_strikes_grade numeric(5,1),
  ground_balls_grade numeric(5,1), pop_ups_grade numeric(5,1), weak_contact_grade numeric(5,1),
  era numeric(5,2), xera numeric(5,2), kbb numeric(5,1),
  sample_note text, model_version text not null, updated_at timestamptz not null default now(),
  primary key (season, pitcher_id)
);

create table if not exists public.stuff_lab_pressure (
  season int not null, pitcher_id int not null, pressure text not null check (pressure in ('high', 'normal')),
  player_name text, pitches int not null,
  overall_grade numeric(5,1), command_grade numeric(5,1), fastball_pct numeric(5,1), actual_rv_per100 numeric(6,2),
  model_version text not null, updated_at timestamptz not null default now(),
  primary key (season, pitcher_id, pressure)
);

create index if not exists stuff_lab_pitch_grades_pitcher_idx on public.stuff_lab_pitch_grades (season, pitcher_id);

alter table public.stuff_lab_pitch_grades enable row level security;
alter table public.stuff_lab_pitcher_grades enable row level security;
alter table public.stuff_lab_pressure enable row level security;
-- No policies: read and written with the service role only.
