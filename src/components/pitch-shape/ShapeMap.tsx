'use client'

// src/components/pitch-shape/ShapeMap.tsx
//
// A small movement map in the same look as the league map (warm background, ride up, run toward the arm side, numbered axes), zoomed to whatever it is given. Used for one pitcher's pitches
// (his sampled pitches as dots, his average as a ring, the league window as a dashed box, the movement dialed in as a cross) and for the same pitch at each level (one ring per level).
// Both axes use the same inches per pixel, so a distance on the map is a true distance in movement. Plain data in, no fetching. Description only: it plots where pitches moved.

import { C } from '@/components/team/ui'
import { placeLabels } from './labelLayout'

export type MapDot = { hb: number; ivb: number; color: string; opacity?: number }
export type MapRing = { hb: number; ivb: number; color: string; label: string; /** dashed ring: an average, not a pitcher */ dashed?: boolean; strong?: boolean }
export type MapBox = { hb: number; ivb: number; rx: number; ry: number; color?: string }
export type MapMark = { hb: number; ivb: number; label: string; color: string }

const W = 440, ML = 38, MB = 30, MT = 10, MR = 10

/** a round step (1, 2, 5, 10) giving about five ticks across the range */
function stepFor(range: number) {
  const raw = range / 5, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

export default function ShapeMap({ dots = [], rings = [], box, marks = [], lines = [], label, minRange = 8 }: {
  dots?: MapDot[]; rings?: MapRing[]; box?: MapBox | null; marks?: MapMark[]
  /** dashed lines joining rings, in order (a pitch moving from one level to the next) */
  lines?: [number, number][][]
  label: string
  /** the narrowest span shown, inches: keeps a tight cluster from being blown up into noise */
  minRange?: number
}) {
  const xs = [...dots.map(d => d.hb), ...rings.map(r => r.hb), ...marks.map(m => m.hb), ...(box ? [box.hb - box.rx, box.hb + box.rx] : [])]
  const ys = [...dots.map(d => d.ivb), ...rings.map(r => r.ivb), ...marks.map(m => m.ivb), ...(box ? [box.ivb - box.ry, box.ivb + box.ry] : [])]
  if (xs.length === 0 || ys.length === 0) return null
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), minRange) + 3   // the same span on both axes, with a margin for the ring labels
  const x0 = cx - range / 2, y0 = cy - range / 2
  const PW = W - ML - MR, PH = PW   // a square plot
  const H = PH + MT + MB
  const X = (v: number) => ML + ((v - x0) / range) * PW, Y = (v: number) => MT + PH - ((v - y0) / range) * PH
  const step = stepFor(range)
  // names for the rings and crosses, placed so none overlap each other or another marker
  const labelItems = [...rings.map((r2, i) => ({ id: i, x: X(r2.hb), y: Y(r2.ivb), text: r2.label })), ...marks.map((m, i) => ({ id: 1000 + i, x: X(m.hb), y: Y(m.ivb), text: m.label }))]
  const placed = placeLabels(labelItems, { fs: 10.5, r: 9, x0: ML + 2, y0: MT + 2, x1: ML + PW - 2, y1: MT + PH - 2 })
  const at = (id: number) => placed.find(p => p.id === id)
  const ticks = (a: number, b: number) => { const out: number[] = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 100) / 100); return out }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x={ML} y={MT} width={PW} height={PH} rx={6} fill="#EDE8DC" stroke={C.line} />
      {ticks(x0, x0 + range).map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={MT} y2={MT + PH} stroke="#fff" strokeOpacity={0.7} /><text x={X(v)} y={MT + PH + 16} textAnchor="middle" fontSize="10.5" fill={C.mute}>{v}</text></g>)}
      {ticks(y0, y0 + range).map(v => <g key={`y${v}`}><line x1={ML} x2={ML + PW} y1={Y(v)} y2={Y(v)} stroke="#fff" strokeOpacity={0.7} /><text x={ML - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill={C.mute}>{v}</text></g>)}
      <text x={ML + 8} y={MT + 16} fontSize="10" fontWeight={800} letterSpacing=".1em" fill={C.mute}>↑ RIDE (IN)</text>
      <text x={ML + PW - 8} y={MT + PH - 8} fontSize="10" fontWeight={800} letterSpacing=".1em" fill={C.mute} textAnchor="end">RUN (IN) →</text>
      {box && <rect x={X(box.hb - box.rx)} y={Y(box.ivb + box.ry)} width={X(box.hb + box.rx) - X(box.hb - box.rx)} height={Y(box.ivb - box.ry) - Y(box.ivb + box.ry)} fill="rgba(255,255,255,.18)" stroke={box.color ?? C.ink} strokeWidth={1.5} strokeDasharray="5 4" />}
      {lines.map((ln, i) => <polyline key={i} points={ln.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')} fill="none" stroke="#8a8275" strokeWidth={1.3} strokeDasharray="4 3" />)}
      {dots.map((d, i) => <circle key={i} cx={X(d.hb)} cy={Y(d.ivb)} r={3} fill={d.color} fillOpacity={d.opacity ?? 0.55} />)}
      {labelItems.map(it => { const l = at(it.id); return l && l.leader ? <line key={`ln${it.id}`} x1={it.x} y1={it.y} x2={l.x} y2={l.y - 3} stroke={C.ink} strokeWidth={0.8} strokeOpacity={0.5} /> : null })}
      {rings.map((r, i) => <circle key={`r${i}`} cx={X(r.hb)} cy={Y(r.ivb)} r={r.strong ? 12 : 10} fill={r.color} fillOpacity={r.dashed ? 0.08 : 0.22} stroke={r.color} strokeWidth={r.strong ? 3 : 2} strokeDasharray={r.dashed ? '4 3' : undefined} />)}
      {marks.map((m, i) => <path key={`m${i}`} d={`M${X(m.hb) - 6},${Y(m.ivb)}H${X(m.hb) + 6}M${X(m.hb)},${Y(m.ivb) - 6}V${Y(m.ivb) + 6}`} stroke={m.color} strokeWidth={2.5} strokeLinecap="round" />)}
      {rings.map((r, i) => { const l = at(i); return l ? <text key={`rt${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize="10.5" fontWeight={800} fill={r.color} stroke="#EDE8DC" strokeWidth={3} paintOrder="stroke">{r.label}</text> : null })}
      {marks.map((m, i) => { const l = at(1000 + i); return l ? <text key={`mt${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize="10.5" fontWeight={800} fill={m.color} stroke="#EDE8DC" strokeWidth={3} paintOrder="stroke">{m.label}</text> : null })}
    </svg>
  )
}
