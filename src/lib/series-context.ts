import { createAdminClient } from './supabase'

export type SeriesContextData = {
series_game_number: number
series_total_games: number
away_team_id: number
away_team_name: string
home_team_id: number
home_team_name: string
away_series_wins: number
home_series_wins: number
series_leader: string | null
series_description: string | null
last_winner: string | null
last_game_margin: number | null
is_series_decider: boolean
away_faces_elimination: boolean
home_faces_elimination: boolean
series_opener_date: string | null
games_played_in_series: number
}

export async function getSeriesContext(
  gamePk: number
): Promise<SeriesContextData | null> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('series_context')
    .select('*')
    .eq('game_pk', gamePk)
    .maybeSingle()

  if (error) {
    console.error('getSeriesContext error:', error.message)
    return null
  }
  return data as SeriesContextData | null
}