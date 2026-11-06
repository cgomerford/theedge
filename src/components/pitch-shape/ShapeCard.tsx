'use client'

// src/components/pitch-shape/ShapeCard.tsx
//
// The article "Pitch shape card": one of a pitcher's pitches drawn and scored the way the Pitch Shape Lab does it. The map is the 0.1 in league map (each box is the whiffs
// per swing of every league pitch of that type within 1 in of it, blank under 40 swings), with his pitches as dots, his average and the +/-1 SD ring. The comparison is the
// Lab's: his whiffs per swing against what league pitches that MOVE like his get, latest season, +/-1 in window (finder-math rateDots), so the figures match the Lab page.
// Inserted into articles as a picture by the chart picker, so it takes plain data and has no controls. Descriptions of what happened, not a forecast.

import { useEffect, useMemo, useRef } from 'react'
import { C, SANS } from '@/components/team/ui'
import { PITCH_NAMES, fmtN, type Hand, type PitcherPitchShape } from '@/lib/pitch-shape/model'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { pitchColor } from '@/lib/mlb'
import { RAMP } from './parts'
import { hexToRgb, makeGrid, stats } from './heatGrid'
import { MIN_OWN_SWINGS, verdictOf } from './finder-math'

export type ShapeCardData = { pitcherId: number; name: string; hand: Hand; teamAbbr: string; season: number; pitches: PitcherPitchShape[]; cells: MovementCellsPayload | null; half: number; pitchType: string }

const MIN_WINDOW_SWINGS = 40
const R10 = 10   // the Lab's +/-1 in window

export default function ShapeCard({ d }: { d: ShapeCardData }) {
  const P = d.pitches.find(p => p.pitchType === d.pitchType)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grid = useMemo(() => (d.cells ? makeGrid(d.cells, 'latest') : null), [d.cells])
  const N = grid ? 2 * grid.h10 + 1 : 0
  const lw0 = grid && grid.swings > 0 ? grid.whiffs / grid.swings : 0.25
  const lo = Math.max(0.02, lw0 * 0.4), hi = lw0 * 2.2

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const ramp = RAMP.map(hexToRgb)
    const pick = (t: number) => ramp[Math.round(Math.max(0, Math.min(1, t)) * (ramp.length - 1))]
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, R10)
      const o = ((N - 1 - yy) * N + xx) * 4
      const rgb = s.swings >= MIN_WINDOW_SWINGS ? pick((s.whiffs / s.swings - lo) / (hi - lo)) : [241, 238, 230]
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, N, lo, hi])

  if (!P || !grid || !d.cells) return <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: C.mute }}>The league map isn’t built for this pitch yet.</div>
  const name = PITCH_NAMES[P.pitchType] ?? P.pitchType
  const lc = name.toLowerCase()
  const cur = P.current, half = d.half
  const own = P.own.swings >= MIN_OWN_SWINGS && P.own.whiff != null ? P.own.whiff : null
  const sh = stats(grid, Math.round(cur.hb * 10), Math.round(cur.ivb * 10), R10)
  const shapeRate = sh.swings >= MIN_WINDOW_SWINGS ? sh.whiffs / sh.swings : null
  const { verdict, gapPts } = verdictOf(own, shapeRate)
  const total = d.pitches.reduce((s, p) => s + p.current.n, 0)
  const latest = d.cells.pooledLabel ?? String(d.cells.latest)
  const box = (hb: number, ivb: number) => ({ x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) })
  const a = box(cur.hb, cur.ivb)
  const ticks = (c: number) => { const o: number[] = []; for (let v = Math.ceil(c - half); v <= Math.floor(c + half); v++) if (v % 2 === 0) o.push(v); return o }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
  const word = verdict === 'ahead' ? 'ahead of his shape' : verdict === 'behind' ? 'behind his shape' : verdict === 'level' ? 'about level' : null
  return (
    <div style={{ fontFamily: SANS }}>
      <div style={{ borderBottom: `1px solid ${C.ink}`, paddingBottom: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Pitch Shape Lab · {d.hand === 'R' ? 'RHP' : 'LHP'} · {d.teamAbbr}</div>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.01em' }}>{d.name} · {name} · {d.season}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 14, marginTop: 10, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', gridTemplateRows: 'auto 20px' }}>
            <div style={{ position: 'relative' }}>
              {ticks(cur.ivb).map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((cur.ivb + half - v) / (2 * half)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10, color: C.mute }}>{v}</span>)}
            </div>
            <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
              <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <ellipse cx={a.x} cy={a.y} rx={cur.sdHb * 10} ry={cur.sdIvb * 10} fill="none" stroke={C.ink} strokeWidth={N / 160} strokeDasharray={`${N / 60} ${N / 100}`} vectorEffect="non-scaling-stroke" />
                {P.points.map((p, i) => { const b = box(p.hb, p.ivb); return <ellipse key={i} cx={b.x} cy={b.y} rx={N / 130} ry={N / 130} fill={C.ink} stroke="#fff" strokeWidth={N / 400} /> })}
                <line x1={a.x - N / 40} x2={a.x + N / 40} y1={a.y} y2={a.y} stroke="#fff" strokeWidth={N / 200} />
                <line y1={a.y - N / 40} y2={a.y + N / 40} x1={a.x} x2={a.x} stroke="#fff" strokeWidth={N / 200} />
              </svg>
            </div>
            <div />
            <div style={{ position: 'relative' }}>
              {ticks(cur.hb).map(v => <span key={v} style={{ position: 'absolute', left: `${((v - (cur.hb - half)) / (2 * half)) * 100}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10, color: C.mute }}>{v}</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, letterSpacing: '.1em', fontWeight: 800, color: C.mute, margin: '0 0 6px', paddingLeft: 24 }}><span>↑ RIDE (IN)</span><span>ARM-SIDE RUN (IN) →</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.mute, flexWrap: 'wrap' }}>
            <span>Whiffs per swing</span><span>{(lo * 100).toFixed(0)}%</span>
            <span style={{ display: 'flex', height: 9, borderRadius: 3, overflow: 'hidden' }}>{RAMP.map(c => <span key={c} style={{ width: 16, height: 9, background: c }} />)}</span>
            <span>{(hi * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            {([['Velocity', `${cur.velo.toFixed(1)} mph`], ['Arm angle', `${cur.slot.toFixed(0)}°`], ['Ride', `${cur.ivb.toFixed(1)} in`], ['Run', `${cur.hb.toFixed(1)} in`]] as [string, string][]).map(([x, y]) => (
              <div key={x} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 9px' }}><div style={k}>{x}</div><b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{y}</b></div>
            ))}
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px' }}>
            <div style={k}>Whiffs per swing</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{own == null ? '—' : `${(own * 100).toFixed(1)}%`}</b>
              <span style={{ fontSize: 11.5, color: '#5b5347' }}>his {lc}, {fmtN(P.own.swings)} swings</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, margin: '8px 0', }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{shapeRate == null ? '—' : `${(shapeRate * 100).toFixed(1)}%`}</b>
              <span style={{ fontSize: 11.5, color: '#5b5347' }}>league {lc}s that move like his, {fmtN(sh.swings)} swings</span>
            </div>
            {word && gapPts != null && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: gapPts >= 0 ? C.good : C.bad }}>{word} ({gapPts >= 0 ? '+' : '−'}{Math.abs(gapPts).toFixed(1)} pts)</div>}
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>League average for {lc}s, {latest}: {(lw0 * 100).toFixed(1)}% of swings miss</div>
          </div>
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
        Each box is the whiffs per swing of every league {lc} thrown {d.hand === 'R' ? 'right' : 'left'}-handed within 1 in of it, all speeds and arm angles, {latest}; blank = under {MIN_WINDOW_SWINGS} swings. Dots are a sample of his {fmtN(cur.n)} {lc}s (of {fmtN(total)} pitches in {d.season}); ┼ is his average, the dashed ring is ±1 SD. His rate needs {MIN_OWN_SWINGS} swings. Ride is induced vertical break and run is arm-side horizontal break. Describes what happened, not what comes next. Source: Statcast pitch tracking, x9Lab Pitch Shape Lab. Independent, not affiliated with MLB. Full shape: xlab9.com/mlb/lab/pitching-lab/{d.pitcherId}/shape
      </div>
    </div>
  )
}
