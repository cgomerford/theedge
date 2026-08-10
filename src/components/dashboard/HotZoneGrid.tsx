// src/components/dashboard/HotZoneGrid.tsx
'use client'

// 3x3 zone heatmap off batter_hot_zones / pitcher_hot_zones — the real
// Statcast aggregate, not a finer synthetic grid. We only have 9 zones of
// real data, so we show 9 zones; padding that out to a finer grid the way
// Baseball Savant does would mean interpolating cells with no data, which
// is exactly the kind of invented-precision this app avoids elsewhere.
//
// Metric toggle lets the same grid show AVG / SLG / xwOBA / Whiff% without
// four separate components. Cells under the sample-size floor (set in
// playerCompare.ts's getPlayerHotZones) render as a plain grey "—" — no
// value, no fake precision.

import { useState } from 'react'
import type { HotZoneCell } from '@/lib/playerCompare'

type Metric = 'avg' | 'slg' | 'xwoba' | 'whiffPct'

const METRIC_META: Record<Metric, { label: string; range: [number, number]; format: (v: number) => string }> = {
  avg:      { label: 'AVG',    range: [0.150, 0.400], format: v => v.toFixed(3).replace(/^0/, '') },
  slg:      { label: 'SLG',    range: [0.250, 0.700], format: v => v.toFixed(3).replace(/^0/, '') },
  xwoba:    { label: 'xwOBA',  range: [0.220, 0.450], format: v => v.toFixed(3) },
  whiffPct: { label: 'Whiff%', range: [10, 45],       format: v => `${v.toFixed(0)}%` },
}

// Brand-palette heat scale: cream (cold) → yellow → orange → dark ember (hot).
const STOPS: [number, string][] = [
  [0,    '#FAF8F3'],
  [0.4,  '#FDE047'],
  [0.75, '#FF5722'],
  [1,    '#7A1E0A'],
]

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  let lo = STOPS[0], hi = STOPS[STOPS.length - 1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (clamped >= STOPS[i][0] && clamped <= STOPS[i + 1][0]) {
      lo = STOPS[i]; hi = STOPS[i + 1]; break
    }
  }
  const span = hi[0] - lo[0] || 1
  const localT = (clamped - lo[0]) / span
  const [r1, g1, b1] = hexToRgb(lo[1])
  const [r2, g2, b2] = hexToRgb(hi[1])
  const r = Math.round(r1 + (r2 - r1) * localT)
  const g = Math.round(g1 + (g2 - g1) * localT)
  const b = Math.round(b1 + (b2 - b1) * localT)
  return `rgb(${r}, ${g}, ${b})`
}

type Props = {
  title: string
  cells: HotZoneCell[] | null
  note: string
  defaultMetric?: Metric
}

export default function HotZoneGrid({ title, cells, note, defaultMetric = 'avg' }: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric)
  const meta = METRIC_META[metric]

  if (!cells) {
    return (
      <div className="border border-stone-200 bg-white p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ {title}</div>
        <div className="h-40 flex items-center justify-center text-xs font-serif italic text-stone-400 text-center px-6">
          {note}
        </div>
      </div>
    )
  }

  const [lo, hi] = meta.range
  const rows = [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)]

  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">⊕ {title}</div>
        <div className="flex gap-1">
          {(Object.keys(METRIC_META) as Metric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider border ${
                metric === m
                  ? 'bg-[#1A1A1A] text-[#FDE047] border-[#1A1A1A]'
                  : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'
              }`}
            >
              {METRIC_META[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 max-w-[280px] mx-auto">
        {rows.flat().map(cell => {
          const value = cell[metric]
          const hasValue = value != null
          const t = hasValue ? (value - lo) / (hi - lo) : 0
          return (
            <div
              key={cell.zone}
              className="aspect-square flex flex-col items-center justify-center border border-white"
              style={{ background: hasValue ? lerpColor(t) : '#E7E2D6' }}
              title={`${cell.label} — ${cell.sampleSize} AB`}
            >
              {hasValue ? (
                <>
                  <span className="text-xs font-mono font-bold" style={{ color: t > 0.55 ? '#FAF8F3' : '#1A1A1A' }}>
                    {meta.format(value)}
                  </span>
                  <span className="text-[7px] font-mono uppercase tracking-wider opacity-70" style={{ color: t > 0.55 ? '#FAF8F3' : '#1A1A1A' }}>
                    {cell.label}
                  </span>
                </>
              ) : (
                <span className="text-[9px] font-mono text-stone-400">—</span>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-mono text-stone-400 mt-2 text-center">{note}</p>
    </div>
  )
}