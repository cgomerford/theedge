// src/components/scout/charts/Scatter.tsx
//
// Server-rendered scatter for "one player against the league field". Grey dots are the
// field, the highlighted dot is the player being scouted (blue, labelled). Median lines
// split the plot into quadrants. Native <title> gives hover values. Dependency-free SVG
// like the rest of the Scout charts.

import { CHART_BLUE } from './LineChart'

export type ScatterPoint = { id: number | string; label: string; x: number; y: number; highlight?: boolean }

export function Scatter({ points, xLabel, yLabel, xDecimals = 2, yDecimals = 1, best, ariaLabel }: {
  points: ScatterPoint[]; xLabel: string; yLabel: string; xDecimals?: number; yDecimals?: number
  /** which corner is best, drawn as a small corner note */
  best?: { corner: 'tl' | 'tr' | 'bl' | 'br'; text: string }
  ariaLabel: string
}) {
  if (points.length < 3) return null
  const W = 300, H = 210, L = 36, R = 10, T = 10, B = 30
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const pad = (lo: number, hi: number) => { const s = (hi - lo) || 1; return [lo - s * 0.06, hi + s * 0.06] as const }
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys))
  const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R)
  const sy = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B)
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  const mx = med(xs), my = med(ys)
  const hi = points.find((p) => p.highlight)
  const corner = best && {
    tl: { x: L + 4, y: T + 9, a: 'start' }, tr: { x: W - R - 4, y: T + 9, a: 'end' },
    bl: { x: L + 4, y: H - B - 5, a: 'start' }, br: { x: W - R - 4, y: H - B - 5, a: 'end' },
  }[best.corner]
  const ticks = (lo: number, hi_: number, dec: number) => [lo, (lo + hi_) / 2, hi_].map((v) => v.toFixed(dec))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={ariaLabel}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" stroke="#e7e5e4" />
      <line x1={sx(mx)} x2={sx(mx)} y1={T} y2={H - B} stroke="#d6d3d1" strokeDasharray="3 3"><title>{`Field median ${xLabel}: ${mx.toFixed(xDecimals)}`}</title></line>
      <line x1={L} x2={W - R} y1={sy(my)} y2={sy(my)} stroke="#d6d3d1" strokeDasharray="3 3"><title>{`Field median ${yLabel}: ${my.toFixed(yDecimals)}`}</title></line>
      {points.filter((p) => !p.highlight).map((p) => (
        <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill="#a8a29e" fillOpacity={0.55}><title>{`${p.label}: ${p.x.toFixed(xDecimals)} / ${p.y.toFixed(yDecimals)}`}</title></circle>
      ))}
      {hi && (
        <g>
          <circle cx={sx(hi.x)} cy={sy(hi.y)} r={5.5} fill={CHART_BLUE} stroke="#fff" strokeWidth={2}><title>{`${hi.label}: ${hi.x.toFixed(xDecimals)} / ${hi.y.toFixed(yDecimals)}`}</title></circle>
          <text x={sx(hi.x) + (sx(hi.x) > W - 80 ? -9 : 9)} y={sy(hi.y) - 8} textAnchor={sx(hi.x) > W - 80 ? 'end' : 'start'} className="fill-stone-800" style={{ font: '700 9.5px ui-sans-serif, system-ui' }}>{hi.label.split(' ').slice(-1)[0]}</text>
        </g>
      )}
      {corner && best && <text x={corner.x} y={corner.y} textAnchor={corner.a as 'start' | 'end'} className="fill-stone-400" style={{ font: '400 8.5px ui-monospace, monospace' }}>{best.text}</text>}
      {ticks(x0, x1, xDecimals).map((t, i) => <text key={`x${i}`} x={L + (i / 2) * (W - L - R)} y={H - B + 11} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="fill-stone-400" style={{ font: '400 8.5px ui-monospace, monospace' }}>{t}</text>)}
      {ticks(y0, y1, yDecimals).map((t, i) => <text key={`y${i}`} x={L - 4} y={H - B - (i / 2) * (H - T - B) + 3} textAnchor="end" className="fill-stone-400" style={{ font: '400 8.5px ui-monospace, monospace' }}>{t}</text>)}
      <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle" className="fill-stone-500" style={{ font: '600 9px ui-monospace, monospace' }}>{xLabel}</text>
      <text transform={`translate(9 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="fill-stone-500" style={{ font: '600 9px ui-monospace, monospace' }}>{yLabel}</text>
    </svg>
  )
}
