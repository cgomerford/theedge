'use client'

// src/components/UmpireCallChart.tsx
//
// Strike-zone scatter: every missed call plotted at its actual pitch
// location (pX = horizontal feet from center of plate, pZ = height in
// feet). The zone rectangle is the AVERAGE top/bottom across tracked
// pitches this game. Real zones vary by batter height/stance, so the
// rectangle is only a visual reference — individual pitch decisions
// (and the ranked list) use each pitch’s own zone.

import type { MissedCall } from '@/lib/postgame'

const ZONE_HALF_WIDTH_FT = 0.83 // ~17" plate width / 2
const VIEW_W = 260
const VIEW_H = 300
// feet → svg px: horizontal -2.2…2.2 ft, vertical 0.5…4.5 ft
const X_RANGE: [number, number] = [-2.2, 2.2]
const Z_RANGE: [number, number] = [0.5, 4.5]

function xToSvg(x: number) {
  return ((x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * VIEW_W
}
function zToSvg(z: number) {
  return VIEW_H - ((z - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * VIEW_H
}

type Props = {
  missedCalls: MissedCall[]
  avgZoneTop?: number
  avgZoneBottom?: number
}

export default function UmpireCallChart({
  missedCalls,
  avgZoneTop = 3.4,
  avgZoneBottom = 1.6,
}: Props) {
  const zoneX1 = xToSvg(-ZONE_HALF_WIDTH_FT)
  const zoneX2 = xToSvg(ZONE_HALF_WIDTH_FT)
  const zoneY1 = zToSvg(avgZoneTop)
  const zoneY2 = zToSvg(avgZoneBottom)
  const zoneW = zoneX2 - zoneX1
  const zoneH = zoneY2 - zoneY1

  // Home-plate pentagon (catcher’s view, roughly to scale)
  const plateTop = VIEW_H - 28
  const plateBottom = VIEW_H - 6
  const plateHalf = (ZONE_HALF_WIDTH_FT / (X_RANGE[1] - X_RANGE[0])) * VIEW_W
  const plateCx = VIEW_W / 2
  const platePoints = [
    `${plateCx - plateHalf},${plateTop}`,
    `${plateCx + plateHalf},${plateTop}`,
    `${plateCx + plateHalf * 0.55},${plateBottom - 4}`,
    `${plateCx},${plateBottom}`,
    `${plateCx - plateHalf * 0.55},${plateBottom - 4}`,
  ].join(' ')

  if (missedCalls.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 200 }}>
        <span className="font-mono text-[10px] text-stone-400">No missed calls to plot</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" style={{ maxWidth: 260 }}>
        {/* Approximate average zone — dashed + light fill so it never looks like a hard rule */}
        <rect
          x={zoneX1}
          y={zoneY1}
          width={zoneW}
          height={zoneH}
          fill="#f5f5f4"
          fillOpacity={0.45}
          stroke="#a8a29e"
          strokeWidth={1.25}
          strokeDasharray="4 3"
        />

        {/* Vertical center line */}
        <line
          x1={VIEW_W / 2}
          y1={zoneY1}
          x2={VIEW_W / 2}
          y2={zoneY2}
          stroke="#d6d3d1"
          strokeWidth={0.75}
          strokeDasharray="2 2"
        />

        {/* Height labels for the average zone */}
        <text
          x={zoneX2 + 6}
          y={zoneY1 + 3}
          className="fill-stone-400"
          style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}
        >
          {avgZoneTop.toFixed(1)}′
        </text>
        <text
          x={zoneX2 + 6}
          y={zoneY2 + 3}
          className="fill-stone-400"
          style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}
        >
          {avgZoneBottom.toFixed(1)}′
        </text>

        {/* Home plate */}
        <polygon
          points={platePoints}
          fill="#f5f5f4"
          stroke="#d6d3d1"
          strokeWidth={1}
        />

        {missedCalls.map((m, i) => {
          const cx = xToSvg(m.pX)
          const cy = zToSvg(m.pZ)
          // red = called strike that should have been a ball
          // blue = called ball that should have been a strike
          const color = m.call === 'called_strike' ? '#ef4444' : '#3b82f6'
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={4.5}
              fill={color}
              fillOpacity={0.8}
              stroke="#fff"
              strokeWidth={1}
            >
              <title>
                {`${m.batterName} vs ${m.pitcherName} · Inn ${m.inning}${
                  m.half === 'top' ? '▲' : '▼'
                } · ${m.distanceInches}" miss`}
              </title>
            </circle>
          )
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2.5 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="font-mono text-[9px] text-stone-500">
            Called strike (should’ve been ball)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="font-mono text-[9px] text-stone-500">
            Called ball (should’ve been strike)
          </span>
        </div>
      </div>

      <p className="mt-1.5 max-w-[240px] text-center font-mono text-[8px] leading-snug text-stone-400">
        Zone box = average top/bottom this game. Points can sit inside it when a batter’s actual
        zone differed; distance numbers use each pitch’s own zone.
      </p>
    </div>
  )
}