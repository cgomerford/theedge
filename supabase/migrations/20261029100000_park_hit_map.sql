-- Every hit (single, double, triple, home run) hit at a ballpark, last 3 seasons, for the park heatmap on the game page.
-- Written only by scripts/compute-park-hits.ts (single writer).
-- points: flat integer array, 3 numbers per hit: [x_ft, y_ft, kind, ...]
--   x_ft  feet right (+) or left (-) of the line from home plate to straight-away centre field
--   y_ft  feet out from home plate toward centre field
--   kind  1 single, 2 double, 3 triple, 4 home run
create table if not exists public.park_hit_map (
  venue_id    integer primary key,
  seasons     text    not null,
  n_hits      integer not null,
  through     date    not null,      -- latest game date in the data
  points      jsonb   not null,
  updated_at  timestamptz not null default now()
);

alter table public.park_hit_map enable row level security;
-- No policies: read and written with the service role only.
