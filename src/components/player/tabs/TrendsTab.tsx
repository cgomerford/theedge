'use client'

// Thin wrapper reusing the SeasonProgressionCard pattern from
// PlayerShareBuilder.tsx. We fetch the game log via the existing
// /api/stats/gamelog route, then render rolling charts for OPS/ERA/etc.
//
// Deliberately compact — the deeper trends UI (batting form, velocity by
// month, TTOTO splits) can be layered on later. This block just needs to
// render *something* on the tab that isn't a "coming soon" placeholder.

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { BatterGame, PitcherGame } from '@/lib/stats-gamelog'
import { aggregateBatting, aggregatePitching } from '@/lib/stats-gamelog'

const BATTER_METRICS = [
  { key: 'ops', label: 'OPS', window: 15 },
  { key: 'avg', label: 'AVG', window: 15 },
  { key: 'slg', label: 'SLG', window: 15 },
] as const

const PITCHER_METRICS = [
  { key: 'era', label: 'ERA', window: 5 },
  { key: 'whip', label: 'WHIP', window: 5 },
  { key: 'k9', label: 'K/9', window: 5 },
] as const

export default function TrendsTab({ playerId, isPitcher }: { playerId: number; isPitcher: boolean }) {
  const [games, setGames] = useState<(BatterGame | PitcherGame)[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<string>(isPitcher ? 'era' : 'ops')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      subject: isPitcher ? 'pitcher' : 'batter',
      playerId: String(playerId),
      season: String(new Date().getFullYear()),
    })
    fetch(`/api/stats/gamelog?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setGames(j.games ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerId, isPitcher])

  const metrics = isPitcher ? PITCHER_METRICS : BATTER_METRICS
  const metric = metrics.find(m => m.key === selectedMetric) ?? metrics[0]

  if (loading) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">Loading game log…</p>
  if (games.length === 0) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">No games this season yet.</p>

  const rolling = computeRolling(games, metric.key, metric.window, isPitcher)
  const seasonBaseline = computeSeasonBaseline(games, metric.key, isPitcher)

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
            ⊕ Rolling {metric.window}-game {metric.label}
          </div>
          <p className="text-[10px] font-serif italic text-stone-400 mt-1">
            Dashed line = season average. Signal, not noise — needs {metric.window} games to draw.
          </p>
        </div>
        <div className="flex gap-1">
          {metrics.map(m => (
            <button
              key={m.key}
              onClick={() => setSelectedMetric(m.key)}
              className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 border ${
                selectedMetric === m.key
                  ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]'
                  : 'border-stone-300 text-stone-500 hover:border-stone-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rolling.length < metric.window ? (
        <p className="text-xs font-serif italic text-stone-400 py-8 text-center">
          Need at least {metric.window} games — currently {games.length}.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rolling} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
            <XAxis dataKey="gameNum" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
            <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={48} domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(metric.key === 'era' || metric.key === 'whip' ? 2 : 3) : '—')}
              labelFormatter={l => `Through game ${l}`}
            />
            {seasonBaseline != null && (
              <ReferenceLine y={seasonBaseline} stroke="#a8a29e" strokeDasharray="4 3" label={{ value: 'Season', fontSize: 9, fill: '#a8a29e' }} />
            )}
            <Line type="monotone" dataKey="value" stroke="#FF5722" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Rolling calc ─────────────────────────────────────────────────────────

function computeRolling(games: (BatterGame | PitcherGame)[], metric: string, window: number, isPitcher: boolean) {
  const out: { gameNum: number; value: number | null }[] = []
  for (let i = 0; i < games.length; i++) {
    if (i < window - 1) {
      out.push({ gameNum: i + 1, value: null })
      continue
    }
    const slice = games.slice(i - window + 1, i + 1)
    const agg = isPitcher ? aggregatePitching(slice as PitcherGame[]) : aggregateBatting(slice as BatterGame[])
    const v = (agg as any)[metric]
    out.push({ gameNum: i + 1, value: typeof v === 'number' ? v : null })
  }
  return out
}

function computeSeasonBaseline(games: (BatterGame | PitcherGame)[], metric: string, isPitcher: boolean): number | null {
  const agg = isPitcher ? aggregatePitching(games as PitcherGame[]) : aggregateBatting(games as BatterGame[])
  const v = (agg as any)[metric]
  return typeof v === 'number' ? v : null
}