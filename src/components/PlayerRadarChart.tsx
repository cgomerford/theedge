'use client'

import { useState, useEffect, useRef } from 'react'
import PercentileRadarBase, { type RadarAxis } from './PercentileRadarBase'
import CardExportToolbar from './CardExportToolbar'
import { teamColorById } from '@/lib/lab'

type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: 'pitcher' | 'batter' }

// Pitcher percentiles are directionally correct for any percentile-eligible
// stat (computed with explicit higherIsBetter). Batter percentiles come
// from MLB's live leaderboard order, which was never verified per-category
// — so the batter axes stick to stats where "more" is unambiguously better
// in both the raw stat and MLB's own ranking, avoiding a radar that could
// visually mislead on an unverified category.
const PITCHER_AXES: RadarAxis[] = [
  { key: 'era', label: 'ERA' }, { key: 'whip', label: 'WHIP' }, { key: 'k_per_9', label: 'K/9' },
  { key: 'bb_per_9', label: 'BB/9' }, { key: 'k_bb_ratio', label: 'K/BB' }, { key: 'whiff_pct', label: 'Whiff%' },
  { key: 'hard_hit_pct', label: 'Hard-hit%' },
]
const BATTER_AXES: RadarAxis[] = [
  { key: 'avg', label: 'AVG' }, { key: 'obp', label: 'OBP' }, { key: 'slg', label: 'SLG' },
  { key: 'homeRuns', label: 'HR' }, { key: 'rbi', label: 'RBI' }, { key: 'hits', label: 'H' },
]

const FALLBACK_COLORS = ['#FF5722', '#1A1A1A', '#2563EB', '#15803D']

export default function PlayerRadarChart({ players }: { players: SelectedPlayer[] }) {
  const [subjectType, setSubjectType] = useState<'pitcher' | 'batter'>('batter')
  const pool = players.filter(p => p.subjectType === subjectType)
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pool.length === 0) { setSeries([]); return }
    setLoading(true)
    const axes = subjectType === 'pitcher' ? PITCHER_AXES : BATTER_AXES
    const url = (p: SelectedPlayer) => subjectType === 'pitcher'
      ? `/api/lab/pitcher-card?id=${p.id}`
      : `/api/lab/batter-card?id=${p.id}&mode=single`
    Promise.all(pool.map(p => fetch(url(p)).then(r => r.json()).then(j => ({ p, j }))))
      .then(results => {
        setSeries(results.map(({ p, j }, i) => ({
          id: String(p.id),
          name: p.fullName,
          color: j.teamId ? teamColorById(j.teamId) : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          values: Object.fromEntries(axes.map(axis => [axis.key, j.percentiles?.[axis.key]?.percentile ?? null])),
        })))
      })
      .finally(() => setLoading(false))
  }, [pool.map(p => p.id).join(','), subjectType])

  const axes = subjectType === 'pitcher' ? PITCHER_AXES : BATTER_AXES

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Percentile profile</div>
        <div className="flex items-center gap-3">
          <CardExportToolbar targetRef={chartRef} fileName={`radar-${subjectType}-the-edge`} />
          <div className="flex gap-1">
            {(['batter', 'pitcher'] as const).map(t => (
              <button key={t} type="button" onClick={() => setSubjectType(t)}
                className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 border ${subjectType === t ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}>
                {t === 'batter' ? 'Batters' : 'Pitchers'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {pool.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">No {subjectType}s selected above.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <PercentileRadarBase axes={axes} series={series} />
        </div>
      )}
    </div>
  )
}