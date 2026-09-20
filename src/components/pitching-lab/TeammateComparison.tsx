'use client'

// src/components/pitching-lab/TeammateComparison.tsx
//
// This pitcher vs every other pitcher on the same team, real season stats
// (pitcher_stats via the existing /api/stats/players?subject=pitcher&teamId=
// route — same table /mlb/stats already uses, just team-scoped and
// re-rendered as a bar chart instead of a sortable table).

import { useEffect, useMemo, useState } from 'react'

type StatsRow = { id: number; name: string; team: string; pos: string; stats: Record<string, number | null> }

const METRICS: { key: string; label: string; higherIsBetter: boolean; decimals: number; suffix: string }[] = [
  { key: 'era', label: 'ERA', higherIsBetter: false, decimals: 2, suffix: '' },
  { key: 'fip', label: 'FIP', higherIsBetter: false, decimals: 2, suffix: '' },
  { key: 'whip', label: 'WHIP', higherIsBetter: false, decimals: 2, suffix: '' },
  { key: 'k_pct', label: 'K%', higherIsBetter: true, decimals: 1, suffix: '%' },
  { key: 'bb_pct', label: 'BB%', higherIsBetter: false, decimals: 1, suffix: '%' },
  { key: 'whiff_pct', label: 'Whiff%', higherIsBetter: true, decimals: 1, suffix: '%' },
]

export default function TeammateComparison({ pitcherId, teamId, season }: { pitcherId: number; teamId: number | null; season: number }) {
  const [rows, setRows] = useState<StatsRow[] | null>(null)
  const [metricKey, setMetricKey] = useState(METRICS[0].key)

  useEffect(() => {
    // No teamId yet (bio still loading) — leave `rows` at its initial null
    // (renders as "loading") rather than setState-ing inside the effect.
    if (!teamId) return
    let cancelled = false
    fetch(`/api/stats/players?subject=pitcher&season=${season}&teamId=${teamId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setRows(json.rows ?? []) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [teamId, season])

  const metric = METRICS.find(m => m.key === metricKey)!

  const bars = useMemo(() => {
    if (!rows) return []
    const withValue = rows.filter(r => r.stats[metric.key] != null)
    return withValue.sort((a, b) =>
      metric.higherIsBetter ? (b.stats[metric.key]! - a.stats[metric.key]!) : (a.stats[metric.key]! - b.stats[metric.key]!)
    )
  }, [rows, metric])

  if (rows === null) return <div className="bg-white border border-stone-200 rounded-xl p-5 text-[12px] text-stone-400 text-center py-10">Loading teammate comparison…</div>
  if (rows.length < 2) return null // nothing meaningful to compare against

  const max = Math.max(...bars.map(b => Math.abs(b.stats[metric.key]!)), 0.001)

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Vs. teammates — {rows[0]?.team ?? ''} pitching staff</p>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetricKey(m.key)}
              className={`font-mono uppercase tracking-wider rounded-md px-2 py-1 text-[9px] transition ${
                metricKey === m.key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {bars.map(b => {
          const isTarget = b.id === pitcherId
          const v = b.stats[metric.key]!
          const widthPct = Math.max(4, (Math.abs(v) / max) * 100)
          return (
            <div key={b.id} className="flex items-center gap-2">
              <span className={`w-28 shrink-0 truncate text-[11px] font-mono ${isTarget ? 'font-bold text-stone-900' : 'text-stone-500'}`}>{b.name}</span>
              <div className="flex-1 h-4 bg-stone-50 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{ width: `${widthPct}%`, background: isTarget ? '#FF5722' : '#D6D2C4' }}
                />
              </div>
              <span className={`w-14 shrink-0 text-right text-[11px] font-mono ${isTarget ? 'font-bold text-stone-900' : 'text-stone-500'}`}>
                {v.toFixed(metric.decimals)}{metric.suffix}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[9px] font-mono text-stone-400 mt-3">
        {season} season, real pitcher_stats — same table /mlb/stats uses, filtered to this team. Orange = this pitcher.
      </p>
    </div>
  )
}
