'use client'

import { pitchColor } from '@/lib/mlb'
import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'

// SVG donut chart — each pitch type gets an arc proportional to its usage%,
// colored by pitch type, with a clean legend below. Replaces the thin
// progress-bar-per-row with one single "what does his mix look like" visual.

const SIZE = 160
const RADIUS = 60
const STROKE = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function PitchUsageDonut({ rows }: { rows: ArsenalRow[] }) {
  if (rows.length === 0) return null

  const total = rows.reduce((sum, r) => sum + r.usage, 0)
  let offset = 0

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Pitch mix</p>
      <div className="flex items-center gap-6">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {rows.map(r => {
            const pct = total > 0 ? r.usage / total : 0
            const dashLength = CIRCUMFERENCE * pct
            const dashGap = CIRCUMFERENCE - dashLength
            const currentOffset = offset
            offset += dashLength
            return (
              <circle
                key={r.pitchType}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={pitchColor(r.pitchType)}
                strokeWidth={STROKE}
                strokeDasharray={`${dashLength} ${dashGap}`}
                strokeDashoffset={-currentOffset}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            )
          })}
        </svg>
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.pitchType} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
              <span className="text-[11px] font-serif text-stone-700 flex-1">{r.pitchName}</span>
              <span className="text-[11px] font-mono font-bold text-stone-900">{r.usage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}