# Session notes — 2026-09-17 (Key Players rework)

## Context for next session
This continues from an earlier, paused **team page rebuild** (h2h day/night, stadium
records, team stats, UI overhaul) — explicitly paused mid-plan to prioritize the
Key Players work below. Resume the team page only if asked; don't pick it back up
by default.

The approved plan for this session's main work is saved at:
`/Users/georgecomerford/.claude/plans/clever-mapping-kurzweil.md`
— read it for full original scope/reasoning. Two of its items are still outstanding
(see below).

---

## What was done today

### 1. Location Lab color bug (fixed)
All 3 zone-grid tabs default to the `usage_pct` metric, which renders as a plain
orange intensity scale — but the legend always showed the blue/grey/red
"Better/League-average/Worse for the pitcher" version, making it look broken
(all-orange grid, mismatched legend).

- `src/components/pitching-lab/ZoneGrid.tsx` — `ZoneColorLegend` now takes a
  `metric: PitcherZoneMetric` prop and renders the correct legend per metric.
- Updated all 3 call sites: `src/app/mlb/pitching-lab/[playerId]/arsenal/page.tsx`,
  `src/components/pitching-lab/LocationLab.tsx`, `src/components/pitching-lab/HotZoneOverlay.tsx`.
- Verified live: legend correctly switches between "Rarely thrown/Moderate/Heavily
  used" (usage %) and "Better/average/Worse" (the other 6 metrics).

### 2. Two Key Players scoring signals re-enabled (were silently dead since 2026-09-08)
`getBatterRawPitchLog` (velocity-matched pitch-type fit) and `getBatterVsPitcher`
(career H2H) were both hardcoded to return `null` — disabled for performance/
reliability reasons (2-2.5MB uncached CSV per batter; ECONNRESET storms under
concurrent load with no timeout).

- `src/lib/series-matchup.ts` — `getBatterRawPitchLog` now delegates to the
  **already-built, already-cached** `getBatterPitchLog` in
  `src/lib/batter-pitch-log.ts` (uses `withSavantCache` / the `savant_fetch_cache`
  Supabase table) instead of live-fetching. Deleted ~45 lines of dead disabled code
  and the now-unused `parseCsvLine` helper. H2H call site re-enabled
  (`getBatterVsPitcher(...)` instead of `const h2h = null`).
- `src/lib/batter-pitch-log.ts` — added `releaseSpeed` field/parsing (needed for
  velocity-matched pitch-type fit).
- `src/lib/batter-stats.ts` — `getBatterVsPitcher` fetch fixed: was
  `cache: 'no-store'` with no timeout → now `next: { revalidate: 21600 }` +
  `AbortSignal.timeout(5000)`. This was the root cause of the ECONNRESET storms.
- Verified live: narrative text now shows real computed evidence, e.g. *"hitting
  .080 at the velocity he actually throws it — it's his identified put-away pitch,
  too."*

### 3. Overlay rebuilt around real shared Lab components
Previously a bespoke 9-cell grid, not the real 13-zone board the Labs use.

- `src/components/pitching-lab/ZoneGrid.tsx` — added new exported `TiltBoard`
  component: a render-prop, layout-only 13-zone board (9 core + 4 chase corners),
  so callers needing custom color/content (not one of the 7 raw pitcher metrics)
  can still use the real zone geometry. Also exported previously-private
  `CHASE_ALIGN`.
- `src/components/pitching-lab/HotZoneOverlay.tsx` — its own `TiltGrid` now
  delegates layout to `TiltBoard` instead of hand-rolling geometry.
- `src/components/Top3KeyPlayersTab.tsx` — `ZoneMatchupGrid` rewritten to use
  `TiltBoard` for all 13 real zones (was a hand-rolled 9-cell array), with its own
  tone classes (emerald/rose/stone, matching the card's `leanStyle` convention).

### 4. Horizontal-scroll → popup interaction
- `KeyPlayerCard` (`Top3KeyPlayersTab.tsx`) header click now opens a `DetailModal`
  popup (the established "grey the page out" pattern from
  `src/components/game-preview/DetailModal.tsx`) instead of inline expand +
  horizontal scroll.

### 5. Pro paywall (~50% gated)
- New `LockedTeaser` component: free users get an upsell box (mirrors
  `TeamSnapshotCard`'s freemium pattern) instead of the full zone grid/narrative/
  H2H detail. `LabFunnelLink` used for the "Unlock" CTA.
- `KeyPlayerCard` shows a small "Pro" badge when `!isPro`; conditionally renders
  `KeyPlayerDetailModal` (pro) or `LockedTeaser` (free).
- The always-visible free tier: `StarterBreakdown` (starter-vs-starter summary
  pills) stays on the card regardless of pro status.
- `isPro` threaded through: `src/app/mlb/[slug]/page.tsx` →
  `src/components/KeyPlayersSlotAsync.tsx` → `Top3KeyPlayersTab.tsx`.
- **Not yet tested live** — `isPro` defaults to `true` in this environment, so the
  `LockedTeaser` path hasn't actually been seen rendering (would need a real
  non-pro subscriber row, or a temporary code flip, to test).

### 6. Narrative depth (arsenal gap + park factor)
`src/lib/key-players-narrative.ts`:
- New `arsenalGapClause(pitchTypeFit)` — flags genuine 2-pitch mixes ("no real
  third weapon to change the batter's eye level or timing"), computed from data
  already passed in, no new fetch.
- New `parkFactorClause(park, batSide)` — real side-specific HR park factors from
  `src/lib/parks.ts`'s `getParkFactor()` (real `park_factors` Supabase table), only
  mentioned when ≥8% notable in either direction.
- `buildBatterNarrative` / `buildPitcherNarrative` extended to take
  `fullArsenal`/`park` and append these clauses.
- `src/components/KeyPlayersSlotAsync.tsx` — fetches `getParkFactor` once per game
  (not per player) and passes it down.

### 7. Cold-start performance fix
Found via `curl` timing: first (cold-cache) load of a game-preview page took
**57.3s**; warm-cache reload took 4.7s. This was masquerading as browser-automation
"failures" earlier in the session (navigate calls losing tab-state during the long
pending request).

- `vercel.json` — registered the already-built-but-never-scheduled
  `/api/cron/series-top3-snapshot` route (runs 3×/day, 13:00/17:00/21:00) to
  pre-warm the Savant cache ahead of real traffic.

### 8. Chase-zone (corner) layout bug — found + fixed during verification
Zoomed screenshot showed the chase-corner cells' text getting hidden behind the
core 3×3 grid in the new `TiltBoard`-based components. Root cause: in `TiltBoard`,
each chase quadrant is a full-size cell with the core grid painted on top of its
center — only content aligned toward the *outer* corner (via `CHASE_ALIGN`) stays
visible.

- Fixed in `HotZoneOverlay.tsx`'s `TiltGrid` and `Top3KeyPlayersTab.tsx`'s
  `ZoneMatchupGrid`: both now conditionally apply `flex-col ${CHASE_ALIGN[zone]}`
  for chase cells instead of `items-center justify-center`.
- **Verified live** (final action of this session): zoomed into the Yordan Alvarez
  detail modal's zone grid — all four corner labels ("Tough 14.3%", "edge 5.4%",
  "Tough 10.5%", "Tough 17.3%") now render fully visible in their own corners, no
  overlap with the core grid.

### Other fixes along the way
- Fixed pre-existing `any`-type lint errors in `Top3KeyPlayersTab.tsx`'s postgame
  snapshot mapping (added `RawPerStarter`/`RawMatchupOption` local types) since a
  full rewrite of that file was already happening.
- Proactively cached `getPitcherSituationalZones`
  (`src/lib/pitcher-situational-zones.ts`) with `withSavantCache` — same class of
  bug as the batter raw-log issue, found while researching count-tendency data.
  Not yet consumed anywhere (see outstanding items).

---

## Verified live this session
- Location Lab legend switches correctly per metric.
- Re-enabled signals produce genuinely different, real narrative text (not just
  "not null").
- Modal popup opens/closes correctly; zone grid, narrative box, and Lab deep link
  ("See Alvarez in Batting Lab →") all render correctly inside it.
- No console errors on a fresh page load.
- Chase-zone corner alignment fix — confirmed via zoomed screenshot.
- `tsc --noEmit` / `eslint` clean on every touched file (only 2 pre-existing
  unrelated `<img>` warnings in `HotZoneOverlay.tsx`).

## Not verified live (do first if picking this back up)
- Clicking the "See [Player] in Batting/Pitching Lab" link end-to-end (the link
  rendered with the correct href — `/mlb/batting-lab/${id}/hot-zones` or
  `/mlb/pitching-lab/${id}/overlay` — but the actual navigation wasn't
  click-tested this session).
- The free/non-pro `LockedTeaser` render path (needs a real non-pro subscriber row
  or a temporary `isPro` flip to test — see item 5 above).

---

## Outstanding from the approved plan (not started)
1. **`getSprayDefenseFit`** — new signal joining a batter's real pull tendency
   (`src/lib/batter-spray.ts`, reusing `SprayChart.tsx`'s pull-tendency math) with
   the opposing team's projected fielder's real OAA
   (`src/lib/batter-fielding.ts`'s `getOutsAboveAverage`) — the "hits to 2B a lot,
   and the 2B is terrible" signal from the original ask. Needs wiring into
   `getSeriesTop3`'s scoring as a third weighted component alongside `zone_score`
   and `pitch_type_fit_score`.
2. **Pitcher-side mirror** of the same signal inside `getPitcherSeriesEdge` (own
   infield/outfield defense, not spray against them).
3. **Count-tendency narrative clause** — how a pitcher's pitch mix shifts by count
   situation. Real data exists (`pitcher-situational-zones.ts`'s `fine: FineEntry[]`,
   now cached), but wiring it into Key Players needs threading a new per-pitcher
   fetch through `Top3Batter`/`Top3Pitcher`/`KeyPlayerCandidate` types across
   several files — deferred as too invasive to do safely in the same pass,
   complicated by `Top3KeyPlayersTab.tsx` being a client component (can't fetch new
   data itself).

## Explicitly paused (don't resume unless asked)
- Team page rebuild: h2h record (day vs night), stadium records, team stats,
  overall UI overhaul of `src/app/mlb/teams/[slug]/page.tsx` /
  `TeamDugoutView.tsx`.

---

## Environment notes
- Dev server: start with
  `(lsof -ti:3000 | xargs kill -9 2>/dev/null; true) && npm run dev`. Was killed
  twice this session by macOS for low system memory (lots of Chrome/VS Code/Steam
  running) — not a code issue, just be ready to restart it.
- Maintenance mode is on (`src/proxy.ts`'s `MAINTENANCE_MODE = true`), gating all
  non-home pages. Bypass via cookie `edge_preview_access=password` (only works in
  non-production `NODE_ENV`) — needed for `curl` testing
  (`curl -b "edge_preview_access=password" ...`), not needed for the Chrome
  browser session.
- `git status` at end of session shows a large pre-existing set of unstaged
  changes across the repo (not all from this session — appears to be an ongoing
  broader refactor). Nothing was committed this session; no commits were requested.
