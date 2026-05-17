import { createClient } from '@supabase/supabase-js'
import { getParkFactor, parkLeansHitter, parkLeansPitcher } from './parks'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// COMPONENT WEIGHTS
// V2 weights — tuned to prioritize SP, Matchup, and Defense synergy
// ============================================================
const WEIGHTS = {
  starting_pitcher: 0.25,    // up from 0.22 — biggest single factor
  bullpen: 0.15,
  offense: 0.20,             // up from 0.18
  defense: 0.10,             // up from 0.05 — synergistic with GB pitchers
  matchup: 0.15,
  park: 0.05,                // down from 0.10 — baked into advanced stats
  weather: 0.05,             // down from 0.07 — only extremes matter
  rest: 0.05,                // down from 0.08
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
    defense: computeDefenseEdge(homeTeam, awayTeam, homePitcher, awayPitcher),
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
  if (!home && !away) return 0
  
  // Use FIP if available, else ERA, else null
  const homeQuality = home?.fip ?? home?.era ?? null
  const awayQuality = away?.fip ?? away?.era ?? null
  
  const LEAGUE_AVG = 4.10
  
  if (homeQuality !== null && awayQuality !== null) {
    const diff = awayQuality - homeQuality
    return Math.max(-100, Math.min(100, diff * 18))
  }
  
  if (homeQuality !== null) {
    const diff = LEAGUE_AVG - homeQuality
    return Math.max(-100, Math.min(100, diff * 12))
  }
  
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
  let edge = rpg_diff * 15
  
  if (home.ops_l30 && away.ops_l30) {
    const ops_diff = home.ops_l30 - away.ops_l30
    edge += ops_diff * 60
  }
  
  return Math.max(-100, Math.min(100, edge))
}

function computeDefenseEdge(homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!homeT?.infield_oaa || !awayT?.infield_oaa) return 0
  
  const calculateDefenseScore = (team: any, pitcher: any) => {
    // Base defense score using Outs Above Average and DP%
    let defScore = (team.infield_oaa * 2) + ((team.outfield_oaa || 0) * 1)
    
    // Double Play Conversion modifier
    if (team.dp_conversion_rate) {
       const dpEdge = (team.dp_conversion_rate - 0.10) * 100 // assuming league avg is ~10%
       defScore += dpEdge
    }

    // Pitcher Synergy: Multiply infield value by how often the pitcher uses them
    if (pitcher?.gb_percent) {
        const gbMultiplier = pitcher.gb_percent / 0.43 // Normalizes to league average
        defScore = defScore * gbMultiplier
    }
    
    return defScore
  }

  const homeDef = calculateDefenseScore(homeT, homeP)
  const awayDef = calculateDefenseScore(awayT, awayP)
  
  return Math.max(-100, Math.min(100, (homeDef - awayDef) * 8))
}

function computeMatchupEdge(homeP: any, awayP: any, homeT: any, awayT: any): number {
  if (!homeT || !awayT || (!homeP && !awayP)) return 0
  
  const LEAGUE_AVG_K9 = 8.5
  const LEAGUE_AVG_RPG = 4.5
  const LEAGUE_AVG_GB_PCT = 0.43 // 43%
  
  const calculateSynergy = (pitcher: any, offense: any) => {
    let advantage = 0
    
    // 1. K/9 vs Runs/Game
    if (pitcher?.k_per_9 && offense?.runs_per_game_l30) {
      advantage += (pitcher.k_per_9 - LEAGUE_AVG_K9) * (offense.runs_per_game_l30 - LEAGUE_AVG_RPG) * 2
    }

    // 2. Groundball Synergy
    if (pitcher?.gb_percent && offense?.gb_percent) {
      const gbPitcherEdge = pitcher.gb_percent - LEAGUE_AVG_GB_PCT
      const gbHitterFlaw = offense.gb_percent - LEAGUE_AVG_GB_PCT
      
      if (gbPitcherEdge > 0 && gbHitterFlaw > 0) {
          advantage += (gbPitcherEdge * 100) * (gbHitterFlaw * 100) * 0.5 
      }
      else if (gbPitcherEdge < 0 && gbHitterFlaw < 0) {
          advantage -= Math.abs(gbPitcherEdge * 100) * Math.abs(gbHitterFlaw * 100) * 0.3
      }
    }
    
    return advantage
  }

  const home_advantage = calculateSynergy(homeP, awayT)
  const away_advantage = calculateSynergy(awayP, homeT)
  
  return Math.max(-100, Math.min(100, home_advantage - away_advantage))
}

function computeParkEdge(park: any, homeT: any, awayT: any, homeP: any, awayP: any): number {
  if (!park || !homeT || !awayT) return 0
  
  if (parkLeansHitter(park)) {
    if (homeT.runs_per_game_l30 && awayT.runs_per_game_l30) {
      return homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 6 : -6
    }
  }
  
  if (parkLeansPitcher(park)) {
    if (homeP?.fip && awayP?.fip) {
      return homeP.fip < awayP.fip ? 5 : -5
    }
  }
  
  return 0
}

function computeWeatherEdge(weather: any, park: any, homeT: any, awayT: any): number {
  if (park?.is_dome) return 0
  if (!weather) return 0
  if (!homeT || !awayT) return 0
  
  if (weather.wind_dir === 'out' && weather.wind_mph > 8 && weather.temp_f > 70) {
    return homeT.runs_per_game_l30 > awayT.runs_per_game_l30 ? 6 : -6
  }
  
  if (weather.wind_dir === 'in' && weather.wind_mph > 8) {
    return -3
  }
  
  if (weather.temp_f < 50) {
    return -2
  }
  
  return 0
}

function computeRestEdge(home: any, away: any): number {
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