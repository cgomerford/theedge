// src/lib/playerCompare.ts
//
// One job: hot-zone heatmaps. Everything else I'd have put here (radar
// scaling, season stats) already exists via /api/lab/percentile and
// player-trend — no reason to duplicate a second source of truth.
//
// ⚠ VERIFY BEFORE RELYING ON THIS: fetchHotZones-equivalent below GUESSES
// the stored shape of the `zones` JSONB column from fetch_batter_hot_zones.py's
// docstring (ba/slg/xwoba/whiff_pct per zone), falling back to raw sums
// if pre-aggregated fields aren't there. Paste one real row from
// `batter_hot_zones` if the grid comes back empty.

import { createAdminClient } from '@/lib/supabase'

export type SubjectType = 'batter' | 'pitcher'

export type HotZoneCell = {
  zone: number
  label: string
  avg: number | null
  slg: number | null
  xwoba: number | null
  whiffPct: number | null
  sampleSize: number
}

const ZONE_LABELS: Record<number, string> = {
  1: 'High In', 2: 'High Mid', 3: 'High Out',
  4: 'Mid In',  5: 'Mid Mid',  6: 'Mid Out',
  7: 'Low In',  8: 'Low Mid',  9: 'Low Out',
}

const MIN_ZONE_SAMPLE = 8 // same honesty threshold spirit as MIN_AB_PER_ZONE in compute_regression_watch.py

export async function getPlayerHotZones(
  playerId: number,
  subjectType: SubjectType,
): Promise<{ cells: HotZoneCell[] | null; note: string }> {
  const table = subjectType === 'batter' ? 'batter_hot_zones' : 'pitcher_hot_zones'
  const supa = createAdminClient()
  const { data } = await supa
    .from(table)
    .select('zones, total_pa')
    .eq('player_id', playerId)
    .eq('split', 'all')
    .maybeSingle()

  if (!data?.zones) {
    return { cells: null, note: 'No hot-zone data yet — needs a full week of Statcast tracking.' }
  }

  const zones = data.zones as Record<string, any>
  const cells: HotZoneCell[] = []
  let anyAboveMin = false

  for (let z = 1; z <= 9; z++) {
    const c = zones[String(z)] ?? {}
    const ab = Number(c.ab ?? 0)
    const swings = Number(c.swings ?? 0)
    if (ab >= MIN_ZONE_SAMPLE) anyAboveMin = true

    const avg = ab >= MIN_ZONE_SAMPLE ? (c.ba ?? c.avg ?? (c.hits != null ? c.hits / ab : null)) : null
    const slg = ab >= MIN_ZONE_SAMPLE ? (c.slg ?? (c.total_bases != null ? c.total_bases / ab : null)) : null
    const xwoba = ab >= MIN_ZONE_SAMPLE ? (c.xwoba ?? (c.xwoba_count > 0 ? c.xwoba_sum / c.xwoba_count : null)) : null
    const whiffPct = swings >= MIN_ZONE_SAMPLE ? (c.whiff_pct ?? (c.whiffs != null ? (c.whiffs / swings) * 100 : null)) : null

    cells.push({
      zone: z,
      label: ZONE_LABELS[z],
      avg: avg != null ? Number(Number(avg).toFixed(3)) : null,
      slg: slg != null ? Number(Number(slg).toFixed(3)) : null,
      xwoba: xwoba != null ? Number(Number(xwoba).toFixed(3)) : null,
      whiffPct: whiffPct != null ? Number(Number(whiffPct).toFixed(1)) : null,
      sampleSize: ab,
    })
  }

  return {
    cells: anyAboveMin ? cells : null,
    note: anyAboveMin
      ? `Zones under ${MIN_ZONE_SAMPLE} AB are greyed out — too small a sample to trust.`
      : 'Sample size too small across every zone this season yet.',
  }
}