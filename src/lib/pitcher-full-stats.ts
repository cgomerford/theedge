// Real TTO/two-strike/first-pitch data + movement physics, straight from
// Supabase — populated by fetch_pitcher_tto_splits.py and
// fetch_pitch_arsenals.py / fetch_pitch_velocity_movement.py.
//
// 2026-08-09: tto1_era/tto2_era/tto3_era removed from this file's scope.
// Those columns were confirmed to hold xwOBA values mislabeled as ERA,
// computed by a pybaseball/Statcast pipeline found to undercount plate
// appearances by ~30%+ league-wide. Replaced by tto1_woba/tto2_woba/
// tto3_woba, populated by fetch_pitcher_tto_splits_v2.py, which sources
// from MLB Stats API play-by-play and self-verifies against each
// pitcher's real season battersFaced before writing anything. A null
// tto*_woba here means either the pitcher hasn't been processed yet by
// the new script, or their computed PA didn't reconcile closely enough
// with the real battersFaced to trust — not a display bug.
//
// Also 2026-08-09: Postgres `numeric` columns come back from Supabase/
// PostgREST as JSON strings, not JS numbers (precision-preservation
// behavior) — every field here is explicitly coerced with Number()
// below. Without this, anything downstream calling .toFixed() on these
// values throws at runtime (confirmed on tto1_woba: chart looked "empty"
// but was actually crashing before render, with real data sitting in
// Supabase the whole time).

import { createAdminClient } from '@/lib/supabase'
export type PitcherStatsFull = {
  era: number | null
  whip: number | null
  fip: number | null
  k_per_9: number | null
  bb_per_9: number | null
  l3_era: number | null
  tto1_woba: number | null
  tto2_woba: number | null
  tto3_woba: number | null
  tto1_pa: number | null
  tto2_pa: number | null
  tto3_pa: number | null
  tto_verified_at: string | null
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export async function getPitcherStatsFull(playerId: number): Promise<PitcherStatsFull | null> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitcher_stats')
    .select('era, whip, fip, k_per_9, bb_per_9, l3_era, tto1_woba, tto2_woba, tto3_woba, tto1_pa, tto2_pa, tto3_pa, tto_verified_at')
    .eq('player_id', playerId)
    .single()
  if (error || !data) {
    console.error('[pitcher-full-stats] query failed:', error?.message)
    return null
  }

  const d = data as any
  return {
  era: toNum(d.era),
    whip: toNum(d.whip),
    fip: toNum(d.fip),
    k_per_9: toNum(d.k_per_9),
    bb_per_9: toNum(d.bb_per_9),
    l3_era: toNum(d.l3_era),
    tto1_woba: toNum(d.tto1_woba),
    tto2_woba: toNum(d.tto2_woba),
    tto3_woba: toNum(d.tto3_woba),
    tto1_pa: toNum(d.tto1_pa),
    tto2_pa: toNum(d.tto2_pa),
    tto3_pa: toNum(d.tto3_pa),
    tto_verified_at: d.tto_verified_at ?? null,
  }
}

export type PitchMovementRow = {
  pitchType: string
  pitchName: string
  avgVelocity: number | null
  avgHBreak: number | null
  avgVBreak: number | null
  whiffRate: number | null
}

export async function getPitchMovementFromDB(playerId: number, season: number): Promise<PitchMovementRow[]> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, avg_velocity, avg_h_break, avg_v_break, whiff_rate')
    .eq('player_id', playerId)
    .eq('season', season)

  if (error) {
    console.error('[pitcher-full-stats] movement query failed:', error.message)
    return []
  }
  if (!Array.isArray(data)) {
    console.error('[pitcher-full-stats] movement query returned non-array data:', JSON.stringify(data)?.slice(0, 300))
    return []
  }
  return data.map((r: any) => ({
    pitchType: r.pitch_type,
    pitchName: r.pitch_name ?? r.pitch_type,
    avgVelocity: r.avg_velocity ?? null,
    avgHBreak: r.avg_h_break ?? null,
    avgVBreak: r.avg_v_break ?? null,
    whiffRate: r.whiff_rate ?? null,
  }))
}