// src/components/postgame/RadarChart.tsx
//
// Plain SVG radar chart — no charting library dependency, matches the
// project's existing hand-rolled SVG pattern (see PitchChart.tsx). Generic
// props, not postgame-specific, so it's reusable elsewhere.

const ORANGE = '#FF5722'
const INK = '#1A1A1A'

// ── Radar chart ─────────────────────────────────────────────────────────

export interface RadarSeries {
  name: string
  color: string
  values: number[]   // same length + order as axisLabels, 0-100
}

export function RadarChart({
  axisLabels,
  series,
  size = 280,
}: {
  axisLabels: string[]
  series: RadarSeries[]
  size?: number
}) {
  const center = size / 2
  const radius = size * 0.36
  const n = axisLabels.length
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const pointFor = (i: number, value: number) => {
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius
    const angle = angleFor(i)
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const
  }

  const rings = [0.25, 0.5, 0.75, 1]

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" role="img" aria-label="Radar chart">
        {/* grid rings */}
        {rings.map(pct => (
          <polygon
            key={pct}
            points={Array.from({ length: n }, (_, i) => {
              const angle = angleFor(i)
              const r = radius * pct
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
            }).join(' ')}
            fill="none"
            stroke="#E8E4DA"
            strokeWidth={1}
          />
        ))}
        {/* axis spokes */}
        {axisLabels.map((_, i) => {
          const angle = angleFor(i)
          return (
            <line
              key={i}
              x1={center} y1={center}
              x2={center + radius * Math.cos(angle)} y2={center + radius * Math.sin(angle)}
              stroke="#E8E4DA" strokeWidth={1}
            />
          )
        })}
        {/* series polygons */}
        {series.map(s => (
          <polygon
            key={s.name}
            points={s.values.map((v, i) => pointFor(i, v).join(',')).join(' ')}
            fill={s.color}
            fillOpacity={0.18}
            stroke={s.color}
            strokeWidth={2}
          />
        ))}
        {/* axis labels */}
        {axisLabels.map((label, i) => {
          const angle = angleFor(i)
          const lx = center + (radius + 22) * Math.cos(angle)
          const ly = center + (radius + 22) * Math.sin(angle)
          return (
            <text
              key={label}
              x={lx} y={ly}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize={9.5}
              fill="#6b6b66"
            >
              {label}
            </text>
          )
        })}
      </svg>
      <div className="flex justify-center gap-4 mt-2">
        {series.map(s => (
          <span key={s.name} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-stone-500">
            <span className="inline-block w-2.5 h-2.5" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
