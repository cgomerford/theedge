-- Front Office (MLB) — schema, build doc 2026-10-14.
-- Run once in the Supabase SQL editor. Every table is idempotent (IF NOT EXISTS).
--
-- Deviations from the build document (so you can veto them):
--   * The doc's `player_contracts` is named `player_contract_seasons` here, because a
--     different `player_contracts` table already exists (add_player_contracts.sql, one
--     row per player, used by the Scout Report "contract expires" flag). Not touched.
--   * `roster_acquisitions` gains player_name, position, war and acquired_from_name so the
--     Pro player drill-down reads one table (no join to the MLB API at render).
--   * `team_blueprint_snapshot.payroll_rank` is nullable: there is no free payroll source,
--     so it stays NULL (page shows nothing) until contracts are curated.
--
-- TABLE OWNERSHIP (single writer per table):
--   roster_acquisitions, team_blueprint_snapshot  -> scripts/compute_roster_blueprint.py
--   stat_stabilisation                            -> this file (seed) / manual edits
--   all other tables                              -> not written yet (later phases)

-- ── source tables ─────────────────────────────────────────────────────────

create table if not exists roster_acquisitions (
  team_id              integer  not null,
  player_id            integer  not null,
  season               smallint not null,
  player_name          text,
  position             text,
  acquisition_type     text     not null
    check (acquisition_type in ('draft','international','trade','mlb_fa','milb_fa','waiver','rule5')),
  acquired_from_team_id integer,
  acquired_from_name   text,
  acquired_date        date,
  war                  numeric,            -- season WAR (MLB Stats API sabermetrics); numeric -> string in PostgREST, coerce with Number()
  updated_at           timestamptz not null default now(),
  primary key (team_id, player_id, season)
);
create index if not exists roster_acquisitions_team_season on roster_acquisitions (team_id, season);

create table if not exists player_contract_seasons (
  player_id     integer  not null,
  season        smallint not null,
  salary_usd    bigint   not null,
  deferred_usd  bigint   not null default 0,
  guaranteed    boolean  not null default true,
  option_type   text,
  source_url    text     not null,
  verified_at   date     not null,
  primary key (player_id, season)
);

create table if not exists player_control (
  player_id               integer primary key,
  service_years           numeric,
  service_days            integer,
  status                  text check (status in ('pre_arb','arb1','arb2','arb3','arb4_super_two','contract','fa')),
  control_through_season  smallint,
  options_remaining       smallint,
  updated_at              timestamptz not null default now()
);

create table if not exists player_projections (
  player_id       integer  not null,
  season          smallint not null,
  proj_war        numeric  not null,
  method_version  text     not null,
  primary key (player_id, season, method_version)
);

-- ── config ────────────────────────────────────────────────────────────────

create table if not exists valuation_assumptions (
  season          smallint not null,
  war_tier        text     not null,
  dollars_per_war bigint   not null,
  aging_decline   numeric  not null default 0.4,
  discount_rate   numeric  not null,
  source_url      text     not null,
  primary key (season, war_tier)
);

-- Signal Meter thresholds. Edit rows here, never in component code.
create table if not exists stat_stabilisation (
  metric_key  text primary key,
  label       text not null,
  threshold   integer not null,
  unit        text not null,          -- 'pitches' | 'PA' | 'BBE' ...
  source_url  text
);

insert into stat_stabilisation (metric_key, label, threshold, unit, source_url) values
  ('pitch_quality',          'Pitch quality (per pitch type)', 80,  'pitches', null),
  ('pitch_location_overall', 'Location and overall pitch grades', 400, 'pitches', null)
on conflict (metric_key) do nothing;
-- Only the two thresholds named in the build document are seeded. Add the rest
-- (K%, BB%, barrel rate…) once a citable source URL is in hand.

-- ── snapshots (pages read the latest as_of) ───────────────────────────────

create table if not exists team_blueprint_snapshot (
  team_id      integer  not null,
  season       smallint not null,
  as_of        timestamptz not null default now(),
  war_by_type  jsonb    not null,      -- sum of per-player WAR floored at 0, by acquisition_type (+ 'unclassified')
  counts_by_type jsonb  not null,
  payroll_rank smallint,
  primary key (team_id, season)
);

create table if not exists team_dna_snapshot (
  team_id     integer  not null,
  season      smallint not null,
  as_of       timestamptz not null default now(),
  metrics     jsonb    not null,
  percentiles jsonb    not null,
  primary key (team_id, season)
);

create table if not exists player_value_snapshot (
  player_id        integer not null,
  as_of            timestamptz not null default now(),
  years_of_control smallint,
  surplus_npv_usd  bigint,
  breakdown        jsonb,
  primary key (player_id, as_of)
);
create index if not exists player_value_snapshot_latest on player_value_snapshot (player_id, as_of desc);

create table if not exists player_process_snapshot (
  player_id         integer not null,
  as_of             timestamptz not null default now(),
  role              text not null check (role in ('pitcher','hitter')),
  sample_size       integer,
  stuff_grade       numeric,
  flags             jsonb,
  key_metric_series jsonb,
  stabilised_state  text check (stabilised_state in ('early','settling','reliable')),
  primary key (player_id, as_of)
);
create index if not exists player_process_snapshot_latest on player_process_snapshot (player_id, as_of desc);

create table if not exists hitter_decision_snapshot (
  player_id     integer not null,
  as_of         timestamptz not null default now(),
  pitches_seen  integer,
  decision_runs numeric,
  zone_grid     jsonb,
  primary key (player_id, as_of)
);
create index if not exists hitter_decision_snapshot_latest on hitter_decision_snapshot (player_id, as_of desc);
