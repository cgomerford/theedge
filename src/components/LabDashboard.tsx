'use client'

import { useState, useCallback } from 'react'
import MetricTip from './MetricTip'
import { METRIC_TOOLTIPS } from '@/lib/metric-tooltips'
import type { MetricKey } from '@/lib/lab'

type Person = { id: number; fullName: string; primaryPosition: string }
type PlayerSubjectType = 'pitcher' | 'batter'

type PlayerTrendRow = {
  metric: MetricKey
  label: string
  seasonValue: number | null
  l7Value: number | null
  delta: number | null
  l7Games: number
  insufficientSample: boolean
  direction: 'up' | 'down' | 'flat'
}

type PercentileResult = { rank: number; poolSize: number; percentile: number }

type SelectedPlayer = {
  id: number
  fullName: string
  primaryPosition: string
  subjectType: PlayerSubjectType
}

type PlayerData = {
  trend: PlayerTrendRow[] | null
  percentiles: Record<string, PercentileResult | null>
  loading: boolean
  error: string | null
}

const MAX_PLAYERS = 4

const HEADLINE_METRIC: Record<PlayerSubjectType, MetricKey> = { pitcher: 'era', batter: 'ops' }

// Only these have a percentile route today — fip has no leaders category yet.
const PERCENTILE_METRICS = new Set(['era', 'whip', 'k9', 'ops', 'slg', 'obp'])

const TREND_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up: '#15803D', down: '#DC2626', flat: '#78716C',
}
const TREND_LABEL: Record<'up' | 'down' | 'flat', string> = {
  up: '↑ Trending up', down: '↓ Trending down', flat: '→ Steady',
}

function inferSubjectType(primaryPosition: string): PlayerSubjectType {
  return primaryPosition === 'P' ? 'pitcher' : 'batter'
}

// MLB's standard static headshot CDN pattern — same style URL seen
// elsewhere in the app (LineupRow's fallback, mlb-homepage leaders).
// Written locally rather than assuming a shared `playerHeadshotUrl` export
// exists in @/lib/mlb — if it does, swap this out for the real one so
// there's one source of truth for headshot URLs, not two.
function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_180,q_auto:best/v1/people/${personId}/headshot/67/current`
}

export default function PlayersDashboard({ isPro }: { isPro: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [selected, setSelected] = useState<SelectedPlayer[]>([])
  const [data, setData] = useState<Record<number, PlayerData>>({})
  const [limitMsg, setLimitMsg] = useState(false)

  const search = useCallback((q: string) => {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(json => setResults(json.people ?? []))
      .catch(() => setResults([]))
  }, [])

  async function addPlayer(p: Person) {
    if (selected.some(s => s.id === p.id)) return
    if (selected.length >= MAX_PLAYERS) { setLimitMsg(true); return }
    setLimitMsg(false)

    const subjectType = inferSubjectType(p.primaryPosition)
    setSelected(prev => [...prev, { ...p, subjectType }])
    setQuery(''); setResults([])
    setData(prev => ({ ...prev, [p.id]: { trend: null, percentiles: {}, loading: true, error: null } }))

    try {
      const res = await fetch(`/api/lab/player-trend?subjectType=${subjectType}&id=${p.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
      const trend: PlayerTrendRow[] = json.rows ?? []
      setData(prev => ({ ...prev, [p.id]: { ...prev[p.id], trend, loading: false } }))

      if (isPro) {
        const percentileMetrics = trend.map(t => t.metric).filter(m => PERCENTILE_METRICS.has(m))
        const entries = await Promise.all(percentileMetrics.map(async metric => {
          const r = await fetch(`/api/lab/percentile?metric=${metric}&id=${p.id}`)
          const j = await r.json()
          return [metric, r.ok ? (j.result as PercentileResult | null) : null] as const
        }))
        setData(prev => ({
          ...prev,
          [p.id]: { ...prev[p.id], percentiles: Object.fromEntries(entries) },
        }))
      }
    } catch (e) {
      setData(prev => ({
        ...prev,
        [p.id]: { trend: null, percentiles: {}, loading: false, error: e instanceof Error ? e.message : "Couldn't load this player." },
      }))
    }
  }

  function removePlayer(id: number) {
    setSelected(prev => prev.filter(s => s.id !== id))
    setData(prev => { const next = { ...prev }; delete next[id]; return next })
    setLimitMsg(false)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* ── LEFT RAIL — selected player headshots ── */}
      <div className="flex md:flex-col gap-3 md:w-24 shrink-0 md:sticky md:top-4 md:self-start overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {selected.map(p => (
          <div key={p.id} className="relative group shrink-0">
            <img
              src={headshotUrl(p.id)}
              alt={p.fullName}
              className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-stone-200 bg-stone-100"
              onError={(e) => {
                e.currentTarget.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,h_180/v1/people/${p.id}/headshot/milb/current`
                e.currentTarget.onerror = null
              }}
            />
            <button
              type="button"
              onClick={() => removePlayer(p.id)}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#1A1A1A] text-[#FAF8F3] text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 md:opacity-100 transition"
              aria-label={`Remove ${p.fullName}`}
            >
              ✕
            </button>
            <div className="text-[9px] font-mono text-stone-500 text-center mt-1 truncate w-16 md:w-20">
              {p.fullName.split(' ').slice(-1)[0]}
            </div>
          </div>
        ))}
        {Array.from({ length: MAX_PLAYERS - selected.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-300 text-xl shrink-0"
          >
            +
          </div>
        ))}
      </div>

      {/* ── RIGHT — selector + stat columns ── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">
            Search from MLB rosters… ({selected.length}/{MAX_PLAYERS})
          </div>
          <div className="relative max-w-sm">
            <input
              value={query}
              onChange={e => search(e.target.value)}
              placeholder="Search players…"
              className="w-full border border-stone-300 px-3 py-2 font-mono text-sm"
            />
            {results.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-stone-300 mt-1 max-h-56 overflow-y-auto">
                {results.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPlayer(p)}
                    disabled={selected.some(s => s.id === p.id)}
                    className="block w-full text-left px-3 py-2 text-sm font-mono hover:bg-stone-50 disabled:opacity-40"
                  >
                    {p.fullName} <span className="text-stone-400">· {p.primaryPosition}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {limitMsg && (
            <p className="text-[10px] font-mono text-orange-600 mt-1">
              Max {MAX_PLAYERS} players — remove one to add another.
            </p>
          )}
        </div>

        {selected.length === 0 ? (
          <div className="border border-dashed border-stone-300 p-10 text-center">
            <p className="font-serif italic text-stone-400 text-sm">
              Search and add up to {MAX_PLAYERS} players to compare who&apos;s trending — season average vs their last 7 games.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {selected.map(p => (
              <PlayerColumn
                key={p.id}
                player={p}
                data={data[p.id]}
                isPro={isPro}
                onRemove={() => removePlayer(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerColumn({
  player, data, isPro, onRemove,
}: {
  player: SelectedPlayer
  data?: PlayerData
  isPro: boolean
  onRemove: () => void
}) {
  const headlineMetric = HEADLINE_METRIC[player.subjectType]

  return (
    <div className="border border-stone-200 bg-white p-4 relative min-w-0">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-3 right-3 text-stone-300 hover:text-stone-600 text-sm"
        aria-label={`Remove ${player.fullName}`}
      >
        ✕
      </button>

      <div className="font-serif font-bold text-stone-900 text-base leading-tight pr-6 truncate">{player.fullName}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
        {player.primaryPosition} · {player.subjectType}
      </div>

      {!data || data.loading ? (
        <p className="text-xs font-mono text-stone-400">Loading…</p>
      ) : data.error ? (
        <p className="text-xs font-mono text-red-600">{data.error}</p>
      ) : (
        <div className="space-y-2.5">
          {data.trend?.map(row => {
            const isHeadline = row.metric === headlineMetric
            const locked = !isPro && !isHeadline
            const tip = METRIC_TOOLTIPS[row.metric]
            const pct = data.percentiles[row.metric]

            return (
              <div key={row.metric} className="border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
                    {tip ? <MetricTip tip={tip}>{row.label}</MetricTip> : row.label}
                  </span>
                  {locked ? (
                    <span className="text-[10px] font-mono text-stone-300">🔒 Pro</span>
                  ) : (
                    <span className="font-mono text-sm font-bold text-stone-900">
                      {row.seasonValue !== null ? row.seasonValue : '—'}
                    </span>
                  )}
                </div>
                {!locked && (
                  <div className="flex items-center justify-between mt-0.5">
                    {row.insufficientSample ? (
                      <span className="text-[9px] font-mono text-stone-300">sample too small</span>
                    ) : (
                      <span className="text-[9px] font-mono font-bold" style={{ color: TREND_COLOR[row.direction] }}>
                        {TREND_LABEL[row.direction]}
                      </span>
                    )}
                    {isPro && pct && <PercentileBar result={pct} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isPro && (
        <p className="text-[9px] font-mono text-stone-300 mt-3 pt-3 border-t border-stone-100">
          Pro unlocks full metric breakdown + league percentile rank for every stat.
        </p>
      )}
    </div>
  )
}

function PercentileBar({ result }: { result: PercentileResult }) {
  return (
    <div className="w-16 shrink-0">
      <div className="h-1 bg-stone-100">
        <div className="h-1 bg-[#FF5722]" style={{ width: `${result.percentile}%` }} />
      </div>
      <div className="text-[8px] font-mono text-stone-400 mt-0.5 text-right">{result.percentile}th pct</div>
    </div>
  )
}