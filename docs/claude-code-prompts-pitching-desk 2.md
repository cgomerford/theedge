# Pitching Desk — Build Plan & Claude Code Prompts

Front Office › Pitching Desk. The approved look is `mockups/front-office-pitching-desk.html` (copy it into the repo before Prompt 0).

## What the page is

A cockpit for one team's pitching staff. You start wide (the whole staff on one board), pick a pitcher, and every tool below re-reads the same controls: pitcher, time window, batter side, and comparison. Each chart has a method drawer, a pin, and PNG export, so a fan can build and share their own read the way an analyst builds a report.

Route: `/mlb/front-office/[team]/pitching` (confirm against the existing Front Office route in Prompt 0). Tab label: "Pitching desk".

## The three key factors (v1)

| Factor | The front-office question | Tools |
| --- | --- | --- |
| §01 Stuff & shape | Is the raw material good? | Arsenal table, Movement profile, Release point, Shape comps |
| §02 Execution & results | Is he getting what his stuff deserves, and does he control it? | ERA vs estimators, Luck check, Location by pitch, Command & discipline, Pitch mix by count, Rolling form |
| §03 Durability & trajectory | Will it hold up inside a start, across a season, over a contract? | Velocity by appearance, Times through order, Velocity within a start, Workload, Arm angle trend |

Plus §00 Staff board (sortable staff table + Process vs results scatter) as the entry point, and the shared cockpit pieces: analyst controls, Signal Meter, method drawers, notebook tray, PNG export.

## On the bench (later releases, in order)

Edge Stuff Grade · Pitch design lab · Arsenal optimiser · Role & platoon fit · Prospect arms (Triple-A Statcast) · Control & value · Reclamation radar · My scout report.

## Pro gating

| Free | Pro |
| --- | --- |
| §00 Staff board, Process vs results, pitcher header KPIs, Arsenal table | Movement, Release, Shape comps, all of §02 and §03, notebook export |
| PNG export of free cards, with an edgereportdaily.com footer | PNG export of any card, no footer |

Enforced server-side with the existing `getCurrentSubscriber()` / `isPro`. Free users never receive Pro data in the payload.

## Data sources

| Source | What we take | Notes |
| --- | --- | --- |
| Baseball Savant pitch-level CSV | Velo, movement, spin, release, extension, arm angle, location, count, description, delta_run_exp, xwOBA | Reuses `models/` Parquet pipeline from the Stuff Grade build |
| Savant leaderboards | Active spin, expected stats (xERA), arm angle, percentile context | Curl-verify each before parsing |
| MLB Stats API | Season and game-log pitching lines (BF, K, BB, HBP, HR, IP, pitches), transactions (IL), roster, birthdates | Free, no auth |
| Edge calc | FIP, xFIP, SIERA, VAA, release spread, shape comps, rolling windows | Computed by us from public formulas |
| FanGraphs | Link out only | Their terms don't permit redistributing bulk leaderboard data, and Stuff+/PitchingBot are their products. We compute estimators ourselves and build our own Stuff Grade. |

Before charging for any of this, review MLBAM's data terms for commercial use. That's a separate check from the build.

---

## Prompt 0 — Primer (paste first)

```
We're building the Front Office "Pitching Desk" for The Edge. Read these before anything else:
- mockups/front-office-pitching-desk.html (approved mockup, sample data)
- docs/claude-code-prompts-pitching-desk.md (this plan)
- docs/pitch-and-bat-models-build-spec.md (shared pitch-level pipeline)

Then:
1. Find the existing Front Office team page route and components (the "Phillies Front Office" page with Roster Blueprint, WAR, Age profile tabs). Show me the route, the page file and how team is resolved.
2. Summarise in 10 lines how you'll fit the Pitching Desk in as a new tab.

Rules for this workstream:
- Diagnose before patching. Field names only from live responses I've verified, never from docs.
- One file per message; show it and wait for my confirmation.
- Exact find/replace blocks for edits; full files for new files.
- Schema locked before code. Show SQL, never run it.
- Precompute cron before page wiring: pages read single indexed rows, never live Savant/MLB fetches.
- Functions return null / [] on failure with console.error. No fabricated fallback values; empty states say what's missing.
- createAdminClient() has no Database generic: explicit type casts on every query.
- Supabase env: support NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL/SUPABASE_SERVICE_KEY with fallback.
- No FanGraphs data ingestion. No betting language. Stuff Grade shows "—" until our model ships.

No code in this step.
```

---

## Phase 1 — Data

### Prompt 1 — Verify every endpoint

```
Verify every data source before any parser. For each, show the exact curl or Python call, the response's field list, and 3 sample rows. Write nothing except models/scratch/ check scripts.

1. Savant pitch-level CSV (already verified in the models build): confirm these exist for 2026: arm_angle, release_extension, spin_axis, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, sz_top, sz_bot, zone, balls, strikes, description, delta_run_exp, estimated_woba_using_speedangle, n_thruorder_pitcher (or equivalent), pitch_number, at_bat_number, game_pk.
2. Savant leaderboards (CSV export URLs): active spin, expected statistics for pitchers (xERA), arm angle, pitch arsenal stats. Find the CSV URL for each from the page's export link.
3. MLB Stats API:
   - /api/v1/people/{id}/stats?stats=season,gameLog&group=pitching&season=2026 for Cristopher Sánchez (MLBAM id: look it up) — list every stat field.
   - /api/v1/transactions for PHI over the 2026 season — show how IL placements and activations are typed.
   - League pitching totals for 2026 (needed for FIP constant and league HR/FB).

STOP. Give me one table: source → fields we'll use → confirmed (yes/no) → notes.
```

### Prompt 2 — Schema (SQL only)

```
Write a Supabase migration (don't run it) for the Pitching Desk. Every table has season, as_of, and window ('season','l30','l15','l5') where relevant; side ('all','R','L') where relevant.

- fo_pitch_staff: team_id, player_id, season, window, role, throws, age, ip, bf, k, bb, hbp, hr, gb, fb, bip, era, fip, xfip, siera, xera, k_pct, bb_pct, kbb_pct, csw_pct, whiff_pct, babip, lob_pct, hr_fb, fb_velo_delta, as_of
- fo_pitch_arsenal: player_id, season, window, side, pitch_type, pitches, usage_pct, velo, ivb, hb, spin, active_spin_pct, vaa, extension, arm_angle, whiff_pct, xwoba, rv_per_100, rel_x, rel_z, as_of
- fo_pitch_points: player_id, season, window, pitch_type, points jsonb (downsampled ≤150 per type: hb, ivb, rel_x, rel_z)
- fo_pitch_league_avg: season, pitch_type, velo, ivb, hb, spin, active_spin_pct, vaa, extension, whiff_pct, xwoba, and SD columns for each
- fo_pitch_discipline: player_id, season, window, side, zone_pct, chase_pct, zcontact_pct, swstr_pct, csw_pct, fps_pct
- fo_pitch_location: player_id, season, window, side, pitch_type, grid jsonb (5×5: count, whiffs, swings, xwoba_sum)
- fo_pitch_count_mix: player_id, season, window, state ('first','ahead','even','behind','two_strikes'), mix jsonb {pitch_type: pct}
- fo_pitch_comps: player_id, season, pitch_type, comps jsonb [{player_id, name, throws, velo, ivb, hb, similarity, whiff_pct, rv_per_100}]
- fo_pitch_game_log: player_id, game_pk, game_date, days_rest, pitches, bf, k, bb, csw, velo_by_type jsonb, arm_angle, rel_z
- fo_pitch_il_stints: player_id, start_date, end_date, description
- fo_pitch_tto: player_id, season, tto (1,2,3), bf, xwoba
- fo_pitch_velo_decay: player_id, season, bucket ('1-25','26-50','51-75','76-100','100+'), pitch_type, velo
- fo_league_pitch_context: season, k_pct, bb_pct, kbb_pct, csw_pct, zone_pct, chase_pct, zcontact_pct, swstr_pct, fps_pct, babip, lob_pct, hr_fb, gb_pct, era, fip_constant, tto jsonb
- stat_stabilisation seed rows: k_pct 70 BF, bb_pct 170 BF, gb_pct 70 BIP; babip, lob_pct, hr_fb flagged multi_season

Indexes on (player_id, season, window[, side]) and (team_id, season, window) for fo_pitch_staff.

STOP for my review.
```

### Prompt 3 — Cron A: staff board & estimators

```
Write scripts/fo/sync_pitch_staff.py (Python 3.9):
1. For each team's active pitchers (MLB Stats API roster), pull season and game-log pitching lines.
2. Build each window from the game log (season, last 30 days, last 15 days, last 5 appearances).
3. Compute FIP (constant from league totals), xFIP (league HR/FB × his fly balls), SIERA (published formula). Show me each formula in a docstring and print one worked example for Sánchez before writing to the DB.
4. Join xERA from the Savant expected-stats CSV; whiff and CSW from the pitch Parquet.
5. fb_velo_delta = primary fastball velo this season minus last season (null if no prior season).
6. Upsert fo_pitch_staff and fo_league_pitch_context.

Show the file. STOP. Then dry-run for PHI only and print the table.
```

### Prompt 4 — Cron B: arsenal, shapes & league averages

```
Write scripts/fo/sync_pitch_arsenal.py, reading the season Parquet from the models pipeline (don't re-download):
- Per pitcher × pitch type × window × side: pitches, usage, velo, IVB/HB in inches (mirror HB for lefties so arm side is positive), spin, extension, arm angle, whiff% (whiffs/swings), xwOBA, RV/100 (−sum(delta_run_exp)/pitches×100, pitcher's view positive).
- VAA at the front of the plate from vy0/vz0/ay/az — reuse the function in models/src/features.py, don't duplicate it.
- Release centre (rel_x, rel_z) per pitch type.
- Join active spin from the Savant leaderboard.
- League averages and SDs per pitch type → fo_pitch_league_avg.
- Downsample plot points to ≤150 per pitch type with a fixed seed → fo_pitch_points.

Show the file. STOP. Dry-run for Sánchez and print his arsenal next to the mockup's sample values so we can sanity-check ranges.
```

### Prompt 5 — Cron C: location, discipline, count mix

```
Write scripts/fo/sync_pitch_execution.py from the same Parquet:
- 5×5 location grid per pitch type × window × side, scaled to each batter's sz_top/sz_bot (inner 3×3 = zone). Store counts, swings, whiffs, xwoba_sum so the UI can switch metrics without refetching.
- Discipline: zone%, chase%, z-contact%, swstr%, CSW%, first-pitch strike%. Define each from description codes and show me the mapping before coding.
- Count mix by state (first pitch, ahead, even, behind, two strikes).
Upsert fo_pitch_location, fo_pitch_discipline, fo_pitch_count_mix.

Show the file. STOP.
```

### Prompt 6 — Cron D: shape comps

```
Write scripts/fo/sync_pitch_comps.py:
- League pool: every pitcher-pitch type with ≥100 pitches this season.
- Features: velo, IVB, HB (mirrored), spin, extension, arm angle, VAA, z-scored within pitch type.
- For each pitcher's pitch types: 5 nearest neighbours by Euclidean distance (exclude himself). similarity = round(100 × exp(−distance)).
- Store with each comp's whiff% and RV/100.
Use scikit-learn NearestNeighbors. Show the file. STOP. Print Sánchez's changeup comps for a face-validity check.
```

### Prompt 7 — Cron E: durability

```
Write scripts/fo/sync_pitch_durability.py:
- fo_pitch_game_log: per appearance — date, days rest (from previous appearance), pitches, BF, K, BB, CSW%, average velo per pitch type, average arm angle, average release height.
- fo_pitch_il_stints from MLB Stats API transactions, using the IL type codes confirmed in Prompt 1.
- fo_pitch_tto: xwOBA by times through the order.
- fo_pitch_velo_decay: primary fastball velo by pitch-count bucket.
Show the file. STOP.
```

### Prompt 8 — Workflow

```
Write .github/workflows/fo-pitching-desk.yml: runs nightly during the season after the Stuff Grade scoring job (it shares the Parquet). Order: sync_pitch_staff → sync_pitch_arsenal → sync_pitch_execution → sync_pitch_comps (weekly only) → sync_pitch_durability. Each step fails loudly; a failed step doesn't wipe yesterday's rows.
Also tell me whether this needs registering anywhere else we keep crons (we once had a cron missing from vercel.json). Don't edit other files.
STOP.
```

---

## Phase 2 — Page

### Prompt 9 — Route, shell and controls

```
Build the Pitching Desk page shell to match the mockup:
- New tab in the existing Front Office team page; route per Prompt 0.
- Layout: section index rail (left, sticky) + content. Sticky analyst controls: Pitcher select, Window (Season / Last 30d / Last 15d / Last 5 apps), Batter side (All / vs RHB / vs LHB), Compare with.
- Controls live in the URL (?p=&w=&side=&cmp=) so a view is shareable; server reads them.
- Server Component fetches only what the current pitcher/window/side needs, with isPro deciding which sections' data is fetched at all.
- Use the site's existing tokens, fonts and card styles. Match the mockup's spacing and § markers.

Diagnose first: show me which existing components (tabs, team banner, cards) we can reuse. Then one file per message.
```

### Prompt 10 — ChartCard, Signal Meter, export

```
Build two shared components:

1. <ChartCard title source[] method pro>: header with title/subtitle, source chips, buttons (Method, Pin, PNG). Method opens an inline drawer. PNG uses html-to-image (already in the stack): pixelRatio 2, excludes the tool buttons, filename the-edge-{team}-{pitcher}-{card}.png. Free users' exports get a small edgereportdaily.com footer added before capture. Pro-locked cards render an <UpgradeCard> instead of children, server-side.

2. <SignalMeter n threshold />: Early (<50%), Settling (<100%), Reliable, with a tooltip "n of ~threshold". Thresholds come from stat_stabilisation, not hard-coded.

Show each file separately. STOP after each.
```

### Prompt 11 — Notebook tray

```
Build <NotebookTray>: a client component pinned to the bottom of the page. Pins come from ChartCard's Pin button via React context. Shows count and titles, Clear, and "Export pinned as PNG" (exports each pinned card in order). Pro only; free users see the tray with an upgrade prompt when they pin.
No localStorage for v1; pins live for the session. Show the file. STOP.
```

### Prompt 12 — §00 Staff board

```
Build §00 from the mockup:
- <StaffBoard>: sortable table (Pitcher, Role, Age, IP, K−BB%, CSW%, Whiff%, xERA, ERA, ERA−xERA, FB Δ, Stuff Grade "—"). Cell shading by SD vs league for the role. Row click sets ?p=.
- <ProcessVsResults>: Recharts scatter, xERA vs ERA, diagonal reference line, selected pitcher highlighted, click to select.
Reads fo_pitch_staff + fo_league_pitch_context. Free. Show one file per message.
```

### Prompt 13 — §01 Stuff & shape

```
Build §01:
- <ArsenalTable>: columns per mockup; shading vs fo_pitch_league_avg SDs; row click focuses a pitch type in the two plots. Free.
- <MovementPlot>: points from fo_pitch_points, pitch means, dashed league-average rings (toggle), arm-angle line, compare pitcher shown as hollow diamonds. Pro.
- <ReleasePlot>: release points, spread and extension summary. Pro.
- <ShapeComps>: pitch-type toggles, comps table with similarity meters, caption comparing his RV/100 to the comp average. Pro.
Recharts for scatters if it can match the mockup; otherwise plain SVG. One file per message.
```

### Prompt 14 — §02 Execution & results

```
Build §02 (all Pro):
- <EraLadder>: ERA, FIP, xFIP, SIERA, xERA on one axis with league ERA reference.
- <LuckCheck>: K%, BB%, GB%, BABIP, LOB%, HR/FB vs league with gap shading and SignalMeter.
- <LocationGrid>: 5×5 SVG grid with zone box; toggles for pitch type and metric (frequency, whiff%, xwOBA) computed client-side from the stored counts; respects batter side.
- <DisciplineBars>: diverging bars from league average.
- <CountMix>: stacked bars by count state.
- <RollingForm>: K−BB% or CSW% over 3/5/10 appearances, BF-weighted, with 70 BF and 170 BF markers.
One file per message.
```

### Prompt 15 — §03 Durability & trajectory

```
Build §03 (all Pro):
- <VeloByAppearance>: per pitch type lines, IL stints shaded, velocity flag (primary fastball last-3 average ≥1.0 mph below season mean).
- <TimesThroughOrder>, <VeloWithinStart>, <WorkloadBars> (coloured by days rest).
- <ArmAngleTrend>: per-outing arm angle with ±1 SD band, drift flag when last-5 average moves >1° from season mean.
Copy line under the section: "Public tracking trends only, not a medical assessment." One file per message.
```

### Prompt 16 — Analyst's reads

```
Each section ends with an "Analyst's read": 2–3 plain-English sentences generated from the data with templates, no LLM for v1.
Write src/lib/fo/reads.ts with one function per section taking the section's data and returning a string. Rules: factor language only, no betting words ("picks", "locks", "value", "odds"), never mention the internal Edge Score, always say when a stat hasn't stabilised. Include unit tests for 3 pitcher profiles. Show the file. STOP.
```

### Prompt 17 — QA pass

```
QA the Pitching Desk:
1. Mobile at 390px: rail hidden, controls wrap, tables scroll inside their cards.
2. Logged-out and free user: confirm Pro sections render UpgradeCard and the page payload contains no Pro data (check the RSC payload).
3. Empty states: pitcher with <50 pitches, reliever with no starts, pitcher with no prior season (FB Δ "—").
4. PNG export on every card, free footer present for free users.
5. URL state: reload with ?p=&w=&side= restores the view.
Report each as pass/fail with what you checked. Fix nothing without showing me first.
```
