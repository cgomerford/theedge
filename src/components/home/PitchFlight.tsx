'use client'

import { useEffect, useRef, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { PLATE_Y, project, type P3 } from '@/components/admin/story-v5/trajectory'
import type { FlightPath } from '@/lib/mlb-homepage'

// His pitches being thrown, from behind the plate. Same engine as the Story v5 catcher view: real 3D paths from his release
// point, one camera, a faint strike zone and mound, a tapered trail that grows toward the ball, ease-in so the ball speeds
// up like a real pitch, and on arrival the ball shrinks and fills with the pitch colour.
//
// The server HTML is the finished picture (every trail drawn, every landing filled). The motion runs in the browser only
// while the panel is on screen, and not at all if the visitor prefers reduced motion.

const MUTED = '#8a8275'
const BALL_FT = 0.12
const FLY_MS = 900, GAP_MS = 250, HOLD_MS = 1300
const VIEW = { x: 250, y: 300, w: 580, h: 700 }

const at = (pts: P3[], f: number): P3 => {
  const x = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), k = x - i
  const a = pts[i], b = pts[i + 1]
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
}

function Stage() {
  const tl = project({ x: -0.708, y: PLATE_Y, z: 3.45 }), br = project({ x: 0.708, y: PLATE_Y, z: 1.55 })
  const w = br.x - tl.x, h = br.y - tl.y
  const mound = project({ x: 0, y: 60.5, z: 0.8 })
  const horizon = project({ x: 0, y: 60.5, z: 2.5 }).y
  return (
    <g>
      <ellipse cx={mound.x} cy={mound.y + 6} rx={150} ry={34} fill="#1A1A1A" opacity={0.07} />
      <line x1={VIEW.x} x2={VIEW.x + VIEW.w} y1={horizon} y2={horizon} stroke="#1A1A1A" strokeOpacity={0.1} strokeWidth={2} />
      {[1, 2].map(k => <line key={`v${k}`} x1={tl.x + (w * k) / 3} x2={tl.x + (w * k) / 3} y1={tl.y} y2={br.y} stroke="#1A1A1A" strokeOpacity={0.12} strokeWidth={2} />)}
      {[1, 2].map(k => <line key={`h${k}`} x1={tl.x} x2={br.x} y1={tl.y + (h * k) / 3} y2={tl.y + (h * k) / 3} stroke="#1A1A1A" strokeOpacity={0.12} strokeWidth={2} />)}
      <rect x={tl.x} y={tl.y} width={w} height={h} fill="none" stroke="#1A1A1A" strokeOpacity={0.55} strokeWidth={3} />
    </g>
  )
}

/** One pitch at progress u (0..1 of its flight; 1 = landed). `trailOpacity` fades older pitches back. */
function Flight({ f, u, trailOpacity }: { f: FlightPath; u: number; trailOpacity: number }) {
  const color = pitchColor(f.code)
  const pts = f.points
  const prog = u * u
  const head = at(pts, prog)
  const N = pts.length - 1
  const upto = Math.floor(prog * N)
  const segs = []
  for (let k = 0; k <= upto && k < N; k++) {
    const a = project(pts[k]), b = k === upto ? project(head) : project(pts[k + 1])
    const m = (k + 1) / N
    segs.push(<line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeLinecap="round" strokeWidth={2 + 20 * m * m} strokeOpacity={(0.1 + 0.7 * m) * trailOpacity} />)
  }
  const p = project(head)
  const landed = u >= 1
  const r = Math.max(3, BALL_FT * p.scale) * (landed ? 0.55 * 1.8 : 1.8)
  return (
    <g>
      {segs}
      <circle cx={p.x} cy={p.y} r={r} fill={landed ? color : '#fff'} stroke={color} strokeWidth={landed ? 3 : 4} />
    </g>
  )
}

export default function PitchFlight({ flights, throughLabel }: { flights: FlightPath[]; throughLabel: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState<number | null>(null) // null = finished picture (server HTML, reduced motion, off screen)
  const cycle = flights.length * (FLY_MS + GAP_MS) + HOLD_MS

  useEffect(() => {
    if (!rootRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0, start = 0, visible = false
    const step = (now: number) => {
      if (!visible) return
      if (!start) start = now
      setT((now - start) % cycle)
      raf = requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) { start = 0; raf = requestAnimationFrame(step) } else { cancelAnimationFrame(raf); setT(null) }
    })
    io.observe(rootRef.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [cycle])

  const slot = FLY_MS + GAP_MS
  const current = t == null ? -1 : Math.min(flights.length - 1, Math.floor(t / slot))
  const progress = (i: number) => (t == null ? 1 : Math.max(0, Math.min(1, (t - i * slot) / FLY_MS)))
  const active = t != null && current >= 0 && t < flights.length * slot ? flights[current].code : null

  return (
    <div ref={rootRef}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', color: MUTED, marginBottom: 6 }}>HIS PITCHES, THROWN</div>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Illustrative path of each of his pitch types from release to the strike zone" style={{ width: '100%', maxWidth: 340, height: 'auto', display: 'block' }}>
        <Stage />
        {flights.map((f, i) => {
          const u = progress(i)
          if (t != null && u <= 0) return null
          return <Flight key={f.code} f={f} u={u} trailOpacity={t == null || i < current ? 0.45 : 1} />
        })}
      </svg>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {flights.map(f => (
          <li key={f.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active === f.code ? 800 : 600 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, background: pitchColor(f.code), display: 'inline-block' }} />
            {f.label} <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{f.usagePct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Illustrative path from his average movement and location · {throughLabel}</div>
    </div>
  )
}
