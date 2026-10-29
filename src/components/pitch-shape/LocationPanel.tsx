'use client'

// src/components/pitch-shape/LocationPanel.tsx
//
// Where league pitches near a spot on the movement map cross the plate, batter's view, with the rulebook zone outlined.
// Sits beside the movement heat map (MovementHeat on a pitcher's tab, PitchFinder on the lab page) and follows the same
// spot, window (±0.5 / ±1 / ±2 in) and season choice. The strike zone is a plate LOCATION and the map plots movement, so
// the zone is drawn here, not on the map.
//
// Data: /api/mlb/pitch-shape/location (pitch_shape_locations). A spot with fewer than MIN_LOC_PITCHES pitches in its
// window shows no distribution (empty state, never a guess). Props are plain data.

import { useEffect, useRef, useState } from 'react'
import { C } from '@/components/team/ui'
import {
  LOC_COLS, LOC_ROWS, MIN_LOC_PITCHES, ZONE_COL0, ZONE_COL1, ZONE_ROW0, ZONE_ROW1, type LocationPayload,
} from '@/lib/pitch-shape/location'
import { describeLocation } from '@/lib/pitch-shape/location-describe'
import { ramp as smoothRamp } from '@/components/pitching-lab/ArsenalExtras'
import { RAMP } from './parts'
import { hexToRgb } from './heatGrid'

const CELL = 10 // svg / canvas units per location cell
// smooth view (same look as the Pitching Lab's location heatmap): feet, batter's view, inside on the left
const SX0 = -2, SX1 = 2, SZ0 = 0, SZ1 = 5.2, SGW = 100, SGH = 130
const colFt = (lx: number) => (lx + 0.5 - LOC_COLS / 2) * 0.166
const rowFt = (lz: number) => 1.55 + ((lz + 0.5 - ZONE_ROW0) / (ZONE_ROW1 - ZONE_ROW0 + 1)) * 1.9
const cache = new Map<string, LocationPayload | null>()

export default function LocationPanel({ pitchType, hand, probe, radius, span, scope, pitchName, explainHeight = false, onSummary }: {
  pitchType: string; hand: 'L' | 'R'; probe: { hb: number; ivb: number }; radius: number; span: 'latest' | 'all'
  scope: 'league' | 'pitcher'; pitchName: string
  /** the redesigned map adds one sentence on how many crossed in the upper third of the zone (default off: the classic view is unchanged) */
  explainHeight?: boolean
  /** the redesigned view draws a pitch animation, so it asks for where these pitches cross on average (feet, batter's view, inside negative); null when too thin */
  onSummary?: (s: { plateX: number; plateZ: number; n: number } | null) => void
}) {
  const key = `${pitchType}|${hand}|${probe.hb.toFixed(1)}|${probe.ivb.toFixed(1)}|${radius}|${scope}`
  const [payload, setPayload] = useState<LocationPayload | null | undefined>(cache.get(key))   // undefined = loading
  const [failed, setFailed] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smoothRef = useRef<HTMLCanvasElement>(null)
  const [bw, setBw] = useState(0.26)   // blob width in feet (standard deviation)

  // follow the spot, but wait a beat so sweeping the cursor across the map does not fire a request per pixel
  useEffect(() => {
    setFailed(false)
    if (cache.has(key)) { setPayload(cache.get(key)); return }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/mlb/pitch-shape/location?type=${pitchType}&hand=${hand}&hb=${probe.hb.toFixed(1)}&ivb=${probe.ivb.toFixed(1)}&radius=${radius}&scope=${scope}`, { signal: ctl.signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { payload: LocationPayload | null }) => { cache.set(key, j.payload); setPayload(j.payload) })
        .catch(e => { if (e?.name !== 'AbortError') { console.error('[LocationPanel] fetch failed:', e instanceof Error ? e.message : e); setFailed(true) } })
    }, 140)
    return () => { clearTimeout(t); ctl.abort() }
  }, [key, pitchType, hand, probe.hb, probe.ivb, radius, scope])

  const win = payload ? (span === 'latest' ? payload.latestWindow : payload.allWindow) : null
  const thin = !!win && win.n < MIN_LOC_PITCHES

  // smooth density: every location cell is a blob weighted by its pitches, drawn with the Pitching Lab's colours (sky blue, yellow, orange, deep red)
  useEffect(() => {
    const cv = smoothRef.current
    if (!explainHeight || !cv || !win || thin) return
    const cw = (SX1 - SX0) / SGW, ch = (SZ1 - SZ0) / SGH
    const d = new Float32Array(SGW * SGH)
    const rx = Math.ceil((3 * bw) / cw), rz = Math.ceil((3 * bw) / ch)
    for (let k = 0; k < win.cells.length; k += 3) {
      const px = colFt(win.cells[k]), pz = rowFt(win.cells[k + 1]), wgt = win.cells[k + 2]
      const ci = Math.floor((px - SX0) / cw), cj = Math.floor((SZ1 - pz) / ch)
      for (let j = Math.max(0, cj - rz); j <= Math.min(SGH - 1, cj + rz); j++) {
        const dz = SZ1 - (j + 0.5) * ch - pz
        for (let i = Math.max(0, ci - rx); i <= Math.min(SGW - 1, ci + rx); i++) {
          const dx = SX0 + (i + 0.5) * cw - px
          d[j * SGW + i] += wgt * Math.exp(-(dx * dx + dz * dz) / (2 * bw * bw))
        }
      }
    }
    let max = 0
    for (let k = 0; k < d.length; k++) if (d[k] > max) max = d[k]
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(SGW, SGH)
    for (let k = 0; k < d.length; k++) {
      const [r, g, b, al] = max > 0 ? smoothRamp(d[k] / max) : [0, 0, 0, 0]
      img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = al
    }
    ctx.putImageData(img, 0, 0)
  }, [win, thin, bw, explainHeight])

  // average crossing point of these pitches, for the animation: column centre to feet (0.166 ft a column, centred on the plate), row to feet across the zone (1.55 to 3.45 ft)
  useEffect(() => {
    if (!onSummary) return
    if (!win || thin || win.n <= 0) { onSummary(null); return }
    let sx = 0, sz = 0
    for (let k = 0; k < win.cells.length; k += 3) { sx += (win.cells[k] + 0.5) * win.cells[k + 2]; sz += (win.cells[k + 1] + 0.5) * win.cells[k + 2] }
    onSummary({ plateX: (sx / win.n - LOC_COLS / 2) * 0.166, plateZ: 1.55 + ((sz / win.n - ZONE_ROW0) / (ZONE_ROW1 - ZONE_ROW0 + 1)) * 1.9, n: win.n })
  }, [win, thin, onSummary])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    cv.width = LOC_COLS * CELL; cv.height = LOC_ROWS * CELL
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!win || thin) return
    let max = 0
    for (let k = 2; k < win.cells.length; k += 3) max = Math.max(max, win.cells[k])
    const ramp = RAMP.map(hexToRgb)
    for (let k = 0; k < win.cells.length; k += 3) {
      const t = Math.sqrt(win.cells[k + 2] / max) * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(t)), f = t - i
      const c = ramp[i].map((v, j) => Math.round(v + (ramp[i + 1][j] - v) * f))
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      ctx.fillRect(win.cells[k] * CELL, (LOC_ROWS - 1 - win.cells[k + 1]) * CELL, CELL, CELL)
    }
  }, [win, thin])

  let inZone = 0, above = 0, below = 0, upperThird = 0
  if (win && !thin) {
    for (let k = 0; k < win.cells.length; k += 3) {
      const x = win.cells[k], z = win.cells[k + 1], c = win.cells[k + 2]
      if (x >= ZONE_COL0 && x <= ZONE_COL1 && z >= ZONE_ROW1 - 2 && z <= ZONE_ROW1) upperThird += c   // the top 3 of the zone's 10 rows
      if (z > ZONE_ROW1) above += c
      else if (z < ZONE_ROW0) below += c
      else if (x >= ZONE_COL0 && x <= ZONE_COL1) inZone += c
    }
  }
  const described = explainHeight && win && !thin ? describeLocation(win.cells, pitchName) : null
  const share = (v: number) => (win && win.n ? `${Math.round((v / win.n) * 100)}%` : '—')
  const W = LOC_COLS * CELL, H = LOC_ROWS * CELL
  const zx0 = ZONE_COL0 * CELL, zx1 = (ZONE_COL1 + 1) * CELL, zy0 = (LOC_ROWS - 1 - ZONE_ROW1) * CELL, zy1 = (LOC_ROWS - ZONE_ROW0) * CELL
  const seasons = payload?.seasons ?? []
  const spanLabel = span === 'latest' || seasons.length < 2 ? String(payload?.latest ?? '') : `${seasons[0]}–${payload?.latest}`
  const lc = pitchName.toLowerCase()

  return (
    <div style={{ minWidth: 0 }}>
      <div className="pv-k" style={{ marginBottom: 4 }}>Where these cross the plate</div>
      {described?.sentence && <p style={{ fontSize: 14, color: '#1A1A1A', fontWeight: 600, lineHeight: 1.5, margin: '0 0 10px' }}>{described.sentence}</p>}
      <div style={{ position: 'relative', aspectRatio: explainHeight ? '400 / 520' : `${W} / ${H}`, maxWidth: explainHeight ? 300 : undefined, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', background: C.soft }}>
        {explainHeight ? (
          <>
            <canvas ref={smoothRef} width={SGW} height={SGH} role="img" aria-label={`Smoothed plate locations of ${lc}s near HB ${probe.hb.toFixed(1)} in, IVB ${probe.ivb.toFixed(1)} in, batter's view, with the strike zone outlined`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff' }} />
            <svg viewBox="0 0 400 520" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
              <rect x={((-0.83 - SX0) / (SX1 - SX0)) * 400} y={((SZ1 - 3.45) / (SZ1 - SZ0)) * 520} width={(1.66 / (SX1 - SX0)) * 400} height={(1.9 / (SZ1 - SZ0)) * 520} fill="none" stroke="#1A1A1A" strokeOpacity={0.7} strokeWidth={2} />
              <polygon points={`${((-0.708 - SX0) / (SX1 - SX0)) * 400},${((SZ1 - 0.25) / (SZ1 - SZ0)) * 520} ${((0.708 - SX0) / (SX1 - SX0)) * 400},${((SZ1 - 0.25) / (SZ1 - SZ0)) * 520} ${((0.708 - SX0) / (SX1 - SX0)) * 400},${((SZ1 - 0.1) / (SZ1 - SZ0)) * 520} 200,${((SZ1 + 0.1) / (SZ1 - SZ0)) * 520 - 2} ${((-0.708 - SX0) / (SX1 - SX0)) * 400},${((SZ1 - 0.1) / (SZ1 - SZ0)) * 520}`} fill="#fff" stroke="#8a8275" />
            </svg>
          </>
        ) : (
          <>
        <canvas ref={canvasRef} role="img" aria-label={`Plate locations of ${lc}s near HB ${probe.hb.toFixed(1)} in, IVB ${probe.ivb.toFixed(1)} in, batter's view, with the strike zone outlined`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated', opacity: payload === undefined ? 0.45 : 1, transition: 'opacity .15s' }} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <rect x={zx0} y={zy0} width={zx1 - zx0} height={zy1 - zy0} fill="none" stroke={C.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {[1, 2].map(i => (
            <g key={i}>
              <line x1={zx0 + ((zx1 - zx0) * i) / 3} x2={zx0 + ((zx1 - zx0) * i) / 3} y1={zy0} y2={zy1} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line y1={zy0 + ((zy1 - zy0) * i) / 3} y2={zy0 + ((zy1 - zy0) * i) / 3} x1={zx0} x2={zx1} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          <polygon points={`${W / 2 - 42},${H - 16} ${W / 2 + 42},${H - 16} ${W / 2 + 42},${H - 8} ${W / 2},${H - 1} ${W / 2 - 42},${H - 8}`} fill="#fff" stroke={C.ink} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <text x={6} y={14} fontSize={9} fontWeight={800} fill={C.mute}>INSIDE ←</text>
          <text x={W - 6} y={14} fontSize={9} fontWeight={800} textAnchor="end" fill={C.mute}>→ AWAY</text>
        </svg>
          </>
        )}
        {(failed || payload === null || thin) && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 14, textAlign: 'center', fontSize: 12, color: C.mute, background: 'rgba(250,248,243,.78)' }}>
            {failed ? 'Couldn’t load locations right now.'
              : payload === null ? `Plate locations aren’t built for ${hand === 'L' ? 'left' : 'right'}-handed ${lc}s yet.`
              : `Too few pitches near this spot (${win?.n ?? 0} of ${MIN_LOC_PITCHES} needed). Widen the window.`}
          </div>
        )}
      </div>
      {explainHeight && win && !thin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: '#8a8275' }}>
          Smoothness
          <input type="range" min="0.12" max="0.5" step="0.02" value={bw} onChange={e => setBw(Number(e.target.value))} style={{ flex: 1, maxWidth: 220, accentColor: '#FF5722' }} aria-label="Smoothness of the heatmap" />
        </label>
      )}
      <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 8 }}>
        {win && !thin ? (
          <>
            {[['Inside the zone', share(inZone)], ['Above the zone', share(above)], ['Below the zone', share(below)]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.line}`, padding: '4px 0' }}><span>{k}</span><b style={{ color: C.ink }}>{v}</b></div>
            ))}
            <div style={{ borderTop: `1px solid ${C.line}`, padding: '4px 0', fontSize: 11, color: C.mute }}>{win.n.toLocaleString()} pitches within ±{radius} in of HB {probe.hb.toFixed(1)}, IVB {probe.ivb.toFixed(1)} · {spanLabel}</div>
          </>
        ) : null}
      </div>
      {explainHeight && win && !thin && (
        <p style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.55, margin: '10px 0 0' }}>
          <b>{share(upperThird)}</b> of these pitches crossed in the upper third of the zone. High {lc}s get more misses anyway, so part of this rate comes from <i>where</i> they were thrown, not only how they moved.
        </p>
      )}
      <p style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.5, margin: '6px 0 0' }}>
        Batter’s view, inside on the left whichever side he bats. {explainHeight ? 'The box is the strike zone at an average height; red is where the most of these pitches cross, blue where a few do.' : 'The box is the rulebook zone (the batter’s own height, ball-width padding); darker = more pitches.'}
      </p>
    </div>
  )
}
