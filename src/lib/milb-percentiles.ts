// src/lib/milb-percentiles.ts
//
// Percentile ranks for a minor leaguer: his season rates against everyone else at the same level and season, from milb_stat_pool (one row per player, filled nightly by
// scripts/compute_milb_stat_pool.py). Only players with at least the site's usual minimum sample are in the pool, and a player below it gets no ranks (empty state, nothing estimated).
// 100 = best, so a stat where lower is better (K% for a hitter, ERA for a pitcher) is flipped before it is ranked.
import { createAdminClient } from '@/lib/supabase'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { log } from '@/lib/log'
import type { LevelKey } from '@/lib/levels'

export type PoolSubject = 'batter' | 'pitcher'
export type MilbRank = { key: string; label: string; value: string; percentile: number }
export type MilbPercentiles = { ranks: MilbRank[]; n: number; poolSize: number; minN: number }

type Def = { key: string; label: string; lowerIsBetter?: boolean; fmt: (v: number) => string }
const dot3 = (v: number) => v.toFixed(3).replace(/^0\./, '.')
const pct1 = (v: number) => `${v.toFixed(1)}%`
const BATTER: Def[] = [
  { key: 'ops', label: 'OPS', fmt: dot3 }, { key: 'avg', label: 'AVG', fmt: dot3 }, { key: 'obp', label: 'OBP', fmt: dot3 }, { key: 'slg', label: 'SLG', fmt: dot3 },
  { key: 'iso', label: 'ISO', fmt: dot3 }, { key: 'bb_pct', label: 'BB%', fmt: pct1 }, { key: 'k_pct', label: 'K%', lowerIsBetter: true, fmt: pct1 },
  { key: 'hr', label: 'HR', fmt: v => String(v) }, { key: 'sb', label: 'SB', fmt: v => String(v) },
]
const PITCHER: Def[] = [
  { key: 'era', label: 'ERA', lowerIsBetter: true, fmt: v => v.toFixed(2) }, { key: 'fip', label: 'FIP', lowerIsBetter: true, fmt: v => v.toFixed(2) },
  { key: 'whip', label: 'WHIP', lowerIsBetter: true, fmt: v => v.toFixed(2) }, { key: 'k_pct', label: 'K%', fmt: pct1 }, { key: 'bb_pct', label: 'BB%', lowerIsBetter: true, fmt: pct1 },
  { key: 'kbb_pct', label: 'K-BB%', fmt: pct1 }, { key: 'hr9', label: 'HR/9', lowerIsBetter: true, fmt: v => v.toFixed(2) },
]

/** Share of the pool this value beats, counting a tie as half: 0 to 100, 100 = best. `values` must include the player's own value. */
export function percentileRank(values: number[], v: number, lowerIsBetter = false): number {
  if (values.length < 2) return 50
  let below = 0, equal = 0
  for (const x of values) { if (x === v) equal++; else if (lowerIsBetter ? x > v : x < v) below++ }
  return Math.round((100 * (below + (equal - 1) / 2)) / (values.length - 1))
}

type PoolRow = { player_id: number; n: number; metrics: Record<string, number> }
const cache = new Map<string, { at: number; rows: PoolRow[] }>()

// The pool is one or two pages of 1,000 rows (PostgREST caps a page there); kept six hours in memory so a page view does not re-read it.
async function loadPool(level: LevelKey, season: number, subject: PoolSubject, minN: number): Promise<PoolRow[] | null> {
  const key = `${level}|${season}|${subject}|${minN}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.rows
  const rows: PoolRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await createAdminClient().from('milb_stat_pool').select('player_id, n, metrics').eq('level', level).eq('season', season).eq('subject', subject).gte('n', minN).order('player_id').range(from, from + 999)
    if (error) { log.error('loadPool', 'Supabase error', error.message); return null }
    rows.push(...((data ?? []) as PoolRow[]))
    if ((data ?? []).length < 1000) break
  }
  if (rows.length) cache.set(key, { at: Date.now(), rows })   // an empty pool (table just created, nightly build not run yet) is not kept, so the first real fill shows up at once
  return rows
}

export async function getMilbPercentiles(level: LevelKey, season: number, subject: PoolSubject, playerId: number): Promise<MilbPercentiles | null> {
  if (level === 'mlb' || level === 'winter') return null   // MLB has its own ranks; the fall/winter leagues have no single pool to rank against
  const minN = subject === 'batter' ? MIN_SAMPLE.batterPercentilePA : MIN_SAMPLE.pitcherPercentileBF
  const pool = await loadPool(level, season, subject, minN)
  const me = pool?.find(r => Number(r.player_id) === playerId)
  if (!pool || !me) return null
  const ranks: MilbRank[] = []
  for (const d of subject === 'batter' ? BATTER : PITCHER) {
    const v = Number(me.metrics[d.key])
    if (me.metrics[d.key] == null || !Number.isFinite(v)) continue
    const vals = pool.map(r => Number(r.metrics[d.key])).filter(Number.isFinite)
    ranks.push({ key: d.key, label: d.label, value: d.fmt(v), percentile: percentileRank(vals, v, d.lowerIsBetter) })
  }
  return { ranks, n: Number(me.n), poolSize: pool.length, minN }
}
