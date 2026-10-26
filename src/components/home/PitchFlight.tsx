'use client'

import { useEffect, useRef, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import type { FlightPath } from '@/lib/mlb-homepage'

// The starter's pitches being thrown, from behind the plate: each type's average flight (from his own release point,
// velocity and movement) toward the strike zone, one after another. The server HTML is the finished picture (all paths
// and landing spots drawn); the moving ball is added in the browser, only while the panel is on screen, and not at all
// when the visitor prefers reduced motion.

const W = 320, H = 366
const FLIGHT_MS = 1000, GAP_MS = 350
const MUTED = '#8a8275'

export default function PitchFlight({ flights, zone, throughLabel }: { flights: FlightPath[]; zone: { x0: number; x1: number; y0: number; y1: number }; throughLabel: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [ball, setBall] = useState<{ x: number; y: number; r: number; color: string } | null>(null)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !rootRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let visible = false
    let start = 0
    const cycle = FLIGHT_MS + GAP_MS
    const step = (now: number) => {
      if (!visible) return
      if (!start) start = now
      const e = now - start
      const idx = Math.floor(e / cycle) % flights.length
      const local = e % cycle
      const f = flights[idx]
      if (local < FLIGHT_MS) {
        const p = (local / FLIGHT_MS) * (f.pts.length - 1)
        const i = Math.min(f.pts.length - 2, Math.floor(p)), k = p - i
        const a = f.pts[i], b = f.pts[i + 1]
        setBall({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, r: a[2] + (b[2] - a[2]) * k, color: pitchColor(f.code) })
      } else {
        setBall(null)
      }
      setActive(f.code)
      raf = requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) { start = 0; raf = requestAnimationFrame(step) } else { cancelAnimationFrame(raf); setBall(null); setActive(null) }
    })
    io.observe(rootRef.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [flights])

  const zoneW = zone.x1 - zone.x0, zoneH = zone.y1 - zone.y0
  return (
    <div ref={rootRef}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', color: MUTED, marginBottom: 6 }}>HIS PITCHES, THROWN</div>
      <svg viewBox={`0 84 ${W} ${H - 84}`} role="img" aria-label="Illustrative path of each of his pitch types from release to the strike zone" style={{ width: '100%', maxWidth: 340, height: 'auto', display: 'block' }}>
        {/* mound and plate, far and near */}
        <ellipse cx={W / 2} cy={104} rx={26} ry={6} fill="#e7e2d8" />
        <path d={`M${W / 2 - 20} 342 h40 v7 l-20 10 l-20 -10 z`} fill="#fff" stroke="#c9c4b6" />
        {/* strike zone */}
        <rect x={zone.x0} y={zone.y0} width={zoneW} height={zoneH} fill="none" stroke="#8a8275" strokeWidth={1.5} />
        {[1, 2].map(i => <line key={`v${i}`} x1={zone.x0 + (zoneW * i) / 3} x2={zone.x0 + (zoneW * i) / 3} y1={zone.y0} y2={zone.y1} stroke="#d8d2c4" />)}
        {[1, 2].map(i => <line key={`h${i}`} y1={zone.y0 + (zoneH * i) / 3} y2={zone.y0 + (zoneH * i) / 3} x1={zone.x0} x2={zone.x1} stroke="#d8d2c4" />)}
        {/* each type's path (final state) and landing spot */}
        {flights.map(f => {
          const c = pitchColor(f.code)
          const d = f.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
          const on = active === f.code
          return (
            <g key={f.code}>
              <path d={d} fill="none" stroke={c} strokeWidth={on ? 2.6 : 1.6} strokeDasharray="4 3" opacity={on ? 1 : 0.55} />
              <circle cx={f.plate[0]} cy={f.plate[1]} r={on ? 7 : 5} fill={c} opacity={on ? 0.95 : 0.7} />
            </g>
          )
        })}
        {ball && <circle cx={ball.x} cy={ball.y} r={ball.r} fill={ball.color} stroke="#1A1A1A" strokeWidth={0.8} />}
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
