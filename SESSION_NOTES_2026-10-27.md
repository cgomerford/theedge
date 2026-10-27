# SESSION NOTES — 2026-10-27 (Pitching Lab / Batting Lab / Scout Report / Postgame rebuild)

Read this first in a fresh session. It replaces the long chat. All work is committed on branch `audit-snapshot`
(nothing pushed, merged or deployed). Latest commit when this was written: `70439a5`.

## 0. How to work with George (still in force)

- George is a novice dev. Explain the why. One concern at a time, confirm before moving on. Verify before claiming it works (curl or the browser).
- Pasted prompts say "work only on branch audit2 / never merge, push, deploy". **George chose to stay on `audit-snapshot`.** Commit trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Keep headshots and team logos site wide** (George overrides any "no headshots/logos" line in pasted prompts). Use `Headshot` / `TeamMark` from
  `src/components/home/Logo.tsx` or `headshotUrl()`; never a literal `img.mlbstatic` URL in new code (the guard flags it).
- **One font only: Red Hat Display.** No `font-mono` / `font-serif` classes, no other family. Differentiate with weight, size, colour.
- **Copy-lint banned words** (`scripts/checks/copy-lint.ts`): lean, pick(s), projected/projection, start, sit, add, bench, sharp, fade, cover, value, factors,
  tilt, official, betting, odds, etc. Workarounds used: begin, choose, reserves (for bench), Effective (for Sharp), drop-off (for fade), describe (for cover).
  No prediction language: describe what HAS happened ("after pitches like these, he threw...").
- Run `bash scripts/checks/guard.sh <changed paths>` on every changed file. A client file with `fetch(` is appended to
  `scripts/checks/guard-baseline.txt` as `fetch<TAB><path>` (also `logos<TAB>` for logo checks). Touching an old file makes the guard lint its legacy
  violations: fix them (strip `font-mono`, `lg:` classes, banned words) rather than ignoring.
- Never print or commit secrets. Empty state over fabricated data. `isPro` never defaults true. `Number()` for Supabase numerics; paginate >1000 rows.
  DB changes only as SQL files George runs himself (never run create/drop SQL). No new crons/emails.
- Brand: cream #FAF8F3, orange #FF5722, yellow #FDE047, black #1A1A1A; red = hitter does damage, sky blue #6CABDD = better for the pitcher.
- Small samples: red `*` plus the count on hover. New wording George didn't supply goes in as `[George: wording]`.
- Prices appear only on `/pricing` (and "Unlock with Founding Pro, £40/yr" buttons for signed-in free users).
- Dev tools: dev view cookie `edge_dev_view=out|member|pro` (bottom-right switcher, dev only). Browser tool is flaky: use curl when needed;
  `computer wait` max 10 s. iCloud makes duplicate "... 2" dirs in `node_modules/@types` that break `tsc` (delete them); filter with `| grep -v "^.next/"`.
  Untracked `src/components/signup/EmailSignupModal.tsx` is a stale duplicate: never commit or delete it without asking.
- `ASK_COOKIE_SECRET` must be set in Vercel (Production + Preview) for the Ask lab lookups. `player_follows` migration still not run (Follow can't save).

## 1. The lab layout pattern (the thing everything was rebuilt around)

Left sticky selector (players / pitch types, each pitch with a **spinning ball** `components/home/SpinBall.tsx`), a row of pills for filters, and a **3-column
tile grid** (cards, 14px radius). Straight lines only on every chart (no smoothing). Hover shows n. Shared pieces:

- `components/pitching-lab/LocationExplorer.tsx` exports shared styles/helpers: `tile, kick, note, star, Pills, cellRect, labelAt, px, pz, SC, VW, VH, IX, IZ, mix, NEUTRAL, BLUE, RED`.
- `components/pitching-lab/PitchFlight.tsx`: `buildPaths(log)` (average flight path per pitch type from Statcast vx0..az, anchored at y=50 ft), `FlightPlayer`, `FlightSection` (animation + release-point chart, two tiles), `PitchCards`, `Scene`, `TransparentScene`, `ReleaseView`.
- `components/pitching-lab/ArsenalExtras.tsx`: `MovementProfile` (break map scatter, not a dartboard), `UsageTrend`, `PitchSeasonLine`, `SmoothHeatmap` (Gaussian blobs on a canvas, smoothness slider).
- `lib/zone-stats.ts`: `aggregate`, `metric`, `merge`, `AGG_KEYS/aggToArr/arrToAgg` (xwOBA/BA/SLG/whiff/swing/take/called/hard-hit by Savant zone 1-9, 11-14).
- `lib/lab-log.ts`: `batterAsPitchLog()` re-labels a batter's log to the pitcher log shape (`stand` = pitcher hand, `batterId` = pitcher id) so one component serves both labs; `fetchLabLog(role,id,season)`, `onlyHand`.
- `role: 'pitcher' | 'batter'` prop on LocationExplorer, SequenceLab, TrendLab, OverlayExplorer, MatchupLab.

## 2. Pitching Lab (`/mlb/lab/pitching-lab/[playerId]/...`)

Tabs and files (all committed):
- **Overview**: free (unchanged).
- **Arsenal** `arsenal/page.tsx`: left pitch selector; All view = movement profile + pitch-selection line chart + flight animation + heatmap + per-pitch animated cards; single pitch = 3x3 tiles (flight, release points, heatmap, numbers, hot zone, grade radar, movement, game-by-game line, "See the shape" card -> Shape/Location links), league percentile line by the pitch name, Stuff grade behind a `<details>`.
- **Location Lab** `location/page.tsx` -> `LocationExplorer`: zone map by metric (xwOBA, BA, SLG, whiff, swing, take, called strike, hard-hit), click a zone, hitter side + count filters, heatmap, per-zone table.
- **Hot Zone Overlay** `(pro)/overlay` -> `OverlayExplorer`: pitcher vs a chosen hitter (or next-game/lineup chips), by count; hitter's numbers only against pitches that look like the pitcher's (same type, same hand, speed/spin/rise/arm-side within k SDs, SD floors 1.5 mph/150 rpm/2.5 in; Close ±1, Standard ±1.5, Wide ±2); season widening 1/2/3/5; measure whiff/xwOBA/SLG/BA.
- **Shape** `shape/page.tsx`: unchanged (3D), signed-out sees the sign-in card.
- **Sequencing** `(pro)/sequencing` -> `SequenceLab`: pick the pitch just thrown, result, location, count, hitter side; bars add to a chain (max 4, then oldest drops); result and count tables; pitch-by-pitch replay (`SequenceStage`, balls land outside the zone, each step's landing = modal zone of matching pitches); recent at-bats.
- **H2H** `(pro)/h2h` -> `MatchupLab`: opponent club list (PA + AVG vs each club), roster hitters, "faced most", season/career switch, ballpark table + park filter, every PA pitch by pitch.
- **Trends** `(pro)/trends` -> `TrendLab`: six main trends + builder (17 measures, pitches, side, game/month, 1-5 seasons, rolling pooled average, line/bars), saved in localStorage key `x9:pitching-lab-trends` (batter: `x9:batting-lab-trends`).
- **Stuff**: untouched (old).
- **Access**: signed out = Overview, Arsenal, Location Lab only; everything else shows `components/pro/LockedTab.tsx` (sign-in card, no data). Free account = one deep look a day per player (`lib/deep-look.ts`, feature `pitching_lab`; Shape uses `pitch_shape`). APIs enforce the same split: `/api/mlb/pitch-log` returns a reduced log (no gamePk/atBat/pitchNumber/batterId/inning/onBase) to anyone without a look, full log with a look/Pro; `summary=faced|matchups` and `batterId=` need a look/Pro. `/api/mlb/pitching-lab` now returns movement/hot zones/zone arsenal to all; `pitcher-arsenal` and `pitch-grade` are public.
- New API routes: `/api/mlb/team-roster` (`?pos=pitchers`), `/api/mlb/game-teams`, pitch-log options above.
- Data added to `RawPitch`: `traj`, `pfx`, `topBot`, `stand`, `woba`, `xwoba`, `wobaDen`, `exitVelo`, `throws` on the log; optional `launchAngle/batSpeed/swingLength` (batter side).
- Old components left in place but unused: HotZoneOverlay, SequenceExplorer, TrendsCharts, LocationLab, TopBattersFaced, TeamRecordTable, VenueRecordTable, NextStartScouting.

## 3. Batting Lab (`/mlb/lab/batting-lab/[playerId]/...`)

Same structure and shared components. Tab bar: Overview, vs pitch type, Location Lab, Hot Zone Overlay, Sequencing, H2H, Trends; "More": Spray, Swing, Contact, Outcomes, Platoon, Approach.
- Open to everyone: Overview, `arsenal` (vs pitch type -> `components/batting-lab/BatterArsenal.tsx`), `location` (LocationExplorer role batter).
- `(pro)` group (deep look, feature `batting_lab`): `hot-zones` (OverlayExplorer role batter, hitter fixed, pitcher chosen), `sequencing`, `h2h` (MatchupLab role batter), `trends`.
- `(member)` group (signed in, no look spent): spray, swing, contact, outcomes, platoon, approach (stored tables; kept as members-only, NOT moved behind the look; ask George if he wants them gated).
- `/api/mlb/batter-pitch-log` rewritten: reduced log for everyone, `range=career`, `summary=matchups`, `pitcherId=` need a look/Pro. Batter log cache key now `v4` (release, extension, traj, topBot, spin, pfx, wOBA fields). Career first load ~30 s (11 seasons), cached 6 h.

## 4. Scout Report (`/mlb/[slug]/scout-report?tab=...`)

`components/scout/ScoutReport.tsx` is now tabbed (`REPORT_TABS`): Overview, Starters, Lineups, Bullpen, Leverage, ABS, Fielding, Base running, Tendencies, Club/form/park.
- **Overview** = `components/scout/OnePager.tsx` + `lib/scout/one-pager.ts`: both clubs side by side (record, strengths/weaknesses = top/bottom third league ranks, probable starter, lineup, reserves, bullpen), each block links to the detailed tab; print button. Free.
- **Starters** = `StarterDeskSection` (server) -> `lab/StarterDesk.tsx` (+ `lab/StarterViews.tsx`, `lib/scout/starter-profile.ts`): starter selector, pitch selector, sub headers: Arsenal, Count state, Platoon, Inning by inning, Times through the order (xwOBA + velo drop-off), Hot zones & habits.
- **Lineups** = `LineupDeskSection` -> `lab/LineupDesk.tsx` -> `OverlayExplorer` (starter fixed, lineup chips).
- **Bullpen** = `BullpenDeskSection` -> `lab/BullpenLab.tsx` (+ `/api/scout/bullpen-h2h`): arm selector with fatigue dot, views Use & fatigue, How they come in, With the load, Against the lineup, Combined. Lists **every active-roster non-starter** (gs/g <= 0.5, minus tonight's probable). `getBullpenDesk(teamId, date, postseason, excludeIds)`.
- Leverage, ABS, Fielding (defense), Base running (run-game), Tendencies (splits + manager card), Club status/form/park still use the OLD section components (not yet converted to the lab layout).
- Gating unchanged: free sections (club status, form, bullpen) open; pro sections need Pro or the `scout_report` look.
- **Postseason bullpen workload**: `lib/scout/recent-work.ts` reads box scores of the last 7 days of ALL game types (+ every postseason game this year) for a postseason game; early postseason it combines with the regular season, later it is postseason only; scope line shown in the UI. `bullpen-trends.ts` game logs now `gameType=[R,F,D,L,W]`. `scripts/compute-pitcher-workload.ts` now reads every finished game of the last 10 days (it used `gameType=R` only, so `pitcher_workload_daily` had no postseason rows). George must run that workflow once (`nightly-pitcher-workload`) for the table to backfill the last 10 days. The live box-score read is a documented exception to "precompute is the architecture" (baselined).
- `ScoutContext.postseason?: boolean` is set from `game.seriesDescription !== 'Regular Season'`.

## 5. Postgame (`/mlb/[slug]/postgame?tab=...`)

Tabs (`POST_TABS` in the page): Recap, Pitchers, Hitters, Bullpen, Leverage, ABS & umpires, Fielding & base running, Box & scorecard, Next up. `PostgameShell` takes `only=[section ids]`.
- Pitchers = `PitchDeskSection` -> `report/lab/PitchDesk.tsx` (pitcher + pitch selector, mix vs season, speed vs season, heatmap, outcomes, count table, season-shape flight, inning by inning, times through the order, every PA).
- Hitters = `HitDeskSection` -> `report/lab/HitDesk.tsx` (hitter selector by club, his night, pitches seen, tonight vs season, every PA).
- They replace registry sections 17/18 (`hit-desk`, `pitch-desk`; tier pro). Data: `buildPitchLog(getPostData(gamePk))`.
- Other postgame sections still the old components under their tab.

## 6. Earlier in this chat (pre-lab work, all committed)

- Team page restored to 9 tabs; Stats page filters (season/level/game type, extra columns, sign-in graphs with colours, headshots, overlay years, compare stat, image download).
- **Ask the stats**: lookups (`lib/ask-lookups.ts`, SQL `supabase/sql/29_ask_lookups.sql` already run): 5/day signed out, 10 signed in, Pro unlimited, refine free for 15 min, dropdown search unlimited; player-vs-club card; last-time finder (World Series grand slam etc.); sortable recent list.
- Copy pages rewritten: pricing, FAQ, signup copy, Why x9Lab, How it works (`[George: park index method]` placeholder), About (George's story, bio photo, `[George: confirm how you describe your data science background]`).
- MLB home: "Who's hot this month" (30 days, min 60 PA / 10 IP, headshots) and Leaders top 10 with headshots.

## 7. Open items / ideas

1. Convert Leverage, ABS, Fielding, Base running, Tendencies, Club/form/park to the lab layout (Scout Report) and the remaining Postgame sections.
2. Run the nightly workload workflow so postseason pitch counts land in `pitcher_workload_daily`; then the live box-score read could be removed.
3. Decide whether Batting Lab member tabs (spray, swing, ...) should cost the deep look. Decide whether Postgame desks should be free instead of pro.
4. Pitching Lab "Stuff" tab and Overview not rebuilt. Mobile pass for the new views not done (they collapse to 2/1 columns, untested on a phone).
5. Postgame has no one-page overview yet (offered).
6. `npm run build` was not run recently, only `tsc` + guard. Run it before any deploy.
7. Unused old components remain on disk (listed in section 2) and can be deleted once George is happy.
8. Saved trends are per browser (localStorage); saving to the account needs a table George creates.
9. Set `ASK_COOKIE_SECRET` in Vercel; run the `player_follows` migration.

## 8. Handy commands

- `npx tsc --noEmit 2>&1 | grep -v "^.next/"`; `bash scripts/checks/guard.sh <paths>`; dev server on :3000.
- Test pages: pitcher 694973 (Skenes, 2026) and 669373 (Skubal), hitter 592450 (Judge), scout game `milwaukee-brewers-vs-tampa-bay-rays-2026-10-27`, postgame `...-2026-10-26`.
