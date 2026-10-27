'use client'

// src/components/pitching-lab/ArsenalExtras.tsx
//
// Pitching Lab → Arsenal, the three panels that sit around the flight animation:
//   MovementProfile  average horizontal and vertical break of each pitch, in the batter's view (same side as the release chart)
//   UsageTrend       how the pitch mix changed, start by start or month by month (share of that period's pitches)
//   SmoothHeatmap    where a pitch crosses the plate: every pitch is a soft Gaussian blob and the blobs are added, so the
//                    picture is a smooth surface rather than boxes. A smoothness slider widens or narrows each blob.
// All three read the one per-pitch log the tab already loads (src/lib/pitcher-pitch-log.ts); nothing here is estimated.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import type { PitchPath } from './PitchFlight'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, fontFamily: SANS }
const kick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }
const note: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: C.mute, lineHeight: 1.5 }

// ─── Movement profile ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Break map: a plain scatter on a soft grid. Each pitch hangs off a "no spin" mark by a tail, so the tail IS the movement. `focus` dims the others. */
export function MovementProfile({ log, paths, focus, compact = false }: { log: PitcherPitchLog; paths: PitchPath[]; focus?: string; compact?: boolean }) {
  // Arm-side break is positive. Seen from behind the plate, a right-hander's arm side is on the left.
  const toX = (hb: number) => (log.throws === 'R' ? -hb : hb)
  const pts = paths.map(p => ({ p, x: toX(p.hb), y: p.ivb }))
  if (pts.length === 0) return <div style={{ ...card, fontSize: 14, color: C.mute }}>No movement data on record yet.</div>
  // Equal inches both ways, boxed to the pitches plus a margin, with the no-spin mark always inside.
  const step = 6
  const lo = (v: number) => Math.floor((v - 3) / step) * step, hi = (v: number) => Math.ceil((v + 3) / step) * step
  const xMin = lo(Math.min(0, ...pts.map(q => q.x))), xMax = hi(Math.max(0, ...pts.map(q => q.x)))
  const yMin = lo(Math.min(0, ...pts.map(q => q.y))), yMax = hi(Math.max(0, ...pts.map(q => q.y)))
  const L = 34, R = 10, T = 10, B = 26
  const VW = 320, k = (VW - L - R) / (xMax - xMin), VH = T + B + k * (yMax - yMin)
  const X = (v: number) => L + (v - xMin) * k, Y = (v: number) => T + (yMax - v) * k
  const xt: number[] = [], yt: number[] = []
  for (let v = xMin; v <= xMax; v += step) xt.push(v)
  for (let v = yMin; v <= yMax; v += step) yt.push(v)
  // Names sit beside their dots; nudge the ones that would collide.
  const lab = pts.map(q => ({ ...q, ly: Y(q.y) })).sort((a, b) => a.ly - b.ly)
  for (let i = 1; i < lab.length; i++) if (Math.abs(lab[i].x - lab[i - 1].x) * k < 120 && lab[i].ly - lab[i - 1].ly < 14) lab[i].ly = lab[i - 1].ly + 14
  return (
    <div style={{ ...card, minWidth: 0 }}>
      <SpinBallStyles />
      <div style={kick}>Movement · batter&apos;s view</div>
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Average break of each pitch against a spin-free path" style={{ width: '100%', height: 'auto', display: 'block', marginTop: 6 }}>
        <rect x={L} y={T} width={VW - L - R} height={VH - T - B} fill="#fcfbf8" stroke={C.line} />
        {xt.map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={T} y2={VH - B} stroke={v === 0 ? C.mute : C.soft} strokeWidth={v === 0 ? 1.2 : 1} /><text x={X(v)} y={VH - 10} textAnchor="middle" fontSize="10" fill={C.faint} fontFamily={SANS}>{v}</text></g>)}
        {yt.map(v => <g key={`y${v}`}><line x1={L} x2={VW - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C.mute : C.soft} strokeWidth={v === 0 ? 1.2 : 1} /><text x={L - 5} y={Y(v) + 3} textAnchor="end" fontSize="10" fill={C.faint} fontFamily={SANS}>{v}</text></g>)}
        <text x={VW - R - 4} y={VH - B - 5} textAnchor="end" fontSize="10" fill={C.mute} fontFamily={SANS}>toward first base →</text>
        <text x={L + 4} y={VH - B - 5} fontSize="10" fill={C.mute} fontFamily={SANS}>← third base</text>
        <text x={L + 5} y={T + 12} fontSize="10" fill={C.mute} fontFamily={SANS}>↑ rises · ↓ drops (inches)</text>
        {pts.map(({ p, x, y }) => {
          const dim = focus != null && focus !== p.type
          const r = (compact ? 5 : 6) + Math.sqrt(p.share) * (compact ? 8 : 11)
          const l = lab.find(q => q.p.type === p.type)!
          return (
            <g key={p.type} opacity={dim ? 0.3 : 1}>
              <line x1={X(0)} y1={Y(0)} x2={X(x)} y2={Y(y)} stroke={pitchColor(p.type)} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5" />
              <circle cx={X(x)} cy={Y(y)} r={r} fill={pitchColor(p.type)} stroke="#fff" strokeWidth="2"><title>{`${p.name}: ${y >= 0 ? '+' : ''}${y.toFixed(1)}" rise, ${p.hb >= 0 ? '+' : ''}${p.hb.toFixed(1)}" arm-side (n = ${p.n})`}</title></circle>
              {(!dim || focus == null) && <text x={X(x) + r + 5} y={l.ly + 4} fontSize="11" fontWeight="800" fill={C.ink} fontFamily={SANS} paintOrder="stroke" stroke="#fff" strokeWidth="3">{p.name}</text>}
            </g>
          )
        })}
        <circle cx={X(0)} cy={Y(0)} r="5" fill="#fff" stroke={C.ink} strokeWidth="1.5"><title>A pitch thrown with no spin</title></circle>
        <text x={X(0) + 8} y={Y(0) - 7} fontSize="10" fill={C.mute} fontFamily={SANS}>no spin</text>
      </svg>
      {!compact && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
          {pts.map(({ p }) => (
            <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <SpinBall code={p.type} size={26} spin={{ rpm: p.spin, ivb: p.ivb, hb: p.hb }} />
              <span style={{ minWidth: 0 }}><b>{p.name}</b><br /><span style={{ color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{p.velo != null ? `${p.velo.toFixed(1)} mph` : '—'}{p.spin != null ? ` · ${Math.round(p.spin)} rpm` : ''}</span></span>
            </div>
          ))}
        </div>
      )}
      <p style={note}>Average break in inches against a pitch with no spin, from behind the plate. The tail runs from the no-spin mark to where the pitch ends up; bigger dots are used more.</p>
    </div>
  )
}

/** One pitch, game by game: how much of that game's pitches it was, with the velocity in the hover. */
export function PitchSeasonLine({ log, type, name }: { log: PitcherPitchLog; type: string; name: string }) {
  const data = useMemo(() => {
    const by = new Map<string, { n: number; hit: number; v: number[] }>()
    for (const p of log.pitches) {
      const g = by.get(p.date) ?? { n: 0, hit: 0, v: [] }
      g.n++
      if (p.pitchType === type) { g.hit++; if (p.velo != null) g.v.push(p.velo) }
      by.set(p.date, g)
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, g]) => ({
      date, label: date.slice(5).replace('-', '/'), n: g.n, thrown: g.hit,
      share: Math.round((g.hit / g.n) * 1000) / 10, velo: g.v.length ? Math.round((g.v.reduce((s, v) => s + v, 0) / g.v.length) * 10) / 10 : null,
    }))
  }, [log, type])
  return (
    <div style={{ ...card, minWidth: 0 }}>
      <div style={kick}>{name} · game by game</div>
      <div style={{ width: '100%', height: 220, marginTop: 8 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.soft} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: C.faint }} width={38} domain={[0, 'auto']} />
            <Tooltip
              formatter={(v: unknown) => [`${v}%`, 'Share of pitches']}
              labelFormatter={(_, pl) => { const r = pl?.[0]?.payload as { date: string; n: number; thrown: number; velo: number | null } | undefined; return r ? `${r.date} · ${r.thrown} of ${r.n} pitches${r.velo != null ? ` · ${r.velo} mph` : ''}` : '' }}
            />
            <Line type="linear" dataKey="share" stroke={pitchColor(type)} strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={note}>Share of each game&apos;s pitches. Hover a point for the game, the count and the average velocity.</p>
    </div>
  )
}

// ─── Usage trend ────────────────────────────────────────────────────────────────────────────────────────────────────────

type Period = 'start' | 'month'

export function UsageTrend({ log, paths }: { log: PitcherPitchLog; paths: PitchPath[] }) {
  const [period, setPeriod] = useState<Period>('start')
  const types = paths.map(p => p.type)
  const data = useMemo(() => {
    const by = new Map<string, Map<string, number>>()
    for (const p of log.pitches) {
      const key = period === 'start' ? p.date : p.date.slice(0, 7)
      if (!by.has(key)) by.set(key, new Map())
      const m = by.get(key)!
      m.set(p.pitchType, (m.get(p.pitchType) ?? 0) + 1)
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, m]) => {
      const n = [...m.values()].reduce((s, v) => s + v, 0)
      const row: Record<string, number | string> = { key, n, label: period === 'start' ? key.slice(5).replace('-', '/') : new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }
      for (const t of types) row[t] = Math.round(((m.get(t) ?? 0) / n) * 1000) / 10
      return row
    })
  }, [log, period, types.join(',')])
  const names = Object.fromEntries(paths.map(p => [p.type, p.name]))
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={kick}>Pitch selection over the season</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['start', 'Game by game'], ['month', 'By month']] as [Period, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPeriod(v)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${period === v ? C.orange : C.line}`, background: period === v ? '#fff1ea' : '#fff', color: period === v ? C.orange : C.ink }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 400, marginTop: 8 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.soft} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: C.faint }} width={38} domain={[0, 'auto']} />
            <Tooltip
              formatter={(v: unknown, k: unknown) => [`${typeof v === 'number' ? v.toFixed(1) : v}%`, names[String(k)] ?? String(k)]}
              labelFormatter={(_, pl) => { const r = pl?.[0]?.payload as { key?: string; n?: number } | undefined; return r ? `${r.key} · ${r.n} pitches${(r.n ?? 0) < MIN_SAMPLE.arsenalPitchesPerType ? ' (small sample)' : ''}` : '' }}
            />
            {types.map(t => <Line key={t} type="linear" dataKey={t} stroke={pitchColor(t)} strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 12 }}>
        {paths.map(p => <span key={p.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(p.type) }} />{p.name}</span>)}
      </div>
      <p style={note}>Each line is that pitch&apos;s share of the pitches thrown that {period === 'start' ? 'game' : 'month'}; hover for the pitch count. A game with few pitches moves a lot, so read the shape, not one point.</p>
    </div>
  )
}

// ─── Smooth location heatmap ────────────────────────────────────────────────────────────────────────────────────────────

const X0 = -2, X1 = 2, Z0 = 0, Z1 = 4.8            // feet, batter's view (plate_x positive = right)
const GW = 100, GH = 120                              // density grid; the canvas is stretched, so the edges are smoothed too
const STOPS: [number, number, number, number, number][] = [   // [t, r, g, b, alpha]: sky blue, then yellow, orange, deep red
  [0, 108, 171, 221, 0], [0.08, 108, 171, 221, 0.35], [0.35, 253, 224, 71, 0.75], [0.65, 255, 87, 34, 0.9], [1, 179, 38, 30, 0.95],
]
function ramp(t: number): [number, number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0])
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, (a[4] + (b[4] - a[4]) * k) * 255]
    }
  }
  const e = STOPS[STOPS.length - 1]
  return [e[1], e[2], e[3], e[4] * 255]
}

export type HeatPitch = { plateX: number; plateZ: number; balls: number | null; strikes: number | null }
type CountKey = 'all' | 'first' | 'ahead' | 'behind' | 'two'
const COUNTS: [CountKey, string, (p: HeatPitch) => boolean][] = [
  ['all', 'Any count', () => true],
  ['first', 'First pitch', p => p.balls === 0 && p.strikes === 0],
  ['ahead', 'Ahead in the count', p => p.balls != null && p.strikes != null && p.strikes > p.balls],
  ['behind', 'Behind in the count', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
  ['two', 'Two strikes', p => p.strikes === 2],
]

export function SmoothHeatmap({ pitches, title, counts = true }: { pitches: HeatPitch[]; title: string; counts?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [count, setCount] = useState<CountKey>('all')
  const [bw, setBw] = useState(0.26)   // blob width in feet (standard deviation)
  const use = useMemo(() => {
    const f = COUNTS.find(c => c[0] === count)![2]
    return pitches.filter(p => f(p) && p.plateX >= X0 - 0.5 && p.plateX <= X1 + 0.5 && p.plateZ >= Z0 - 0.5 && p.plateZ <= Z1 + 0.5)
  }, [pitches, count])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const cw = (X1 - X0) / GW, ch = (Z1 - Z0) / GH
    const d = new Float32Array(GW * GH)
    const rx = Math.ceil((3 * bw) / cw), rz = Math.ceil((3 * bw) / ch)
    for (const p of use) {
      const ci = Math.floor((p.plateX - X0) / cw), cj = Math.floor((Z1 - p.plateZ) / ch)
      for (let j = Math.max(0, cj - rz); j <= Math.min(GH - 1, cj + rz); j++) {
        const dz = Z1 - (j + 0.5) * ch - p.plateZ
        for (let i = Math.max(0, ci - rx); i <= Math.min(GW - 1, ci + rx); i++) {
          const dx = X0 + (i + 0.5) * cw - p.plateX
          d[j * GW + i] += Math.exp(-(dx * dx + dz * dz) / (2 * bw * bw))
        }
      }
    }
    let max = 0
    for (let k = 0; k < d.length; k++) if (d[k] > max) max = d[k]
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(GW, GH)
    for (let k = 0; k < d.length; k++) {
      const [r, g, b, a] = max > 0 ? ramp(d[k] / max) : [0, 0, 0, 0]
      img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = a
    }
    ctx.putImageData(img, 0, 0)
  }, [use, bw])

  // SVG overlay in the same box: viewBox is feet-scaled so the zone and plate sit exactly where the data says.
  const VW = 400, VH = (VW * (Z1 - Z0)) / (X1 - X0)
  const sx = (x: number) => ((x - X0) / (X1 - X0)) * VW, sz = (z: number) => ((Z1 - z) / (Z1 - Z0)) * VH
  return (
    <div style={card}>
      <div style={kick}>{title} · location · batter&apos;s view</div>
      {counts && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        {COUNTS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setCount(k)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${count === k ? C.orange : C.line}`, background: count === k ? '#fff1ea' : '#fff', color: count === k ? C.orange : C.ink }}>{l}</button>
        ))}
      </div>}
      {use.length === 0 ? <p style={{ fontSize: 14, color: C.mute }}>No pitches in that count.</p> : (
        <div style={{ position: 'relative', width: '100%', maxWidth: 270, margin: '0 auto', aspectRatio: `${VW} / ${VH}`, background: '#fff', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.soft}` }}>
          <canvas ref={ref} width={GW} height={GH} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'auto' }} />
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
            <rect x={sx(-0.83)} y={sz(3.5)} width={sx(0.83) - sx(-0.83)} height={sz(1.5) - sz(3.5)} fill="none" stroke="#1A1A1A" strokeOpacity="0.7" strokeWidth="2" />
            <polygon points={`${sx(-0.708)},${sz(0.25)} ${sx(0.708)},${sz(0.25)} ${sx(0.708)},${sz(0.1)} ${sx(0)},${sz(-0.1)} ${sx(-0.708)},${sz(0.1)}`} fill="#fff" stroke={C.mute} />
          </svg>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: C.mute }}>
        Smoothness
        <input type="range" min="0.12" max="0.5" step="0.02" value={bw} onChange={e => setBw(Number(e.target.value))} style={{ flex: 1, maxWidth: 220, accentColor: C.orange }} aria-label="Smoothness of the heatmap" />
      </label>
      <p style={note}>{use.length} pitches, seen from behind the plate; the box is the average strike zone. Red is where the most cross. A wider smoothness shows the broad area, a narrower one the tight clusters.</p>
    </div>
  )
}
