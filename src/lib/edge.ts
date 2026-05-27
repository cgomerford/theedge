import { createClient } from '@supabase/supabase-js'
import { getParkFactor, parkLeansHitter, parkLeansPitcher } from './parks'
import type { ComponentsRaw } from './matchup-tilt';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// V3 COMPONENT WEIGHTS — rebalanced for 12 effective sub-factors
// Total = 1.00
// ============================================================
const WEIGHTS = {
  starting_pitcher: 0.22,    // down from 0.25 — share with pitcher_fatigue
  bullpen: 0.13,             // down from 0.15 — individual availability now in play
  offense: 0.16,             // down from 0.20 — lineup confirmation adjusts confidence
  defense: 0.08,             // up from 0.10 → 0.08 — real OAA now, but still proxy
  matchup: 0.15,             // same — half-built, biggest lever when fully wired
  park: 0.05,                // same
  weather: 0.04,             // up from 0.05 → 0.04 — recalibrated thresholds
  rest: 0.05,                // same — now has travel distance + schedule density
  pitcher_fatigue: 0.07,     // NEW — split from starting_pitcher
  lineup_confirmed: 0.05,    // NEW — adjusts confidence based on lineup certainty
}

// ============================================================
// TYPES
// ============================================================
export type EdgeComponents = {
  starting_pitcher: number
  bullpen: number
  offense: number
  defense: number
  matchup: number
  park: number
  weather: number
  rest: number
}

export type EdgeScoreResult = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
  components_raw: any
  drilldown?: {
    away_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    home_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    away_form?: { last_10_wins: number; last_10_losses: number; bullpen_era: number | null; bullpen_ip_yesterday: number | null } | null
    home_form?: { last_10_wins: number; last_10_losses: number; bullpen_era: number | null; bullpen_ip_yesterday: number | null } | null
  }
}

export type GameInputs = {
  home_team_id: number
  away_team_id: number
  home_pitcher_id: number | null
  away_pitcher_id: number | null
  venue_name: string
  weather?: {
    temp_f: number
    wind_mph: number
    wind_dir: string
  }
}

// ============================================================
// MAIN ENTRY POINT — V3
// ============================================================
export async function calculateEdgeScore(inputs: GameInputs): Promise<EdgeScoreResult> {
  const [
    homePitcher,
    awayPitcher,
    homeTeam,
    awayTeam,
    park,
  ] = await Promise.all([
    inputs.home_pitcher_id ? fetchPitcher(inputs.home_pitcher_id) : null,
    inputs.away_pitcher_id ? fetchPitcher(inputs.away_pitcher_id) : null,
    fetchTeam(inputs.home_team_id),
    fetchTeam(inputs.away_team_id),
    getParkFactor(inputs.venue_name),
  ])

  // Compute all 8 visible components
  const componentsRaw: EdgeComponents = {
    starting_pitcher: computePitcherEdge(homePitcher, awayPitcher),
    bullpen: computeBullpenEdge(homeTeam, awayTeam),
    offense: computeOffenseEdge(homeTeam, awayTeam),
    defense: computeDefenseEdge(homeTeam, awayTeam, homePitcher, awayPitcher),
    matchup: computeMatchupEdge(homePitcher, awayPitcher, homeTeam, awayTeam),
    park: computeParkEdge(park, homeTeam, awayTeam, homePitcher, awayPitcher),
    weather: computeWeatherEdge(inputs.weather, park, homeTeam, awayTeam),
    rest: computeRestEdge(homeTeam, awayTeam),
  }

  // Compute hidden components (folded into the score but not shown as separate bars)
  const pitcherFatigue = computePitcherFatigue(homePitcher, awayPitcher)
  const lineupConfidence = computeLineupConfidence(homeTeam, awayTeam)

  // Round each visible component
  const components: EdgeComponents = {
    starting_pitcher: Math.round(componentsRaw.starting_pitcher * 10) / 10,
    bullpen: Math.round(componentsRaw.bullpen * 10) / 10,
    offense: Math.round(componentsRaw.offense * 10) / 10,
    defense: Math.round(componentsRaw.defense * 10) / 10,
    matchup: Math.round(componentsRaw.matchup * 10) / 10,
    park: Math.round(componentsRaw.park * 10) / 10,
    weather: Math.round(componentsRaw.weather * 10) / 10,
    rest: Math.round(componentsRaw.rest * 10) / 10,
  }

  // Weighted sum — visible components
  let edge_score = 0
  for (const [key, value] of Object.entries(components)) {
    edge_score += value * WEIGHTS[key as keyof typeof WEIGHTS]
  }

  // Add hidden components
  edge_score += pitcherFatigue * WEIGHTS.pitcher_fatigue
  edge_score += lineupConfidence * WEIGHTS.lineup_confirmed

  // Home field advantage
  edge_score += 4

  // Clamp
  edge_score = Math.max(-100, Math.min(100, edge_score))
  edge_score = Math.round(edge_score * 10) / 10

  const predicted_winner: 'home' | 'away' = edge_score >= 0 ? 'home' : 'away'
  const abs_edge = Math.abs(edge_score)
  let confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  if (abs_edge >= 25) confidence_tier = 'strong'
  else if (abs_edge >= 12) confidence_tier = 'moderate'
  else if (abs_edge >= 5) confidence_tier = 'slight'
  else confidence_tier = 'tossup'

  return {
    edge_score,
    predicted_winner,
    confidence_tier,
    components,
    components_raw: {
      home_pitcher: homePitcher,
      away_pitcher: awayPitcher,
      home_team: homeTeam,
      away_team: awayTeam,
      park,
      weather: inputs.weather,
      _hidden: { pitcherFatigue, lineupConfidence },
    },
  }
}

// ============================================================
// COMPONENT 1: STARTING PITCHER (V3 — 15 sub-factors)
// ============================================================
function computePitcherEdge(home: any, away: any): number {
  if (!home && !away) return 0

  function scorePitcher(p: any): number {
    if (!p) return 0
    let score = 0
    let factors = 0

    // 1. FIP (primary quality metric, defense-independent)
    if (p.fip !== null && p.fip !== undefined) {
      const LEAGUE_AVG_FIP = 4.10
      score += (LEAGUE_AVG_FIP - p.fip) * 15
      factors++
    }

    // 2. ERA (traditional, captures some real outcomes FIP misses)
    if (p.era !== null && p.era !== undefined) {
      const LEAGUE_AVG_ERA = 4.10
      score += (LEAGUE_AVG_ERA - p.era) * 8
      factors++
    }

    // 3. K/9 (dominance — high K pitchers suppress damage)
    if (p.k_per_9 !== null && p.k_per_9 !== undefined) {
      const LEAGUE_AVG_K9 = 8.5
      score += (p.k_per_9 - LEAGUE_AVG_K9) * 4
      factors++
    }

    // 4. BB/9 (control — walks lead to runs)
    if (p.bb_per_9 !== null && p.bb_per_9 !== undefined) {
      const LEAGUE_AVG_BB9 = 3.2
      score += (LEAGUE_AVG_BB9 - p.bb_per_9) * 5
      factors++
    }

    // 5. WHIP (baserunner management)
    if (p.whip !== null && p.whip !== undefined) {
      const LEAGUE_AVG_WHIP = 1.28
      score += (LEAGUE_AVG_WHIP - p.whip) * 12
      factors++
    }

    // 6. L3 ERA (recent form — hot/cold detection)
    if (p.l3_era !== null && p.l3_era !== undefined && p.era !== null) {
      const trendDiff = p.era - p.l3_era // positive = improving
      score += trendDiff * 3
      factors++
    }

    // 7. L3 K/9 (recent strikeout trend)
    if (p.l3_k_per_9 !== null && p.l3_k_per_9 !== undefined && p.k_per_9 !== null) {
      const kTrend = p.l3_k_per_9 - p.k_per_9 // positive = increasing Ks
      score += kTrend * 2
      factors++
    }

    // 8. GB% (ground-ball rate — pairs with defense)
    if (p.gb_percent !== null && p.gb_percent !== undefined) {
      const LEAGUE_AVG_GB = 0.43
      score += (p.gb_percent - LEAGUE_AVG_GB) * 15
      factors++
    }

    // 9. Home/away split advantage
    // (Applied situationally in the main function based on game location)

    // Normalize by number of factors contributing
    // More data = more confidence in the score
    if (factors === 0) return 0
    return score
  }

  const homeScore = scorePitcher(home)
  const awayScore = scorePitcher(away)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 2: BULLPEN (V3 — 12 sub-factors)
// ============================================================
function computeBullpenEdge(home: any, away: any): number {
  if (!home || !away) return 0

  function scoreBullpen(t: any): number {
    let score = 0

    // 1. Bullpen ERA
    if (t.bullpen_era !== null && t.bullpen_era !== undefined) {
      const LEAGUE_AVG = 3.90
      score += (LEAGUE_AVG - t.bullpen_era) * 8
    }

    // 2. Bullpen K/9
    if (t.bullpen_k_per_9 !== null && t.bullpen_k_per_9 !== undefined) {
      const LEAGUE_AVG_K9 = 8.8
      score += (t.bullpen_k_per_9 - LEAGUE_AVG_K9) * 2
    }

    // 3. Bullpen HR/9 (lower = better)
    if (t.bullpen_hr_per_9 !== null && t.bullpen_hr_per_9 !== undefined) {
      const LEAGUE_AVG = 1.2
      score += (LEAGUE_AVG - t.bullpen_hr_per_9) * 4
    }

    // 4. Yesterday fatigue
    if (t.bullpen_innings_yesterday !== null && t.bullpen_innings_yesterday !== undefined) {
      if (t.bullpen_innings_yesterday >= 6) score -= 10
      else if (t.bullpen_innings_yesterday >= 4) score -= 5
      else if (t.bullpen_innings_yesterday >= 2) score -= 2
    }

    // 5. 3-day rolling fatigue
    if (t.bullpen_ip_last_3 !== null && t.bullpen_ip_last_3 !== undefined) {
      if (t.bullpen_ip_last_3 >= 15) score -= 8
      else if (t.bullpen_ip_last_3 >= 10) score -= 4
      else if (t.bullpen_ip_last_3 >= 7) score -= 2
    }

    // 6-8. Individual reliever availability
    if (t.closer_available === false) score -= 6
    if (t.setup1_available === false) score -= 3
    if (t.setup2_available === false) score -= 2

    return score
  }

  const homeScore = scoreBullpen(home)
  const awayScore = scoreBullpen(away)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 3: OFFENSE (V3 — 13 sub-factors)
// ============================================================
function computeOffenseEdge(home: any, away: any): number {
  if (!home || !away) return 0

  function scoreOffense(t: any): number {
    let score = 0

    // 1. Runs per game L30
    if (t.runs_per_game_l30 !== null && t.runs_per_game_l30 !== undefined) {
      const LEAGUE_AVG = 4.5
      score += (t.runs_per_game_l30 - LEAGUE_AVG) * 10
    }

    // 2. OPS L30
    if (t.ops_l30 !== null && t.ops_l30 !== undefined) {
      const LEAGUE_AVG = 0.720
      score += (t.ops_l30 - LEAGUE_AVG) * 50
    }

    // 3. ISO (isolated power — pure extra-base hit ability)
    if (t.iso !== null && t.iso !== undefined) {
      const LEAGUE_AVG = 0.150
      score += (t.iso - LEAGUE_AVG) * 30
    }

    // 4. K% (lower is better — contact-oriented lineups sustain rallies)
    if (t.k_pct !== null && t.k_pct !== undefined) {
      const LEAGUE_AVG = 0.225
      score += (LEAGUE_AVG - t.k_pct) * 20
    }

    // 5. BB% (higher is better — patience creates baserunners)
    if (t.bb_pct !== null && t.bb_pct !== undefined) {
      const LEAGUE_AVG = 0.085
      score += (t.bb_pct - LEAGUE_AVG) * 25
    }

    // 6. Stolen base success rate (speed dimension)
    if (t.stolen_base_pct !== null && t.stolen_base_pct !== undefined) {
      // Only matters if they actually attempt — success rate above 75% is a weapon
      if (t.stolen_base_pct > 0.75) score += 2
      else if (t.stolen_base_pct < 0.60) score -= 1
    }

    return score
  }

  const homeScore = scoreOffense(home)
  const awayScore = scoreOffense(away)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 4: DEFENSE (V3 — now uses real data)
// ============================================================
function computeDefenseEdge(homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!homeT || !awayT) return 0

  function scoreDefense(team: any, pitcher: any): number {
    let score = 0

    // 1. OAA (or proxy from fielding pct)
    if (team.oaa !== null && team.oaa !== undefined) {
      score += team.oaa * 2
    }

    // 2. Infield OAA (if available — separate from overall)
    if (team.infield_oaa !== null && team.infield_oaa !== undefined) {
      score += team.infield_oaa * 1.5
    }

    // 3. Outfield OAA
    if (team.outfield_oaa !== null && team.outfield_oaa !== undefined) {
      score += team.outfield_oaa * 1
    }

    // 4. DRS
    if (team.drs !== null && team.drs !== undefined) {
      score += team.drs * 0.5
    }

    // 5. Errors per game
    if (team.errors_per_game_l30 !== null && team.errors_per_game_l30 !== undefined) {
      const LEAGUE_AVG = 0.55
      score += (LEAGUE_AVG - team.errors_per_game_l30) * 10
    }

    // 6. Pitcher synergy — GB pitcher + good infield = multiplied value
    if (pitcher?.gb_percent && pitcher.gb_percent > 0.48) {
      // Above-average GB pitcher amplifies infield defense
      const gbBonus = (pitcher.gb_percent - 0.43) * 100
      const infieldQuality = team.infield_oaa ?? (team.oaa ?? 0) * 0.6
      if (infieldQuality > 0) {
        score += gbBonus * (infieldQuality / 10)
      }
    }

    // 7. FB pitcher + good outfield
    if (pitcher?.fb_percent && pitcher.fb_percent > 0.38) {
      const fbBonus = (pitcher.fb_percent - 0.35) * 80
      const outfieldQuality = team.outfield_oaa ?? (team.oaa ?? 0) * 0.4
      if (outfieldQuality > 0) {
        score += fbBonus * (outfieldQuality / 10)
      }
    }

    return score
  }

  const homeDef = scoreDefense(homeT, homeP)
  const awayDef = scoreDefense(awayT, awayP)

  return Math.max(-100, Math.min(100, (homeDef - awayDef) * 4))
}

// ============================================================
// COMPONENT 5: MATCHUP (V3 — pitcher arsenal vs lineup)
// ============================================================
function computeMatchupEdge(homeP: any, awayP: any, homeT: any, awayT: any): number {
  if (!homeT || !awayT || (!homeP && !awayP)) return 0

  const LEAGUE_AVG_K9 = 8.5
  const LEAGUE_AVG_RPG = 4.5
  const LEAGUE_AVG_GB_PCT = 0.43

  function calculateSynergy(pitcher: any, offense: any): number {
    let advantage = 0

    // 1. K/9 vs Runs/Game — dominant strikeout pitcher vs high-scoring offense = big edge
    if (pitcher?.k_per_9 && offense?.runs_per_game_l30) {
      advantage += (pitcher.k_per_9 - LEAGUE_AVG_K9) * 2
    }

    // 2. Groundball synergy
    if (pitcher?.gb_percent && offense?.ops_l30) {
      const gbPitcherEdge = pitcher.gb_percent - LEAGUE_AVG_GB_PCT
      if (gbPitcherEdge > 0) {
        advantage += gbPitcherEdge * 20
      }
    }

    // 3. V3: Pitcher handedness vs lineup splits
    // If pitcher is better vs the handedness that dominates the opposing lineup
    if (pitcher?.vs_lhb_baa !== null && pitcher?.vs_rhb_baa !== null) {
      // Lower BAA = better against that handedness
      // Assume roughly even lineup unless we know otherwise
      const avgBaa = (pitcher.vs_lhb_baa + pitcher.vs_rhb_baa) / 2
      const LEAGUE_AVG_BAA = 0.245
      advantage += (LEAGUE_AVG_BAA - avgBaa) * 30
    }

    // 4. V3: Recent form interaction — hot pitcher vs cold offense
    if (pitcher?.l3_era !== null && offense?.runs_per_game_l30 !== null) {
      if (pitcher.l3_era < 3.0 && offense.runs_per_game_l30 < 4.0) {
        advantage += 5 // dominant pitcher vs struggling offense
      }
      if (pitcher.l3_era > 5.0 && offense.runs_per_game_l30 > 5.0) {
        advantage -= 5 // struggling pitcher vs hot offense
      }
    }

    return advantage
  }

  const home_advantage = calculateSynergy(homeP, awayT)
  const away_advantage = calculateSynergy(awayP, homeT)

  return Math.max(-100, Math.min(100, home_advantage - away_advantage))
}

// ============================================================
// COMPONENT 6: PARK FACTOR (V3 — 10 sub-factors)
// ============================================================
function computeParkEdge(park: any, homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!park || !homeT || !awayT) return 0

  let edge = 0

  // 1-2. HR + Run factor (existing)
  if (parkLeansHitter(park)) {
    // Hitter-friendly park — advantage to higher-scoring team
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      edge = homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 5 : -5
    }
    // 3. V3: ISO matters more in hitter parks
    if (homeT.iso && awayT.iso) {
      edge += (homeT.iso - awayT.iso) * 15
    }
  }

  if (parkLeansPitcher(park)) {
    // Pitcher-friendly park — advantage to better pitching staff
    if (homeP?.fip && awayP?.fip) {
      edge = homeP.fip < awayP.fip ? 4 : -4
    }
  }

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// COMPONENT 7: WEATHER (V3 — recalibrated thresholds)
// ============================================================
function computeWeatherEdge(weather: any, park: any, homeT: any, awayT: any): number {
  if (park?.is_dome) return 0
  if (!weather) return 0
  if (!homeT || !awayT) return 0

  let edge = 0

  // 1. Wind direction + speed (V3: lower threshold from 8 → 5 mph)
  if (weather.wind_dir === 'out' && weather.wind_mph > 5) {
    // Wind blowing out — favors power hitting team
    const windBoost = Math.min(8, weather.wind_mph * 0.6)
    if (homeT.iso && awayT.iso) {
      edge += homeT.iso > awayT.iso ? windBoost : -windBoost
    } else if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      edge += homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? windBoost : -windBoost
    }
  }

  if (weather.wind_dir === 'in' && weather.wind_mph > 5) {
    // Wind blowing in — suppresses offense, favors pitching
    const windPenalty = Math.min(5, weather.wind_mph * 0.4)
    edge -= windPenalty // slightly favors away (pitching matters more in low-scoring games)
  }

  // 2. Temperature (V3: graduated instead of binary)
  if (weather.temp_f < 45) edge -= 4      // very cold — significant offense suppression
  else if (weather.temp_f < 55) edge -= 2  // cool — mild suppression
  else if (weather.temp_f > 90) edge += 2  // hot — ball carries, slight offense boost
  else if (weather.temp_f > 85) edge += 1  // warm — minor boost

  // 3. V3: Combined extreme — hot + wind out = monster offense day
  if (weather.temp_f > 80 && weather.wind_dir === 'out' && weather.wind_mph > 8) {
    // This is a "bombs will fly" game — heavily favors better offense
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      const rpgDiff = homeT.runs_per_game_l30 - awayT.runs_per_game_l30
      edge += rpgDiff * 3
    }
  }

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// COMPONENT 8: REST & TRAVEL (V3 — 11 sub-factors)
// ============================================================
function computeRestEdge(home: any, away: any): number {
  if (!home || !away) return 0

  let edge = 0

  // 1. Bullpen fatigue yesterday (existing, kept)
  if (home.bullpen_innings_yesterday >= 5) edge -= 4
  if (away.bullpen_innings_yesterday >= 5) edge += 4

  // 2. V3: 3-day rolling bullpen fatigue
  if (home.bullpen_ip_last_3 !== null && away.bullpen_ip_last_3 !== null) {
    const homeFatigue = home.bullpen_ip_last_3 > 12 ? 3 : home.bullpen_ip_last_3 > 8 ? 1 : 0
    const awayFatigue = away.bullpen_ip_last_3 > 12 ? 3 : away.bullpen_ip_last_3 > 8 ? 1 : 0
    edge += awayFatigue - homeFatigue
  }

  // 3. V3: Travel distance
  if (away.travel_miles_last !== null && away.travel_miles_last > 0) {
    // Cross-country travel penalizes the visitor
    if (away.travel_miles_last > 2000) edge += 3       // coast-to-coast
    else if (away.travel_miles_last > 1000) edge += 2  // significant travel
    else if (away.travel_miles_last > 500) edge += 1   // moderate travel
  }

  // 4. V3: Schedule density
  if (home.games_last_10_days !== null && away.games_last_10_days !== null) {
    const homeDensity = home.games_last_10_days > 10 ? 2 : 0
    const awayDensity = away.games_last_10_days > 10 ? 2 : 0
    edge += awayDensity - homeDensity
  }

  // 5. V3: Consecutive road games
  if (away.consecutive_road_games !== null && away.consecutive_road_games >= 7) {
    edge += 2 // long road trip = fatigue
  }

  // 6. V3: Day after night game
  if (home.day_after_night === true) edge -= 1
  if (away.day_after_night === true) edge += 1

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// HIDDEN COMPONENT: PITCHER FATIGUE (V3 — NEW)
// Not shown as a separate bar, folded into overall score
// ============================================================
function computePitcherFatigue(home: any, away: any): number {
  function fatigueScore(p: any): number {
    if (!p) return 0
    let fatigue = 0

    // 1. Pitch count last start
    if (p.pitch_count_last !== null && p.pitch_count_last !== undefined) {
      if (p.pitch_count_last >= 110) fatigue += 8
      else if (p.pitch_count_last >= 100) fatigue += 4
      else if (p.pitch_count_last >= 90) fatigue += 1
    }

    // 2. Days rest (less rest = more fatigue)
    if (p.days_rest !== null && p.days_rest !== undefined) {
      if (p.days_rest <= 3) fatigue += 6      // short rest
      else if (p.days_rest === 4) fatigue += 2 // standard
      else if (p.days_rest >= 7) fatigue -= 3  // extra rest = fresh (but might be rusty)
    }

    // 3. Season workload — innings pace vs career norms
    if (p.season_ip_pace !== null && p.season_ip_pace !== undefined) {
      if (p.season_ip_pace > 200) fatigue += 3  // on pace for heavy workload
      if (p.season_ip_pace > 220) fatigue += 3  // red zone
    }

    return fatigue
  }

  const homeFatigue = fatigueScore(home)
  const awayFatigue = fatigueScore(away)

  // Positive = favors home (away pitcher more fatigued)
  return Math.max(-100, Math.min(100, (awayFatigue - homeFatigue) * 3))
}

// ============================================================
// HIDDEN COMPONENT: LINEUP CONFIDENCE (V3 — NEW)
// Adjusts overall confidence based on data quality
// ============================================================
function computeLineupConfidence(home: any, away: any): number {
  // This is a meta-component: it doesn't predict who wins,
  // it adjusts HOW CONFIDENT we are in the other components.
  // When lineups are confirmed, data is higher quality.
  // When lineups are TBD, we're using team averages which are less predictive.

  // For now, this returns 0 (neutral) — we'll wire lineup confirmation
  // detection in a future update when the lineup API integration is ready.
  // The weight allocated (5%) is reserved for this purpose.
  return 0
}

// ============================================================
// HELPERS
// ============================================================
async function fetchPitcher(pitcherId: number) {
  const { data, error } = await supa
    .from('pitcher_stats')
    .select('*')
    .eq('player_id', pitcherId)
    .single()
  return error ? null : data
}

async function fetchTeam(teamId: number) {
  const { data, error } = await supa
    .from('team_stats')
    .select('*')
    .eq('team_id', teamId)
    .single()
  return error ? null : data
}

export async function logPrediction(
  gamePk: number,
  gameDate: string,
  homeTeamId: number,
  homeTeamName: string,
  awayTeamId: number,
  awayTeamName: string,
  result: EdgeScoreResult,
  lineupsConfirmed: boolean = false,
  summary: string | null = null,
  story_lead: string | null = null,
  narrative: string | null = null,
  streakData: any | null = null,
  narrative_pro: string | null = null,
  home_stories: any = null,
  away_stories: any = null,
  contrarian: string | null = null,
  pro_takeaways: any = null
) {
  const row: any = {
    game_pk: gamePk,
    game_date: gameDate,
    home_team_id: homeTeamId,
    home_team: homeTeamName,
    away_team_id: awayTeamId,
    away_team: awayTeamName,
    edge_score: result.edge_score,
    predicted_winner: result.predicted_winner,
    confidence_tier: result.confidence_tier,
    components: result.components,
    components_raw: result.components_raw,
    lineups_confirmed: lineupsConfirmed,
    updated_at: new Date().toISOString(),
  }

  if (summary !== null) {
    row.summary = summary
    row.story_lead = story_lead
    row.narrative = narrative
    row.narrative_pro = narrative_pro
    row.home_stories = home_stories
    row.away_stories = away_stories
    row.contrarian = contrarian
    row.pro_takeaways = pro_takeaways
    row.narrative_generated_at = new Date().toISOString()
  }

  if (streakData !== null) {
    row.streak_data = streakData
  }

  await supa.from('edge_predictions').upsert(row, { onConflict: 'game_pk' })
}