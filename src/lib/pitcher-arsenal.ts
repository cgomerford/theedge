/**
 * src/lib/pitcher-arsenal.ts
 *
 * Data access for the per-pitch-type zone arsenal (`pitcher_zone_arsenal`),
 * populated weekly by scripts/fetch_pitcher_hot_zones.py alongside
 * pitcher_hot_zones.
 *
 * Powers the "Tale of the Tape" component — a pitcher's arsenal staged against
 * the most dangerous bat in the opposing lineup, with a per-pitch zone overlay.
 *
 * Companion to hot-zones.ts. Same key shape (player_id, season, split).
 */

import { createAdminClient } from '@/lib/supabase'
import { getBatterHotZones, type BatterHotZones, type ZoneCell } from '@/lib/hot-zones'
import { cache } from 'react'
// ─── Types ────────────────────────────────────────────────────────────────────

export type ArsenalZoneCell = {
  usage_pct:   number | null   // % of THIS pitch thrown to this zone
  ba_against:  number | null
  whiff_pct:   number | null
  pitches:     number
  swings:      number
  whiffs:      number
  ab:          number
  low_sample:  boolean         // true when under MIN_PITCHES_PER_ZONE — fade in UI
}

export type ArsenalPitch = {
  pitch_name:    string        // human label: "4-seam", "Slider", ...
  usage_pct:     number | null // % of this split's pitches that are this type
  avg_velo:      number | null
  total_pitches: number
  zones:         Record<string, ArsenalZoneCell>  // keys '1'..'9'
}

export type PitcherZoneArsenal = {
  player_id:     number
  player_name:   string
  team_id:       number | null
  season:        number
  split:         'all' | 'vs_lhb' | 'vs_rhb'
  total_pitches: number
  arsenal:       Record<string, ArsenalPitch>     // keyed by pitch code: FF, SL, ...
}

// A single lineup batter as the game page already shapes them.
export type LineupBatter = {
  player_id:   number
  player_name: string
  bat_side?:   string | null   // 'L' | 'R' | 'S'
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetch all 3 splits (all / vs_lhb / vs_rhb) for a pitcher's zone arsenal.
 * Returns a map keyed by split. Empty map if no data.
 */
export const getPitcherZoneArsenal = cache(async function getPitcherZoneArsenal(
  playerId: number,
): Promise<Record<string, PitcherZoneArsenal>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitcher_zone_arsenal')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

const result: Record<string, PitcherZoneArsenal> = {}
  for (const row of data) {
    result[row.split] = row as PitcherZoneArsenal
  }
  return result
})

/**
 * Given an opposing lineup, find the most dangerous bat by overall xwOBA
 * (the 'all' split, middle-middle as the single-number proxy when no aggregate
 * is stored). Returns the batter plus their hot-zone splits, or null if none of
 * the lineup has zone data yet.
 *
 * "Most dangerous" = highest peak xwOBA across their zones in the 'all' split.
 * Peak rather than mean: we want the hitter with the scariest single location,
 * because that's the bat the pitcher actually has to navigate around.
 */
export async function getMostDangerousBat(
  lineup: LineupBatter[] | null | undefined,
): Promise<{ batter: LineupBatter; zones: Record<string, BatterHotZones> } | null> {
  if (!lineup || lineup.length === 0) return null

  // Fetch zone data for every batter in parallel.
  const fetched = await Promise.all(
    lineup.map(async (b) => ({
      batter: b,
      zones: await getBatterHotZones(b.player_id),
    })),
  )

  let best: { batter: LineupBatter; zones: Record<string, BatterHotZones>; peak: number } | null = null

  for (const entry of fetched) {
    const all = entry.zones['all']
    if (!all || !all.zones) continue

    let peak = -1
    for (const z of Object.values(all.zones) as ZoneCell[]) {
      const v = z.xwoba
      if (typeof v === 'number' && v > peak) peak = v
    }
    if (peak < 0) continue

    if (best === null || peak > best.peak) {
      best = { batter: entry.batter, zones: entry.zones, peak }
    }
  }

  if (!best) return null
  return { batter: best.batter, zones: best.zones }
}

// ─── Tilt math (shared with the component) ─────────────────────────────────────

// League baselines. TODO: refresh weekly from a season-constant rather than
// hardcoding, so tilt doesn't drift as the run environment shifts.
export const LG_XWOBA = 0.320
export const LG_BA = 0.245
export const LG_WHIFF_PCT = 25.0

/**
 * Net tilt for one zone, for a given pitch (or the blended full mix).
 * Positive = pitcher wins the zone; negative = hitter wins it.
 * Weighted by how often the pitcher throws there — a zone he avoids matters
 * less regardless of who'd win it.
 */
export function netTilt(
  hitterXwoba: number | null | undefined,
  pitcherBaAgainst: number | null | undefined,
  pitcherUsagePct: number | null | undefined,
  pitcherWhiffPct?: number | null,
): number {
  const hx = typeof hitterXwoba === 'number' ? hitterXwoba : LG_XWOBA
  const pb = typeof pitcherBaAgainst === 'number' ? pitcherBaAgainst : LG_BA
  const use = typeof pitcherUsagePct === 'number' ? pitcherUsagePct : 0

  const hitterThreat = (hx - LG_XWOBA) / LG_XWOBA

  const pitcherHoldBa = (LG_BA - pb) / LG_BA
  let pitcherHold = pitcherHoldBa
  if (typeof pitcherWhiffPct === 'number') {
    const pitcherHoldWhiff = (pitcherWhiffPct - LG_WHIFF_PCT) / LG_WHIFF_PCT
    pitcherHold = pitcherHoldBa * 0.6 + pitcherHoldWhiff * 0.4
  }

  const usageWeight = 0.5 + (use / 100) * 1.0
  return (pitcherHold - hitterThreat) * usageWeight
}