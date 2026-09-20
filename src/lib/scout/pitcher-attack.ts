// src/lib/scout/pitcher-attack.ts
//
// Scout §9 (Pitcher attack deep) — how tonight's starter attacks, packed into one
// small object the interactive PitcherAttack component can slice by hitter hand:
//   · count × pitch matrix   — share of his pitches by type in each of the 12 counts
//   · count spot map          — the most-used zone for each pitch in a count, over the
//                                background of where he throws overall
//   · what's next             — the pitch that follows each pitch type inside a plate
//                                appearance
//   · hand splits             — pitch mix vs left- and right-handed hitters
// All from the pitcher_count_tendency / pitcher_pitch_sequencing / pitcher_zone_arsenal
// tables (Statcast pitch data aggregated per split: all / vs LHB / vs RHB).
// The full movement / stuff view stays in Pitching Lab — Scout shows the decision
// charts and links out.

import { getPitcherCountTendency, getPitcherSequencing } from '@/lib/pitcher-sequencing'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'

export type SplitKey = 'all' | 'vs_lhb' | 'vs_rhb'
export const COUNTS = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2', '3-0', '3-1', '3-2']

export type CountCell = { pt: string; pct: number; n: number; zone: string | null; zoneLabel: string | null }
export type SplitAttack = {
  total: number
  counts: Record<string, { total: number; pitches: CountCell[] }>
  seq: Record<string, { total: number; next: { pt: string; pct: number; n: number }[] }>
  /** share of all his pitches (%) by pitch type */
  mix: Record<string, number>
  /** share of all his pitches (%) landing in each zone (1–9, 11–14) */
  zoneUsage: Record<string, number>
  /** for each pitch type: the share (%) of THAT pitch landing in each zone */
  pitchZones: Record<string, Record<string, number>>
}

export type PitcherAttackData = {
  id: number
  name: string
  pitchNames: Record<string, string>
  /** pitch codes ordered by overall usage */
  order: string[]
  splits: Partial<Record<SplitKey, SplitAttack>>
}

export async function getPitcherAttack(pitcherId: number, name: string): Promise<PitcherAttackData | null> {
  try {
    const [counts, seq, zones] = await Promise.all([getPitcherCountTendency(pitcherId), getPitcherSequencing(pitcherId), getPitcherZoneArsenal(pitcherId)])
    const keys = (['all', 'vs_lhb', 'vs_rhb'] as SplitKey[]).filter((k) => counts[k] || seq[k] || zones[k])
    if (keys.length === 0) return null

    const pitchNames: Record<string, string> = {}
    const splits: PitcherAttackData['splits'] = {}
    for (const k of keys) {
      const z = zones[k]
      const total = z?.total_pitches ?? counts[k]?.counts?.['0-0']?.total_pitches ?? 0
      const mix: Record<string, number> = {}, zoneUsage: Record<string, number> = {}, pitchZones: Record<string, Record<string, number>> = {}
      for (const [pt, p] of Object.entries(z?.arsenal ?? {})) {
        pitchNames[pt] ??= (p as { pitch_name?: string }).pitch_name ?? pt
        let n = 0
        for (const [zone, cell] of Object.entries(p.zones ?? {})) { n += cell.pitches; zoneUsage[zone] = (zoneUsage[zone] ?? 0) + cell.pitches }
        mix[pt] = total > 0 ? (n / total) * 100 : 0
        pitchZones[pt] = Object.fromEntries(Object.entries(p.zones ?? {}).map(([zone, cell]) => [zone, n > 0 ? (cell.pitches / n) * 100 : 0]))
      }
      for (const zone of Object.keys(zoneUsage)) zoneUsage[zone] = total > 0 ? (zoneUsage[zone] / total) * 100 : 0

      const cSplit: SplitAttack['counts'] = {}
      for (const [count, b] of Object.entries(counts[k]?.counts ?? {})) {
        cSplit[count] = { total: b.total_pitches, pitches: b.pitches.map((p) => { pitchNames[p.pitch_type] ??= p.pitch_name; return { pt: p.pitch_type, pct: p.pct, n: p.count_n, zone: p.top_zone, zoneLabel: p.top_zone_label } }) }
      }
      const sSplit: SplitAttack['seq'] = {}
      for (const [pt, s] of Object.entries(seq[k]?.transitions ?? {})) {
        pitchNames[pt] ??= s.pitch_name
        sSplit[pt] = { total: s.total_followed, next: s.next_pitches.map((n) => { pitchNames[n.pitch_type] ??= n.pitch_name; return { pt: n.pitch_type, pct: n.pct, n: n.count } }) }
      }
      splits[k] = { total, counts: cSplit, seq: sSplit, mix, zoneUsage, pitchZones }
    }
    const base = splits.all ?? splits[keys[0]]!
    const order = Object.keys(pitchNames).sort((a, b) => (base.mix[b] ?? 0) - (base.mix[a] ?? 0))
    return { id: pitcherId, name, pitchNames, order, splits }
  } catch (err) {
    console.error('[scout] pitcher attack failed:', pitcherId, err)
    return null
  }
}
