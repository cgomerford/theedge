-- batter_contact_profile: how a hitter's batted balls break down by quality and by spray direction. Counts, not rates, so
-- any window can be added up and every rate shown on a page can show its n. Behind the Batting Lab "Contact" tab and the
-- Contact Engine leaderboard (/mlb/lab/contact); nothing is computed from Savant in a render path.
--
-- Single writer: .github/workflows/contact-profile.yml (scripts/build_contact_profile.py)
--
-- One row per batter x season x period. period = 'season' (month = 0) or 'month' (month = 3..11, the calendar month of
-- game_date). `month` is not in the first spec of the table: a 'month' row needs it to be unique.
--
-- A batted ball is counted only when Statcast gave it ALL of launch_speed_angle, bb_type, hc_x and hc_y (99.6% of balls in
-- play in a 5-day 2026 spot check), so every group below adds up to n_bbe:
--   weak + topped + under + flare_burner + solid + barrel = n_bbe          (launch_speed_angle 1..6, codes checked against exit
--                                                                           velocity, launch angle and xwOBA on contact)
--   gb + air = n_bbe                                                       (gb = ground_ball; air = fly_ball + line_drive + popup)
--   pull_gb + straight_gb + oppo_gb = gb ;  pull_air + straight_air + oppo_air = air
-- Spray direction from hc_x/hc_y: angle = atan2(hc_x - 126.5, 199 - hc_y) in degrees, with hc_x mirrored around 126.5 for
-- left-handed batters so a pulled ball is always on the negative side. pull < -15 degrees <= straight <= +15 < oppo.
-- (126.5 = the centre where mirrored pull rates of right- and left-handed batters match in 2026 data; 199 = home-plate row.
--  Moving the plate row 7 px moves the league pull share about 2 points.)
-- Switch hitters are mirrored pitch by pitch from the `stand` of that pitch.
create table if not exists batter_contact_profile (
  batter_id     int          not null,
  season        int          not null,
  period        text         not null,
  month         smallint     not null default 0,
  name          text,
  team          text,        -- his latest batting team of that season
  n_bbe         int          not null,
  weak          int          not null,
  topped        int          not null,
  under         int          not null,
  flare_burner  int          not null,
  solid         int          not null,
  barrel        int          not null,
  gb            int          not null,
  air           int          not null,
  pull_gb       int          not null,
  straight_gb   int          not null,
  oppo_gb       int          not null,
  pull_air      int          not null,
  straight_air  int          not null,
  oppo_air      int          not null,
  updated_at    timestamptz  not null default now(),
  primary key (batter_id, season, period, month)
);
create index if not exists batter_contact_profile_window on batter_contact_profile (season, period, month);
