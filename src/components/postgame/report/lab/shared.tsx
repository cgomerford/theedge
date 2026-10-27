// src/components/postgame/report/lab/shared.tsx
//
// Small pieces both Postgame desks use: how a pitch turned out (from the feed's call code), the plate appearance strip, and the open styles.
// Everything here describes one game's pitches from the live feed (lib/postgame/pitchlog.ts); nothing is estimated.
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { COUNT_GROUPS, countGroup, type PitchRec } from '@/lib/postgame/pitchlog'

export { COUNT_GROUPS, countGroup }

export type Out = 'ball' | 'called' | 'swing' | 'foul' | 'play' | 'hbp'
export const OUT_LABEL: Record<Out, string> = { ball: 'Ball', called: 'Called strike', swing: 'Swinging strike', foul: 'Foul', play: 'In play', hbp: 'Hit by pitch' }
export const OUT_COLOR: Record<Out, string> = { ball: '#6CABDD', called: '#8a8275', swing: '#FF5722', foul: '#FDE047', play: '#1D9E75', hbp: '#D4533B' }
const CODE: Record<Out, string> = { ball: 'B', called: 'CS', swing: 'SS', foul: 'F', play: 'IP', hbp: 'HBP' }

export function outOf(call: string): Out | null {
  if (call === 'B' || call === 'I' || call === 'P') return 'ball'
  if (call === 'C') return 'called'
  if (['S', 'W', 'T', 'M', 'Q'].includes(call)) return 'swing'
  if (call === 'F' || call === 'L') return 'foul'
  if (call === 'X' || call === 'D' || call === 'E') return 'play'
  if (call === 'H') return 'hbp'
  return null
}
export const outCode = (call: string) => { const o = outOf(call); return o ? CODE[o] : '' }
export const isOutside = (z: number | null) => z != null && z >= 11

export const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
export const shade = (v: number) => `rgba(255,87,34,${(0.08 + Math.min(1, v) * 0.7).toFixed(2)})`
export const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

export type PA = { key: number; inning: number; top: boolean; batter: string; pitcher: string; pitches: PitchRec[]; result: string }
export function plateAppearances(ps: PitchRec[]): PA[] {
  const by = new Map<number, PitchRec[]>()
  for (const p of ps) { if (!by.has(p.atBat)) by.set(p.atBat, []); by.get(p.atBat)!.push(p) }
  return [...by.entries()].map(([k, list]) => ({ key: k, inning: list[0].inning, top: list[0].top, batter: list[0].batterName, pitcher: list[0].pitcher, pitches: list, result: list[list.length - 1].result })).sort((a, b) => a.key - b.key)
}

export function PAList({ pas, who }: { pas: PA[]; who: 'batter' | 'pitcher' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, fontFamily: SANS }}>
      {pas.map(pa => (
        <div key={pa.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ width: 66, fontWeight: 800 }}>{pa.top ? 'Top' : 'Bot'} {pa.inning}</span>
          <span style={{ width: 150, color: C.mute }}>{who === 'batter' ? `vs ${pa.pitcher}` : pa.batter}</span>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {pa.pitches.map((x, q) => (
              <span key={q} title={`${x.typeName}${x.velo != null ? ` ${x.velo.toFixed(1)} mph` : ''} · ${x.balls}-${x.strikes} · ${x.callText}${x.ev != null ? ` · ${x.ev.toFixed(0)} mph off the bat` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: pitchColor(x.type), color: '#fff', fontSize: 9, fontWeight: 800 }}>{outCode(x.call)}</span>
            ))}
          </span>
          <b style={{ marginLeft: 'auto', fontSize: 13 }}>{pa.result}</b>
        </div>
      ))}
    </div>
  )
}

