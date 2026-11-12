// src/lib/milb-arsenal.ts
//
// A minor-league pitcher's arsenal for the overview, from pitch_shape_pitcher_milb (one row per level x season x pitcher x pitch type, filled by scripts/import-milb-pitch-shape.ts from
// Baseball Savant's minor-league tracking). A database read, so nothing is fetched from Savant while a page renders. Only Triple-A, the Florida State League (Single-A) and the Arizona Fall League are tracked;
// Double-A, High-A and Rookie ball have no pitch data anywhere, so they return null and the page says so. Usage is share of his tracked pitches; whiff% is whiffs per swing.
import { createAdminClient } from '@/lib/supabase'
import { log } from '@/lib/log'
import type { LevelKey } from '@/lib/levels'
import type { PitchMixRow } from '@/lib/game-cockpit'
import { pitchLabel } from '@/lib/lab/pitch-meta'

/** Overview level -> the level code in the shape tables. Single-A is only the Florida State League there; a Single-A pitcher in another league has no rows. */
const DB_LEVEL: Partial<Record<LevelKey, string>> = { aaa: 'aaa', a: 'fsl', winter: 'afl' }

export type MilbArsenal = { mix: PitchMixRow[]; pitches: number; spin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }> }

export async function getMilbArsenal(level: LevelKey, season: number, pitcherId: number): Promise<MilbArsenal | null> {
  const db = DB_LEVEL[level]
  if (!db) return null
  const { data, error } = await createAdminClient().from('pitch_shape_pitcher_milb').select('pitch_type, n_pitches, velo, ivb, hb, n_swings, n_whiffs').eq('level', db).eq('season', season).eq('pitcher_id', pitcherId)
  if (error) { log.error('getMilbArsenal', 'Supabase error', error.message); return null }
  const rows = (data ?? []) as { pitch_type: string; n_pitches: number | string; velo: number | string; ivb: number | string; hb: number | string; n_swings: number | string; n_whiffs: number | string }[]
  const total = rows.reduce((a, r) => a + Number(r.n_pitches), 0)
  if (!total) return null
  const mix: PitchMixRow[] = rows.map(r => {
    const swings = Number(r.n_swings)
    return { code: r.pitch_type, name: pitchLabel(r.pitch_type), pitches: Number(r.n_pitches), usagePct: (100 * Number(r.n_pitches)) / total, velo: Number(r.velo), swings, whiffPct: swings > 0 ? (100 * Number(r.n_whiffs)) / swings : null }
  }).sort((a, b) => b.pitches - a.pitches)
  return { mix, pitches: total, spin: Object.fromEntries(rows.map(r => [r.pitch_type, { rpm: null, ivb: Number(r.ivb), hb: Number(r.hb) }])) }
}
