// src/lib/postgame/seqaudit.ts
//
// Pro §14 Pitch sequencing audit — after each pitch, what does the starter usually throw next
// (pitcher_pitch_sequencing, split `all`, season; written by fetch_pitcher_hot_zones.py, read-only
// here), and what did he actually throw tonight? Only consecutive pitches inside one plate
// appearance count. "Expected" is what a pitcher who followed his own usual habits would match by
// chance: for every pair, the share of the time his most common follow-up is the pitch thrown.
// Rows with fewer than MIN_FOLLOWED season examples are left out as too thin.

import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { buildPitchLog, startersOf } from './pitchlog'
import type { Side } from './recap'

export const MIN_FOLLOWED = 20
type NextP = { pitch_type: string; pitch_name?: string; pct: number }
type Transitions = Record<string, { pitch_name?: string; total_followed: number; next_pitches: NextP[] }>

export type SeqRow = {
  from: string; fromName: string
  n: number                                        // pitches thrown after it tonight
  usual: { type: string; name: string; pct: number }[]
  tonight: { type: string; name: string; n: number }[]
  matched: number                                  // times the follow-up was his usual top choice
  expected: number
}
export type SeqStarter = { side: Side; id: number; name: string; pairs: number; matched: number; expected: number; rows: SeqRow[] }

export async function getSeqAudit(d: PostData, gameDate: string): Promise<{ starters: SeqStarter[]; missing: string[] }> {
  const starters = startersOf(d)
  const { data, error } = await createAdminClient().from('pitcher_pitch_sequencing').select('player_id, transitions')
    .in('player_id', starters.map((s) => s.id)).eq('season', Number(gameDate.slice(0, 4))).eq('split', 'all')
  if (error) console.error('[getSeqAudit] Supabase error:', error.message)
  const usual = new Map<number, Transitions>()
  for (const r of (data ?? []) as { player_id: number; transitions: Transitions }[]) usual.set(Number(r.player_id), r.transitions ?? {})

  const log = buildPitchLog(d)
  const out: SeqStarter[] = [], missing: string[] = []
  for (const s of starters) {
    const tr = usual.get(s.id)
    if (!tr) { missing.push(s.name); continue }
    const rows = new Map<string, SeqRow>()
    let pairs = 0, matched = 0, expected = 0
    for (const p of log) {
      if (p.pitcherId !== s.id || !p.prevType) continue
      const t = tr[p.prevType]
      if (!t || t.total_followed < MIN_FOLLOWED || !t.next_pitches?.length) continue
      const top = [...t.next_pitches].sort((a, b) => b.pct - a.pct)
      const row = rows.get(p.prevType) ?? {
        from: p.prevType, fromName: t.pitch_name ?? p.prevType, n: 0, tonight: [], matched: 0, expected: 0,
        usual: top.slice(0, 3).map((x) => ({ type: x.pitch_type, name: x.pitch_name ?? x.pitch_type, pct: x.pct })),
      }
      row.n += 1
      const slot = row.tonight.find((x) => x.type === p.type)
      if (slot) slot.n += 1; else row.tonight.push({ type: p.type, name: p.typeName, n: 1 })
      const hit = p.type === top[0].pitch_type
      if (hit) row.matched += 1
      row.expected += top[0].pct / 100
      rows.set(p.prevType, row)
      pairs += 1; if (hit) matched += 1; expected += top[0].pct / 100
    }
    for (const r of rows.values()) r.tonight.sort((a, b) => b.n - a.n)
    out.push({ side: s.side, id: s.id, name: s.name, pairs, matched, expected, rows: [...rows.values()].sort((a, b) => b.n - a.n) })
  }
  return { starters: out, missing }
}
