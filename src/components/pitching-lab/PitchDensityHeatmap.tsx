'use client'

// src/components/pitching-lab/PitchDensityHeatmap.tsx
//
// Continuous-looking location heatmap — the companion Location Lab was
// missing: that tab's 13-zone board is discrete (Statcast's own pre-
// bucketed `zone` column), good for coaching language ("lives up and
// in") but bad for seeing the actual SHAPE of where a pitch clusters.
// This bins real plate_x/plate_z coordinates (src/lib/pitcher-pitch-log.ts,
// live per-pitch pull) into a fine grid and smooths it with a box blur —
// a real, computable operation on real counts, not an invented shape.
//
// Granularity toggle: All pitches this season, or break down by a single
// Game / Week / Month — the raw per-pitch log is fetched once and sliced
// client-side, so switching buckets is instant.
//
// 2026-09-14: two views. "Density" bins+smooths at a fine grid (36x42 —
// higher resolution than the first pass, so the blur reads as a shape
// instead of visible squares). "Pitches" drops the binning entirely and
// plots every real pitch as its own dot at its exact plate_x/plate_z, big
// enough to actually see how far off the plate a miss went — the density
// view answers "what's the shape," this one answers "how far did he miss."

import { useEffect, useMemo, useState } from 'react'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { pitchColor } from '@/lib/mlb'

const SEASON = new Date().getFullYear()

// Bounds wide enough to actually capture every real pitch, including wild
// ones — the strike zone plus a real miss margin, in feet, catcher's-eye
// view (matches the coordinate convention plate_x/plate_z already use:
// x=0 is the middle of the plate, positive = 1B side / batter's right).
const X_MIN = -3.2, X_MAX = 3.2
const Z_MIN = -0.5, Z_MAX = 6.2
const COLS = 40, ROWS = 42

function formatResult(r: string | null): string {
  if (!r) return '—'
  return r.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

function formatRunners(onBase: RawPitch['onBase']): string {
  const bases = [onBase.first && '1st', onBase.second && '2nd', onBase.third && '3rd'].filter(Boolean)
  return bases.length > 0 ? bases.join(', ') : 'Bases empty'
}

type Granularity = 'all' | 'game' | 'week' | 'month'

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
function monthOf(dateStr: string): string { return dateStr.slice(0, 7) }

function bucketKey(p: RawPitch, g: Granularity): string {
  if (g === 'game') return p.date
  if (g === 'week') return mondayOf(p.date)
  if (g === 'month') return monthOf(p.date)
  return 'all'
}

function boxBlur(grid: number[][]): number[][] {
  const out = grid.map(row => [...row])
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let sum = 0, n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) { sum += grid[rr][cc]; n++ }
        }
      }
      out[r][c] = sum / n
    }
  }
  return out
}

function densityColor(t: number): string {
  // Sequential, single hue (site orange), light -> dark. t in [0,1].
  if (t <= 0) return '#FAF8F3'
  if (t < 0.12) return '#FDEEE3'
  if (t < 0.25) return '#FCD9BD'
  if (t < 0.4) return '#FBB989'
  if (t < 0.55) return '#F98D4F'
  if (t < 0.7) return '#F0652A'
  if (t < 0.85) return '#D8451A'
  return '#A8300F'
}

type ViewMode = 'density' | 'pitches'

export default function PitchDensityHeatmap({ pitcherId }: { pitcherId: number }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [granularity, setGranularity] = useState<Granularity>('all')
  const [bucket, setBucket] = useState<string | null>(null)
  const [pitchFilter, setPitchFilter] = useState('ALL')
  const [view, setView] = useState<ViewMode>('density')
  const [hover, setHover] = useState<{ pitch: RawPitch; x: number; y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  const pitchOptions = useMemo(() => {
    if (!log || log === 'error') return []
    return Object.entries(log.pitchNames).sort((a, b) => a[1].localeCompare(b[1]))
  }, [log])

  const buckets = useMemo(() => {
    if (!log || log === 'error' || granularity === 'all') return []
    const keys = new Set(log.pitches.map(p => bucketKey(p, granularity)))
    return [...keys].sort().reverse()
  }, [log, granularity])

  // Derived, not stored: the effective bucket is either the user's manual
  // pick (if it's still valid for the current granularity) or the most
  // recent one — no effect needed to keep it in sync when granularity
  // or the available buckets change.
  const effectiveBucket = granularity === 'all' ? null : (bucket && buckets.includes(bucket) ? bucket : buckets[0] ?? null)

  const filtered = useMemo(() => {
    if (!log || log === 'error') return []
    let pitches = pitchFilter === 'ALL' ? log.pitches : log.pitches.filter(p => p.pitchType === pitchFilter)
    if (granularity !== 'all' && effectiveBucket) pitches = pitches.filter(p => bucketKey(p, granularity) === effectiveBucket)
    return pitches
  }, [log, pitchFilter, granularity, effectiveBucket])

  const grid = useMemo(() => {
    const raw: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
    for (const p of filtered) {
      if (p.plateX < X_MIN || p.plateX > X_MAX || p.plateZ < Z_MIN || p.plateZ > Z_MAX) continue
      const col = Math.min(COLS - 1, Math.max(0, Math.floor(((p.plateX - X_MIN) / (X_MAX - X_MIN)) * COLS)))
      const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((Z_MAX - p.plateZ) / (Z_MAX - Z_MIN)) * ROWS)))
      raw[row][col]++
    }
    const smoothed = boxBlur(boxBlur(boxBlur(raw)))
    const max = Math.max(1, ...smoothed.flat())
    return { smoothed, max }
  }, [filtered])

  if (log === 'error') {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load pitch location data right now.</div>
  }
  if (log === null) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling every pitch to build the heatmap…</div>
  }

  const cellW = 9, cellH = 9
  const boardW = COLS * cellW, boardH = ROWS * cellH
  // Real strike-zone box overlay, roughly 17in plate + typical sz_bot/sz_top.
  const szLeft = ((-0.83 - X_MIN) / (X_MAX - X_MIN)) * boardW
  const szRight = ((0.83 - X_MIN) / (X_MAX - X_MIN)) * boardW
  const szTop = ((Z_MAX - 3.5) / (Z_MAX - Z_MIN)) * boardH
  const szBottom = ((Z_MAX - 1.5) / (Z_MAX - Z_MIN)) * boardH
  const toPx = (p: RawPitch) => ({
    x: ((p.plateX - X_MIN) / (X_MAX - X_MIN)) * boardW,
    y: ((Z_MAX - p.plateZ) / (Z_MAX - Z_MIN)) * boardH,
  })

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Location heatmap</p>
          <p className="text-[10px] font-mono text-stone-400">
            {view === 'density'
              ? 'Continuous density (smoothed, fine grid) — where the pitch actually clusters, not just which cell it landed in.'
              : 'Every real pitch as its own dot at its exact plate location — how far off target, not just how often.'} {filtered.length} pitches shown.
          </p>
        </div>
        <select value={pitchFilter} onChange={e => setPitchFilter(e.target.value)} className="font-mono text-[11px] border border-stone-200 rounded-md px-2 py-1.5 text-stone-700 bg-white">
          <option value="ALL">All pitches</option>
          {pitchOptions.map(([pt, name]) => <option key={pt} value={pt}>{name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {(['density', 'pitches'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {(['all', 'game', 'week', 'month'] as Granularity[]).map(g => (
            <button key={g} onClick={() => setGranularity(g)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${granularity === g ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {g === 'all' ? 'Season' : g}
            </button>
          ))}
        </div>
        {granularity !== 'all' && buckets.length > 0 && (
          <select value={effectiveBucket ?? ''} onChange={e => setBucket(e.target.value)} className="font-mono text-[11px] border border-stone-200 rounded-md px-2 py-1.5 text-stone-700 bg-white">
            {buckets.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-[12px] font-serif italic text-stone-400 py-16">No pitches in this window.</p>
      ) : (
        <div className="mx-auto relative" style={{ width: boardW }}>
          <svg width={boardW} height={boardH} viewBox={`0 0 ${boardW} ${boardH}`} onMouseLeave={() => setHover(null)}>
            {view === 'density' ? (
              grid.smoothed.map((row, r) => row.map((v, c) => (
                <rect key={`${r}-${c}`} x={c * cellW} y={r * cellH} width={cellW} height={cellH} fill={densityColor(v / grid.max)} />
              )))
            ) : (
              // Hits drawn last (on top) with a bold dark ring so they stand
              // out from the surrounding non-hit dots instead of getting
              // buried under denser clusters — real events value (single/
              // double/triple/home_run), not inferred.
              [...filtered].sort((a, b) => Number(a.isHit) - Number(b.isHit)).map((p, i) => {
                const { x, y } = toPx(p)
                const fill = pitchFilter === 'ALL' ? pitchColor(p.pitchType) : '#FF5722'
                return (
                  <circle
                    key={i} cx={x} cy={y} r={p.isHit ? 4.5 : 3.5}
                    fill={fill} fillOpacity={p.isHit ? 0.7 : 0.45}
                    stroke={p.isHit ? '#111827' : fill} strokeOpacity={p.isHit ? 1 : 0.8} strokeWidth={p.isHit ? 1.75 : 0.75}
                    onMouseEnter={() => setHover({ pitch: p, x, y })}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })
            )}
            <rect x={szLeft} y={szTop} width={szRight - szLeft} height={szBottom - szTop} fill="none" stroke="#1A1A1A" strokeOpacity={0.55} strokeWidth={1.5} />
          </svg>
          {hover && (
            <div
              className="absolute bg-white border border-stone-200 rounded-lg shadow-md px-3 py-2 text-[11px] font-mono pointer-events-none z-10"
              style={{
                left: Math.min(hover.x + 10, boardW - 160),
                top: Math.max(hover.y - 10, 0),
              }}
            >
              <div className="font-bold text-stone-900 mb-1">{log.pitchNames[hover.pitch.pitchType] ?? hover.pitch.pitchType} — {hover.pitch.velo != null ? `${hover.pitch.velo.toFixed(1)} mph` : '—'}</div>
              <div className="text-stone-600">
                Result: <span className={`font-bold ${hover.pitch.isHit ? 'text-red-600' : ''}`}>{formatResult(hover.pitch.result)}</span>
                {hover.pitch.isHit && <span className="ml-1 text-[9px] text-red-600 font-bold">● HIT</span>}
              </div>
              <div className="text-stone-600">Runners: <span className="font-bold">{formatRunners(hover.pitch.onBase)}</span></div>
              <div className="text-stone-600">Count: <span className="font-bold">{hover.pitch.balls ?? '—'}-{hover.pitch.strikes ?? '—'}</span> · Inning: <span className="font-bold">{hover.pitch.inning ?? '—'}</span></div>
              <div className="text-stone-600">Batter: <span className="font-bold">{hover.pitch.batterId != null ? (log.batterNames[hover.pitch.batterId] ?? `#${hover.pitch.batterId}`) : '—'}</span></div>
              <div className="text-stone-400 text-[9px] mt-1">{hover.pitch.date}</div>
            </div>
          )}
        </div>
      )}

      {view === 'density' && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <span className="text-[9px] font-mono text-stone-400">Fewer</span>
          {[0.05, 0.25, 0.45, 0.65, 0.85, 1].map(t => (
            <span key={t} className="w-4 h-3 rounded-sm inline-block" style={{ background: densityColor(t) }} />
          ))}
          <span className="text-[9px] font-mono text-stone-400">More</span>
        </div>
      )}
      {view === 'pitches' && (
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[9px] font-mono text-stone-500">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#FF5722', opacity: 0.45, border: '0.75px solid #FF5722' }} /> No hit
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-mono text-stone-500">
            <span className="w-3.5 h-3.5 rounded-full inline-block" style={{ background: '#FF5722', opacity: 0.7, border: '2px solid #111827' }} /> Hit (single/double/triple/HR) — hover for runners on base
          </span>
        </div>
      )}
      <p className="text-[9px] font-mono text-stone-400 text-center mt-2">
        Catcher&apos;s-eye view. Box = approximate strike zone. Real plate_x/plate_z — {view === 'density' ? 'binned and smoothed into a shape' : 'each dot one real pitch'}, not a coaching-language board (use the 13-zone grid above for that).
      </p>
    </div>
  )
}
