-- Front Office › Pitching Desk — schema, 2026-10-15.
-- Run once in the Supabase SQL editor. Every statement is idempotent.
-- Plan: docs/claude-code-prompts-pitching-desk.md ("Prompt 2 — Schema").
--
-- Deviations from the plan (so you can veto them):
--   * The plan's column `window` is named `win`. WINDOW is a reserved word in Postgres, so
--     every query, key and index would need quoting. Values are the same:
--     'season' | 'l30' | 'l15' | 'l5'.
--   * fo_pitch_staff gains player_name (the page lists pitchers without a join to the MLB API).
--   * fo_pitch_game_log gains team_id and season; fo_pitch_il_stints gains team_id, il_type,
--     raw placement/activation text and both transaction ids. The MLB transactions feed has no
--     structured IL code (every move is typeCode 'SC'), so the text is kept for audit.
--   * fo_pitch_count_mix gains `side` so the batter-side control applies to it too.
--   * fo_league_pitch_context is keyed (season, role) and has an `sd` jsonb column, because the
--     staff board shades each cell by SD versus the league for the pitcher's role (SP / RP).
--   * stat_stabilisation (already exists, create_front_office.sql) gains `multi_season`, and
--     `threshold` becomes nullable: BABIP / LOB% / HR-FB do not stabilise inside one season, so
--     they get NO single-season number (empty state over a guessed threshold). The Signal Meter
--     must skip rows with a null threshold; src/lib/front-office/signal.ts is edited in Step 5.
--   * stuff_grade / method_version are nullable on fo_pitch_staff and fo_pitch_arsenal. They stay
--     NULL (page shows "—") until the Stuff Grade model ships.
--
-- TABLE OWNERSHIP (single writer per table):
--   fo_pitch_staff, fo_league_pitch_context            -> scripts/fo/sync_pitch_staff.py
--   fo_pitch_arsenal, fo_pitch_points, fo_pitch_league_avg -> scripts/fo/sync_pitch_arsenal.py
--   fo_pitch_game_log, fo_pitch_il_stints              -> scripts/fo/sync_pitch_game_log.py
--   fo_pitch_discipline, fo_pitch_location, fo_pitch_count_mix -> scripts/fo/sync_pitch_execution.py (stub)
--   fo_pitch_comps                                     -> scripts/fo/sync_pitch_comps.py (stub)
--   fo_pitch_tto, fo_pitch_velo_decay                  -> scripts/fo/sync_pitch_tto_decay.py (stub)
--   stuff_grade / method_version columns               -> the future Stuff Grade scoring job (only writer)
--   stat_stabilisation                                 -> this file (seed) / manual edits

-- ── staff board ────────────────────────────────────────────────────────────

create table if not exists fo_pitch_staff (
  team_id      integer  not null,
  player_id    integer  not null,
  season       smallint not null,
  win          text     not null check (win in ('season','l30','l15','l5')),
  player_name  text,
  role         text     check (role in ('SP','RP')),
  throws       text     check (throws in ('R','L')),
  age          smallint,
  ip           numeric,
  bf           integer,
  k            integer,
  bb           integer,
  hbp          integer,
  hr           integer,
  gb           integer,
  fb           integer,
  bip          integer,
  era          numeric,
  fip          numeric,
  xfip         numeric,
  siera        numeric,
  xera         numeric,
  k_pct        numeric,
  bb_pct       numeric,
  kbb_pct      numeric,
  csw_pct      numeric,
  whiff_pct    numeric,
  babip        numeric,
  lob_pct      numeric,
  hr_fb        numeric,
  fb_velo_delta numeric,          -- primary fastball velo this season minus last; NULL if no prior season
  stuff_grade  numeric,           -- NULL until the Stuff Grade model ships
  method_version text,
  as_of        timestamptz not null default now(),
  primary key (player_id, season, win)
);
create index if not exists fo_pitch_staff_team on fo_pitch_staff (team_id, season, win);

-- ── arsenal ────────────────────────────────────────────────────────────────

create table if not exists fo_pitch_arsenal (
  player_id       integer  not null,
  season          smallint not null,
  win             text     not null check (win in ('season','l30','l15','l5')),
  side            text     not null check (side in ('all','R','L')),
  pitch_type      text     not null,
  pitches         integer,
  usage_pct       numeric,
  velo            numeric,
  ivb             numeric,          -- inches
  hb              numeric,          -- inches, mirrored so arm side is positive
  spin            numeric,
  active_spin_pct numeric,
  vaa             numeric,
  extension       numeric,
  arm_angle       numeric,
  whiff_pct       numeric,
  xwoba           numeric,
  rv_per_100      numeric,          -- pitcher's view: positive = good
  rel_x           numeric,
  rel_z           numeric,
  stuff_grade     numeric,          -- NULL until the Stuff Grade model ships
  method_version  text,
  as_of           timestamptz not null default now(),
  primary key (player_id, season, win, side, pitch_type)
);
create index if not exists fo_pitch_arsenal_lookup on fo_pitch_arsenal (player_id, season, win, side);

create table if not exists fo_pitch_points (
  player_id   integer  not null,
  season      smallint not null,
  win         text     not null check (win in ('season','l30','l15','l5')),
  pitch_type  text     not null,
  points      jsonb    not null,     -- <=150 downsampled pitches: [{hb, ivb, rel_x, rel_z}]
  as_of       timestamptz not null default now(),
  primary key (player_id, season, win, pitch_type)
);
create index if not exists fo_pitch_points_lookup on fo_pitch_points (player_id, season, win);

create table if not exists fo_pitch_league_avg (
  season          smallint not null,
  pitch_type      text     not null,
  n_pitchers      integer,
  velo numeric, ivb numeric, hb numeric, spin numeric, active_spin_pct numeric,
  vaa numeric, extension numeric, whiff_pct numeric, xwoba numeric,
  velo_sd numeric, ivb_sd numeric, hb_sd numeric, spin_sd numeric, active_spin_pct_sd numeric,
  vaa_sd numeric, extension_sd numeric, whiff_pct_sd numeric, xwoba_sd numeric,
  as_of           timestamptz not null default now(),
  primary key (season, pitch_type)
);

-- ── execution (filled by a later job) ──────────────────────────────────────

create table if not exists fo_pitch_discipline (
  player_id   integer  not null,
  season      smallint not null,
  win         text     not null check (win in ('season','l30','l15','l5')),
  side        text     not null check (side in ('all','R','L')),
  zone_pct numeric, chase_pct numeric, zcontact_pct numeric, swstr_pct numeric, csw_pct numeric, fps_pct numeric,
  as_of       timestamptz not null default now(),
  primary key (player_id, season, win, side)
);

create table if not exists fo_pitch_location (
  player_id   integer  not null,
  season      smallint not null,
  win         text     not null check (win in ('season','l30','l15','l5')),
  side        text     not null check (side in ('all','R','L')),
  pitch_type  text     not null,
  grid        jsonb    not null,     -- 5x5: [{count, whiffs, swings, xwoba_sum}] scaled to each batter's zone
  as_of       timestamptz not null default now(),
  primary key (player_id, season, win, side, pitch_type)
);
create index if not exists fo_pitch_location_lookup on fo_pitch_location (player_id, season, win, side);

create table if not exists fo_pitch_count_mix (
  player_id   integer  not null,
  season      smallint not null,
  win         text     not null check (win in ('season','l30','l15','l5')),
  side        text     not null check (side in ('all','R','L')),
  state       text     not null check (state in ('first','ahead','even','behind','two_strikes')),
  mix         jsonb    not null,     -- {pitch_type: pct}
  as_of       timestamptz not null default now(),
  primary key (player_id, season, win, side, state)
);

create table if not exists fo_pitch_comps (
  player_id   integer  not null,
  season      smallint not null,
  pitch_type  text     not null,
  comps       jsonb    not null,     -- [{player_id, name, throws, velo, ivb, hb, similarity, whiff_pct, rv_per_100}]
  as_of       timestamptz not null default now(),
  primary key (player_id, season, pitch_type)
);

-- ── durability ─────────────────────────────────────────────────────────────

create table if not exists fo_pitch_game_log (
  player_id    integer  not null,
  game_pk      integer  not null,
  team_id      integer,
  season       smallint not null,
  game_date    date     not null,
  days_rest    integer,                -- NULL for the first appearance of the season
  pitches      integer,
  bf           integer,
  k            integer,
  bb           integer,
  csw          numeric,
  velo_by_type jsonb,                  -- {pitch_type: avg velo}
  arm_angle    numeric,
  rel_z        numeric,
  as_of        timestamptz not null default now(),
  primary key (player_id, game_pk)
);
create index if not exists fo_pitch_game_log_lookup on fo_pitch_game_log (player_id, season, game_date);

create table if not exists fo_pitch_il_stints (
  player_id      integer not null,
  start_tx_id    bigint  not null,     -- MLB transactions id of the placement
  team_id        integer,
  start_date     date    not null,
  end_date       date,                 -- NULL = still on the IL
  il_type        text,                 -- '10-day' | '15-day' | '60-day' (parsed from the text)
  description    text,                 -- raw placement text
  end_description text,                -- raw activation text
  end_tx_id      bigint,
  as_of          timestamptz not null default now(),
  primary key (player_id, start_tx_id)
);
create index if not exists fo_pitch_il_stints_lookup on fo_pitch_il_stints (player_id, start_date);

create table if not exists fo_pitch_tto (
  player_id integer  not null,
  season    smallint not null,
  tto       smallint not null check (tto in (1,2,3)),
  bf        integer,
  xwoba     numeric,
  as_of     timestamptz not null default now(),
  primary key (player_id, season, tto)
);

create table if not exists fo_pitch_velo_decay (
  player_id  integer  not null,
  season     smallint not null,
  bucket     text     not null check (bucket in ('1-25','26-50','51-75','76-100','100+')),
  pitch_type text     not null,
  velo       numeric,
  as_of      timestamptz not null default now(),
  primary key (player_id, season, bucket, pitch_type)
);

-- ── league context ─────────────────────────────────────────────────────────

create table if not exists fo_league_pitch_context (
  season       smallint not null,
  role         text     not null check (role in ('all','SP','RP')),
  k_pct numeric, bb_pct numeric, kbb_pct numeric, csw_pct numeric, zone_pct numeric,
  chase_pct numeric, zcontact_pct numeric, swstr_pct numeric, fps_pct numeric,
  babip numeric, lob_pct numeric, hr_fb numeric, gb_pct numeric, era numeric,
  fip_constant numeric,
  tto          jsonb,                  -- {"1": xwoba, "2": xwoba, "3": xwoba}
  sd           jsonb,                  -- per-metric standard deviation across pitchers of this role
  as_of        timestamptz not null default now(),
  primary key (season, role)
);

-- ── stat_stabilisation: add the pitching rows ──────────────────────────────

alter table stat_stabilisation add column if not exists multi_season boolean not null default false;
alter table stat_stabilisation alter column threshold drop not null;

insert into stat_stabilisation (metric_key, label, threshold, unit, source_url, multi_season) values
  ('k_pct',   'Strikeout rate',          70,   'BF',  null, false),
  ('bb_pct',  'Walk rate',               170,  'BF',  null, false),
  ('gb_pct',  'Ground-ball rate',        70,   'BIP', null, false),
  ('babip',   'BABIP',                   null, 'BIP', null, true),
  ('lob_pct', 'Strand rate (LOB%)',      null, 'BF',  null, true),
  ('hr_fb',   'Home runs per fly ball',  null, 'FB',  null, true)
on conflict (metric_key) do nothing;
-- The three numeric thresholds are the plan's figures; add a citable source_url when one is in hand.
