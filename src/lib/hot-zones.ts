/**
 * src/lib/hot-zones.ts
 *
 * Data access layer for batter & pitcher hot zones.
 * Reads from `batter_hot_zones` and `pitcher_hot_zones` tables
 * (populated weekly by Python scripts).
 *
 * Used by the HotZone component on game preview pages.
 */

import { createAdminClient } from '@/lib/supabase'
import { cache } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ZoneCell = {
  ba?:         number | null   // batting average (batters)
  slg?:        number | null   // slugging         (batters)
  xwoba?:      number | null   // expected wOBA    (batters)
  pitches?:    number
  swings?:     number
  whiffs?:     number
  ab?:         number
  whiff_pct?:  number | null   // batters: their whiff rate. Pitchers: whiffs induced.

  // Pitcher-only fields
  usage_pct?:   number | null  // % of pitches thrown to this zone
  ba_against?:  number | null  // BA against in this zone
}

export type BatterHotZones = {
  player_id:        number
  player_name:      string
  team_id:          number | null
  season:           number
  split:            'all' | 'vs_lhp' | 'vs_rhp'
  total_pitches:    number
  total_pa:         number
  zones:            Record<string, ZoneCell>   // keys '1' through '9'
  hot_zone_label:   string | null
  cold_zone_label:  string | null
}

export type PitcherHotZones = {
  player_id:        number
  player_name:      string
  team_id:          number | null
  season:           number
  split:            'all' | 'vs_lhb' | 'vs_rhb'
  total_pitches:    number
  zones:            Record<string, ZoneCell>
  go_to_zone_label: string | null
  weak_zone_label:  string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ZONE_LABELS: Record<string, string> = {
  '1': 'high inside',   '2': 'high middle',   '3': 'high outside',
  '4': 'middle inside', '5': 'middle middle', '6': 'middle outside',
  '7': 'low inside',    '8': 'low middle',    '9': 'low outside',
  '11': 'chase up/in',  '12': 'chase up/away',
  '13': 'chase down/in', '14': 'chase down/away',
}
// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetch all 3 splits (all / vs_lhp / vs_rhp) for a batter.
 * Returns a map keyed by split. Empty map if no data.
 */
export const getBatterHotZones = cache(async function getBatterHotZones(playerId: number): Promise<Record<string, BatterHotZones>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('batter_hot_zones')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, BatterHotZones> = {}
  for (const row of data) {
    result[row.split] = row as BatterHotZones
  }
  return result
})

/**
 * Fetch all 3 splits (all / vs_lhb / vs_rhb) for a pitcher.
 */
export const getPitcherHotZones = cache(async function getPitcherHotZones(playerId: number): Promise<Record<string, PitcherHotZones>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitcher_hot_zones')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, PitcherHotZones> = {}
  for (const row of data) {
    result[row.split] = row as PitcherHotZones
  }
  return result
})


// ─── Color helpers (used by the React component) ──────────────────────────────

/**
 * Returns a Tailwind background class based on the metric value.
 * Higher = redder (hot). Lower = bluer (cold). Mid = neutral.
 *
 * For batters: typical xwOBA range is .200 (terrible) to .500 (elite).
 * For BA: range .150 to .350.
 *
 * If value is null, returns a neutral grey class.
 */
export function colorForBatterMetric(value: number | null | undefined, metric: 'xwoba' | 'slg' | 'ba' = 'xwoba'): string {
  if (value === null || value === undefined) return 'bg-stone-200'

  // Different scales per metric
  const ranges = {
    xwoba: { cold: 0.260, mid: 0.330, hot: 0.420 },
    slg:   { cold: 0.330, mid: 0.430, hot: 0.560 },
    ba:    { cold: 0.200, mid: 0.260, hot: 0.320 },
  }
  const r = ranges[metric]

  if (value < r.cold)       return 'bg-blue-300'
  if (value < r.mid - 0.03) return 'bg-blue-200'
  if (value < r.mid + 0.03) return 'bg-stone-200'
  if (value < r.hot - 0.03) return 'bg-orange-300'
  if (value < r.hot)        return 'bg-orange-400'
  return 'bg-red-500'
}

/**
 * For pitchers we color by ba_against (red = vulnerable, blue = dominant)
 * OR by usage_pct (orange = lives here) depending on view mode.
 */
export function colorForPitcherMetric(value: number | null | undefined, mode: 'ba_against' | 'usage_pct' | 'whiff_pct'): string {
  if (value === null || value === undefined) return 'bg-stone-200'

  if (mode === 'ba_against') {
    if (value < 0.180) return 'bg-blue-400'
    if (value < 0.220) return 'bg-blue-300'
    if (value < 0.250) return 'bg-blue-200'
    if (value < 0.270) return 'bg-stone-200'
    if (value < 0.300) return 'bg-orange-300'
    if (value < 0.330) return 'bg-orange-400'
    return 'bg-red-500'
  }

  if (mode === 'usage_pct') {
    // Higher usage = darker orange (where they live)
    if (value < 5)  return 'bg-stone-100'
    if (value < 8)  return 'bg-orange-100'
    if (value < 12) return 'bg-orange-200'
    if (value < 16) return 'bg-orange-300'
    if (value < 20) return 'bg-orange-400'
    return 'bg-orange-500'
  }

  // whiff_pct — higher is better for pitcher
  if (value < 15) return 'bg-stone-100'
  if (value < 22) return 'bg-blue-200'
  if (value < 28) return 'bg-blue-300'
  if (value < 35) return 'bg-blue-400'
  return 'bg-blue-500'
}

/**
 * Format a metric value for display. Returns '—' if null.
 */
export function formatMetric(value: number | null | undefined, kind: 'ba' | 'slg' | 'xwoba' | 'pct'): string {
  if (value === null || value === undefined) return '—'
  if (kind === 'pct')  return `${value.toFixed(1)}%`
  // Baseball avg-style: .312 (no leading zero)
  const fixed = value.toFixed(3)
  return fixed.startsWith('0.') ? fixed.slice(1) : fixed
}