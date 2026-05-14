import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EdgePrediction = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: {
    starting_pitcher: number
    bullpen: number
    offense: number
    defense: number
    matchup: number
    park: number
    weather: number
    rest: number
  }
  components_raw?: any | null
  lineups_confirmed: boolean
  updated_at: string
  summary: string | null
  story_lead: string | null
  narrative: string | null
  narrative_pro: string | null
}

// Fetch all today's predictions in one query (for email cron)
export async function getPredictionsForDate(date: string): Promise<Map<number, EdgePrediction>> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('game_pk, edge_score, predicted_winner, confidence_tier, components, components_raw, lineups_confirmed, updated_at, summary, story_lead, narrative, narrative_pro, streak_data')
  if (error || !data) return new Map()

  const map = new Map<number, EdgePrediction>()
  for (const row of data) {
    map.set(row.game_pk, row as EdgePrediction)
  }
  return map
}

/**
 * Get the Edge prediction for a specific game by gamePk.
 * Returns null if no prediction has been logged yet.
 */
export async function getEdgePrediction(gamePk: number): Promise<EdgePrediction | null> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('edge_score, predicted_winner, confidence_tier, components, lineups_confirmed, updated_at, summary, story_lead, narrative, narrative_pro,components_raw')
    .eq('game_pk', gamePk)
    .single()

  if (error || !data) return null
  return data as EdgePrediction
}