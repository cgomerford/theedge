    'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import HorizontalBarCompareBase, { type BarDatum } from './HorizontalBarCompareBase'
import CardExportToolbar from './CardExportToolbar'
import { TEAM_CONTEXT_GROUPS } from '@/lib/player-stats'
import PercentileRing from './PercentileRing'
import { teamColorById } from '@/lib/lab'

export default function TeamBarCompareChart({ teamIds, teamNames }: { teamIds: number[]; teamNames: Record<number, string> }) {
  const statOptions = useMemo(() => TEAM_CONTEXT_GROUPS.flatMap(g => g.stats), [])
  const [statKey, setStatKey] = useState(statOptions[0].key)
  const [data, setData] = useState<BarDatum[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (teamIds.length === 0) { setData([]); return }
    setLoading(true)
    const stat = statOptions.find(s => s.key === statKey)!
    Promise.all(teamIds.map(id => fetch(`/api/lab/team-card?teamId=${id}`).then(r => r.json()).then(j => ({ id, j }))))
      .then(results => {
        setData(results.map(({ id, j }) => {
          const v = j.team?.[statKey]
          return {
            id: String(id), name: teamNames[id] ?? String(id),
            value: typeof v === 'number' ? v : 0,
            formatted: typeof v === 'number' ? stat.format(v) : '—',
            color: teamColorById(id),
          }
        }).filter(d => d.formatted !== '—'))
      })
      .finally(() => setLoading(false))
  }, [teamIds.join(','), statKey])

  const higherIsBetter = statOptions.find(s => s.key === statKey)?.higherIsBetter ?? true

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Team bar compare</div>
        <div className="flex items-center gap-2">
          <select value={statKey} onChange={e => setStatKey(e.target.value)} className="text-[10px] font-mono border border-stone-300 px-2 py-1 uppercase">
            {statOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <CardExportToolbar targetRef={chartRef} fileName={`team-bar-compare-${statKey}-the-edge`} />
        </div>
      </div>
      {teamIds.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">Add teams above to compare.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <HorizontalBarCompareBase data={data} higherIsBetter={higherIsBetter} />
        </div>
      )}
    </div>
  )
}