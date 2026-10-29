-- Run this SECOND (it does not need the pitch_events reload to exist; the tables start empty). Creates the stored tables behind the Sequencing Lab's
-- Second Look page and Game Plan Card. Each table has exactly one writer script, named below, and row level security on with no policies, so only the
-- server's service key can read or write them (same as the other lab tables). Nothing existing is touched.

-- ── B. league_pa_pairs ─ one row per pair of CONSECUTIVE plate appearances by the same batter against the same pitcher in the same game ──
-- Written only by scripts/build_league_pa_pairs.py. look_number is the second plate appearance's number against that pitcher (2 = first to second, 3 = second to third).
-- Result classes: K strikeout, BB walk or hit by pitch, HIT single to home run, OUT_IN_PLAY any ball in play that is an out, OTHER everything else.
-- ab*_pitches are compact lists, one entry per pitch in thrown order: {"t": pitch type, "z": zone, "r": ball/called/whiff/foul/hit/out}.
-- ab2_opened_same: the second plate appearance's first pitch has the same type as the pitch that ended the first. ab2_threw_same_any: that type appears anywhere in the second.
-- ab2_run_value: the sum of delta_run_exp over the second plate appearance's pitches (positive = better for the batting side); null if any pitch lacks it.
create table if not exists public.league_pa_pairs (
  game_pk integer not null,
  game_date date not null,
  season integer not null,
  pitcher_id integer not null,
  batter_id integer not null,
  p_throws char(1) not null,
  stand char(1) not null,
  look_number smallint not null check (look_number in (2, 3)),
  ab1_at_bat_number integer not null,
  ab2_at_bat_number integer not null,
  ab1_result_class text not null check (ab1_result_class in ('K', 'BB', 'HIT', 'OUT_IN_PLAY', 'OTHER')),
  ab1_event text,
  ab1_final_pitch_type text not null,
  ab1_final_pitch_desc text,
  ab1_pitches jsonb not null,
  ab2_first_pitch_type text not null,
  ab2_opened_same boolean not null,
  ab2_threw_same_any boolean not null,
  ab2_result_class text not null check (ab2_result_class in ('K', 'BB', 'HIT', 'OUT_IN_PLAY', 'OTHER')),
  ab2_event text not null check (ab2_event in ('strikeout', 'walk', 'hit_by_pitch', 'single', 'double', 'triple', 'home_run', 'out_in_play', 'other')),
  ab2_pitches jsonb not null,
  ab2_run_value numeric(7,3),
  primary key (game_pk, batter_id, ab1_at_bat_number, ab2_at_bat_number)
);
create index if not exists idx_league_pa_pairs_lookup on public.league_pa_pairs (p_throws, stand, ab1_result_class, ab1_final_pitch_type);
create index if not exists idx_league_pa_pairs_pitcher on public.league_pa_pairs (pitcher_id);
create index if not exists idx_league_pa_pairs_batter on public.league_pa_pairs (batter_id);
create index if not exists idx_league_pa_pairs_date on public.league_pa_pairs (game_date desc);
alter table public.league_pa_pairs enable row level security;

-- ── C. second_look_summary ─ what the Second Look page reads, so nothing is counted live ──
-- Written only by scripts/build_second_look_summary.py. scope_type league uses scope_id 0; pitcher and batter use that player's id; cluster uses the hitter cluster id.
-- look_number 0 means both looks together. first_pitch_mix = counts of the second look's first pitch by pitch type. endings_same / endings_other = counts by
-- ab2_event for the pairs that opened with the same pitch / with something else.
create table if not exists public.second_look_summary (
  season integer not null,
  scope_type text not null check (scope_type in ('league', 'pitcher', 'batter', 'cluster')),
  scope_id integer not null,
  p_throws char(1) not null,
  stand char(1) not null,
  look_number smallint not null check (look_number in (0, 2, 3)),
  ab1_result_class text not null check (ab1_result_class in ('K', 'BB', 'HIT', 'OUT_IN_PLAY', 'OTHER')),
  ab1_final_pitch_type text not null,
  n_pairs integer not null,
  n_opened_same integer not null,
  n_opened_other integer not null,
  first_pitch_mix jsonb not null,
  endings_same jsonb not null,
  endings_other jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, scope_type, scope_id, p_throws, stand, look_number, ab1_result_class, ab1_final_pitch_type)
);
alter table public.second_look_summary enable row level security;

-- The 0-0 baseline the Second Look page sets the second look against: the first-pitch mix of every plate appearance for that hand and side.
-- Written only by scripts/build_second_look_summary.py.
create table if not exists public.second_look_baseline (
  season integer not null,
  p_throws char(1) not null,
  stand char(1) not null,
  n_pitches integer not null,
  first_pitch_mix jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, p_throws, stand)
);
alter table public.second_look_baseline enable row level security;

-- ── D. hitter_clusters ─ "hitters like him", grouped by chase, whiff and damage by pitch type ──
-- Written only by scripts/build_hitter_clusters.py. One fit per season and pitcher hand (stand_vs: 'vs RHP' or 'vs LHP'). A batter under the minimum sample gets no row.
-- features holds his own figures and the sample behind each (chase, whiff and xwOBA on contact for fastballs, breaking and offspeed pitches).
create table if not exists public.hitter_clusters (
  season integer not null,
  batter_id integer not null,
  stand_vs text not null check (stand_vs in ('vs RHP', 'vs LHP')),
  cluster_id smallint not null,
  features jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, batter_id, stand_vs)
);
create index if not exists idx_hitter_clusters_cluster on public.hitter_clusters (season, stand_vs, cluster_id);
alter table public.hitter_clusters enable row level security;

create table if not exists public.hitter_cluster_defs (
  season integer not null,
  stand_vs text not null check (stand_vs in ('vs RHP', 'vs LHP')),
  cluster_id smallint not null,
  label text not null,
  centroid jsonb not null,
  n_hitters integer not null,
  k smallint not null,
  silhouette numeric(5,3),
  built_at timestamptz not null default now(),
  primary key (season, stand_vs, cluster_id)
);
alter table public.hitter_cluster_defs enable row level security;

-- ── E. game_plan_cards ─ one stored card per game and starting pitcher ──
-- Written only by scripts/build_game_plan_cards.py. lineup_source: 'posted' = the lineup the club posted; 'recent_vs_hand' = the club's most common lineup against that
-- hand over the last 14 days (shown as "Recent lineup vs RHP/LHP", never as a forecast). card is the whole page as JSON: the arsenal, then one entry per hitter
-- with first_pitch, opener, two_strikes, damage_zones and second_look, each carrying its own sample size and whether his own or his cluster's data was used.
create table if not exists public.game_plan_cards (
  game_pk integer not null,
  game_date date not null,
  pitcher_id integer not null,
  opponent_team_id integer not null,
  lineup_source text not null check (lineup_source in ('posted', 'recent_vs_hand')),
  built_at timestamptz not null default now(),
  card jsonb not null,
  primary key (game_pk, pitcher_id)
);
create index if not exists idx_game_plan_cards_date on public.game_plan_cards (game_date desc);
alter table public.game_plan_cards enable row level security;
