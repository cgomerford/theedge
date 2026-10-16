# Stuff Grade stuff_v1.0: validation report

Grade = 50 + 10 x (mean xRV - pitcher xRV) / sd xRV, over all scored pitches of the season. Higher = better for the pitcher.
Model: scikit-learn HistGradientBoostingRegressor x3 (fastball / breaking / offspeed). Train 2023-24, round chosen on 2025, 2026 held out.

## 1. Stickiness: year-to-year correlation (pitchers with >= 500 pitches in both seasons)

| Pair | n | Stuff Grade | ERA | xERA | K-BB% | Clean? |
|---|---|---|---|---|---|---|
| 2024->2025 | 311 | 0.785 | 0.207 | 0.439 | 0.593 | no (2024 trained, 2025 tuned) |
| 2025->2026 | 324 | 0.822 | 0.165 | 0.373 | 0.530 | yes |

## 2. Predictive power: season N measure vs season N+1 outcome (correlation; sign set so higher = better for the pitcher)

| Pair | n | Grade -> K-BB% | ERA -> K-BB% | xERA -> K-BB% | Grade -> xERA | ERA -> xERA |
|---|---|---|---|---|---|---|
| 2024->2025 | 311 | +0.550 | +0.239 | +0.451 | +0.479 | +0.270 |
| 2025->2026 | 324 | +0.535 | +0.188 | +0.348 | +0.497 | +0.187 |

## 4. Face validity, 2026

### Top 20 pitch types (>= 300 pitches)

| # | Pitcher | Pitch | Pitches | Grade | xRV/100 |
|---|---|---|---|---|---|
| 1 | Misiorowski, Jacob | FF | 1677 | 61.7 | +3.04 |
| 2 | Sasaki, Roki | FS | 613 | 61.6 | +3.01 |
| 3 | Megill, Trevor | KC | 309 | 60.9 | +2.85 |
| 4 | Williams, Devin | CH | 343 | 58.8 | +2.33 |
| 5 | Martinez, Nick | CH | 649 | 58.4 | +2.23 |
| 6 | Ashby, Aaron | CU | 353 | 58.3 | +2.21 |
| 7 | Meyer, Max | SL | 470 | 58.1 | +2.18 |
| 8 | Cruz, Fernando | FS | 484 | 58.1 | +2.16 |
| 9 | Smith, Cade | FS | 309 | 58.1 | +2.16 |
| 10 | Roupp, Landen | CU | 689 | 57.6 | +2.03 |
| 11 | Ashcraft, Braxton | SL | 536 | 57.2 | +1.94 |
| 12 | Morejon, Adrian | SI | 626 | 57.1 | +1.91 |
| 13 | deGrom, Jacob | SL | 937 | 57.0 | +1.90 |
| 14 | Scott, Tanner | SL | 490 | 56.8 | +1.86 |
| 15 | Zeferjahn, Ryan | ST | 502 | 56.8 | +1.85 |
| 16 | Painter, Andrew | ST | 352 | 56.7 | +1.84 |
| 17 | Fluharty, Mason | ST | 411 | 56.7 | +1.83 |
| 18 | Baker, Bryan | CH | 423 | 56.7 | +1.83 |
| 19 | Lee, Dylan | SL | 549 | 56.6 | +1.79 |
| 20 | Taylor, Grant | CU | 361 | 56.5 | +1.78 |

### Bottom 10 pitch types (>= 300 pitches)

| Pitcher | Pitch | Pitches | Grade |
|---|---|---|---|
| Littell, Zack | FF | 503 | 44.3 |
| Wacha, Michael | SI | 413 | 44.2 |
| McGreevy, Michael | FF | 683 | 44.2 |
| Springs, Jeffrey | FF | 1060 | 44.1 |
| Bernardino, Brennan | CU | 344 | 44.1 |
| Lauer, Eric | FF | 763 | 43.9 |
| Elder, Bryce | FF | 504 | 43.6 |
| Rocker, Kumar | FF | 368 | 42.8 |
| Cantillo, Joey | FF | 900 | 42.4 |
| Johnson, Ryan | FS | 355 | 41.8 |

### Top 20 pitchers (>= 1,000 pitches)

| # | Pitcher | Pitches | Grade | ERA | xERA |
|---|---|---|---|---|---|
| 1 | Misiorowski, Jacob | 2647 | 58.6 | 1.8 | 2.13 |
| 2 | Morejon, Adrian | 1318 | 57.0 | 2.83 | 2.34 |
| 3 | Smith, Cade | 1226 | 56.3 | 1.95 | 2.83 |
| 4 | Rogers, Tyler | 1016 | 55.6 | 1.77 | 2.88 |
| 5 | Sasaki, Roki | 2100 | 54.8 | 4.49 | 4.3 |
| 6 | Montgomery, Mason | 1169 | 54.4 | 2.88 | 2.53 |
| 7 | Vesia, Alex | 1011 | 54.3 | 2.64 | 2.68 |
| 8 | deGrom, Jacob | 2735 | 54.1 | 4.21 | 3.47 |
| 9 | Petersen, Michael | 1129 | 54.1 | 3.02 | 3.45 |
| 10 | Miller, Mason | 1149 | 54.0 | 1.67 | 1.7 |
| 11 | Varland, Louis | 1235 | 54.0 | 1.27 | 2.37 |
| 12 | Sánchez, Cristopher | 3158 | 53.8 | 2.91 | 3.39 |
| 13 | Ashby, Aaron | 1582 | 53.7 | 3.12 | 2.99 |
| 14 | Burns, Chase | 2569 | 53.6 | 2.86 | 3.25 |
| 15 | Fluharty, Mason | 1034 | 53.6 | 3.3 | 2.83 |
| 16 | Lee, Dylan | 1054 | 53.4 | 3.09 | 2.64 |
| 17 | Taylor, Grant | 1333 | 53.3 | 2.25 | 2.97 |
| 18 | Skubal, Tarik | 2356 | 53.3 | 2.72 | 2.94 |
| 19 | Hudson, Bryan | 1053 | 53.3 | 3.74 | 3.2 |
| 20 | Tolle, Payton | 2275 | 53.1 | 3.03 | 2.7 |

### Bottom 10 pitchers (>= 1,000 pitches)

| Pitcher | Pitches | Grade | ERA | xERA |
|---|---|---|---|---|
| Elder, Bryce | 2245 | 47.0 | 4.11 | 4.15 |
| Yarbrough, Ryan | 1059 | 46.8 | 3.69 | 3.39 |
| Ober, Bailey | 2099 | 46.7 | 4.47 | 4.66 |
| Corbin, Patrick | 1397 | 46.7 | 5.51 | 5.51 |
| Imai, Tatsuya | 1451 | 46.7 | 4.93 | 4.6 |
| Bernardino, Brennan | 1001 | 46.6 | 2.81 | 3.73 |
| Littell, Zack | 1975 | 46.3 | 5.21 | 6.64 |
| Dobnak, Randy | 1264 | 45.8 | 3.51 | 4.86 |
| Pérez, Martín | 2244 | 45.7 | 3.04 | 4.51 |
| Lauer, Eric | 1814 | 45.7 | 5.23 | 5.05 |

Pitcher grade spread, 2026, >= 1,000 pitches: min 45.7, 5th pct 47.3, median 50.0, 95th pct 53.6, max 58.6, SD 2.0.

### Mean grade by pitch type (>= 100 pitches), 2026

| Pitch | n | Mean | SD |
|---|---|---|---|
| CH | 246 | 49.2 | 3.0 |
| CU | 155 | 50.0 | 2.7 |
| FC | 191 | 48.9 | 2.1 |
| FF | 494 | 48.8 | 3.0 |
| FO | 2 | 56.9 | 5.2 |
| FS | 59 | 50.7 | 4.2 |
| KC | 30 | 51.4 | 3.1 |
| SI | 324 | 48.8 | 2.3 |
| SL | 291 | 51.5 | 2.5 |
| ST | 186 | 53.0 | 2.4 |
| SV | 9 | 50.7 | 3.3 |

## 5. Calibration, 2026 (runs per pitch, batter view)

| Group | Pitches | Mean predicted | Mean luck-removed target | Mean raw run value |
|---|---|---|---|---|
| fastball | 394,244 | +0.00013 | +0.00162 | -0.00062 |
| breaking | 212,978 | -0.00617 | -0.00361 | +0.00086 |
| offspeed | 103,173 | -0.00128 | -0.00237 | +0.00019 |

Not run: test 3 (early-season signal).
