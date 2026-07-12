'use client'

import { useState, useEffect } from 'react'
import { LEADER_METRICS, LEAGUE_BY_TEAM_ID, TEAM_NAMES } from '@/lib/lab'

type LeaderRow = { rank: number; personId: number; teamId?: number; name: string; team: string; value: number }
type Person = { id: number; fullName: string; primaryPosition: string }

const METRIC_OPTIONS = Object.keys(LEADER_METRICS) as (keyof typeof LEADER_METRICS)[]
const ALL_TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number).sort((a, b) => (TEAM_NAMES[a]?.abbreviation ?? '').localeCompare(TEAM_NAMES[b]?.abbreviation ?? ''))

export default function PlayerBrowserPanel({ onAdd, selectedIds }: { onAdd: (p: Person) => void; selectedIds: number[] }) {
  const [metric, setMetric] = useState<keyof typeof LEADER_METRICS>('avg')
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [group, setGroup] = useState<'pitching' | 'hitting'>('hitting')
  const [teamFilter, setTeamFilter] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lab/top50?metric=${metric}`)
      .then(r => r.json())
      .then(j => { setRows(j.rows ?? []); setGroup(j.group ?? 'hitting') })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [metric])

  const format = (v: number) => metric === 'era' || metric === 'whip' ? v.toFixed(2) : metric === 'ops' || metric === 'slg' || metric === 'obp' || metric === 'avg' ? v.toFixed(3) : String(v)
  const visible = teamFilter ? rows.filter(r => r.teamId === teamFilter) : rows

  return (
    <div className="border border-stone-200 bg-white lg:sticky lg:top-4">
      <div className="p-4 border-b border-stone-200">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">Player browser</div>
        <select value={metric} onChange={e => setMetric(e.target.value as keyof typeof LEADER_METRICS)} className="w-full text-[10px] font-mono border border-stone-300 px-2 py-1.5 uppercase">
          {METRIC_OPTIONS.map(m => <option key={m} value={m}>{LEADER_METRICS[m].label}</option>)}
        </select>
      </div>

      <div className="p-3 border-b border-stone-200">
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">Teams</div>
        <div className="grid grid-cols-5 gap-1">
          {ALL_TEAM_IDS.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setTeamFilter(prev => prev === id ? null : id)}
              className={`text-[9px] font-mono px-1 py-1 border ${teamFilter === id ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-200 text-stone-500 hover:border-stone-900'}`}
            >
              {TEAM_NAMES[id]?.abbreviation ?? id}
            </button>
          ))}
        </div>
        {teamFilter && (
          <button type="button" onClick={() => setTeamFilter(null)} className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline mt-2">
            Clear filter
          </button>
        )}
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <p className="text-xs font-mono text-stone-400 p-4">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-xs font-mono text-stone-400 p-4">No players for this filter.</p>
        ) : (
          visible.map(r => {
            const already = selectedIds.includes(r.personId)
            return (
              <button
                key={r.personId}
                type="button"
                disabled={already}
                onClick={() => onAdd({ id: r.personId, fullName: r.name, primaryPosition: group === 'pitching' ? 'P' : '' })}
                className={`w-full flex items-center justify-between px-3 py-2 text-left border-b border-stone-100 last:border-0 text-xs font-mono ${already ? 'opacity-30 cursor-default' : 'hover:bg-stone-50'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-stone-400 w-5 shrink-0">{r.rank}</span>
                  <span className="font-bold text-stone-800 truncate">{r.name}</span>
                  <span className="text-stone-400 shrink-0">{r.team}</span>
                </span>
                <span className="font-bold text-[#FF5722] shrink-0">{format(r.value)}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}