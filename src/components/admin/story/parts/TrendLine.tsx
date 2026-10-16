import { clamp } from '../motion'

/** Line chart of the last N rolling windows; draws left→right as p goes 0→1. */
export default function TrendLine({ data, w, h, color, p }: { data: number[]; w: number; h: number; color: string; p: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pad = 8
  const pts = data.map((v, i) => [pad + (i * (w - pad * 2)) / (data.length - 1), h - pad - ((v - min) / range) * (h - pad * 2)] as const)
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="1 1" strokeDashoffset={1 - clamp(p)} />
      {p >= 0.98 && <circle cx={last[0]} cy={last[1]} r={9} fill={color} />}
    </svg>
  )
}
