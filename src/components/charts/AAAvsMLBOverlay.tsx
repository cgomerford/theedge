// src/components/charts/AAAvsMLBOverlay.tsx
//
// Two rolling series in one SVG line chart:
//   AAA line (dashed, orange, lower opacity)   — the trajectory in the minors
//   MLB line (solid, black)                    — since callup / this season
//
// Point of the chart: does the AAA line predict what the MLB line is doing?
// A player with a strong AAA line and a weak MLB line is often a "buy — sample
// is small, translation is real"; the reverse is often "sell — AAA numbers
// were inflated, level jump is real".
//
// HONESTY: this is NOT a projection. It's just plotting two data series and
// letting the user judge. Copy in scan_milb_prospects() is explicit that AAA
// form is a proxy, not a scouting grade — keep that same discipline here.
// If either series has < 5 data points, we hide the chart (small samples
// silently displayed as trends are how you lie).
//
// SERVER COMPONENT: pure props → SVG.

import type { RollingSeries } from './types'
import { CHART_COLORS, CHART_FONTS } from './types'

type Props = {
  aaa: RollingSeries | null      // null = no AAA history — component just renders the MLB line
  mlb: RollingSeries | null      // null = no MLB data — component shows AAA only with a note
  metricLabel: string            // e.g. "OPS", "wOBA", "K%"
  higherIsBetter?: boolean       // default true
  title?: string
  className?: string
}

const MIN_POINTS = 5

// ─── Path helpers ─────────────────────────────────────────────────────────────

type Domain = { minY: number; maxY: number; totalX: number }

function combinedDomain(seriesList: (RollingSeries | null)[]): Domain {
  const allValues: number[] = []
  let totalX = 0
  for (const s of seriesList) {
    if (!s) continue
    totalX = Math.max(totalX, s.points.length)
    for (const p of s.points) {
      if (p.value != null && Number.isFinite(p.value)) allValues.push(p.value)
    }
  }
  if (allValues.length === 0) return { minY: 0, maxY: 1, totalX: totalX || 1 }
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 0.02
  return { minY: min - pad, maxY: max + pad, totalX: totalX || 1 }
}

function pointsToPath(
  points: RollingSeries['points'],
  domain: Domain,
  chartW: number,
  chartH: number,
): string {
  const cmds: string[] = []
  let started = false
  points.forEach((p, i) => {
    if (p.value == null) { started = false; return }
    const x = (i / Math.max(domain.totalX - 1, 1)) * chartW
    const yRange = domain.maxY - domain.minY || 1
    const y = chartH - ((p.value - domain.minY) / yRange) * chartH
    cmds.push(`${started ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    started = true
  })
  return cmds.join(' ')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AAAvsMLBOverlay({
  aaa,
  mlb,
  metricLabel,
  higherIsBetter = true,
  title,
  className = '',
}: Props) {
  const aaaOk = aaa && aaa.points.filter(p => p.value != null).length >= MIN_POINTS
  const mlbOk = mlb && mlb.points.filter(p => p.value != null).length >= MIN_POINTS

  if (!aaaOk && !mlbOk) {
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
          Not enough game log for either level to plot a trend yet.
        </p>
      </div>
    )
  }

  // Chart dims (viewBox — SVG scales responsively via width:100%)
  const chartW = 520
  const chartH = 160
  const padL = 40
  const padR = 12
  const padT = 12
  const padB = 24
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB

  const domain = combinedDomain([aaaOk ? aaa : null, mlbOk ? mlb : null])

  const aaaPath = aaaOk ? pointsToPath(aaa!.points, domain, innerW, innerH) : ''
  const mlbPath = mlbOk ? pointsToPath(mlb!.points, domain, innerW, innerH) : ''

  // Y axis ticks — 3 evenly spaced
  const yTicks = [0, 0.5, 1].map(t => {
    const value = domain.minY + t * (domain.maxY - domain.minY)
    const y = padT + (1 - t) * innerH
    return { value, y }
  })

  // Delta callout (last MLB point vs. last AAA point where both exist)
  const lastMlb = mlbOk ? [...mlb!.points].reverse().find(p => p.value != null) : null
  const lastAaa = aaaOk ? [...aaa!.points].reverse().find(p => p.value != null) : null
  const delta =
    lastMlb && lastMlb.value != null && lastAaa && lastAaa.value != null
      ? lastMlb.value - lastAaa.value
      : null
  const deltaGood = delta != null && (higherIsBetter ? delta >= 0 : delta <= 0)

  return (
    <div className={`border border-stone-200 bg-white ${className}`}>
      {title && (
        <div
          className="border-b border-stone-100 px-3 py-2 flex items-center justify-between gap-2"
          style={{
            fontFamily: CHART_FONTS.mono,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: CHART_COLORS.orange,
            fontWeight: 700,
          }}
        >
          <span>⊕ {title}</span>
          {delta != null && (
            <span
              style={{
                color: deltaGood ? CHART_COLORS.positive : CHART_COLORS.negative,
                fontSize: 10,
              }}
            >
              MLB vs AAA: {delta > 0 ? '+' : ''}{delta.toFixed(higherIsBetter ? 3 : 2)}
            </span>
          )}
        </div>
      )}

      <div className="px-2 py-3">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" style={{ display: 'block' }}>
          {/* Y axis gridlines + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL} x2={chartW - padR}
                y1={t.y} y2={t.y}
                stroke={CHART_COLORS.grid}
                strokeWidth={1}
              />
              <text
                x={padL - 6} y={t.y + 3}
                textAnchor="end"
                fontFamily={CHART_FONTS.mono}
                fontSize={9}
                fill={CHART_COLORS.axis}
              >
                {higherIsBetter && t.value < 2 ? t.value.toFixed(3).replace(/^0/, '') : t.value.toFixed(2)}
              </text>
            </g>
          ))}

          {/* AAA line — dashed orange */}
          {aaaOk && (
            <g transform={`translate(${padL}, ${padT})`}>
              <path
                d={aaaPath}
                fill="none"
                stroke={CHART_COLORS.orange}
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.75}
              />
            </g>
          )}

          {/* MLB line — solid black */}
          {mlbOk && (
            <g transform={`translate(${padL}, ${padT})`}>
              <path
                d={mlbPath}
                fill="none"
                stroke={CHART_COLORS.ink}
                strokeWidth={2.5}
              />
            </g>
          )}

          {/* X axis label */}
          <text
            x={padL} y={chartH - 6}
            fontFamily={CHART_FONTS.mono}
            fontSize={9}
            fill={CHART_COLORS.axis}
          >
            oldest
          </text>
          <text
            x={chartW - padR} y={chartH - 6}
            textAnchor="end"
            fontFamily={CHART_FONTS.mono}
            fontSize={9}
            fill={CHART_COLORS.axis}
          >
            latest
          </text>
        </svg>

        {/* Legend */}
        <div
          className="flex items-center gap-4 flex-wrap mt-1 px-3"
          style={{ fontFamily: CHART_FONTS.mono, fontSize: 9, color: CHART_COLORS.axis }}
        >
          {aaaOk && (
            <div className="flex items-center gap-1.5">
              <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={CHART_COLORS.orange} strokeWidth="2" strokeDasharray="3 2" /></svg>
              <span>AAA {metricLabel}</span>
            </div>
          )}
          {mlbOk && (
            <div className="flex items-center gap-1.5">
              <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={CHART_COLORS.ink} strokeWidth="2.5" /></svg>
              <span>MLB {metricLabel}</span>
            </div>
          )}
          <div style={{ fontStyle: 'italic', color: CHART_COLORS.axis }}>
            AAA form is a proxy, not a projection.
          </div>
        </div>
      </div>
    </div>
  )
}
