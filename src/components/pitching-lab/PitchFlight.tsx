'use client'

// src/components/pitching-lab/PitchFlight.tsx
//
// Pitching Lab → Arsenal: every pitch as a short animation seen from behind the plate (the batter's view), and the release
// points of every pitch on one chart in the same view. Both are drawn from Statcast's own per-pitch flight fit (vx0..az, the
// same fields the Savant pitch log already carries) averaged per pitch type, so the path, the speed and the plate crossing
// are measured, not drawn by hand. Nothing is estimated: a pitch with no flight data shows an empty state.
//
// Coordinates (feet): x is across the plate from the catcher's side (right = first base), y runs from the plate (0) out to the
// mound, z is height. Time is solved from y(t) = plate front (17 in), and position follows p0 + v0*t + a*t^2/2.

import { useEffect, useMemo, useRef, useState } from 'react'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'

const PLATE_Y = 17 / 12
const CAM_Y = -3        // the eye sits 3 ft behind the front of the plate
const CAM_Z = 2.6       // looking at about knee-to-belt height so a falling curveball stays in frame
const F = 250           // focal length in px
const W = 300, H = 345, CX = 150, CY = 165

type Pt = { x: number; y: number; z: number }
export type PitchPath = {
  type: string; name: string; n: number; share: number
  pts: Pt[]; T: number
  release: Pt; plate: Pt
  velo: number | null; spin: number | null; ext: number | null
  // Savant's own break in inches against a spin-free path (arm-side positive, rise positive).
  hb: number; ivb: number
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

/** One representative path per pitch type: the mean of Statcast's flight-fit numbers across that pitch's throws. */
export function buildPaths(log: PitcherPitchLog): PitchPath[] {
  const by = new Map<string, RawPitch[]>()
  for (const p of log.pitches) {
    if (!by.has(p.pitchType)) by.set(p.pitchType, [])
    by.get(p.pitchType)!.push(p)
  }
  const total = log.pitches.length || 1
  const out: PitchPath[] = []
  for (const [type, ps] of by) {
    const tr = ps.filter(p => p.traj).map(p => p.traj as number[])
    if (tr.length === 0) continue
    const m = [0, 1, 2, 3, 4, 5, 6].map(k => mean(tr.map(t => t[k]))!)
    const [vx0, vy0, vz0, ax, ay, az, ry] = m
    const rx = mean(ps.filter(p => p.releasePosX != null).map(p => p.releasePosX as number))
    const rz = mean(ps.filter(p => p.releasePosZ != null).map(p => p.releasePosZ as number))
    if (rx == null || rz == null) continue
    // Statcast's fit is anchored at y = 50 ft (s = 0). The release point is a little earlier (s = -tau); the plate front is at s = T.
    const g1 = ry - 50
    const qa = ay / 2
    if (!(qa !== 0)) continue
    // release: ry = 50 - vy0*tau + ay*tau^2/2 with tau > 0
    const dr = vy0 * vy0 + 4 * qa * g1
    if (dr < 0) continue
    const tau = Math.max(0, (vy0 + Math.sqrt(dr)) / (2 * qa))
    const rel = (c0: number, v0: number, a0: number) => c0 + v0 * tau - (a0 * tau * tau) / 2   // position at s = 0 from the release value
    const x50 = rel(rx, vx0, ax), z50 = rel(rz, vz0, az)
    const A = ay / 2, B = vy0, Cc = 50 - PLATE_Y
    const disc = B * B - 4 * A * Cc
    if (!(disc > 0)) continue
    const roots = [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)].filter(t => t > 0)
    if (roots.length === 0) continue
    const T50 = Math.min(...roots)
    const T = tau + T50
    const at = (u: number): Pt => { const s0 = u - tau; return { x: x50 + vx0 * s0 + (ax * s0 * s0) / 2, y: 50 + vy0 * s0 + (ay * s0 * s0) / 2, z: z50 + vz0 * s0 + (az * s0 * s0) / 2 } }
    const pts = Array.from({ length: 61 }, (_, i) => at((T * i) / 60))
    const pf = ps.filter(p => p.pfx).map(p => p.pfx as [number, number])
    const pfxX = mean(pf.map(v => v[0])), pfxZ = mean(pf.map(v => v[1]))
    out.push({
      type, name: log.pitchNames[type] ?? type, n: ps.length, share: ps.length / total, pts, T,
      release: pts[0], plate: pts[60],
      hb: pfxX == null ? 0 : (log.throws === 'R' ? -1 : 1) * pfxX * 12, ivb: pfxZ == null ? 0 : pfxZ * 12,
      velo: mean(ps.filter(p => p.velo != null).map(p => p.velo as number)),
      spin: mean(ps.filter(p => p.spinRate != null).map(p => p.spinRate as number)),
      ext: mean(ps.filter(p => p.extension != null).map(p => p.extension as number)),
    })
  }
  return out.sort((a, b) => b.n - a.n)
}

const proj = (p: Pt) => {
  const d = p.y - CAM_Y
  return { sx: CX + (F * p.x) / d, sy: CY - (F * (p.z - CAM_Z)) / d, r: (F * 0.12) / d }
}

function Scene({ paths, p, showPlate }: { paths: PitchPath[]; p: number; showPlate: boolean }) {
  const zl = proj({ x: -0.83, y: PLATE_Y, z: 3.5 }), zr = proj({ x: 0.83, y: PLATE_Y, z: 1.5 })
  const pl = proj({ x: -0.708, y: PLATE_Y, z: 0 }), pr = proj({ x: 0.708, y: PLATE_Y, z: 0 })
  const mound = proj({ x: 0, y: 60.5 - 1.4, z: 0.8 })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A pitch seen from behind the plate" style={{ width: '100%', height: 'auto', display: 'block', background: '#fff', borderRadius: 10 }}>
      <rect x="0" y={mound.sy - 6} width={W} height={H} fill="#f6f2ea" />
      <line x1="0" x2={W} y1={mound.sy - 6} y2={mound.sy - 6} stroke={C.line} />
      {showPlate && <rect x={zl.sx} y={zl.sy} width={zr.sx - zl.sx} height={zr.sy - zl.sy} fill="none" stroke={C.mute} strokeWidth="1.5" />}
      <polygon points={`${pl.sx},${pl.sy} ${pr.sx},${pr.sy} ${(pl.sx + pr.sx) / 2 + 20},${pl.sy + 16} ${(pl.sx + pr.sx) / 2 - 20},${pl.sy + 16}`} fill="#fff" stroke={C.mute} />
      {paths.map(pa => {
        const k = Math.min(60, Math.max(0, Math.round(p * 60)))
        const trail = pa.pts.slice(0, k + 1).map(q => { const s = proj(q); return `${s.sx.toFixed(1)},${s.sy.toFixed(1)}` }).join(' ')
        const ball = proj(pa.pts[k])
        const col = pitchColor(pa.type)
        return (
          <g key={pa.type}>
            <polyline points={trail} fill="none" stroke={col} strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
            <circle cx={ball.sx} cy={ball.sy} r={Math.max(2.2, ball.r * 1.35)} fill={col} stroke="#1A1A1A" strokeOpacity="0.35" />
          </g>
        )
      })}
    </svg>
  )
}

/** Plays once through, holds on the plate, then loops. Pauses when scrolled out of view. */
export function FlightPlayer({ paths, slow, showPlate = true }: { paths: PitchPath[]; slow: number; showPlate?: boolean }) {
  const [p, setP] = useState(0)
  const [run, setRun] = useState(0)
  const [visible, setVisible] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const dur = Math.max(...paths.map(x => x.T)) * 1000 * slow

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(es => setVisible(es[0]?.isIntersecting ?? false), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let raf = 0
    const t0 = performance.now()
    const HOLD = 900
    const tick = (now: number) => {
      const t = now - t0
      if (t < dur + HOLD) {
        // Each pitch finishes on its own clock: a faster pitch lands first.
        setP(Math.min(1, t / dur))
        raf = requestAnimationFrame(tick)
      } else setRun(r => r + 1)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, dur, run])

  // Per-pitch progress by its own flight time, so a 100 mph pitch beats a 78 mph curve to the plate.
  const longest = Math.max(...paths.map(x => x.T))
  const scoped = paths.map(pa => ({ pa, p: Math.min(1, (p * longest) / pa.T) }))
  return (
    <div ref={box}>
      {paths.length === 1
        ? <Scene paths={paths} p={scoped[0].p} showPlate={showPlate} />
        : <MultiScene scoped={scoped} showPlate={showPlate} />}
      <button type="button" onClick={() => setRun(r => r + 1)} style={{ marginTop: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Replay</button>
    </div>
  )
}

function MultiScene({ scoped, showPlate }: { scoped: { pa: PitchPath; p: number }[]; showPlate: boolean }) {
  // One SVG with each pitch at its own progress: draw the scene per pitch group on top of a shared base.
  const base = <Scene paths={[]} p={0} showPlate={showPlate} />
  return (
    <div style={{ position: 'relative' }}>
      {base}
      <div style={{ position: 'absolute', inset: 0 }}>
        {scoped.map(({ pa, p }) => (
          <div key={pa.type} style={{ position: 'absolute', inset: 0 }}>
            <TransparentScene pa={pa} p={p} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TransparentScene({ pa, p }: { pa: PitchPath; p: number }) {
  const k = Math.min(60, Math.max(0, Math.round(p * 60)))
  const trail = pa.pts.slice(0, k + 1).map(q => { const s = proj(q); return `${s.sx.toFixed(1)},${s.sy.toFixed(1)}` }).join(' ')
  const ball = proj(pa.pts[k])
  const col = pitchColor(pa.type)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
      <polyline points={trail} fill="none" stroke={col} strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      <circle cx={ball.sx} cy={ball.sy} r={Math.max(2.2, ball.r * 1.35)} fill={col} stroke="#1A1A1A" strokeOpacity="0.35" />
    </svg>
  )
}

/** Release points of every pitch, from the batter's side (a right-hander is released on the left). */
export function ReleaseView({ log, hidden }: { log: PitcherPitchLog; hidden: Set<string> }) {
  const pts = useMemo(() => log.pitches.filter(p => p.releasePosX != null && p.releasePosZ != null), [log])
  const types = useMemo(() => [...new Set(pts.map(p => p.pitchType))], [pts])
  if (pts.length === 0) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute }}>No release-point data for this pitcher yet.</p>
  const xs = pts.map(p => p.releasePosX as number), zs = pts.map(p => p.releasePosZ as number)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const half = Math.max(1.2, (Math.max(...xs) - Math.min(...xs)) / 2 + 0.3, (Math.max(...zs) - Math.min(...zs)) / 2 + 0.3)
  const S = 300, sc = (S - 40) / (2 * half)
  const X = (x: number) => S / 2 + (x - cx) * sc, Y = (z: number) => S / 2 - (z - cz) * sc
  const ticks = [-2, -1, 0, 1, 2].map(i => Math.round(cx) + i).filter(v => Math.abs(v - cx) <= half)
  const zt = [-2, -1, 0, 1, 2].map(i => Math.round(cz) + i).filter(v => Math.abs(v - cz) <= half)
  return (
    <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Release points seen from behind the plate" style={{ width: '100%', height: 'auto', display: 'block', background: '#fff', borderRadius: 10 }}>
      {ticks.map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1="10" y2={S - 22} stroke={C.soft} /><text x={X(v)} y={S - 8} textAnchor="middle" fontSize="10" fill={C.faint} fontFamily={SANS}>{v} ft</text></g>)}
      {zt.map(v => <g key={`z${v}`}><line x1="30" x2={S - 8} y1={Y(v)} y2={Y(v)} stroke={C.soft} /><text x="26" y={Y(v) + 3} textAnchor="end" fontSize="10" fill={C.faint} fontFamily={SANS}>{v}</text></g>)}
      {x0Line(X(0), S)}
      {types.filter(t => !hidden.has(t)).map(t => pts.filter(p => p.pitchType === t).map((p, i) => (
        <circle key={`${t}${i}`} cx={X(p.releasePosX as number)} cy={Y(p.releasePosZ as number)} r="2.6" fill={pitchColor(t)} fillOpacity="0.28" />
      )))}
      {types.filter(t => !hidden.has(t)).map(t => {
        const g = pts.filter(p => p.pitchType === t)
        const mx = g.reduce((s, p) => s + (p.releasePosX as number), 0) / g.length, mz = g.reduce((s, p) => s + (p.releasePosZ as number), 0) / g.length
        return <circle key={`m${t}`} cx={X(mx)} cy={Y(mz)} r="6" fill={pitchColor(t)} stroke="#1A1A1A" strokeWidth="1.5"><title>{`${log.pitchNames[t] ?? t}: average release ${mx.toFixed(2)} ft across, ${mz.toFixed(2)} ft high (n = ${g.length})`}</title></circle>
      })}
    </svg>
  )
}
const x0Line = (x: number, S: number) => <line x1={x} x2={x} y1="10" y2={S - 22} stroke={C.mute} strokeDasharray="3 3" />

const num = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d))
export type MoveRow = { pitchType: string; avgHBreak: number | null; avgVBreak: number | null }

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }
const kick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }

export function SpeedToggle({ slow, setSlow }: { slow: number; setSlow: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: C.mute }}>
      Speed
      {[{ l: 'Slow', v: 6 }, { l: 'Real time', v: 1 }].map(o => (
        <button key={o.l} type="button" onClick={() => setSlow(o.v)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${slow === o.v ? C.orange : C.line}`, background: slow === o.v ? '#fff1ea' : '#fff', color: slow === o.v ? C.orange : C.ink }}>{o.l}</button>
      ))}
    </div>
  )
}

/** The flight animation beside the release-point chart, for whichever pitches are in `paths`. */
export function FlightSection({ log, paths, slow, setSlow, title }: { log: PitcherPitchLog; paths: PitchPath[]; slow: number; setSlow: (n: number) => void; title: string }) {
  const hidden = useMemo(() => new Set(log.pitches.map(p => p.pitchType).filter(t => !paths.some(x => x.type === t))), [log, paths])
  const hand = log.throws === 'L' ? 'left-hander' : log.throws === 'R' ? 'right-hander' : null
  if (paths.length === 0) return <div style={{ ...card, fontFamily: SANS, fontSize: 14, color: C.mute }}>No pitch flight data for this pitch yet.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, fontFamily: SANS }}>
      <div style={card}>
        <div style={kick}>{title} · batter&apos;s view</div>
        <FlightPlayer paths={paths} slow={slow} />
        <SpeedToggle slow={slow} setSlow={setSlow} />
        <p style={{ margin: '8px 0 0', fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          The average flight path Statcast fits for each pitch, from the mean release point to the front of the plate, in perspective. Slow is six times slower than real time.
        </p>
      </div>
      <div style={card}>
        <div style={kick}>Release points · batter&apos;s view</div>
        <ReleaseView log={log} hidden={hidden} />
        <p style={{ margin: '8px 0 0', fontSize: 12, color: C.mute, lineHeight: 1.45 }}>
          Seen from behind the plate{hand ? `, so a ${hand} lets go on the ${log.throws === 'L' ? 'right' : 'left'}` : ''}. Each dot is one pitch; the large dot is that pitch&apos;s average (hover for the count). Overlapping clusters mean the pitches look alike out of the hand.
        </p>
      </div>
    </div>
  )
}

/** One small animated card per pitch; clicking one opens that pitch. */
export function PitchCards({ paths, movement, slow, onPick }: { paths: PitchPath[]; movement: MoveRow[]; slow: number; onPick: (type: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14, fontFamily: SANS }}>
      <SpinBallStyles />
      {paths.map(p => {
        const small = p.n < MIN_SAMPLE.arsenalPitchesPerType
        return (
          <div key={p.type} style={{ ...card, padding: 12, borderTop: `4px solid ${pitchColor(p.type)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <SpinBall code={p.type} size={30} spin={{ rpm: p.spin, ivb: p.ivb, hb: p.hb }} />
                <b style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</b>
              </span>
              <span title={`${p.n} pitches`} style={{ fontSize: 13, color: C.mute }}>{(p.share * 100).toFixed(0)}%{small && <span style={{ color: '#D4533B', fontWeight: 800 }}> *</span>}</span>
            </div>
            <FlightPlayer paths={[p]} slow={slow} />
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px 8px', margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>
              {[
                ['Velo', p.velo != null ? `${num(p.velo)} mph` : '—'],
                ['Spin', p.spin != null ? `${Math.round(p.spin)} rpm` : '—'],
                ['Extension', p.ext != null ? `${num(p.ext)} ft` : '—'],
                ['Release', `${num(p.release.z)} ft high`],
                ['Arm-side', `${p.hb > 0 ? '+' : ''}${num(p.hb)}"`],
                ['Rise', `${p.ivb > 0 ? '+' : ''}${num(p.ivb)}"`],
              ].map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{v}</dd></div>)}
            </dl>
            {small && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#D4533B' }}>* Small sample (n = {p.n}).</p>}
            <button type="button" onClick={() => onPick(p.type)} style={{ marginTop: 8, fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Open {p.name} →</button>
          </div>
        )
      })}
    </div>
  )
}
