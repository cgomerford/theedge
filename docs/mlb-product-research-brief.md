# x9Lab (formerly The Edge): MLB product research brief

Purpose: a map of what is already built in the MLB product (Game Preview, Scout Report, Post-Game Report, Pitching Lab, Batting Lab, ABS Challenges, and the data pipeline behind them) so a research agent can see what exists, what each piece answers, where the code lives, and what gaps and constraints to respect.

How this was produced: from the code in the working tree on `pivot/0a-lean-out` as of 2026-10-17, mainly file header comments, the section registries and the cron/script inventory. It is a survey, not a line-by-line audit. Anything marked **(verify)** should be checked in the code or live data before it is relied on.

---

## 0. Product frame and hard rules

- **What it is:** a multi-sport analytics platform that turns advanced stats into tables, charts and graphics casual fans can read, with enough depth for hardcore and fantasy users. MLB is live; NFL is built out; NHL/NBA are future. Prose narrative is supporting, not the core format.
- **Audience positioning:** between expert tools (Savant, FanGraphs, databallr, PFF) and narrative outlets (The Athletic): clear visuals, transparent factors, depth on demand.
- **Content rules (non-negotiable):**
  - Not a betting/tips product, and no prediction language. Scout vocabulary only: The question · The story so far · Availability · Usage & role · How they win · Where they're vulnerable · What changed · Matchup notes · Situational · Venue · X-factor · What to watch · What we flagged, what happened. Banned words live in `scripts/checks/copy-lint.ts`.
  - The raw internal composite score is never public (no lean, tilt, factor count or win-probability displays).
  - **Empty state over fabricated data, always.** Every data function returns `null`/`[]` on failure with a `[fnName]` prefixed log.
  - Descriptions of what happened, with the sample size behind them, not predictions. Footnote source and method on every chart.
- **Tiers:** Free page first; Pro "expands" it. Pro is gated on the server (`isProViewer()` / `requirePro()`); `isPro` is a required prop, never defaulted. Locked state shows a feature list and no numbers.
- **Architecture rule:** precompute is the architecture: `cron → Python/TS script → Supabase table → page reads cached rows`. Never fetch Savant CSVs in a render path (2 MB Next.js fetch-cache ceiling; caused past timeouts and `ECONNRESET`). Single writer per table.
- **Stack:** Next.js 16 App Router (breaking changes vs. older Next; docs in `node_modules/next/dist/docs/`), TypeScript, Recharts only, Supabase (Postgres), Python in GitHub Actions (`pybaseball`, Savant CSVs, MLB Stats API), Resend email, Vercel hosting, custom session cookie auth. Stripe is blocked pending business verification.
- **Brand note:** product is now **x9Lab**. Some internal names still carry the old brand ("Edge Indicator", "Edge+", `edge_predictions`, `/why-edge`); domain `edgereportdaily.com` is unchanged until a new one is verified.

---

## 1. Game Preview (`/mlb/[slug]`)

**Role:** the core product, the pre-game page for one game. Rebuilt 2026-09-18 into a single scroll (no tabs); the old tabbed shell is archived in `src/components/archive/`.

**Layout (top to bottom):** site header and live ticker → home team panel | away team panel | Edge Indicator → series header bar with `JumpNav` anchors → player stats of the series + series highlights | 3 Key Players → postgame reports of the series.

**Pieces**
- **Team panels:** `TeamPitcherCard`, `TeamBatterCard`, `TeamSnapshotCard`, plus `PitcherRadarMiniCard` / `BatterRadarMiniCard` (percentile bars, top pitch, mini hot-zone). Clicking a mini card opens the full `StartingPitcherPanel` / `BattingPanel` in a `DetailModal` overlay.
- **Edge Indicator** (`EdgeIndicatorPanel`, `components/archive/EdgeIndicator.tsx`): factor rows that open a detail modal with explanation and source. Underlying model is internal; public surfaces must follow the no-score rules.
- **Key Players** (`key-players*.ts`, `KeyPlayersSlotAsync`, cron `key-players-snapshot` every 30 min): three key players with factors, rating and a short narrative.
- **Series context:** `SeriesTeamStats`, `SeriesTopPerformers`, `SeriesMomentum`, `SeriesPostgameLinks`, with libs `series-*.ts` and precomputed `series_games` / `series_stats` workflows.
- **`GameBriefBanner`, `ShellPlaceholder`:** still-shelled items per the page header: each pitcher's last 5 starts and team-level series highlight stats (LOB/K/BB/RISP trends).
- Related routes: `/mlb/[slug]/scout-report`, `/postgame`, `/print`, `/share`.

**Performance pattern:** slow server data goes behind `<Suspense>` (`ScoutSlotAsync` halved stream time).

**Open items (from project notes):** finish removing dead hot-streak/`scoutInputs` block in `page.tsx`; move remaining live-fetched Savant/MLB calls to nightly crons (temporary stubs in place); extend `throttledMlbFetch` (max 6 concurrent) beyond `streaks.ts`; mobile pass.

---

## 2. Scout Report (`/mlb/[slug]/scout-report`)

**Role:** the deep pre-game dashboard. Sticky section nav on the left, full-width section cards, each split away | home. Built one section at a time; registry is `src/components/scout/sections.ts`, section bodies are wired in `ScoutReport.tsx` (`SECTION_BODIES`), each wrapped in `<Suspense>`. A cold Savant pull behind §2 takes about 10 s.

All 12 sections are `live`:

| # | Section | Tier | What it shows |
|---|---|---|---|
| 1 | Club status desk | Free | Injuries/IL/likely scratches, last-7-day transactions, rest days, availability grid |
| 2 | Form vs skill trends | Free | L7/L15/L30 rolling xwOBA or OPS vs season baseline, barrel/hard-hit/K–BB trend sparklines, "hot or noise" call with n |
| 3 | Bullpen intelligence | Free | Pitches/IP per arm (L3, L7), role map, sharp-vs-overworked flags, lefties vs tonight's bench, empty states |
| 4 | ABS challenge desk | Pro | See §6 |
| 5 | Run game vs catcher/pitcher | Pro | Catcher pop time/exchange/arm vs league, SB attempt and success vs this catcher with n; no invented odds |
| 6 | Defense & alignment | Pro | IF/OF alignment mix (Standard/Strategic/Shade), where they shade vs tonight's pull hitters, OAA leaders |
| 7 | Platoon · home/road · day/night | Pro | Full splits for both lineups and both SPs |
| 8 | Park factors deep | Pro | Runs/HR/wOBA factors, day/night/roof |
| 9 | Pitcher attack deep | Pro | Count × pitch matrix, count spot map, "what's next" transition strip, vs LHH/RHH splits |
| 10 | Lineup vs SP deep | Pro | Zone clash cards, chase/whiff/swing by pitch family, spray lean; min-n gate on every cell |
| 11 | Leverage & late tendencies | Pro | How the bullpen enters with the tying/go-ahead run on, late-and-close offense, high-leverage challenge/SB aggression |
| 12 | Manager card | Teaser | 6–8 plain-language watch-fors; free users see the first few, rest blurred |

**Key libs:** `scout-bundle.ts`, `scout-inputs.ts`, `scout-matchup.ts`, `scout-diagnostic.ts`, `scout-report-lineup.ts`, `scout/` folder, `umpire-scouting.ts`, `batter-zone-arsenal.ts`, `hot-zones*.ts`, `pitcher-sequencing.ts`, `bullpen*.ts`, `sb-tendency.ts`, `parks.ts`/`venue-*.ts`, `fielding-*`.

**Known limits:** `umpire-scouting.ts` only counts games involving the supplied team's season games, so the umpire profile reflects "how this ump has called games involving this team", not a league-wide season; the file itself recommends a nightly cron. The "full shift" is banned, so alignment is shown as Standard/Strategic/Shade.

---

## 3. Post-Game Report (`/mlb/[slug]/postgame`)

**Role:** the "what we flagged, what happened" loop. Data layer `src/lib/postgame.ts` plus `src/lib/postgame/*` (one file per section). Sections registry `components/postgame/report/sections.ts`. Dev preview at `/dev/postgame-preview/[gamePk]`.

- **Free (1–13):** Final · How the game swung (win probability) · Top performers · Box score · The scorecard (every PA) · Starters: plan vs night · Spray & contact · ABS & challenges · Bullpen used · Defense & run game · Umpire report · Key players scorecard · Next up.
- **Pro (14–22):** Pitchers: was anything concerning? · What's next break (sequencing audit) · Did the put-away spot hold? (count audit) · Zone clash result · Full arsenal night chart · Hitters: hot, cooling, or turning a corner? · Leverage timeline · Team & game charts · Into tomorrow (Scout teaser).
- **Source:** MLB Stats API live feed (`hitData` for EV/launch/distance, `pitchData.startSpeed`, spin rate which can be null and is then excluded). Win probability and leverage index come from MLB's feed.
- **Delivery:** post-game recap email cron (polls finished games every 15 min via `check-finished-games`, bearer auth, dedup in `postgame_email_log`); X graphic cards rendered with `next/og` (1600×900) in `src/lib/postgame/cards/`; `postgame-officiating` workflow.

---

## 4. Pitching Lab (`/mlb/pitching-lab`, `/mlb/pitching-lab/[playerId]/*`)

**Role:** search any pitcher and see real arsenal, movement, count tendency, sequencing, hot zones and trends. Pro-gated per player: the `[playerId]/layout.tsx` shows `LabLocked` unless `isProViewer()`.

**Tabs (routes under `[playerId]`):** Overview (bio, percentile rankings, radar, career stats, year-on-year trend, vs-teammates, similar-arsenal finder) · `arsenal` (pitch mix donut, movement chart, velo band by start) · `stuff` (Edge+ grade) · `location` (Location Lab: hot zones, `PitchDensityHeatmap`, `ZoneGrid`, `HotZoneOverlay`) · `sequencing` (`SequenceExplorer`) · `overlay` · `h2h` (`TopBattersFaced`, `NextStartScouting`) · `trends` (`TrendsCharts`, `ReleaseChart`, `VeloBandChart`).

**Notable analytics**
- **Edge+** (`src/lib/edge-plus.ts`, `EdgePlus*` components): the app's own 0–100 composite pitch grade, explicitly not the industry Stuff+. Inputs are real percentiles vs the same-pitch-type league pool (min 20 pitches): velo, movement, whiff %, hard-hit %, xwOBA, put-away %, spin, extension. The four "stuff" weights come from an OLS regression (`scripts/derive_edge_plus_weights.py`, N=3,066 pitcher×pitch-type rows; movement's weight was floored low because its coefficient was noisy/slightly negative). Formula is shown, not hidden.
- **Sequence Explorer:** true prev→next pitch and zone transitions by count, rebuilt from the raw pitch log (`game_pk`, `at_bat_number`, `pitch_number`), with optional batter filter. Richer than the weekly `pitcher_pitch_sequencing` table (type-only).
- **Next-start scouting:** next confirmed probable start, opposing lineup (confirmed or last game's nine), career numbers vs this pitcher per batter.
- **Similar pitchers**, **teammate comparison**, **venue and team records**, **TTO splits v2**, **arm-angle tracking**, **pitcher workload/fatigue**.
- **Share cards:** `LineupH2HShareCard` (PNG via `html-to-image`).

**Key libs:** `pitcher-*.ts` (arsenal, pitch-log, statcast-profile, sequencing, similarity, next-start, start-trends, venue-record, workload, percentiles), `pitch-*.ts` (arsenal-fetch, splits, velocity, physical/type percentiles), `pro-lab-pitcher.ts`, `pitching-lab-context.tsx`.

**Caveats:** `pro-lab-pitcher.ts` was written against Savant `statcast_search` column names that had not been curl-verified at the time ("FIELD VERIFICATION REQUIRED"); confirm headers against a live response before extending. Per project rules, field names come from live responses, never memory. A newer design doc, `docs/pitch-and-bat-models-build-spec.md` (Oct 15, 2026), plans **Stuff Grade** and **Bat Grade** models to supersede/extend Edge+; read it for the intended direction (names chosen to avoid FanGraphs' "Stuff+").

---

## 5. Batting Lab (`/mlb/batting-lab`, `/mlb/batting-lab/[playerId]/*`)

**Role:** batter-side mirror of the Pitching Lab. Routes: Overview · `arsenal` · `hot-zones` · `location` · `reaction` · `sequencing` · `h2h` · `trends`.

- **Overview:** real season stats, percentiles vs every qualified hitter, radar, bat speed and contact quality (bat speed, EV, xwOBA-minus-wOBA "loud outs", per-pitch-type miss distance on swinging strikes).
- **Arsenal:** `BatterArsenalFullTable` (results vs each pitch type); zone-by-pitch-type breakdown (`batter-zone-arsenal.ts`, `batter_zone_arsenal` table).
- **Hot zones / swing heatmap:** `BatterHotZoneOverlay`, `BatterSwingHeatmap`, table `batter_hot_zones`, situational zones by count.
- **Reaction window:** physics of time-to-plate: `(60.5 − release extension) / velocity`, using the selected pitcher's real per-pitch averages; Savant `effective_speed` shown as a disclosed cross-check; ~150 ms swing / ~200 ms reaction are labelled as widely-cited averages, not Statcast fields.
- **Sequencing:** `BatterSequenceExplorer`. **Trends:** `BatterEVLaunchTrend` (exit velo/launch over time).
- **H2H (`BatterH2H`):** the batter's team's next series, career H2H vs each confirmed probable starter and any pitcher he has faced, career splits vs every opponent; manual pitcher search as a fallback.
- **Share cards:** `BatterSeriesH2HShareCard`, `BatterCountBreakdownShareCard`.
- **Key libs:** `batter-*.ts` (statcast, arsenal-stats, bat-speed, spray, sprint-speed, pitch-log, team-record, venue-record, next-series, fielding), `batting-lab-context.tsx`, `pro-lab-batter.ts` (same unverified-column caveat as the pitcher file).

---

## 6. ABS Challenges (`/mlb/abs` and the ABS sections elsewhere)

**What ABS is:** the Automated Ball-Strike challenge system, introduced for 2026. Teams challenge a ball/strike call; the question is who uses challenges, how often they succeed, and when.

**Surfaces**
- **`/mlb/abs` page:** 2×2 grid (`AbsChallengeGrid`, shared with the MLB homepage via `MlbDeepDives.tsx`, so one data layer serves both) plus a page-only all-round radar/leaderboard (`AbsRadarSection`).
- **Scout Report §4 (Pro), `ABSSection.tsx`:** both clubs across four tabs: *Rate & success* (challenges per game, overturn rate for season, last 15, and league, plus rolling trends) · *Who challenges* (batter- vs catcher/pitcher-initiated split, which players call for the review) · *When* (inning groups 1–3 / 4–6 / 7+; leverage is not published so inning group stands in and is labelled so) · *Watch-fors* (plain sentences: information, not advice). Every rate carries its n; thin cells are faded.
- **Post-Game §8 "ABS & challenges"** (`postgame/abs.ts`, `AbsSection.tsx`) and **umpire report** (missed calls; "a call counts as missed when an ABS challenge overturned it, or if not challenged, the tracked pitch was in/out of the zone").
- **Admin:** an ABS log feeds in-game X cards.

**Data pipeline**
- **`abs_challenge_log`** (per-pitch, one row per challenge): single writer `scripts/fetch_abs_challenge_log.py` (replaces speculative `build_abs_challenge_log.py`). Source is MLB's live feed: a playEvent with `isPitch=true` and `reviewDetails.reviewType == "MJ"` (other codes like "MA" are pre-ABS replay reviews and excluded). Stores challenger (`player`), `challengeTeamId`, overturned flag, derived `challenge_side` (batting vs fielding team, from `about.isTopInning` and team ids), plus raw `pX`/`pZ`, zone top/bottom, call. Schema `scripts/sql/create_abs_challenge_log.sql` and `add_abs_challenge_location.sql`.
- **Miss-distance estimate:** computed in the app from raw location. On 122 challenges (2026-09-08..10) a 1.45-inch ball-radius rule reproduced MLB's final call 84% of the time (side edges 55/57, top/bottom 48/65), so distances are approximate near the top and bottom edges. `abs-challenge-log.ts` constants: a failed challenge on a pitch about 3 inches or more from the edge "earns nothing".
- **`abs_challenge_team_leaderboard`:** daily team record via `scripts/fetch_abs_challenge_leaderboard.py` (single writer), workflow `fetch-abs-challenge-leaderboard.yml`. Savant's own ABS leaderboard CSV started returning HTTP 500 in Sept 2026 (curl-verified), which blanked the page boxes; the page now reads the precomputed table. `abs-challenges.ts` reads it.
- **Cache note:** the per-pitch log query uses `cache: 'no-store'` so progress notes ("X of ~Y indexed") stay live during backfill. Aggregation is in JS rather than an RPC (a few thousand rows a season).
- A past incident: an ABS log query stampede took Supabase down (commit `2092a24`); keep query volume low.

**Research directions suggested by the data:** challenge value by leverage and inning; catcher vs batter success; which zones/edges are overturned; team conservation strategy (challenges remaining vs use); umpire accuracy interaction.

---

## 7. Data pipeline and tables (what feeds the above)

**Vercel crons (`vercel.json`):** refresh pitcher stats and team stats (05/10 UTC); log and grade predictions; refresh lineups (14/17/20/23); send daily brief (12:00); key-players snapshot (every 30 min); check finished games (every 15 min); series top-3 snapshot (13/17/21).

**GitHub Actions workflows (`.github/workflows/`):** compute-regression-watch, daily-pitch-refresh, fetch-abs-challenge-leaderboard, fetch-batter-profiles, fetch-bullpen-availability, fetch-game-situations, fetch-h2h-pitcher, fetch-pitch-velocity-range, fetch-player-form, fetch-series-context, fetch-team-batted-ball / -defense / -platoon / -pull-tendency, fielding-run-value, hot-zones, nightly-bullpen-reports, nightly-pitcher-workload, nightly-standings, nightly-statcast-events, postgame-officiating, series-games-refresh, series-stats-refresh, statcast-history-backfill, team-transactions, weekly-pitcher-splits, plus front-office and NHL/NFL syncs.

**Key Supabase tables read by MLB pages (not exhaustive):** `pitch_arsenals`, `pitcher_stats`, `pitcher_zone_arsenal`, `pitcher_count_tendency`, `pitcher_pitch_sequencing`, `pitcher_workload_daily`, `pitch_velocity_range`, `batter_hot_zones`, `batter_zone_arsenal`, `player_form_signals`, `player_statcast_history`, `player_fielding_run_value`, `bullpen_availability`, `team_stats`, `team_platoon_splits`, `team_defense`, `team_transactions`, `mlb_standings`, `key_players_snapshot`, `game_previews`, `regression_watch`, `abs_challenge_log`, `abs_challenge_team_leaderboard`, `savant_fetch_cache` (caches small aggregates of live Savant pulls), `edge_predictions` (internal model output), `subscribers`/`sessions`.

**Gotchas that affect any new research or build**
- Supabase `numeric` columns return strings: coerce with `Number()`. PostgREST caps at 1,000 rows: paginate or use an RPC.
- MLB Stats API rejects bursts from one process (`ECONNRESET`): throttle to 6 concurrent.
- Statcast CSVs can carry a UTF-8 BOM that corrupts the first header: strip it. Savant truncates a CSV at 25,000 rows: window the pulls. Savant uses "AZ" where the app uses "ARI".
- Wrong MLB endpoint once produced empty stat columns: verify the endpoint returns the fields you need.
- Python scripts: print a 5-row sample and give an abort window before any upsert; support dual dotenv naming; must run on Python 3.9.
- Cron timing dependencies matter (e.g. regression watch must run after the pitcher-stats refresh).
- Tailwind v4/Turbopack responsive classes are unreliable: use inline styles or `<style>` with plain `@media`.

---

## 8. Cross-cutting design and delivery

- **Design system:** `DESIGN_SYSTEM.md`. Red Hat for headers/body/bold, JetBrains Mono for light labels; 14px rounded cards; cream `#FAF8F3`, orange `#FF5722`, yellow `#FDE047`, ink `#1A1A1A`; shared building blocks in `src/components/team/ui.tsx` (`Section`, `Card`, `Tile`, `RankBars`, `rankTone`) and Recharts-only charts. Always use the `next/font` CSS variables, never a literal family name.
- **Exports:** DOM-captured cards via `html-to-image`; server-rendered X graphics via `next/og`; admin video/story pipeline (`ffmpeg.wasm`, Remotion, `captureStoryToMp4`). Admin dashboard cards: scout graphic, game preview teaser, in-game pitcher/batter cards, postseason bracket, trending, stat line, and the new team snapshot.
- **Email:** Resend daily pre-game digest and post-game recap, bearer-token cron auth, dedup tables.
- **Other MLB areas (not covered above):** player pages (`/mlb/players/[id]`), team pages (redesigned: hero, ranks among 30, Pro Statcast trends), Front Office / GM Lab, fantasy hub (start/sit, streamers, two-start, trade desk, minors), glossary, leaders, scores, regression watch.

---

## 9. Suggested research questions for a deep-research agent

1. **Competitive depth:** where do Savant, FanGraphs, Baseball Prospectus, Brooks Baseball, databallr and The Athletic already cover each section above, and which sections are genuinely differentiated (ABS desk, Reaction Window, Sequence Explorer, post-game "plan vs night")?
2. **Model validity:** how does Edge+ (and the planned Stuff Grade / Bat Grade) compare in method and predictive validity with Stuff+, PitchingBot and Pitch Grades? Which stabilisation thresholds should gate each metric (the Signal Meter idea)?
3. **ABS science:** published analyses of ABS challenge value, optimal challenge usage, zone definitions (rule-book vs ABS zone, top/bottom edge accuracy) and league-wide 2026 results; validate the 1.45-inch ball-radius estimate.
4. **Data availability:** which currently live-fetched inputs (Savant CSVs, MLB feed) can move to precompute, and which public sources (e.g. catcher pop time, bat tracking, umpire schedules) are unavailable or unstable.
5. **Presentation for casual fans:** best-practice visual patterns for translating each advanced metric, honest small-sample handling, and glossary wording, all within the no-prediction, no-betting rules.
6. **Gaps:** items still shelled (last 5 starts, series highlight trends), mobile rendering, Pro tier column and Stripe gating, league-wide umpire profile.

> Constraint to pass along with any research task: findings must be descriptive (what happened, with the sample), never predictive or betting-adjacent; no raw internal score on public surfaces; and any external field name must be verified against a live response before code is written.
