// src/components/charts/TrendOverlayChart.tsx
//
// Rolling metric with an optional dashed baseline (season average, career,
// league median — whatever's meaningful). Same shape you already use in
// LabDashboard, extracted so /fantasy, /stats, and the drawer share one
// implementation instead of three.
//
// USE FOR:
//   • Batter rolling OPS with season baseline
//   • Pitcher rolling ERA with FIP as the baseline (more honest than season ERA)
//   • Reliever last-5 K/9 with career K/9 baseline
//   • Any single stat where "current form vs their normal" is the story
//
// SERVER COMPONENT.

import type { RollingSeries } from './types'
import { CHART_COLORS, CHART_FONTS } from './types'

type Props = {
  series: RollingSeries
  higherIsBetter?: boolean
  title?: string
  height?: number
  className?: string
  showLastValue?: boolean   // default true — draws a highlighted last point + value
}

const MIN_POINTS = 3

export default function TrendOverlayChart({
  series,
  higherIsBetter = true,
  title,
  height = 140,
  className = '',
  showLastValue = true,
}: Props) {
  const validPoints = series.points.filter(p => p.value != null && Number.isFinite(p.value))
  if (validPoints.length < MIN_POINTS) {
    return (
      <div className={`border border-stone-200 bg-white p-4 text-center ${className}`}>
        <p style={{
          fontFamily: CHART_FONTS.serif, fontStyle: 'italic',
          color: CHART_COLORS.axis, fontSize: 13,
        }}>
          Not enough games yet to plot a trend.
        </p>
      </div>
    )
  }

  const chartW = 520
  const chartH = height
  const padL = 44
  const padR = 14
  const padT = 12
  const padB = 22
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB

  const values = validPoints.map(p => p.value as number)
  let minY = Math.min(...values)
  let maxY = Math.max(...values)
  if (series.baseline != null) {
    minY = Math.min(minY, series.baseline)
    maxY = Math.max(maxY, series.baseline)
  }
  const pad = (maxY - minY) * 0.15 || Math.abs(maxY) * 0.1 || 0.02
  minY -= pad
  maxY += pad

  const yRange = maxY - minY || 1

  const xFor = (i: number) => padL + (i / Math.max(series.points.length - 1, 1)) * innerW
  const yFor = (value: number) => padT + innerH - ((value - minY) / yRange) * innerH

  // Build path (skipping nulls creates a break in the line, which is what we want)
  let path = ''
  let started = false
  series.points.forEach((p, i) => {
    if (p.value == null) { started = false; return }
    const cmd = started ? 'L' : 'M'
    path += `${cmd} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)} `
    started = true
  })

  const strokeColor = series.color ?? CHART_COLORS.orange
  const yTicks = [0, 0.5, 1].map(t => ({
    value: minY + t * (maxY - minY),
    y: padT + (1 - t) * innerH,
  }))

  // Last point emphasis
  const lastIdx = validPoints.length > 0 ? series.points.length - 1 - [...series.points].reverse().findIndex(p => p.value != null) : -1
  const lastValue = lastIdx >= 0 ? (series.points[lastIdx].value as number) : null
  const lastX = lastIdx >= 0 ? xFor(lastIdx) : 0
  const lastY = lastValue != null ? yFor(lastValue) : 0

  // Is the last value "good" relative to the baseline?
  const goodVsBaseline =
    lastValue != null && series.baseline != null
      ? (higherIsBetter ? lastValue >= series.baseline : lastValue <= series.baseline)
      : true
  const lastColor = goodVsBaseline ? CHART_COLORS.positive : CHART_COLORS.negative

  const fmt = (v: number) => (higherIsBetter && v < 2 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(2))

  return (
    <div className={`border border-stone-200 bg-white ${className}`}>
      {title && (
        <div
          className="border-b border-stone-100 px-3 py-2"
          style={{
            fontFamily: CHART_FONTS.mono, fontSize: 10,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: CHART_COLORS.orange, fontWeight: 700,
          }}
        >
          ⊕ {title}
        </div>
      )}

      <div className="px-2 py-3">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" style={{ display: 'block' }}>
          {/* Y gridlines */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL} x2={chartW - padR}
                y1={t.y} y2={t.y}
                stroke={CHART_COLORS.grid} strokeWidth={1}
              />
              <text
                x={padL - 6} y={t.y + 3}
                textAnchor="end"
                fontFamily={CHART_FONTS.mono}
                fontSize={9} fill={CHART_COLORS.axis}
              >
                {fmt(t.value)}
              </text>
            </g>
          ))}

          {/* Baseline */}
          {series.baseline != null && (
            <>
              <line
                x1={padL} x2={chartW - padR}
                y1={yFor(series.baseline)} y2={yFor(series.baseline)}
                stroke={CHART_COLORS.mutedInk}
                strokeWidth={1.2}
                strokeDasharray="5 4"
                opacity={0.6}
              />
              <text
                x={chartW - padR} y={yFor(series.baseline) - 4}
                textAnchor="end"
                fontFamily={CHART_FONTS.mono}
                fontSize={9} fill={CHART_COLORS.mutedInk}
              >
                Season {fmt(series.baseline)}
              </text>
            </>
          )}

          {/* Series line */}
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Last value emphasis */}
          {showLastValue && lastValue != null && (
            <>
              <circle cx={lastX} cy={lastY} r={5} fill={lastColor} stroke={CHART_COLORS.cream} strokeWidth={2} />
              <text
                x={lastX} y={Math.max(lastY - 10, 12)}
                textAnchor="middle"
                fontFamily={CHART_FONTS.mono}
                fontSize={10} fontWeight={700}
                fill={lastColor}
              >
                {fmt(lastValue)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
