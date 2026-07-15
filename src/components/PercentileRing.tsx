'use client'

// Extended 2026-07-13 to support LineupCompare's tooltip + custom-color
// needs, while staying backward-compatible with existing callers
// (PlayerGradeDetailModal on the team pages calls this with just
// `percentile`/`size` — that usage is unchanged, same default color logic).

export const TOOLTIP_W = 224
export const TOOLTIP_H = 176

export type HoverInfo = {
  top: number
  left: number
  anchorX: number
  showBelow: boolean
  pct: number
  label: string
  glossary: string
  higherIsBetter?: boolean
}

export function percentileTierColor(percentile: number): string {
  if (percentile >= 90) return '#1D9E75'
  if (percentile >= 60) return '#EF9F27'
  if (percentile >= 40) return '#a89e8c'
  return '#D4537E'
}

export default function PercentileRing({
  percentile, size = 56, strokeWidth = 4, color,
}: { percentile: number; size?: number; strokeWidth?: number; color?: string }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - percentile / 100)
  const resolvedColor = color ?? percentileTierColor(percentile)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1eee6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={resolvedColor} strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 700, color: resolvedColor, fontFamily: 'monospace' }}>
        {percentile}
      </div>
    </div>
  )
}

export function PercentileTooltip({ hover }: { hover: HoverInfo }) {
  const arrowLeft = Math.max(12, Math.min(hover.anchorX - hover.left, TOOLTIP_W - 12))
  return (
    <div
      className="fixed z-[999] flex flex-col items-center gap-2 bg-[#1A1A1A] text-[#FAF8F3] rounded-xl p-4 shadow-2xl pointer-events-none text-center"
      style={{ top: hover.top, left: hover.left, width: TOOLTIP_W }}
    >
      <div
        className="absolute w-2.5 h-2.5 bg-[#1A1A1A] rotate-45"
        style={
          hover.showBelow
            ? { bottom: '100%', left: arrowLeft, marginBottom: -6 }
            : { top: '100%', left: arrowLeft, marginTop: -6 }
        }
      />
      <PercentileRing percentile={hover.pct} color={percentileTierColor(hover.pct)} size={64} strokeWidth={6} />
      <div className="font-serif font-semibold text-sm">{hover.label}</div>
      <div className="font-mono text-[10px] text-stone-300">
        {hover.pct}th percentile{hover.higherIsBetter === false ? ' · lower raw values rank higher here' : ''}
      </div>
      <p className="font-serif italic text-[11px] text-stone-300 leading-snug">{hover.glossary}</p>
    </div>
  )
}