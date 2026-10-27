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
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import type { PitchPath, MoveRow } from './PitchFlight'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, fontFamily: SANS }
const kick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }
const note: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: C.mute, lineHeight: 1.5 }

// ─── Movement profile ───────────────────────────────────────────────────────────────────────────────────────────────────

export function MovementProfile({ log, paths, movement }: { log: PitcherPitchLog; paths: PitchPath[]; movement: MoveRow[] }) {
  void movement
  // Arm-side break is positive. Seen from behind the plate, a right-hander's arm side is on the left.
  const toX = (hb: number) => (log.throws === 'R' ? -hb : hb)
  const rows = paths.map(p => ({ p, m: { avgHBreak: p.hb, avgVBreak: p.ivb } }))
  if (rows.length === 0) return <div style={{ ...card, fontSize: 14, color: C.mute }}>No movement data on record yet.</div>
  const S = 360, R = 150
  const ext = Math.max(24, ...rows.map(r => Math.max(Math.abs(r.m.avgHBreak), Math.abs(r.m.avgVBreak)))) + 3
  const px = (v: number) => S / 2 + (v / ext) * R
  const rings = [6, 12, 18, 24].filter(v => v < ext)
  return (
    <div style={card}>
      <SpinBallStyles />
      <div style={kick}>Movement profile · batter&apos;s view</div>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Average break of each pitch" style={{ width: '100%', maxWidth: 460, height: 'auto', display: 'block', margin: '6px auto 0' }}>
        {rings.map(v => <g key={v}><circle cx={S / 2} cy={S / 2} r={(v / ext) * R} fill="none" stroke={C.soft} /><text x={S / 2 + 3} y={S / 2 - (v / ext) * R - 2} fontSize="9" fill={C.faint} fontFamily={SANS}>{v}&quot;</text></g>)}
        <line x1="8" x2={S - 8} y1={S / 2} y2={S / 2} stroke={C.line} />
        <line x1={S / 2} x2={S / 2} y1="8" y2={S - 8} stroke={C.line} />
        <text x="10" y={S / 2 - 6} fontSize="10" fill={C.mute} fontFamily={SANS}>← third base</text>
        <text x={S - 10} y={S / 2 - 6} fontSize="10" fill={C.mute} textAnchor="end" fontFamily={SANS}>first base →</text>
        <text x={S / 2 + 6} y="18" fontSize="10" fill={C.mute} fontFamily={SANS}>rises</text>
        <text x={S / 2 + 6} y={S - 10} fontSize="10" fill={C.mute} fontFamily={SANS}>drops</text>
        {rows.map(({ p, m }) => {
          const x = px(toX(m.avgHBreak)), y = S / 2 - ((m.avgVBreak / ext) * R)
          return (
            <g key={p.type}>
              <circle cx={x} cy={y} r={6 + Math.sqrt(p.share) * 14} fill={pitchColor(p.type)} fillOpacity="0.8" stroke="#fff" strokeWidth="2"><title>{`${p.name}: ${m.avgHBreak > 0 ? '+' : ''}${m.avgHBreak.toFixed(1)}" arm-side, ${m.avgVBreak > 0 ? '+' : ''}${m.avgVBreak.toFixed(1)}" rise (n = ${p.n})`}</title></circle>
              <text x={x + 10 + Math.sqrt(p.share) * 14} y={y + 4} fontSize="11" fontWeight="800" fill={C.ink} fontFamily={SANS}>{p.name}</text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
        {rows.map(({ p, m }) => (
          <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <SpinBall code={p.type} size={26} spin={{ rpm: p.spin, ivb: m.avgVBreak, hb: m.avgHBreak }} />
            <span style={{ minWidth: 0 }}><b>{p.name}</b><br /><span style={{ color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{p.velo != null ? `${p.velo.toFixed(1)} mph` : '—'}{p.spin != null ? ` · ${Math.round(p.spin)} rpm` : ''}</span></span>
          </div>
        ))}
      </div>
      <p style={note}>Average break in inches, seen from behind the plate. The small ball turns the way that pitch spins, slowed about 40 times; bigger dots are used more.</p>
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
      <div style={{ width: '100%', height: 280, marginTop: 8 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" stroke={C.soft} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: C.faint }} width={38} />
            <Tooltip
              formatter={(v: unknown, k: unknown) => [`${typeof v === 'number' ? v.toFixed(1) : v}%`, names[String(k)] ?? String(k)]}
              labelFormatter={(_, pl) => { const r = pl?.[0]?.payload as { key?: string; n?: number } | undefined; return r ? `${r.key} · ${r.n} pitches${(r.n ?? 0) < MIN_SAMPLE.arsenalPitchesPerType ? ' (small sample)' : ''}` : '' }}
            />
            {types.map(t => <Area key={t} type="monotone" dataKey={t} stackId="u" stroke={pitchColor(t)} fill={pitchColor(t)} fillOpacity={0.85} isAnimationActive={false} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 12 }}>
        {paths.map(p => <span key={p.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(p.type) }} />{p.name}</span>)}
      </div>
      <p style={note}>Each slice is that pitch&apos;s share of the pitches thrown that {period === 'start' ? 'game' : 'month'}; hover for the pitch count. A game with few pitches moves a lot, so read the shape, not one point.</p>
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

type CountKey = 'all' | 'first' | 'ahead' | 'behind' | 'two'
const COUNTS: [CountKey, string, (p: RawPitch) => boolean][] = [
  ['all', 'Any count', () => true],
  ['first', 'First pitch', p => p.balls === 0 && p.strikes === 0],
  ['ahead', 'Ahead in the count', p => p.balls != null && p.strikes != null && p.strikes > p.balls],
  ['behind', 'Behind in the count', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
  ['two', 'Two strikes', p => p.strikes === 2],
]

export function SmoothHeatmap({ pitches, title }: { pitches: RawPitch[]; title: string }) {
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        {COUNTS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setCount(k)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${count === k ? C.orange : C.line}`, background: count === k ? '#fff1ea' : '#fff', color: count === k ? C.orange : C.ink }}>{l}</button>
        ))}
      </div>
      {use.length === 0 ? <p style={{ fontSize: 14, color: C.mute }}>No pitches in that count.</p> : (
        <div style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto', aspectRatio: `${VW} / ${VH}`, background: '#fff', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.soft}` }}>
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
      <p style={note}>{use.length} pitches. Seen from behind the plate; the box is the average strike zone. Red is where the most pitches cross, blue where a few do. Each pitch is a soft blob and the blobs are added up, so a wider setting shows the broad area and a narrower one the tight clusters.</p>
    </div>
  )
}
