'use client'

// src/components/pitch-shape/PitcherShapeLevels.tsx
//
// What one pitcher's shape looks like at each level he has thrown at: movement (ride up, run toward his arm side), every pitch type's average as a ring per level joined by a dashed
// line, and for the chosen pitch the sampled movement dots of each level. Same pitcher, so a difference is a change in his pitch, not a different arm. Dots are a 60-pitch sample per
// level, so counts are approximate; the rings are the averages over every pitch counted in the table.

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/components/team/ui'
import { LEVEL_LABEL, LEVEL_SHORT, type Level } from '@/lib/milb-shape/levels'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'
import { LEVEL_COLOUR } from './LevelsCompared'
import { log } from '@/lib/log'

type T = { pitchType: string; n: number; velo: number; ivb: number; hb: number; slot: number; sdHb: number | null; sdIvb: number | null; points: [number, number][] }
type L = { level: Level; season: number; name: string; hand: string; types: T[] }
const cache = new Map<number, L[] | null>()
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }

export default function PitcherShapeLevels({ pitcherId, initialType }: { pitcherId: number; initialType: string }) {
  const [got, setGot] = useState<{ id: number; v: L[] | null } | null>(null)
  const [type, setType] = useState(initialType)
  useEffect(() => {
    if (cache.has(pitcherId)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-shape-levels?id=${pitcherId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { levels: L[] }) => { cache.set(pitcherId, j.levels); if (live) setGot({ id: pitcherId, v: j.levels }) })
      .catch(e => { log.error('PitcherShapeLevels', 'fetch failed', e instanceof Error ? e.message : e); cache.set(pitcherId, null); if (live) setGot({ id: pitcherId, v: null }) })
    return () => { live = false }
  }, [pitcherId])
  const levels = cache.has(pitcherId) ? cache.get(pitcherId) : got?.id === pitcherId ? got.v : undefined
  const types = useMemo(() => [...new Set((levels ?? []).flatMap(l => l.types.map(t => t.pitchType)))], [levels])
  const sel = types.includes(type) ? type : types[0]
  if (levels === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Loading his shape at each level…</div>
  if (!levels || levels.length < 2) return <div style={{ fontSize: 13, color: C.mute }}>He has no second level with tracked pitches in the data, so there is nothing to set against.</div>

  const W = 520, H = 400, pad = 36
  const ring = levels.flatMap(l => l.types.map(t => ({ l, t })))
  const dots = levels.flatMap(l => (l.types.find(t => t.pitchType === sel)?.points ?? []).map(p => ({ level: l.level, hb: p[0], ivb: p[1] })))
  const xs = [...ring.map(r => r.t.hb), ...dots.map(d => d.hb)], ys = [...ring.map(r => r.t.ivb), ...dots.map(d => d.ivb)]
  const x0 = Math.floor(Math.min(...xs) - 2), x1 = Math.ceil(Math.max(...xs) + 2), y0 = Math.floor(Math.min(...ys) - 2), y1 = Math.ceil(Math.max(...ys) + 2)
  const X = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - pad - 10), Y = (v: number) => H - pad - ((v - y0) / (y1 - y0)) * (H - pad - 10)
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '5px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const low = levels[levels.length - 1]
  return (
    <div>
      <div role="group" aria-label="Pitch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
        {types.map(t => <button key={t} type="button" aria-pressed={t === sel} onClick={() => setType(t)} style={{ minHeight: 36, padding: '0 11px', borderRadius: 4, border: `1px solid ${t === sel ? C.ink : C.line}`, background: t === sel ? C.ink : '#fff', color: t === sel ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{PITCH_NAMES[t] ?? t}</button>)}
      </div>
      <div className="psl-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 4 }}>{levels.map(l => <span key={l.level}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: LEVEL_COLOUR[l.level], marginRight: 6 }} />{LEVEL_LABEL[l.level]}</span>)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="His movement at each level: ride up, run toward his arm side" style={{ width: '100%', height: 'auto', background: '#EDE8DC', borderRadius: 8 }}>
            <text x={8} y={18} fontSize="11" fill={C.mute}>↑ RIDE (IN)</text>
            <text x={W / 2} y={H - 10} fontSize="11" fill={C.mute} textAnchor="middle">RUN (ARM-SIDE BREAK, IN) →</text>
            {dots.map((d, i) => <circle key={i} cx={X(d.hb)} cy={Y(d.ivb)} r={3} fill={LEVEL_COLOUR[d.level]} fillOpacity={0.45} />)}
            {types.map(t => {
              const pts = levels.map(l => { const x = l.types.find(y => y.pitchType === t); return x ? { l, x: X(x.hb), y: Y(x.ivb) } : null }).filter((x): x is { l: L; x: number; y: number } => x != null)
              return (
                <g key={t}>
                  {pts.length > 1 && <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#8a8275" strokeWidth={1.2} strokeDasharray="4 3" />}
                  {pts.map(p => <g key={p.l.level}><circle cx={p.x} cy={p.y} r={t === sel ? 11 : 8} fill={LEVEL_COLOUR[p.l.level]} fillOpacity={0.2} stroke={LEVEL_COLOUR[p.l.level]} strokeWidth={t === sel ? 3 : 2} /><text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="9.5" fontWeight={800} fill={C.ink}>{t}</text></g>)}
                </g>
              )
            })}
          </svg>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
            <thead><tr><th style={th}>Pitch</th><th style={th}>Level</th><th style={th}>Pitches</th><th style={th}>Velocity</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Arm</th></tr></thead>
            <tbody>
              {types.flatMap(t => levels.map((l, i) => {
                const x = l.types.find(y => y.pitchType === t)
                if (!x) return null
                const lo = l !== low ? low.types.find(y => y.pitchType === t) : null
                const d = (a: number, b: number | undefined, k = 1) => (lo && b != null ? <div style={{ fontSize: 11.5, fontWeight: 700, color: '#3a352c' }}>{sg(a - b, k)}</div> : null)
                return (
                  <tr key={`${t}${l.level}`} style={{ background: t === sel ? '#FFF3EA' : undefined }}>
                    <td style={{ ...td, fontWeight: 700 }}>{i === 0 ? PITCH_NAMES[t] ?? t : ''}</td><td style={td}>{LEVEL_SHORT[l.level]}</td><td style={td}>{x.n.toLocaleString()}</td>
                    <td style={td}>{x.velo.toFixed(1)}{d(x.velo, lo?.velo)}</td><td style={td}>{x.ivb.toFixed(1)}{d(x.ivb, lo?.ivb)}</td><td style={td}>{x.hb.toFixed(1)}{d(x.hb, lo?.hb)}</td><td style={td}>{Math.round(x.slot)}°{d(x.slot, lo?.slot, 0)}</td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>The figure under a higher level’s row is how far it sits from the same pitch at {LEVEL_LABEL[low.level]}. Rings are averages over every pitch counted; the dots are a 60-pitch sample per level, so counts are approximate.</div>
        </div>
      </div>
      <style>{'@media(max-width:900px){.psl-two{grid-template-columns:1fr !important}}'}</style>
    </div>
  )
}
