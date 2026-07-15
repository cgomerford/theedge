// Real TTO/two-strike/first-pitch data + movement physics, straight from
// Supabase — populated by fetch_pitcher_tto_splits.py and
// fetch_pitch_arsenals.py / fetch_pitch_velocity_movement.py. Replaces the
// toPitcherStatsShape() stub in page.tsx, which only ever had
// era/k_per_9/bb_per_9 and left TTO/two-strike/first-pitch permanently
// showing "not yet available" — that data existed the whole time, just
// wasn't being queried (2026-07-14).

import { createAdminClient } from '@/lib/supabase'
// TTO (tto1_era/tto2_era/tto3_era), two_strike_mix, and first_pitch_mix
// deliberately NOT selected below — confirmed 2026-07-14 systemically
// undercounting plate appearances by ~30%+ league-wide (Dustin May: 259
// TTO-tracked PA vs MLB API's real battersFaced of 389; league-wide
// 40,568 total_tto_pa against 12,144 games_played is far below plausible).
// Root cause traced to pybaseball's statcast_pitcher() pull or the TTO
// bucketing logic — not yet fixed. Showing these numbers with confident
// formatting while ~1/3 of real PA are silently missing would violate the
// data-honesty convention this whole build follows elsewhere (see
// stats-data.ts's "never fabricate what you don't have"). Re-add once the
// undercount is fixed and re-verified against MLB's real battersFaced.
export type PitcherStatsFull = {
  era: number | null
  fip: number | null
  k_per_9: number | null
  bb_per_9: number | null
  l3_era: number | null
}

export async function getPitcherStatsFull(playerId: number): Promise<PitcherStatsFull | null> {
  const supa = createAdminClient()
  // TEMP: select('*') to see the table's REAL column names — tto1_era etc.
  // don't exist despite fetch_pitcher_tto_splits.py writing to them, meaning
  // either the migration never ran or the script's been silently failing.
  // Revert to a real column list once confirmed (2026-07-14).
const { data, error } = await supa
    .from('pitcher_stats')
    .select('era, fip, k_per_9, bb_per_9, l3_era')
    .eq('player_id', playerId)
    .single()
  if (error || !data) {
    console.error('[pitcher-full-stats] query failed:', error?.message)
    return null
  }
  console.log('[pitcher-full-stats] REAL columns on pitcher_stats:', Object.keys(data))
  return data as unknown as PitcherStatsFull
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
    // Was `!data` only — a truthy non-array response (object, single row,
    // unexpected shape) slipped past that check and crashed on .map()
    // (confirmed 2026-07-14: "data.map is not a function"). Logging the
    // real shape instead of guessing at why.
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