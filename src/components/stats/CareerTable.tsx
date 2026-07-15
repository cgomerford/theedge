'use client'

import { useState, useMemo, useEffect } from 'react'
import type { CareerSeasonRow } from '@/lib/lab'
import type { BatterStatcast } from '@/lib/batter-stats'

type StatRow = { label: string; value: string }

function StatTable({ title, rows }: { title: string; rows: StatRow[] }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-b border-stone-50 last:border-0">
              <td className="py-2 font-serif italic text-stone-600">{r.label}</td>
              <td className="py-2 text-right font-mono font-bold text-stone-900">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const BATTER_COLS = ['season', 'avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'runs', 'hits', 'stolenBases'] as const
const PITCHER_COLS = ['season', 'wins', 'losses', 'era', 'whip', 'strikeOuts', 'strikeoutsPer9Inn', 'inningsPitched', 'saves'] as const

const LABELS: Record<string, string> = {
  season: 'Season', avg: 'AVG', obp: 'OBP', slg: 'SLG', ops: 'OPS', homeRuns: 'HR',
  rbi: 'RBI', runs: 'R', hits: 'H', stolenBases: 'SB',
  wins: 'W', losses: 'L', era: 'ERA', whip: 'WHIP', strikeOuts: 'K',
  strikeoutsPer9Inn: 'K/9', inningsPitched: 'IP', saves: 'SV',
}

export default function CareerStats({
  seasons, subject, playerId,
}: {
  seasons: CareerSeasonRow[]
  subject: 'batter' | 'pitcher'
  playerId?: number
}) {
  if (seasons.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 py-6 text-center">No prior MLB seasons on record.</p>
  }

  const isBatter = subject === 'batter'
  const cols = isBatter ? BATTER_COLS : PITCHER_COLS
  const summableKeys = isBatter
    ? (['homeRuns', 'rbi', 'runs', 'hits', 'stolenBases'] as const)
    : (['wins', 'losses', 'strikeOuts', 'saves', 'inningsPitched'] as const)
  const highlightKeys = isBatter
    ? (['homeRuns', 'rbi', 'ops', 'avg', 'hits', 'stolenBases'] as const)
    : (['wins', 'era', 'whip', 'strikeOuts', 'saves', 'inningsPitched'] as const)

  const [sortKey, setSortKey] = useState<string>('season')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activeView, setActiveView] = useState<'overview' | 'table' | 'advanced'>('overview')

  // Real Savant data (batters only) — reuses the same /api/batter-stats
  // route PlayerShareBuilder already calls successfully. This is CURRENT
  // SEASON data, not career-aggregated — Savant doesn't expose historical
  // per-season Statcast the way MLB's yearByYear endpoint does for
  // traditional stats. Labeled honestly rather than implying it's a
  // career figure.
 const [batterStatcast, setBatterStatcast] = useState<BatterStatcast | null>(null)
  const [sprintSpeed, setSprintSpeed] = useState<number | null>(null)
  const [loadingAdvanced, setLoadingAdvanced] = useState(false)
  const [advancedFetched, setAdvancedFetched] = useState(false)

  useEffect(() => {
    if (activeView !== 'advanced' || !isBatter || !playerId || advancedFetched) return
    setLoadingAdvanced(true)
    setAdvancedFetched(true)
    Promise.all([
      fetch(`/api/batter-stats?playerId=${playerId}&type=statcast`).then(r => r.json()).catch(() => null),
      fetch(`/api/stats/batter-sprint-speed?playerId=${playerId}&season=${new Date().getFullYear()}`).then(r => r.json()).catch(() => null),
    ]).then(([statcast, speed]) => {
      setBatterStatcast(statcast ?? null)
      setSprintSpeed(speed?.sprintSpeed ?? null)
    }).finally(() => setLoadingAdvanced(false))
  }, [activeView, isBatter, playerId, advancedFetched])

  const careerTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    seasons.forEach((row: any) => {
      const map = Object.fromEntries(row.stats.map((s: any) => [s.key, s.value]))
      summableKeys.forEach((key) => {
        let raw = map[key]
        if (typeof raw === 'string') raw = raw.replace(/[^0-9.]/g, '')
        const num = parseFloat(raw as any) || 0
        totals[key as string] = (totals[key as string] || 0) + num
      })
    })
    return totals
  }, [seasons, summableKeys])

  const sortedSeasons = useMemo(() => {
    return [...seasons].sort((a: any, b: any) => {
      const aMap = Object.fromEntries(a.stats.map((s: any) => [s.key, s.value]))
      const bMap = Object.fromEntries(b.stats.map((s: any) => [s.key, s.value]))
      const aVal: any = sortKey === 'season' ? a.season : aMap[sortKey]
      const bVal: any = sortKey === 'season' ? b.season : bMap[sortKey]
      if (sortKey === 'season') {
        const diff = Number(bVal) - Number(aVal)
        return sortDir === 'desc' ? diff : -diff
      }
      const numA = parseFloat(aVal) || 0
      const numB = parseFloat(bVal) || 0
      return sortDir === 'desc' ? numB - numA : numA - numB
    })
  }, [seasons, sortKey, sortDir])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function getBestSeason(key: string) {
    const higherBetter = !['era', 'whip', 'losses'].includes(key)
    let best: any = null
    let bestNum = higherBetter ? -Infinity : Infinity
    seasons.forEach((row: any) => {
      const map = Object.fromEntries(row.stats.map((s: any) => [s.key, s.value]))
      const raw = map[key]
      const num = parseFloat(raw as any)
      if (isNaN(num)) return
      const isBetter = higherBetter ? num > bestNum : num < bestNum
      if (isBetter || !best) { bestNum = num; best = { season: row.season, teamName: row.teamName, value: raw } }
    })
    return best
  }

  const yearSpan = `${Math.min(...seasons.map((s: any) => s.season))}–${Math.max(...seasons.map((s: any) => s.season))}`

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-y-1">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[1.5px] text-orange-600 font-bold">CAREER</div>
          <div className="text-2xl font-semibold tracking-tight text-stone-900">Player Statistics</div>
        </div>
        <div className="font-mono text-xs text-stone-500">{seasons.length} seasons • {yearSpan}</div>
      </div>

      <div className="flex border-b border-stone-200 text-sm">
        {(['overview', 'table', 'advanced'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-6 py-3 border-b-2 font-medium transition-colors ${
              activeView === v ? 'border-orange-600 text-orange-600' : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <>
          <div>
            <div className="mb-3 flex items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">CAREER TOTALS</p>
              <div className="h-px flex-1 bg-stone-100" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {summableKeys.map((key) => {
                const val = careerTotals[key as string]
                if (val === undefined) return null
                const display = key === 'inningsPitched' ? val.toFixed(1) : Math.round(val).toLocaleString()
                return (
                  <div key={key} className="bg-white border border-stone-100 rounded-2xl px-4 py-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">{LABELS[key as string]}</div>
                    <div className="mt-1 text-3xl font-mono font-semibold tabular-nums text-stone-900">{display}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">SINGLE-SEASON HIGHS</p>
              <div className="h-px flex-1 bg-stone-100" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {highlightKeys.map((key) => {
                const best = getBestSeason(key)
                if (!best) return null
                return (
                  <div key={key} className="bg-white border border-stone-100 rounded-2xl p-4 hover:border-orange-200 transition-colors">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">{LABELS[key]}</div>
                    <div className="mt-2 text-3xl font-mono font-bold text-orange-600 tabular-nums">{best.value}</div>
                    <div className="text-xs text-stone-600 mt-1">{best.season} {best.teamName ? `· ${best.teamName}` : ''}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {activeView === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200">
                {cols.map(c => (
                  <th
                    key={c}
                    onClick={() => handleSort(c)}
                    className={`pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400 cursor-pointer hover:text-stone-900 select-none ${c === 'season' ? 'text-left' : 'text-right'}`}
                  >
                    {LABELS[c]}{sortKey === c ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSeasons.map((row: any) => {
                const byKey = Object.fromEntries(row.stats.map((s: any) => [s.key, s.value]))
                return (
                  <tr key={row.season} className="border-b border-stone-50 last:border-0">
                    {cols.map(c => (
                      <td key={c} className={`py-2 font-mono ${c === 'season' ? 'text-left font-bold text-stone-900' : 'text-right text-stone-700'}`}>
                        {c === 'season' ? `${row.season}${row.teamName ? ` · ${row.teamName}` : ''}` : (byKey[c] ?? '—')}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'advanced' && (
        <div className="bg-white border border-stone-100 rounded-3xl p-6">
          {!isBatter ? (
            <div className="py-12 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-orange-600 mb-2">Pitchers</p>
              <p className="text-sm font-serif text-stone-500">
                Arsenal-level Statcast data (whiff%, xwOBA, run value per pitch type) lives on the Pitching tab —
                it's per-pitch-type, not a single career summary number, so it isn't duplicated here.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="font-mono text-xs uppercase tracking-widest text-orange-600">BASEBALL SAVANT · STATCAST</p>
                <p className="text-stone-500 text-sm">
                  Current season only — Savant doesn't expose historical per-season Statcast the way traditional stats work, so this reflects {new Date().getFullYear()}, not a career figure.
                </p>
              </div>
      {loadingAdvanced ? (
                <p className="py-20 text-center text-stone-400">Loading…</p>
              ) : batterStatcast || sprintSpeed != null ? (
                <div className="grid md:grid-cols-3 gap-8">
                  {batterStatcast && (
                    <StatTable
                      title="Expected stats"
                      rows={[
                        { label: 'xBA', value: batterStatcast.xba != null ? batterStatcast.xba.toFixed(3).replace(/^0\./, '.') : '—' },
                        { label: 'xSLG', value: batterStatcast.xslg != null ? batterStatcast.xslg.toFixed(3).replace(/^0\./, '.') : '—' },
                        { label: 'xwOBA', value: batterStatcast.xwoba != null ? batterStatcast.xwoba.toFixed(3).replace(/^0\./, '.') : '—' },
                      ]}
                    />
                  )}
                  {batterStatcast && (
                    <StatTable
                      title="Contact quality"
                      rows={[
                        { label: 'Barrel%', value: batterStatcast.barrel_pct != null ? `${batterStatcast.barrel_pct.toFixed(1)}%` : '—' },
                        { label: 'Hard-hit%', value: batterStatcast.hard_hit_pct != null ? `${batterStatcast.hard_hit_pct.toFixed(1)}%` : '—' },
                        { label: 'Sweet spot%', value: batterStatcast.sweet_spot_pct != null ? `${batterStatcast.sweet_spot_pct.toFixed(1)}%` : '—' },
                        { label: 'Avg EV', value: batterStatcast.avg_exit_velocity != null ? `${batterStatcast.avg_exit_velocity.toFixed(1)} mph` : '—' },
                        { label: 'Max EV', value: batterStatcast.max_exit_velocity != null ? `${batterStatcast.max_exit_velocity.toFixed(1)} mph` : '—' },
                      ]}
                    />
                  )}
                  <StatTable
                    title="Running"
                    rows={[{ label: 'Sprint speed', value: sprintSpeed != null ? `${sprintSpeed.toFixed(1)} ft/s` : '—' }]}
                  />
                </div>
              ) : (
                <p className="py-12 text-center text-stone-400">No Statcast data available for this player yet.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}