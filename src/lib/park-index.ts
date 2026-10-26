// x9Lab park index (see supabase/migrations/20261028100000_park_index.sql).
// Returns null until the table exists and has a row for the venue; callers show PendingBlock("Park index").
import { createAdminClient } from '@/lib/supabase'

export type ParkIndex = {
  venueId: number
  index: number
  homeGames: number
  roadGames: number
  homeRpg: number
  roadRpg: number
  seasons: string
  pct: number | null  // 0-100: share of parks with an index at or below this one (100 = highest-scoring park)
}

export async function getParkIndex(venueId: number | null | undefined): Promise<ParkIndex | null> {
  if (!venueId) return null
  const { data, error } = await createAdminClient()
    .from('park_index')
    .select('venue_id, seasons, home_rpg, road_rpg, index, home_games, road_games')
    .eq('venue_id', venueId)
    .maybeSingle()
  if (error) {
    // Missing table is expected until the migration is run.
    console.error('[getParkIndex] Supabase error:', error.message)
    return null
  }
  if (!data) return null
  const d = data as Record<string, unknown>
  const all = await createAdminClient().from('park_index').select('index')
  const idx = ((all.data ?? []) as { index: number | string }[]).map(r => Number(r.index))
  const pct = idx.length >= 2 ? Math.round((idx.filter(v => v <= Number(d.index)).length / idx.length) * 100) : null
  return {
    venueId: Number(d.venue_id),
    index: Number(d.index),
    homeGames: Number(d.home_games),
    roadGames: Number(d.road_games),
    homeRpg: Number(d.home_rpg),
    roadRpg: Number(d.road_rpg),
    seasons: String(d.seasons),
    pct,
  }
}

// ── Hit heatmap data (table park_hit_map, filled by scripts/compute-park-hits.ts) ──
export type ParkHitMap = { venueId: number; seasons: string; nHits: number; through: string; points: number[] }

export async function getParkHitMap(venueId: number | null | undefined): Promise<ParkHitMap | null> {
  if (!venueId) return null
  const { data, error } = await createAdminClient().from('park_hit_map').select('venue_id, seasons, n_hits, through, points').eq('venue_id', venueId).maybeSingle()
  if (error) { console.error('[getParkHitMap] Supabase error:', error.message); return null }
  if (!data) return null
  const d = data as Record<string, unknown>
  return { venueId: Number(d.venue_id), seasons: String(d.seasons), nHits: Number(d.n_hits), through: String(d.through), points: (d.points as number[]).map(Number) }
}
