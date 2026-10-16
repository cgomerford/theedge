-- retire_nfl_edge_tables.sql
-- Run ONCE in the Supabase SQL editor (George). Phase 0A, 8 Oct 2026.
-- Backs up and drops the two empty lean tables. Does NOT touch public.edge_predictions
-- (MLB narratives, story and fantasy still read it).
-- The whole thing is one transaction: if the check below RAISEs, nothing changes.

begin;

do $$
declare n_factors bigint; n_hist bigint;
begin
  if to_regclass('public.nfl_edge_factors') is null or to_regclass('public.nfl_edge_score_history') is null then
    raise exception 'retire_nfl_edge_tables: one or both tables are already gone; nothing to do (rolled back).';
  end if;
  select count(*) into n_factors from public.nfl_edge_factors;
  select count(*) into n_hist from public.nfl_edge_score_history;
  if n_factors > 0 or n_hist > 0 then
    raise exception 'retire_nfl_edge_tables: refusing to drop, tables are not empty (nfl_edge_factors=%, nfl_edge_score_history=%)', n_factors, n_hist;
  end if;
end $$;

create schema if not exists archive;
create table archive.nfl_edge_factors_20261008 as table public.nfl_edge_factors;
create table archive.nfl_edge_score_history_20261008 as table public.nfl_edge_score_history;

drop table public.nfl_edge_factors;
drop table public.nfl_edge_score_history;

commit;
