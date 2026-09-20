// src/components/scout/charts/Atoms.tsx
//
// Small server-rendered chart atoms shared by the Scout sections. Colours follow
// the dataviz palette: categorical slots 1/2 (blue, orange), a neutral stone for
// "standard / league", ink text (never the series colour).

import { CHART_BLUE, CHART_ORANGE } from './LineChart'

export const NEUTRAL = '#d6d3d1'   // stone-300
export const LEAGUE_GREY = '#a8a29e'

// ─── Index bars centred on 100 ───────────────────────────────────────────

export type IndexRow = { label: string; value: number | null; note?: string; highlight?: boolean; thin?: boolean }

/** Bars that grow left (below 100) or right (above 100) from a centre line. */
export function IndexBars({ rows, span = 30, axis = false }: { rows: IndexRow[]; span?: number; axis?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const v = r.value
        const dev = v == null ? 0 : Math.max(-span, Math.min(span, v - 100))
        const w = (Math.abs(dev) / span) * 50
        return (
          <li key={r.label} className={r.thin ? 'opacity-40' : ''}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700">
              <span className={r.highlight ? 'font-semibold text-stone-900' : ''}>{r.label}{r.highlight && <span className="ml-1.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 align-middle">tonight</span>}</span>
              <span className="font-mono text-[10px] text-stone-500">{v != null ? v : '—'}{r.note ? ` · ${r.note}` : ''}</span>
            </div>
            <div className="relative h-2 mt-0.5 rounded-[3px] bg-stone-100">
              <div className="absolute top-0 bottom-0 w-px bg-stone-400" style={{ left: '50%' }} />
              {v != null && (
                <div className="absolute top-0 bottom-0 rounded-[3px]"
                  style={{ left: dev >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 0.8)}%`, background: dev >= 0 ? CHART_BLUE : CHART_ORANGE }} />
              )}
            </div>
          </li>
        )
      })}
      {axis && (
        <li aria-hidden className="grid grid-cols-3 text-[8.5px] font-mono uppercase tracking-wider text-stone-400 pt-0.5">
          <span style={{ color: CHART_ORANGE }}>◀ below average</span><span className="text-center">100</span><span className="text-right" style={{ color: CHART_BLUE }}>above average ▶</span>
        </li>
      )}
    </ul>
  )
}

// ─── Percentile strip: one value against the league field ────────────────

export type StripProps = {
  label: string; unit: string; value: number | null
  lo: number; hi: number; q1: number; median: number; q3: number
  rank: number | null; of: number; betterLow: boolean; decimals: number
}

export function PercentileStrip({ s }: { s: StripProps }) {
  const W = 300, pad = 8
  const span = s.hi - s.lo || 1
  const x = (v: number) => pad + ((v - s.lo) / span) * (W - pad * 2)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700">
        <span>{s.label}</span>
        <span className="font-mono text-[10px] text-stone-500">
          <span className="font-bold text-[12px] text-stone-900">{s.value != null ? `${s.value.toFixed(s.decimals)} ${s.unit}` : '—'}</span>
          {s.rank != null && s.value != null ? ` · ${s.rank}${ord(s.rank)} of ${s.of}` : ''}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} 26`} className="w-full h-auto block" role="img"
        aria-label={`${s.label}: ${s.value?.toFixed(s.decimals) ?? 'no data'} ${s.unit}; league median ${s.median.toFixed(s.decimals)}`}>
        <line x1={pad} x2={W - pad} y1={13} y2={13} stroke="#e7e5e4" strokeWidth={2} strokeLinecap="round" />
        <rect x={x(s.q1)} y={9} width={Math.max(2, x(s.q3) - x(s.q1))} height={8} rx={2} fill="#e7e5e4" />
        <line x1={x(s.median)} x2={x(s.median)} y1={6} y2={20} stroke={LEAGUE_GREY} strokeWidth={2}><title>{`League median ${s.median.toFixed(s.decimals)} ${s.unit}`}</title></line>
        {s.value != null && <circle cx={x(s.value)} cy={13} r={5} fill={CHART_BLUE} stroke="#fff" strokeWidth={2}><title>{`${s.value.toFixed(s.decimals)} ${s.unit}`}</title></circle>}
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-stone-400">
        <span>{s.lo.toFixed(s.decimals)}{s.betterLow ? ' · best' : ''}</span><span>league median {s.median.toFixed(s.decimals)}</span><span>{s.hi.toFixed(s.decimals)}{s.betterLow ? '' : ' · best'}</span>
      </div>
    </div>
  )
}

function ord(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

// ─── Stacked share bar (parts of a whole) ────────────────────────────────

export type SharePart = { label: string; value: number; color: string }

export function ShareBar({ label, parts, n, thin }: { label: string; parts: SharePart[]; n: number; thin?: boolean }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  return (
    <div className={thin ? 'opacity-40' : ''}>
      <div className="flex items-baseline justify-between text-[11px] font-sans text-stone-700">
        <span>{label}</span><span className="font-mono text-[10px] text-stone-500">n={n}{thin ? ' (thin)' : ''}</span>
      </div>
      <div className="flex gap-[2px] h-4 mt-0.5" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${total > 0 ? Math.round((p.value / total) * 100) : 0}%`).join(', ')}`}>
        {parts.map((p) => {
          const pct = total > 0 ? (p.value / total) * 100 : 0
          return pct > 0 ? (
            <div key={p.label} className="flex items-center justify-center text-[9px] font-mono rounded-[3px]" title={`${p.label}: ${pct.toFixed(0)}%`}
              style={{ width: `${pct}%`, background: p.color, color: p.color === NEUTRAL ? '#57534e' : '#fff', minWidth: 2 }}>{pct >= 12 ? `${Math.round(pct)}%` : ''}</div>
          ) : null
        })}
      </div>
    </div>
  )
}

export function ShareLegend({ parts }: { parts: { label: string; color: string }[] }) {
  return (
    <p className="text-[10px] font-mono text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
      {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}
    </p>
  )
}
