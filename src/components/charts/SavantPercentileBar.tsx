// src/components/charts/SavantPercentileBar.tsx
//
// Horizontal stacked percentile bars — the Savant-style block that shows
// where a player ranks vs the league on 6-12 metrics at once. Useful anywhere
// you'd otherwise need a radar chart to say the same thing but readers
// struggle to compare radars.
//
// Percentile values must already be computed against the FULL league pool
// (per the current-state note about client-side percentile calc), not
// against a filtered position group — this component just draws them.
//
// SERVER COMPONENT: no state, no hooks.

import type { PercentileRow } from './types'
import { CHART_COLORS, CHART_FONTS } from './types'

type Props = {
  rows: PercentileRow[]
  title?: string
  compact?: boolean
  className?: string
}

// Palette matches your existing project convention (green good / red bad),
// not the Savant blue/red — keeps the whole site consistent.
function fillFor(percentile: number, higherIsBetter: boolean): string {
  const effective = higherIsBetter ? percentile : 100 - percentile
  if (effective >= 90) return '#047857'  // emerald-700 — elite
  if (effective >= 70) return CHART_COLORS.positive
  if (effective >= 40) return '#F59E0B'  // amber-500
  if (effective >= 20) return '#EA580C'  // orange-600
  return CHART_COLORS.negative
}

function PercentileRowBar({ row, compact }: { row: PercentileRow; compact: boolean }) {
  const higherIsBetter = row.higherIsBetter ?? true
  const fill = fillFor(row.percentile, higherIsBetter)

  const rowH = compact ? 22 : 28
  const trackH = 8

  return (
    <div
      className="grid items-center gap-3 border-t border-stone-100 first:border-0"
      style={{
        gridTemplateColumns: '110px 1fr 42px 30px',
        height: rowH,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {/* Label */}
      <div style={{
        fontFamily: CHART_FONTS.mono, fontSize: 10,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        color: CHART_COLORS.mutedInk,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.label}
      </div>

      {/* Track + filled bar */}
      <div
        style={{
          position: 'relative',
          height: trackH,
          background: CHART_COLORS.grid,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0, height: trackH,
            width: `${Math.max(2, row.percentile)}%`,
            background: fill,
          }}
        />
        {/* Midpoint tick */}
        <div style={{
          position: 'absolute', left: '50%', top: -2, width: 1, height: trackH + 4,
          background: CHART_COLORS.axis, opacity: 0.5,
        }} />
      </div>

      {/* Raw value */}
      <div style={{
        fontFamily: CHART_FONTS.mono, fontSize: 10.5,
        color: CHART_COLORS.ink, textAlign: 'right',
      }}>
        {row.rawValue}
      </div>

      {/* Percentile chip */}
      <div style={{
        fontFamily: CHART_FONTS.mono, fontSize: 10, fontWeight: 700,
        color: fill, textAlign: 'right',
      }}>
        {Math.round(row.percentile)}
      </div>
    </div>
  )
}

export default function SavantPercentileBar({
  rows,
  title,
  compact = false,
  className = '',
}: Props) {
  if (rows.length === 0) {
    return (
      <div className={`border border-stone-200 bg-white p-4 text-center ${className}`}>
        <p style={{
          fontFamily: CHART_FONTS.serif, fontStyle: 'italic',
          color: CHART_COLORS.axis, fontSize: 13,
        }}>
          Percentile data unavailable.
        </p>
      </div>
    )
  }

  return (
    <div className={`border border-stone-200 bg-white ${className}`}>
      {title && (
        <div
          className="border-b border-stone-100 px-3 py-2 flex items-center justify-between"
          style={{
            fontFamily: CHART_FONTS.mono, fontSize: 10,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: CHART_COLORS.orange, fontWeight: 700,
          }}
        >
          <span>⊕ {title}</span>
          <span style={{ color: CHART_COLORS.axis, letterSpacing: '0.1em' }}>
            vs qualified MLB
          </span>
        </div>
      )}
      <div>
        {rows.map((row, i) => <PercentileRowBar key={`${row.label}-${i}`} row={row} compact={compact} />)}
      </div>
    </div>
  )
}
