# Pitch and Bat Models — Build Spec

Oct 15, 2026 · @George

The Edge will build two of its own models: **Stuff Grade** (how good a pitch is from its physical traits alone) and **Bat Grade** (how good a hitter is from swing, contact and decision quality). Both predict the run value a pitch or swing *should* produce, ignoring what actually happened, and publish on the 20-80 scouting scale (50 = league average, 10 points = one standard deviation).

Outputs and where they appear:

| Output | Grain | Used on |
| --- | --- | --- |
| Stuff Grade per pitch type | Pitcher × pitch type × season | Arsenal table, Breakout Radar, Scout Report |
| Stuff Grade overall | Pitcher × season (usage-weighted) | Breakout Radar, player page, Process vs Results |
| Bat Grade + 4 component grades | Hitter × season | Breakout Radar, player page |
| Swing decision value | Hitter × season, zone grid | Swing Decisions page |
| Stabilisation thresholds | Metric | Signal Meter |

Naming: "Stuff Grade" and "Bat Grade", not "Stuff+", which is FanGraphs' branded metric. Every surface labels them as The Edge's own models with a link to the method.

## Data inputs

One source: the Baseball Savant Statcast search CSV, one row per pitch, roughly 700k rows per season, pulled with pybaseball in daily chunks. Training uses 2023–2025 for Stuff Grade and 2024–2025 for Bat Grade (bat tracking starts in 2024); 2026 is the held-out test season.

Columns below are expected, not confirmed. Step one is a curl of one day's CSV and a header dump; field names in code come from that output only.

| Column (expected) | Used for |
| --- | --- |
| `pitcher`, `batter`, `game_date`, `game_pk`, `at_bat_number`, `pitch_number` | Keys, ordering, time-based splits |
| `pitch_type`, `p_throws`, `stand`, `balls`, `strikes` | Pitch grouping, handedness, count |
| `release_speed`, `release_spin_rate`, `spin_axis`, `release_extension` | Stuff features |
| `pfx_x`, `pfx_z` | Horizontal and induced vertical break |
| `release_pos_x`, `release_pos_z` | Release side and height |
| `vx0`, `vy0`, `vz0`, `ax`, `ay`, `az` | Vertical and horizontal approach angle |
| `arm_angle` | Stuff feature, if present |
| `plate_x`, `plate_z`, `sz_top`, `sz_bot` | Zone and location (Location and decision models only) |
| `description`, `events`, `type` | Swing, take, whiff, foul, in-play labels |
| `delta_run_exp` | Run value of each pitch |
| `estimated_woba_using_speedangle`, `launch_speed`, `launch_angle` | Expected contact value |
| `bat_speed`, `swing_length` | Bat Grade (2024+) |

Attack angle and swing path tilt may only exist on Savant leaderboards, not the pitch CSV; confirm during the curl step and fall back to season-level joins if so.

## Stuff Grade model

Three LightGBM regressors (fastballs, breaking balls, offspeed) predict each pitch's expected run value from physical traits only; the prediction is then scaled to 20-80.

### Pitch groups

| Group | Statcast `pitch_type` codes |
| --- | --- |
| Fastballs | FF, SI, FC |
| Breaking | SL, ST, CU, KC, SV, CS |
| Offspeed | CH, FS, FO, SC |

Drop pitchouts, eephus, knuckleballs, position-player pitching and rows with missing tracking values.

### Features

1. **Raw shape:** `release_speed`, `release_spin_rate`, `spin_axis`, `pfx_x`, `pfx_z` (converted to inches), `release_extension`, `release_pos_x`, `release_pos_z`, `arm_angle` if present.
2. **Approach angles:** vertical and horizontal approach angle at the plate, computed from the velocity and acceleration components.
3. **Fastball differentials** (breaking and offspeed models only): velocity gap, vertical-break gap and horizontal-break gap versus the pitcher's primary fastball that season (most-thrown of FF/SI/FC).
4. **Handedness:** mirror `pfx_x`, `release_pos_x` and `spin_axis` for left-handers so one model serves both; keep `p_throws` and `stand` as features to capture platoon effects.
5. **Excluded:** plate location and count. Those belong to a later Location Grade model; leaving them out keeps the grade about the pitch, not where it was thrown.

### Target

v1 target = pitch run value with luck removed:

- Balls, called strikes, whiffs, fouls: `delta_run_exp` as given.
- Balls in play: replace the actual outcome with the expected value from exit velocity and launch angle (`estimated_woba_using_speedangle` converted to runs), so defence and BABIP luck don't train the model.

v2 (later): a classification approach predicting swing, whiff, called strike and contact-quality probabilities, then mapping those to run values. Less noisy, more work.

### Training

- Split by season: train 2023–2024, validate 2025, test 2026. Never split randomly; it leaks a pitcher's own pitches across sets.
- LightGBM regression, early stopping on the validation season; tune leaves, learning rate and minimum rows per leaf.
- Save each model with its feature list and `method_version` (e.g. `stuff_v1.0`).

### Scaling to the 20-80 scale

Flip the sign (lower run value is better for a pitcher), standardise against all pitches in the season, then map:

```
Grade = 50 + 10 × (mean_xRV − xRV) / sd_xRV
```

where xRV is predicted run value per 100 pitches. Per-pitch-type grades use that pitch's average xRV; the overall pitcher grade is the usage-weighted average across the arsenal. Clamp displayed grades to 20–80 and round to the nearest 5 on fan-facing surfaces, keeping the exact number for Pro tables.

## Bat Grade model

Bat Grade combines four component grades, each its own model, into one 20-80 grade; fans see the four components as bars beside the total so the reason for a grade is visible.

| Component | Question | Model | Output per hitter |
| --- | --- | --- | --- |
| Bat quality | How fast and well-shaped is the swing? | Regress expected contact value (xwOBA on contact) on `bat_speed`, `swing_length`, plus attack angle/tilt if available | Average predicted value per competitive swing |
| Contact ability | Does he make contact more than expected? | Classifier: whiff probability from pitch traits, Stuff Grade, location and count | Expected whiffs minus actual whiffs, per 100 swings |
| Contact quality | When he connects, how hard and at what angle? | Descriptive: xwOBA on contact, barrel rate, squared-up rate | Rate stats vs league |
| Swing decisions | Does he swing at the right pitches? | Two regressors: run value if swung at, run value if taken, from location, count, pitch group and Stuff Grade | Runs gained by his choices per 100 pitches; zone grid |

### Swing decision detail

For every pitch: decision value = (run value of the choice he made) − (run value of the alternative). Swings get the expected swing value; takes get the expected take value; sum per hitter and scale per 100 pitches. Using Stuff Grade as an input means chasing an elite slider costs less than chasing a hanger. Known bias to note on the page: dangerous hitters see fewer strikes, which inflates their scores.

Only "competitive" swings count for bat quality: exclude check swings, bunts and two-strike defensive swings below a bat-speed floor (threshold set from the data).

### Combining into Bat Grade

Fit a ridge regression of a hitter's **next-season** run value per PA on his four component scores (2024 components → 2025 results). The fitted weights become the formula; refit each offseason. Scale the combined score to 20-80 with the same formula as Stuff Grade (higher is better, no sign flip).

With only two seasons of bat tracking, v1 weights are provisional; publish them and expect them to move after 2026 data is added.

## Validation and acceptance criteria

A model ships only when it beats the simple stat it replaces on the held-out season; results go in a one-page validation report saved with the model version.

| Test | Stuff Grade passes if | Bat Grade passes if |
| --- | --- | --- |
| Stickiness | Year-to-year correlation of pitcher grade (min 500 pitches both years) is higher than ERA's | Year-to-year correlation higher than wOBA's |
| Predictive power | Season N grade predicts season N+1 K−BB% and xERA better than season N ERA does | Season N grade predicts N+1 wOBA better than season N wOBA does |
| Early-season signal | Grade after 300 pitches predicts rest-of-season xERA better than ERA at the same point | Grade after 100 PA predicts rest-of-season wOBA better than wOBA at 100 PA |
| Face validity | Top 20 pitch types include widely recognised elite pitches; no obvious nonsense | Top 20 hitters look sensible; component bars match known profiles |
| Calibration | Mean predicted run value ≈ mean actual run value by pitch group | Same, by component |

### Stabilisation thresholds (for the Signal Meter)

For each grade, split each player's pitches or PAs into random halves at increasing sample sizes and find where split-half reliability reaches 0.7. Those sample sizes become the Early / Settling / Reliable cut-offs in `stat_stabilisation`. Public benchmarks to sanity-check against: pitch-quality grades settle around 80 pitches, location-aware grades around 400.

## Pipeline

Training happens offline on the Mac once per offseason; GitHub Actions only scores new pitches nightly with the saved models and writes per-player grades to Supabase.

### Repo layout

```
models/
  data/            # Parquet pitch files by season (gitignored)
  artifacts/       # saved models: stuff_fb_v1.0.txt, stuff_br_v1.0.txt, ...
  reports/         # validation report per method_version
  src/
    fetch_pitches.py      # pybaseball pulls → Parquet, by day
    features.py           # shared feature builder (train + score use the same code)
    train_stuff.py
    train_bat.py
    validate.py           # tests from the validation section
    score_nightly.py      # loads artifacts, scores yesterday, writes snapshots
```

### Training (offline, offseason)

1. `fetch_pitches.py` backfills seasons to Parquet in the `venv` (Python 3.9; LightGBM, pandas or Polars, pyarrow).
2. `features.py` builds the feature table; the same function is imported by scoring so features can never drift.
3. `train_stuff.py` / `train_bat.py` fit and save models with feature lists and `method_version`.
4. `validate.py` writes the report; ship only if every acceptance test passes.
5. Commit artifacts (small text files for LightGBM) and bump `method_version`.

### Scoring (nightly cron)

1. Pull yesterday's pitches only (incremental; never full-season pulls).
2. Append to the season Parquet in Supabase Storage (or the runner cache), not as raw rows in Postgres.
3. Score new pitches, recompute season aggregates for affected players.
4. Upsert `pitch_type_grades`, `player_process_snapshot` and `hitter_decision_snapshot`; insert a `model_runs` row.
5. On any failure: log with `console.error`-equivalent output, write the failed run, leave the last good snapshot in place.

In-season, scoring runs nightly; retraining runs once each offseason, or mid-season only if calibration drifts (mean predicted vs actual off by more than 10%).

## Schema additions

Two new tables plus new columns on snapshot tables already proposed in the main build document; lock these before any code.

| Table | Status | Key columns | Notes |
| --- | --- | --- | --- |
| `pitch_type_grades` | New | player_id, season, pitch_type, as_of, pitches, usage_pct, xrv_per_100, stuff_grade, method_version | Feeds the arsenal table and Radar |
| `model_runs` | New | run_id, model (stuff/bat), method_version, run_at, rows_scored, status, error | One row per nightly scoring run |
| `player_process_snapshot` | Add columns | stuff_grade, bat_grade, bat_quality_grade, contact_ability_grade, contact_quality_grade, decision_grade, method_version | Already holds flags and stabilised_state |
| `hitter_decision_snapshot` | Add column | method_version | Already holds decision_runs and zone_grid |
| `stat_stabilisation` | Seed rows | stuff_grade, location_grade, bat_grade and each component | Thresholds come from the validation step |

Indexes: `(player_id, season, pitch_type)` on `pitch_type_grades`; `(model, run_at desc)` on `model_runs`.

## Phased task checklist

Stuff Grade ships first because Bat Grade's decision and contact models use it as an input. Each phase ends at a gate before the next starts.

**Phase A — Verify data (gate: column list confirmed)**

- [ ] Curl one day of the Statcast CSV; save the header list
- [ ] Confirm `delta_run_exp`, `arm_angle`, `bat_speed`, `swing_length` exist and how far back
- [ ] Check whether attack angle / swing tilt are pitch-level or leaderboard-only

**Phase B — Stuff Grade prototype (gate: fastball model passes validation)**

- [ ] Backfill 2023–2026 to Parquet
- [ ] Build `features.py` (shape, approach angles, mirroring, fastball differentials)
- [ ] Train and validate the fastball model alone
- [ ] Write the first validation report

**Phase C — Stuff Grade complete (gate: all three groups pass)**

- [ ] Train breaking and offspeed models
- [ ] Scaling to 20-80; per-pitch-type and overall grades
- [ ] Stabilisation thresholds; seed `stat_stabilisation`

**Phase D — Ship Stuff Grade (gate: schema locked, mockup approved)**

- [ ] Lock `pitch_type_grades` and `model_runs`
- [ ] `score_nightly.py` + GitHub Actions workflow (and confirm cron registration)
- [ ] Swap the arsenal table's grade column to Stuff Grade; add it to Breakout Radar

**Phase E — Bat Grade (gate: all four components pass)**

- [ ] Swing decision model (swing value + take value)
- [ ] Contact ability (whiff classifier)
- [ ] Bat quality and contact quality
- [ ] Ridge combination fitted on 2024 → 2025; validate on 2026

**Phase F — Ship Bat Grade**

- [ ] Extend nightly scoring; add columns to snapshots
- [ ] Swing Decisions page and Bat Grade component bars on the player page

## Risks and open questions

**Risks**

- Bat tracking has only two full seasons (2024–2025), so Bat Grade weights will be unstable at first.
- Pitch classification changes (Savant relabelling sweepers and slurves) can shift group membership between seasons; map codes explicitly per season.
- Savant CSV columns or limits can change without notice; the nightly job must fail loudly and keep the last good snapshot.
- Grades will disagree with FanGraphs Stuff+ for some pitchers. That's expected; the method page explains why.

**Open questions**

- [ ] Store season Parquet in Supabase Storage or the GitHub Actions cache?
- [ ] Show grades for pitchers below the Reliable threshold, or hide them until they settle?
- [ ] Is a Location Grade (count-aware placement) worth adding as a third model after Bat Grade?

**Sources**

- [Stuff+, Location+ and Pitching+ primer](https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer) (FanGraphs Library) — scaling convention and stickiness
- [Examining the Reds' top pitches by the pitching model](https://redscontentplus.com/2023/04/examining-the-reds-top-pitches-according-to-the-pitching-model/) — stabilisation points
- [aStuff+ v2 preview](https://adamsalorio.substack.com/p/astuff-v2-preview) — regression vs classification pitch models
- [A closer look at swing decision metrics](https://adamsalorio.substack.com/p/a-closer-look-at-swing-decision-metrics) — swing/take run-value framework and its bias
- [Which player has the best swing?](https://adamsalorio.substack.com/p/which-player-has-the-best-swing) — bat tracking release dates and swing-quality modelling
- [Exploratory data analysis into Swing+ and bat tracking](https://adamsalorio.substack.com/p/exploratory-data-analysis-into-swing) — bat speed, collision efficiency, swing decisions
