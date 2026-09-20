# MLB Batting Lab / Pitching Lab — Architecture & Handoff

Written 2026-09-15 for continuation by another agent ("Grok build") and
by George tomorrow. Read this alongside `AGENTS.md` (repo-wide rules —
this is *not* the Next.js you know, check `node_modules/next/dist/docs/`
before writing framework code).

## 1. What this is

Two mirrored per-player analytics apps under `/mlb/batting-lab/[playerId]/*`
and `/mlb/pitching-lab/[playerId]/*`. Each is a tabbed "lab" — search any
real MLB batter/pitcher, land on their Overview, click through tabs for
arsenal, location/hot-zone, sequencing, trends, and H2H breakdowns. Every
number on every page is real, sourced live from Baseball Savant or the
MLB Stats API — nothing is fabricated or simulated. This is the single
most important constraint on this codebase; see §3.

## 2. Stack

Next.js App Router, TypeScript, Tailwind, Recharts (charts), Supabase
(only for the weekly-refreshed hot-zone tables), `html-to-image` (PNG
export for shareable cards). Client components throughout
(`'use client'`) — data is fetched client-side per tab via a shared
context provider, not server components.

## 3. House rules (non-negotiable, keep following these)

- **Real data only, no fabrication.** Verify a field/endpoint exists via
  a live `curl` before building on it or before declaring something
  unavailable. If real data genuinely doesn't exist for something, say
  so honestly in the UI — never guess or simulate.
- **Typecheck + lint after every change:** `npx tsc --noEmit -p .` and
  `npx eslint <touched files>`. Both must be clean before moving on.
- **Verify live in the browser before declaring a feature done** — use
  the Claude-in-Chrome tools: navigate, screenshot, and for interactive
  elements dispatch real DOM events via `javascript_tool`
  (`el.dispatchEvent(new MouseEvent('mouseover'/'click', {bubbles:true,
  clientX, clientY, view:window}))` — `mouseover` not `mouseenter`,
  since React's delegated synthetic events need a bubbling event).
  Coordinate-based `computer` clicks are unreliable on this site: they
  intermittently miss even when the screenshot looks right — prefer
  dispatched events for anything you need to actually register. Always
  check `read_console_messages` with `onlyErrors:true` after.
- **Dataviz rules** (from the bundled `dataviz` skill): never a dual-axis
  chart (two y-scales) — use small multiples instead. Sequential
  palettes = one hue, light→dark. Categorical hues in a fixed order,
  never cycled. `isAnimationActive:false` on every Recharts
  Line/Area/Scatter (a known blank-on-mount bug with the default
  entrance animation).
- **Known real-data footguns, already fixed once — don't reintroduce
  them:**
  - Savant's raw CSV leaves numeric columns like `estimated_woba_using_speedangle`
    as the *string* `'0'` (not blank) on rows where the stat doesn't
    apply (e.g. non-batted-ball pitches). If you do `Number(cell)` you
    get a real `0` that silently dilutes any average toward zero unless
    you gate on the row actually being the right kind (e.g.
    `type === 'X'` for batted-ball-only fields).
  - Separately: many Savant fields are just *blank* (empty string) on
    rows where they don't apply (`launch_speed`, `bat_speed`,
    `swing_length`, etc.). `Number('')` is `0`, **not** `NaN` — so the
    common pattern `Number.isNaN(Number(cell)) ? null : Number(cell)`
    silently turns "no data" into a phantom real `0`. This exact bug
    crushed the batting lab's "exit velo by game" chart toward zero
    this session. Always explicitly check `cell === '' ? NaN :
    Number(cell)` for any field that isn't populated on every row. See
    `numOrNaN()` in `src/lib/batter-pitch-log.ts` for the fix pattern.
  - MLB's people-search endpoint returns the position as the short code
    `'P'`, not the string `'Pitcher'` — filter with
    `p.primaryPosition === 'P'`.

## 4. Directory map

```
src/app/mlb/batting-lab/
  page.tsx                     search/landing page (+ "featured players" strip)
  [playerId]/layout.tsx        shell: headshot/name/team header + tab nav, wraps
                                every tab in BattingLabProvider
  [playerId]/page.tsx          Overview tab
  [playerId]/arsenal/          Vs Arsenal tab
  [playerId]/location/         Location Lab (heatmap) tab
  [playerId]/hot-zones/        Hot Zone Overlay tab
  [playerId]/sequencing/       Sequencing tab
  [playerId]/trends/           Trends tab
  [playerId]/h2h/              H2H tab
  [playerId]/reaction/         Reaction Window — ARCHIVED, pulled from the tab
                                nav (see layout.tsx comment) but files left in
                                place; not deleted, just unlinked

src/app/mlb/pitching-lab/      same shape, tabs: page.tsx(Overview) / arsenal /
                                location / overlay(Hot Zone) / stuff(Edge+) /
                                sequencing / h2h / trends

src/components/batting-lab/    batter-side tab components (one file ~= one tab,
                                plus the shareable PNG cards)
src/components/pitching-lab/   pitcher-side equivalents
src/components/player/         shared across both: StatsPercentilesRail
                                (SavantBar/SeasonStatsCard/PercentileRankingsCard),
                                PlayerRadarChart, PlayerSnipCard +
                                PlayerBioExportButton, CareerTable, BioTab, etc.

src/lib/                       one file per data domain — see §6
src/app/api/mlb/*/route.ts     thin GET wrappers around the lib functions,
                                nearly all `export const dynamic = 'force-dynamic'`
                                or a `revalidate` window
```

## 5. Data flow pattern

Each lab has a context provider (`src/lib/batting-lab-context.tsx` /
`pitching-lab-context.tsx`) that fetches the player's core identity/bio/
season-stats/percentiles **once** via `/api/mlb/batting-lab` or
`/api/mlb/pitching-lab`, then hands it to every tab through React
context (`useBattingLabData()` / `usePitchingLabData()`). The Provider
is mounted with `key={playerId}` at the layout level so switching
players remounts it cleanly instead of needing imperative state resets.

Individual tabs fetch their *own* additional data beyond the shared
context (e.g. the Sequencing tab fetches the full per-pitch log itself)
— there's no single mega-fetch, each tab pulls what it specifically
needs, cached by Next's `fetch` with a `revalidate` window (usually
`21600` = 6h for Savant CSV pulls, `3600` = 1h for MLB Stats API calls
that change during a game day, `86400` = 24h for anything about a
finished past season).

## 6. Real data sources (all live, no mocks)

- **Baseball Savant CSV** — `https://baseballsavant.mlb.com/statcast_search/csv?...`.
  Two shapes used throughout:
  - `type=details` — raw per-pitch rows (one row per real pitch thrown).
  - aggregated (`group_by=name`, *omit* `type=details`) — one row per
    (player × pitch-type) with Savant's own pre-computed real
    aggregates (ba/slg/woba/xwoba/velocity/whiff%/k%/hard-hit%/spin/
    extension/run-value, etc).
  Every parser hand-rolls a small CSV line parser (`parseCSVLine`) —
  there's no CSV library dependency; the pattern is copy-pasted
  per-file on purpose so each fetcher stays self-contained. Watch the
  footguns in §3 whenever you add a new field.
- **MLB Stats API** — `https://statsapi.mlb.com/api/v1/...`. Used for:
  bio/identity (`/people/{id}?hydrate=currentTeam`), schedule + real
  confirmed probable pitchers (`/schedule?...&hydrate=probablePitcher`),
  boxscores (`/game/{gamePk}/boxscore` — real lineup order), career
  year-by-year (`/people/{id}/stats?stats=yearByYear`), real head-to-head
  (`/people/{id}/stats?stats=vsPlayerTotal&opposingPlayerId=`), gameLog
  (`/people/{id}/stats?stats=gameLog&group=hitting|pitching` — used for
  both team-record and venue-record splits, since each gameLog row
  carries a real `opponent` and a real `game.gamePk` you can join
  against `/schedule?gamePks=...&hydrate=venue` for the real ballpark),
  and real league leaders (`/stats/leaders?leaderCategories=...`, wrapped
  by `getLeaders()`/`getMetricPercentile()` in `src/lib/lab.ts`).
- **Supabase** — only for `batter_hot_zones` / `pitcher_hot_zones`
  (weekly cron-populated, read via `getBatterHotZones`/
  `getPitcherHotZones` in `src/lib/hot-zones.ts`, exposed at
  `/api/batter-zones` / `/api/pitcher-zones`). Everything else is a live
  pull, not pre-computed/stored.

## 7. Key lib files (batter side — pitcher side mirrors almost every one)

| File | What it does |
|---|---|
| `batter-pitch-log.ts` | General-purpose raw per-pitch season log — the base data source most batter tabs build on. Also resolves real pitcher names in bulk. |
| `batter-arsenal-stats.ts` | Full real stat line per pitch type (aggregated Savant endpoint) + a homemade "Edge score" (percentile of `batter_run_value_per_100` vs. a real pool). |
| `batter-zone-arsenal.ts` | Pre-existing 13-zone × pitch-type grid, all/vs_lhp/vs_rhp splits. |
| `batter-situational-zones.ts` | Real zones broken out by count situation (first-pitch/even/2-strike/3-ball) — live CSV aggregation, mirrors `pitcher-situational-zones.ts`. |
| `batter-stats.ts` | Season stats, Statcast summary, real career H2H (`getBatterVsPitcher`). |
| `batter-bat-speed.ts` | Bat speed / contact-quality / miss-distance-by-pitch profile. |
| `batter-next-series.ts` | Real next series (consecutive real games vs one opponent) + real confirmed starters + the opponent's other real roster pitchers ("bullpen arms" — no fabricated SP/RP role, just "not a confirmed starter"). |
| `batter-team-record.ts` / `batter-venue-record.ts` | Real per-opponent-team and per-ballpark splits, from `gameLog`. Venue version supports `range: 'season'\|'career'` (career loops one `gameLog` fetch per real season from the player's real MLB debut year). |
| `venue-schedule.ts` | Shared `getVenuesForGames(gamePks)` (bulk real venue lookup) + `getDebutYear(playerId)`, used by both team's venue-record libs. |

Pitcher-side equivalents: `pitcher-pitch-log.ts`, `pitcher-arsenal*.ts`,
`pitcher-situational-zones.ts`, `pitcher-start-trends.ts` (real per-start
box-score + Statcast merge, feeds the Trends tab), `pitcher-next-start.ts`
(real next confirmed start + opponent's real recent lineup), `pitcher-venue-record.ts`.

## 8. Shareable PNG card pattern

Several tabs have a "Share this ↗" / "Export ↓" button that renders a
1080×1350 (or fixed-width) branded card and downloads it as a PNG via
`html-to-image`'s `toPng()`. All hand-built as **inline styles**, not
Tailwind classes, inside the captured subtree (keeps `toPng` rendering
consistent regardless of stylesheet load timing). Brand: cream/orange/
black, `Outfit` for names/headlines (the sitewide brand font — see
`layout.tsx`/`globals.css`, `--font-outfit`), `JetBrains Mono` for
stats/labels, `Bebas Neue` only for the "THE EDGE" wordmark, zero
border-radius on data elements. Existing cards:

- `src/components/pitching-lab/LineupH2HShareCard.tsx` — pitcher vs. the
  real opponent lineup for his next start.
- `src/components/batting-lab/BatterSeriesH2HShareCard.tsx` — batter vs.
  the real confirmed starters in his next series.
- `src/components/batting-lab/BatterCountBreakdownShareCard.tsx` — real
  "put-away count" (0-2/1-2/2-2/3-2) breakdown with mini zone boxes.
- `src/components/player/PlayerSnipCard.tsx` + `PlayerBioExportButton.tsx`
  — headshot/name/percentiles on a real team-color + 50%-opacity real
  team-logo watermark background. **Not shown inline on the page** (that
  was tried and reverted per George's request) — `PlayerBioExportButton`
  renders `PlayerSnipCard` off-screen (`position:fixed; left:-9999px`)
  purely to capture, triggered by a plain "Export bio ↓" button on
  Overview. `SavantBar` (in `StatsPercentilesRail.tsx`) takes an
  optional `textColor` prop and a white text-shadow halo so its labels
  stay legible over the logo watermark — this only affects the export
  card, the plain on-page percentile rail is untouched.

Pattern for a new one: copy an existing card file, keep the same
CARD_WIDTH/HEIGHT + font stack, build from data the *parent component
already computed* (no new fetch inside the card itself).

## 9. Heatmap / hot-zone conventions

- `BatterSwingHeatmap.tsx` (Location Lab) — FLIR-style thermal density
  heatmap (blue=cold→red=hot, `densityColor()`), binned into a
  `COLS=130` grid with `boxBlur(grid, passes=4, radius=2)`. The
  resolution and blur passes/radius must move together — raising COLS
  alone without raising blur radius makes sparse subsets (e.g. "Triples"
  with n=1) look like separate hard-edged squares instead of soft
  blended blobs, since a fixed-radius kernel covers a shrinking
  real-world area as the grid gets finer.
- `BatterHotZoneOverlay.tsx` / pitcher's `HotZoneOverlay.tsx` — real
  13-zone grid (9 core + 4 chase), `netTilt()` (in `pitcher-arsenal.ts`)
  computes a real matchup-tilt score from real batter xwOBA vs. real
  pitcher ba_against/usage/whiff — reused unchanged on both sides, just
  fed from whichever side owns the tab.

## 10. What's done this session (2026-09-14/15)

Both labs are feature-complete for: Overview (bio, percentiles, radar,
career stats, export-bio PNG), Vs Arsenal (full real stat line + Edge
score), Location Lab (FLIR heatmap + pitch-type filter + rich per-pitch
hover), Hot Zone Overlay (season + per-count-situation, real opponent
overlay defaulting to next confirmed starter), Sequencing (self-filtering
zone/pitch picker + shareable put-away-count graphic), Trends (6 charts
in a 2×3 grid incl. rolling OPS/EV/hard-hit%, all with real linear trend
lines), H2H (real next-series/confirmed-starters/bullpen-arms on the
batter side, real next-start-vs-lineup on the pitcher side, both with a
shareable PNG; real record-vs-team and record-by-ballpark with a
season/career toggle, on H2H for both labs — team logos on the
record-vs-team rows). Reaction Window is archived (unlinked from nav,
files intact) pending a rethink of how it should work.

## 11. Explicitly NOT started / open

- The player-slug (`/mlb/players/[id]`), team-slug, fantasy, and game-slug
  pages — George named these as "the last few pages" to move to next but
  gave no specific instructions yet. Nothing has been touched there this
  session.
- No decision yet on what Reaction Window becomes.

## 12. How to pick this back up

1. Read this file + `AGENTS.md`/`CLAUDE.md` first.
2. `npx tsc --noEmit -p .` to confirm a clean baseline before touching
   anything.
3. For any new feature: verify the real data exists (curl the live
   endpoint) → build → typecheck/lint the touched files → verify live in
   Chrome → only then report done.
4. Ask George what he wants on the player/team/fantasy/game pages before
   guessing — he flagged them but hasn't specified scope.
