import { createClient } from '@supabase/supabase-js'
import { getParkFactor, parkLeansHitter, parkLeansPitcher } from './parks'
import type { ComponentsRaw } from './matchup-tilt';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
// ============================================================
// SHARED: percentage normalizer
// Some pitcher_stats/team_stats columns store percentages as
// decimals (0.376) and some as whole numbers (37.6) — inconsistent
// across scripts written at different times. Every formula below
// that compares a "_pct" or "_percent" or "_rate" field against a
// decimal threshold (e.g. 0.30) MUST pass it through this first,
// or a whole-number-stored field silently inflates the score by
// ~100x and swamps every other signal. Safe to apply even to
// fields that are already correctly stored as decimals — it's a
// no-op for anything already under 1.
// ============================================================
function normPct(v: number): number {
  return v > 1 ? v / 100 : v
}
// ============================================================
// V6 COMPONENT WEIGHTS
// Key changes vs V5:
//   - Defense:  0.10 → 0.14  (biggest change — Defense is now "Batted-Ball
//               & Defensive Alignment": two new sub-factors, GB-collision
//               (moved from Matchup) and positional-exploit (new), on top
//               of the existing fielding_pct/OAA/framing signals)
//   - Matchup:  0.14 → 0.12  (gave up its GB-collision sub-factor to Defense)
//   - Offense:  0.17 → 0.16  (small trim to help fund Defense's expansion)
//   - Park:     0.08 → 0.07  (small trim, same reason)
//   - SP, Bullpen, Weather, Rest: unchanged — V5 already rebalanced these
// Total = 1.00 exactly — no hidden components (unchanged from V5)
// ============================================================
export const WEIGHTS = {
  starting_pitcher: 0.23,
  bullpen:          0.13,
  offense:          0.16,
  defense:          0.14,
  matchup:          0.12,
  park:             0.07,
  weather:          0.09,
  rest:             0.06,
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
    precipitation_chance?: number   // ← new
  }
}

// Shape of the stored components_raw / what scoring actually needs as input.
// This is the "point-in-time snapshot" contract — both live scoring and the
// backtest replay funnel through this same shape.
export type EdgeComponentsRawInput = {
  home_pitcher: any
  away_pitcher: any
  home_team: any
  away_team: any
  park: any
  weather: any
  home_platoon: any
  away_platoon: any
  home_pitcher_arsenal: any[] | null
  away_pitcher_arsenal: any[] | null
  home_pitcher_h2h: any
  away_pitcher_h2h: any
}

export type ScoredResult = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
}

// ============================================================
// PURE SCORING — no fetching, no side effects. Takes already-fetched
// inputs (either fresh from calculateEdgeScore, or replayed from a
// stored edge_predictions.components_raw row) and produces a score.
// This is the single source of truth for "how do 8 components become
// an Edge Score" — calculateEdgeScore below and scripts/backtest_edge.ts
// both call this, so live scoring and backtesting can never drift apart.
//
// weights defaults to the live WEIGHTS constant but accepts an override —
// needed for the "hybrid: reasoned weights, periodically re-validated with
// backtests" approach, so a weight change can be replayed against real
// history before it ever ships.
// ============================================================
export function scoreFromComponentsRaw(
  raw: EdgeComponentsRawInput,
  weights: typeof WEIGHTS = WEIGHTS,
): ScoredResult {
  const componentsRaw: EdgeComponents = {
    starting_pitcher: computePitcherEdge(raw.home_pitcher, raw.away_pitcher, raw.home_pitcher_arsenal, raw.away_pitcher_arsenal),
    bullpen:          computeBullpenEdge(raw.home_team, raw.away_team),
    offense:          computeOffenseEdge(raw.home_team, raw.away_team, raw.home_platoon, raw.away_platoon, raw.away_pitcher, raw.home_pitcher),
    defense:          computeDefenseEdge(raw.home_team, raw.away_team, raw.home_pitcher, raw.away_pitcher, raw.home_platoon, raw.away_platoon),
    matchup:          computeMatchupEdge(raw.home_pitcher, raw.away_pitcher, raw.home_team, raw.away_team, raw.home_platoon, raw.away_platoon, raw.home_pitcher_arsenal, raw.away_pitcher_arsenal, raw.home_pitcher_h2h, raw.away_pitcher_h2h),
    park:             computeParkEdge(raw.park, raw.home_team, raw.away_team, raw.home_pitcher, raw.away_pitcher),
    weather:          computeWeatherEdge(raw.weather, raw.park, raw.home_team, raw.away_team),
    rest:             computeRestEdge(raw.home_team, raw.away_team),
  }

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

  // Weighted sum — all weight in the visible 8 components, nothing hidden
  let edge_score = 0
  for (const [key, value] of Object.entries(components)) {
    edge_score += value * weights[key as keyof typeof weights]
  }
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

  return { edge_score, predicted_winner, confidence_tier, components }
}

// ============================================================
// MAIN ENTRY POINT — V6
// Fetches live inputs, then delegates all scoring to
// scoreFromComponentsRaw so there's exactly one scoring path.
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

  const raw: EdgeComponentsRawInput = {
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
  }

  const { edge_score, predicted_winner, confidence_tier, components } = scoreFromComponentsRaw(raw)

  return {
    edge_score,
    predicted_winner,
    confidence_tier,
    components,
    components_raw: {
      ...raw,
      _hidden: {},
    },
  }
}

// ============================================================
// COMPONENT 1: STARTING PITCHER (V5 — 19 sub-factors, unchanged in V6)
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
      score += (normPct(p.gb_percent) - 0.43) * 15
    }

    // ── V4: Arsenal-level metrics ──────────────────────

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
      if (meaningfulPitches.length >= 4) score += 3
      else if (meaningfulPitches.length === 3) score += 1
      else if (meaningfulPitches.length <= 1) score -= 2
    }

    // ── V5: Advanced pitcher metrics ─────────────────────────
    // These columns are populated by fetch_pitcher_advanced.py

    // 14. K/BB ratio — command efficiency (elite = 4.0+, league avg ~2.8)
    if (p.k_bb_ratio != null) {
      score += (Number(p.k_bb_ratio) - 2.8) * 2.5
    }

    // 15. Quality start % — are they actually going deep into games?
    // League avg ~50%. Elite starters ~65%+.
    if (p.quality_start_pct != null) {
      score += (Number(p.quality_start_pct) - 0.50) * 12
    }

    // 16. Average exit velocity allowed — lower = better for pitcher
    // League avg ~88.5mph. Every mph matters.
    if (p.avg_exit_velocity != null) {
      score += (88.5 - Number(p.avg_exit_velocity)) * 1.5
    }

// 17. Chase rate (O-swing%) — gets batters to swing at balls
    // League avg ~30%. Elite ~35%+.
    if (p.chase_rate != null) {
      score += (normPct(p.chase_rate) - 0.30) * 25
    }

    // 18. GDP rate — ground into double plays per 9IP
    // Especially valuable in high-leverage situations
    if (p.gdp_rate != null) {
      score += (Number(p.gdp_rate) - 0.80) * 3
    }

    // 19. Swinging strike % — the purest swing-and-miss metric
    // League avg ~11%. Elite ~14%+.
    if (p.swstr_pct != null) {
      const swstrVal = Number(p.swstr_pct)
      // Stored as decimal (0.11) or percentage (11.0) — handle both
      const normalised = swstrVal > 1 ? swstrVal / 100 : swstrVal
      score += (normalised - 0.11) * 40
    }

    return score
  }

  const homeScore = scorePitcher(home, homeArsenal)
  const awayScore = scorePitcher(away, awayArsenal)

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 2: BULLPEN (unchanged in V6)
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
// COMPONENT 3: OFFENSE (unchanged in V6)
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
      score += (0.225 - normPct(team.k_pct)) * 20
    }

    // 5. BB%
    if (team.bb_pct != null) {
      score += (normPct(team.bb_pct) - 0.085) * 25
    }

    // 6. SB success rate
    if (team.stolen_base_pct != null) {
      if      (team.stolen_base_pct > 0.75) score += 2
      else if (team.stolen_base_pct < 0.60) score -= 1
    }

    // ── V4 ──────────────────────────────────────────────

    // 7. Team xwOBA (expected wOBA — better than raw OPS vs luck)
 if (team.xwoba_l30 != null) {
  const LEAGUE_AVG_XWOBA = 0.315
  score += (Number(team.xwoba_l30) - LEAGUE_AVG_XWOBA) * 60
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
    if (team.wrc_plus_l30 != null) {
  score += (Number(team.wrc_plus_l30) - 100) * 0.3
}
    // 11. BABIP regression flag
    //     If BABIP > .330, some luck involved — slight downward regression expected
    //     If BABIP < .270, may be due a bounce-back
    if (team.babip_l30 != null) {
      const babip = Number(team.babip_l30)
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
// COMPONENT 4: BATTED-BALL & DEFENSIVE ALIGNMENT (V7)
// V7 fixes three compounding bugs found when real Savant OAA and pull-
// tendency data first went live (previously oaa/infield_oaa/outfield_oaa
// were mostly null, so none of this ever manifested):
//   1. oaa was triple-counted with infield_oaa/outfield_oaa — oaa IS their
//      sum by construction (fetch_team_defense.py), not a fourth signal.
//      Now uses oaa alone.
//   2. The FB-pitcher/outfield synergy term multiplied real outfield_oaa
//      (range ~±30) with a denominator (/10) sized for the old narrow-
//      range fielding-pct proxy. Rescaled to /40.
//   3. positionalExploit's sign was inverted — it computes "advantage to
//      the BATTING team" but was being ADDED to the FIELDING team's own
//      score, rewarding a team for having an exploitable defense. Now
//      subtracted, as the original code comment always intended.
// The blind *4 multiplier at the end is removed — with sub-terms rescaled
// to real OAA's actual range, a genuinely extreme combined mismatch
// already approaches ±100 without needing amplification, the same design
// pattern every other component in this file already uses.
// These constants are a reasoned starting point, not a proven-optimal
// one — validate against scripts/backtest_edge.ts before trusting them
// for anything beyond "no longer saturates on every game."
// ============================================================
function computeDefenseEdge(
  homeT: any, awayT: any,
  homeP: any, awayP: any,
  homePlatoon: any, awayPlatoon: any,
): number {
  if (!homeT || !awayT) return 0

  function scoreDefense(team: any, pitcher: any): number {
    let score = 0

    // ── Primary signal: fielding% and errors (always populated) ──
    // Fielding %: league avg ~0.984. Elite ~.988, poor ~.979.
    if (team.fielding_pct != null) {
      score += (Number(team.fielding_pct) - 0.984) * 500
    }
    // Errors per game L30: league avg ~0.55
    if (team.errors_per_game_l30 != null) {
      score += (0.55 - Number(team.errors_per_game_l30)) * 15
    }
    // Defensive efficiency: % of balls in play converted to outs
    if (team.defensive_efficiency != null) {
      score += (Number(team.defensive_efficiency) - 0.690) * 80
    }

    // ── Secondary signal: real Statcast OAA/DRS ──────────────
    // V7: oaa alone — it's already infield_oaa + outfield_oaa by
    // construction (fetch_team_defense.py), adding those separately
    // was triple-counting the same underlying signal.
    if (team.oaa != null) score += Number(team.oaa) * 0.45
    if (team.drs != null) score += Number(team.drs) * 0.5

    // ── Catcher framing ───────────────────────────────────────────
    // Extra strikes called = fewer baserunners = run prevention
    if (team.catcher_framing_runs != null) {
      score += Number(team.catcher_framing_runs) * 0.8
    }

    // GB pitcher + good infield = multiplied run prevention
    if (pitcher?.gb_percent && normPct(pitcher.gb_percent) > 0.48 && team.errors_per_game_l30 != null) {
      const gbBonus = (normPct(pitcher.gb_percent) - 0.43) * 100
      const infieldQuality = (0.55 - Number(team.errors_per_game_l30)) * 15
      if (infieldQuality > 0) score += gbBonus * (infieldQuality / 20)
    }
    // FB pitcher + good outfield synergy
    // V7: denominator rescaled 10 → 40 to match real outfield_oaa's
    // actual range (~±30) instead of the old narrow fielding-pct proxy.
    if (pitcher?.fb_percent && normPct(pitcher.fb_percent) > 0.38 && team.outfield_oaa != null) {
      const fbBonus = (normPct(pitcher.fb_percent) - 0.35) * 80
      const outfieldQuality = team.outfield_oaa ?? 0
      if (outfieldQuality > 0) score += fbBonus * (outfieldQuality / 40)
    }

    return score
  }

  // ── batted-ball collision ──────────────────────────────────
  // fieldingPitcher's GB lean × battingTeam's own GB lean. Two GB-heavy
  // profiles colliding compound (suppressed extra-base hits, more DP risk),
  // which favors the pitcher's team. Opposite leans roughly cancel — this
  // deliberately does NOT fire just because the pitcher is a GB specialist;
  // it needs the batting team to also be GB-heavy.
  function battedBallCollision(fieldingPitcher: any, battingTeam: any): number {
    if (fieldingPitcher?.gb_percent == null || battingTeam?.gb_percent_batting == null) return 0
    const pitcherLean = normPct(fieldingPitcher.gb_percent) - 0.43
    const batterLean  = normPct(battingTeam.gb_percent_batting) - 0.43
    return pitcherLean * batterLean * 60
  }

  // ── positional exploit ─────────────────────────────────────
  // Weak-side OAA at the specific outfield spot the opposing lineup's
  // handedness composition actually pulls toward. Returns the ADVANTAGE
  // TO THE BATTING TEAM — callers must subtract this from the fielding
  // team's own score, not add it (V7 fix — see comment above).
  // V7: multiplier rescaled 8 → 2 to match position-level OAA's real
  // range combined with a 30-50% pull rate.
  function positionalExploit(fieldingTeam: any, battingPlatoon: any): number {
    if (!battingPlatoon) return 0
    let exploit = 0
    const pairs: Array<[string, string]> = [
      ['oaa_rf', 'pull_pct_lhb'], // lefty pull hitters target RF
      ['oaa_lf', 'pull_pct_rhb'], // righty pull hitters target LF
    ]
    for (const [oaaKey, pullKey] of pairs) {
      const oaa  = fieldingTeam?.[oaaKey]
      const pull = battingPlatoon?.[pullKey]
      if (oaa != null && pull != null) {
        exploit += -Number(oaa) * normPct(Number(pull)) * 2
      }
    }
    return exploit
  }

  const homeScore =
    scoreDefense(homeT, homeP) +
    battedBallCollision(homeP, awayT) -
    positionalExploit(homeT, awayPlatoon)   // subtract: home's weakness, exploited by away's batters, hurts home

  const awayScore =
    scoreDefense(awayT, awayP) +
    battedBallCollision(awayP, homeT) -
    positionalExploit(awayT, homePlatoon)   // subtract: away's weakness, exploited by home's batters, hurts away

  return Math.max(-100, Math.min(100, homeScore - awayScore))
}

// ============================================================
// COMPONENT 5: MATCHUP (V6 — 6 sub-factors, narrowed from V5's 7)
// V6 change: removed the GB% vs opposing contact style sub-factor — it
// moved to Defense's new battedBallCollision, where it correctly compares
// against the BATTING TEAM's own GB%, not just the offense's OPS.
// This is now purely platoon/pitch-type/H2H — handedness, arsenal fit,
// recent form interaction, and history vs this specific team.
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

    // 2. Pitcher handedness vs lineup BAA splits
    //    (was sub-factor #3 in V5 — GB-collision moved to Defense in V6)
    if (pitcher?.vs_lhb_baa != null && pitcher?.vs_rhb_baa != null) {
      const avgBaa = (pitcher.vs_lhb_baa + pitcher.vs_rhb_baa) / 2
      advantage += (0.245 - avgBaa) * 30
    }

    // 3. Recent form interaction
    if (pitcher?.l3_era != null && offense?.runs_per_game_l30 != null) {
      if (pitcher.l3_era < 3.0 && offense.runs_per_game_l30 < 4.0) advantage += 5
      if (pitcher.l3_era > 5.0 && offense.runs_per_game_l30 > 5.0) advantage -= 5
    }

    // 4. Real platoon OPS split vs pitcher handedness
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

    // 5. H2H: pitcher career record vs this specific team
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

    // 6. Arsenal est_woba vs platoon — does the pitcher's stuff match up?
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
// COMPONENT 6: PARK (unchanged in V6)
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
// COMPONENT 7: WEATHER (V5 — graduated scale, unchanged in V6)
// ============================================================
function computeWeatherEdge(weather: any, park: any, homeT: any, awayT: any): number {
  if (park?.is_dome) return 0
  if (!weather) return 0

  let edge = 0

  const temp = weather.temp_f ?? 72
  edge += (temp - 72) * 0.15

  const windMph = weather.wind_mph ?? 0
  const windDir = weather.wind_dir ?? 'variable'

  if (windDir === 'out') {
    edge += Math.min(12, windMph * 0.45)
  } else if (windDir === 'in') {
    edge -= Math.min(8, windMph * 0.35)
  } else if (windDir === 'cross') {
    edge -= Math.min(3, windMph * 0.15)
  }

  const precip = weather.precipitation_chance ?? weather.precip_chance ?? 0
  if (precip > 10) {
    edge -= (precip / 100) * 8
  }

  return Math.max(-15, Math.min(15, edge))
}
// ============================================================
// COMPONENT 8: REST & TRAVEL (V5, unchanged in V6)
// ============================================================
function computeRestEdge(home: any, away: any): number {
  if (!home || !away) return 0

  let edge = 0

  if (home.days_since_last_game != null && away.days_since_last_game != null) {
    const restDiff = (home.days_since_last_game - away.days_since_last_game) * 3
    edge += Math.max(-9, Math.min(9, restDiff))
  }

  if (away.travel_miles_last != null && away.travel_miles_last > 0) {
    if      (away.travel_miles_last > 2000) edge += 5
    else if (away.travel_miles_last > 1500) edge += 3
    else if (away.travel_miles_last > 800)  edge += 2
    else if (away.travel_miles_last > 400)  edge += 1
  }

  if (away.games_last_10_days != null && away.games_last_10_days >= 9)  edge += 5
  if (home.games_last_10_days != null && home.games_last_10_days >= 9)  edge -= 5

  if (away.consecutive_road_games != null && away.consecutive_road_games >= 7) edge += 3
  else if (away.consecutive_road_games != null && away.consecutive_road_games >= 5) edge += 1

  if (away.day_after_night === true) edge += 2
  if (home.day_after_night === true) edge -= 2

  return Math.max(-15, Math.min(15, edge))
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
    .select('vs_lhp_ops, vs_rhp_ops, vs_lhp_obp, vs_rhp_obp, vs_lhp_slg, vs_rhp_slg, pull_pct_lhb, pull_pct_rhb')
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