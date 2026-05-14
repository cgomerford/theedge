import { createClient } from '@supabase/supabase-js'
import { getParkFactor, parkLeansHitter, parkLeansPitcher } from './parks'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// COMPONENT WEIGHTS
// V1 weights — tune post-launch with live data
// ============================================================
const WEIGHTS = {
  starting_pitcher: 0.22,    // up from 0.20 — biggest single factor
  bullpen: 0.15,
  offense: 0.18,             // up from 0.15
  defense: 0.05,             // DOWN from 0.15 — weak proxy in V1
  matchup: 0.15,
  park: 0.10,
  weather: 0.07,
  rest: 0.08,                // up from 0.03 — defense weight redistributed here
}
// Total: 1.00

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
  edge_score: number              // -100 to +100
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
  components_raw: any       
  drilldown?: {
    away_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    home_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    away_form?: { last_10_wins: number; last_10_losses: number; bullpen_era: number | null; bullpen_ip_yesterday: number | null } | null
    home_form?: { last_10_wins: number; last_10_losses: number; bullpen_era: number | null; bullpen_ip_yesterday: number | null } | null
  }      // Raw inputs for transparency
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
    wind_dir: string  // 'in' | 'out' | 'cross'
  }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function calculateEdgeScore(inputs: GameInputs): Promise<EdgeScoreResult> {
  // Fetch all needed data in parallel
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

 const componentsRaw: EdgeComponents = {
  starting_pitcher: computePitcherEdge(homePitcher, awayPitcher),
  bullpen: computeBullpenEdge(homeTeam, awayTeam),
  offense: computeOffenseEdge(homeTeam, awayTeam),
  defense: computeDefenseEdge(homeTeam, awayTeam),
  matchup: computeMatchupEdge(homePitcher, awayPitcher, homeTeam, awayTeam),
  park: computeParkEdge(park, homeTeam, awayTeam, homePitcher, awayPitcher),
  weather: computeWeatherEdge(inputs.weather, park, homeTeam, awayTeam),
  rest: computeRestEdge(homeTeam, awayTeam),
}

// Round each component to 1 decimal for clean display
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
  

  // Weighted sum
  let edge_score = 0
  for (const [key, value] of Object.entries(components)) {
    edge_score += value * WEIGHTS[key as keyof EdgeComponents]
  }

  // Add home field advantage (built into the +/- direction)
  edge_score += 4  // ~4 pt baseline HFA in MLB

  // Clamp to range
  edge_score = Math.max(-100, Math.min(100, edge_score))
  edge_score = Math.round(edge_score * 10) / 10

  // Determine winner + confidence
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
    },
  }
}

// ============================================================
// COMPONENT CALCULATIONS
// ============================================================

function computePitcherEdge(home: any, away: any): number {
  // V1 approach: handle partial data gracefully
  // If both missing → 0
  // If one missing → use the other against league average proxy
  
  if (!home && !away) return 0
  
  // Use FIP if available, else ERA, else null
  const homeQuality = home?.fip ?? home?.era ?? null
  const awayQuality = away?.fip ?? away?.era ?? null
  
  // League average proxy
  const LEAGUE_AVG = 4.10
  
  // If both have data, compare directly
  if (homeQuality !== null && awayQuality !== null) {
    const diff = awayQuality - homeQuality
    // Lower is better, so positive diff = home pitcher better
    return Math.max(-100, Math.min(100, diff * 18))
  }
  
  // If only home has data, compare against league average
  if (homeQuality !== null) {
    const diff = LEAGUE_AVG - homeQuality
    return Math.max(-100, Math.min(100, diff * 12))  // half-confidence
  }
  
  // If only away has data, compare against league average
  if (awayQuality !== null) {
    const diff = awayQuality - LEAGUE_AVG
    return Math.max(-100, Math.min(100, diff * 12))
  }
  
  return 0
}

function computeBullpenEdge(home: any, away: any): number {
  if (!home || !away) return 0
  if (!home.bullpen_era || !away.bullpen_era) return 0
  
  let edge = (away.bullpen_era - home.bullpen_era) * 8
  
  // Availability adjustments
  let homePenalty = 0
  let awayPenalty = 0
  if (home.bullpen_innings_yesterday >= 5) homePenalty = 8
  if (away.bullpen_innings_yesterday >= 5) awayPenalty = 8
  
  edge += awayPenalty - homePenalty
  return Math.max(-100, Math.min(100, edge))
}

function computeOffenseEdge(home: any, away: any): number {
  if (!home || !away) return 0
  if (!home.runs_per_game_l30 || !away.runs_per_game_l30) return 0
  
  const rpg_diff = home.runs_per_game_l30 - away.runs_per_game_l30
  // 1 R/G difference = ~15 pts
  let edge = rpg_diff * 15
  
  // Bonus from OPS if available
  if (home.ops_l30 && away.ops_l30) {
    const ops_diff = home.ops_l30 - away.ops_l30
    edge += ops_diff * 60  // .100 OPS gap = 6 pts
  }
  
  return Math.max(-100, Math.min(100, edge))
}

function computeDefenseEdge(home: any, away: any): number {
  // V1 — proxy is weak, weight is low (0.05)
  // Post-launch: replace with OAA + DRS from Statcast/FanGraphs
  if (!home?.oaa || !away?.oaa) return 0  // returns 0 in V1 since we have no OAA
  
  return Math.max(-100, Math.min(100, (home.oaa - away.oaa) * 5))
}

function computeMatchupEdge(homeP: any, awayP: any, homeT: any, awayT: any): number {
  // Need at least one pitcher AND both teams
  if (!homeT || !awayT) return 0
  if (!homeP && !awayP) return 0
  
  const LEAGUE_AVG_K9 = 8.5
  const LEAGUE_AVG_RPG = 4.5
  
  let home_advantage = 0
  let away_advantage = 0
  
  // Home pitcher's matchup vs away offense
  if (homeP?.k_per_9 && awayT.runs_per_game_l30) {
    const home_pitcher_quality = homeP.k_per_9 - LEAGUE_AVG_K9
    const away_offense_quality = awayT.runs_per_game_l30 - LEAGUE_AVG_RPG
    home_advantage = home_pitcher_quality * away_offense_quality * 2
  }
  
  // Away pitcher's matchup vs home offense
  if (awayP?.k_per_9 && homeT.runs_per_game_l30) {
    const away_pitcher_quality = awayP.k_per_9 - LEAGUE_AVG_K9
    const home_offense_quality = homeT.runs_per_game_l30 - LEAGUE_AVG_RPG
    away_advantage = away_pitcher_quality * home_offense_quality * 2
  }
  
  return Math.max(-100, Math.min(100, home_advantage - away_advantage))
}

function computeParkEdge(park: any, homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!park || !homeT || !awayT) return 0
  
  // Hitter park: favors team with better offense
  if (parkLeansHitter(park)) {
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      return homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 6 : -6
    }
  }
  
  // Pitcher park: favors team with better pitching
  if (parkLeansPitcher(park)) {
    if (homeP?.fip && awayP?.fip) {
      return homeP.fip < awayP.fip ? 5 : -5
    }
  }
  
  return 0
}

function computeWeatherEdge(weather: any, park: any, homeT: any, awayT: any): number {
  // Domes ignore weather
  if (park?.is_dome) return 0
  if (!weather) return 0
  if (!homeT || !awayT) return 0
  
  // Wind out + warm = offense friendly
  if (weather.wind_dir === 'out' && weather.wind_mph > 8 && weather.temp_f > 70) {
    return homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 6 : -6
  }
  
  // Wind in + cold = pitcher friendly
  if (weather.wind_dir === 'in' && weather.wind_mph > 8) {
    return -3  // slight pitcher edge regardless of team
  }
  
  // Cold suppresses offense
  if (weather.temp_f < 50) {
    return -2
  }
  
  return 0
}

function computeRestEdge(home: any, away: any): number {
  // V1 simple proxy: heavy bullpen usage yesterday creates rest disadvantage
  if (!home || !away) return 0
  
  let edge = 0
  if (home.bullpen_innings_yesterday >= 5) edge -= 4
  if (away.bullpen_innings_yesterday >= 5) edge += 4
  return edge
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
// PREDICTION LOGGING
// Drop-in replacement for the logPrediction function in src/lib/edge.ts
// Changes: added narrative_pro param + writes to edge_predictions.narrative_pro
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
  narrative_pro: string | null = null,   // NEW: Pro tier narrative
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
    components_raw: result.components_raw,  // ADD THIS
    lineups_confirmed: lineupsConfirmed,
    updated_at: new Date().toISOString(),
  }
  if (summary !== null) {
    row.summary = summary
    row.story_lead = story_lead
    row.narrative = narrative
    row.narrative_generated_at = new Date().toISOString()
  }
 
  // Write Pro narrative when present — null means "keep existing" via upsert
  if (narrative_pro !== null) {
    row.narrative_pro = narrative_pro
  }
 
  if (streakData !== null) {
    row.streak_data = streakData
  }
 
  await supa.from('edge_predictions').upsert(row, { onConflict: 'game_pk' })
}