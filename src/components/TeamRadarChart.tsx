'use client'

import { useState, useEffect, useRef } from 'react'
import PercentileRadarBase, { type RadarAxis } from './PercentileRadarBase'
import CardExportToolbar from './CardExportToolbar'
import { teamColorById } from '@/lib/lab'

const TEAM_AXES: RadarAxis[] = [
  { key: 'wrc_plus_l30', label: 'wRC+' }, { key: 'ops_l30', label: 'OPS' }, { key: 'hard_hit_pct', label: 'Hard-hit%' },
  { key: 'barrel_pct', label: 'Barrel%' }, { key: 'oaa', label: 'OAA' }, { key: 'bullpen_era', label: 'Bullpen ERA' },
]

export default function TeamRadarChart({ teamIds, teamNames }: { teamIds: number[]; teamNames: Record<number, string> }) {
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (teamIds.length === 0) { setSeries([]); return }
    setLoading(true)
    Promise.all(teamIds.map(id => fetch(`/api/lab/team-card?teamId=${id}`).then(r => r.json()).then(j => ({ id, j }))))
      .then(results => {
        setSeries(results.map(({ id, j }) => ({
          id: String(id),
          name: teamNames[id] ?? String(id),
          color: teamColorById(id),
          values: Object.fromEntries(TEAM_AXES.map(axis => [axis.key, j.percentiles?.[axis.key]?.percentile ?? null])),
        })))
      })
      .finally(() => setLoading(false))
  }, [teamIds.join(',')])

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Team percentile profile</div>
        <CardExportToolbar targetRef={chartRef} fileName="team-radar-the-edge" />
      </div>
      {teamIds.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">Add teams above to see their profile.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <PercentileRadarBase axes={TEAM_AXES} series={series} />
        </div>
      )}
    </div>
  )
}