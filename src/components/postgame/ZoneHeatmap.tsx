// src/components/postgame/ZoneHeatmap.tsx
//
// 3x3 rulebook-zone heatmap (zones 1-9, catcher's-eye-view: 1/2/3 top row,
// 4/5/6 middle, 7/8/9 bottom). Used for two different things with the same
// ZoneCell shape:
//   - pitcher hot zones: intensity = whiffPct (where they missed bats)
//   - team batting zone mix: intensity = hitPct (where they did damage)
// Pass `metric` to pick which.

import type { ZoneCell } from '@/types/postgame'

const ORANGE_RGB = [255, 87, 34] // #FF5722

export function ZoneHeatmap({
  cells,
  metric,
  size = 120,
  label,
}: {
  cells: ZoneCell[]
  metric: 'whiff' | 'hit'
  size?: number
  label?: string
}) {
  const byZone = new Map(cells.map(c => [c.zone, c]))
  const cellSize = size / 3

  const valueFor = (c: ZoneCell | undefined) =>
    metric === 'whiff' ? c?.whiffPct ?? 0 : c?.hitPct ?? 0
  const sampleFor = (c: ZoneCell | undefined) =>
    metric === 'whiff' ? c?.pitches ?? 0 : c?.battedBalls ?? 0

  return (
    <div style={{ width: size }}>
      {label && <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>}
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Zone heatmap">
        {Array.from({ length: 9 }, (_, i) => i + 1).map(zone => {
          const col = (zone - 1) % 3
          const row = Math.floor((zone - 1) / 3)
          const cell = byZone.get(zone)
          const value = valueFor(cell)
          const n = sampleFor(cell)
          const alpha = n === 0 ? 0.04 : Math.min(0.9, 0.12 + (value / 100) * 0.78)
          return (
            <g key={zone}>
              <rect
                x={col * cellSize} y={row * cellSize} width={cellSize} height={cellSize}
                fill={`rgba(${ORANGE_RGB.join(',')},${alpha})`}
                stroke="#FAF8F3" strokeWidth={2}
              />
              {n > 0 && (
                <text
                  x={col * cellSize + cellSize / 2} y={row * cellSize + cellSize / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily="'JetBrains Mono', monospace" fontSize={cellSize * 0.16}
                  fill="#1A1A1A"
                >
                  {Math.round(value)}%
                </text>
              )}
            </g>
          )
        })}
        <rect x={0} y={0} width={size} height={size} fill="none" stroke="#1A1A1A" strokeWidth={1.5} />
      </svg>
      <div className="font-mono text-[8.5px] text-stone-400 mt-1">
        {metric === 'whiff' ? 'Whiff% by location, this pitcher' : 'Hit% by location, this team'}
      </div>
    </div>
  )
}