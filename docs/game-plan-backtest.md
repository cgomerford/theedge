# Game Plan Card backtest

Internal. Written 2026-10-29 by `scripts/backtest_game_plan.py`. **Not for publication:** how accurate the cards are needs your decision on the framing first (CLAUDE.md section 7).

**Window:** games from 2026-09-01 to 2026-09-27 (the last weeks of the regular season). **674 starter-games** scored (46 skipped for fewer than 300 earlier pitches). For each, the nine hitters who actually faced the starter first.

**Method:** every line is rebuilt from pitches **before the game date only**, using the card's own thresholds, then scored on that one game. Hitter groups ("hitters like him") are not used, because they were fitted on the whole season and would leak the answer; a line is scored only when the hitter's or pitcher's own history reaches the threshold. Each is set against a plain baseline, because a hit rate on its own says little.

## 1. First pitch: does a hitter's own 0-0 swing rate tell you anything?

12,656 first pitches. Score = Brier score (lower is better; it rewards getting the probability right, not just the call). Card (his own rate, n >= 50 at 0-0): **0.2153**. Baseline (league 0-0 swing rate for that hand): **0.2214**. Skill over the baseline: **+2.7%**. Correlation between the card's rate and swinging: **0.167**.

| Card said (average) | Actually swung | First pitches |
|---|---|---|
| 21% | 24% | 3,146 |
| 29% | 29% | 3,172 |
| 35% | 36% | 3,172 |
| 43% | 43% | 3,166 |

## 2. Opener: did he open with the two pitches the card named?

12,189 plate appearances where the card had an opener (the pitcher's own start against that side, n >= 30).

| | Both pitches matched | 95% range | First pitch matched |
|---|---|---|---|
| **Card** (his most used start against that side) | **16.9%** | 16.3–17.6% | 39.5% |
| Baseline: his most used start overall | 16.3% | 15.6–16.9% | 38.9% |
| Baseline: the league's most used start for that hand and side | 13.5% | 12.9–14.1% | 33.4% |

## 3. Two strikes: was the card's two-strike pitch the one he threw?

16,270 two-strike pitches across 1287 starter-sides where the card had a pitch (his most used two-strike pitch against that side, n >= 50).

| | Share of his two-strike pitches that were that type | 95% range |
|---|---|---|
| **Card's pitch** | **38.6%** | 37.8–39.3% |
| Baseline: how often the league throws that pitch with two strikes | 21.6% | |
| Baseline: his most used two-strike pitch overall | 37.5% | 36.8–38.3% |

The card's pitch was his most thrown two-strike pitch in the game in **693 of 1287** starter-sides (53.8%); the overall-habit baseline in 657 (51.0%).

## 4. Damage zones: do the hot zones hold up?

Balls in play in the game, grouped by the card's level for that zone (0 little, 1 some, 2 most damage). Shown as xwOBA and as the gap from the league average for that same zone, so a middle-middle ball is not compared with a ball on the edge.

| Card's level | Balls in play | Mean xwOBA | Gap from league average for the zone |
|---|---|---|---|
| Little damage | 1,721 | 0.348 | -0.034 |
| Some damage | 2,172 | 0.399 | +0.016 |
| Most damage | 2,045 | 0.432 | +0.048 |

Most damage minus little damage: **+0.082 xwOBA** (95% range +0.056 to +0.106, by resampling).

## How to read this

- These are descriptions that held or did not, not forecasts. A card line is a count of what has happened; this checks whether the same patterns showed up the next night.
- A line that only matches its baseline is telling you what the baseline already says. The useful number is the gap over the baseline, with its range.
- One game per hitter is a small sample, so single-game results are noisy; the figures above pool every game in the window.
- Not scored: the second-look line (its counts were built from the whole season), the hitter-group fallbacks, and the league endings on the opener (they describe at-bats, not the opener itself).
