'use client'

// src/app/admin/charts/plots.tsx
//
// The drawing half of the chart builder: one component per chart type, each filling the plot area of the picture (W x H). Plain SVG (tables are HTML),
// every text element sets Red Hat explicitly so the exported PNG never falls back to another face. Dots and bars are clickable (onToggle) so the editor can name them.

import { GT } from '@/lib/graphics/constants'
import { C, SANS } from '@/components/team/ui'
import { PALETTE, binIndex, bubbleRadius, type Bin, type BoxGroup, type CompareStat, type Series, type Slice } from '@/lib/graphics/chart-model'
import { fmt, layoutLabels, niceTicks, type Point } from '@/lib/graphics/scatter'

const GREY = '#8A8275'
const LINE = '#E7E2D8'
const txt = (o: Record<string, unknown> = {}) => ({ fontFamily: SANS, ...o })

// ── Scatter and bubble ────────────────────────────────────────────────────────────────────

export type DotPoint = { name: string; x: number; y: number; size: number | null; cat: string | null }
export type ScatterProps = {
  W: number; H: number; fs: number; pts: DotPoint[]; picked: Point[]
  xDec: number; yDec: number; signedX: boolean; signedY: boolean; xLabel: string; yLabel: string
  diagonal: boolean; diagLabel: string; equal: boolean; zeroLines: boolean
  colors: Map<string, string> | null; bubble: { label: string; lo: number; hi: number } | null
  /** a colour the editor chose for one player; undefined means the brand orange */
  pcolor: (name: string) => string | undefined
  /** league reference lines (the average and median of everyone in the table) */
  refs: { xAvg?: number | null; yAvg?: number | null; xMed?: number | null; yMed?: number | null } | null
  onToggle: (name: string) => void
}
export function ScatterPlot(p: ScatterProps) {
  const { W, H, fs, pts } = p
  const legend = p.colors ? [...p.colors.entries()].slice(0, 10) : []
  const M = { l: 62, r: 26, t: legend.length ? 36 : 12, b: 50 }
  const pw = W - M.l - M.r, ph = H - M.t - M.b
  if (!pts.length) return <Empty W={W} H={H} text="No players to plot. Lower the minimum sample or choose other stats." />
  // the league lines are part of the picture, so the axes always reach them
  const num = (v: number | null | undefined): number[] => (v != null && Number.isFinite(v) ? [v] : [])
  const xs = [...pts.map(d => d.x), ...num(p.refs?.xAvg), ...num(p.refs?.xMed)], ys = [...pts.map(d => d.y), ...num(p.refs?.yAvg), ...num(p.refs?.yMed)]
  const pad = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a), d = (hi - lo || 1) * 0.04; return [lo - d, hi + d] as const }
  const fixed = p.diagonal && p.equal
  let [x0, x1] = pad(xs), [y0, y1] = pad(ys)
  if (fixed) { x0 = y0 = Math.min(x0, y0); x1 = y1 = Math.max(x1, y1) }
  let tx = niceTicks(x0, x1, W > 1100 ? 7 : 6), ty = niceTicks(y0, y1, H > 560 ? 7 : 6)
  if (fixed) { const a = niceTicks(Math.min(tx.lo, ty.lo), Math.max(tx.hi, ty.hi), 7); tx = a; ty = a }
  const sx = (v: number) => M.l + ((v - tx.lo) / (tx.hi - tx.lo)) * pw
  const sy = (v: number) => M.t + ph - ((v - ty.lo) / (ty.hi - ty.lo)) * ph
  const color = (d: DotPoint) => (p.colors && d.cat ? p.colors.get(d.cat) ?? GREY : GREY)
  const r = (d: DotPoint) => (p.bubble && d.size != null ? bubbleRadius(d.size, p.bubble.lo, p.bubble.hi, 4, W > 1100 ? 22 : 18) : 5)
  const pickedSet = new Set(p.picked.map(d => d.name))
  const labels = layoutLabels(p.picked.map(d => ({ px: sx(d.x), py: sy(d.y), text: `${d.name} (${fmt(d.x, p.xDec, p.signedX)}, ${fmt(d.y, p.yDec, p.signedY)})` })), { x0: M.l, y0: M.t, x1: M.l + pw, y1: M.t + ph }, fs, 7, 0.64)
  const zl = (t: number) => p.zeroLines && t === 0
  const lo = Math.max(tx.lo, ty.lo), hi = Math.min(tx.hi, ty.hi)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${p.xLabel} against ${p.yLabel}`}>
      {ty.ticks.map(t => <line key={`gy${t}`} x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} stroke={zl(t) ? GREY : LINE} strokeWidth={zl(t) ? 1.5 : 1} />)}
      {tx.ticks.map(t => <line key={`gx${t}`} y1={M.t} y2={M.t + ph} x1={sx(t)} x2={sx(t)} stroke={zl(t) ? GREY : LINE} strokeWidth={zl(t) ? 1.5 : 1} />)}
      <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke="#BDB9AF" />
      {tx.ticks.map(t => <text key={`tx${t}`} x={sx(t)} y={M.t + ph + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmt(t, p.xDec > 0 && !Number.isInteger(t) ? p.xDec : 0, p.signedX)}</text>)}
      {ty.ticks.map(t => <text key={`ty${t}`} x={M.l - 10} y={sy(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmt(t, p.yDec > 0 && !Number.isInteger(t) ? p.yDec : 0, p.signedY)}</text>)}
      <text x={M.l + pw / 2} y={H - 8} textAnchor="middle" fontSize={15} fontWeight={800} fill={GT.ink} {...txt()}>{p.xLabel}</text>
      <text transform={`translate(16 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={15} fontWeight={800} fill={GT.ink} {...txt()}>{p.yLabel}</text>
      {p.refs && (() => {
        const line = (v: number | null | undefined, vertical: boolean, kind: 'Avg' | 'Median', dec: number, signed: boolean) => {
          if (v == null || !Number.isFinite(v)) return null
          if (vertical && (v < tx.lo || v > tx.hi)) return null
          if (!vertical && (v < ty.lo || v > ty.hi)) return null
          const t = `League ${kind === 'Avg' ? 'avg' : 'median'} ${fmt(v, dec, signed)}`
          return vertical
            ? <g key={`v${kind}`}><line x1={sx(v)} x2={sx(v)} y1={M.t} y2={M.t + ph} stroke="#5B5347" strokeWidth={1.4} strokeDasharray={kind === 'Avg' ? '2 4' : '7 4'} /><text x={sx(v) + 5} y={M.t + (kind === 'Avg' ? 14 : 28)} fontSize={12} fontWeight={700} fill="#5B5347" stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{t}</text></g>
            : <g key={`h${kind}`}><line x1={M.l} x2={M.l + pw} y1={sy(v)} y2={sy(v)} stroke="#5B5347" strokeWidth={1.4} strokeDasharray={kind === 'Avg' ? '2 4' : '7 4'} /><text x={M.l + pw - 6} y={sy(v) - 5 - (kind === 'Avg' ? 0 : 0)} textAnchor="end" fontSize={12} fontWeight={700} fill="#5B5347" stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{t}</text></g>
        }
        return <>{line(p.refs.xAvg, true, 'Avg', p.xDec, p.signedX)}{line(p.refs.xMed, true, 'Median', p.xDec, p.signedX)}{line(p.refs.yAvg, false, 'Avg', p.yDec, p.signedY)}{line(p.refs.yMed, false, 'Median', p.yDec, p.signedY)}</>
      })()}
      {p.diagonal && hi > lo && (
        <>
          <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke={GT.ink} strokeWidth={1.2} strokeDasharray="5 4" />
          <text x={sx(hi) - 6} y={sy(hi) + 16} textAnchor="end" fontSize={13} fontWeight={700} fill={GT.ink} {...txt()}>{p.diagLabel}</text>
        </>
      )}
      {pts.map((d, i) => !pickedSet.has(d.name) && <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={r(d)} fill={color(d)} opacity={p.colors || p.bubble ? 0.7 : 0.55} />)}
      {p.picked.map((d, i) => { const q = pts.find(z => z.name === d.name); return <circle key={`h${i}`} cx={sx(d.x)} cy={sy(d.y)} r={Math.max(7, q ? r(q) : 7)} fill={p.pcolor(d.name) ?? GT.accent} stroke={p.colors && q ? color(q) : GT.paper} strokeWidth={p.colors ? 3 : 1.5} /> })}
      {p.picked.map((d, i) => { const l = labels[i]; return <text key={`l${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={fs} fontWeight={800} fill={GT.ink} stroke={GT.paper} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" {...txt()}>{`${d.name} (${fmt(d.x, p.xDec, p.signedX)}, ${fmt(d.y, p.yDec, p.signedY)})`}</text> })}
      {pts.map((d, i) => <circle key={`c${i}`} cx={sx(d.x)} cy={sy(d.y)} r={Math.max(10, r(d))} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => p.onToggle(d.name)}><title>{`${d.name} (${fmt(d.x, p.xDec, p.signedX)}, ${fmt(d.y, p.yDec, p.signedY)}). Click to ${pickedSet.has(d.name) ? 'remove the label' : 'name this dot'}`}</title></circle>)}
      {legend.map(([k, c], i) => <g key={k} transform={`translate(${M.l + i * 96} 12)`}><circle cx={5} cy={5} r={5} fill={c} /><text x={14} y={9} fontSize={12} fontWeight={700} fill={GT.ink} {...txt()}>{k}</text></g>)}
      {p.bubble && <text x={M.l + pw} y={M.t + ph - 8} textAnchor="end" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{`Dot size: ${p.bubble.label}`}</text>}
    </svg>
  )
}

const Empty = ({ W, H, text }: { W: number; H: number; text: string }) => (
  <svg width={W} height={H}><text x={W / 2} y={H / 2} textAnchor="middle" fontSize={18} fontWeight={700} fill={GREY} {...txt()}>{text}</text></svg>
)

// ── Bars and columns ──────────────────────────────────────────────────────────────────────

export type BarItem = { key: string; label: string; value: number; color: string; hl: boolean; hlColor?: string; clickable: boolean }
export function BarPlot({ W, H, fs, items, horizontal, fmtV, valueLabel, onToggle, legend = [], refLines = [] }: { W: number; H: number; fs: number; items: BarItem[]; horizontal: boolean; fmtV: (v: number) => string; valueLabel: string; onToggle: (key: string) => void; legend?: [string, string][]; refLines?: { value: number; label: string; dash: string }[] }) {
  const key = legend.slice(0, 8).map(([k, c], i) => <g key={k} transform={`translate(${W - 24 - (legend.slice(0, 8).length - i) * 92} ${H - 22})`}><rect width={12} height={12} rx={2} fill={c} /><text x={18} y={11} fontSize={12} fontWeight={700} fill={GT.ink} {...txt()}>{k}</text></g>)
  if (!items.length) return <Empty W={W} H={H} text="Nothing to show. Lower the minimum sample or choose another stat." />
  const vmin = Math.min(0, ...items.map(i => i.value)), vmax = Math.max(0, ...items.map(i => i.value))
  const span = vmax - vmin || 1
  if (horizontal) {
    // reference lines get their own strip above the bars so their labels never sit on a bar
    const L = Math.min(W * 0.34, Math.max(100, Math.max(...items.map(i => i.label.length)) * fs * 0.6)), R = 74, T = refLines.length ? 8 + refLines.length * 15 : 6, B = 26
    const pw = W - L - R, rowH = (H - T - B) / items.length, bh = Math.min(34, rowH * 0.7)
    const x = (v: number) => L + ((v - vmin) / span) * pw
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <line x1={x(0)} x2={x(0)} y1={T} y2={H - B} stroke={GREY} />
        {items.map((it, i) => {
          const y = T + i * rowH + (rowH - bh) / 2, x0 = x(Math.min(0, it.value)), x1 = x(Math.max(0, it.value))
          const f = Math.min(fs, Math.max(10, rowH * 0.62))
          return (
            <g key={it.key} style={{ cursor: it.clickable ? 'pointer' : 'default' }} onClick={() => it.clickable && onToggle(it.key)}>
              <rect x={0} y={T + i * rowH} width={W} height={rowH} fill="transparent" />
              <text x={L - 10} y={y + bh / 2 + f * 0.35} textAnchor="end" fontSize={f} fontWeight={it.hl ? 800 : 700} fill={GT.ink} {...txt()}>{it.label}</text>
              <rect x={x0} y={y} width={Math.max(1, x1 - x0)} height={bh} rx={2} fill={it.hl ? it.hlColor ?? GT.accent : it.color} />
              <text x={it.value >= 0 ? x1 + 8 : x0 - 8} y={y + bh / 2 + f * 0.35} textAnchor={it.value >= 0 ? 'start' : 'end'} fontSize={f} fontWeight={800} fill={GT.ink} {...txt()}>{fmtV(it.value)}</text>
              <title>{it.clickable ? `${it.label}. Click to ${it.hl ? 'remove the highlight' : 'highlight'}` : it.label}</title>
            </g>
          )
        })}
        {refLines.map((r, i) => r.value >= vmin && r.value <= vmax && <g key={r.label}><line x1={x(r.value)} x2={x(r.value)} y1={T - 4} y2={H - B} stroke="#5B5347" strokeWidth={1.5} strokeDasharray={r.dash} /><text x={x(r.value) + 5} y={14 + i * 15} fontSize={12} fontWeight={700} fill="#5B5347" stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{r.label}</text></g>)}
        <text x={L + pw / 2} y={H - 6} textAnchor="middle" fontSize={14} fontWeight={800} fill={GT.ink} {...txt()}>{valueLabel}</text>
        {key}
      </svg>
    )
  }
  const Lm = 56, Rm = 16, Tm = 26, Bm = Math.min(150, Math.max(70, Math.max(...items.map(i => i.label.length)) * 6.2))
  const pw = W - Lm - Rm, ph = H - Tm - Bm, colW = pw / items.length, bw = Math.min(70, colW * 0.7)
  const y = (v: number) => Tm + ph - ((v - vmin) / span) * ph
  const ticks = niceTicks(vmin, vmax, 5).ticks.filter(t => t >= vmin - 1e-9 && t <= vmax + 1e-9)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {ticks.map(t => <g key={t}><line x1={Lm} x2={Lm + pw} y1={y(t)} y2={y(t)} stroke={LINE} /><text x={Lm - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmtV(t)}</text></g>)}
      <line x1={Lm} x2={Lm + pw} y1={y(0)} y2={y(0)} stroke={GREY} />
      {items.map((it, i) => {
        const cx = Lm + i * colW + colW / 2, y0 = y(Math.max(0, it.value)), y1 = y(Math.min(0, it.value))
        return (
          <g key={it.key} style={{ cursor: it.clickable ? 'pointer' : 'default' }} onClick={() => it.clickable && onToggle(it.key)}>
            <rect x={cx - colW / 2} y={Tm} width={colW} height={ph + Bm} fill="transparent" />
            <rect x={cx - bw / 2} y={y0} width={bw} height={Math.max(1, y1 - y0)} rx={2} fill={it.hl ? it.hlColor ?? GT.accent : it.color} />
            <text x={cx} y={it.value >= 0 ? y0 - 6 : y1 + 14} textAnchor="middle" fontSize={Math.min(fs, Math.max(10, colW * 0.5))} fontWeight={800} fill={GT.ink} {...txt()}>{fmtV(it.value)}</text>
            <text transform={`translate(${cx + 4} ${Tm + ph + 14}) rotate(45)`} fontSize={Math.min(fs, Math.max(10, colW * 0.6))} fontWeight={it.hl ? 800 : 700} fill={GT.ink} {...txt()}>{it.label}</text>
            <title>{it.label}</title>
          </g>
        )
      })}
      {refLines.map((r, i) => r.value >= vmin && r.value <= vmax && <g key={r.label}><line x1={Lm} x2={Lm + pw} y1={y(r.value)} y2={y(r.value)} stroke="#5B5347" strokeWidth={1.5} strokeDasharray={r.dash} /><text x={Lm + pw - 4} y={y(r.value) - 5 - i * 14} textAnchor="end" fontSize={12} fontWeight={700} fill="#5B5347" stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{r.label}</text></g>)}
      <text transform={`translate(14 ${Tm + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={14} fontWeight={800} fill={GT.ink} {...txt()}>{valueLabel}</text>
      {key}
    </svg>
  )
}

// ── Histogram ─────────────────────────────────────────────────────────────────────────────

export function HistPlot({ W, H, fs, bins, mean, median, marks, xLabel, fmtV, n, showMean = false, markColor }: { W: number; H: number; fs: number; bins: Bin[]; mean: number; median: number; marks: { name: string; x: number }[]; xLabel: string; fmtV: (v: number) => string; n: number; showMean?: boolean; markColor?: (name: string) => string | undefined }) {
  if (!bins.length) return <Empty W={W} H={H} text="No numbers to count. Choose another stat." />
  const M = { l: 56, r: 24, t: 40, b: 50 }, pw = W - M.l - M.r, ph = H - M.t - M.b
  const lo = bins[0].lo, hi = bins[bins.length - 1].hi
  const tx = niceTicks(lo, hi, 7)
  const sx = (v: number) => M.l + ((v - lo) / (hi - lo || 1)) * pw
  const cmax = Math.max(...bins.map(b => b.count))
  const ty = niceTicks(0, cmax, 5)
  const sy = (v: number) => M.t + ph - (v / (ty.hi || 1)) * ph
  const hit = new Set(marks.map(m => binIndex(bins, m.x)))
  const sorted = [...marks].sort((a, b) => a.x - b.x)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {ty.ticks.map(t => <g key={t}><line x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} stroke={LINE} /><text x={M.l - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{t}</text></g>)}
      {bins.map((b, i) => <rect key={i} x={sx(b.lo) + 1} y={sy(b.count)} width={Math.max(1, sx(b.hi) - sx(b.lo) - 2)} height={Math.max(0, M.t + ph - sy(b.count))} fill={hit.has(i) ? (marks.filter(m => binIndex(bins, m.x) === i).map(m => markColor?.(m.name)).find(Boolean) ?? GT.accent) : '#BDB9AF'} rx={1} />)}
      <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke="#BDB9AF" />
      {tx.ticks.filter(t => t >= lo - 1e-9 && t <= hi + 1e-9).map(t => <text key={t} x={sx(t)} y={M.t + ph + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmtV(t)}</text>)}
      <line x1={sx(median)} x2={sx(median)} y1={M.t - 6} y2={M.t + ph} stroke={GT.ink} strokeWidth={1.2} strokeDasharray="5 4" />
      <text x={sx(median) + 6} y={M.t + 6} fontSize={13} fontWeight={700} fill={GT.ink} {...txt()}>{`Median ${fmtV(median)}`}</text>
      {showMean && Number.isFinite(mean) && <g><line x1={sx(mean)} x2={sx(mean)} y1={M.t - 6} y2={M.t + ph} stroke="#5B5347" strokeWidth={1.4} strokeDasharray="2 4" /><text x={sx(mean) + 6} y={M.t + 20} fontSize={13} fontWeight={700} fill="#5B5347" {...txt()}>{`Average ${fmtV(mean)}`}</text></g>}
      {sorted.map((m, i) => (
        <g key={m.name}>
          <line x1={sx(m.x)} x2={sx(m.x)} y1={M.t + 34 + (i % 3) * 18} y2={M.t + ph} stroke={markColor?.(m.name) ?? GT.accent} strokeWidth={2} />
          <circle cx={sx(m.x)} cy={M.t + 34 + (i % 3) * 18} r={5} fill={markColor?.(m.name) ?? GT.accent} />
          <text x={sx(m.x) + (sx(m.x) > M.l + pw * 0.7 ? -10 : 10)} y={M.t + 38 + (i % 3) * 18} textAnchor={sx(m.x) > M.l + pw * 0.7 ? 'end' : 'start'} fontSize={fs} fontWeight={800} fill={GT.ink} stroke={GT.paper} strokeWidth={4} paintOrder="stroke" {...txt()}>{`${m.name} (${fmtV(m.x)})`}</text>
        </g>
      ))}
      <text x={M.l + pw / 2} y={H - 8} textAnchor="middle" fontSize={15} fontWeight={800} fill={GT.ink} {...txt()}>{xLabel}</text>
      <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={14} fontWeight={800} fill={GT.ink} {...txt()}>{`Players (${n})`}</text>
    </svg>
  )
}

// ── Lines over seasons ────────────────────────────────────────────────────────────────────

export function LinePlot({ W, H, fs, series, league, leagueLabel, yLabel, fmtV, colors, area = false }: { W: number; H: number; fs: number; series: Series[]; league: { season: number; v: number | null }[] | null; leagueLabel: string; yLabel: string; fmtV: (v: number) => string; colors: string[]; area?: boolean }) {
  const seasons = (league ?? series[0]?.points ?? []).map(p => p.season)
  const all = [...series.flatMap(s => s.points.map(p => p.v)), ...(league?.map(p => p.v) ?? [])].filter((v): v is number => v != null)
  if (!seasons.length || !all.length) return <Empty W={W} H={H} text="Include players by name to follow them across seasons." />
  const M = { l: 62, r: 190, t: 16, b: 50 }, pw = W - M.l - M.r, ph = H - M.t - M.b
  const ty = niceTicks(Math.min(...all), Math.max(...all), 6)
  const s0 = seasons[0], s1 = seasons[seasons.length - 1]
  const sx = (s: number) => M.l + (s1 === s0 ? pw / 2 : ((s - s0) / (s1 - s0)) * pw)
  const sy = (v: number) => M.t + ph - ((v - ty.lo) / (ty.hi - ty.lo || 1)) * ph
  const step = Math.ceil(seasons.length / 10)
  const path = (pts: { season: number; v: number | null }[]) => { let d = '', pen = false; for (const q of pts) { if (q.v == null) { pen = false; continue } d += `${pen ? 'L' : 'M'}${sx(q.season).toFixed(1)} ${sy(q.v).toFixed(1)} `; pen = true } return d }
  // End-of-line names, nudged apart so they never overlap.
  const ends = series.map((s, i) => { const last = [...s.points].reverse().find(q => q.v != null); return last ? { i, y: sy(last.v as number), name: s.name, v: last.v as number } : null }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.y - b.y)
  const gap = fs * 1.25
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < gap) ends[k].y = ends[k - 1].y + gap
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {ty.ticks.map(t => <g key={t}><line x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} stroke={LINE} /><text x={M.l - 10} y={sy(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmtV(t)}</text></g>)}
      <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke="#BDB9AF" />
      {seasons.filter((_, i) => i % step === 0).map(s => <text key={s} x={sx(s)} y={M.t + ph + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{s}</text>)}
      {league && <path d={path(league)} fill="none" stroke={GREY} strokeWidth={2} strokeDasharray="6 5" />}
      {league && (() => { const last = [...league].reverse().find(q => q.v != null); return last ? <text x={sx(last.season) + 12} y={sy(last.v as number) + 4} fontSize={fs - 1} fontWeight={700} fill={GREY} {...txt()}>{leagueLabel}</text> : null })()}
      {area && series.map((s, i) => { let d = '', run: { season: number; v: number }[] = []; const flush = () => { if (run.length > 1) d += `M${sx(run[0].season).toFixed(1)} ${(M.t + ph).toFixed(1)} ` + run.map(q => `L${sx(q.season).toFixed(1)} ${sy(q.v).toFixed(1)}`).join(' ') + ` L${sx(run[run.length - 1].season).toFixed(1)} ${(M.t + ph).toFixed(1)} Z `; run = [] }; for (const q of s.points) { if (q.v == null) flush(); else run.push({ season: q.season, v: q.v }) } flush(); return <path key={`a${s.name}`} d={d} fill={colors[i]} opacity={0.14} /> })}
      {series.map((s, i) => <path key={s.name} d={path(s.points)} fill="none" stroke={colors[i]} strokeWidth={3} strokeLinejoin="round" />)}
      {series.map((s, i) => s.points.map(q => q.v != null && <circle key={`${s.name}${q.season}`} cx={sx(q.season)} cy={sy(q.v)} r={4.5} fill={colors[i]}><title>{`${s.name}, ${q.season}: ${fmtV(q.v)}`}</title></circle>))}
      {ends.map(e => <text key={e.name} x={M.l + pw + 12} y={e.y + 4} fontSize={fs} fontWeight={800} fill={colors[e.i]} {...txt()}>{`${e.name} (${fmtV(e.v)})`}</text>)}
      <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={14} fontWeight={800} fill={GT.ink} {...txt()}>{yLabel}</text>
    </svg>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────────────────────

export function DonutPlot({ W, H, fs, slices, fmtV, totalLabel }: { W: number; H: number; fs: number; slices: Slice[]; fmtV: (v: number) => string; totalLabel: string }) {
  if (!slices.length) return <Empty W={W} H={H} text="No positive totals to share out. Choose another stat or group." />
  const R = Math.min(H / 2 - 8, W * 0.3), cx = R + 24, cy = H / 2, r0 = R * 0.6
  let a = -Math.PI / 2
  const total = slices.reduce((s, x) => s + x.value, 0)
  const arcs = slices.map((s, i) => {
    const da = s.share * Math.PI * 2, a1 = a + da, big = da > Math.PI ? 1 : 0
    const p = (r: number, t: number) => `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`
    const d = slices.length === 1 ? `M${cx - R} ${cy} A${R} ${R} 0 1 1 ${cx + R} ${cy} A${R} ${R} 0 1 1 ${cx - R} ${cy} M${cx - r0} ${cy} A${r0} ${r0} 0 1 0 ${cx + r0} ${cy} A${r0} ${r0} 0 1 0 ${cx - r0} ${cy}Z` : `M${p(R, a)} A${R} ${R} 0 ${big} 1 ${p(R, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${p(r0, a)}Z`
    a = a1
    return { d, color: s.label === 'Other' ? '#BDB9AF' : PALETTE[i % PALETTE.length], s }
  })
  const rowH = Math.min(38, (H - 20) / slices.length), lx = cx + R + 50
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {arcs.map((x, i) => <path key={i} d={x.d} fill={x.color} fillRule="evenodd" stroke={GT.paper} strokeWidth={2}><title>{`${x.s.label}: ${fmtV(x.s.value)} (${(x.s.share * 100).toFixed(1)}%)`}</title></path>)}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={34} fontWeight={800} fill={GT.ink} {...txt()}>{fmtV(total)}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize={13} fontWeight={700} fill={GREY} {...txt()}>{totalLabel}</text>
      {arcs.map((x, i) => {
        const y = (H - rowH * slices.length) / 2 + i * rowH + rowH / 2
        const f = Math.min(fs + 2, Math.max(11, rowH * 0.5))
        return (
          <g key={`l${i}`}>
            <rect x={lx} y={y - 8} width={16} height={16} rx={3} fill={x.color} />
            <text x={lx + 26} y={y + f * 0.35} fontSize={f} fontWeight={800} fill={GT.ink} {...txt()}>{x.s.label}</text>
            <text x={W - 24} y={y + f * 0.35} textAnchor="end" fontSize={f} fontWeight={700} fill={GT.ink} {...txt()}>{`${fmtV(x.s.value)} · ${(x.s.share * 100).toFixed(1)}%`}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────────────────

export type TableRow = { key: string; rank: number; name: string; cells: string[]; hl: boolean; color?: string; /** percentile (0 to 100) of each cell, for heat colouring */ heat?: (number | null)[] }
export function TablePlot({ W, H, fs, heads, rows, onToggle, heat = false }: { W: number; H: number; fs: number; heads: string[]; rows: TableRow[]; onToggle: (name: string) => void; heat?: boolean }) {
  if (!rows.length) return <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREY, fontWeight: 700, fontSize: 18, fontFamily: SANS }}>Nothing to show. Lower the minimum sample.</div>
  const rowH = Math.min(46, (H - 34) / (rows.length + 1)), f = Math.min(fs + 2, Math.max(11, rowH * 0.5))
  const cols = `44px minmax(0, 1.6fr) ${heads.map(() => 'minmax(0, 1fr)').join(' ')}`
  const cell: React.CSSProperties = { display: 'flex', alignItems: 'center', height: rowH, borderBottom: `1px solid ${LINE}`, fontSize: f, fontFamily: SANS, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', whiteSpace: 'nowrap' }
  return (
    <div style={{ width: W, height: H, overflow: 'hidden', fontFamily: SANS, color: GT.ink }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8 }}>
        <div style={{ ...cell, borderBottom: `2px solid ${GT.ink}`, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: GREY }}>#</div>
        <div style={{ ...cell, borderBottom: `2px solid ${GT.ink}`, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: GREY }}>PLAYER</div>
        {heads.map(h => <div key={h} style={{ ...cell, borderBottom: `2px solid ${GT.ink}`, justifyContent: 'flex-end', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: GREY, textTransform: 'uppercase' }}>{h}</div>)}
        {rows.map(r => (
          <div key={r.key} style={{ display: 'contents', cursor: 'pointer' }} onClick={() => onToggle(r.name)} title={`${r.name}. Click to ${r.hl ? 'remove the highlight' : 'highlight'}`}>
            <div style={{ ...cell, color: GREY, fontWeight: 700, background: r.hl ? `${r.color ?? GT.accent}22` : undefined }}>{r.rank}</div>
            <div style={{ ...cell, fontWeight: 800, background: r.hl ? `${r.color ?? GT.accent}22` : undefined, color: r.hl && r.color ? r.color : GT.ink }}>{r.name}</div>
            {r.cells.map((c, i) => { const h = heat ? r.heat?.[i] : null; return <div key={i} style={{ ...cell, justifyContent: 'flex-end', fontWeight: 700, background: h != null ? `rgba(255,87,34,${(h / 100) * 0.55})` : r.hl ? `${r.color ?? GT.accent}22` : undefined }}>{c}</div> })}
          </div>
        ))}
      </div>
    </div>
  )
}
// ── Compare players: each stat is a row, each player a bar showing where he ranks among the whole table ───────────────

export function ComparePlot({ W, H, fs, players, stats, fmtV, colors }: { W: number; H: number; fs: number; players: string[]; stats: CompareStat[]; fmtV: (s: CompareStat, v: number) => string; colors: string[] }) {
  if (!players.length || !stats.length) return <Empty W={W} H={H} text="Include two or more players by name and choose the stats to compare." />
  const T = 52, L = Math.min(250, W * 0.25), R = 20, barW = W - L - R - 150
  const rowH = (H - T - 6) / stats.length, bh = Math.max(7, Math.min(20, (rowH - 8) / players.length))
  const f = Math.min(fs + 1, Math.max(11, rowH * 0.34))
  const x = (p: number) => L + (p / 100) * barW
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {players.map((n, i) => <g key={n} transform={`translate(${L + i * Math.min(210, barW / players.length)} 2)`}><rect y={2} width={14} height={14} rx={3} fill={colors[i]} /><text x={20} y={14} fontSize={fs + 1} fontWeight={800} fill={GT.ink} {...txt()}>{n}</text></g>)}
      {[0, 25, 50, 75, 100].map(p => <g key={p}><line x1={x(p)} x2={x(p)} y1={T - 6} y2={H - 4} stroke={p === 50 ? '#BDB9AF' : LINE} strokeDasharray={p === 50 ? '4 3' : undefined} /><text x={x(p)} y={T - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={GREY} {...txt()}>{p === 50 ? 'median' : p === 100 ? 'highest' : p === 0 ? 'lowest' : p}</text></g>)}
      {stats.map((s, r) => {
        const y0 = T + r * rowH + (rowH - bh * players.length) / 2
        return (
          <g key={s.key}>
            <line x1={0} x2={W - R} y1={T + r * rowH} y2={T + r * rowH} stroke={LINE} />
            <text x={0} y={T + r * rowH + rowH / 2 + f * 0.35} fontSize={f} fontWeight={800} fill={GT.ink} {...txt()}>{s.label.length > 34 ? `${s.label.slice(0, 33)}…` : s.label}</text>
            {players.map((n, i) => {
              const pct = s.pct[i], v = s.values[i], y = y0 + i * bh
              return (
                <g key={n}>
                  <rect x={L} y={y + 1} width={barW} height={bh - 2} fill="#F1EEE6" rx={2} />
                  {pct != null && v != null ? (
                    <>
                      <rect x={L} y={y + 1} width={Math.max(2, (pct / 100) * barW)} height={bh - 2} fill={colors[i]} rx={2} />
                      <text x={L + barW + 8} y={y + bh / 2 + 4} fontSize={Math.min(f, bh + 3)} fontWeight={800} fill={GT.ink} {...txt()}>{fmtV(s, v)}</text>
                      <text x={W - R} y={y + bh / 2 + 4} textAnchor="end" fontSize={Math.min(f - 1, bh + 2)} fontWeight={700} fill={GREY} {...txt()}>{`${Math.round(pct)}th`}</text>
                    </>
                  ) : <text x={L + 8} y={y + bh / 2 + 4} fontSize={Math.min(f - 1, bh + 2)} fontWeight={700} fill={GREY} {...txt()}>no number</text>}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
// ── Radar: each named player is a shape; every axis is a stat, reaching further the higher he ranks ──────────────────

export function RadarPlot({ W, H, fs, players, stats, colors, fmtV }: { W: number; H: number; fs: number; players: string[]; stats: CompareStat[]; colors: string[]; fmtV: (s: CompareStat, v: number) => string }) {
  if (players.length < 1 || stats.length < 3) return <Empty W={W} H={H} text="Include players by name and choose 3 or more stats for the axes." />
  const n = stats.length, cx = W * 0.3, cy = H / 2 + 6, R = Math.min(H / 2 - 56, W * 0.24)
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, p: number) => [cx + Math.cos(ang(i)) * R * (p / 100), cy + Math.sin(ang(i)) * R * (p / 100)] as const
  const ring = (p: number) => stats.map((_, i) => pt(i, p).map(v => v.toFixed(1)).join(',')).join(' ')
  const f = Math.min(fs, 13)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {[25, 50, 75, 100].map(p => <polygon key={p} points={ring(p)} fill={p === 100 ? '#F1EEE6' : 'none'} stroke={p === 50 ? '#BDB9AF' : LINE} strokeDasharray={p === 50 ? '4 3' : undefined} />)}
      {stats.map((s, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 118), c = Math.cos(ang(i)); return <g key={s.key}><line x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} /><text x={lx} y={ly + 4} textAnchor={Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end'} fontSize={f} fontWeight={800} fill={GT.ink} {...txt()}>{s.label.length > 24 ? `${s.label.slice(0, 23)}…` : s.label}</text></g> })}
      {players.map((n2, pi) => {
        const pts = stats.map((s, i) => pt(i, s.pct[pi] ?? 0))
        return (
          <g key={n2}>
            <polygon points={pts.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')} fill={colors[pi]} fillOpacity={0.16} stroke={colors[pi]} strokeWidth={3} strokeLinejoin="round" />
            {pts.map((q, i) => stats[i].pct[pi] != null && <circle key={i} cx={q[0]} cy={q[1]} r={4.5} fill={colors[pi]}><title>{`${n2}, ${stats[i].label}: ${stats[i].values[pi] != null ? fmtV(stats[i], stats[i].values[pi] as number) : ''} (${Math.round(stats[i].pct[pi] as number)}th)`}</title></circle>)}
          </g>
        )
      })}
      <text x={cx + R * 0.5 + 4} y={cy + 14} fontSize={10} fontWeight={700} fill={GREY} {...txt()}>median</text>
      {players.map((n2, i) => <g key={n2} transform={`translate(${W * 0.62} ${20 + i * 22})`}><rect width={14} height={14} rx={3} fill={colors[i]} /><text x={22} y={12} fontSize={fs + 2} fontWeight={800} fill={GT.ink} {...txt()}>{n2}</text></g>)}
      {(() => { const y0 = 28 + players.length * 22, rh = Math.min(26, (H - y0 - 8) / stats.length); return stats.map((s, r) => (
        <g key={s.key} transform={`translate(${W * 0.62} ${y0 + r * rh})`}>
          <line x1={0} x2={W * 0.36} y1={0} y2={0} stroke={LINE} />
          <text x={0} y={rh * 0.68} fontSize={Math.min(f, rh * 0.5)} fontWeight={700} fill={GT.ink} {...txt()}>{s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}</text>
          {players.map((_, i) => <text key={i} x={W * 0.36 - (players.length - 1 - i) * 58} y={rh * 0.68} textAnchor="end" fontSize={Math.min(f, rh * 0.5)} fontWeight={800} fill={colors[i]} {...txt()}>{s.values[i] != null ? fmtV(s, s.values[i] as number) : '—'}</text>)}
        </g>
      )) })()}
    </svg>
  )
}

// ── Box plot: the spread of one stat for each group ────────────────────────────────────────────────────────────────

export function BoxPlot({ W, H, fs, groups, fmtV, valueLabel, marks, avg, markColor }: { W: number; H: number; fs: number; groups: BoxGroup[]; fmtV: (v: number) => string; valueLabel: string; marks: { name: string; group: string; value: number }[]; avg: number | null; markColor: (name: string) => string | undefined }) {
  if (!groups.length) return <Empty W={W} H={H} text="Choose a group (team, league, position) with at least 3 players in each." />
  const L = Math.min(120, W * 0.12), R = 24, T = 8, B = 50
  const lo = Math.min(...groups.map(g => Math.min(g.stats.lo, ...g.stats.outliers)), ...marks.map(m => m.value)), hi = Math.max(...groups.map(g => Math.max(g.stats.hi, ...g.stats.outliers)), ...marks.map(m => m.value))
  const t = niceTicks(lo, hi, 7)
  const pw = W - L - R, rowH = (H - T - B) / groups.length, bh = Math.min(30, rowH * 0.62)
  const x = (v: number) => L + ((v - t.lo) / (t.hi - t.lo || 1)) * pw
  const f = Math.min(fs, Math.max(10, rowH * 0.6))
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {t.ticks.map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={T} y2={H - B} stroke={LINE} /><text x={x(v)} y={H - B + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={GREY} {...txt()}>{fmtV(v)}</text></g>)}
      {avg != null && avg >= t.lo && avg <= t.hi && <g><line x1={x(avg)} x2={x(avg)} y1={T} y2={H - B} stroke="#5B5347" strokeWidth={1.4} strokeDasharray="2 4" /><text x={x(avg) + 5} y={T + 12} fontSize={12} fontWeight={700} fill="#5B5347" stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{`League avg ${fmtV(avg)}`}</text></g>}
      {groups.map((g, i) => {
        const cy = T + i * rowH + rowH / 2, st = g.stats
        return (
          <g key={g.label}>
            <text x={L - 10} y={cy + f * 0.35} textAnchor="end" fontSize={f} fontWeight={800} fill={GT.ink} {...txt()}>{g.label}</text>
            <line x1={x(st.lo)} x2={x(st.q1)} y1={cy} y2={cy} stroke={GREY} strokeWidth={1.5} /><line x1={x(st.q3)} x2={x(st.hi)} y1={cy} y2={cy} stroke={GREY} strokeWidth={1.5} />
            <line x1={x(st.lo)} x2={x(st.lo)} y1={cy - bh / 4} y2={cy + bh / 4} stroke={GREY} strokeWidth={1.5} /><line x1={x(st.hi)} x2={x(st.hi)} y1={cy - bh / 4} y2={cy + bh / 4} stroke={GREY} strokeWidth={1.5} />
            <rect x={x(st.q1)} y={cy - bh / 2} width={Math.max(2, x(st.q3) - x(st.q1))} height={bh} rx={2} fill="#D6D2C8" stroke={GREY}><title>{`${g.label}: median ${fmtV(st.median)}, middle half ${fmtV(st.q1)} to ${fmtV(st.q3)}, ${st.n} players`}</title></rect>
            <line x1={x(st.median)} x2={x(st.median)} y1={cy - bh / 2} y2={cy + bh / 2} stroke={GT.ink} strokeWidth={2.5} />
            {st.outliers.map((o, k) => <circle key={k} cx={x(o)} cy={cy} r={3} fill="none" stroke={GREY} />)}
          </g>
        )
      })}
      {marks.map(m => { const i = groups.findIndex(g => g.label === m.group); if (i < 0) return null; const cy = T + i * rowH + rowH / 2, c = markColor(m.name) ?? GT.accent; return <g key={m.name}><circle cx={x(m.value)} cy={cy} r={7} fill={c} stroke={GT.paper} strokeWidth={1.5} /><text x={x(m.value)} y={cy - 12} textAnchor="middle" fontSize={Math.min(fs, 13)} fontWeight={800} fill={GT.ink} stroke={GT.paper} strokeWidth={3} paintOrder="stroke" {...txt()}>{`${m.name} (${fmtV(m.value)})`}</text></g> })}
      <text x={L + pw / 2} y={H - 8} textAnchor="middle" fontSize={14} fontWeight={800} fill={GT.ink} {...txt()}>{valueLabel}</text>
    </svg>
  )
}
export { C }
