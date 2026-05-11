import { createAdminClient } from './supabase'

export type PitchArsenalEntry = {
  pitch_type: string
  pitch_name: string
  count: number
  percentage: number
  avg_velocity: number | null
  whiff_percent: number | null
  k_percent: number | null
  ba_against: number | null
  est_woba: number | null
  hard_hit_percent: number | null
}

export async function getPitcherArsenal(playerId: number): Promise<PitchArsenalEntry[]> {
  const supa = createAdminClient()
  const season = new Date().getFullYear()
  
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, count, percentage, avg_velocity, whiff_percent, k_percent, ba_against, est_woba, hard_hit_percent')
    .eq('player_id', playerId)
    .eq('season', season)
    .order('percentage', { ascending: false })
  
  if (error || !data) return []
  return data as PitchArsenalEntry[]
}