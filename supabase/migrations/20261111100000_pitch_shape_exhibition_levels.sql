-- Pitch Shape Lab: the Arizona Fall League ('afl') and Spring Training ('st').
--
-- DRAFT FOR GEORGE TO REVIEW AND RUN (Supabase SQL editor). Run it AFTER 20261109120000_pitch_shape_milb.sql and 20261110100000_pitch_shape_milb_results.sql, BEFORE the import.
-- It changes no data. It does two things to the seven existing minor-league tables, and creates nothing new:
--
--   1. The `level` check constraint on every table allowed only ('aaa', 'fsl'). It now allows ('aaa', 'fsl', 'afl', 'st'). The old constraint is found by what it checks, not by
--      its generated name, so this is safe whatever Postgres called it. Existing Triple-A and Florida State League rows already satisfy the new rule, so nothing is rewritten.
--   2. pitch_shape_pitcher_milb.slot (a pitcher's average arm angle) was NOT NULL. Spring Training and the Arizona Fall League have no arm angle, so a pitcher there is stored with
--      slot = null: pending, never a made-up number. Triple-A and Florida State League rows keep their arm angle.
--
-- The tables stay separate from the MLB ones, so an exhibition row can never be read into an MLB cohort. Both new levels are still level-only: read only against rows of the same level.
-- Single writer is unchanged: scripts/import-milb-pitch-shape.ts (--level=st and --level=afl, with --write --confirm-project=<ref>). Rows are written by it and nothing else.
-- Safe to run twice.

do $$
declare
  t text;
  c text;
begin
  foreach t in array array[
    'pitch_shape_bins_milb', 'pitch_shape_cells_milb', 'pitch_shape_pitcher_milb', 'pitch_shape_milb_coverage', 'pitch_shape_milb_runs',
    'pitch_shape_results_milb', 'pitch_shape_results_pitcher_milb'
  ] loop
    -- drop whichever check constraint on this table tests `level` (its generated name is not assumed)
    for c in
      select con.conname from pg_constraint con
      where con.conrelid = to_regclass('public.' || t) and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%level%'
    loop
      execute format('alter table %I drop constraint %I', t, c);
    end loop;
    execute format('alter table %I add constraint %I check (level in (''aaa'', ''fsl'', ''afl'', ''st''))', t, t || '_level_check');
  end loop;
end $$;

alter table pitch_shape_pitcher_milb alter column slot drop not null;

-- Check afterwards (read-only):
--   select conrelid::regclass as tbl, pg_get_constraintdef(oid) from pg_constraint
--   where conname like 'pitch_shape_%_level_check' order by 1;     -- seven rows, each listing aaa, fsl, afl, st
--   select is_nullable from information_schema.columns where table_name = 'pitch_shape_pitcher_milb' and column_name = 'slot';   -- YES
