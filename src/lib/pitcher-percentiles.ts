// Percentile bars for one pitcher vs the full qualified MLB pool — reuses
// getPitcherStatsTable (stats-data.ts) for the league pool and
// computeGroupedPercentiles (percentiles.ts) for the ranking math, same
// infrastructure LineupCompare already uses. No new data source.
//
// Stuff+ and xFIP deliberately NOT included — confirmed during the
// 2026-07-14 pitching data audit that neither is derivable from any
// source this build has access to (both are proprietary trained-model
// outputs; FanGraphs-gated). Whiff%/K%/BB% substituted instead — real
// columns on pitcher_stats, confirmed populated in that same audit.

import { getPitcherStatsTable } from './stats-data'
import { computeGroupedPercentiles } from './percentiles'
import { createAdminClient } from './supabase'
import type { StatColumn } from './stats-columns'

export type PercentileStat = {
  key: string
  label: string
  value: string
  percentile: number | null
  tier: 'below' | 'average' | 'above' | 'elite' | null
}

const PERCENTILE_COLS: StatColumn[] = [
  { key: 'k_pct', label: 'K%', higherIsBetter: true },
  { key: 'whiff_pct', label: 'Whiff%', higherIsBetter: true },
  { key: 'bb_pct', label: 'BB%', higherIsBetter: false },
]

function tierFor(pct: number): PercentileStat['tier'] {
  if (pct >= 90) return 'elite'
  if (pct >= 60) return 'above'
  if (pct >= 30) return 'average'
  return 'below'
}

export async function getPitcherPercentiles(pitcherId: number, season: number): Promise<{
  stats: PercentileStat[]
  qualified: boolean
}> {
  const rows = await getPitcherStatsTable({ season })
  const percentiles = computeGroupedPercentiles(rows, PERCENTILE_COLS, () => 'all')
  const row = rows.find(r => r.id === pitcherId)

  // "Qualified" here means present in the pool at all — getPitcherStatsTable
  // already filters stub rows via minIp. A pitcher missing from `rows`
  // entirely (too few innings) gets flagged unqualified rather than a
  // guessed percentile.
  const qualified = !!row

  const stats: PercentileStat[] = PERCENTILE_COLS.map(col => {
    const rawValue = row?.stats[col.key]
    const pct = row ? percentiles.get(row.id)?.get(col.key) ?? null : null
    return {
      key: col.key,
      label: col.label,
      value: rawValue != null ? `${rawValue.toFixed(1)}%` : '—',
      percentile: pct,
      tier: pct != null ? tierFor(pct) : null,
    }
  })

  // FB velo — pulled separately from pitch_arsenals (four-seam only),
  // since it's not part of the pitcher_stats percentile pool above.
  const supa = createAdminClient()
  const { data: ffRow } = await supa
    .from('pitch_arsenals')
    .select('avg_velocity')
    .eq('player_id', pitcherId)
    .eq('season', season)
    .eq('pitch_type', 'FF')
    .maybeSingle()

  if (ffRow?.avg_velocity != null) {
    stats.push({
      key: 'fb_velo',
      label: 'FB Velo',
      value: `${Number(ffRow.avg_velocity).toFixed(1)} mph`,
      percentile: null, // no league-wide FB-velo percentile pool built — shown as a raw stat, not ranked
      tier: null,
    })
  }

  return { stats, qualified }
}