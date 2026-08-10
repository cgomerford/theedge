// src/components/charts/ActualVsExpectedChart.tsx
//
// Dumbbell chart. For each metric, two dots on a shared axis: the box-score
// value (surface) and the quality-of-contact value (expected). A line between
// them + an arrow showing which way regression should carry the surface.
//
// USE FOR: batter wOBA vs xwOBA, BA vs xBA, SLG vs xSLG.
// USE FOR: pitcher ERA vs FIP/xERA/SIERA (higherIsBetter=false).
//
// PROPS:
//   rows  — from buildBatterRows() / buildPitcherRows() in @/lib/regression-score
//   title — optional heading
//   compact — smaller vertical spacing for embed inside cards
//
// SERVER COMPONENT: no client state, pure props → SVG. Safe to render from
// server pages, admin dashboards, and the Fantasy Desk without 'use client'.

import type { RegressionRow } from './types'
import { CHART_COLORS, CHART_FONTS } from './types'
import { scoreRow } from '@/lib/regression-score'

type Props = {
  rows: RegressionRow[]
  title?: string
  compact?: boolean
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number, higherIsBetter: boolean): string {
  // Rate stats on 0-1 → 3 decimals (.320). ERA-like → 2 decimals (3.85).
  if (higherIsBetter && value < 2) return value.toFixed(3).replace(/^0/, '')
  return value.toFixed(2)
}

/**
 * Turn the raw values into 0-100 X positions along the shared axis for one row.
 * Anchors the axis on the two values themselves plus a bit of padding so tiny
 * gaps stay visible and huge gaps still fit.
 */
function rowExtent(row: RegressionRow): { min: number; max: number } {
  const [lo, hi] = row.surface < row.expected
    ? [row.surface, row.expected]
    : [row.expected, row.surface]
  const range = Math.max(hi - lo, 0.001)
  const pad = range * 0.6
  return { min: lo - pad, max: hi + pad }
}

function xPos(value: number, extent: { min: number; max: number }): number {
  const denom = extent.max - extent.min
  if (denom === 0) return 50
  return ((value - extent.min) / denom) * 100
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function DumbbellRow({ row, compact }: { row: RegressionRow; compact: boolean }) {
  const signal = scoreRow(row)
  const extent = rowExtent(row)
  const surfaceX  = xPos(row.surface, extent)
  const expectedX = xPos(row.expected, extent)

  // For hitters (higherIsBetter=true): expected > surface → positive regression → green
  // For pitchers (higherIsBetter=false): expected < surface → positive regression → green
  const goodDirection = row.higherIsBetter
    ? row.expected > row.surface
    : row.expected < row.surface

  const gapColor =
    signal === 'buy'  ? CHART_COLORS.positive :
    signal === 'sell' ? CHART_COLORS.negative :
                        CHART_COLORS.neutral

  const arrow = goodDirection ? '→' : '←'
  const gapAbs = Math.abs(row.gap)
  const gapLabel = row.higherIsBetter
    ? `${(gapAbs * 1000).toFixed(0)} pts`
    : `${gapAbs.toFixed(2)} ERA`

  const rowH = compact ? 44 : 56

  return (
    <div
      className="border-t border-stone-100 first:border-0 grid items-center gap-4"
      style={{
        gridTemplateColumns: '120px 1fr 68px',
        height: rowH,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: CHART_FONTS.mono,
          fontSize: 10.5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: CHART_COLORS.mutedInk,
        }}
      >
        {row.label}
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: 26 }}>
        {/* Baseline */}
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, top: 12,
            height: 2,
            background: CHART_COLORS.grid,
          }}
        />
        {/* Connector */}
        <div
          style={{
            position: 'absolute',
            top: 11,
            height: 4,
            left:  `${Math.min(surfaceX, expectedX)}%`,
            width: `${Math.abs(expectedX - surfaceX)}%`,
            background: gapColor,
            opacity: 0.4,
          }}
        />
        {/* Surface dot (box score) */}
        <div
          title={`Surface: ${fmt(row.surface, row.higherIsBetter)}`}
          style={{
            position: 'absolute',
            left: `${surfaceX}%`,
            top: 6,
            width: 14,
            height: 14,
            marginLeft: -7,
            border: `2px solid ${CHART_COLORS.ink}`,
            background: CHART_COLORS.cream,
          }}
        />
        {/* Expected dot (quality of contact) */}
        <div
          title={`Expected: ${fmt(row.expected, row.higherIsBetter)}`}
          style={{
            position: 'absolute',
            left: `${expectedX}%`,
            top: 6,
            width: 14,
            height: 14,
            marginLeft: -7,
            background: gapColor,
          }}
        />
        {/* Value labels */}
        <div
          style={{
            position: 'absolute',
            left: `${surfaceX}%`,
            top: -2,
            transform: 'translateX(-50%)',
            fontFamily: CHART_FONTS.mono,
            fontSize: 9.5,
            color: CHART_COLORS.mutedInk,
            whiteSpace: 'nowrap',
          }}
        >
          {fmt(row.surface, row.higherIsBetter)}
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${expectedX}%`,
            top: -2,
            transform: 'translateX(-50%)',
            fontFamily: CHART_FONTS.mono,
            fontSize: 9.5,
            fontWeight: 700,
            color: gapColor,
            whiteSpace: 'nowrap',
          }}
        >
          x{fmt(row.expected, row.higherIsBetter)}
        </div>
      </div>

      {/* Gap chip */}
      <div
        style={{
          fontFamily: CHART_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: gapColor,
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {arrow} {gapLabel}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ActualVsExpectedChart({
  rows,
  title,
  compact = false,
  className = '',
}: Props) {
  if (rows.length === 0) {
    return (
      <div className={`border border-stone-200 bg-white p-4 text-center ${className}`}>
        <p
          style={{
            fontFamily: CHART_FONTS.serif,
            fontStyle: 'italic',
            color: CHART_COLORS.axis,
            fontSize: 13,
          }}
        >
          Not enough Statcast data for this player yet.
        </p>
      </div>
    )
  }

  return (
    <div className={`border border-stone-200 bg-white ${className}`}>
      {title && (
        <div
          className="border-b border-stone-100 px-3 py-2"
          style={{
            fontFamily: CHART_FONTS.mono,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: CHART_COLORS.orange,
            fontWeight: 700,
          }}
        >
          ⊕ {title}
        </div>
      )}
      <div>
        {rows.map((row, i) => (
          <DumbbellRow key={`${row.label}-${i}`} row={row} compact={compact} />
        ))}
      </div>
      {/* Legend */}
      <div
        className="border-t border-stone-100 px-3 py-2 flex items-center gap-4 flex-wrap"
        style={{ fontFamily: CHART_FONTS.mono, fontSize: 9, color: CHART_COLORS.axis }}
      >
        <div className="flex items-center gap-1.5">
          <div style={{ width: 8, height: 8, border: `2px solid ${CHART_COLORS.ink}`, background: CHART_COLORS.cream }} />
          <span>Surface</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 8, height: 8, background: CHART_COLORS.mutedInk }} />
          <span>Expected (quality of contact)</span>
        </div>
      </div>
    </div>
  )
}
