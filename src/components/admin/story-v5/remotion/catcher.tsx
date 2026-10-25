// src/components/admin/story-v5/remotion/catcher.tsx
//
// Catcher-view stage: faint strike zone with a 3x3 grid, a mound glow and a horizon, plus pitches that fly along real 3D paths.
// Camera and projection come from ../trajectory (camera y -5 ft, z 2.5 ft, focal 1700, centre 540,580).
// A flight: the ball moves along the path with ease-in quad (it speeds up like a real pitch), leaves a tapered 40-segment trail
// (opacity and width grow toward the ball), its radius scales with distance, and on arrival it shrinks to 55% and fills with the pitch colour.

import { useCurrentFrame } from 'remotion'
import { clamp01 } from './anim'
import { useTheme } from './ui'
import { PLATE_Y, project, type P3 } from '../trajectory'

export type Flight = { points: P3[]; color: string; start: number; duration: number; trailOpacity?: number }

const BALL_FT = 0.12                                    // ball radius in feet (2.9 in diameter)
const at = (pts: P3[], f: number): P3 => {
  const x = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), k = x - i
  const a = pts[i], b = pts[i + 1]
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
}

export function Zone({ opacity = 1 }: { opacity?: number }) {
  const t = useTheme()
  const tl = project({ x: -0.708, y: PLATE_Y, z: 3.45 }), br = project({ x: 0.708, y: PLATE_Y, z: 1.55 })
  const w = br.x - tl.x, h = br.y - tl.y
  const mound = project({ x: 0, y: 60.5, z: 0.8 })
  const horizon = project({ x: 0, y: 60.5, z: 2.5 }).y
  return (
    <g opacity={opacity}>
      <ellipse cx={mound.x} cy={mound.y + 6} rx={150} ry={34} fill={t.text} opacity={t.name === 'dark' ? 0.2 : 0.07} />
      <line x1={0} x2={1080} y1={horizon} y2={horizon} stroke={t.text} strokeOpacity={0.1} strokeWidth={2} />
      {[1, 2].map(k => <line key={`v${k}`} x1={tl.x + (w * k) / 3} x2={tl.x + (w * k) / 3} y1={tl.y} y2={br.y} stroke={t.text} strokeOpacity={0.12} strokeWidth={2} />)}
      {[1, 2].map(k => <line key={`h${k}`} x1={tl.x} x2={br.x} y1={tl.y + (h * k) / 3} y2={tl.y + (h * k) / 3} stroke={t.text} strokeOpacity={0.12} strokeWidth={2} />)}
      <rect x={tl.x} y={tl.y} width={w} height={h} fill="none" stroke={t.text} strokeOpacity={0.55} strokeWidth={3} />
    </g>
  )
}

function FlightMark({ f, frame }: { f: Flight; frame: number }) {
  const t = useTheme()
  if (frame < f.start) return null
  const u = clamp01((frame - f.start) / f.duration)
  const pts = f.points
  const prog = u * u                                     // ease-in quad
  const head = at(pts, prog)
  const N = pts.length - 1
  const upto = Math.floor(prog * N)
  const segs = []
  for (let k = 0; k <= upto && k < N; k++) {
    const a = project(pts[k]), b = k === upto ? project(head) : project(pts[k + 1])
    const m = (k + 1) / N
    segs.push(<line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={f.color} strokeLinecap="round" strokeWidth={2 + 20 * m * m} strokeOpacity={(0.1 + 0.7 * m) * (f.trailOpacity ?? 1)} />)
  }
  const p = project(head)
  const landed = u >= 1
  const r = Math.max(3, BALL_FT * p.scale) * (landed ? 0.55 * 1.8 : 1.8)
  return (
    <g>
      {segs}
      <circle cx={p.x} cy={p.y} r={r} fill={landed ? f.color : t.ball} stroke={f.color} strokeWidth={landed ? 3 : 4} />
    </g>
  )
}

export function CatcherStage({ flights, height = 1350, zoneOpacity = 1 }: { flights: Flight[]; height?: number; zoneOpacity?: number }) {
  const frame = useCurrentFrame()
  return (
    <svg width={1080} height={height} viewBox={`0 0 1080 ${height}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Zone opacity={zoneOpacity} />
      {flights.map((f, i) => <FlightMark key={i} f={f} frame={frame} />)}
    </svg>
  )
}
