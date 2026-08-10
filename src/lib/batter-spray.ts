/**
 * src/lib/batter-spray.ts
 *
 * Data access for batter_spray (per-batter season balls-in-play coordinates),
 * populated weekly by scripts/fetch_batter_spray.py. One row per batter,
 * `plays` is a JSONB array of every ball in play with its field coordinates
 * and outcome context.
 *
 * Powers the Scout Report's combined-lineup spray density heatmap.
 */
import { createAdminClient } from '@/lib/supabase'

export type SprayPlay = {
  x: number                          // Statcast hc_x — 0..250, ~125 = home plate
  y: number                          // Statcast hc_y — 0..250, ~200 = home plate, lower = deeper
  ev: string | null                  // event: 'single' | 'double' | ... | 'field_out' | ...
  bt: string | null                  // batted-ball type: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup'
  ls: number | null                  // launch speed (exit velocity, mph)
  la: number | null                  // launch angle (degrees)
}

export type BatterSpray = {
  player_id: number
  season: number
  plays: SprayPlay[]
  total_balls_in_play: number
}

/**
 * Returns spray rows for all the given batters in one query. Only batters
 * with data in the current season come back — callers get an array whose
 * length may be less than playerIds.length, which is the honest signal
 * that some lineup batters haven't been backfilled yet.
 */
export async function getLineupSpray(playerIds: number[]): Promise<BatterSpray[]> {
  if (playerIds.length === 0) return []
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('batter_spray')
    .select('*')
    .eq('season', season)
    .in('player_id', playerIds)

  if (error) {
    console.error('[batter-spray] query failed:', error.message)
    return []
  }
  console.log('[batter-spray] requested', playerIds.length, 'players:', playerIds, '→ got', (data ?? []).length, 'rows back')
  return (data as BatterSpray[]) ?? []
}