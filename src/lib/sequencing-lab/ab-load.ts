// src/lib/sequencing-lab/ab-load.ts
//
// Server only. Reads the at-bat index parts (league_ab_index, written by scripts/build_league_ab_index.py) once, unpacks them and keeps the result in memory for an hour,
// so the matcher in ab-index.ts runs on memory and never scans pitch_events. Returns null when the index has not been built, with a logged reason (no stand-in data).

import { gunzipSync } from 'node:zlib'
import { createAdminClient } from '@/lib/supabase'
import { parseIndex, type AbIndex } from './ab-index'

const TTL = 60 * 60 * 1000
const cache = new Map<number, { at: number; ix: AbIndex }>()

export async function loadAbIndex(season: number): Promise<AbIndex | null> {
  const hit = cache.get(season)
  if (hit && Date.now() - hit.at < TTL) return hit.ix
  const { data, error } = await createAdminClient().from('league_ab_index').select('part, parts, data').eq('season', season).order('part')
  if (error) { console.error('[loadAbIndex] Supabase error:', error.message); return null }
  const rows = (data ?? []) as { part: number; parts: number; data: string }[]
  if (rows.length === 0 || rows.length !== rows[0].parts) { console.error('[loadAbIndex] index missing or incomplete for', season, rows.length); return null }
  try {
    const ix = parseIndex(gunzipSync(Buffer.from(rows.map(r => r.data).join(''), 'base64')))
    cache.set(season, { at: Date.now(), ix })
    return ix
  } catch (err) {
    console.error('[loadAbIndex] could not read the index:', err instanceof Error ? err.message : err)
    return null
  }
}

const clusterCache = new Map<string, { at: number; map: Map<number, number> }>()

/** Batter id -> hitter cluster id for one pitcher hand (hitter_clusters). Empty map, with a logged reason, when the clusters have not been built. */
export async function loadClusterMap(season: number, hand: 'R' | 'L'): Promise<Map<number, number>> {
  const key = `${season}${hand}`
  const hit = clusterCache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.map
  const map = new Map<number, number>()
  const supa = createAdminClient()
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await supa.from('hitter_clusters').select('batter_id, cluster_id').eq('season', season).eq('stand_vs', hand === 'R' ? 'vs RHP' : 'vs LHP').order('batter_id').range(off, off + 999)
    if (error) { console.error('[loadClusterMap] Supabase error:', error.message); return map }
    for (const r of (data ?? []) as { batter_id: number; cluster_id: number }[]) map.set(Number(r.batter_id), Number(r.cluster_id))
    if ((data ?? []).length < 1000) break
  }
  if (map.size === 0) console.error('[loadClusterMap] no hitter clusters stored for', key)
  clusterCache.set(key, { at: Date.now(), map })
  return map
}
