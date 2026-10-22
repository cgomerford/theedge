-- pitch_shape_locations: where league pitches cross the plate, keyed to where they sit on the movement map. The Pitch
-- Shape Lab's location panel (beside the movement heat map) reads these; nothing is computed from Savant in a render path.
--
-- Single writer: .github/workflows/shape-locations.yml (scripts/build_pitch_shape_locations.py)
--
-- One row per SEASON x pitch type x pitcher hand (span = '2024', '2025', '2026'), like pitch_shape_cells.
--   bins  flat integer array, five numbers per occupied (movement bin, location cell):
--           [hb2, iv2, lx, lz, pitches, hb2, iv2, lx, lz, pitches, ...]
--         hb2 / iv2 = movement in 0.5 inch bins, floor(inches x 2): hb is arm-side positive (left-handed pitchers
--         flipped), iv = induced vertical break (same conversions as pitch_shape_cells). The bin covers
--         [hb2/2, hb2/2 + 0.5) inches.
--         lx / lz = location cell in the BATTER's frame: lx 0..23 across, inside on the left, 0.166 ft wide, with the
--         rulebook zone (+-0.83 ft) exactly columns 7..16 (plate_x flipped for left-handed batters); lz 0..27 up, one
--         tenth of the batter's own zone height each, padded 0.12 ft top and bottom for the ball, so the zone is exactly
--         rows 9..18. Pitches outside the grid are counted in the nearest edge cell.
--   n_pitches  every pitch counted in the row
create table if not exists pitch_shape_locations (
  span        text         not null,
  coord_era   text         not null,
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  bins        jsonb        not null,
  updated_at  timestamptz  not null default now(),
  primary key (span, coord_era, pitch_type, p_throws)
);
