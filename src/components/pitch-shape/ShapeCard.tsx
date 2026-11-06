'use client'

// src/components/pitch-shape/ShapeCard.tsx
//
// The article "Pitch shape card": one of a pitcher's pitches drawn the way the Pitch Shape Lab draws it (league movement map coloured by whiffs per swing,
// his pitches as dots with the +/-1 SD ring and his average in yellow, the outcome bars against pitches shaped like it), plus a strip of every pitch he throws.
// Inserted into articles as a picture by the chart picker, so it takes plain data and has no controls. Descriptions of what happened, not a forecast.

import { C, SANS } from '@/components/team/ui'
import { PITCH_NAMES, fmtN, indexBins, leagueAverages, lookup, pct, sgn, GATE, type Hand, type PitcherPitchShape, type ShapeBin } from '@/lib/pitch-shape/model'
import { pitchColor } from '@/lib/mlb'
import MovementMap from './MovementMap'
import { MapLegend, OutcomeBars, SHAPE_CSS } from './parts'

export type ShapeCardData = { pitcherId: number; name: string; hand: Hand; teamAbbr: string; season: number; leagueSpan: string; pitches: PitcherPitchShape[]; bins: ShapeBin[]; pitchType: string }

export default function ShapeCard({ d }: { d: ShapeCardData }) {
  const P = d.pitches.find(p => p.pitchType === d.pitchType)
  if (!P) return <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: C.mute }}>No pitch with enough pitches this season to describe a shape.</div>
  const name = PITCH_NAMES[P.pitchType] ?? P.pitchType
  const cur = P.current
  const index = indexBins(d.bins)
  const L = lookup(index, cur)
  const league = leagueAverages(d.bins)
  const diff = L.whiff.value != null && P.own.whiff != null ? (P.own.whiff - L.whiff.value) * 100 : null
  const total = d.pitches.reduce((s, p) => s + p.current.n, 0)
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
  return (
    <div style={{ fontFamily: SANS }}>
      <style>{SHAPE_CSS}</style>
      <div style={{ borderBottom: `1px solid ${C.ink}`, paddingBottom: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Pitch Shape Lab · {d.hand === 'R' ? 'RHP' : 'LHP'} · {d.teamAbbr}</div>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.01em' }}>{d.name} · {name} · {d.season}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 14, marginTop: 10, alignItems: 'start' }}>
        <div>
          <MovementMap bins={d.bins} pitcher={{ current: cur, prev: P.prev, points: P.points }} ariaLabel={`${d.name} ${name} movement map`} />
          <MapLegend withPitcher />
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {([['Velocity', `${cur.velo.toFixed(1)} mph`], ['Arm angle', `${cur.slot.toFixed(0)}°`], ['Ride', `${cur.ivb.toFixed(1)} in`], ['Run', `${cur.hb.toFixed(1)} in`]] as [string, string][]).map(([a, b]) => (
              <div key={a} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 9px' }}><div style={k}>{a}</div><b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{b}</b></div>
            ))}
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            <div style={k}>His whiff% vs pitches shaped like it</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{pct(P.own.whiff)}</b>
              <span style={{ fontSize: 12, color: '#5b5347' }}>vs {pct(L.whiff.value)} for the shape{diff == null ? '' : ` (${sgn(diff)} pts)`}</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.faint }}>His n = {fmtN(P.own.swings)} swings{P.own.whiff == null ? `, under the ${GATE.swings} needed` : ''} · shape n = {fmtN(L.swings)}</div>
          </div>
          <OutcomeBars look={L} league={league} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(d.pitches.length, 6)}, minmax(0,1fr))`, gap: 6, marginTop: 12 }}>
        {d.pitches.slice(0, 6).map(p => (
          <div key={p.pitchType} style={{ background: p.pitchType === P.pitchType ? '#FFF1EA' : '#fff', border: `1px solid ${p.pitchType === P.pitchType ? C.orange : C.line}`, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: pitchColor(p.pitchType), display: 'inline-block' }} />{PITCH_NAMES[p.pitchType] ?? p.pitchType}</div>
            <div style={{ fontSize: 10.5, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>{p.current.velo.toFixed(1)} mph · {total ? Math.round((p.current.n / total) * 100) : 0}%</div>
            <div style={{ fontSize: 10.5, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>{p.current.ivb.toFixed(0)}&quot; ride · {p.current.hb.toFixed(0)}&quot; run</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: '#8A8275', marginTop: 10 }}>
        Shape = velocity, ride (induced vertical break), run (horizontal break, arm-side positive) and arm angle. Map colour is whiffs per swing for every league {name.toLowerCase()} thrown {d.hand === 'R' ? 'right' : 'left'}-handed, {d.leagueSpan}; boxes under {GATE.swings} swings are hatched. {fmtN(cur.n)} of his {fmtN(total)} pitches in {d.season}. Describes what happened, not what comes next. Source: Statcast pitch tracking, x9Lab Pitch Shape Lab. Independent, not affiliated with MLB. Full shape: xlab9.com/mlb/lab/pitching-lab/{d.pitcherId}/shape
      </div>
    </div>
  )
}
