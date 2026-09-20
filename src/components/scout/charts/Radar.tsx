// src/components/scout/charts/Radar.tsx
//
// Server-rendered radar for values that have a natural centre line (park-factor
// indexes, where 100 = league average). The dashed ring is that centre line: a spoke
// that pokes outside it is above average, inside it is below. Dependency-free SVG so it
// streams with the section; native <title> gives hover values.

import { CHART_BLUE } from './LineChart'

export type RadarAxis = { label: string; value: number | null }

export function CenteredRadar({ axes, center = 100, span = 30, size = 260, ariaLabel }: { axes: RadarAxis[]; center?: number; span?: number; size?: number; ariaLabel: string }) {
  const n = axes.length
  if (n < 3) return null
  const c = size / 2, R = size / 2 - 38                 // leave room for the labels
  const pos = (i: number, frac: number) => {            // frac 0 = middle, 1 = outer rim
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [c + Math.cos(a) * R * frac, c + Math.sin(a) * R * frac] as const
  }
  const frac = (v: number) => 0.5 + (Math.max(-span, Math.min(span, v - center)) / span) * 0.5   // centre ring sits half-way out
  const pts = axes.map((a, i) => pos(i, a.value == null ? 0.5 : frac(a.value)))
  const poly = pts.map((p) => p.join(',')).join(' ')
  const ring = (f: number) => axes.map((_, i) => pos(i, f).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] h-auto block mx-auto" role="img" aria-label={ariaLabel}>
      <polygon points={ring(1)} fill="none" stroke="#e7e5e4" />
      <polygon points={ring(0.75)} fill="none" stroke="#f0efed" />
      <polygon points={ring(0.5)} fill="#fafaf9" stroke="#a8a29e" strokeDasharray="3 3"><title>{`${center} = league average`}</title></polygon>
      <polygon points={ring(0.25)} fill="none" stroke="#f0efed" />
      {axes.map((_, i) => { const [x, y] = pos(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#eeeeec" /> })}
      <polygon points={poly} fill={CHART_BLUE} fillOpacity={0.18} stroke={CHART_BLUE} strokeWidth={1.75} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = pts[i]
        const [lx, ly] = pos(i, 1.2)
        const anchor = lx < c - 6 ? 'end' : lx > c + 6 ? 'start' : 'middle'
        return (
          <g key={a.label}>
            {a.value != null && <circle cx={x} cy={y} r={3} fill={CHART_BLUE} stroke="#fff" strokeWidth={1.25}><title>{`${a.label}: ${a.value}`}</title></circle>}
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-stone-600" style={{ font: '600 9.5px ui-monospace, monospace' }}>
              {a.label}
              <tspan x={lx} dy="10.5" className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{a.value ?? '—'}</tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}
