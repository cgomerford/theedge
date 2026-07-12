'use client'

function ringColor(percentile: number): string {
  if (percentile >= 90) return '#1D9E75'
  if (percentile >= 60) return '#EF9F27'
  if (percentile >= 40) return '#a89e8c'
  return '#D4537E'
}

export default function PercentileRing({
  percentile, size = 56, strokeWidth = 4,
}: { percentile: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - percentile / 100)
  const color = ringColor(percentile)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1eee6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {percentile}
      </div>
    </div>
  )
}