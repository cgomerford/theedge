'use client'

// src/components/games/FieldView.tsx
//
// A top-down view of the ballpark with the selected batted ball flying to where it came down.
//   • The outfield wall is drawn from the park's published distances (left line … right line), so each
//     stadium has its own shape. A marker a park doesn't publish is skipped, never estimated.
//   • The landing spot is MLB's field coordinate (home plate ≈ 125, 199; 2.5 ft per unit — checked against the
//     feed's own distance on a fly ball: 358 ft computed vs 358 ft reported).
//   • The ball's rise comes from the launch angle (a simple parabola); the shadow stays on the ground.
// Wall HEIGHTS are not in MLB's data, so they are not shown. Runs only when `armed` (after the pitches played).

import { useEffect, useMemo, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import type { ExField, ExPitch } from '@/lib/game-explorer'
import { CALL_COLOR } from '@/components/games/gamesUi'

const FT_PER_UNIT = 2.5, HOME_X = 125.42, HOME_Y = 198.27
const MARKERS: { key: keyof ExField; deg: number }[] = [
  { key: 'leftLine', deg: -45 }, { key: 'left', deg: -30 }, { key: 'leftCenter', deg: -15 }, { key: 'center', deg: 0 },
  { key: 'rightCenter', deg: 15 }, { key: 'right', deg: 30 }, { key: 'rightLine', deg: 45 },
]
const pol = (d: number, deg: number): [number, number] => [d * Math.sin((deg * Math.PI) / 180), d * Math.cos((deg * Math.PI) / 180)]

/** Smooth curve through the fence points (Catmull-Rom → cubic Béziers). Points are [x, y] in feet, y up. */
function curve(pts: [number, number][], f: (p: [number, number]) => [number, number]): string {
  const P = pts.map(f)
  let d = `M${P[0][0]} ${P[0][1]}`
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] ?? P[i + 1]
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`
  }
  return d
}

export default function FieldView({ field, venue, pitch, armed }: { field: ExField; venue: string; pitch: ExPitch; armed: boolean }) {
  const [t, setT] = useState(0)            // 0 → 1 flight progress
  const [run, setRun] = useState(0)

  const fence = useMemo(() => MARKERS.filter(m => field[m.key] != null).map(m => ({ ...m, d: field[m.key] as number })), [field])
  const hasWall = fence.length >= 3
  const land = useMemo(() => {
    if (pitch.hx == null || pitch.hy == null) return null
    const x = (pitch.hx - HOME_X) * FT_PER_UNIT, y = (HOME_Y - pitch.hy) * FT_PER_UNIT
    return { x, y, d: Math.hypot(x, y) }
  }, [pitch.hx, pitch.hy])

  const la = pitch.la ?? 0
  const air = la >= 10                                           // line drives and fly balls leave the ground
  const apex = !land || !air ? 0 : Math.min(130, Math.max(8, (land.d * Math.tan((Math.min(la, 70) * Math.PI) / 180)) / 4))
  const ms = !land ? 0 : air ? 900 + land.d * 4 : 600 + land.d * 5

  useEffect(() => {
    if (!armed || !land) return
    let raf = 0, start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const k = Math.min(1, (now - start) / ms)
      setT(k)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [armed, land, ms, run])

  if (!land) {
    return <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.mute, fontSize: 13 }}><b style={{ display: 'block', color: C.ink }}>No hit location</b>MLB did not record where this ball landed.</div>
  }

  // view: wide enough for the foul lines, tall enough for the wall (and a ball hit over it)
  const maxD = Math.max(land.d, ...fence.map(f => f.d), 330) + 18
  const vx = maxD * 0.74, top = maxD + 10
  const S = (p: [number, number]): [number, number] => [p[0], -p[1]]   // plan (y up) → screen (y down)
  const wall = hasWall ? fence.map(f => pol(f.d, f.deg)) : []
  const grass = hasWall ? `M0 0 L${wall[0][0]} ${-wall[0][1]} ${curve(wall, S).replace(/^M[^C]*/, '')} L0 0 Z` : ''

  // ball position at progress t (plan coordinates, y up; the rise is added to screen y)
  const ease = air ? t : 1 - Math.pow(1 - t, 2)                   // an air ball keeps its speed; a ground ball slows
  const gx = land.x * ease, gy = land.y * ease
  const rise = 4 * apex * t * (1 - t)
  const steps = Math.max(2, Math.round(t * 40))
  const trail = Array.from({ length: steps }, (_, i) => {
    const u = (i / (steps - 1)) * t, e = air ? u : 1 - Math.pow(1 - u, 2)
    return `${land.x * e},${-(land.y * e) - 4 * apex * u * (1 - u)}`
  }).join(' ')
  const col = CALL_COLOR.in_play
  const landed = armed && t >= 1
  const bases: [number, number][] = [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]]

  return (
    <div style={{ fontFamily: SANS }}>
      <svg viewBox={`${-vx} ${-top} ${vx * 2} ${top + 34}`} width="100%" role="img" aria-label={`${venue}: where the ball landed`}>
        <defs><clipPath id="gm-wedge"><path d={grass || `M0 0 L${-vx} ${-vx} L${vx} ${-vx} Z`} /></clipPath></defs>
        {hasWall ? <path d={grass} fill="#e4efd9" /> : <path d={`M0 0 L${-maxD * 0.707} ${-maxD * 0.707} L${maxD * 0.707} ${-maxD * 0.707} Z`} fill="#e4efd9" />}
        <g clipPath="url(#gm-wedge)">
          <circle cx={0} cy={-60.5} r={95} fill="#e8d7b8" />                                   {/* infield dirt */}
          <polygon points={`0,-12 ${bases[0][0] - 8},${-bases[0][1]} 0,${-bases[1][1] + 10} ${bases[2][0] + 8},${-bases[2][1]}`} fill="#e4efd9" />
        </g>
        {hasWall && <path d={curve(wall, S)} fill="none" stroke="#1A1A1A" strokeWidth={3} />}
        <line x1={0} y1={0} x2={hasWall ? wall[0][0] : -maxD * 0.707} y2={hasWall ? -wall[0][1] : -maxD * 0.707} stroke="#fff" strokeWidth={1.5} />
        <line x1={0} y1={0} x2={hasWall ? wall[wall.length - 1][0] : maxD * 0.707} y2={hasWall ? -wall[wall.length - 1][1] : -maxD * 0.707} stroke="#fff" strokeWidth={1.5} />
        {hasWall && fence.map(f => { const [x, y] = pol(f.d + 14, f.deg); return <text key={f.key} x={x} y={-y + 4} fontSize={12} fontWeight={700} fill="#5b5347" textAnchor="middle">{f.d}</text> })}
        {bases.map((b, i) => <rect key={i} x={b[0] - 4.5} y={-b[1] - 4.5} width={9} height={9} fill="#fff" stroke="#8a8275" transform={`rotate(45 ${b[0]} ${-b[1]})`} />)}
        <circle cx={0} cy={-60.5} r={6} fill="#e8d7b8" stroke="#a89e8c" />
        <polygon points="-5,2 5,2 5,-3 0,-8 -5,-3" fill="#fff" stroke="#8a8275" />

        {armed && <polyline points={trail} fill="none" stroke={col} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={landed ? 0.35 : 0.7} />}
        {armed && t > 0 && t < 1 && apex > 0 && <ellipse cx={gx} cy={-gy} rx={5} ry={2.5} fill="#1A1A1A" opacity={0.25} />}
        {armed && t > 0 && <circle cx={gx} cy={-gy - rise} r={landed ? 7 : 6} fill={landed ? col : '#fff'} stroke="#1A1A1A" strokeWidth={2} />}
        {landed && <circle cx={land.x} cy={-land.y} r={7} fill="none" stroke={col} strokeWidth={2} style={{ transformOrigin: `${land.x}px ${-land.y}px`, animation: 'gm-ring 1s ease-out 1' }} />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: '#5b5347' }}>
          {venue}{hasWall ? ` · wall ${fence.map(f => f.d).join(' – ')} ft` : ' · wall distances not published'}
        </span>
        <button type="button" className="gm-btn" onClick={() => { setT(0); setRun(r => r + 1) }} aria-label="Replay the hit"
          style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 4, padding: '4px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>↻ Replay</button>
      </div>
      <div style={{ fontSize: 9.5, color: C.faint, marginTop: 6 }}>Top-down view, home plate at the bottom. Landing spot: MLB tracking. Rise estimated from the launch angle. Wall heights not shown (not in MLB&apos;s data).</div>
    </div>
  )
}

export const FIELD_CSS = '@keyframes gm-ring{from{transform:scale(1);opacity:.9}to{transform:scale(3.2);opacity:0}}'
