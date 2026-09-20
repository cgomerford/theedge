# Scout Report rebuild — session recap (2026-09-18 → 09-19)

The old tabbed Scout Report was archived and rebuilt as a **12-section dashboard** at
`/mlb/[slug]/scout-report`. All 12 sections are live. This file records what exists, where the
data comes from, what still needs attention, and how to pick it back up.

## What changed at a glance

- **Archived** (kept for reference, unused): `src/components/archive/ScoutSlotAsync.tsx`,
  `ScoutReportTab.tsx`, `ScoutExpandCharts.tsx`. Their child cards and the `lib/` data functions
  were left in place. See `src/components/archive/README.md`.
- **New UI**: `src/components/scout/` (sections, shared charts, client components).
- **New data layer**: `src/lib/scout/` (one module per section, plus shared helpers).
- **New pipeline**: `scripts/fetch_game_situations.py`, `scripts/sql/add_game_situations.sql`,
  `.github/workflows/fetch-game-situations.yml`.
- **Layout**: sticky section nav on the left; each section is a card with **away | home columns**;
  dense sections use `Tabs` so the page isn't one long scroll. Sections stream independently
  under `<Suspense>`.
- **Page**: `src/app/mlb/[slug]/scout-report/page.tsx` resolves the game, then renders
  `<ScoutReport game gameDate isPro />`.

## The 12 sections

Registry and tiers live in `src/components/scout/sections.ts`; bodies are wired in
`ScoutReport.tsx` (`SECTION_BODIES`). Tiers: **Free** §1–3, **Free teaser** §12, **Pro** §4–11.

| # | Section | Component → lib | Main sources |
|---|---|---|---|
| 1 | Club status desk | `ClubStatusSection` → `club-status.ts`, `affiliates.ts`, `recent-games.ts`, `workload.ts` | MLB 40-man roster status, `team_transactions`, boxscores (last played + line), `bullpen_availability`, `pitcher_workload_daily`; Triple-A / Double-A rosters + boxscores |
| 2 | Form vs skill trends | `FormTrendsSection` + `StatExplorer` → `team-trends.ts`, `stat-explorer.ts`, `game-starts.ts` | Savant pitch CSV (team batting, cached as per-game sums in `savant_fetch_cache`), MLB team game log, Savant team leaderboards for baselines |
| 3 | Bullpen intelligence | `BullpenSection`, `BullpenPanels` → `bullpen-desk.ts`, `bullpen-trends.ts` | `bullpen_availability`, `pitcher_workload_daily`, `bullpen_inning_reports`, MLB reliever game logs (one batched call) |
| 4 | ABS challenge desk | `ABSSection`, `Leaderboard`, `SituationViews` → `abs-desk.ts`, `situations.ts` | `abs_challenge_log` (MLB feed). Savant's ABS leaderboard endpoint was returning 500, so it isn't used |
| 5 | Run game vs catcher/pitcher | `RunGameSection` → `run-game.ts`, `situations.ts` | Savant pop-time + sprint-speed leaderboards, MLB fielding/pitching/hitting stats, `sb_attempt_log` |
| 6 | Defense & alignment | `DefenseSection` → `defense.ts` | Savant pitch CSV (`if_/of_fielding_alignment`), `batter_spray`, Savant OAA, `team_defense` |
| 7 | Platoon · home/road · day/night | `SplitsSection` → `splits.ts` | MLB `statSplits` (vl/vr/h/a/d/n), one batched call per club |
| 8 | Park factors deep | `ParkSection` → `park-deep.ts` | Savant Statcast Park Factors (table parsed from page HTML), `park_factors` |
| 9 | Pitcher attack deep | `PitcherAttackSection` + `PitcherAttack` → `pitcher-attack.ts` | `pitcher_count_tendency`, `pitcher_pitch_sequencing`, `pitcher_zone_arsenal` |
| 10 | Lineup vs SP deep | `LineupVsSpSection` → `lineup-vs-sp.ts` | `batter_hot_zones`, `batter_zone_arsenal`, `batter_spray`, existing `batterZoneFit` |
| 11 | Leverage & late tendencies | `LeverageSection` → `leverage.ts` | MLB team `statSplits` (lc/risp/risp2/ig07), standings, reliever logs, ABS/SB logs |
| 12 | Manager card | `ManagerCardSection` → `manager-card.ts` | Composes §1, 3–8, 10 into ≤8 watch-fors per club |

### Notable features

- **StatExplorer** (§2 and §3 Trends): pick any of 20 offense / 14 bullpen stats, rolling window
  (1, 3, 5, 7, 10, 15 games), both clubs side by side, expandable tiles. A "Why a rolling window?"
  explainer is in the UI. **Pro layers**: overlay (other club, or another stat with the same
  units), and "flag games where a player started" (with-vs-without summary). Free: dots on
  every game.
- **Bullpen "Rest & fatigue"**: pen innings in the prior 3 days vs runs allowed, days of rest vs
  the next outing, previous-outing pitch count vs the next outing. Splits under 8 outings fade.
- **Defense**: an explainer panel (shift ban; Standard / Strategic / Infield shade) and a
  schematic scaled infield diagram (hollow = standard spot, orange = shaded). The diagram is a
  convention, not tracked coordinates — the page says so.
- **Manager card**: free users see the first 3 watch-fors per club; the rest are placeholders
  and the locked text is never sent to the browser. Every item restates numbers with their
  sample; wording is descriptive, never an instruction.

## Design rules used throughout

- Every rate carries its **n**; cells under a minimum are **faded**, never read into. Gates are
  exported constants (`MIN_*`) in each lib module.
- No invented odds/predictions. Where data isn't published it is omitted and the page says so
  (pitcher time-to-home, leverage index, exact fielder coordinates).
- Charts: dependency-free server-rendered SVG (`charts/LineChart.tsx`, `charts/Atoms.tsx`) using
  the dataviz reference palette (blue `#2a78d6`, orange `#eb6834`, neutral stone). Native
  `<title>` hover; client JS only where interaction needs it (`Tabs`, `StatExplorer`,
  `PitcherAttack`, `Leaderboard`, `Headshot`).
- Headshots fall back to the club logo when MLB has no photo (`Headshot.tsx`).

## Data pipeline added

`scripts/fetch_game_situations.py` makes one pass over each final game's feed and upserts:

- `abs_challenge_log` — plus new columns `balls, strikes, outs, base_state, bat_diff`
  (count is the count **before** the challenged pitch)
- `sb_attempt_log` — new table: per steal attempt, with the count **before the pitch the runner
  went on**, outs, inning, score margin, steal-of base, success

Run once: `scripts/sql/add_game_situations.sql` in the Supabase SQL editor, then backfill with
`python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>`.
`.github/workflows/fetch-game-situations.yml` runs it daily at 09:30 UTC.
(As of the end of this session the SQL and backfill **had been run** — counts/situations views
show real data.) The older `postgame-officiating.yml` still runs the old speculative
`build_abs_challenge_log.py`; that is probably why the log had stopped at 9/10 before.

## Local development

- `page.tsx` sets `isPro = subscriber.is_pro || NODE_ENV === 'development'`, so local dev shows
  every Pro section and chart layer. A deployed build is `production`, so real gating applies.
  Remove/keep that line deliberately before shipping.
- `src/proxy.ts` has `MAINTENANCE_MODE = true` (non-home pages need the dev bypass cookie).
- The Chrome test tab is treated as **hidden**, so React's batched Suspense reveal never fires
  there and streamed sections look stuck on their skeletons. It's a test-browser artifact, not an
  app bug. `curl` with the bypass cookie, or rendering a section with `renderToStaticMarkup`, is
  the reliable way to check output.

## Known gaps / next ideas

- **Cold-load speed**: the first request after a cache expiry takes ~10–15s (Savant pulls for §2
  and §6). Cached aggregates make repeat loads fast. A cron that warms `scout-team-trend:v2:*`
  and `scout-alignment:v1:*` would remove the wait.
- **§10 bench bats / pinch-hit threats** are not included yet.
- **Bullpen history** covers the arms on today's bullpen list only (relief outings for the
  club); arms who left aren't in it.
- **Savant ABS leaderboard** (`/leaderboard/abs-challenges`) was returning a 500 error page;
  `lib/abs-challenges.ts` (used elsewhere) depends on it.
- **Minor-league headshots** are mostly missing at MLB; the logo fallback covers it.
- Possible next steps: warm-cache cron, pinch-hit/bench section for §10, per-arm leverage
  entry from the game feed, a shared "print / export" view of the manager card.

## Key files

- Registry / shell: `src/components/scout/sections.ts`, `ScoutReport.tsx`, `ScoutSection.tsx`
- Shared client components: `Tabs.tsx`, `StatExplorer.tsx`, `PitcherAttack.tsx`, `Leaderboard.tsx`, `Headshot.tsx`
- Shared charts/atoms: `charts/LineChart.tsx`, `charts/Atoms.tsx`, `SituationViews.tsx`
- Shared libs: `stat-explorer.ts` (rolling windows), `situations.ts` (count/outs/margin
  buckets + SB loader), `workload.ts` (single "taxed arm" rule shared by §1 and §3)

---

# Iteration 2 (2026-09-19, later) — what was added

## Needs running before the new data shows (in this order)
1. Supabase SQL editor: `scripts/sql/add_sb_batter_context.sql` and `scripts/sql/add_late_inning_log.sql`
   (**run these before pushing the script change** — the daily `fetch-game-situations` workflow will
   otherwise try to write a `batter_id` column that doesn't exist yet and drop that day's steal rows).
2. Backfill: `python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>`
   (`--dry-run` first; it now writes 4 tables: `abs_challenge_log`, `sb_attempt_log`,
   `sb_opportunity_log`, `late_inning_log`).
3. `python3 scripts/fetch_batter_hot_zones.py` (or wait for the weekly job) — adds wOBA / exit velocity /
   hard-hit per zone. The toggle buttons for those stay greyed until at least one hitter has them.
4. Optional: `scripts/sql/add_player_contracts.sql`. MLB publishes **no contract data**, so the
   "contract expires this season" flag only appears for players you put in `player_contracts`.

## Changes by section
- **§1 Club status**: ★ drafted by the club (the draft matching `draftYear`, so unsigned earlier picks don't
  count), birth-country flag, EXP marker (needs `player_contracts`), and a "Roster makeup" block —
  lefties/righties, power / balanced / small ball, age buckets + averages, drafted / born-abroad counts.
  `lib/scout/roster-profile.ts` (one batched MLB call per club, 6h cache). Hitter-type rule and its
  thresholds are exported constants at the top of that file and printed in the UI.
- **§5 Run game**: "Who was at the plate when they ran" (attempts, safe, chances, steal-of-2B rate per
  chance vs the club's overall rate) + a catcher arm-vs-exchange scatter (`charts/Scatter.tsx`).
  A "chance" = a PA that began with a runner on 1st and 2nd open (`sb_opportunity_log`).
- **§6 Defense**: "i" popover explaining OAA. Player OAA = season total across all clubs; club OAA =
  outs earned while on that club, so they won't reconcile after trades. Verified against the live Savant CSV
  (no duplicate player rows; DB club totals differ from a by-current-team sum for that reason).
- **§8 Park**: "i" popover (what each index means, why bars go left/right), axis legend on the bars,
  and a 9-spoke radar (`charts/Radar.tsx`, dashed ring = 100). Did **not** verify FanGraphs' own numbers
  (couldn't fetch them) — the copy only says its method/window differ.
- **§9 Pitcher attack**: readout under the count table — "When the count is 3-0, X has thrown …".
  Confirmed the count is the count **before** the pitch (`aggregate_count_tendency`).
- **§10 Lineup**: metric toggle (Edge / AVG / SLG / xwOBA / wOBA / EV / Hard hit / Pitches) that recolours
  every hitter's zone map for both lineups (`ZoneMetric.tsx`, React context; nothing refetches).
  "Number of pitchers" was read as **pitches seen** — change if you meant something else.
- **§11 Leverage**: new tab "Late innings & this matchup" — runs by inning 7th→extras (season vs this
  opponent, from schedule linescores), who the bullpen uses in the 7th/8th/9th and how often they enter
  protecting a 1–3 run lead, and each club's relievers vs tonight's opponent. Shows the relationship
  (division / league / interleague) and meeting count, and flags <5 meetings as a small sample.
  Reliever data needs `late_inning_log` (checked against a real boxscore).
- **§12 Manager card**: now a game sheet — WHEN (situation) → what the numbers show → source, plus a late-innings
  row, up to 10 rows, and a **Print** button (print CSS shows only this section, one club per page, ruled
  note line under each row). Check it in the browser print preview.

## Not built yet
- **X card**: HTML mockup only — `mockups/x-scout-card.html` (1200×675, three reads, ~190-char post, link in
  the reply). Awaiting approval before it becomes a React component / `html-to-image` export.
- Scatter/radar candidates not done: sprint speed vs attempts (runners), OAA by position (radar).
- Contract data source (see above).
