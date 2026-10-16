-- Front Office · team snapshot (roster, WAR, age profile, prospects). Run once in the Supabase SQL editor.
--
-- TABLE OWNERSHIP (single writer):
--   team_front_office_snapshot -> scripts/compute_team_front_office.py
--
-- One row per club per season; `roster` and `prospects` are jsonb arrays (one element per player).
-- Contracts are NOT stored here: they live in player_contract_seasons (create_front_office.sql),
-- loaded by scripts/load_contracts_csv.py.

create table if not exists team_front_office_snapshot (
  team_id   integer     not null,
  season    smallint    not null,
  as_of     timestamptz not null default now(),
  roster    jsonb       not null,
  prospects jsonb       not null,
  primary key (team_id, season)
);
