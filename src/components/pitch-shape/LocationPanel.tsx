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
import { RAMP } from './parts'
import { hexToRgb } from './heatGrid'

const CELL = 10 // svg / canvas units per location cell
const cache = new Map<string, LocationPayload | null>()

export default function LocationPanel({ pitchType, hand, probe, radius, span, scope, pitchName }: {
  pitchType: string; hand: 'L' | 'R'; probe: { hb: number; ivb: number }; radius: number; span: 'latest' | 'all'
  scope: 'league' | 'pitcher'; pitchName: string
}) {
  const key = `${pitchType}|${hand}|${probe.hb.toFixed(1)}|${probe.ivb.toFixed(1)}|${radius}|${scope}`
  const [payload, setPayload] = useState<LocationPayload | null | undefined>(cache.get(key))   // undefined = loading
  const [failed, setFailed] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  let inZone = 0, above = 0, below = 0
  if (win && !thin) {
    for (let k = 0; k < win.cells.length; k += 3) {
      const x = win.cells[k], z = win.cells[k + 1], c = win.cells[k + 2]
      if (z > ZONE_ROW1) above += c
      else if (z < ZONE_ROW0) below += c
      else if (x >= ZONE_COL0 && x <= ZONE_COL1) inZone += c
    }
  }
  const share = (v: number) => (win && win.n ? `${Math.round((v / win.n) * 100)}%` : '—')
  const W = LOC_COLS * CELL, H = LOC_ROWS * CELL
  const zx0 = ZONE_COL0 * CELL, zx1 = (ZONE_COL1 + 1) * CELL, zy0 = (LOC_ROWS - 1 - ZONE_ROW1) * CELL, zy1 = (LOC_ROWS - ZONE_ROW0) * CELL
  const seasons = payload?.seasons ?? []
  const spanLabel = span === 'latest' || seasons.length < 2 ? String(payload?.latest ?? '') : `${seasons[0]}–${payload?.latest}`
  const lc = pitchName.toLowerCase()

  return (
    <div style={{ minWidth: 0 }}>
      <div className="pv-k" style={{ marginBottom: 4 }}>Where these cross the plate</div>
      <div style={{ position: 'relative', aspectRatio: `${W} / ${H}`, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', background: C.soft }}>
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
        {(failed || payload === null || thin) && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 14, textAlign: 'center', fontSize: 12, color: C.mute, background: 'rgba(250,248,243,.78)' }}>
            {failed ? 'Couldn’t load locations right now.'
              : payload === null ? `Plate locations aren’t built for ${hand === 'L' ? 'left' : 'right'}-handed ${lc}s yet.`
              : `Too few pitches near this spot (${win?.n ?? 0} of ${MIN_LOC_PITCHES} needed). Widen the window.`}
          </div>
        )}
      </div>
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
      <p style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.5, margin: '6px 0 0' }}>
        Batter’s view, inside on the left whichever side he bats. The box is the rulebook zone (the batter’s own height, ball-width padding); darker = more pitches. Source: Baseball Savant pitch data (pitch_shape_locations).
      </p>
    </div>
  )
}
