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
  lineups_confirmed: boolean
  updated_at: string
  summary: string | null
  narrative: string | null
}

/**
 * Get the Edge prediction for a specific game by gamePk.
 * Returns null if no prediction has been logged yet.
 */
export async function getEdgePrediction(gamePk: number): Promise<EdgePrediction | null> {
  const { data, error } = await supa
  .from('edge_predictions')
  .select('edge_score, predicted_winner, confidence_tier, components, lineups_confirmed, updated_at, summary, narrative')
  .eq('game_pk', gamePk)
  .single()

  if (error || !data) return null
  return data as EdgePrediction
}