// src/components/postgame/PieChart.tsx
//
// Plain SVG pie chart, split out from RadarChart.tsx. No dependency, same
// hand-rolled-SVG pattern as PitchChart.tsx.

// ── Pie chart ────────────────────────────────────────────────────────────

export interface PieSlice {
  label: string
  value: number
  color?: string
}

const DEFAULT_PALETTE = ['#FF5722', '#1A1A1A', '#FDE047', '#6b6b66', '#8B5CF6']

export function PieChart({ slices, size = 160 }: { slices: PieSlice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) {
    return <div className="font-mono text-[10px] text-stone-400 text-center py-6">No data</div>
  }
  const center = size / 2
  const radius = size * 0.42

  let cumulativeAngle = -Math.PI / 2
  const paths = slices.map((s, i) => {
    const fraction = s.value / total
    const startAngle = cumulativeAngle
    const endAngle = cumulativeAngle + fraction * Math.PI * 2
    cumulativeAngle = endAngle
    const largeArc = fraction > 0.5 ? 1 : 0
    const x1 = center + radius * Math.cos(startAngle)
    const y1 = center + radius * Math.sin(startAngle)
    const x2 = center + radius * Math.cos(endAngle)
    const y2 = center + radius * Math.sin(endAngle)
    const color = s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]
    return {
      d: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color, label: s.label, value: s.value, pct: Math.round(fraction * 100),
    }
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Pie chart">
        {paths.map(p => (
          <path key={p.label} d={p.d} fill={p.color} fillOpacity={0.85} stroke="#FAF8F3" strokeWidth={1.5} />
        ))}
      </svg>
      <div className="space-y-1">
        {paths.map(p => (
          <div key={p.label} className="flex items-center gap-1.5 font-mono text-[10px] text-stone-600">
            <span className="inline-block w-2.5 h-2.5" style={{ background: p.color }} />
            {p.label} <span className="text-stone-400">{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
