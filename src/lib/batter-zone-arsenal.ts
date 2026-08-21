/**
 * src/lib/batter-zone-arsenal.ts
 *
 * Data access for batter_zone_arsenal — populated by
 * scripts/fetch_batter_hot_zones.py's aggregate_batter_zone_arsenal
 * (same Statcast pull as batter_hot_zones, no extra fetch). Per pitch
 * type, a 13-zone grid (9 core + 4 chase) of BA/SLG/xwOBA/whiff — the
 * "how should a pitcher attack this batter" table.
 *
 * Same split pattern as lib/hot-zones.ts: 'all' | 'vs_lhp' | 'vs_rhp'.
 */

import { createAdminClient } from '@/lib/supabase'

export type BatterArsenalZoneCell = {
  ba: number | null
  slg: number | null
  xwoba: number | null
  whiff_pct: number | null
  pitches: number
  swings: number
  whiffs: number
  ab: number
  low_sample: boolean
}

export type BatterArsenalPitch = {
  pitch_name: string
  total_pitches: number
  ba: number | null
  slg: number | null
  xwoba: number | null
  whiff_pct: number | null
  zones: Record<string, BatterArsenalZoneCell>   // keys '1'-'9' core, '11'-'14' chase
}

export type BatterZoneArsenal = {
  player_id: number
  player_name: string
  team_id: number | null
  season: number
  split: 'all' | 'vs_lhp' | 'vs_rhp'
  total_pitches: number
  arsenal: Record<string, BatterArsenalPitch>   // keyed by pitch_type code, e.g. 'FF', 'SL'
  updated_at: string | null
}

export async function getBatterZoneArsenal(playerId: number): Promise<Record<string, BatterZoneArsenal>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('batter_zone_arsenal')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, BatterZoneArsenal> = {}
  for (const row of data) {
    result[row.split] = row as BatterZoneArsenal
  }
  return result
}

export async function getLineupZoneArsenal(
  playerIds: number[],
): Promise<Record<number, Record<string, BatterZoneArsenal>>> {
  if (playerIds.length === 0) return {}

  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('batter_zone_arsenal')
    .select('*')
    .in('player_id', playerIds)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<number, Record<string, BatterZoneArsenal>> = {}
  for (const row of data) {
    const id = row.player_id as number
    if (!result[id]) result[id] = {}
    result[id][row.split] = row as BatterZoneArsenal
  }
  return result
}