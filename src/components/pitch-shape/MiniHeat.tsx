'use client'

// src/components/pitch-shape/MiniHeat.tsx
//
// One small league heat map for the "all pitch shape maps" and "compare levels" views, drawn from the half-inch samples of coarse-heat.ts with the shared continuous colour scale (heatGrid.ts). It is painted
// as crisp square blocks, one flat colour per sample (heatPaint.ts), shown with image-rendering: pixelated so every box keeps a hard edge. Blank where the window had too few swings.
// Optional marks (a cross or a dot) show where an average shape sits. Plain data in, no fetching.
import { useEffect, useRef } from 'react'
import { C } from '@/components/team/ui'
import { paintBlocks, rateColour } from './heatPaint'
import type { CoarseHeat } from '@/lib/pitch-shape/coarse-heat'

export type HeatMark = { hb: number; ivb: number; color: string; ring?: boolean }

export default function MiniHeat({ heat, label, marks = [] }: { heat: CoarseHeat; label: string; marks?: HeatMark[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) paintBlocks(ref.current, heat.n, i => rateColour(heat.rates[i]))
  }, [heat])
  const x = (hb: number) => ((hb - (heat.hb0 - heat.half)) / (2 * heat.half)) * 100, y = (ivb: number) => ((heat.ivb0 + heat.half - ivb) / (2 * heat.half)) * 100
  return (
    <div style={{ position: 'relative', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
      <canvas ref={ref} role="img" aria-label={label} style={{ width: '100%', aspectRatio: '1 / 1', display: 'block', imageRendering: 'pixelated' }} />
      {marks.length > 0 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {marks.map((m, i) => m.ring
            ? <g key={i}><line x1={x(m.hb) - 3} x2={x(m.hb) + 3} y1={y(m.ivb)} y2={y(m.ivb)} stroke={m.color} strokeWidth="2" vectorEffect="non-scaling-stroke" /><line y1={y(m.ivb) - 3} y2={y(m.ivb) + 3} x1={x(m.hb)} x2={x(m.hb)} stroke={m.color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>
            : <circle key={i} cx={x(m.hb)} cy={y(m.ivb)} r="2" fill={m.color} stroke="#1A1A1A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
        </svg>
      )}
    </div>
  )
}
