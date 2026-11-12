'use client'

// src/components/pitching-lab/AtBatReplay.tsx
//
// Replays one real at-bat from the pitch log with the same graphics the postgame story uses (components/admin/story-v5): the catcher-view stage (faint zone with a 3x3 grid, a mound glow and a horizon),
// pitches that fly along their real 3D paths with the story's camera and its eased flight, a tapered trail and a ball that grows toward the plate and fills with the pitch colour on arrival, and the replay
// diamond where runner dots slide between bases, a run pops at home and an out empties the dot. A ball in play draws an accent arc from home to where it landed (the same 250-grid spray spot the postgame spray
// chart plots). The maths (flight paths, camera) comes straight from story-v5/trajectory.ts, which is pure and has no video code.
// A drawing of recorded data, not video: pitch paths, locations, exit speed and the landing spot are recorded values; the zone is a standard 1.55 to 3.45 feet (the batter's own is not in this log), the
// runners' moves are schematic and a foul ball has no landing spot in the data. Description only.
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import type { RawPitch } from '@/lib/pitcher-pitch-log'
import { PLATE_Y, pathFor, project, type P3 } from '@/components/admin/story-v5/trajectory'

type Call = { label: string; color: string; strike: boolean; swing: boolean }
function callOf(d: string | null): Call {
  switch (d) {
    case 'ball': case 'blocked_ball': case 'intent_ball': case 'pitchout': case 'automatic_ball': return { label: 'Ball', color: '#4F8FC9', strike: false, swing: false }
    case 'called_strike': case 'automatic_strike': return { label: 'Called strike', color: '#8a8275', strike: true, swing: false }
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': case 'foul_tip': return { label: 'Swinging strike', color: '#FF5722', strike: true, swing: true }
    case 'foul': case 'foul_bunt': return { label: 'Foul', color: '#C9A800', strike: true, swing: true }
    case 'hit_into_play': return { label: 'In play', color: '#1D9E75', strike: false, swing: true }
    case 'hit_by_pitch': return { label: 'Hit by pitch', color: '#D4533B', strike: false, swing: false }
    default: return { label: d ? d.replace(/_/g, ' ') : 'Pitch', color: C.mute, strike: false, swing: false }
  }
}

const P_MS = 2300, FLIGHT = 0.4, RESOLVE_MS = 4200
const ENDED: Record<string, string> = { walk: 'Walk', intent_walk: 'Intentional walk', hit_by_pitch: 'Hit by pitch', strikeout: 'Strikeout', strikeout_double_play: 'Strikeout', single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', field_out: 'Field out', force_out: 'Force out', grounded_into_double_play: 'Double play', double_play: 'Double play', sac_fly: 'Sacrifice fly', sac_bunt: 'Sacrifice bunt', fielders_choice: 'Fielder’s choice', fielders_choice_out: 'Fielder’s choice', field_error: 'Reached on an error', catcher_interf: 'Catcher’s interference', truncated_pa: 'Plate appearance cut short' }
const BASE_OF: Record<string, number> = { walk: 1, intent_walk: 1, hit_by_pitch: 1, single: 1, double: 2, triple: 3, home_run: 4, field_error: 1, fielders_choice: 1, catcher_interf: 1 }
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c) }
const INK = '#1A1A1A', ACCENT = '#FF5722'
const BALL_FT = 0.12   // ball radius in feet

// ---- the catcher-view stage (story-v5 camera): drawn through a window of the story's 1080-wide canvas ----
const VB = '190 230 700 700'
const zoneTL = project({ x: -0.708, y: PLATE_Y, z: 3.45 }), zoneBR = project({ x: 0.708, y: PLATE_Y, z: 1.55 })
const mound = project({ x: 0, y: 60.5, z: 0.8 })
const horizon = project({ x: 0, y: 60.5, z: 2.5 }).y

/** flight path in feet for one pitch: the story's own path builder on the recorded Statcast fit (traj is [vx0, vy0, vz0, ax, ay, az, release_pos_y]); a straight line from the release point when the fit is missing */
function pathPoints(p: RawPitch): P3[] {
  if (p.traj && p.releasePosX != null && p.releasePosZ != null) {
    const [vx0, vy0, vz0, ax, ay, az, ry] = p.traj
    const path = pathFor({ release_pos_x: p.releasePosX, release_pos_y: ry, release_pos_z: p.releasePosZ, vx0, vy0, vz0, ax, ay, az })
    if (path) return path.points
  }
  const rx = p.releasePosX ?? 0, rz = p.releasePosZ ?? 5.8
  return Array.from({ length: 41 }, (_, i) => { const f = i / 40; return { x: rx + (p.plateX - rx) * f, y: 53 + (PLATE_Y - 53) * f, z: rz + (p.plateZ - rz) * f } })
}
const at = (pts: P3[], f: number): P3 => {
  const x = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), k = x - i
  const a = pts[i], b = pts[i + 1]
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
}

// ---- the diamond (story-v5 replay scene geometry, scaled): home at the bottom, bases D pixels away, the spray spot 0.9 px per foot ----
const DX = 350, DY = 600, D = 190, SCALE = 0.9
const BASE_XY = [{ x: DX, y: DY }, { x: DX + D, y: DY - D }, { x: DX, y: DY - 2 * D }, { x: DX - D, y: DY - D }]   // home, 1B, 2B, 3B
function basePos(b: number) {
  const c = Math.min(4, Math.max(0, b)), i = Math.min(3, Math.floor(c)), k = c - i
  const a = BASE_XY[i], z = BASE_XY[(i + 1) % 4]
  return { x: a.x + (z.x - a.x) * k, y: a.y + (z.y - a.y) * k }
}
const HEIGHT: Record<string, number> = { ground_ball: 6, line_drive: 70, fly_ball: 190, popup: 230 }

export default function AtBatReplay({ ab, pitchName, batter, date, onClose }: { ab: RawPitch[]; pitchName: (code: string) => string; batter: string | null; date: string; onClose: () => void }) {
  const n = ab.length
  const total = n * P_MS + RESOLVE_MS
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const last = useRef<number | null>(null)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!playing || reduced) return
    let raf = 0
    const tick = (now: number) => {
      const dt = last.current == null ? 0 : now - last.current
      last.current = now
      setT(v => { const nv = v + dt * speed; if (nv >= total) { setPlaying(false); return total } return nv })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); last.current = null }
  }, [playing, speed, total, reduced])
  useEffect(() => { setT(reduced ? total : 0); setPlaying(!reduced) }, [ab, reduced, total])

  const lastP = ab[n - 1]
  const result = lastP.result && lastP.result !== lastP.description ? lastP.result : null
  const resolving = t >= n * P_MS
  const i = Math.min(n - 1, Math.floor(t / P_MS))
  const local = resolving ? 1 : (t - i * P_MS) / P_MS
  const landed = local >= FLIGHT
  const shown = resolving ? n : landed ? i + 1 : i
  const cur = ab[i]
  const call = callOf(cur.description)
  const paths = useMemo(() => ab.map(pathPoints), [ab])
  const countAfter = useMemo(() => {
    const p = shown > 0 ? ab[shown - 1] : null
    if (!p) return { b: 0, s: 0 }
    const c = callOf(p.description)
    const b0 = p.balls ?? 0, s0 = p.strikes ?? 0
    return { b: Math.min(4, b0 + (c.label === 'Ball' ? 1 : 0)), s: Math.min(3, s0 + (c.strike && !(c.label === 'Foul' && s0 >= 2) ? 1 : 0)) }
  }, [ab, shown])
  const seek = (k: number) => { setT(k * P_MS); setPlaying(false) }

  const kind = result == null ? null : result in BASE_OF ? 'reach' : /strikeout/.test(result) ? 'k' : 'out'
  const inPlay = lastP.description === 'hit_into_play'
  const hasHit = inPlay && lastP.hcX != null && lastP.hcY != null
  const rp = resolving ? Math.min(1, (t - n * P_MS) / RESOLVE_MS) : 0
  const rb = result ? BASE_OF[result] ?? 0 : 0
  const label = ENDED[result ?? ''] ?? (result ? result.replace(/_/g, ' ') : '')

  // ---------- catcher view ----------
  const pts = paths[i]
  const u = clamp01(local / FLIGHT)
  const prog = u * u   // ease-in quad: it speeds up like a real pitch
  const N = pts.length - 1
  const upto = Math.floor(prog * N)
  const head = at(pts, prog)
  const hp = project(head)
  const col = pitchColor(cur.pitchType)
  const segs = []
  for (let k = 0; k <= upto && k < N; k++) {
    const a = project(pts[k]), b = k === upto ? project(head) : project(pts[k + 1]), m = (k + 1) / N
    segs.push(<line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeLinecap="round" strokeWidth={2 + 20 * m * m} strokeOpacity={0.1 + 0.7 * m} />)
  }
  const ballR = Math.max(3, BALL_FT * hp.scale) * (landed ? 0.55 * 1.8 : 1.8)
  const stamp = !resolving && landed ? ease((local - FLIGHT) / 0.12) : 0
  const stampW = call.label.length * 25 + 56
  const ghost = (p: RawPitch, k: number, o: number) => { const g = project({ x: p.plateX, y: PLATE_Y, z: p.plateZ }); return <g key={k} opacity={o}><circle cx={g.x} cy={g.y} r={30} fill={pitchColor(p.pitchType)} stroke="#fff" strokeWidth={4} /><text x={g.x} y={g.y + 10} textAnchor="middle" fontSize={28} fontWeight={800} fill="#fff" style={{ fontFamily: SANS }}>{k + 1}</text></g> }

  // ---------- diamond ----------
  const onBase = lastP.onBase
  const runners = [onBase.first ? 1 : 0, onBase.second ? 2 : 0, onBase.third ? 3 : 0].filter(Boolean)
  const land = hasHit ? { x: DX + (lastP.hcX! - 125.42) * 2.5 * SCALE, y: DY - (198.27 - lastP.hcY!) * 2.5 * SCALE } : null
  const landFt = hasHit ? Math.hypot((lastP.hcX! - 125.42) * 2.5, (198.27 - lastP.hcY!) * 2.5) : 0
  const isHr = result === 'home_run'
  const hitT = ease((rp - 0.08) / 0.34)
  const runT = ease((rp - (hasHit ? 0.4 : 0.1)) / 0.45)
  const apex = lastP.bbType ? HEIGHT[lastP.bbType] ?? 60 : 60
  const ctrl = land ? { x: (DX + land.x) / 2, y: (DY + land.y) / 2 - apex } : null
  const bez = (k: number) => land && ctrl ? { x: (1 - k) * (1 - k) * DX + 2 * (1 - k) * k * ctrl.x + k * k * land.x, y: (1 - k) * (1 - k) * DY + 2 * (1 - k) * k * ctrl.y + k * k * land.y } : null
  const ballP = bez(hitT)
  const forced = result === 'walk' || result === 'intent_walk' || result === 'hit_by_pitch' || result === 'catcher_interf'
  const pushed = onBase.first ? (onBase.second ? (onBase.third ? 3 : 2) : 1) : 0
  const adv = (b: number) => (forced ? (b <= pushed ? 1 : 0) : kind === 'reach' ? Math.min(4, rb) : 0)
  const batterTo = kind === 'reach' ? Math.min(4, rb) : 0
  const bPos = basePos(batterTo * runT)
  const scored = kind === 'reach' ? runners.filter(b => b + adv(b) >= 4).length + (rb >= 4 ? 1 : 0) : 0
  const bannerIn = resolving ? ease((rp - (kind === 'k' || (kind === 'reach' && !hasHit) ? 0.05 : 0.5)) / 0.12) : 0

  const btn: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', borderRadius: 6, padding: '5px 12px', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: C.ink }
  const dot = (x: number, y: number, o = 1, hollow = false, sc = 1, key?: string) => <circle key={key} cx={x} cy={y} r={22 * sc} fill={hollow ? 'none' : ACCENT} stroke={hollow ? ACCENT : '#fff'} strokeWidth={hollow ? 5 : 3} opacity={o} />

  return (
    <div role="region" aria-label={`Replay of the at-bat${batter ? ` against ${batter}` : ''}`} style={{ background: '#fff', border: `1px solid ${C.line}`, borderTop: `3px solid ${C.orange}`, borderRadius: 6, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Replay</div>
        <b style={{ fontSize: 17 }}>{date}{batter ? ` · ${batter}` : ''}</b>
        <span style={{ fontSize: 13, color: C.mute }}>{lastP.inning != null ? `${lastP.topBot === 'B' ? 'Bottom' : 'Top'} ${lastP.inning} · ` : ''}{n} pitch{n === 1 ? '' : 'es'}</span>
        <span style={{ fontSize: 13, fontWeight: 800, background: C.soft, borderRadius: 6, padding: '4px 10px', fontVariantNumeric: 'tabular-nums' }}>Count {countAfter.b}-{countAfter.s}</span>
        <button type="button" onClick={onClose} style={{ ...btn, marginLeft: 'auto' }}>Close replay</button>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 10 }}>
        <svg viewBox={VB} role="img" aria-label="The catcher's view: each pitch of the at-bat flying to the plate" style={{ flex: '1 1 340px', minWidth: 0, maxWidth: 560, height: 'auto', borderRadius: 6, background: '#FAF8F3', border: `1px solid ${C.line}` }}>
          <ellipse cx={mound.x} cy={mound.y + 6} rx={150} ry={34} fill={INK} opacity={0.07} />
          <line x1={0} x2={1080} y1={horizon} y2={horizon} stroke={INK} strokeOpacity={0.1} strokeWidth={2} />
          {[1, 2].map(k => <line key={`v${k}`} x1={zoneTL.x + ((zoneBR.x - zoneTL.x) * k) / 3} x2={zoneTL.x + ((zoneBR.x - zoneTL.x) * k) / 3} y1={zoneTL.y} y2={zoneBR.y} stroke={INK} strokeOpacity={0.12} strokeWidth={2} />)}
          {[1, 2].map(k => <line key={`h${k}`} x1={zoneTL.x} x2={zoneBR.x} y1={zoneTL.y + ((zoneBR.y - zoneTL.y) * k) / 3} y2={zoneTL.y + ((zoneBR.y - zoneTL.y) * k) / 3} stroke={INK} strokeOpacity={0.12} strokeWidth={2} />)}
          <rect x={zoneTL.x} y={zoneTL.y} width={zoneBR.x - zoneTL.x} height={zoneBR.y - zoneTL.y} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={3} />
          {ab.slice(0, shown).map((p, k) => (k === i && !resolving) ? null : ghost(p, k, 0.55))}
          {!resolving && (
            <g>
              {segs}
              <circle cx={hp.x} cy={hp.y} r={ballR} fill={landed ? col : '#fff'} stroke={col} strokeWidth={landed ? 3 : 4} />
              {landed && local < FLIGHT + 0.22 && <circle cx={hp.x} cy={hp.y} r={36 + ((local - FLIGHT) / 0.22) * 40} fill="none" stroke={call.color} strokeWidth={4} opacity={1 - (local - FLIGHT) / 0.22} />}
              {landed && <text x={hp.x} y={hp.y + 10} textAnchor="middle" fontSize={28} fontWeight={800} fill="#fff" style={{ fontFamily: SANS }}>{i + 1}</text>}
            </g>
          )}
          {!resolving && landed && (
            <g opacity={stamp} transform={`translate(540 ${300 - 10 * (1 - stamp)})`}>
              <rect x={-stampW / 2} y={-34} width={stampW} height={64} rx={8} fill={call.color} /><text x={0} y={14} textAnchor="middle" fontSize={40} fontWeight={800} fill="#fff" style={{ fontFamily: SANS }}>{call.label.toUpperCase()}</text>
            </g>
          )}
          {resolving && ab.map((p, k) => ghost(p, k, 1))}
          <text x={880} y={918} textAnchor="end" fontSize={26} fontWeight={700} fill="#6b6355" style={{ fontFamily: SANS }}>{resolving ? `All ${n} pitches` : `${pitchName(cur.pitchType)}${cur.velo != null ? ` · ${cur.velo.toFixed(1)} mph` : ''}`}</text>
        </svg>

        <svg viewBox="0 0 700 700" role="img" aria-label="The diamond: how the at-bat ended" style={{ flex: '1.1 1 360px', minWidth: 0, maxWidth: 600, height: 'auto', borderRadius: 6, background: '#FAF8F3', border: `1px solid ${C.line}`, opacity: resolving ? 1 : 0.8, transition: 'opacity .4s' }}>
          <path d={`M ${DX} ${DY} L ${DX - 330} ${DY - 330} A 468 468 0 0 1 ${DX + 330} ${DY - 330} Z`} fill="#f5f5f4" stroke="#e7e5e4" strokeWidth={2} />
          <line x1={DX} y1={DY} x2={DX - 330} y2={DY - 330} stroke="#d6d3d1" strokeWidth={2} /><line x1={DX} y1={DY} x2={DX + 330} y2={DY - 330} stroke="#d6d3d1" strokeWidth={2} />
          <path d={`M ${BASE_XY.map(b => `${b.x} ${b.y}`).join(' L ')} Z`} fill="none" stroke="#d6d3d1" strokeWidth={3} />
          {BASE_XY.map((b, k) => <rect key={k} x={b.x - 11} y={b.y - 11} width={22} height={22} fill="#fff" stroke="#a8a29e" strokeWidth={2} transform={`rotate(45 ${b.x} ${b.y})`} />)}

          {land && ctrl && hitT > 0 && (
            <g>
              <path d={`M ${DX} ${DY} Q ${ctrl.x} ${ctrl.y} ${land.x} ${land.y}`} fill="none" stroke={ACCENT} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - hitT} opacity={0.35 + 0.4 * (1 - hitT)} />
              {ballP && <circle cx={ballP.x} cy={ballP.y} r={11} fill="#fff" stroke={ACCENT} strokeWidth={4} />}
              {hitT >= 1 && <circle cx={land.x} cy={land.y} r={kind === 'out' ? 16 : 12} fill={kind === 'out' ? 'none' : ACCENT} stroke={kind === 'out' ? '#78716c' : '#fff'} strokeWidth={kind === 'out' ? 5 : 3} opacity={kind === 'out' ? 1 - 0.75 * ease((rp - 0.5) / 0.2) : 1} />}
              {hitT >= 1 && <text x={land.x} y={land.y + 40} textAnchor="middle" fontSize={24} fontWeight={800} fill="#44403c" style={{ fontFamily: SANS }}>{Math.round(landFt)} ft{lastP.exitVelo != null ? ` · ${lastP.exitVelo.toFixed(0)} mph` : ''}</text>}
            </g>
          )}

          {runners.map(b => { const to = resolving && (forced || kind === 'reach') ? Math.min(4, b + adv(b)) : b; const p = basePos(b + (to - b) * runT); return dot(p.x, p.y, to >= 4 && runT >= 1 ? 1 - ease((rp - 0.9) / 0.1) : 1, false, to >= 4 && runT >= 1 ? 1.6 : 1, `r${b}`) })}
          {resolving && kind === 'reach' ? dot(bPos.x, bPos.y, batterTo >= 4 && runT >= 1 ? 1 - ease((rp - 0.9) / 0.1) : 1, false, batterTo >= 4 && runT >= 1 ? 1.6 : 1) : dot(BASE_XY[0].x, BASE_XY[0].y + 50, resolving && kind !== 'reach' ? 0.25 : 1, resolving && kind !== 'reach')}
          {scored > 0 && rp > 0.85 && <text x={DX} y={DY + 90} textAnchor="middle" fontSize={44} fontWeight={800} fill={ACCENT} style={{ fontFamily: SANS }}>{`+${scored}`}</text>}
          {resolving && kind === 'k' && <text x={DX} y={DY - 190} textAnchor="middle" fontSize={260} fontWeight={800} fill={ACCENT} opacity={bannerIn} style={{ fontFamily: SANS }} transform={lastP.description === 'called_strike' ? `translate(${2 * DX} 0) scale(-1 1)` : undefined}>K</text>}
          {resolving && !hasHit && inPlay && <text x={DX} y={DY - 260} textAnchor="middle" fontSize={26} fill="#6b6355" style={{ fontFamily: SANS }}>No landing spot recorded</text>}
          {resolving && label && (
            <g opacity={bannerIn} transform={`translate(${DX} 60)`}>
              <rect x={-(label.length * 24 + 56) / 2} y={-34} width={label.length * 24 + 56} height={64} rx={8} fill={kind === 'reach' ? ACCENT : INK} /><text x={0} y={14} textAnchor="middle" fontSize={38} fontWeight={800} fill="#fff" style={{ fontFamily: SANS }}>{label.toUpperCase()}</text>
            </g>
          )}
          {isHr && land && hitT >= 1 && <text x={land.x} y={land.y - 30} textAnchor="middle" fontSize={30} fontWeight={800} fill={ACCENT} style={{ fontFamily: SANS }}>OVER THE WALL</text>}
        </svg>

        <ol style={{ flex: '1 1 240px', minWidth: 230, listStyle: 'none', margin: 0, padding: 0, alignSelf: 'stretch' }} aria-label="The pitches of the at-bat">
          {ab.map((p, k) => { const c = callOf(p.description), on = k === i && !resolving; return (
            <li key={k}><button type="button" onClick={() => seek(k)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, border: 0, borderBottom: `1px solid ${C.soft}`, background: on ? '#FFF3EC' : 'transparent', padding: '8px 8px', textAlign: 'left', fontFamily: SANS, fontSize: 13.5, cursor: 'pointer', color: C.ink, opacity: k < shown || on ? 1 : 0.45 }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: pitchColor(p.pitchType), color: '#fff', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{k + 1}</span>
              <span style={{ flex: 1 }}><b>{pitchName(p.pitchType)}</b>{p.velo != null ? <span style={{ color: C.mute }}> {p.velo.toFixed(1)} mph</span> : null}</span>
              <span style={{ color: c.color, fontWeight: 800, fontSize: 12.5 }}>{c.label}</span>
              <span style={{ color: C.mute, fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>{p.balls ?? 0}-{p.strikes ?? 0}</span>
            </button></li>) })}
          {result && <li style={{ padding: '10px 8px', fontWeight: 800 }}>Ended: {label}{lastP.exitVelo != null && inPlay ? <span style={{ fontWeight: 600, color: C.mute }}> · {lastP.exitVelo.toFixed(1)} mph off the bat{hasHit ? `, ${Math.round(landFt)} ft` : ''}</span> : null}</li>}
        </ol>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" style={btn} onClick={() => { if (!playing && t >= total) setT(0); setPlaying(p => !p) }}>{playing ? 'Pause' : t >= total ? 'Replay' : 'Play'}</button>
        <button type="button" style={btn} onClick={() => seek(Math.max(0, i - (resolving ? 0 : 1)))} aria-label="Previous pitch">◀ Pitch</button>
        <button type="button" style={btn} onClick={() => seek(Math.min(n, i + 1))} aria-label="Next pitch">Pitch ▶</button>
        <input type="range" min={0} max={total} value={t} onChange={e => { setT(Number(e.target.value)); setPlaying(false) }} aria-label="Scrub the replay" style={{ flex: '1 1 160px', accentColor: C.orange }} />
        <span style={{ display: 'inline-flex', gap: 4 }}>{[0.5, 1, 2].map(sp => <button key={sp} type="button" onClick={() => setSpeed(sp)} style={{ ...btn, padding: '5px 9px', background: speed === sp ? C.ink : '#fff', color: speed === sp ? '#fff' : C.ink }}>{sp}x</button>)}</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#6b6355', lineHeight: 1.5 }}>A drawing of the recorded at-bat, not video. Pitch paths, locations, exit speed and where the ball landed are the recorded values. The zone is a standard 1.55 to 3.45 feet (not this batter’s own), the runners’ moves are schematic, and a foul ball has no landing spot in the data.</p>
    </div>
  )
}
