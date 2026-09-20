# Postgame hitter form + ABS "missed by" — session notes (2026-09-20)

**MLB status:** per George, the only MLB pieces left are the **team homepage** and the **player stat page**. Nothing about
either was inspected or changed this session — scope them fresh next time.

## What shipped (all UNCOMMITTED — nothing is pushed)

### 1. Statcast data layer (`pitch_events` + `batted_ball_events`)
- `scripts/fetch_statcast_events.py` — now stores `estimated_woba`, `woba_value`, `launch_speed_angle` on every ball in
  play; new `--batted-only` flag (skip the big `pitch_events` table when only refilling batted balls). Header documents that
  this script is the **single writer** of both tables. Column names were curl-verified against a live Savant CSV.
- `scripts/backfill_statcast.sh` — passes a 3rd arg through (e.g. `--batted-only`). **Run it with `bash`, not `python3`.**
- `.github/workflows/nightly-statcast-events.yml` — daily 11:00 UTC (after West Coast games are final in Savant, before the
  12:00 UTC brief). Re-pulls the last 2 days each run (idempotent upsert). Not in `vercel.json` on purpose: that file only
  lists Next API routes; Python scripts run in GitHub Actions. **Needs to be pushed to start running.**
- `scripts/sql/add_batted_ball_xwoba.sql` — new columns + `(batter_id, game_date desc)` indexes on both tables. **Run.**

### 2. Postgame § 19 — "Hitters: hot, cooling, or turning a corner?"
- `src/lib/postgame/hittercheck.ts` — adds a `form` read per hitter: five factors (exit velo, hard-hit %, xwOBA on contact,
  whiff %, chase %), tonight vs his own last 15 games. Verdicts: Staying hot / Turning a corner / Steady / Cooling /
  Dropping off, in factor-count language ("3 of 5 factors up · 0 down"). Optional "results ahead of / behind contact" flag
  (last-15 xwOBA vs actual wOBA). **All thresholds live in the exported `FORM` constant — tune there.**
- `src/components/postgame/report/HitterCheckSection.tsx` — form row under each hitter (chip, 5 stat boxes, trend line);
  existing tabs / scatter / contact read / zone grids kept. `sections.ts` title + scope updated.
- `scripts/sql/add_batter_form_l15.sql` — `batter_form_l15(p_ids, p_game_pk, p_date)`: aggregates the last-15 baseline
  **inside Postgres** (~1 row per hitter over the wire instead of thousands of pitch rows; egress). Read-only.
  **⚠ NOT YET RUN as of this writing.** Until it exists every hitter shows "Small sample — Last-15 baseline not available
  yet" (verified: it degrades cleanly and logs `[getHitterChecks] batter_form_l15 error`).
- Sample-size rules (empty state, never a guess): a hitter needs ≥3 balls in play tonight and ≥10 games of history; a factor
  is skipped ("–") if tonight has <6 swings (whiff) or <10 pitches outside the zone (chase). xwOBA tonight comes from
  `batted_ball_events` and shows "–" until the nightly load lands (the other four come from the game feed, so they're
  available right after the game).
- Approved-in-principle HTML mockup: `mockups/postgame-hitter-check.html` (real numbers, MIN @ AZ 2026-06-20).

### 3. ABS page — "missed by" + partial-credit score
- `scripts/fetch_abs_challenge_log.py` — stores raw pitch location per challenge (`plate_x`, `plate_z`, `sz_top`, `sz_bot`,
  `sz_width_in`, `final_call`). Single-writer note added. `scripts/sql/add_abs_challenge_location.sql` — **run (done).**
- `src/lib/abs-challenge-log.ts` — `marginInches` / `estimateMissInches` / `challengeCredit`, plus per-player `located`,
  `failedLocated`, `avgMissIn`, `precision`. Constants `BALL_RADIUS_IN = 1.45`, `FAIL_CREDIT_CAP = 0.5`,
  `FAIL_ZERO_AT_IN = 3`. Overturn = 1 credit; failed = up to 0.5, shrinking to 0 at 3 in (0.1 in off ≈ 0.48, 2 in off ≈ 0.17).
  Location columns are only selected by the player query (the lib pulls the whole table 3× per render).
- `src/components/AbsRadarSection.tsx` — 6th radar axis "Precision" (a player with no located challenges just has 5 axes),
  sortable "Precision" and "Miss by" leaderboard columns, info text. `src/app/mlb/abs/page.tsx` — intro no longer claims
  "not estimated".
- **Decision made by default (George didn't answer):** every overturn earns the same credit (a 0.1 in win = a 3 in win).
  Alternative (more credit for close wins) was offered and not taken.

## Data status
- `abs_challenge_log`: 7,502 challenges, **all with location**.
- `pitch_events` / `batted_ball_events`: 2026-03-27 → 2026-09-18, xwOBA columns filled (~0.6% null every month = sac bunts,
  which have no xwOBA). Jul 13–15 is legitimately empty (All-Star break).
- **Gap found and fixed:** `pitch_events` was completely empty for **Jul 24 – Aug 15** (a previous backfill had silently
  failed) and the Aug 7–13 chunk failed again on a malformed Savant CSV (`Error tokenizing data`) during pass 1. Re-ran the
  full backfill for Jul 24 – Aug 16; re-scan of Jul 20 – Aug 20 shows no flagged days. A full-season re-scan was **not**
  repeated after the repair.
- Detection trick: pitches ÷ balls-in-play should be ≈5.5–6 on any normal game day; a day with 0 pitches or a ratio <5 is a gap.

## Verification — what was and wasn't checked
- ✔ `npx tsc --noEmit` clean after each change.
- ✔ ABS page loads in the browser with live data; Precision axis, new columns and intro text present. Real-data sanity:
  Cristopher Sánchez 0% success / 35% precision / 0.9 in avg miss; Brett Baty 38% / 30% / 2.2 in.
- ✔ Postgame § 19 renders; degraded state (no SQL function) confirmed in the DOM and console.
- ✔ Distance rule checked against MLB's own overturn results on 122 challenges (2026-09-08..10): reproduces the final call
  **84%** of the time — side-to-side edges 55/57, **top/bottom only 48/65** (the feed's zone top/bottom isn't exactly the ABS
  zone). Treat inches as an estimate; fine for near-miss vs wild, not an exact count near the top/bottom edges. Not tuned to
  the sample (122 is too few; would overfit).
- ✘ `batter_form_l15()` has never executed. After running the SQL: call the rpc for game 825068 and compare with the Python
  reference numbers (Kreidler 4 of 5 up / turning a corner, Bell staying hot, Caratini cooling), then re-view § 19.
- ✘ Postgame § 19 and the ABS page not checked on a phone (screen capture tool wouldn't resize its viewport).
- ✘ Hitter verdicts not back-tested across many games; thresholds are proposals.

## Next steps, in order
1. Run `scripts/sql/add_batter_form_l15.sql`; verify the rpc against the Python reference; look at § 19 live.
2. Commit + push (incl. `.github/workflows/nightly-statcast-events.yml`, the three new SQL files, `mockups/`).
3. Make the nightly Statcast job **fail loudly** on a bad Savant response. Right now `fetch_statcast_events.py` prints the
   error and `sys.exit(0)`s — that is how the Jul 24–Aug 15 gap went unnoticed. (George hasn't answered yet; recommended.)
4. **MLB remaining: team homepage, player stat page.**
5. Check `src/proxy.ts`: `MAINTENANCE_MODE = true` (commit message said "until Sept 18"; it's past that). Decide whether to flip
   it before launch.

## Gotchas learned this session
- `python3 scripts/backfill_statcast.sh` fails with a syntax error — it's bash. `bash scripts/backfill_statcast.sh A B [flags]`.
- Savant's ABS leaderboard (`/leaderboard/abs-challenges`) returned **HTTP 500** in both URL formats tried (`year=`/`gameType=regular`
  and canonical `season[]=`/`gameType[]=R`), so **`src/lib/abs-challenges.ts` (team ledger) may be silently empty — not
  checked on the page.** No official miss distance was found anywhere; distance is derived from the game feed.
- MLB live feed challenged-pitch fields (verified game 824226): `pitchData.coordinates.pX/pZ` (ft), `strikeZoneTop/Bottom` (ft),
  `strikeZoneWidth` (17 in); `details.call.code` is the call **after** review. Use `pitch_events` description + zone
  (11–14 = outside) for whiff/chase.
- `pybaseball.statcast()` can return malformed CSV for a wide window (`Error tokenizing data`) — retry with smaller windows.
- Supabase `select()` with a dynamically built string loses type inference → cast through `unknown`. `numeric` columns and
  rpc results may arrive as strings → `Number()`.
- macOS: `sed -i` needs `-i ''`; zsh aborts a whole command line on an unmatched glob (`--include=*.ts`) — quote it.
- Browser tool: `file://` is blocked (serve on localhost); screenshots of a very tall page far from the top come back blank —
  hide the preceding sections with JS to bring the target to the top. Dev-only `/dev/*` routes hit the maintenance takeover.
- Local Python for these scripts lives in a throwaway venv (system Python has no pybaseball); GitHub Actions installs
  `scripts/requirements.txt` itself.

## Files touched (git state at the end of the session)
Modified, tracked: `scripts/fetch_statcast_events.py`, `scripts/backfill_statcast.sh`.
Untracked (new to git, whole directories included): `.github/workflows/nightly-statcast-events.yml`, `scripts/sql/`,
`scripts/fetch_abs_challenge_log.py`, `mockups/`, `src/lib/abs-challenge-log.ts`, `src/components/AbsRadarSection.tsx`,
`src/app/mlb/abs/`, `src/lib/postgame/` (incl. `hittercheck.ts`), `src/components/postgame/report/` (incl.
`HitterCheckSection.tsx`, `sections.ts`), `SESSION_NOTES_2026-09-20.md`.
Note the postgame lib + component directories were **already untracked before this session**, so committing them also commits
the earlier postgame rebuild — review `git status` before `git add`.
