-- Second Look: the same summary as second_look_summary, but also split by the pitch the FIRST at-bat OPENED with, so the page can say
-- "the first time through he opened with a four-seam and the at-bat ended in a strikeout on a slider; what did he open with the second time?"
-- League scope only, looks 2 and 3 together. Written only by scripts/build_second_look_summary.py (the same script that writes second_look_summary).
-- About 3,000 rows at most. Creates one empty table; nothing else is touched.
create table if not exists public.second_look_open_summary (
  season integer not null,
  p_throws char(1) not null,
  stand char(1) not null,
  ab1_first_pitch_type text not null,
  ab1_result_class text not null check (ab1_result_class in ('K', 'BB', 'HIT', 'OUT_IN_PLAY', 'OTHER')),
  ab1_final_pitch_type text not null,
  n_pairs integer not null,
  n_opened_same integer not null,
  n_opened_other integer not null,
  first_pitch_mix jsonb not null,
  endings_same jsonb not null,
  endings_other jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, p_throws, stand, ab1_first_pitch_type, ab1_result_class, ab1_final_pitch_type)
);
alter table public.second_look_open_summary enable row level security;
