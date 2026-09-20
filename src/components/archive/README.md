# Archive

Components moved here 2026-09-17/18 while rebuilding `/mlb/[slug]` (the
game preview page) around a new wireframe. Each one is fully unused —
nothing imports from this folder — kept for reference/salvage rather
than deleted outright.

- `GamePageShell.tsx` / `LiveScoreboard.tsx` — the old tabbed page shell
  (Edge Indicator / Scout Report / Pitching Lab / Batting Lab / Teams /
  Key Players / Series / Fantasy tabs) and its live-score header strip.
  Superseded by the new wireframe's single-scroll layout — no tabs.
- `PitchingSlotAsync.tsx`, `BattingSlotAsync.tsx`, `TeamsSlotAsync.tsx`,
  `SidebarSlotAsync.tsx`, `Contrarian.tsx` — per-tab content for the old
  shell. None of this made it into the new wireframe's first pass; may
  get reintroduced piece by piece as the shell grows.
- `SeriesSlotAsync.tsx` — bundled SeriesMomentum + SeriesPredictions +
  SeriesPlayerStats into one "Series" tab. The new page composes
  SeriesPlayerStats and SeriesMomentum itself (still live, not archived)
  alongside a new SeriesHeaderBar / SeriesPostgameLinks — this exact
  bundle is what's redundant, not its child components.

Key Players (`KeyPlayersSlotAsync.tsx` / `Top3KeyPlayersTab.tsx`) is NOT
archived — it is composed directly into the new game preview page.

- `EdgeIndicator.tsx` — added 2026-09-18. Two real bugs, not just a
  style preference: (1) its body grid (`1fr 220px`) and per-factor row
  grid (`1fr 130px 68px 18px`) only collapse under a **viewport** media
  query (`max-width: 720px`), not a container query — squeezed into the
  game-preview page's 340px sidebar column, that grid never collapses
  and the layout breaks (overlapping text, squished bars — this is what
  George meant by "all over the place"). (2) Every color/border/
  background in it is `var(--text-primary)` / `var(--border)` /
  `var(--surface-2)` etc. — custom properties that are **never defined
  anywhere in this codebase** (confirmed via grep across `src/`), so
  borders/backgrounds were silently resolving to `none`/`transparent`.
  Replaced by `game-preview/EdgeIndicatorPanel.tsx`: same FACTOR_META
  descriptions / `buildEdgeSummary` / `ProDrillDown` stat breakdowns
  ported over (that content was fine), but laid out in one narrow
  column with concrete stone/orange colors, and factors open a
  full-page-greying modal instead of expanding in place.

- `RightRailContext.tsx` / `RightRail.tsx` — added, then archived, same
  session (2026-09-18). v2 of the Pitching Radar/Arsenal/Batting Radar
  buttons swapped the Edge Indicator column itself over to a Starting
  Pitcher or Batting detail view. Per George, that was the wrong
  interaction — the Edge Indicator should stay put, and each mini-view
  should open its own detail instead, in a grey-the-page-out
  `DetailModal` (matching how the Edge Indicator's own factor rows
  already worked). `StartingPitcherPanel.tsx` was NOT archived — it was
  refactored from a full standalone card into plain body content and is
  reused inside `DetailModal` via `PitcherRadarMiniCard.tsx`.

- `BatterRadarMiniCard.tsx` / `BattingPanel.tsx` — added same session as
  the row above, archived one step later (still 2026-09-18) once George
  asked for full lineup selection ("make sure each name you click and
  mini zone changes") plus a separate Standard Stats view (streaks, park
  record, vs-pitcher, situational splits). A single fixed-to-leadoff
  mini-card couldn't do either, so it's replaced by `BatterSelector.tsx`
  (clickable list of all 9 batters, hot zones pre-fetched for every one
  of them so switching is instant) + `BatterStandardStats.tsx` (the new
  stats view — on-demand-fetched per selected batter via
  `/api/mlb/player-extra-stats`, not pre-fetched for the whole lineup;
  see that route's own header comment for why). `HotZone.tsx` itself
  (the actual heatmap) is still live, just invoked directly from
  `BatterSelector.tsx` now instead of through `BattingPanel.tsx`.

- `SeriesHeaderBar.tsx` — the "Game X of Y" + series-record bar used to
  sit further down the page, right above the series-stats section. Per
  George, moved to a new `GameBriefBanner.tsx` at the very top of the
  page instead (start time, venue, real weather, and — when this game is
  part of a tracked series — the same Game X of Y content folded in).
  `JumpNav.tsx` no longer links to a "Series" anchor as a result (nothing
  to jump to — it's already on screen at the top); "Series stats" still
  does.

- `ScoutSlotAsync.tsx` / `ScoutReportTab.tsx` / `ScoutExpandCharts.tsx` —
  added 2026-09-18. The old tabbed Scout Report (data fetch + tab UI +
  pitch-detail expand charts), archived so the report can be rebuilt as a
  12-section single scroll (`components/scout/`, registry in
  `scout/sections.ts`), one section at a time. Only these three assembly
  files moved: the child cards they composed (PitchLocationCard,
  BullpenUsageCard, PitcherWorkloadCard, ABSChallengeCard, SBTendencyCard,
  FieldingAlignmentDiamond, BallparkWeatherCard, TTOFatigueChart,
  LineupSprayChart, TeamHotZoneCard, BatterStreakBoard, …) and the `lib/`
  data functions stay in place, ready to be pulled into new sections. Note
  ScoutReportTab's relative imports were rewritten to `@/components/…` so
  it still type-checks from here. `/mlb/[slug]/scout-report` now renders
  the new `ScoutReport`.

- `TeamDugoutView.tsx` + `LineupCard.tsx` / `BattingInningChart.tsx` /
  `PitchingInningChart.tsx` / `SeasonRollingChart.tsx` /
  `PlayerGradeDetailModal.tsx` — added 2026-09-20. The old team-page
  "Dugout" view and the components only it used. Replaced by the full club
  profile in `components/team/` (data in `lib/team-profile/`). Shared pieces
  it used (StandingsChart, PitcherWorkloadCard, BullpenUsageCard,
  PercentileRing) stayed in place; the moved files' imports were rewritten
  to `@/components/…` so they still type-check from here.
- `team-desk/` — added 2026-09-20. A short-lived "Club Desk" that reused the
  Scout Report's panels for one club on the team page; dropped because the
  team page is its own product, not a copy of the Scout Report. The panels it
  imported are still exported from `components/scout/*`.
