// src/components/charts/SplitBarChart.tsx
//
// Twin vertical bars for split comparisons: vs LHP/RHP, home/away, day/night,
// 1st/2nd half — whatever pair you feed it. Useful in the drawer where a
// full trend chart would be overkill.
//
// If you want more than 2 splits in one chart (e.g. all 6 monthly splits),
// pass them all and the component will render them as evenly-sized bars.
//
// SERVER COMPONENT.

import { CHART_COLORS, CHART_FONTS } from './types'

type SplitEntry = {
  label: string
  value: number
  format?: 'avg3' | 'ops3' | 'era2' | 'pct1' | 'raw'
}

type Props = {
  splits: SplitEntry[]
  title?: string
  higherIsBetter?: boolean
  className?: string
  height?: number
}

function formatValue(v: number, fmt: SplitEntry['format']): string {
  switch (fmt) {
    case 'avg3':
    case 'ops3': return v.toFixed(3).replace(/^0/, '')
    case 'era2': return v.toFixed(2)
    case 'pct1': return `${v.toFixed(1)}%`
    default:     return v.toFixed(2)
  }
}

export default function SplitBarChart({
  splits,
  title,
  higherIsBetter = true,
  className = '',
  height = 130,
}: Props) {
  if (splits.length === 0) {
    return (
      <div className={`border border-stone-200 bg-white p-4 text-center ${className}`}>
        <p style={{
          fontFamily: CHART_FONTS.serif, fontStyle: 'italic',
          color: CHART_COLORS.axis, fontSize: 13,
        }}>
          No split data available.
        </p>
      </div>
    )
  }

  const maxVal = Math.max(...splits.map(s => s.value))
  const minVal = Math.min(...splits.map(s => s.value))
  const scaleMax = maxVal * 1.15 || 1

  // Highlight the "best" bar orange, mute the rest
  const bestIdx = higherIsBetter
    ? splits.reduce((best, s, i) => (s.value > splits[best].value ? i : best), 0)
    : splits.reduce((best, s, i) => (s.value < splits[best].value ? i : best), 0)

  const barGap = 8
  const availableW = 100 // percent
  const barW = (availableW - barGap * (splits.length + 1)) / splits.length

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

      <div className="px-3 py-3">
        <div style={{ position: 'relative', height }}>
          {splits.map((s, i) => {
            const heightPct = (s.value / scaleMax) * 85  // reserve 15% for the value label at the top
            const isBest = i === bestIdx
            const barColor = isBest ? CHART_COLORS.orange : CHART_COLORS.mutedInk

            return (
              <div
                key={`${s.label}-${i}`}
                style={{
                  position: 'absolute',
                  bottom: 20,
                  left: `${barGap + i * (barW + barGap)}%`,
                  width: `${barW}%`,
                  height: `${heightPct}%`,
                  background: barColor,
                  opacity: isBest ? 1 : 0.55,
                }}
                title={`${s.label}: ${formatValue(s.value, s.format)}`}
              >
                {/* Value label above the bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0, right: 0, top: -18,
                    textAlign: 'center',
                    fontFamily: CHART_FONTS.mono,
                    fontSize: 10.5,
                    fontWeight: isBest ? 700 : 500,
                    color: barColor,
                  }}
                >
                  {formatValue(s.value, s.format)}
                </div>
              </div>
            )
          })}

          {/* X axis labels */}
          <div
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              display: 'flex',
              justifyContent: 'space-around',
              fontFamily: CHART_FONTS.mono,
              fontSize: 10,
              color: CHART_COLORS.mutedInk,
              letterSpacing: '0.05em',
            }}
          >
            {splits.map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                {s.label}
              </div>
            ))}
          </div>

          {/* Baseline */}
          <div
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 20,
              height: 1,
              background: CHART_COLORS.axis,
            }}
          />
        </div>
      </div>
    </div>
  )
}
