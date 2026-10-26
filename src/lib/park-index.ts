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

// ── Hits at this park vs the other parks (table park_hit_map, filled by scripts/compute-park-hits.ts) ──
export type HitKind = 'all' | 'single' | 'double' | 'triple' | 'hr'
export type ParkHitSummary = {
  seasons: string; through: string; games: number
  kinds: Record<HitKind, { n: number; perGame: number; rank: number; of: number }>
  direction: { left: number; center: number; right: number }
}

export async function getParkHitSummary(venueId: number | null | undefined): Promise<ParkHitSummary | null> {
  if (!venueId) return null
  const { data, error } = await createAdminClient()
    .from('park_hit_map')
    .select('venue_id, seasons, through, n_hits, n_games, n_single, n_double, n_triple, n_hr, n_left, n_center, n_right')
  if (error) { console.error('[getParkHitSummary] Supabase error:', error.message); return null }
  type R = { venue_id: number; seasons: string; through: string; n_hits: number; n_games: number | null; n_single: number | null; n_double: number | null; n_triple: number | null; n_hr: number | null; n_left: number | null; n_center: number | null; n_right: number | null }
  const rows = ((data ?? []) as R[]).filter(r => Number(r.n_games) > 0)
  const mine = rows.find(r => Number(r.venue_id) === venueId)
  if (!mine) return null
  const val = (r: R, k: HitKind) => Number(k === 'all' ? r.n_hits : k === 'single' ? r.n_single : k === 'double' ? r.n_double : k === 'triple' ? r.n_triple : r.n_hr)
  const kinds = {} as ParkHitSummary['kinds']
  for (const k of ['all', 'single', 'double', 'triple', 'hr'] as HitKind[]) {
    const rate = (r: R) => val(r, k) / Number(r.n_games)
    kinds[k] = { n: val(mine, k), perGame: rate(mine), rank: rows.filter(r => rate(r) > rate(mine)).length + 1, of: rows.length }
  }
  return { seasons: mine.seasons, through: String(mine.through), games: Number(mine.n_games), kinds, direction: { left: Number(mine.n_left), center: Number(mine.n_center), right: Number(mine.n_right) } }
}
