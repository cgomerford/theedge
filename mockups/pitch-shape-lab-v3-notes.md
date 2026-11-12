# Pitch Shape Lab v3 mockup: notes

File: `mockups/pitch-shape-lab-v3.html` (static, offline, about 440 KB, plain JS, one Google Fonts link for Red Hat Display).
Open it next to http://localhost:3000/mlb/lab/pitch-shape. Top strip is a dev control: colour key A (red = better for the pitcher, current) or B (neutral, cool = few whiffs, warm = many; green/red kept for chips only). The whole scale is one CSS block at the top of the file.

## Current page vs this mockup

| | Current page | Mockup v3 |
|---|---|---|
| Structure | Tool first (finder, refine panel, results kit), explanations in side panels and the guide page | One scroll, seven numbered sections, each titled as a plain-English question with a computed one-line answer. Martini glass: short author-led stem, then free exploration |
| First screen | Controls and map | Purpose line, 3-item "how to read the map", the map already selected on a worked example (Emerson Hancock's spot), computed answer above the map |
| Story order | Map, results, board, pitcher detail in separate places | Map, who is there, other levels, what the shape produced, what the leaderboard says, then the pitcher story. Each step uses the spot chosen in the one before |
| Language | Stat names and tool labels | Questions as headings. Every number has its sample (n) beside it. Inline "?" definitions instead of a tour. Past tense only |
| Place-keeping | Selection lives in controls | Sticky "Your selection" breadcrumb (League, Four-seam, Spot, Pitcher), each crumb jumps back; "Back to the map" keeps the spot |
| Disclosure | Several panels | At most two levels: section, then one expander ("Map settings", "Show all") |
| Cut | | Pitcher search box, refine panel, pitch-type picker (mockup is right-handed four-seam only), pitch-finder dots hover panel, export cards |
| Added | | Computed answer sentences; sample chip (STRONG 200+, MODERATE 100-199, THIN under 100 swings) with a rough interval bar; level cards with mini-maps; leaderboard explainer with presets Basics/Shape/Results; before/after marker; "Other things may have changed too" note; game-by-game "not built yet" card; closest-shape table; colour-key toggle |

## Real data vs illustrative

Real (baked from the running local app on 2026-11-12, each with a caption in the page):
- League heat map and every window total: `/api/mlb/pitch-shape/results?type=FF&hand=R` (2024-26 pooled, 0.1 in cells regrouped to 0.25 in squares, area run -3 to 19 in, ride 6 to 25 in). Window sums, whiff rate, runs saved per 100, wOBA, xwOBA, average, slugging are computed in the browser from these.
- Leaderboard, Shape Score, Gap, shape-side and own-side whiffs: `/board?type=FF&hand=R&season=2026` (343 pitchers).
- Pitcher averages for 2025 and 2026 (dots, season rows, closest-shape list): `/pitcher-dots` (195 and 199 pitchers with 300+).
- "Throws it now and then" for the 3 example spots: `/throwers` at radius 1.
- Levels: `/levels-compared` (MLB, Triple-A, FSL 2026) and `/pitcher-dots?level=aaa|fsl`.
- Emerson Hancock: season rows, 2025 and 2026 sampled pitches, and the in-season Mar to Aug move from `/shape-changes?season=2026&pitcher=676106` (ride -5.9 in, speed +1.8 mph, run -1.0 in; n=51 and n=181).
- Gerrit Cole: real monthly rows May-Sep 2026 (speed, ride, run, swings, whiffs, balls in play, xwOBA on contact) from the stored sample in `src/data/lab-demo/server.json`.
- League shape-change lists for 2025 and 2026 (four-seam) from `/shape-changes`.

Mockup rules (marked MOCKUP RULE in the page, not live-page rules): the 1-point band for the above/in line/below whiff chip in section 2 (the live board judges by runs saved, band 0.4 per 100); the "under 3 pitchers" level minimum; the rough 95% interval bar (normal approximation).
Nothing numeric is marked ILLUSTRATIVE because no figure was invented; the chip exists in the legend for later use.

## What I could not source, and why
- Monthly results for Hancock: the monthly table is only reachable through a signed-in page or the database. A direct database read was refused by the permission system, so I used the API only. His before/after is therefore season to season (2025 vs 2026), and the Mar to Aug move is shown as change since March with the months between not drawn. Cole carries the full monthly results view instead.
- A pitcher with both a real shape move and real monthly results: not available through allowed routes.
- Per-start data: does not exist in precomputed tables (card says so).
- Number of distinct pitchers who threw at least one pitch into a window: not stored in the cells; the page says so.
- Shape-only expected xwOBA on contact: only a league-wide figure is stored, so the reference line is the league four-seam average.
- Minor-level heat maps and AFL / Spring Training: not baked (levels shown as dots and averages; AFL and Spring Training disabled as "not loaded yet").
- Per-season map: the baked map is pooled 2024-26 only; season options are shown disabled.
- The wording "Start-by-start" is a banned word in the copy rules (only "Start here" is allowed), so the card is titled "game by game".

## Ten lessons to implement, ranked by impact

1. Put a computed answer sentence under every section heading, and make headings questions. Effort M. Files: `ShapeIntro.tsx`, `V3Intro.tsx`, `ShapeResultsSection.tsx`, `ShapeSidebar.tsx`.
2. Load with a worked example already selected so nothing is blank, and keep a sticky "Your selection" breadcrumb with a back link that preserves the spot. Effort M. Files: `ShapeLab.tsx`, `PitchFinderV2.tsx`, `shapeSelection.ts`.
3. State every cohort average honestly: window in inches, n pitches, n swings, STRONG/MODERATE/THIN chip, rough interval, and an empty state under the minimum. Effort S. Files: `ShapeResultsKit.tsx`, `ShapeResultsSection.tsx`, `HeatLegend.tsx`.
4. Explain the leaderboard in one sentence plus legend (Shape Score 1-99, Gap, band 0.4), with Basics/Shape/Results presets and greyed thin rows. Effort M. Files: `ShapeResultsKit.tsx`, `RunsSavedExplainer.tsx`.
5. Explain "0 pitchers" (nobody's average is there) and show the "throws it now and then" count separately. Effort S. Files: `PitchFinderV2.tsx`, `ShapeResultsKit.tsx`.
6. Pitcher story as questions with an auto-written past-tense headline, season cards, then months. Effort L. Files: `PitcherStory.tsx`, `PitcherDetailView.tsx`, `PitchRecap.tsx`, `PitchView.tsx`.
7. Before/after marker where the shape moved beyond the existing threshold, plus the fixed note that other things may have changed and no "because". Effort M. Files: `ShapeChanges.tsx`, `MonthOutcomes.tsx`, `monthStats.ts`.
8. Draw thin months greyed and hollow with n under each point, and break lines at missing months. Effort S. Files: `MonthOutcomes.tsx`, `monthStats.ts`, `PitchView.tsx`.
9. Level cards with shape-only averages and a mini-map showing each level against MLB, with the "results never compared across levels" note and disabled AFL/Spring Training chips. Effort M. Files: `LevelsCompared.tsx`, `AcrossLevels.tsx`, `LevelBar.tsx`, `MiniHeat.tsx`.
10. Make the colour scale one token block with an option for a neutral "what hitters did" scale; reserve green/red for gap chips. Effort S. Files: `heatPaint.ts`, `HeatLegend.tsx`, `heatGrid.ts`.

## Open decisions for George
1. Colour key: A (red = better for the pitcher) or B (neutral, what hitters did). A is faster to read for a front office; B avoids implying a verdict on the map and keeps green/red meaningful.
2. Backfill 2022-2024 shape and monthly data? It would turn the "earlier seasons not loaded" cards into real history. Cost: a bigger pipeline run and storage.
3. Build the per-game table? It needs a new nightly table (one row per pitcher, pitch type and game) and a minimum outing size.
4. Replace the board's runs-saved judgment with the 1-point whiff chip in the pitcher list, or keep runs saved everywhere?
5. Add a monthly-results API (Pro-gated) so the before/after bands can be drawn for any pitcher, not only the baked examples.

## Verification run
JSON data block parses; only font-family is Red Hat Display with the system sans fallback (no monospace or serif); copy-lint rules from `src/lib/banned-words.ts` run on visible text and JS strings after fixes (words like pick, sit, start, because were removed); headless Chrome loads the file with no console errors at 1400 px and 390 px.
