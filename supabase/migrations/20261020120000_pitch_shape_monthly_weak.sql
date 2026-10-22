-- pitch_shape_monthly: adds n_weak, the count of balls in play that Savant classes as Weak or Topped
-- (launch_speed_angle 1 or 2, its two lowest quality-of-contact classes) among the same balls in play counted
-- by n_bbe. Weak contact % = n_weak / n_bbe.
-- Same single writer as the table (scripts/build_pitch_shape_monthly.py via shape-monthly.yml).
-- Nullable: rows written before this stay NULL until the next run; the page shows an empty state for them.
alter table pitch_shape_monthly add column if not exists n_weak int;
