# Lab: Dashboard builder & Team make-up (pitching)

Two admin-only experiments in the x9Lab **Lab** (`/admin/lab`). Both read the same
club-level pitching data and are meant to trial an analysis before it earns a
public page. They sit behind admin basic-auth (`src/proxy.ts` covers `/admin`),
are `noindex`, and are not linked from the public site.

| Experiment | Route | Status |
|---|---|---|
| Team make-up: pitching | `/admin/lab/team-makeup` | Trial |
| Dashboard builder (the "chart builder") | `/admin/lab/chart-builder` | Trial |

The Lab index (`src/app/admin/lab/page.tsx`) lists experiments in one `EXPERIMENTS`
array; add an entry there to register a new one.

---

## 1. Team make-up: pitching

**The question it answers:** what is each club's pitching staff made of: what they
throw, how hard, how it moves, and how much arm slots and release points differ
from pitcher to pitcher, and does a tighter release point line up with fewer runs?

**Page:** `src/app/admin/lab/team-makeup/page.tsx` (server shell; fetches runs
allowed once) → `src/components/lab/TeamMakeupLab.tsx` (the page body).

### Controls
- **Role toggle (sticky):** All pitchers / Starters / Bullpen. A pitch is a
  *starter* pitch if its pitcher threw the club's first pitch of that game
  (openers count as starters); everything after is *bullpen*.

### Sections
1. **§ 01 What they throw**: pitch-type share per club (FF, SI, FC, SL, ST, CU, CH, FS) and the four-seam velocity range (middle 80% of pitches, tick = average).
2. **§ 02 One club, pitch by pitch**: pick a team (`TeamExplorer` in `TeamMakeupClient.tsx`) to see its mix and velocity variation, a movement profile (pitcher's view, dot = average, ring = ±1 SD) and release point by pitch.
3. **§ 03 Arm-angle variation**: every pitcher with 100+ pitches as a dot per club, ordered by width (highest minus lowest pitcher-average arm angle). 0° = sidearm, 90° = overhead.
4. **§ 04 Release points and runs allowed**: release-point variation by club (tightest first) and `SpreadVsRuns`, a scatter of spread against runs allowed with the correlation.

Clubs load progressively (`useTeamMakeups.tsx`, 3 at a time) so sections fill in
as each club arrives; a `LoadBar` shows progress and failures.

### Data flow
```
page.tsx (server)  ── getTeamRuns(season) ──► MLB Stats API statSplits sp/rp (limit=100)
TeamMakeupLab (client) ── GET /api/admin/lab/team-makeup?team=ID&season=YYYY
                              └─► getTeamMakeup() ─► Baseball Savant pitch CSV (month windows)
                                                    └─► aggregated in TS, cached via withSavantCache
                                                        (savant_fetch_cache table)
```
- API route: `src/app/api/admin/lab/team-makeup/route.ts` (`maxDuration = 60`; 400 without `team`, 404 when pitch data is unavailable).
- Aggregation: `src/lib/lab/team-pitch-makeup.server-fetch-allowed.ts`. One club-season is ~25k pitches, pulled in month windows because Savant truncates a CSV at 25,000 rows (a window near the cap is split and re-fetched). Only the small aggregate is cached; raw CSVs are never cached (they exceed the 2 MB fetch-cache ceiling).
- A cold club takes ~10–30 s; a cached one is instant.

### Metric notes
- Units: velo mph; break in inches, **arm-side positive**; release side in feet from the middle of the rubber; arm angle in degrees.
- **xwOBA against** stands in for xERA (Savant doesn't publish xERA per team and it can't be rebuilt from pitch rows).
- **Whiff %** = swinging strike + blocked + foul tip + missed bunt, per swing.
- Savant uses "AZ" where `MLB_TEAMS` uses "ARI"; the pitching team is derived from `inning_topbot` as a guard.
- The flight animation draws a constant-acceleration **model** through averaged release and plate points, not a tracked trajectory.

---

## 2. Dashboard builder (chart builder)

**The question it answers:** let me build my own view of the league: KPI cards,
scatters, bars and tables, filtered by league/division/role, with clicking a club
highlighting it everywhere (Power BI style).

**Page:** `src/app/admin/lab/chart-builder/page.tsx` → `src/components/lab/ChartBuilder.tsx`.
Same data as Team make-up (same API route and `getTeamRuns`).

### Layout
- **Slicers** across the top: league, division, starters/bullpen override.
- **Canvas:** a 4-column grid of tiles (`span` 1, 2 or 4; collapses to 2 columns under 700 px).
- **Fields pane** (right, sticky, 320 px): `FieldsPane.tsx` lists the metric catalog to bind to tiles.
- **Cross-highlighting:** click a club in any visual to highlight it in all of them.

### Visual types (`Kind` in `dash/types.ts`)
`kpi`, `scatter`, `bars`, `table`, `hist`, `radar`, `mix`, `dumbbell`, `movement`,
`heat` (use / whiff / velo), `flight`, `armclock`. Rendering lives in
`dash/ChartTile.tsx`, `dash/MoreVisuals.tsx` and `dash/ArmClock.tsx`.

### Tile model
Each tile is plain JSON: `{ id, kind, title, span, x, y, size, color, trend, labels, desc, cols, heat, split }`
where each channel is `{ metric, role }`. Starter dashboard = `defaultTiles()`
(4 KPIs, 2 scatters, 2 bars, histogram, dumbbell, radar, mix, arm clock, flight,
movement, heatmap, table).

### Metric catalog (`src/lib/lab/team-summary.ts`)
One list, `METRICS`, grouped as **Results** (RA/9, ERA, runs, IP), **Outcomes**
(xwOBA, whiff, CSW, chase, zone, K%, BB%, hard-hit, barrel, EV), **Staff**,
**Variation** (release-point spread, arm-angle SD/range/low/high), **Mix**
(fastball/breaking/offspeed share) and **per-pitch-type** usage, whiff, velocity,
velocity range, break, and release variation. Helpers: `summarize()`, `pearson()`,
`linearFit()`, `fmt()`.

### Persistence
The layout is saved **in this browser only** (`localStorage`, key
`lab-dashboard-v2`, wrapped in try/catch, validated on load). **Reset** restores
the starter dashboard. It is not shared across devices or people.

---

## Shared files

| File | Role |
|---|---|
| `src/lib/lab/team-pitch-makeup.server-fetch-allowed.ts` | Savant pull + aggregation, `getTeamMakeup`, `getTeamRuns` |
| `src/lib/lab/team-summary.ts` | Metric catalog and stats helpers |
| `src/lib/lab/pitch-meta.ts` | Pitch names, colours, ordering |
| `src/components/lab/useTeamMakeups.tsx` | Progressive per-club loading + `LoadBar` |
| `src/components/team/ui.tsx` | `C`, `SANS`, `Card`, `Section`, `Foot`, `Empty` (design system) |

## Things to know
- **Architecture exception:** these pages pull Savant live (then cache the aggregate). That breaks the project's "precompute, never fetch Savant in a render path" rule, which is acceptable only because they are admin-only trials. Before any of this goes public, move it to a cron → Python → Supabase table → page reads rows.
- Files are named `*.server-fetch-allowed.ts` so the `guard.sh` fetch check lets them through; keep that suffix on anything in this area that fetches.
- Admin pages are `force-dynamic`.
- Fonts/colours follow `DESIGN_SYSTEM.md` (Outfit headers, JetBrains Mono labels, 14px rounded cards).
- Not yet done: no shared/saved dashboards, no export from the builder, no mobile pass beyond the CSS breakpoints.
