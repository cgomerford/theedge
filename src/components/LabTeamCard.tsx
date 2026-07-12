'use client'

import { useState, useEffect, useRef } from 'react'
import MetricTip from './MetricTip'
import ViewModeToggle from './ViewModeToggle'
import CardExportToolbar from './CardExportToolbar'
import PercentileRing from './PercentileRing'
import { TEAM_CONTEXT_GROUPS, TEAM_CORE_GROUP_TITLES } from '@/lib/player-stats'

type PercentileResult = { rank: number; poolSize: number; percentile: number }
type TeamCardData = { team: Record<string, unknown>; percentiles: Record<string, PercentileResult | null> }

function percentileColor(p: number): string {
  if (p >= 80) return '#15803D'
  if (p >= 60) return '#FF5722'
  if (p >= 35) return '#78716C'
  return '#DC2626'
}

export default function TeamCard({ teamId, teamName, onRemove }: { teamId: number; teamName: string; onRemove: () => void }) {
  const [data, setData] = useState<TeamCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'core' | 'advanced'>('core')
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/lab/team-card?teamId=${teamId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) { if (json.error) throw new Error(json.detail || json.error); setData(json) } })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load this team."))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [teamId])

  return (
    <div ref={cardRef} className="border border-stone-200 bg-white min-w-0">
      <div className="p-4 flex items-start justify-between">
        <div>
          <div className="font-serif font-bold text-stone-900 text-base leading-tight">{teamName}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Team context</div>
        </div>
        <button type="button" onClick={onRemove} className="text-stone-300 hover:text-stone-600 text-sm" aria-label={`Remove ${teamName}`}>✕</button>
      </div>
      <div className="px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} offenseLabel="Core" />
        <CardExportToolbar targetRef={cardRef} fileName={`${teamName.replace(/\s+/g, '-').toLowerCase()}-the-edge`} />
      </div>
      <div className="px-4 pb-4">
        {loading ? (
          <p className="text-xs font-mono text-stone-400 py-4">Loading…</p>
        ) : error ? (
          <p className="text-xs font-mono text-red-600 py-4">{error}</p>
        ) : data ? (
          TEAM_CONTEXT_GROUPS
  .filter(g => viewMode === 'advanced' ? !TEAM_CORE_GROUP_TITLES.has(g.title) : TEAM_CORE_GROUP_TITLES.has(g.title))
            .map(group => (
              <div key={group.title} className="border-t border-stone-200 first:border-t-0 py-2">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722] block mb-1">{group.title}</span>
                {group.stats.map(stat => {
                  const v = data.team[stat.key]
                  const display = typeof v === 'number' ? stat.format(v) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : '—'
                  const pct = data.percentiles[stat.key]
                  return (
                    <div key={stat.key} className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500"><MetricTip tip={stat.tooltip}>{stat.label}</MetricTip></span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">{display}</span>
                        {pct && (
                          <div className="w-10 h-1 bg-stone-100 rounded-full overflow-hidden shrink-0" title={`${pct.percentile}th of 30`}>
                            <div className="h-full rounded-full" style={{ width: `${pct.percentile}%`, background: percentileColor(pct.percentile) }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
        ) : null}
      </div>
    </div>
  )
}