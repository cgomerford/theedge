'use client'

// src/components/pitch-shape/MovementMap.tsx
//
// League movement map: each 2-inch HB × IVB cell is coloured by whiffs per swing (pooled over every
// velocity and arm slot), cells under the swing gate are hatched — not coloured. Optional overlays:
// a pitcher's pitches + ±1 SD ring + last season's shape (Shape tab) or crosshair markers (Sandbox).
//
// Recharts ScatterChart supplies the axes and scales; MapLayer reads them with useXAxisScale /
// useYAxisScale so every mark is placed in data units (inches), not pixels.
// Props are plain data — no functions cross the server → client boundary.

import { useMemo, useState } from 'react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import { C } from '@/components/team/ui'
import {
  GATE, MAP_CELLS, MAP_CELL_IN, fmtN, pct, sgn, movementCells, mapWindow,
  type MapCell, type MapWindow, type PitcherPitchShape, type ShapeBin,
} from '@/lib/pitch-shape/model'
import { MAP_HI, MAP_LO, rampColor } from './parts'

export type MapMarker = { hb: number; ivb: number; color: string; label: string }

type Tip = { x: number; y: number; cell: MapCell }

function MapLayer({ cells, pitcher, markers, onTip }: {
  cells: MapCell[]
  pitcher?: Pick<PitcherPitchShape, 'current' | 'prev' | 'points'>
  markers: MapMarker[]
  onTip: (t: Tip | null) => void
}) {
  const xs = useXAxisScale()
  const ys = useYAxisScale()
  const area = usePlotArea()
  if (!xs || !ys || !area) return null
  const px = (h: number) => Number(xs(h))
  const py = (i: number) => Number(ys(i))
  const cw = Math.abs(px(MAP_CELL_IN) - px(0))
  const ch = Math.abs(py(MAP_CELL_IN) - py(0))

  return (
    <g>
      <defs>
        <pattern id="ps-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.line} strokeWidth="2" />
        </pattern>
      </defs>
      {cells.map(c => (
        <rect
          key={`${c.hb}|${c.ivb}`}
          x={px(c.hb)} y={py(c.ivb + MAP_CELL_IN)} width={cw - 1} height={ch - 1} rx={2}
          fill={c.whiffRate == null ? 'url(#ps-hatch)' : rampColor(c.whiffRate, MAP_LO, MAP_HI)}
          stroke={c.whiffRate == null ? C.line : 'none'}
          onMouseMove={e => {
            const box = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.getBoundingClientRect()
            if (box) onTip({ x: e.clientX - box.left, y: e.clientY - box.top, cell: c })
          }}
          onMouseLeave={() => onTip(null)}
        />
      ))}

      {pitcher?.prev && (
        <g>
          <line x1={px(pitcher.prev.hb)} y1={py(pitcher.prev.ivb)} x2={px(pitcher.current.hb)} y2={py(pitcher.current.ivb)} stroke={C.ink} strokeWidth={1.5} strokeDasharray="4 3" />
          <circle cx={px(pitcher.prev.hb)} cy={py(pitcher.prev.ivb)} r={5} fill="#fff" stroke={C.ink} strokeWidth={1.5} />
        </g>
      )}
      {pitcher?.points.map((p, k) => (
        <circle key={k} cx={px(p.hb)} cy={py(p.ivb)} r={3.3} fill={C.ink} fillOpacity={0.78} stroke="#fff" strokeWidth={1.3} />
      ))}
      {pitcher && (
        <g>
          <ellipse cx={px(pitcher.current.hb)} cy={py(pitcher.current.ivb)} rx={Math.abs(px(pitcher.current.hb + pitcher.current.sdHb) - px(pitcher.current.hb))} ry={Math.abs(py(pitcher.current.ivb + pitcher.current.sdIvb) - py(pitcher.current.ivb))} fill="none" stroke={C.ink} strokeWidth={1.8} />
          <circle cx={px(pitcher.current.hb)} cy={py(pitcher.current.ivb)} r={6} fill={C.yellow} stroke={C.ink} strokeWidth={2} />
        </g>
      )}

      {markers.map(m => (
        <g key={m.label + m.color} pointerEvents="none">
          <line x1={px(m.hb) - 14} y1={py(m.ivb)} x2={px(m.hb) + 14} y2={py(m.ivb)} stroke={m.color} strokeWidth={2.5} />
          <line x1={px(m.hb)} y1={py(m.ivb) - 14} x2={px(m.hb)} y2={py(m.ivb) + 14} stroke={m.color} strokeWidth={2.5} />
          <circle cx={px(m.hb)} cy={py(m.ivb)} r={7} fill="#fff" stroke={m.color} strokeWidth={2.5} />
          <text x={px(m.hb)} y={py(m.ivb) + 3.5} fontSize={9.5} textAnchor="middle" fontWeight={800} fill={m.color}>{m.label}</text>
        </g>
      ))}
    </g>
  )
}

export default function MovementMap({ bins, pitcher, markers = [], ariaLabel = 'Movement map' }: {
  bins: ShapeBin[]
  pitcher?: Pick<PitcherPitchShape, 'current' | 'prev' | 'points'>
  markers?: MapMarker[]
  ariaLabel?: string
}) {
  const win: MapWindow | null = useMemo(() => mapWindow(bins), [bins])
  const cells = useMemo(() => (win ? movementCells(bins, win) : []), [bins, win])
  const [tip, setTip] = useState<Tip | null>(null)

  if (!win) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '22px 0', margin: 0 }}>No league sample for this pitch type yet.</p>

  const span = MAP_CELLS * MAP_CELL_IN
  // Recharts builds no axis scale for a chart with no data, so give it two invisible points at the
  // window's corners; every visible mark is drawn by MapLayer in data units.
  const anchors = [{ x: win.hb0, y: win.ivb0 }, { x: win.hb0 + span, y: win.ivb0 + span }]
  const ticks = (o: number) => Array.from({ length: 5 }, (_, k) => Math.ceil((o + k * 10) / 5) * 5).filter(t => t >= o && t <= o + span)

  return (
    <div style={{ position: 'relative' }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" aspect={1.04}>
        <ScatterChart margin={{ top: 12, right: 12, bottom: 28, left: 8 }}>
          <XAxis type="number" dataKey="x" domain={[win.hb0, win.hb0 + span]} ticks={ticks(win.hb0)} tick={{ fontSize: 11, fill: C.mute }} tickLine={false} axisLine={false} label={{ value: 'Horizontal break (in) · arm-side →', position: 'insideBottom', offset: -16, fontSize: 11, fill: '#5b5347', fontWeight: 600 }} />
          <YAxis type="number" dataKey="y" domain={[win.ivb0, win.ivb0 + span]} ticks={ticks(win.ivb0)} tick={{ fontSize: 11, fill: C.mute }} tickLine={false} axisLine={false} width={44} label={{ value: 'Induced vertical break (in)', angle: -90, position: 'insideLeft', offset: 8, fontSize: 11, fill: '#5b5347', fontWeight: 600, style: { textAnchor: 'middle' } }} />
          <Scatter data={anchors} isAnimationActive={false} shape={() => <g />} />
          <MapLayer cells={cells} pitcher={pitcher} markers={markers} onTip={setTip} />
        </ScatterChart>
      </ResponsiveContainer>
      {tip && (
        <div style={{ position: 'absolute', left: Math.min(tip.x + 12, 9999), top: tip.y + 12, pointerEvents: 'none', background: C.ink, color: '#fff', fontSize: 12, padding: '7px 10px', borderRadius: 8, maxWidth: 240, lineHeight: 1.4, zIndex: 5 }}>
          <b>HB {sgn(tip.cell.hb, 0)} in · IVB {sgn(tip.cell.ivb, 0)} in</b><br />
          {tip.cell.whiffRate == null
            ? <>{fmtN(tip.cell.swings)} swings — under the {GATE.swings} minimum, no rate shown</>
            : <>Whiff {pct(tip.cell.whiffRate)} per swing<br />n = {fmtN(tip.cell.swings)} swings</>}
        </div>
      )}
    </div>
  )
}
