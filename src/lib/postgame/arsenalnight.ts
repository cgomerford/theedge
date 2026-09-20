// src/lib/postgame/arsenalnight.ts
//
// Pro §17 Full arsenal night chart — each starter's pitch mix tonight, split three ways: by count
// bucket (first pitch / ahead / even / behind / two strikes), by hitter hand (from the side the batter
// actually hit from) and by time through the order (the nth time each batter saw him). Feed only.

import type { PostData } from './data'
import { buildPitchLog, COUNT_GROUPS, countGroup, startersOf, type PitchRec } from './pitchlog'
import type { Side } from './recap'

export type MixSlice = { type: string; name: string; n: number; pct: number }
export type MixRowN = { label: string; n: number; mix: MixSlice[] }
export type ArsenalNight = { side: Side; id: number; name: string; pitches: number; types: { type: string; name: string }[]; byCount: MixRowN[]; byHand: MixRowN[]; byTto: MixRowN[] }

const MIN_ROW = 1

function mixOf(label: string, recs: PitchRec[]): MixRowN | null {
  if (recs.length < MIN_ROW) return null
  const m = new Map<string, MixSlice>()
  for (const r of recs) { const s = m.get(r.type) ?? { type: r.type, name: r.typeName, n: 0, pct: 0 }; s.n += 1; m.set(r.type, s) }
  const mix = [...m.values()].sort((a, b) => b.n - a.n).map((s) => ({ ...s, pct: (s.n / recs.length) * 100 }))
  return { label, n: recs.length, mix }
}
const rows = (defs: [string, PitchRec[]][]) => defs.map(([l, r]) => mixOf(l, r)).filter((x): x is MixRowN => x !== null)

export function buildArsenalNight(d: PostData): ArsenalNight[] {
  const log = buildPitchLog(d)
  return startersOf(d).map((s) => {
    const mine = log.filter((p) => p.pitcherId === s.id)
    const seen = new Map<string, string>()
    for (const p of mine) seen.set(p.type, p.typeName)
    const types = [...seen.entries()].map(([type, name]) => ({ type, name, n: mine.filter((p) => p.type === type).length })).sort((a, b) => b.n - a.n).map(({ type, name }) => ({ type, name }))
    return {
      side: s.side, id: s.id, name: s.name, pitches: mine.length, types,
      byCount: rows(COUNT_GROUPS.map((g) => [g, mine.filter((p) => countGroup(p.balls, p.strikes) === g)] as [string, PitchRec[]])),
      byHand: rows([['vs LHB', mine.filter((p) => p.batSide === 'L')], ['vs RHB', mine.filter((p) => p.batSide === 'R')]]),
      byTto: rows([['1st time', mine.filter((p) => p.tto === 1)], ['2nd time', mine.filter((p) => p.tto === 2)], ['3rd+ time', mine.filter((p) => p.tto >= 3)]]),
    }
  })
}
