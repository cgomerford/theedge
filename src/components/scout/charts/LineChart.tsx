// src/components/scout/charts/LineChart.tsx
//
// Server-rendered SVG line chart for the Scout Report — no client JS. Hover
// is native: every x position has a transparent hit column carrying a <title>
// tooltip (date + every series' value) and a crosshair that shows on hover.
// Follows the dataviz mark specs: 2px lines, dashed thin baseline, a marker on
// the latest point with a 2px surface ring, recessive grid, ink-coloured text
// (never the series colour), one y-axis. `compact` drops axes for sparklines.

export type LineSeries = {
  key: string
  label: string
  color: string
  values: (number | null)[]
  dash?: string
}

// Validated categorical slots 1 and 2 from the dataviz reference palette.
export const CHART_BLUE = '#2a78d6'
export const CHART_ORANGE = '#eb6834'

const INK = '#78716c'      // stone-500
const GRID = '#e7e5e4'     // stone-200
const BASE = '#a8a29e'     // stone-400
const SURFACE = '#ffffff'
const MARK = '#eb6834'      // categorical slot 2 — the "flagged game" mark, never a series

type Props = {
  labels: string[]
  series: LineSeries[]
  /** Draw a small dot on every data point (default off — the line alone is cleaner for long series). */
  dots?: boolean
  /** Same length as labels: games to flag (e.g. a chosen player started). Drawn as a rug of dots on the
   *  x-axis plus a ringed dot on each series at that game. */
  marks?: boolean[]
  markLabel?: string
  baseline?: { value: number | null; label: string }
  format: (v: number) => string
  ariaLabel: string
  compact?: boolean
  height?: number
}

function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '', pen = false
  values.forEach((v, i) => {
    if (v == null) { pen = false; return }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  })
  return d
}

export default function LineChart({ labels, series, dots = false, marks, markLabel, baseline, format, ariaLabel, compact = false, height }: Props) {
  const W = compact ? 180 : 520
  const H = height ?? (compact ? 44 : 168)
  const rug = !!marks && !compact
  const padL = compact ? 3 : 40, padR = compact ? 6 : 10, padT = compact ? 6 : 10, padB = compact ? 6 : rug ? 34 : 22
  const innerW = W - padL - padR, innerH = H - padT - padB

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null)
  if (baseline?.value != null) all.push(baseline.value)
  if (all.length < 2 || labels.length < 2) {
    return <p className="text-[11px] font-sans italic text-stone-400 py-3">Not enough games yet to draw a trend.</p>
  }
  let lo = Math.min(...all), hi = Math.max(...all)
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.12
  lo -= pad; hi += pad

  const n = labels.length
  const x = (i: number) => padL + (i / (n - 1)) * innerW
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * innerH
  const ticks = compact ? [] : [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]
  const colW = innerW / (n - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full h-auto block">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK} fontFamily="ui-monospace, monospace">{format(t)}</text>
        </g>
      ))}

      {baseline?.value != null && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(baseline.value)} y2={y(baseline.value)} stroke={BASE} strokeWidth={1} strokeDasharray="4 3" />
          {!compact && <text x={padL + 4} y={y(baseline.value) - 4} textAnchor="start" fontSize={9} fill={INK} fontFamily="ui-monospace, monospace">{baseline.label} {format(baseline.value)}</text>}
        </g>
      )}

      {series.map((s) => {
        let last = -1
        s.values.forEach((v, i) => { if (v != null) last = i })
        return (
          <g key={s.key}>
            <path d={segments(s.values, x, y)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />
            {dots && !compact && s.values.map((v, i) => v != null && i !== last && (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} stroke={SURFACE} strokeWidth={1.5} />
            ))}
            {marks && !compact && s.values.map((v, i) => v != null && marks[i] && (
              <circle key={`m${i}`} cx={x(i)} cy={y(v)} r={4.5} fill={SURFACE} stroke={MARK} strokeWidth={2.5} />
            ))}
            {last >= 0 && <circle cx={x(last)} cy={y(s.values[last] as number)} r={compact ? 3 : 4} fill={s.color} stroke={SURFACE} strokeWidth={2} />}
          </g>
        )
      })}

      {rug && (
        <g>
          <line x1={padL} x2={W - padR} y1={padT + innerH + 12} y2={padT + innerH + 12} stroke={GRID} strokeWidth={1} />
          {marks!.map((on, i) => on && <circle key={i} cx={x(i)} cy={padT + innerH + 12} r={3.5} fill={MARK} stroke={SURFACE} strokeWidth={1.5} />)}
        </g>
      )}

      {!compact && [0, Math.floor((n - 1) / 2), n - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={10} fill={INK} fontFamily="ui-monospace, monospace">{labels[i]}</text>
      ))}

      {labels.map((label, i) => (
        <g key={i} className="group">
          <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + innerH} stroke={BASE} strokeWidth={1} className="opacity-0 group-hover:opacity-100" />
          <rect x={x(i) - colW / 2} y={0} width={colW} height={H} fill="transparent">
            <title>{`${label}${marks?.[i] && markLabel ? ` — ${markLabel}` : ''}\n${series.map((s) => `${s.label}: ${s.values[i] != null ? format(s.values[i] as number) : '—'}`).join('\n')}`}</title>
          </rect>
        </g>
      ))}
    </svg>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string; dash?: boolean; dot?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-stone-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dot
            ? <svg width="18" height="8" aria-hidden><circle cx="9" cy="4" r="3.5" fill={i.color} /></svg>
            : <svg width="18" height="6" aria-hidden><line x1="0" x2="18" y1="3" y2="3" stroke={i.color} strokeWidth={2} strokeDasharray={i.dash ? '4 3' : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  )
}
