// src/lib/k-structure/data.ts
//
// A pitcher's strikeouts by time through: how many plate appearances and strikeouts he had the first, second and third-or-later time he faced the same hitter in a game, and how the
// strikeouts were built (the pitch that ended them, the pitch they opened with, swinging or looking, pitches per strikeout), with the league beside them. Reads stored rows only
// (pitcher_k_structure, written by scripts/build_pitcher_k_structure.py from the at-bat index). null when the table is not there or the pitcher has no rows; nothing is estimated.

import { createAdminClient } from '@/lib/supabase'

export type KLook = { look: 1 | 2 | 3; pas: number; ks: number; swinging: number; looking: number; kPitches: number; finishers: Record<string, number>; openers: Record<string, number> }
export type KStructure = { pitcherId: number; looks: KLook[]; league: KLook[] }

type Row = { pitcher_id: number; look: number; pas: number; ks: number; swinging_ks: number; looking_ks: number; k_pitches: number; finishers: Record<string, number>; openers: Record<string, number> }
const shape = (r: Row): KLook => ({ look: r.look as 1 | 2 | 3, pas: Number(r.pas), ks: Number(r.ks), swinging: Number(r.swinging_ks), looking: Number(r.looking_ks), kPitches: Number(r.k_pitches), finishers: r.finishers ?? {}, openers: r.openers ?? {} })

export async function getKStructure(pitcherId: number, season = new Date().getFullYear()): Promise<KStructure | null> {
  const { data, error } = await createAdminClient().from('pitcher_k_structure').select('pitcher_id, look, pas, ks, swinging_ks, looking_ks, k_pitches, finishers, openers').eq('season', season).in('pitcher_id', [pitcherId, 0])
  if (error) { console.error('[getKStructure] Supabase error:', error.message); return null }
  const rows = (data ?? []) as unknown as Row[]
  const mine = rows.filter(r => Number(r.pitcher_id) === pitcherId).map(shape).sort((a, b) => a.look - b.look)
  const league = rows.filter(r => Number(r.pitcher_id) === 0).map(shape).sort((a, b) => a.look - b.look)
  if (mine.length === 0) return null
  return { pitcherId, looks: mine, league }
}
