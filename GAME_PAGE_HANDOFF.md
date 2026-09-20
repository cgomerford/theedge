# MLB Game-Slug Page — Architecture & Handoff

Written 2026-09-17, continuing from `MLB_LABS_HANDOFF.md` (which explicitly
left the game-slug page as "not started"). Read that file first for the
repo-wide data/lib conventions — this file only covers what's specific to
`/mlb/[slug]`. Also read `AGENTS.md`/`CLAUDE.md` (this is a modified Next.js
fork — check `node_modules/next/dist/docs/` before using any Next API).

## 1. What this is

The single-game page (`src/app/mlb/[slug]/page.tsx`) — Edge Indicator
(weighted-factor model), Scout Report, Pitching/Batting mini-labs, Teams,
Key Players, Series, Sidebar. One real game per slug
(`away-vs-home-YYYY-MM-DD[-gameN]`).

## 2. Architecture pattern established this session

`page.tsx` was ~900 lines of sequential blocking fetches (25-stage chain).
Rebuilt around **independent, self-contained async Server Components**,
one per tab/section, each wrapped in its own `<Suspense>` in `page.tsx`:

- `EdgeIndicator` (inline, not a slot — needs the prediction fast, it's
  the hero element)
- `PitchingSlotAsync.tsx` / `BattingSlotAsync.tsx` (pre-existing)
- `ScoutSlotAsync.tsx`
- `TeamsSlotAsync.tsx`, `KeyPlayersSlotAsync.tsx`, `SeriesSlotAsync.tsx`,
  `SidebarSlotAsync.tsx` (new this session)

**Rules for a `*SlotAsync` component:**
- Owns its **own** game lookup (`getScheduleForDate` + `game_previews`
  Supabase fallback) and its **own** data fetching. Never receives props
  threaded from `page.tsx` for its core data — this is deliberate, so it
  resolves independently under `<Suspense>` instead of blocking on (or
  being blocked by) sibling slots.
- Wrapped in `<Suspense fallback={<SomethingSkeleton />}>` in `page.tsx`.
  Skeletons are sized placeholder cards, not spinners (avoids layout
  jump).
- Use React `cache()` on shared lookups so independently-streamed slots
  that both need e.g. the game row don't double-fetch within one request.
- Non-critical writes (the `game_previews` upsert) fire via `after()`
  from `next/server`, off the response-blocking path.

Result: TTFB dropped from the old sequential chain to ~0.3–0.8s.

## 3. Phase 1 — Edge Indicator (DONE, verified live)

`src/lib/edge.ts`: model extended from 8 to 10 weighted components (V6→V7).
`WEIGHTS` sums to 1.00, explicitly flagged in-code as provisional/heuristic
(no backtest script currently exists to derive it properly — the one
archived script is stale V2-era).

New components:
- `pitcher_situational` (0.06) — TTO wOBA trend (`tto1_woba`→`tto3_woba`,
  gated on `tto_verified_at` + PA≥15 both sides), first-pitch strike%,
  2-strike pitch-selection quality (cross-references `two_strike_mix`
  against that pitch's `whiff_percent` from the arsenal).
- `offense_situational` (0.06) — RISP OPS/AVG (multiple redundant-looking
  field names really do all exist on `team_stats`: `ops_with_risp` ??
  `risp_ops`, `ba_risp` ?? `risp_avg` ?? `avg_with_risp`), LOB% (lower =
  better), chase_rate/k_pct as a real proxy for "discipline once behind
  in the count" (no literal behind-count column exists).

**Design intent (per George):** never show a raw -100/100 betting-style
score. Always "which team has more data factors" framing — see
`buildEdgeSummary`'s `phrases`.

`EdgeIndicator.tsx`: `EdgeComponents` type/`FACTOR_META`/`FACTOR_ORDER`/
`RADAR_LABELS` extended to match. Two real bugs found+fixed proactively:
- `RadarChart`'s `spokePoint` had a **hardcoded `8`** in its angle math —
  would've broken geometry once a 9th/10th factor existed. Now
  `FACTOR_ORDER.length`.
- `toPct(score, forHome)` didn't guard `NaN`/`undefined` — crashed with a
  real "Received NaN for `%s`" React error on any OLD stored prediction
  computed before the 2 new components existed. Fixed with a
  `score == null || Number.isNaN(score)` guard → neutral 50.

Also fixed: `page.tsx` computed `isPro` but never passed it to
`<EdgeIndicator is_pro={isPro} />` — this was the "shows pro, drill-down
still locked" bug George reported. And: `ProDrillDown`'s if/else chain had
no case for the 2 new factors (fell to a generic locked-looking fallback
regardless of pro status) — built real drill-down branches for both,
using data already available in `components_raw`.

`edge-fetch.ts`: added `getEdgePredictionsByGamePks(gamePks[])` (batched,
replaces an N+1 `.in()` loop in series-predictions code). `EdgePrediction`
type kept in sync (this type is duplicated in **3 places** —
`edge.ts`/`edge-fetch.ts`/`EdgeIndicator.tsx`'s local copy — must update
all 3 together when touching components).

## 4. Phase 2 — Scout Report (BUILT, typecheck/lint clean, NOT fully
   live-verified — see §7 open items)

Ask: make it read like an actual scout report by topic (not by team
column), pro-gate it, add lab funnels, pro-gate the share-image export.

`ScoutSlotAsync.tsx`: added `getCurrentSubscriber()` + `isPro` fetch,
passed into `ScoutReportTab`.

⚠️ **`isPro` is currently hardcoded `true`** in `ScoutSlotAsync.tsx`
(`const isPro = true || (subscriber?.is_pro ?? false)`) — George asked for
this explicitly to preview the unlocked layout locally. **Revert to
`subscriber?.is_pro ?? false` before shipping** — matches the restrictive
default already used in `PitchingSlotAsync.tsx`.

`ScoutReportTab.tsx`: full JSX restructure from the old 4-column
team-grouped grid (`scout-top-grid`) to sequential topic sections, reusing
every existing child component unchanged (no component rewrites):

1. § Team Snapshot (free) — `TeamTrendsCard`
2. § Recent Form (pro) — `TeamRollingCard`
3. § Starting Pitching (pro) — `PitchLocationCard`, `TTOFatigueChart`,
   `PitchSequencingSnippet` + `LabFunnelLink` → `/mlb/pitching-lab/[id]`
4. § Batting & Lineups (pro) — `TeamHotZoneCard`, `LineupSprayChart`,
   `BatterStreakBoard`, `LiteralStreakNotes` + `LabFunnelLink` →
   `/mlb/batting-lab`
5. § Bullpen (free) — `PitcherWorkloadCard`, `BullpenUsageCard`
6. § Defense (pro) — `FieldingAlignmentDiamond`
7. § Situational (pro) — `ABSChallengeCard`, `SBTendencyCard`
8. § Ballpark & Weather (free) — `BallparkWeatherCard`
9. § Key Notes (free) — `NotesCard`
10. Roster moves (free, unchanged)

New helpers: `ReportSection` (section header + lock badge), `ProLockedCard`
(dark teaser + `Unlock →` to `/pricing` — reuses `EdgeIndicator.tsx`'s
`FactorBar` visual language, not reinvented), `LabFunnelLink`.

Header export button pro-gated + relabeled "Share image" (was free/
ungated "Export PNG"); free users see a `⊕ Share image` link to `/pricing`
instead. Uses the existing `handleDownloadPng` (`html-to-image`, already
working) — not a new export mechanism.

**Out of scope, flagged not attempted:** per-reliever inherited-runner
tracking (`RelieverProfile` in `bullpen-usage.ts` has no such field — real
new play-by-play computation, not a wiring job).

## 5. Savant CSV N+1 memory-exhaustion fix (DONE, verified live)

George reported the dev server repeatedly choking (180–400%+ CPU,
multi-GB RSS, host OS free memory dropping to ~54MB, harness killing
background tasks for real low-memory reasons) and attributed it to Scout
Report's per-lineup-batter fetching.

**Root-cause finding: Scout Report does NOT do this.** Traced every
function `ScoutSlotAsync.tsx` calls — all lineup-wide batter data
(`getBatterHotZones`, `getLineupSpray`) is Supabase-backed, not live
fetches. `ScoutReportTab.tsx` is a client component fed entirely by
pre-fetched props; grepped all 13 child cards for `fetch(` — zero matches.
The one function that used to do a live per-batter raw-pitch pull in the
series-matchup code path (`getBatterRawPitchLog`, shared by
`series-matchup.ts`'s lineup loop and `pitcher-series-edge.ts`'s Key
Players loop) was already hard-disabled 2026-09-08 (`return null`
immediately, comment describes this exact prior incident).

**What actually has the bug:** four functions matching the real observed
URL shape (`batters_lookup[]=X...type=details`), all single-player-scoped,
only reachable from Batting Lab / Stats Search pages (never a lineup
loop) — but each pulls a genuine 2–2.5MB raw Savant CSV on **every call**,
with `next: { revalidate: 21600 }` that's a silent no-op (Next's fetch
Data Cache has a hard 2MB-per-item ceiling — confirmed via repeated
"items over 2MB can not be cached" warnings):
- `getBatterPitchLog` — duplicated independently in both
  `batter-pitch-log.ts` **and** `pitch-splits.ts` (two separate
  implementations of essentially the same fetch — a real duplication,
  not yet consolidated, flagged here as a future simplification target)
- `getBatterSituationalZones` (`batter-situational-zones.ts`)
- `getTeamPitchLog` (`pitch-splits.ts`)

**Fix:** new Supabase cache-aside table + helper, since Next's own cache
can't hold items this large — cache the *parsed/aggregated* result
instead (far smaller than raw CSV):

- `scripts/sql/create_savant_fetch_cache.sql` — `savant_fetch_cache
  (cache_key text primary key, payload jsonb, fetched_at timestamptz)`.
  **Already run in Supabase by George.**
- `src/lib/savant-cache.ts` — `withSavantCache(cacheKey, ttlSeconds,
  fetchFn)`. Never caches an empty/null result (a transient Savant
  failure shouldn't get pinned as the answer for the whole TTL window).
- Wired into all four functions above with a 6h TTL (matching their old,
  previously-ineffective `revalidate` window).

**Correction — the first "verified live" pass was wrong.** The initial
`withSavantCache` wrote its cache row via a fire-and-forget `void
supa.from(...).upsert(...)` (never awaited). That silently loses the
race under Next's request lifecycle — same reason `page.tsx`'s
`game_previews` upsert needs `after()`, an un-awaited promise isn't
guaranteed to finish. The first "5.5s → 211ms" timing looked like a
cache hit but wasn't (the table was later confirmed to have **0 rows**
after that test) — the speedup was something else entirely (Savant/CDN
warm-connection effects), not my cache. Fixed by awaiting the write
directly in `savant-cache.ts` and logging read/write errors instead of
swallowing them. Re-verified properly afterward — see §5b.

## 5b. Second, bigger finding: the site **homepage** (`src/app/page.tsx`),
   not Scout Report — same bug class, much larger blast radius

While restarting the dev server to test the fix, a single `curl
http://localhost:3000/` (plain homepage load) triggered **80 live
2MB+ Savant CSV fetches in one request** (66 batters + 14 pitchers,
confirmed via unique `batters_lookup[]=`/`pitchers_lookup[]=` IDs in the
server log). This is `src/app/page.tsx`'s "Bat speed vs. production" /
"Miss distance" / "Pitch run-value by count" deep-dive sections —
`getBatSpeedProfilesForBatters` (top-100 batters by PA) +
`getBatterBatSpeedProfile` (HR leaders, miss-distance sample) +
`getPitcherStatcastProfile` (every probable pitcher tonight + ERA
leaders). Each of these already carried a code comment claiming to be
"independently 6h-cached by URL" — same false assumption as everywhere
else: Next's fetch Data Cache silently refuses anything over 2MB, so
none of it was ever actually caching. This is **not** Scout Report and
**not** test-navigation chaos — it's the live public homepage, and with
`export const revalidate = 1800`, this 80-fetch storm re-runs on a cold
cache / every ISR regen.

Fixed the same way — wrapped both source functions with
`withSavantCache`:
- `getBatterBatSpeedProfile` (`src/lib/batter-bat-speed.ts`) — also
  covers `getBatSpeedProfilesForBatters`, which just calls it per id.
- `getPitcherStatcastProfile` (`src/lib/pitcher-statcast-profile.ts`).

**Properly verified this time**, after the fire-and-forget fix: cold
first `GET /` = 10.3s, 109 live-fetch-cache-failure log lines (expected
— first hit has to populate the cache), `savant_fetch_cache` row count
confirmed at 121 afterward. Second `GET /` immediately after = **2.5s**,
**zero** new live-fetch-cache-failure lines — full cache hit across all
~80 players, no repeat Savant traffic.

## 5c. Savant-fetch functions audited this session — current cache status

| Function | File | Cached? |
|---|---|---|
| `getBatterPitchLog` | `batter-pitch-log.ts` | ✅ `withSavantCache` |
| `getBatterPitchLog` (duplicate impl) | `pitch-splits.ts` | ✅ `withSavantCache` |
| `getTeamPitchLog` | `pitch-splits.ts` | ✅ `withSavantCache` |
| `getBatterSituationalZones` | `batter-situational-zones.ts` | ✅ `withSavantCache` |
| `getBatterBatSpeedProfile` | `batter-bat-speed.ts` | ✅ `withSavantCache` |
| `getPitcherStatcastProfile` | `pitcher-statcast-profile.ts` | ✅ `withSavantCache` |

**Not yet fixed** — same bug class confirmed present (grepped
`type=details` across `src/lib/*.ts`, checked for `withSavantCache`),
but not wrapped this session since none showed up in the homepage/Scout
Report storms actually observed. None are homepage-triggered like §5b
was, so lower urgency, but real:
- `pitch-physical-percentiles.ts`
- `pitcher-pitch-log.ts` (pitcher-side mirror of `batter-pitch-log.ts`)
- `pitcher-situational-zones.ts` (pitcher-side mirror of
  `batter-situational-zones.ts`)
- `pitcher-start-trends.ts`
- `stats-search.ts`
- `series-pitches.ts` (uses MLB's live game feed per its own header
  comment, not Savant CSV directly for its main path — worth
  double-checking before assuming it needs the same fix)

Same fix pattern applies: wrap the exported function with
`withSavantCache(cacheKey, ttlSeconds, () => actualFetchLogic())`.

## 6. Dev server note

This specific dev server process repeatedly became unresponsive under
heavy fetch fan-out during testing this session (up to 3GB+ RSS, 340%+
CPU) — confirmed to be from chaotic overlapping test navigations during
Chrome-tool instability (tabs reverting to blank, `navigate()` succeeding
but not taking effect), **not** a single deterministic code path, and
**not** present in the actual Scout Report code (see §5). All stuck
`next-server`/`next dev` processes were force-killed and port 3000
cleared at the end of this session; system memory recovered from ~54MB
free to ~6.1GB free. Start fresh (`npm run dev` or equivalent) next
session rather than reusing anything.

## 7. Open items / how to pick this back up

1. Read this file + `MLB_LABS_HANDOFF.md` + `AGENTS.md` first.
2. `npx tsc --noEmit -p .` to confirm a clean baseline.
3. Start a fresh dev server (previous one was killed at session end).
4. **Revert the temp `isPro = true || ...` hack in `ScoutSlotAsync.tsx`**
   back to `subscriber?.is_pro ?? false` once George has reviewed the
   unlocked preview — currently still forced on.
5. Finish live verification of Scout Report (blocked all last session by
   server/tab instability, not by any known bug): load a real game, check
   both free (locked teasers + `/pricing` links) and pro (full sections)
   states render correctly, PNG/share-image export works, console clean.
6. Resume the phased roadmap (per George's original brief, phase-by-phase
   with check-ins between phases — Phase 1 Edge Indicator and Phase 2
   Scout Report are done):
   - **Mini Pitching/Batting Labs on the game page** — smaller versions
     of the full labs, h2h etc. pro-locked, free shows season-standard
     stats.
   - **Teams tab** — team summary, transactions, minor-league watch list,
     manager/front-office names, better-surfaced lineups (existing
     lineups feature is "too hidden right now" per George).
   - **Key Players** — computed day-before-series from confirmed starters
     + projected lineups: arsenal-vs-batter analysis, H2H, ballpark
     record, "stuff vs. previously-faced pitchers" comparison, 3 key
     players each with a graphic (zones/arsenals/heatmaps) showing why.
     Note: `getPitcherSeriesEdge` (`pitcher-series-edge.ts`) and
     `getSeriesTop3`/related in `series-matchup.ts` already exist and do
     real arsenal-vs-lineup scoring — likely the base to build this on,
     not a from-scratch build.
   - **Series tab** — series-specific batting/team stats (RISP, LOB,
     etc.).
   - **Fantasy** — explicitly deferred by George until the Fantasy pages
     are built out in totality. Do not start this without being asked.
7. Optional cleanup (not urgent, flagged not done): consolidate the
   duplicate `getBatterPitchLog` implementations in `batter-pitch-log.ts`
   vs. `pitch-splits.ts` into one.
