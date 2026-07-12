'use client'

import { useState, useEffect, useCallback } from 'react'
import { LEADER_METRICS, TEAM_NAMES } from '@/lib/lab'

type Person = { id: number; fullName: string; primaryPosition: string }
type LeaderRow = { rank: number; personId: number; teamId?: number; name: string; team: string; value: number }
type SubjectHint = 'pitcher' | 'batter'

const RANK_METRICS: { key: keyof typeof LEADER_METRICS; label: string }[] = [
  { key: 'era', label: 'ERA leaders' }, { key: 'whip', label: 'WHIP leaders' }, { key: 'k9', label: 'K/9 leaders' },
  { key: 'ops', label: 'OPS leaders' }, { key: 'slg', label: 'SLG leaders' }, { key: 'obp', label: 'OBP leaders' },
]

const TEAM_CHIPS = Object.entries(TEAM_NAMES)
  .map(([id, meta]) => ({ id: Number(id), ...meta }))
  .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))

export default function PlayerBrowser({
  selectedIds, onAdd, onClearAll,
}: {
  selectedIds: number[]
  onAdd: (p: Person, subjectTypeHint?: SubjectHint) => void
  onClearAll: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [activeTeam, setActiveTeam] = useState<number | null>(null)
  const [roster, setRoster] = useState<Person[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rankMetric, setRankMetric] = useState<keyof typeof LEADER_METRICS>('ops')
  const [ranked, setRanked] = useState<LeaderRow[]>([])
  const [rankedLoading, setRankedLoading] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/lab/search?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.people ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const loadRoster = useCallback(async (teamId: number) => {
    setActiveTeam(teamId); setRosterLoading(true); setRoster([])
    try {
      const res = await fetch(`/api/lab/team-roster?teamId=${teamId}`)
      const json = await res.json()
      setRoster(json.roster ?? [])
    } finally {
      setRosterLoading(false)
    }
  }, [])

  useEffect(() => {
    setRankedLoading(true)
    fetch(`/api/lab/leaders?metric=${rankMetric}&limit=50`)
      .then(r => r.json())
      .then(json => setRanked(json.leaders ?? []))
      .catch(() => setRanked([]))
      .finally(() => setRankedLoading(false))
  }, [rankMetric])

  const rankHint: SubjectHint = LEADER_METRICS[rankMetric].group === 'pitching' ? 'pitcher' : 'batter'

  return (
    <div className="w-full lg:w-72 shrink-0 space-y-6 lg:sticky lg:top-4 lg:self-start">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">Player Browser</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search players…"
              className="w-full border border-stone-300 px-3 py-2 font-mono text-sm"
            />
            {results.length > 0 && (
              <div className="absolute z-20 w-full bg-white border border-stone-300 mt-1 max-h-56 overflow-y-auto">
                {results.map(p => (
                  <button key={p.id} type="button" onClick={() => { onAdd(p); setQuery(''); setResults([]) }}
                    disabled={selectedIds.includes(p.id)}
                    className="block w-full text-left px-3 py-2 text-sm font-mono hover:bg-stone-50 disabled:opacity-40">
                    {p.fullName} <span className="text-stone-400">· {p.primaryPosition}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClearAll} title="Clear all players"
            className="border border-stone-300 px-3 text-stone-500 hover:border-red-400 hover:text-red-500 transition">
            🗑
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">Teams</div>
        <div className="grid grid-cols-5 gap-1.5">
          {TEAM_CHIPS.map(t => (
            <button key={t.id} type="button" onClick={() => loadRoster(t.id)}
              className={`px-1.5 py-1.5 font-mono text-[9px] uppercase tracking-wider border transition ${activeTeam === t.id ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'}`}>
              {t.abbreviation}
            </button>
          ))}
        </div>
        {activeTeam !== null && (
          <div className="mt-3 border border-stone-200 bg-white max-h-56 overflow-y-auto">
            {rosterLoading ? (
              <p className="text-xs font-mono text-stone-400 p-3">Loading roster…</p>
            ) : roster.length === 0 ? (
              <p className="text-xs font-mono text-stone-400 p-3">No roster data.</p>
            ) : roster.map(p => (
              <button key={p.id} type="button" onClick={() => onAdd(p)}
                disabled={selectedIds.includes(p.id)}
                className="block w-full text-left px-3 py-2 text-xs font-mono hover:bg-stone-50 disabled:opacity-40 border-b border-stone-100 last:border-b-0">
                {p.fullName} <span className="text-stone-400">· {p.primaryPosition}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Leaders</div>
          <select value={rankMetric} onChange={e => setRankMetric(e.target.value as keyof typeof LEADER_METRICS)}
            className="border border-stone-300 px-2 py-1 font-mono text-[10px] bg-white">
            {RANK_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <p className="text-[9px] font-mono text-stone-400 mb-2">
          Ranked among players meeting MLB&apos;s IP/PA qualification threshold — not every rostered player.
        </p>
        <div className="border border-stone-200 bg-white max-h-96 overflow-y-auto">
          {rankedLoading ? (
            <p className="text-xs font-mono text-stone-400 p-3">Loading…</p>
          ) : ranked.map(r => {
            const isSelected = selectedIds.includes(r.personId)
            return (
              <button key={r.personId} type="button"
                onClick={() => onAdd({ id: r.personId, fullName: r.name, primaryPosition: '' }, rankHint)}
                disabled={isSelected}
                className={`flex items-center justify-between w-full text-left px-3 py-1.5 text-xs font-mono border-b border-stone-100 last:border-b-0 transition ${isSelected ? 'text-orange-600 font-bold bg-orange-50' : 'hover:bg-stone-50'}`}>
                <span>{r.rank}. {r.name}</span>
                <span className="text-stone-400">{r.team}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}