/**
 * src/lib/pitcher-sequencing.ts
 *
 * Data access for pitcher_count_tendency and pitcher_pitch_sequencing —
 * populated by scripts/fetch_pitcher_hot_zones.py (same pull as the
 * existing hot-zones/zone-arsenal tables, no extra Statcast request).
 *
 * Same split pattern as lib/hot-zones.ts: 'all' | 'vs_lhb' | 'vs_rhb'.
 */

import { createAdminClient } from '@/lib/supabase'

// ─── Count tendency ───────────────────────────────────────────────────────

export type CountPitchSummary = {
  pitch_type: string
  pitch_name: string
  count_n: number
  pct: number
  top_zone: string | null
  top_zone_label: string | null
}

export type CountTendencyBucket = {
  total_pitches: number
  pitches: CountPitchSummary[]   // sorted by pct descending
  top_pitch: string | null
}

export type PitcherCountTendency = {
  player_id: number
  player_name: string
  team_id: number | null
  season: number
  split: 'all' | 'vs_lhb' | 'vs_rhb'
  counts: Record<string, CountTendencyBucket>   // keys '0-0' .. '3-2'
  updated_at: string | null
}

export async function getPitcherCountTendency(playerId: number): Promise<Record<string, PitcherCountTendency>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitcher_count_tendency')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, PitcherCountTendency> = {}
  for (const row of data) {
    result[row.split] = row as PitcherCountTendency
  }
  return result
}

// ─── Pitch sequencing ─────────────────────────────────────────────────────

export type NextPitchSummary = {
  pitch_type: string
  pitch_name: string
  count: number
  pct: number
}

export type SequencingFromPitch = {
  pitch_name: string
  total_followed: number
  next_pitches: NextPitchSummary[]   // sorted by pct descending
  top_next: string | null
}

export type PitcherPitchSequencing = {
  player_id: number
  player_name: string
  team_id: number | null
  season: number
  split: 'all' | 'vs_lhb' | 'vs_rhb'
  transitions: Record<string, SequencingFromPitch>   // keyed by pitch_type thrown ('FF', 'SL', ...)
  updated_at: string | null
}

export async function getPitcherSequencing(playerId: number): Promise<Record<string, PitcherPitchSequencing>> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitcher_pitch_sequencing')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error || !data) return {}

  const result: Record<string, PitcherPitchSequencing> = {}
  for (const row of data) {
    result[row.split] = row as PitcherPitchSequencing
  }
  return result
}
