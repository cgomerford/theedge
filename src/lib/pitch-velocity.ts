/**
 * src/lib/pitch-velocity.ts
 *
 * Data access for pitch_velocity_range (per-pitch-type min/max/avg velocity),
 * populated weekly by scripts/fetch_pitch_velocity_range.py via raw
 * pitch-level Statcast data — this is the piece no Savant leaderboard CSV
 * exposes (confirmed directly against the pitch-movement column picker,
 * which only offers season averages, no min/max).
 */
import { createAdminClient } from '@/lib/supabase'

export type PitchVelocityRange = {
  player_id: number
  season: number
  pitch_type: string
  pitch_name: string | null
  pitch_count: number
  velo_min: number
  velo_max: number
  velo_avg: number
}

/**
 * Returns a map keyed by pitch_type code (e.g. 'FF', 'SL') for a pitcher's
 * current season. Empty map if the weekly script hasn't run for this player
 * yet — callers should treat a missing entry as "range not available", not
 * as zero, and fall back to the existing avg-only display.
 */
export async function getPitchVelocityRanges(playerId: number): Promise<Record<string, PitchVelocityRange>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitch_velocity_range')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, PitchVelocityRange> = {}
  for (const row of data) {
    result[row.pitch_type] = row as PitchVelocityRange
  }
  return result
}