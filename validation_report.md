[pull ] Statcast 2026-05-01 -> 2026-05-31 (one-time; slow for full seasons)
[data ] 121,779 regular-season pitches, 419 games
[warn ] leaderboard 'catchprob' 2026 unavailable (AttributeError); using defaults
Gathering player lookup table. This may take a moment.
[out  ] CSVs written to x9lab_output/

# x9Lab Validation Report  (2026-05-01 to 2026-05-31)

PAs with runners on at Pitch 1: **13,775** | ghost-runner PAs: **130** | OF balls: **5,943** | IF balls: **6,941**

## Test 1 - Odd/Even Split-Half Reliability (Spearman-Brown)

| metric | players | r_odd_even | spearman_brown | n_avg_per_player | n_for_0_70 | note |
|---|---|---|---|---|---|---|
| BCAA (per PA, batter) | 342 | 0.15 | 0.26 | 37.27 | 247.00 |  |
| cnRBI (per PA, batter) | 342 | 0.05 | 0.09 | 37.27 | 845.00 |  |
| OF catch above expected (per ball) | 118 | 0.13 | 0.23 | 44.85 | 350.00 |  |
| IF outs above expected (per ball) | 156 | 0.15 | 0.27 | 41.87 | 270.00 |  |

## Test 2 - Out-of-Sample Calibration (20% holdout)

xBC_Neutral regressor (bases converted): holdout RMSE **1.010** vs constant **1.306**, R^2 **0.400** (n_test=1852)

| model | n_test | brier | brier_const_baseline | roc_auc |
|---|---|---|---|---|
| xBC_Neutral: P(runner advances >= 1 base) | 1852 | 0.149 | 0.247 | 0.865 |
| cnRBI: P(RBI > 0) | 1852 | 0.088 | 0.174 | 0.928 |
| Seam Out Probability (IF) | 1389 | 0.068 | 0.080 | 0.767 |

## Test 3 - Runner Speed Independence (|r| < 0.05 required)

| metric | n | pearson_r | p_value | passes |
|---|---|---|---|---|
| BCAA vs lead-runner sprint speed | 13569 | -0.002 | 0.860 | True |
| Clock 1 IF reach vs batter sprint speed | 6886 | 0.038 | 0.002 | True |

_Note: with small n, sampling noise alone can exceed |r| = 0.05; read together with n and p._

## Test 4 - Eye-Test Leaderboards (n shown on every row)

### BCAA (total bases converted above average)
**Top 10**
| player | game_year | BCAA | n_opp | is_qualified |
|---|---|---|---|---|
| Cody Bellinger | 2026 | 16.65 | 54 | True |
| Michael Busch | 2026 | 14.48 | 58 | True |
| Ketel Marte | 2026 | 14.30 | 49 | True |
| Andy Pages | 2026 | 14.13 | 57 | True |
| Bryan Reynolds | 2026 | 14.05 | 57 | True |
| Kyle Tucker | 2026 | 13.36 | 55 | True |
| Geraldo Perdomo | 2026 | 12.90 | 53 | True |
| Pete Crow-Armstrong | 2026 | 11.03 | 48 | True |
| Shohei Ohtani | 2026 | 9.77 | 43 | True |
| Munetaka Murakami | 2026 | 8.80 | 47 | True |

**Bottom 10**
| player | game_year | BCAA | n_opp | is_qualified |
|---|---|---|---|---|
| Dansby Swanson | 2026 | -15.30 | 51 | True |
| Marcelo Mayer | 2026 | -13.00 | 50 | True |
| Seiya Suzuki | 2026 | -12.61 | 60 | True |
| Austin Wells | 2026 | -12.08 | 33 | True |
| Taylor Ward | 2026 | -10.53 | 43 | True |
| Zack Gelof | 2026 | -10.27 | 46 | True |
| Pedro Pagés | 2026 | -9.79 | 27 | True |
| Christopher Morel | 2026 | -8.75 | 24 | True |
| Wenceel Pérez | 2026 | -8.45 | 51 | True |
| Colt Keith | 2026 | -8.14 | 30 | True |

### Robbed RBIs (CS/PO + slow runners)
**Top 10**
| player | game_year | Robbed_RBI_total | n_opp | is_qualified |
|---|---|---|---|---|
| TJ Rumfield | 2026 | 1.44 | 43 | True |
| Luke Raley | 2026 | 0.98 | 38 | True |
| J.C. Escarra | 2026 | 0.87 | 17 | True |
| Jac Caglianone | 2026 | 0.78 | 43 | True |
| Drew Romo | 2026 | 0.78 | 23 | True |
| Jake Burger | 2026 | 0.70 | 47 | True |
| Josh Lowe | 2026 | 0.70 | 19 | True |
| Cole Young | 2026 | 0.63 | 49 | True |
| Jorge Mateo | 2026 | 0.60 | 21 | True |
| Miguel Andujar | 2026 | 0.58 | 47 | True |

**Bottom 10**
| player | game_year | Robbed_RBI_total | n_opp | is_qualified |
|---|---|---|---|---|
| Bryan Reynolds | 2026 | -0.38 | 57 | True |
| Jonathan Aranda | 2026 | -0.24 | 55 | True |
| Luis Torrens | 2026 | -0.23 | 30 | True |
| Keibert Ruiz | 2026 | -0.20 | 32 | True |
| Ildemaro Vargas | 2026 | -0.20 | 52 | True |
| Josh Bell | 2026 | -0.19 | 49 | True |
| Travis Bazzana | 2026 | -0.18 | 47 | True |
| Gabriel Moreno | 2026 | -0.16 | 44 | True |
| Kyle Schwarber | 2026 | -0.16 | 34 | True |
| Michael Busch | 2026 | -0.16 | 58 | True |

### Outfield Turf Erased (sq ft, all buckets)
**Top 10**
| player | game_year | CR_50_ft | Grass_Covered_SqFt | Turf_Erased_SqFt | n | is_qualified |
|---|---|---|---|---|---|---|
| Jacob Young | 2026 | 127.76 | 51282.68 | 8424.13 | 81 | True |
| Pete Crow-Armstrong | 2026 | 123.41 | 47849.15 | 7714.63 | 82 | True |
| Evan Carter | 2026 | 114.58 | 41241.41 | 5939.43 | 70 | True |
| Jackson Merrill | 2026 | 121.83 | 46625.46 | 5906.25 | 61 | True |
| Tristan Peters | 2026 | 126.30 | 50115.30 | 5533.87 | 60 | True |
| Ryan Waldschmidt | 2026 | 118.93 | 44433.14 | 5372.73 | 69 | True |
| Ceddanne Rafaela | 2026 | 108.69 | 37112.04 | 5280.51 | 71 | True |
| Andy Pages | 2026 | 114.44 | 41146.55 | 4758.23 | 73 | True |
| Justin Crawford | 2026 | 112.54 | 39787.72 | 4237.11 | 53 | True |
| Garrett Mitchell | 2026 | 112.66 | 39872.38 | 4216.84 | 64 | True |

**Bottom 10**
| player | game_year | CR_50_ft | Grass_Covered_SqFt | Turf_Erased_SqFt | n | is_qualified |
|---|---|---|---|---|---|---|
| Trevor Larnach | 2026 | 111.89 | 39330.20 | -7837.95 | 41 | True |
| Ronald Acuña Jr. | 2026 | 95.59 | 28704.63 | -5928.15 | 36 | True |
| Chase DeLauter | 2026 | 78.77 | 19492.99 | -5426.35 | 35 | True |
| Juan Soto | 2026 | 97.21 | 29687.07 | -4992.47 | 36 | True |
| Jarren Duran | 2026 | 83.16 | 21723.52 | -4964.20 | 60 | True |
| Zach Cole | 2026 | 120.70 | 45771.10 | -4060.90 | 33 | True |
| James Wood | 2026 | 94.09 | 27812.51 | -4003.30 | 59 | True |
| Troy Johnston | 2026 | 78.87 | 19543.42 | -3924.39 | 53 | True |
| Daylen Lile | 2026 | 97.87 | 30091.76 | -3728.36 | 55 | True |
| Carson Benge | 2026 | 85.54 | 22986.04 | -3618.03 | 78 | True |

### Team seam openness - Hole_5_5 (ft open; higher = more vulnerable)
**Top 10**
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| MIN | 2026 | 1.92 | 0.10 | 4.85 | 30 | True |
| PIT | 2026 | 1.72 | 0.08 | 4.35 | 33 | True |
| TB | 2026 | 1.58 | 0.11 | 4.01 | 40 | True |
| SF | 2026 | 1.57 | 0.11 | 3.98 | 49 | True |
| ATL | 2026 | 1.47 | 0.10 | 3.71 | 34 | True |
| MIA | 2026 | 1.42 | 0.08 | 3.59 | 38 | True |
| TOR | 2026 | 1.38 | 0.09 | 3.50 | 33 | True |
| NYM | 2026 | 1.37 | 0.08 | 3.46 | 31 | True |
| PHI | 2026 | 1.34 | 0.10 | 3.40 | 44 | True |
| LAA | 2026 | 1.34 | 0.11 | 3.40 | 35 | True |

**Bottom 10**
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| STL | 2026 | 0.75 | 0.13 | 1.89 | 33 | True |
| CHC | 2026 | 0.78 | 0.10 | 1.97 | 42 | True |
| KC | 2026 | 0.79 | 0.07 | 1.99 | 30 | True |
| AZ | 2026 | 0.93 | 0.07 | 2.36 | 40 | True |
| NYY | 2026 | 1.05 | 0.09 | 2.67 | 44 | True |
| TEX | 2026 | 1.12 | 0.13 | 2.82 | 32 | True |
| DET | 2026 | 1.13 | 0.10 | 2.87 | 34 | True |
| CLE | 2026 | 1.14 | 0.08 | 2.88 | 34 | True |
| BOS | 2026 | 1.21 | 0.11 | 3.06 | 35 | True |
| BAL | 2026 | 1.25 | 0.10 | 3.16 | 33 | True |

### Team seam openness - Hole_3_5__Runner_On_1B_Holding (ft open; higher = more vulnerable)
**Top 10** _(only 3 qualified rows in this window; showing all rows, check is_qualified)_
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| NYM | 2026 | 2.82 | 0.05 | 7.15 | 9 | False |
| STL | 2026 | 2.40 | 0.06 | 6.08 | 7 | False |
| COL | 2026 | 2.28 | 0.04 | 5.77 | 13 | False |
| SEA | 2026 | 2.21 | 0.05 | 5.60 | 8 | False |
| NYY | 2026 | 2.18 | 0.06 | 5.52 | 16 | True |
| MIA | 2026 | 2.14 | 0.06 | 5.42 | 12 | False |
| CLE | 2026 | 2.13 | 0.04 | 5.38 | 1 | False |
| SF | 2026 | 2.11 | 0.05 | 5.34 | 9 | False |
| WSH | 2026 | 1.97 | 0.13 | 4.98 | 7 | False |
| BOS | 2026 | 1.95 | 0.06 | 4.94 | 5 | False |

**Bottom 10**
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| AZ | 2026 | 0.66 | 0.08 | 1.67 | 12 | False |
| DET | 2026 | 1.02 | 0.06 | 2.59 | 5 | False |
| KC | 2026 | 1.05 | 0.06 | 2.66 | 9 | False |
| PIT | 2026 | 1.08 | 0.09 | 2.74 | 6 | False |
| ATL | 2026 | 1.17 | 0.05 | 2.95 | 13 | False |
| CIN | 2026 | 1.25 | 0.05 | 3.16 | 14 | False |
| LAD | 2026 | 1.32 | 0.05 | 3.33 | 8 | False |
| MIN | 2026 | 1.37 | 0.06 | 3.46 | 11 | False |
| PHI | 2026 | 1.41 | 0.04 | 3.57 | 10 | False |
| TEX | 2026 | 1.48 | 0.05 | 3.75 | 11 | False |

### Team seam openness - Hole_3_5__Bases_Empty (ft open; higher = more vulnerable)
**Top 10** _(only 14 qualified rows in this window; showing all rows, check is_qualified)_
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| NYM | 2026 | 2.66 | 0.06 | 6.73 | 22 | True |
| ATH | 2026 | 2.48 | 0.06 | 6.29 | 17 | True |
| MIA | 2026 | 2.22 | 0.05 | 5.62 | 17 | True |
| SD | 2026 | 2.18 | 0.06 | 5.51 | 21 | True |
| WSH | 2026 | 2.04 | 0.04 | 5.16 | 14 | False |
| LAA | 2026 | 1.96 | 0.05 | 4.97 | 23 | True |
| MIN | 2026 | 1.95 | 0.06 | 4.92 | 14 | False |
| NYY | 2026 | 1.93 | 0.04 | 4.89 | 9 | False |
| TOR | 2026 | 1.86 | 0.05 | 4.70 | 15 | True |
| AZ | 2026 | 1.72 | 0.05 | 4.35 | 14 | False |

**Bottom 10**
| defense_team | game_year | open_deg | xBA_allowed_model | open_ft | n | is_qualified |
|---|---|---|---|---|---|---|
| ATL | 2026 | 0.70 | 0.05 | 1.77 | 19 | True |
| KC | 2026 | 1.03 | 0.06 | 2.61 | 19 | True |
| TB | 2026 | 1.16 | 0.11 | 2.93 | 14 | False |
| CHC | 2026 | 1.20 | 0.09 | 3.04 | 28 | True |
| CLE | 2026 | 1.31 | 0.05 | 3.33 | 8 | False |
| CWS | 2026 | 1.33 | 0.06 | 3.37 | 9 | False |
| BAL | 2026 | 1.35 | 0.05 | 3.41 | 20 | True |
| HOU | 2026 | 1.47 | 0.06 | 3.71 | 19 | True |
| BOS | 2026 | 1.51 | 0.06 | 3.82 | 8 | False |
| CIN | 2026 | 1.52 | 0.07 | 3.84 | 12 | False |

_End of report._
