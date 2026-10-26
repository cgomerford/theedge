'use client'

// src/components/pitch-shape/MovementHeat.tsx
//
// "How they win" movement map at 0.1-inch resolution: arm-side horizontal break (x) by induced vertical break (y).
// League pitches of this pitch type and hand live in 0.1 in cells, one table row per season (pitch_shape_cells), but
// one cell holds about one pitch, so each BOX shows the whiffs-per-swing of every pitch within a chosen radius of it
// (a square window, ±0.5 / ±1 / ±2 in) and stays blank when that window has under 40 swings. Boxes are never filled
// in from anywhere else. The map can show the latest season's pitches alone, or all seasons added up (2024 to now);
// the readout always gives both so they can be compared. His own pitches are plotted on top as dots (a sample from
// the latest season), with his average and ±1 SD ring. Descriptions of what already happened; nothing looks forward.
// `isPro` is a REQUIRED prop.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C, Empty, Foot } from '@/components/team/ui'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { RAMP } from './parts'
import { hexToRgb, makeGrid, stats, type Grid, type Span } from './heatGrid'
import LocationPanel from './LocationPanel'

const MIN_WINDOW_SWINGS = 40
const RADII = [0.5, 1, 2] as const
type Mode = 'whiff' | 'density'

type Avg = { hb: number; ivb: number; sdHb: number; sdIvb: number }
type Pt = { hb: number; ivb: number }

const cache = new Map<string, MovementCellsPayload | null>()

export default function MovementHeat({ pitchType, pitchName, hand, avg, points, season, isPro, pitcherId }: {
  pitcherId: number; pitchType: string; pitchName: string; hand: 'L' | 'R'; avg: Avg; points: Pt[]; season: number; isPro: boolean
}) {
  const lc = pitchName.toLowerCase()
  // Default view: tight around his cluster (about 2 standard deviations, 4-7 in each way). "Wider" shows every sampled
  // pitch (up to 12 in). A wider window is mostly flat colour, so the default does not use it.
  const [wide, setWide] = useState(false)
  const half = useMemo(() => {
    if (!wide) return Math.min(7, Math.max(4, Math.ceil(Math.max(avg.sdHb, avg.sdIvb) * 2)))
    const dev = Math.max(0, ...points.map(p => Math.max(Math.abs(p.hb - avg.hb), Math.abs(p.ivb - avg.ivb))))
    return Math.min(12, Math.max(7, Math.ceil(dev + 2)))
  }, [wide, points, avg.hb, avg.ivb, avg.sdHb, avg.sdIvb])
  const key = `${pitchType}|${hand}|${avg.hb.toFixed(1)}|${avg.ivb.toFixed(1)}|${half}`
  const [payload, setPayload] = useState<MovementCellsPayload | null | undefined>(cache.get(key))   // undefined = loading
  const [mode, setMode] = useState<Mode>('whiff')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  const [span, setSpan] = useState<Span>('latest')
  const [hover, setHover] = useState<{ hb: number; ivb: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!isPro) return
    if (cache.has(key)) { setPayload(cache.get(key)); return }
    setPayload(undefined)
    let live = true
    fetch(`/api/mlb/pitch-shape/cells?type=${pitchType}&hand=${hand}&hb=${avg.hb.toFixed(2)}&ivb=${avg.ivb.toFixed(2)}&half=${half}&pitcherId=${pitcherId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { payload: MovementCellsPayload | null }) => { cache.set(key, j.payload); if (live) setPayload(j.payload) })
      .catch(e => { console.error('[MovementHeat] cells fetch failed:', e instanceof Error ? e.message : e); if (live) setPayload(null) })
    return () => { live = false }
  }, [isPro, key, pitchType, hand, avg.hb, avg.ivb, half, pitcherId])

  const grids = useMemo(() => (payload ? { latest: makeGrid(payload, 'latest'), all: makeGrid(payload, 'all') } : null), [payload])
  const grid = grids ? grids[span] : null
  const firstSeason = payload ? payload.seasons[0].season : 0
  const multi = !!payload && payload.seasons.length > 1
  const allLabel = payload ? (payload.pooledLabel ?? `${firstSeason}–${payload.latest}`) : ''
  const latestLabel = payload ? (payload.pooledLabel ?? String(payload.latest)) : ''

  const N = grid ? 2 * grid.h10 + 1 : 0
  const r10 = Math.round(radius * 10)
  // The colour scale is set from this span's league rate (a sinker's 12% and a slider's 33% both use the full ramp)
  const lw0 = grid && grid.swings > 0 ? grid.whiffs / grid.swings : 0.25
  const SCALE_LO = Math.max(0.02, lw0 * 0.4), SCALE_HI = lw0 * 2.2

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const ramp = RAMP.map(hexToRgb)
    const pick = (t: number) => ramp[Math.round(Math.max(0, Math.min(1, t)) * (ramp.length - 1))]
    let maxP = 1
    if (mode === 'density') {
      for (let yy = 0; yy < N; yy += 4) for (let xx = 0; xx < N; xx += 4) {
        const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
        if (s.pitches > maxP) maxP = s.pitches
      }
    }
    for (let yy = 0; yy < N; yy++) {
      for (let xx = 0; xx < N; xx++) {
        const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
        const o = ((N - 1 - yy) * N + xx) * 4   // up on screen = more ride
        let rgb: [number, number, number] | null = null
        if (mode === 'whiff') { if (s.swings >= MIN_WINDOW_SWINGS) rgb = pick((s.whiffs / s.swings - SCALE_LO) / (SCALE_HI - SCALE_LO)) }
        else if (s.pitches > 0) rgb = pick(Math.sqrt(s.pitches / maxP))
        if (rgb) { img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255 }
        else { img.data[o] = 241; img.data[o + 1] = 238; img.data[o + 2] = 230; img.data[o + 3] = 255 }
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, mode, r10, N, SCALE_LO, SCALE_HI])

  if (!isPro) return null
  if (payload === undefined) return <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading the league map…</div>
  if (payload === null || !grids || !grid) return <Empty>The 0.1-inch league map isn’t built for {lc}s yet.</Empty>

  const toBox = (hb: number, ivb: number) => ({ x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) })
  const a = toBox(avg.hb, avg.ivb)
  const probe = hover ?? { hb: avg.hb, ivb: avg.ivb }
  const at = (g: Grid, p: Pt) => {
    const s = stats(g, Math.round(p.hb * 10), Math.round(p.ivb * 10), r10)
    return { ...s, rate: s.swings >= MIN_WINDOW_SWINGS ? s.whiffs / s.swings : null }
  }
  const pLatest = at(grids.latest, probe), pAll = at(grids.all, probe)
  const mine = at(grid, avg)
  const leagueWhiff = grid.swings > 0 ? grid.whiffs / grid.swings : null
  const rel = mine.rate != null && leagueWhiff != null ? (mine.rate > leagueWhiff * 1.1 ? 'a larger share than' : mine.rate < leagueWhiff * 0.9 ? 'a smaller share than' : 'about the same share as') : null
  const spanLabel = span === 'latest' ? latestLabel : allLabel
  const pct = span === 'latest' ? payload.pct.latest : payload.pct.all
  const hbP = pct.hb, ivP = pct.ivb
  const run = hbP >= 67 ? 'more arm-side run than most' : hbP <= 33 ? 'less arm-side run than most' : 'about average arm-side run'
  const ride = ivP >= 67 ? 'more ride (induced vertical break) than most' : ivP <= 33 ? 'less ride, more sink, than most' : 'about average ride'
  const zone = hbP >= 67 && ivP <= 33 ? 'Run-and-sink zone' : hbP >= 67 && ivP >= 67 ? 'Run-and-ride zone' : hbP <= 33 && ivP >= 67 ? 'Straight-and-rising zone' : hbP <= 33 && ivP <= 33 ? 'Straight-and-sinking zone' : 'Middle of the pack'
  const ticks: number[] = []
  for (let v = Math.ceil(avg.hb - half); v <= Math.floor(avg.hb + half); v++) if (v % 2 === 0) ticks.push(v)
  const yticks: number[] = []
  for (let v = Math.ceil(avg.ivb - half); v <= Math.floor(avg.ivb + half); v++) if (v % 2 === 0) yticks.push(v)
  const fmtRate = (r: number | null) => (r == null ? 'too few swings' : `${(r * 100).toFixed(1)}%`)

  return (
    <div>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">League pitches</span>
        <button type="button" className={`pv-pill${span === 'latest' ? ' on' : ''}`} onClick={() => setSpan('latest')}>{payload.pooledLabel ? latestLabel : `${latestLabel} only`}</button>
        {multi && <button type="button" className={`pv-pill${span === 'all' ? ' on' : ''}`} onClick={() => setSpan('all')}>{allLabel}</button>}
      </div>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">Show</span>
        <button type="button" className={`pv-pill${mode === 'whiff' ? ' on' : ''}`} onClick={() => setMode('whiff')}>Whiffs per swing</button>
        <button type="button" className={`pv-pill${mode === 'density' ? ' on' : ''}`} onClick={() => setMode('density')}>Where pitches live</button>
        <span className="pv-k" style={{ marginLeft: 10 }}>Window</span>
        {RADII.map(r => <button key={r} type="button" className={`pv-pill${radius === r ? ' on' : ''}`} onClick={() => setRadius(r)}>±{r} in</button>)}
        <span className="pv-k" style={{ marginLeft: 10 }}>View</span>
        <button type="button" className={`pv-pill${wide ? '' : ' on'}`} onClick={() => setWide(false)}>Close</button>
        <button type="button" className={`pv-pill${wide ? ' on' : ''}`} onClick={() => setWide(true)}>Wider</button>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ flex: '1 1 360px', maxWidth: 440, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gridTemplateRows: 'auto 22px', gap: 0 }}>
        <div style={{ position: 'relative' }}>
          {yticks.map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((avg.ivb + half - v) / (2 * half)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10, color: C.mute }}>{v}</span>)}
        </div>
        <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' }}
          onMouseMove={e => {
            const r = e.currentTarget.getBoundingClientRect()
            const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
            setHover({ hb: avg.hb - half + fx * 2 * half, ivb: avg.ivb + half - fy * 2 * half })
          }}
          onMouseLeave={() => setHover(null)}>
          <canvas ref={canvasRef} role="img" aria-label={`${pitchName} movement map at 0.1 inch resolution, ${spanLabel}`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
          <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <ellipse cx={a.x} cy={a.y} rx={avg.sdHb * 10} ry={avg.sdIvb * 10} fill="none" stroke={C.ink} strokeWidth={N / 160} strokeDasharray={`${N / 60} ${N / 100}`} vectorEffect="non-scaling-stroke" />
            {points.map((p, i) => { const b = toBox(p.hb, p.ivb); return <ellipse key={i} cx={b.x} cy={b.y} rx={N / 130} ry={N / 130} fill={C.ink} stroke="#fff" strokeWidth={N / 400} /> })}
            <line x1={a.x - N / 40} x2={a.x + N / 40} y1={a.y} y2={a.y} stroke="#fff" strokeWidth={N / 200} />
            <line y1={a.y - N / 40} y2={a.y + N / 40} x1={a.x} x2={a.x} stroke="#fff" strokeWidth={N / 200} />
          </svg>
        </div>
        <div />
        <div style={{ position: 'relative' }}>
          {ticks.map(v => <span key={v} style={{ position: 'absolute', left: `${((v - (avg.hb - half)) / (2 * half)) * 100}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10, color: C.mute }}>{v}</span>)}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '.12em', fontWeight: 800, color: C.mute, margin: '2px 0 6px', paddingLeft: 28 }}><span>↑ INDUCED VERTICAL BREAK (IN)</span><span>ARM-SIDE BREAK (IN) →</span></div>
      </div>
      <div style={{ flex: '0 1 250px', minWidth: 220 }}>
        <LocationPanel pitchType={pitchType} hand={hand} probe={probe} radius={radius} span={span} scope="pitcher" pitchName={pitchName} />
      </div>
      </div>

      <div className="pv-row" style={{ fontSize: 11, color: C.mute, gap: 8 }}>
        {mode === 'whiff'
          ? <><span>Whiffs per swing</span><span>{(SCALE_LO * 100).toFixed(0)}%</span><span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{RAMP.map(c => <span key={c} style={{ width: 22, height: 10, background: c }} />)}</span><span>{(SCALE_HI * 100).toFixed(0)}%</span><span>(scaled to this pitch’s {spanLabel} league rate of {(lw0 * 100).toFixed(1)}%)</span><span>blank = under {MIN_WINDOW_SWINGS} swings in the window</span></>
          : <><span>Fewer pitches</span><span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{RAMP.map(c => <span key={c} style={{ width: 22, height: 10, background: c }} />)}</span><span>More pitches in the window</span></>}
        <span>● his {season} pitches ({points.filter(p => Math.abs(p.hb - avg.hb) <= half && Math.abs(p.ivb - avg.ivb) <= half).length} of the {points.length} sampled are in view) · ┼ his average · ┄ ±1 SD</span>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', fontSize: 12.5, color: '#5b5347', minHeight: 40 }}>
        <b style={{ color: C.ink }}>{hover ? 'Under the cursor' : 'His average'}: </b>
        HB {probe.hb.toFixed(1)} in, IVB {probe.ivb.toFixed(1)} in. League pitches within ±{radius} in:
        <div style={{ display: 'grid', gridTemplateColumns: multi ? '1fr 1fr' : '1fr', gap: 8, marginTop: 4 }}>
          <div><b style={{ color: C.ink }}>{latestLabel}</b>: {pLatest.pitches.toLocaleString()} pitches, {pLatest.swings.toLocaleString()} swings, whiffs per swing <b style={{ color: C.ink }}>{fmtRate(pLatest.rate)}</b></div>
          {multi && <div><b style={{ color: C.ink }}>{allLabel}</b>: {pAll.pitches.toLocaleString()} pitches, {pAll.swings.toLocaleString()} swings, whiffs per swing <b style={{ color: C.ink }}>{fmtRate(pAll.rate)}</b></div>}
        </div>
      </div>

      <div className="pv-k" style={{ margin: '14px 0 4px' }}>Where this pitch is grouped · {spanLabel}</div>
      <p className="pv-note" style={{ marginTop: 0 }}>
        <b>{zone}.</b> His {lc} averages {avg.hb.toFixed(1)} in of arm-side break and {avg.ivb.toFixed(1)} in of induced vertical break. That is {run} ({hbP.toFixed(0)}% of {hand === 'L' ? 'left' : 'right'}-handed {lc}s in {spanLabel} have less arm-side break) and {ride} ({ivP.toFixed(0)}% have less ride).
        {mine.rate != null && leagueWhiff != null && rel
          ? <> Pitches that move like his, within ±{radius} in, get whiffs on {(mine.rate * 100).toFixed(1)}% of swings, {rel} the {(leagueWhiff * 100).toFixed(1)}% {spanLabel} league average for {lc}s ({mine.swings.toLocaleString()} swings).</>
          : <> There are too few league swings within ±{radius} in of his average to give a whiff rate: widen the window.</>}
        {multi && pLatest.rate != null && pAll.rate != null && !hover
          ? <> From that same spot, {latestLabel} pitches got whiffs on {(pLatest.rate * 100).toFixed(1)}% of swings against {(pAll.rate * 100).toFixed(1)}% across {allLabel}.</>
          : null}
      </p>
      <Foot>
        Each 0.1 in box shows the whiffs per swing of every league {lc} thrown by {hand === 'L' ? 'left' : 'right'}-handers within ±{radius} in of it (a square window), pooled over every velocity and arm angle, for {spanLabel}. {multi ? `${latestLabel} only is the same season as his dots; ${allLabel} adds earlier seasons for a bigger sample, at the cost of mixing seasons. ` : ''}A box with under {MIN_WINDOW_SWINGS} swings in its window is left blank, not estimated. Dots are a sample of his pitches, not all of them. HB is arm-side positive (left-handers flipped).
        Percentiles are shares of all league {lc}s in the span shown.
      </Foot>
    </div>
  )
}
