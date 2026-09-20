# Session notes — 2026-09-18 (Key Players redesign, first pass)

Continues `SESSION_NOTES_2026-09-17.md`. Goal tonight: audit the Key Players logic
against the ask (arsenal, GB%, pull rate, OAA, whiff, walk rate, day/night splits)
and redesign the UX around **five real reasons the matchup favours the player**.
Next up: **Sat/Sun — Scout Report / postgame**, **Mon — team homepage**.

---

## Audit findings (all fixed tonight)

1. **Velocity-matched BA was badly wrong** (~.05 instead of ~.250). `batter-pitch-log.ts`
   `result` = Statcast `events` on the PA-ending pitch, otherwise the pitch
   `description` ("ball", "foul"…). `series-matchup.ts`'s `getBatterRawPitchLog` mapped
   it straight to `events`, so `computeBaFromRows` counted every pitch as an AB. This
   is the signal re-enabled 2026-09-17. Fix: `events` is null unless `result !== description`.
2. **`bat_side` was never populated** in `lineups.ts` (declared, never set) → every LHB got
   RHB zone labels and platoon logic couldn't run. Now one batched `/people` call
   (`getPlayerHands`, cached 24h). Switch hitters: `bat_side = null`, `switch_hitter = true`.
3. **Snapshot cron freeze check queried `key_players_snapshots` (plural, doesn't exist)** →
   failed open → recomputed/overwrote logged games every 30 min. Now `key_players_snapshot`.
4. **Postgame results never loaded**: cards passed `gamePk: 0` and called
   `/api/batter-game-result`, which doesn't exist. Results now fetched server-side in
   `KeyPlayersSlotAsync` (`getBatterGameResult`, `getPitcherGameResult`,
   `getBatterPitchByPitchResult`).
5. Narrative claimed "hitting a strong number" with no BA, named a driving pitch with no
   batter data, used `per_pitcher[0]` (first game, not best), and the pitcher narrative said
   a pitch "lives in the zone 40% of the time" (40% was overall pitch usage). All fixed in
   `key-players-narrative.ts` (`pickDrivingPitch(fit, mode)`, `bestBatterLine`).

## What was built

**Factor engine** — `src/lib/key-player-factors.ts`. Each factor: `{id, direction
for|against, title, stat, detail, strength 0..1, visual}`. Top 5 "for" factors chosen;
"against" only backfills when <3 "for". Returns nothing rather than fabricating.
- Batter: hot zone vs pitcher location, pitch-type fit, career H2H, form (sparkline),
  platoon split, day/night split, **pull side vs weakest OAA defender** (new signal),
  pitcher control/contact weakness, park.
- Pitcher: best pitch vs lineup, zone fit vs lineup, whiff/K percentile, walk-rate
  percentile, **GB% + OAA of defense behind him** (new), lineup handedness vs his
  platoon BAA, day/night, last-3-starts form (sparkline), home/away, park.
- `contextScore()` nudges ranking (capped ±0.4) using only signals the base score
  doesn't already include (zone/pitch fit are excluded to avoid double counting).
- Pitcher percentiles come from one `pitcher_stats` league query computed in-memory.

**Supporting lib changes**
- `batter-fielding.ts`: `getLeagueOaa(season)` — whole-league OAA in ONE fetch, cached in
  `savant_fetch_cache` (12h). `getOutsAboveAverage` now reads from it (was an uncached
  full-leaderboard CSV download per player).
- `batter-spray.ts`: `computePullProfile()` (pull %, GB %, pulled-GB %, pulled-air %).
  `SprayChart.tsx` still has its own copy of the pull math — not yet shared.
- `key-player-rating.ts` (pure): 1–5 outcome rating + `called_it | missed | push` vs the
  pregame lean. Batter = H + 2·HR + ½(RBI+BB) − 0.4·K; pitcher = estimated Game Score
  (no unearned-run / HR terms, labelled "est.").
- `key-players-pipeline.ts`: `computeTeamKeyPlayers()` — single path used by BOTH the game
  page and the snapshot cron so pregame and frozen postgame can't drift. Enriches top 5
  batters + the SP only (factor fetches are per-player MLB API calls).
- `series-matchup.ts`: `getSeriesTop3` also returns `pool` (top 5). `MLBGame.dayNight` added.
- Snapshot `reason_summary` now stores `factors`, `focus_key`, `opposing_pitcher_id`.

**UI** — `Top3KeyPlayersTab.tsx` (rewritten) + `components/key-players/FactorVisuals.tsx`.
- Card: rank/headshot/lean + five factor rows with micro-graphics. Free users see the
  first 2 fully, rest locked (titles only). Postgame: rating strip + "X/Y called" header.
- Popup (Pro): the read, factor tiles with the "why", zone board with **overlays**
  (Matchup lean / Hitter hot zones / Pitcher location / Swing & miss), matchup selector,
  tap-a-pitch breakdown with a written "why", result + pitch-by-pitch (postgame), Lab link.

## Decision made at end of session

Pitch-by-pitch breakdown in the popup now uses the hitter's **season BA vs pitch type — no
±3 mph band** (small samples flagged in text, not hidden). Card factors and scoring stay
velocity-matched (`VELOCITY_BAND_TOLERANCE = 3.0`, `MIN_VELOCITY_BAND_AB = 8`).
Note: the zone tap-through panel in the popup still shows the pitch+zone+velocity
"at similar velo" box — left as-is, revisit if it should follow the same rule.

## Verified live
- Pregame NYY @ AZ: all 6 cards render five-factor rows; popups open; overlay toggle and
  pitch breakdown work; no console errors. BAs sane after the denominator fix.
- Postgame ATH @ TB (2026-09-17): rating strips + Called it / Missed render with real lines.
- `tsc --noEmit` clean; eslint clean on new files (remaining `any` errors are pre-existing).

## NOT verified / open
- Free-user (`isPro = false`) locked-row + `LockedTeaser` path — still untested.
- Spray-vs-defender field diagram and form sparkline didn't trigger on the games tested;
  built but not seen live.
- Old snapshots (frozen before tonight, e.g. the 2026-09-19 slate) have **no factors** and
  keep the old narrative text. With the freeze check fixed they won't self-refresh. Recompute
  pregame ones with `?force=true` on `/api/cron/key-players-snapshot` (Live/Final are skipped).
- Snapshot `game_date` is the UTC date while slugs use the local date (e.g. slug `-09-18`,
  `game_date` 2026-09-19) — pre-existing, not touched.
- Shipping cost: factor fetches add MLB API calls (splits, people); all cached 1h+ via
  fetch `revalidate`. Watch cold-load time (was 57s cold on 2026-09-17).

## Follow-ups
1. **Pitch profile = velocity + movement** instead of a mph band. `pitch_arsenals` already has
   `avg_h_break`/`avg_v_break` but values look unreliable (a curveball showed 83.3" v-break —
   validate units first). `batter-pitch-log.ts` doesn't parse `pfx_x`/`pfx_z` yet; adding them
   means the 6h `savant_fetch_cache` entries won't have them until refetched.
2. Share pull math between `SprayChart.tsx` and `batter-spray.ts`.
3. Count-tendency narrative clause (`pitcher-situational-zones.ts`, cached but unused).
4. Series-level tracking of Key Players hit rate across a series' games.

## Environment
- Dev server: `(lsof -ti:3000 | xargs kill -9 2>/dev/null; true) && npm run dev`.
- Maintenance mode still on (`src/proxy.ts`); curl with `-b "edge_preview_access=password"`.
- Nothing committed; large pre-existing set of unstaged changes across the repo.
