# Postgame rebuild — session notes (2026-09-19)

## Built so far
- **Hand-scored scorecard** (the only postgame piece built so far).
  - `src/lib/postgame/scorecard.ts` — turns one final game's MLB live feed into scorekeeper notation
    (6-3, F8, K / backwards K, 1B, HR, BB, E6, FC, DP, SF …), each runner's path round the bases, out numbers,
    RBI, ball/strike tally, per-inning runs/hits/errors/LOB, pitchers, catchers, umpires, header (attendance,
    weather, wind, start/end time). `getScorecard(gamePk)` (feed cached 6h).
  - `src/components/postgame/ScorecardSheet.tsx` — the printed form in black, everything filled in with a
    handwriting face (Caveat via next/font) + deterministic wobble. Server component, pure SVG.
  - Dev preview: `/dev/scorecard/<gamePk>` (404s in production). Needs the maintenance bypass cookie locally.
  - **Verified** on game 824225 against the official linescore: runs by inning, hits and LOB match exactly
    (COL 1/5/5, DET 8/8/7); pitcher lines match the boxscore.
- Note: `src/lib/postgame.ts` (old data layer) and my new `src/lib/postgame/` folder coexist —
  `@/lib/postgame` still resolves to the old file. Consider renaming when the old one is retired.
- Pre-existing lint error (not mine): `src/components/postgame/RadarChart.tsx` `cumulativeAngle` reassignment.

## Known scorecard limits (say so on the sheet, don't paper over)
- Errors row = errors credited on plays in that club's half-innings (charged to the opponent).
- Only two PAs shown when a club bats around twice in one inning in the same slot (rare).
- Notation for rare plays (triple play, interference variants, dropped third strike) falls back to the feed's
  event name; needs checking on more games before launch. **Test on 5–10 more finals** (extras, errors, DP, SB/CS,
  pinch hitters) before wiring it into a page.

## Not started (the rest of the spec)
Free page sections 1–12 and the Pro plan-vs-execution sections, built Scout-Report style
(`src/components/postgame/` registry + one lib module per section, sections streaming under Suspense,
free/pro tiers). Existing pieces to reuse rather than rewrite: `lib/postgame.ts` (WP series, top performers,
spray, umpire, manager decisions), `lib/postgame-aggregate.ts` + `mlb-live-feed.ts` (pitch log, box score),
`lib/abs-challenge-log.ts`, `lib/mlb-win-probability.ts`, `lib/bullpen-usage.ts`, `lib/pitcher-workload.ts`,
`components/PostGame*`, `WinProbabilityChart`, `PitcherWorkloadCard`.


---

# Update — postgame page rebuilt in the Scout format (same day)

`/mlb/[slug]/postgame` now renders `PostgameShell` (sticky section nav, one card per section, Free/Pro
tiers, "coming next" tiles) reusing the Scout components (`ScoutSection`, `Tabs`, `ClubHeader`, `Headshot`).
The old tabbed page (`PostGameReportTab` + children, `lib/postgame.ts`) is no longer rendered — left in
place for salvage.

## Live (5)
- §1 Final — score, linescore, venue/attendance/time/weather, decisions, series line ("CLE leads 1-0" from
  `schedule?hydrate=seriesStatus`), plain read built only from facts (margin, walk-off, extras, comeback,
  bullpen game) + where the winner's win probability bottomed out.
- §2 How the game swung — WP path by plate appearance (MLB `/winProbability`), 3–5 numbered inflection plays
  (largest per-play swings, ≥6 pts, spaced apart).
- §3 Top performers — top 3 batters / 3 pitchers of THIS game by summed win probability added;
  Decisive ≥15 pts / Solid ≥6 / Quiet; game lines, not season grades.
- §4 Box score — batting + pitching both clubs (tabs), pitch-by-pitch log in a collapsed `<details>`.
- §5 The scorecard — both sheets, Edge colours (black bands, orange hits/paths/RBI, yellow runs scored).

Files: `src/lib/postgame/{data,recap,scorecard}.ts`, `src/components/postgame/report/*`,
`src/components/postgame/{ScorecardSheet,ScorecardSection,SheetFrame}.tsx`.
Data: ONE cached fetch per game (`getPostData`: feed + winProbability + series) shared by all sections.

## Scorecard download
"Download PDF" = clone sheet into a print-only root + `window.print()` (Save as PDF); print CSS in
`ScorecardSection` zooms to one portrait page (verified: 1 page). **html-to-image PNG was removed** — it never
finished on this sheet (1,142 nodes; >120 s even with fonts skipped, in headless Chrome). If a PNG for social is
wanted, the route is a pure-SVG sheet rasterised via canvas/resvg, not html-to-image.

## Planned (registered, tiles show scope): §6–13 free, §14–22 Pro
starters plan-vs-night, spray & contact, ABS & challenges, bullpen used tonight (+ into tomorrow), defense & run
game, umpire report, key players scorecard, next up; Pro: sequencing audit, count-spot audit, zone-clash result,
arsenal night, chase/whiff, leverage timeline, ABS deep, bullpen pitch-type, into-tomorrow scout teaser.
Reusable existing data: `abs-challenge-log.ts`, `bullpen-usage.ts`, `pitcher-workload.ts`, `umpire-scouting.ts`,
`key_players_snapshot`, `pitcher_count_tendency` / `pitcher_pitch_sequencing` / `pitcher_zone_arsenal`,
`postgame-aggregate.ts` (pitch log/batted balls), `batter-spray.ts`.

## Separate issue found this session: Supabase "5 GB"
Table sizes sum to ~430 MB, so the 5 GB limit is almost certainly monthly EGRESS, not storage. Deleting
tables won't fix it. Investigate: which pages read big rows on every request (`key_players_snapshot` 30 MB,
`edge_predictions` 23 MB, `savant_fetch_cache` 20 MB, `game_previews` 9 MB, all JSONB), and cache/select fewer
columns. Dashboard → Settings → Usage shows which limit was hit.


---

# Update — all free sections (§6–13) live

Scorecard (§5) is now collapsed by default: a "Download completed scorecard" button per club and a "View scorecard" toggle.

| § | Section | Lib (`src/lib/postgame/`) | Component (`report/`) | Data source |
|---|---|---|---|---|
| 6 | Starters: plan vs night | `starters.ts` | `StartersSection` | feed pitch events vs `pitcher_zone_arsenal` (`all` split, read-only) |
| 7 | Spray & contact | `contact.ts` | `ContactSection` | feed `hitData`; season hard-hit/barrel % from Savant's 30-row team leaderboard (BOM stripped) |
| 8 | ABS & challenges | `abs.ts` | `AbsSection` | feed `reviewDetails` (MJ) + PA-ending challenges parsed from play descriptions |
| 9 | Bullpen used tonight | `bullpen.ts` | `BullpenSection` | feed + `pitcher_workload_daily` (prior 2 days) |
| 10 | Defense & run game | `defense.ts` | `DefenseSection` | feed `runners[]` credits/events |
| 11 | Umpire report | `umpires.ts` | `UmpiresSection` | feed officials + pitch locations |
| 12 | Key players scorecard | `keyplayers.ts` | `KeyPlayersSection` | `key_players_snapshot` (only small JSON fields pulled with `->>`) + feed |
| 13 | Next up | `next.ts` | `NextSection` | team schedule (probables, seriesStatus) + `pitcher_count_tendency` |

Also: `recap.ts` gained an exported `playerWpa()` (used by §3 and §12); `data.ts` types gained hitData / reviewDetails / runners / absChallenges / dateTime; shared bits in `report/ui.tsx`.

## Verified facts worth remembering
- **Barrel** is not in the MLB feed. Rebuilt as EV ≥ 98 and LA in [26 − (EV−98), 30 + (EV−98)] clamped 8–50°; matched Savant's `is_barrel` on 505 batted balls / 10 games with 0 disagreements. Savant's per-game feed (`/gf`) has the flag but is 2.6 MB (over the fetch-cache ceiling), so it is NOT used in the render path.
- **ABS challenges**: the feed tags most on the pitch (`reviewDetails`), but a challenge on the pitch that ENDS a PA (ball four / strike three) only appears in the play description ("X challenged (pitch result), call on the field was overturned|confirmed"). Union of both = MLB's official `gameData.absChallenges` totals in 14/14 finals. The pitch's call is the FINAL call, so overturned ⇒ original call was the opposite.
- `pitcher_workload_daily` stores only pitchers who threw, so a reliever missing from a day the club has rows for = 0 pitches; a day with no club rows = unknown ("—").
- Python here (3.14 framework) fails SSL cert checks; use Node for ad-hoc API probes.

## Decisions / caveats for George
- Verdict rules for §12 (Showed up / Stayed quiet / Missed) are mine and listed on the page; WPA alone under-rated good games in blowouts, so hits/total bases/times on base are included. Change if you'd rather use WPA only.
- §6 "usual" mix is the season arsenal on file (refreshed weekly), so it can lag; Hughes (COL, 9/13 test game) has none → empty state.
- §11 "missed" = ABS-overturned or clear geometric miss on unchallenged takes (same zone maths as the old `lib/postgame.ts`). Withheld under 40 tracked takes.
- Egress: page `revalidate` is still 300. Each regeneration of a final game reads roughly 40–60 KB from Supabase (arsenal ×2, key players, workload, count tendency, game_previews). Raising it for finals is step 1 of the egress plan — not done here (a "Not final yet" page would stick for the longer window too).
- Not yet run: the other 4 corners — test §8–10 on an extra-innings game, a game with no ABS challenges, a game without key-player snapshots (empty states are coded, only checked by reading).
- Nothing committed.

- §11 follow-up: zone plot made taller with a per-inning strip, a who-the-misses-helped bar and a missed-call table. Found the vertical zone edge ignored the ball radius (ABS overturned a pitch 0.4" below the bare edge); `umpires.ts` now widens top/bottom by 0.121 ft like the sides. Game 824225: 8 → 7 misses.


---

# Update — Pro tier rebuilt, hover cards, X graphics

## Removed / merged
- Pro **Chase & whiff by family**, **ABS deep** and **Bullpen pitch-type** deleted (`chasewhiff.ts`, `bullpentypes.ts`, their components). Reliever pitch mix / mph / whiffs / Zone% / Whiff% now sit under each reliever in the free §9 Bullpen section (`bullpen.ts` → `mix`).

## Pro sections now (14–22)
14 Pitchers: was anything concerning? · 15 What's next break · 16 Did the put-away spot hold? · 17 Zone clash result · 18 Full arsenal night chart · 19 Hitters: drop-off or turning a corner? · 20 Leverage timeline · 21 Team & game charts · 22 Into tomorrow (Scout teaser).
- **Pitcher check** (`pitchercheck.ts`): outing vs last 5 starts (MLB gameLog, box-line only) + season checks with fixed-rule flags → concern dial (0 = Quiet night, 1–2 Mixed, 3+ Concerning). Rules + minimum samples are in the file header and the section footnote.
- **Hitter check** (`hittercheck.ts`): EV-vs-LA scatter (barrel window shaded), hard-hit outs / soft hits, per-hitter season damage zones vs tonight. Tonight vs SEASON only.
- **Team charts** (`teamcharts.ts`): bullpen stress vs typical day (estimated from `pitcher_workload_daily`), offense process vs season (Savant team leaderboard), starter watch.

## Baselines — what exists and what does NOT (this decides the next build)
Exists and used: `pitcher_zone_arsenal` (season velo / usage / whiff% / zone% / chase% per pitch; refreshed weekly), `pitcher_stats` (first-pitch strike %, TTO wOBA), `batter_hot_zones`, MLB gameLog.
Missing or stale (checked against the live DB 2026-09-19): `pitcher_stats` hard_hit / barrel / chase / swstr are NULL for sampled pitchers; `pitch_arsenals.avg_velocity` NULL and last updated 2026-08-11; `batter_pitch_type_splits` empty for sampled hitters; `pitch_events` / `batted_ball_events` stop at 2026-08-16 and carry no coordinates or launch data for pitches.
**Not built because there is no data for it:** velocity / whiff / hard-hit vs LAST-5 starts, hard-hit + barrel allowed vs season, hitter last-15 trends, hitter corner dial, xwOBA-vs-BA scatter, extension/spin vs season, count-behavior and platoon notes. All of these need a per-game Statcast precompute (`pitcher_game_statcast`, `batter_game_statcast` + nightly script + backfill) — schema → data → cron → UI, awaiting George's go-ahead.

## Hover cards (spray + umpire)
`pitchlog.ts` now simulates runners on base for every pitch (`pitchContexts`). Validated: simulated left-on-base matches the official linescore for both clubs in 16 of 16 finals. `TipLayer.tsx` shows pitcher, batter, inning, outs, count, base diamond, pitch type + mph, result (+ missed-call flag) on hover / tap.

## X graphics
`GET /api/postgame-card/<gamePk>?card=final|swing|performers|umpire|abs|contact|starters|leverage[&download=1]` → 1600×900 PNG via next/og. Admin only (session role, or `next dev`). Fonts (OFL) in `src/lib/postgame/cards/fonts/`; `next.config.ts` traces them. Admin-only "↓ X graphic (PNG)" buttons on those sections. Cards reuse the section libraries. Leverage card returns 404 when a game had no high-leverage spot.
- Satori (next/og) quirks learned: no `undefined` style values (crashes), only flexbox, no text inside inline SVG (labels are overlaid divs).
- House-rule check: cards carry factor/fact language only, no Edge Score, no picks, no links (brand line only).
- **Flag for George:** the existing `/api/share-card/[gamePk]` route (not touched) prints `edge_score` and a predicted winner on a public image — that conflicts with "raw Edge Score is internal only".
