# Pitch Shape Lab: turning a shape change into ERA, FIP and runs

Internal research, 2026-10-31. Question: when someone dials a pitch ("+2 in of ride"), can we say what it is worth in ERA or FIP, and which numbers are safe to talk about?

**Short answer:** yes, as arithmetic on what league pitches with that shape have produced, shown as runs and FIP, not as a promise. A one-pitch change is usually worth **0.1 to 0.4 runs per nine**, not 0.8. ERA is the wrong headline number (see below).

## 1. Numbers we can talk about, and where each one comes from

| Number | What it says | Source we already have | Notes |
|---|---|---|---|
| Whiffs per swing | how often hitters miss | `pitch_shape_bins`, `pitch_shape_pitcher` | already on the page |
| Called + swinging strikes (CSW%) | strikes per pitch | bins | already on the page |
| Ground balls, damage on contact (xwOBAcon) | what happens when they connect | bins | already on the page |
| Strikeouts (K%) | the outcome whiffs turn into | MLB Stats API (free) | **new: K% moves about 0.93 points per point of whiff/swing** (below) |
| FIP | K, BB, HR only | MLB Stats API: IP, K, BB, HBP, HR | FanGraphs formula, constant 3.10 |
| Runs per nine from contact | contact quality as runs | xwOBAcon change x balls in play / wOBA scale (1.25) | FanGraphs wOBA scale, 2015 table |
| Run value per 100 pitches | one number for the whole pitch | needs Statcast `delta_run_exp` in the bins (schema change) | the standard pitch-value measure; not built |

Left out on purpose: **ERA** as the headline. It moves with defense, sequencing and luck that a pitch shape cannot touch, and FanGraphs itself says "if you have to bet on a pitcher's ERA or their FIP, FIP is the better bet" (it still ignores defense and luck). We can show ERA beside it as context, never as the claimed effect.

## 2. The conversions (2026, measured on our own data)

League 2026 (MLB Stats API, 43,080 IP): ERA 4.18, K per batter faced .221, BB .089, HR .0303, **4.27 batters per inning**, **FIP constant 3.10** (= lgERA minus the FIP terms, FanGraphs definition).

- **Whiffs to strikeouts.** Across 429 pitchers (150+ BF), K% = 0.932 x (whiffs per swing) + 0.011, r = 0.81. One point of whiff/swing is worth about **0.93 points of K%**. League: **0.53 strikeouts per swinging strike** (35,933 K over 67,561 whiffs). FanGraphs reports r = 0.78 between K% and SwStr% for MLB pitchers over five seasons, so this agrees.
- **Strikeouts to FIP.** FIP = (13 HR + 3 (BB+HBP) - 2 K) / IP + 3.10, so each extra strikeout takes 2 / IP off FIP. Over 72 innings, 3.6 extra strikeouts is -0.10.
- **Contact quality to runs.** Runs = change in wOBA on contact x balls in play / wOBA scale (FanGraphs 2015 scale 1.251). Per nine = runs x 9 / IP.
- **Not a per-pitch effect on balls and called strikes.** We do not have location or the count in the bins, so only whiffs and contact are converted.

## 3. Worked example: Casey Legumina, four-seam, +2 in of ride (live 2026 data)

League pitches with that shape get +2.5 points of whiffs per swing and -.021 of xwOBAcon (.373 to .352), from the bins.
- His four-seam: 270 swings, 86 balls in play, 71.7 IP.
- Extra whiffs: 0.025 x 270 = 6.8. Extra strikeouts: 6.8 x 0.53 = **3.6**. FIP effect: **-0.10**.
- Contact: -.021 x 86 / 1.25 = -1.4 runs = **-0.18 per nine** (before defense and luck).
- Together: roughly **-0.28 runs per nine** on his current workload. That is a good result for moving one pitch two inches, and a long way short of 0.8.

A bigger dial, or a change to the pitch he throws most, scales it up. -0.8 would need something close to a new pitch.

## 4. What we must say with it (house rules)

The site has no prediction language. Two safe framings, in order of preference:
1. **"Worth about" / arithmetic:** "If his four-seam got what league pitches with that shape get, the arithmetic is worth about -0.3 runs per nine over his current workload."
2. **"Has produced":** "League pitches with that shape have produced +2.5 points of whiffs per swing (about 3.6 strikeouts at his usage)." No ERA or FIP at all.

Never: "will", "would lower his ERA", "projected". Always show the sample (swings and balls in play behind each side), the thin-sample warning, and one line that the shape leaves out his location, deception, sequencing and defense. The existing words list already bans "projected" and "projection"; the copy check would also need the new phrases approved.

## 5. What it would take to build

No schema change for the first version:
- change in whiffs and xwOBAcon: bins (already loaded in the pitcher tab)
- his swings and balls in play for that pitch: `pitch_shape_pitcher` (already loaded)
- his IP: MLB Stats API, one cached call per pitcher (free)
- league constants (FIP constant, 0.53 K per whiff, 0.93 K% per whiff, wOBA scale 1.25): stored in code with their date, refreshed once a season from the same MLB calls

Later (needs a schema change, SQL for George): add Statcast run value to `pitch_shape_bins` for a single run-value-per-100-pitches figure, and zone/chase counts (already queued in `20261031100000_pitch_shape_pitcher_diagnostics.sql`) to explain location.

## 6. Decisions for George (approved 2026-10-31: both framings, FIP and runs per nine with ERA only as context, strikeout and contact parts combined and labelled arithmetic)
1. Wording: framing 1 ("worth about"), framing 2 ("has produced"), or both? (Recommended: both, framing 2 as the headline.)
2. Show ERA at all, or FIP and runs per nine only? (Recommended: FIP and runs per nine; ERA only as context.)
3. Allow the strikeout part and the contact part to be added into one "runs per nine" figure? (Recommended yes, labelled arithmetic.)

## Sources
- FIP formula and 3.10 constant: https://library.fangraphs.com/pitching/fip
- Linear weights, wOBA scale (1.251, 2015 table): https://library.fangraphs.com/principles/linear-weights
- K% and SwStr% correlation (r = 0.78): https://blogs.fangraphs.com/adventures-in-swinging-strike-rate-vs-k-rate
- Run value per pitch and per 100 pitches: https://library.fangraphs.com/pitching/linear-weights
- 2026 league totals and pitcher lines: statsapi.mlb.com season pitching stats (fetched 2026-10-31)
