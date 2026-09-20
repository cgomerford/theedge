'use client'

// src/components/batting-lab/BatterSwingHeatmap.tsx
//
// Real pitch locations (plate_x/plate_z, the actual crossing-the-plate
// coordinates), two view modes:
//   - Heatmap — a dense, true FLIR-thermal-style density gradient (blue
//     = cold/low, red = hot/high, smooth in-between), binned real pitch
//     locations at a fine enough grid resolution (with matching blur
//     passes, so the smoothing radius doesn't shrink as resolution goes
//     up) that even sparse subsets (e.g. "Home runs") blend into soft
//     gradient blobs instead of reading as separate blocky squares.
//   - Individual pitches — real dots, one per pitch, with a rich hover
//     card: real pitcher name + headshot, inning, real baserunners, and
//     the real outcome (hit/swing/take/whiff/etc), not just a bare code.
// Both modes share the same subset selector AND a real pitch-type filter
// (full names only, never raw codes like "FF"), so "where does he swing
// on sliders," "where does he whiff on four-seamers," etc. are all the
// same mechanism, just filtered differently — real per-pitch outcome
// data, nothing inferred.

import { useEffect, useMemo, useRef, useState } from 'react'
import { classifySwingCall, isSwingCall } from '@/lib/batter-pitch-log'
import type { BatterPitchLog, RawBatterPitch } from '@/lib/batter-pitch-log'

const SEASON = new Date().getFullYear()
const X_MIN = -2.2, X_MAX = 2.2, Z_MIN = 0.5, Z_MAX = 5.2
const W = 460, H = W * ((Z_MAX - Z_MIN) / (X_MAX - X_MIN))
// Fine enough that individual cells disappear into a smooth gradient
// rather than reading as separate blocky squares once blurred.
const COLS = 130, ROWS = Math.round(COLS * ((Z_MAX - Z_MIN) / (X_MAX - X_MIN)))
const ZONE_LEFT = -0.708, ZONE_RIGHT = 0.708, ZONE_BOTTOM = 1.6, ZONE_TOP = 3.5
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const HIT_LABELS: Record<string, string> = { single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home Run' }

function sx(plateX: number): number { return ((plateX - X_MIN) / (X_MAX - X_MIN)) * W }
function sy(plateZ: number): number { return H - ((plateZ - Z_MIN) / (Z_MAX - Z_MIN)) * H }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

// True FLIR/thermal diverging ramp — blue (cold/low density) through
// cyan/green/yellow to red (hot/high density), smoothly interpolated.
// Deliberate departure from the site's usual single-hue sequential
// convention, requested specifically for this feature.
const FLIR_STOPS: [number, [number, number, number]][] = [
  [0.00, [21, 29, 122]],   // deep blue — coldest
  [0.20, [0, 118, 219]],   // blue
  [0.38, [0, 191, 196]],   // cyan
  [0.54, [70, 209, 84]],   // green
  [0.68, [255, 216, 0]],   // yellow
  [0.82, [255, 122, 0]],   // orange
  [1.00, [214, 20, 20]],   // red — hottest
]
function densityColor(t: number): string {
  const c = Math.min(1, Math.max(0, t))
  for (let i = 0; i < FLIR_STOPS.length - 1; i++) {
    const [t0, c0] = FLIR_STOPS[i]
    const [t1, c1] = FLIR_STOPS[i + 1]
    if (c <= t1) {
      const f = t1 > t0 ? (c - t0) / (t1 - t0) : 0
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f)
      return `rgb(${r},${g},${b})`
    }
  }
  const last = FLIR_STOPS[FLIR_STOPS.length - 1][1]
  return `rgb(${last[0]},${last[1]},${last[2]})`
}

// `radius` widens the neighborhood averaged per pass — needed because a
// fixed radius=1 (3x3) kernel covers a shrinking real-world area as COLS
// grows, which made sparse subsets (a handful of real homers/triples)
// read as separate hard-edged squares instead of soft blended blobs.
function boxBlur(grid: number[][], passes = 2, radius = 1): number[][] {
  let g = grid
  for (let p = 0; p < passes; p++) {
    const next = g.map(row => [...row])
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let sum = 0, n = 0
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const rr = r + dr, cc = c + dc
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) { sum += g[rr][cc]; n++ }
          }
        }
        next[r][c] = n > 0 ? sum / n : 0
      }
    }
    g = next
  }
  return g
}

type Subset = 'all' | 'swings' | 'whiffs' | 'hardest' | 'singles' | 'doubles' | 'triples' | 'homeruns'
const SUBSETS: { key: Subset; label: string }[] = [
  { key: 'all', label: 'All pitches' },
  { key: 'swings', label: 'Swing vs take' },
  { key: 'whiffs', label: 'Whiffs' },
  { key: 'hardest', label: 'Hardest hit' },
  { key: 'singles', label: 'Singles' },
  { key: 'doubles', label: 'Doubles' },
  { key: 'triples', label: 'Triples' },
  { key: 'homeruns', label: 'Home runs' },
]

type ViewMode = 'heatmap' | 'pitches'
type Hover = { x: number; y: number; pitch: RawBatterPitch; outcomeLabel: string }

function baseRunnersLabel(onBase: { first: boolean; second: boolean; third: boolean } | undefined): string {
  if (!onBase) return '—'
  const bases = [onBase.first && '1B', onBase.second && '2B', onBase.third && '3B'].filter(Boolean)
  return bases.length ? `Runners on ${bases.join(', ')}` : 'Bases empty'
}

function describeOutcome(p: RawBatterPitch): string {
  if (p.result && HIT_EVENTS.has(p.result)) {
    return `Hit — ${HIT_LABELS[p.result]}${p.launchSpeed != null ? ` (${p.launchSpeed.toFixed(1)} mph EV)` : ''}`
  }
  const call = classifySwingCall(p.description)
  switch (call) {
    case 'ball': return 'Ball — Take'
    case 'called_strike': return 'Called Strike — Take'
    case 'whiff': return 'Swing — Whiff'
    case 'foul': return 'Swing — Foul'
    case 'in_play': return `In Play — Out${p.launchSpeed != null ? ` (${p.launchSpeed.toFixed(1)} mph EV)` : ''}`
    default: return p.description ?? '—'
  }
}

const DIAMOND_SIZE = 30, DIAMOND_C = DIAMOND_SIZE / 2, DIAMOND_R = DIAMOND_SIZE * 0.36, DIAMOND_BASE = 6.5
function DiamondBase({ pos, active }: { pos: { x: number; y: number }; active: boolean }) {
  return (
    <rect
      x={pos.x - DIAMOND_BASE / 2} y={pos.y - DIAMOND_BASE / 2}
      width={DIAMOND_BASE} height={DIAMOND_BASE}
      transform={`rotate(45 ${pos.x} ${pos.y})`}
      fill={active ? '#FF5722' : '#E5E1D8'}
      stroke={active ? '#FF5722' : '#C4BFB0'}
      strokeWidth={1}
    />
  )
}
// Small real baserunners-state diamond for the hover card — 2B top, 1B
// right, 3B left, home bottom (broadcast-standard orientation), filled
// bases lit up orange.
function MiniDiamond({ onBase }: { onBase: { first: boolean; second: boolean; third: boolean } | undefined }) {
  const second = { x: DIAMOND_C, y: DIAMOND_C - DIAMOND_R }
  const first = { x: DIAMOND_C + DIAMOND_R, y: DIAMOND_C }
  const third = { x: DIAMOND_C - DIAMOND_R, y: DIAMOND_C }
  const home = { x: DIAMOND_C, y: DIAMOND_C + DIAMOND_R }
  return (
    <svg width={DIAMOND_SIZE} height={DIAMOND_SIZE} viewBox={`0 0 ${DIAMOND_SIZE} ${DIAMOND_SIZE}`} className="shrink-0">
      <path d={`M ${second.x} ${second.y} L ${first.x} ${first.y} L ${home.x} ${home.y} L ${third.x} ${third.y} Z`} fill="none" stroke="#DEDACE" strokeWidth={1} />
      <DiamondBase pos={second} active={!!onBase?.second} />
      <DiamondBase pos={first} active={!!onBase?.first} />
      <DiamondBase pos={third} active={!!onBase?.third} />
    </svg>
  )
}

export default function BatterSwingHeatmap({ batterId }: { batterId: number }) {
  const [log, setLog] = useState<BatterPitchLog | null | 'error'>(null)
  const [mode, setMode] = useState<ViewMode>('heatmap')
  const [subset, setSubset] = useState<Subset>('all')
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-pitch-log?batterId=${batterId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [batterId])

  const classified = useMemo(() => {
    if (!log || log === 'error') return []
    return log.pitches
      .filter(p => p.plateX >= X_MIN - 0.5 && p.plateX <= X_MAX + 0.5 && p.plateZ >= Z_MIN - 0.5 && p.plateZ <= Z_MAX + 0.5)
      .map(p => ({ ...p, call: classifySwingCall(p.description) }))
  }, [log])

  const pitchTypeOptions = useMemo(() => {
    if (!log || log === 'error') return []
    const counts = new Map<string, number>()
    for (const p of classified) counts.set(p.pitchType, (counts.get(p.pitchType) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pt, n]) => ({ pt, name: log.pitchNames[pt] ?? pt, n }))
  }, [classified, log])

  const byType = useMemo(() => {
    return pitchTypeFilter ? classified.filter(p => p.pitchType === pitchTypeFilter) : classified
  }, [classified, pitchTypeFilter])

  // Real pitches matching the current subset — same filter feeds both
  // the heatmap grid and the dot view, so switching modes never changes
  // which real pitches are being shown.
  const matched = useMemo(() => {
    switch (subset) {
      case 'all': return byType
      case 'swings': return byType.filter(p => isSwingCall(p.call))
      case 'whiffs': return byType.filter(p => p.call === 'whiff')
      case 'hardest': return byType.filter(p => p.call === 'in_play' && p.launchSpeed != null)
      case 'singles': return byType.filter(p => p.result === 'single')
      case 'doubles': return byType.filter(p => p.result === 'double')
      case 'triples': return byType.filter(p => p.result === 'triple')
      case 'homeruns': return byType.filter(p => p.result === 'home_run')
    }
  }, [byType, subset])

  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
    const isEvWeighted = subset === 'hardest'
    for (const p of matched) {
      const c = Math.floor(((p.plateX - X_MIN) / (X_MAX - X_MIN)) * COLS)
      const r = Math.floor((1 - (p.plateZ - Z_MIN) / (Z_MAX - Z_MIN)) * ROWS)
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue
      grid[r][c] += isEvWeighted ? (p.launchSpeed ?? 0) : 1
    }
    const blurred = boxBlur(grid, 4, 2)
    const max = Math.max(1, ...blurred.flat())
    return { grid: blurred, max }
  }, [matched, subset])

  const hardestSorted = useMemo(() => {
    return [...byType]
      .filter(p => p.call === 'in_play' && p.launchSpeed != null)
      .sort((a, b) => (a.launchSpeed ?? 0) - (b.launchSpeed ?? 0))
  }, [byType])
  const maxEV = hardestSorted.length > 0 ? Math.max(...hardestSorted.map(p => p.launchSpeed ?? 0)) : 0
  const minEV = hardestSorted.length > 0 ? Math.min(...hardestSorted.map(p => p.launchSpeed ?? 0)) : 0

  function showHover(e: React.MouseEvent, pitch: RawBatterPitch, outcomeLabel: string) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, pitch, outcomeLabel })
  }

  if (log === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load pitch location data right now.</div>
  if (log === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling every real pitch he&apos;s seen this season…</div>
  if (classified.length === 0) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">No real pitch-location data on record yet.</div>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Location Lab</p>
        <p className="text-[13px] text-[#57534E]">Real pitch locations he&apos;s actually seen this season — where he swings, where he whiffs, where he hits it hardest, and where his real singles/doubles/triples/homers actually land. Catcher&apos;s-eye view.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex gap-1">
            {(['heatmap', 'pitches'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`font-mono rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-wide transition ${mode === m ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                {m === 'heatmap' ? 'Heatmap' : 'Individual pitches'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {SUBSETS.map(s => (
            <button
              key={s.key}
              onClick={() => setSubset(s.key)}
              className={`font-mono rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide transition ${subset === s.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {pitchTypeOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4 pt-2.5 border-t border-stone-100">
            <button
              onClick={() => setPitchTypeFilter(null)}
              className={`font-mono rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide transition ${pitchTypeFilter === null ? 'border-stone-800 text-stone-800 bg-stone-100 font-bold' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}
            >
              All pitch types
            </button>
            {pitchTypeOptions.map(o => (
              <button
                key={o.pt}
                onClick={() => setPitchTypeFilter(pitchTypeFilter === o.pt ? null : o.pt)}
                className={`font-mono rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide transition ${pitchTypeFilter === o.pt ? 'border-stone-800 text-stone-800 bg-stone-100 font-bold' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}
              >
                {o.name} <span className="text-stone-300">(n={o.n})</span>
              </button>
            ))}
          </div>
        )}

        <div ref={containerRef} className="relative mx-auto" style={{ width: W, maxWidth: '100%' }} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ background: '#FAF8F3' }}>
            {mode === 'heatmap' && heat.grid.map((row, r) => row.map((v, c) => (
              v > 0 ? (
                <rect
                  key={`${r}-${c}`}
                  x={(c / COLS) * W} y={(r / ROWS) * H}
                  width={W / COLS + 0.5} height={H / ROWS + 0.5}
                  fill={densityColor(v / heat.max)}
                />
              ) : null
            )))}

            <rect x={sx(ZONE_LEFT)} y={sy(ZONE_TOP)} width={sx(ZONE_RIGHT) - sx(ZONE_LEFT)} height={sy(ZONE_BOTTOM) - sy(ZONE_TOP)} fill="none" stroke="#8A8577" strokeOpacity={mode === 'heatmap' ? 0.8 : 1} strokeWidth={1.5} strokeDasharray="4 3" />

            {mode === 'pitches' && subset === 'swings' && matched.map((p, i) => {
              const swung = isSwingCall(p.call)
              return (
                <circle
                  key={i} cx={sx(p.plateX)} cy={sy(p.plateZ)} r={3}
                  fill={swung ? '#FF5722' : '#C4BFB0'} fillOpacity={swung ? 0.7 : 0.45}
                  onMouseMove={e => showHover(e, p, describeOutcome(p))}
                />
              )
            })}

            {mode === 'pitches' && subset === 'hardest' && [...matched].sort((a, b) => (a.launchSpeed ?? 0) - (b.launchSpeed ?? 0)).map((p, i) => {
              const t = maxEV > minEV ? ((p.launchSpeed ?? 0) - minEV) / (maxEV - minEV) : 0.5
              const isTop = (p.launchSpeed ?? 0) >= maxEV - 5
              return (
                <circle
                  key={i} cx={sx(p.plateX)} cy={sy(p.plateZ)} r={3 + t * 6}
                  fill={densityColor(t)} fillOpacity={0.9} stroke={isTop ? '#1A1A1A' : '#fff'} strokeWidth={isTop ? 1.25 : 0.5}
                  onMouseMove={e => showHover(e, p, describeOutcome(p))}
                />
              )
            })}

            {mode === 'pitches' && subset !== 'swings' && subset !== 'hardest' && matched.map((p: RawBatterPitch, i: number) => (
              <circle
                key={i} cx={sx(p.plateX)} cy={sy(p.plateZ)} r={4}
                fill="#FF5722" fillOpacity={0.8} stroke="#fff" strokeWidth={0.5}
                onMouseMove={e => showHover(e, p, describeOutcome(p))}
              />
            ))}
          </svg>

          {hover && (
            <div
              className="absolute pointer-events-none bg-white border border-stone-200 rounded-lg shadow-lg px-3 py-2.5 z-10"
              style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -110%)', minWidth: 190 }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {hover.pitch.pitcherId != null && (
                  <img src={mlbHeadshot(hover.pitch.pitcherId)} alt="" width={24} height={24} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: '#F4F1EA' }} />
                )}
                <div>
                  <p className="text-[11px] font-bold text-stone-900 leading-tight whitespace-nowrap">
                    {hover.pitch.pitcherId != null ? log.pitcherNames[hover.pitch.pitcherId] ?? `Pitcher #${hover.pitch.pitcherId}` : 'Unknown pitcher'}
                  </p>
                  <p className="text-[9px] font-mono text-stone-400 leading-tight">{log.pitchNames[hover.pitch.pitchType] ?? hover.pitch.pitchType}</p>
                </div>
              </div>
              <div className="text-[9px] font-mono text-stone-500 space-y-0.5">
                <p>Inning {hover.pitch.inning ?? '—'} · {hover.pitch.balls ?? 0}-{hover.pitch.strikes ?? 0} count</p>
                <div className="flex items-center gap-1.5 py-0.5">
                  <MiniDiamond onBase={hover.pitch.onBase} />
                  <span>{baseRunnersLabel(hover.pitch.onBase)}</span>
                </div>
                <p className="text-stone-800 font-bold">{hover.outcomeLabel}</p>
                <p className="text-stone-400">{hover.pitch.date}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4 text-[10px] font-mono text-stone-500">
          {subset === 'swings' && mode === 'pitches' ? (
            <>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FF5722', opacity: 0.7 }} />Swing (n={byType.filter(p => isSwingCall(p.call)).length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#C4BFB0', opacity: 0.45 }} />Take (n={byType.filter(p => !isSwingCall(p.call)).length})</span>
            </>
          ) : (
            <span>n={matched.length} real {subset === 'hardest' ? `balls in play (${minEV.toFixed(0)}-${maxEV.toFixed(0)} mph)` : subset}</span>
          )}
        </div>
      </div>
    </div>
  )
}
