import { createClient } from '@supabase/supabase-js'
import { getParkFactor, parkLeansHitter, parkLeansPitcher } from './parks'
import type { ComponentsRaw } from './matchup-tilt';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// V4 COMPONENT WEIGHTS
// Key changes vs V3:
//   - Offense:  0.16 → 0.18  (xwOBA, Hard Hit%, platoon splits now wired)
//   - Matchup:  0.15 → 0.18  (real platoon OPS + pitcher H2H now wired)
//   - Bullpen:  0.13 → 0.12  (slight reduction — offset by matchup gain)
//   - Park:     0.05 → 0.05  (unchanged)
//   - SP:       0.22 → 0.22  (unchanged — 13 sub-factors now active)
// Total = 1.00
// ============================================================
const WEIGHTS = {
  starting_pitcher: 0.22,
  bullpen:          0.12,
  offense:          0.18,
  defense:          0.08,
  matchup:          0.18,
  park:             0.05,
  weather:          0.04,
  rest:             0.05,
  pitcher_fatigue:  0.07,
  lineup_confirmed: 0.01,  // reduced from 0.05 — not yet wired
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
// MAIN ENTRY POINT — V4
// ============================================================
export async function calculateEdgeScore(inputs: GameInputs): Promise<EdgeScoreResult> {
  const [
    homePitcher,
    awayPitcher,
    homeTeam,
    awayTeam,
    park,
    homePlatoon,
    awayPlatoon,
    homePitcherArsenal,
    awayPitcherArsenal,
    homePitcherH2H,
    awayPitcherH2H,
  ] = await Promise.all([
    inputs.home_pitcher_id ? fetchPitcher(inputs.home_pitcher_id) : null,
    inputs.away_pitcher_id ? fetchPitcher(inputs.away_pitcher_id) : null,
    fetchTeam(inputs.home_team_id),
    fetchTeam(inputs.away_team_id),
    getParkFactor(inputs.venue_name),
    fetchPlatoon(inputs.home_team_id),
    fetchPlatoon(inputs.away_team_id),
    inputs.home_pitcher_id ? fetchPitcherArsenal(inputs.home_pitcher_id) : null,
    inputs.away_pitcher_id ? fetchPitcherArsenal(inputs.away_pitcher_id) : null,
    inputs.home_pitcher_id ? fetchPitcherH2H(inputs.home_pitcher_id, inputs.away_team_id) : null,
    inputs.away_pitcher_id ? fetchPitcherH2H(inputs.away_pitcher_id, inputs.home_team_id) : null,
  ])

  // Compute all 8 visible components
  const componentsRaw: EdgeComponents = {
    starting_pitcher: computePitcherEdge(homePitcher, awayPitcher, homePitcherArsenal, awayPitcherArsenal),
    bullpen:          computeBullpenEdge(homeTeam, awayTeam),
    offense:          computeOffenseEdge(homeTeam, awayTeam, homePlatoon, awayPlatoon, awayPitcher, homePitcher),
    defense:          computeDefenseEdge(homeTeam, awayTeam, homePitcher, awayPitcher),
    matchup:          computeMatchupEdge(homePitcher, awayPitcher, homeTeam, awayTeam, homePlatoon, awayPlatoon, homePitcherArsenal, awayPitcherArsenal, homePitcherH2H, awayPitcherH2H),
    park:             computeParkEdge(park, homeTeam, awayTeam, homePitcher, awayPitcher),
    weather:          computeWeatherEdge(inputs.weather, park, homeTeam, awayTeam),
    rest:             computeRestEdge(homeTeam, awayTeam),
  }

  // Hidden components
  const pitcherFatigue    = computePitcherFatigue(homePitcher, awayPitcher)
  const lineupConfidence  = computeLineupConfidence(homeTeam, awayTeam)

  // Round visible components
  const components: EdgeComponents = {
    starting_pitcher: Math.round(componentsRaw.starting_pitcher * 10) / 10,
    bullpen:          Math.round(componentsRaw.bullpen * 10) / 10,
    offense:          Math.round(componentsRaw.offense * 10) / 10,
    defense:          Math.round(componentsRaw.defense * 10) / 10,
    matchup:          Math.round(componentsRaw.matchup * 10) / 10,
    park:             Math.round(componentsRaw.park * 10) / 10,
    weather:          Math.round(componentsRaw.weather * 10) / 10,
    rest:             Math.round(componentsRaw.rest * 10) / 10,
  }

  // Weighted sum
  let edge_score = 0
  for (const [key, value] of Object.entries(components)) {
    edge_score += value * WEIGHTS[key as keyof typeof WEIGHTS]
  }
  edge_score += pitcherFatigue   * WEIGHTS.pitcher_fatigue
  edge_score += lineupConfidence * WEIGHTS.lineup_confirmed

  // Home field advantage
  edge_score += 4

  // Clamp + round
  edge_score = Math.max(-100, Math.min(100, edge_score))
  edge_score = Math.round(edge_score * 10) / 10

  const predicted_winner: 'home' | 'away' = edge_score >= 0 ? 'home' : 'away'
  const abs_edge = Math.abs(edge_score)
  let confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  if      (abs_edge >= 25) confidence_tier = 'strong'
  else if (abs_edge >= 12) confidence_tier = 'moderate'
  else if (abs_edge >= 5)  confidence_tier = 'slight'
  else                     confidence_tier = 'tossup'

  return {
    edge_score,
    predicted_winner,
    confidence_tier,
    components,
    components_raw: {
      home_pitcher:         homePitcher,
      away_pitcher:         awayPitcher,
      home_team:            homeTeam,
      away_team:            awayTeam,
      park,
      weather:              inputs.weather,
      home_platoon:         homePlatoon,
      away_platoon:         awayPlatoon,
      home_pitcher_arsenal: homePitcherArsenal,
      away_pitcher_arsenal: awayPitcherArsenal,
      home_pitcher_h2h:     homePitcherH2H,
      away_pitcher_h2h:     awayPitcherH2H,
      _hidden:              { pitcherFatigue, lineupConfidence },
    },
  }
}

// ============================================================
// COMPONENT 1: STARTING PITCHER (V4 — 13 sub-factors)
// New vs V3: xERA proxy (via est_woba), Barrel% against,
//            CSW% (Chase+Swing+Whiff), put_away%, popup%
// ============================================================
function computePitcherEdge(home: any, away: any, homeArsenal: any[] | null, awayArsenal: any[] | null): number {
  if (!home && !away) return 0

  function scorePitcher(p: any, arsenal: any[] | null): number {
    if (!p) return 0
    let score = 0

    // 1. FIP (primary quality metric — defense-independent)
    if (p.fip != null) {
      score += (4.10 - p.fip) * 15
    }

    // 2. ERA (captures outcomes FIP misses)
    if (p.era != null) {
      score += (4.10 - p.era) * 8
    }

    // 3. K/9
    if (p.k_per_9 != null) {
      score += (p.k_per_9 - 8.5) * 4
    }

    // 4. BB/9
    if (p.bb_per_9 != null) {
      score += (3.2 - p.bb_per_9) * 5
    }

    // 5. WHIP
    if (p.whip != null) {
      score += (1.28 - p.whip) * 12
    }

    // 6. L3 ERA trend (recent form)
    if (p.l3_era != null && p.era != null) {
      score += (p.era - p.l3_era) * 3   // positive = improving
    }

    // 7. L3 K/9 trend
    if (p.l3_k_per_9 != null && p.k_per_9 != null) {
      score += (p.l3_k_per_9 - p.k_per_9) * 2
    }

    // 8. GB%
    if (p.gb_percent != null) {
      score += (p.gb_percent - 0.43) * 15
    }

    // ── V4 NEW: Arsenal-level metrics ──────────────────────

    if (arsenal && arsenal.length > 0) {
      // 9. Weighted whiff% across arsenal (CSW proxy)
      //    Each pitch weighted by its usage percentage
      let whiffScore = 0
      let whiffWeight = 0
      for (const pitch of arsenal) {
        const pct = Number(pitch.percentage ?? 0)
        const whiff = pitch.whiff_percent != null ? Number(pitch.whiff_percent) : null
        if (whiff != null && pct > 0) {
          whiffScore  += whiff * pct
          whiffWeight += pct
        }
      }
      if (whiffWeight > 0) {
        const avgWhiff = whiffScore / whiffWeight
        const LEAGUE_AVG_WHIFF = 24.0  // ~24% league avg
        score += (avgWhiff - LEAGUE_AVG_WHIFF) * 0.4
      }

      // 10. Weighted hard_hit% against (lower = better for pitcher)
      let hardHitScore = 0
      let hardHitWeight = 0
      for (const pitch of arsenal) {
        const pct = Number(pitch.percentage ?? 0)
        const hh = pitch.hard_hit_percent != null ? Number(pitch.hard_hit_percent) : null
        if (hh != null && pct > 0) {
          hardHitScore  += hh * pct
          hardHitWeight += pct
        }
      }
      if (hardHitWeight > 0) {
        const avgHardHit = hardHitScore / hardHitWeight
        const LEAGUE_AVG_HH = 36.0   // ~36% league avg
        score += (LEAGUE_AVG_HH - avgHardHit) * 0.3  // lower hard-hit = pitcher edge
      }

      // 11. Weighted est_woba (xERA proxy — lower = better for pitcher)
      let xwobaScore = 0
      let xwobaWeight = 0
      for (const pitch of arsenal) {
        const pct = Number(pitch.percentage ?? 0)
        const xw = pitch.est_woba != null ? Number(pitch.est_woba) : null
        if (xw != null && pct > 0) {
          xwobaScore  += xw * pct
          xwobaWeight += pct
        }
      }
      if (xwobaWeight > 0) {
        const avgXwoba = xwobaScore / xwobaWeight
        const LEAGUE_AVG_XWOBA = 0.315
        score += (LEAGUE_AVG_XWOBA - avgXwoba) * 30  // lower xwOBA against = pitcher edge
      }

      // 12. Weighted put_away% (ability to finish at-bats in 2-strike counts)
      let putAwayScore = 0
      let putAwayWeight = 0
      for (const pitch of arsenal) {
        const pct = Number(pitch.percentage ?? 0)
        const pa = pitch.put_away_percent != null ? Number(pitch.put_away_percent) : null
        if (pa != null && pct > 0) {
          putAwayScore  += pa * pct
          putAwayWeight += pct
        }
      }
      if (putAwayWeight > 0) {
        const avgPutAway = putAwayScore / putAwayWeight
        const LEAGUE_AVG_PUT_AWAY = 29.0
        score += (avgPutAway - LEAGUE_AVG_PUT_AWAY) * 0.25
      }

      // 13. Pitch variety bonus — 3+ distinct pitch types with >10% usage
      const meaningfulPitches = arsenal.filter(p => Number(p.percentage ?? 0) >= 10)
      if (meaningfulPitches.length >= 4) score += 3       // elite repertoire
      else if (meaningfulPitches.length === 3) score += 1 // solid variety
      else if (meaningfulPitches.length <= 1) score -= 2  // one-pitch pitcher
    }

    return score
  }

  const homeScore = scorePitcher(home, homeArsenal)
  const awayScore = scorePitcher(away, awayArsenal)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 2: BULLPEN (V3 — unchanged, 12 sub-factors)
// ============================================================
function computeBullpenEdge(home: any, away: any): number {
  if (!home || !away) return 0

  function scoreBullpen(t: any): number {
    let score = 0

    if (t.bullpen_era != null) {
      score += (3.90 - t.bullpen_era) * 8
    }
    if (t.bullpen_k_per_9 != null) {
      score += (t.bullpen_k_per_9 - 8.8) * 2
    }
    if (t.bullpen_hr_per_9 != null) {
      score += (1.2 - t.bullpen_hr_per_9) * 4
    }
    if (t.bullpen_innings_yesterday != null) {
      if      (t.bullpen_innings_yesterday >= 6) score -= 10
      else if (t.bullpen_innings_yesterday >= 4) score -= 5
      else if (t.bullpen_innings_yesterday >= 2) score -= 2
    }
    if (t.bullpen_ip_last_3 != null) {
      if      (t.bullpen_ip_last_3 >= 15) score -= 8
      else if (t.bullpen_ip_last_3 >= 10) score -= 4
      else if (t.bullpen_ip_last_3 >= 7)  score -= 2
    }
    if (t.closer_available  === false) score -= 6
    if (t.setup1_available  === false) score -= 3
    if (t.setup2_available  === false) score -= 2

    return score
  }

  return Math.max(-100, Math.min(100, scoreBullpen(home) - scoreBullpen(away)))
}

// ============================================================
// COMPONENT 3: OFFENSE (V4 — 11 sub-factors)
// New vs V3: xwOBA (team), Hard Hit%, platoon split vs
//            opposing pitcher handedness, BABIP regression flag
// ============================================================
function computeOffenseEdge(
  home: any, away: any,
  homePlatoon: any, awayPlatoon: any,
  awayPitcher: any, homePitcher: any,
): number {
  if (!home || !away) return 0

  function scoreOffense(team: any, platoon: any, opposingPitcher: any): number {
    let score = 0

    // 1. Runs/game L30
    if (team.runs_per_game_l30 != null) {
      score += (team.runs_per_game_l30 - 4.5) * 10
    }

    // 2. OPS L30
    if (team.ops_l30 != null) {
      score += (team.ops_l30 - 0.720) * 50
    }

    // 3. ISO (isolated power)
    if (team.iso != null) {
      score += (team.iso - 0.150) * 30
    }

    // 4. K%
    if (team.k_pct != null) {
      score += (0.225 - team.k_pct) * 20
    }

    // 5. BB%
    if (team.bb_pct != null) {
      score += (team.bb_pct - 0.085) * 25
    }

    // 6. SB success rate
    if (team.stolen_base_pct != null) {
      if      (team.stolen_base_pct > 0.75) score += 2
      else if (team.stolen_base_pct < 0.60) score -= 1
    }

    // ── V4 NEW ──────────────────────────────────────────────

    // 7. Team xwOBA (expected wOBA — better than raw OPS vs luck)
    if (team.xwoba != null) {
      const LEAGUE_AVG_XWOBA = 0.315
      score += (Number(team.xwoba) - LEAGUE_AVG_XWOBA) * 60
    }

    // 8. Hard Hit% (barrels/solid contact — power indicator)
    if (team.hard_hit_pct != null) {
      const LEAGUE_AVG_HH = 36.0
      score += (Number(team.hard_hit_pct) - LEAGUE_AVG_HH) * 0.5
    }

    // 9. Platoon split vs opposing pitcher handedness
    //    If we know the opposing pitcher throws L or R, use the relevant OPS split
    if (platoon && opposingPitcher?.throws) {
      const throws = opposingPitcher.throws  // 'L' or 'R'
      const relevantOps = throws === 'L'
        ? platoon.vs_lhp_ops
        : platoon.vs_rhp_ops

      if (relevantOps != null) {
        const LEAGUE_AVG_OPS = 0.720
        score += (Number(relevantOps) - LEAGUE_AVG_OPS) * 40
      }
    }

    // 10. wRC+ (if available — park-adjusted run creation)
    if (team.wrc_plus != null) {
      score += (Number(team.wrc_plus) - 100) * 0.3
    }

    // 11. BABIP regression flag
    //     If BABIP > .330, some luck involved — slight downward regression expected
    //     If BABIP < .270, may be due a bounce-back
    if (team.babip != null) {
      const babip = Number(team.babip)
      if      (babip > 0.330) score -= 2
      else if (babip < 0.270) score += 2
    }

    return score
  }

  const homeScore = scoreOffense(home, homePlatoon, awayPitcher)
  const awayScore = scoreOffense(away, awayPlatoon, homePitcher)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 4: DEFENSE (V3 — unchanged)
// ============================================================
function computeDefenseEdge(homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!homeT || !awayT) return 0

  function scoreDefense(team: any, pitcher: any): number {
    let score = 0

    if (team.oaa != null)         score += team.oaa * 2
    if (team.infield_oaa != null) score += team.infield_oaa * 1.5
    if (team.outfield_oaa != null) score += team.outfield_oaa * 1
    if (team.drs != null)         score += team.drs * 0.5

    if (team.errors_per_game_l30 != null) {
      score += (0.55 - team.errors_per_game_l30) * 10
    }

    // GB pitcher + infield synergy
    if (pitcher?.gb_percent && pitcher.gb_percent > 0.48) {
      const gbBonus = (pitcher.gb_percent - 0.43) * 100
      const infieldQuality = team.infield_oaa ?? (team.oaa ?? 0) * 0.6
      if (infieldQuality > 0) score += gbBonus * (infieldQuality / 10)
    }

    // FB pitcher + outfield synergy
    if (pitcher?.fb_percent && pitcher.fb_percent > 0.38) {
      const fbBonus = (pitcher.fb_percent - 0.35) * 80
      const outfieldQuality = team.outfield_oaa ?? (team.oaa ?? 0) * 0.4
      if (outfieldQuality > 0) score += fbBonus * (outfieldQuality / 10)
    }

    return score
  }

  return Math.max(-100, Math.min(100, (scoreDefense(homeT, homeP) - scoreDefense(awayT, awayP)) * 4))
}

// ============================================================
// COMPONENT 5: MATCHUP (V4 — 10 sub-factors)
// New vs V3: real platoon OPS splits, pitcher H2H history,
//            arsenal est_woba vs platoon weakness
// ============================================================
function computeMatchupEdge(
  homeP: any, awayP: any,
  homeT: any, awayT: any,
  homePlatoon: any, awayPlatoon: any,
  homeArsenal: any[] | null, awayArsenal: any[] | null,
  homePitcherH2H: any, awayPitcherH2H: any,
): number {
  if (!homeT || !awayT || (!homeP && !awayP)) return 0

  function calculateSynergy(
    pitcher: any,
    offense: any,
    platoon: any,
    arsenal: any[] | null,
    h2h: any,
  ): number {
    let advantage = 0

    // 1. K/9 vs RPG
    if (pitcher?.k_per_9 && offense?.runs_per_game_l30) {
      advantage += (pitcher.k_per_9 - 8.5) * 2
    }

    // 2. GB% vs opposing contact style
    if (pitcher?.gb_percent && offense?.ops_l30) {
      const gbEdge = pitcher.gb_percent - 0.43
      if (gbEdge > 0) advantage += gbEdge * 20
    }

    // 3. V3: Pitcher handedness vs lineup BAA splits (kept)
    if (pitcher?.vs_lhb_baa != null && pitcher?.vs_rhb_baa != null) {
      const avgBaa = (pitcher.vs_lhb_baa + pitcher.vs_rhb_baa) / 2
      advantage += (0.245 - avgBaa) * 30
    }

    // 4. V3: Recent form interaction (kept)
    if (pitcher?.l3_era != null && offense?.runs_per_game_l30 != null) {
      if (pitcher.l3_era < 3.0 && offense.runs_per_game_l30 < 4.0) advantage += 5
      if (pitcher.l3_era > 5.0 && offense.runs_per_game_l30 > 5.0) advantage -= 5
    }

    // ── V4 NEW ──────────────────────────────────────────────

    // 5. Real platoon OPS split vs pitcher handedness
    //    e.g. RHP facing a team that crushes RHP — larger penalty
    if (platoon && pitcher?.throws) {
     const relevantOps = pitcher.throws === 'L'
        ? platoon.vs_lhp_ops
        : platoon.vs_rhp_ops
      if (relevantOps != null) {
        const LEAGUE_AVG = 0.720
        // High platoon OPS against this pitcher's handedness = offense advantage = pitcher disadvantage
        advantage -= (Number(relevantOps) - LEAGUE_AVG) * 35
      }
    }

    // 6. H2H: pitcher career record vs this specific team
  if (h2h && h2h.games >= 3) {
      // Compare H2H ERA vs career ERA
      if (h2h.era != null && pitcher?.era != null) {
        const h2hEdge = pitcher.era - Number(h2h.era)
        advantage += h2hEdge * 4
      }
      // K/9 vs this team (derived from counting stats)
      if (h2h.innings_pitched != null && h2h.strikeouts != null && Number(h2h.innings_pitched) > 0) {
        const h2hK9 = (Number(h2h.strikeouts) / Number(h2h.innings_pitched)) * 9
        const LEAGUE_AVG_K9 = 8.5
        advantage += (h2hK9 - LEAGUE_AVG_K9) * 1.5
      }
    }

    // 7. Arsenal est_woba vs platoon — does the pitcher's stuff match up?
    //    Lower est_woba from arsenal = pitcher dominates contact quality
    if (arsenal && arsenal.length > 0 && platoon) {
      let xwobaSum = 0, xwobaWeight = 0
      for (const pitch of arsenal) {
        const pct = Number(pitch.percentage ?? 0)
        const xw = pitch.est_woba != null ? Number(pitch.est_woba) : null
        if (xw != null && pct > 0) {
          xwobaSum    += xw * pct
          xwobaWeight += pct
        }
      }
      if (xwobaWeight > 0) {
        const avgXwoba = xwobaSum / xwobaWeight
        // Lower xwOBA against = pitcher's arsenal suppresses contact quality
        advantage += (0.315 - avgXwoba) * 25
      }
    }

    return advantage
  }

  const homeAdvantage = calculateSynergy(homeP, awayT, awayPlatoon, homeArsenal, homePitcherH2H)
  const awayAdvantage = calculateSynergy(awayP, homeT, homePlatoon, awayArsenal, awayPitcherH2H)

  return Math.max(-100, Math.min(100, homeAdvantage - awayAdvantage))
}

// ============================================================
// COMPONENT 6: PARK (V3 — unchanged)
// ============================================================
function computeParkEdge(park: any, homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!park || !homeT || !awayT) return 0

  let edge = 0

  if (parkLeansHitter(park)) {
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      edge = homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 5 : -5
    }
    if (homeT.iso && awayT.iso) {
      edge += (homeT.iso - awayT.iso) * 15
    }
  }

  if (parkLeansPitcher(park)) {
    if (homeP?.fip && awayP?.fip) {
      edge = homeP.fip < awayP.fip ? 4 : -4
    }
  }

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// COMPONENT 7: WEATHER (V3 — unchanged)
// ============================================================
function computeWeatherEdge(weather: any, park: any, homeT: any, awayT: any): number {
  if (park?.is_dome) return 0
  if (!weather)      return 0
  if (!homeT || !awayT) return 0

  let edge = 0

  if (weather.wind_dir === 'out' && weather.wind_mph > 5) {
    const windBoost = Math.min(8, weather.wind_mph * 0.6)
    if (homeT.iso && awayT.iso) {
      edge += homeT.iso > awayT.iso ? windBoost : -windBoost
    } else if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      edge += homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? windBoost : -windBoost
    }
  }

  if (weather.wind_dir === 'in' && weather.wind_mph > 5) {
    edge -= Math.min(5, weather.wind_mph * 0.4)
  }

  if      (weather.temp_f < 45) edge -= 4
  else if (weather.temp_f < 55) edge -= 2
  else if (weather.temp_f > 90) edge += 2
  else if (weather.temp_f > 85) edge += 1

  if (weather.temp_f > 80 && weather.wind_dir === 'out' && weather.wind_mph > 8) {
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      edge += (homeT.runs_per_game_l30 - awayT.runs_per_game_l30) * 3
    }
  }

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// COMPONENT 8: REST & TRAVEL (V3 — unchanged)
// ============================================================
function computeRestEdge(home: any, away: any): number {
  if (!home || !away) return 0

  let edge = 0

  if (home.bullpen_innings_yesterday >= 5) edge -= 4
  if (away.bullpen_innings_yesterday >= 5) edge += 4

  if (home.bullpen_ip_last_3 != null && away.bullpen_ip_last_3 != null) {
    const homeFatigue = home.bullpen_ip_last_3 > 12 ? 3 : home.bullpen_ip_last_3 > 8 ? 1 : 0
    const awayFatigue = away.bullpen_ip_last_3 > 12 ? 3 : away.bullpen_ip_last_3 > 8 ? 1 : 0
    edge += awayFatigue - homeFatigue
  }

  if (away.travel_miles_last != null && away.travel_miles_last > 0) {
    if      (away.travel_miles_last > 2000) edge += 3
    else if (away.travel_miles_last > 1000) edge += 2
    else if (away.travel_miles_last > 500)  edge += 1
  }

  if (home.games_last_10_days != null && away.games_last_10_days != null) {
    edge += (away.games_last_10_days > 10 ? 2 : 0) - (home.games_last_10_days > 10 ? 2 : 0)
  }

  if (away.consecutive_road_games != null && away.consecutive_road_games >= 7) edge += 2

  if (home.day_after_night === true) edge -= 1
  if (away.day_after_night === true) edge += 1

  return Math.max(-100, Math.min(100, edge))
}

// ============================================================
// HIDDEN: PITCHER FATIGUE (V3 — unchanged)
// ============================================================
function computePitcherFatigue(home: any, away: any): number {
  function fatigueScore(p: any): number {
    if (!p) return 0
    let fatigue = 0

    if (p.pitch_count_last != null) {
      if      (p.pitch_count_last >= 110) fatigue += 8
      else if (p.pitch_count_last >= 100) fatigue += 4
      else if (p.pitch_count_last >= 90)  fatigue += 1
    }
    if (p.days_rest != null) {
      if      (p.days_rest <= 3)  fatigue += 6
      else if (p.days_rest === 4) fatigue += 2
      else if (p.days_rest >= 7)  fatigue -= 3
    }
    if (p.season_ip_pace != null) {
      if (p.season_ip_pace > 200) fatigue += 3
      if (p.season_ip_pace > 220) fatigue += 3
    }

    return fatigue
  }

  return Math.max(-100, Math.min(100, (fatigueScore(away) - fatigueScore(home)) * 3))
}

// ============================================================
// HIDDEN: LINEUP CONFIDENCE (reserved — returns 0)
// ============================================================
function computeLineupConfidence(_home: any, _away: any): number {
  return 0
}

// ============================================================
// DATA FETCHERS
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

async function fetchPlatoon(teamId: number) {
  const season = new Date().getFullYear()
  const { data, error } = await supa
    .from('team_platoon_splits')
    .select('vs_lhp_ops, vs_rhp_ops, vs_lhp_obp, vs_rhp_obp, vs_lhp_slg, vs_rhp_slg')
    .eq('team_id', teamId)
    .eq('season', season)
    .single()
  return error ? null : data
}

async function fetchPitcherArsenal(pitcherId: number) {
  const season = new Date().getFullYear()
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('pitch_type, percentage, whiff_percent, hard_hit_percent, est_woba, put_away_percent, ba_against')
    .eq('player_id', pitcherId)
    .eq('season', season)
    .order('percentage', { ascending: false })
  return error ? null : (data ?? null)
}

async function fetchPitcherH2H(pitcherId: number, opposingTeamId: number) {
  const { data, error } = await supa
    .from('pitcher_h2h')
    .select('games, era, innings_pitched, strikeouts, walks, hits, wins, losses')
    .eq('player_id', pitcherId)
    .eq('opponent_team_id', opposingTeamId)
    .eq('season', 9999)
    .single()
  return error ? null : data
}

// ============================================================
// LOG PREDICTION (unchanged — same signature)
// ============================================================
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
  pro_takeaways: any = null,
  fantasy_cards: any = null,
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
    row.summary          = summary
    row.story_lead       = story_lead
    row.narrative        = narrative
    row.narrative_pro    = narrative_pro
    row.home_stories     = home_stories
    row.away_stories     = away_stories
    row.contrarian       = contrarian
    row.pro_takeaways    = pro_takeaways
    row.narrative_generated_at = new Date().toISOString()
  }

  if (streakData !== null) row.streak_data  = streakData
  if (fantasy_cards !== null) row.fantasy_cards = fantasy_cards

  await supa.from('edge_predictions').upsert(row, { onConflict: 'game_pk' })
}