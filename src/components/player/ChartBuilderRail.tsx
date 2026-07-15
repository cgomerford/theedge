'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { BatterGame, PitcherGame } from '@/lib/stats-gamelog'
import { aggregateBatting, aggregatePitching } from '@/lib/stats-gamelog'

const BATTER_STATS = [
  { key: 'avg', label: 'AVG', decimals: 3 },
  { key: 'obp', label: 'OBP', decimals: 3 },
  { key: 'slg', label: 'SLG', decimals: 3 },
  { key: 'ops', label: 'OPS', decimals: 3 },
] as const

const PITCHER_STATS = [
  { key: 'era', label: 'ERA', decimals: 2 },
  { key: 'whip', label: 'WHIP', decimals: 2 },
  { key: 'k9', label: 'K/9', decimals: 1 },
  { key: 'bb9', label: 'BB/9', decimals: 1 },
] as const

export default function ChartBuilderRail({ playerId, isPitcher }: { playerId: number; isPitcher: boolean }) {
  const [games, setGames] = useState<(BatterGame | PitcherGame)[]>([])
  const [loading, setLoading] = useState(true)
  const stats = isPitcher ? PITCHER_STATS : BATTER_STATS
  const [statKey, setStatKey] = useState<string>(stats[0].key)
  const [window, setWindowSize] = useState(isPitcher ? 5 : 15)

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

  const stat = stats.find(s => s.key === statKey) ?? stats[0]

  const rolling = useMemo(() => {
    const out: { g: number; v: number | null }[] = []
    for (let i = 0; i < games.length; i++) {
      if (i < window - 1) { out.push({ g: i + 1, v: null }); continue }
      const slice = games.slice(i - window + 1, i + 1)
      const agg: any = isPitcher ? aggregatePitching(slice as PitcherGame[]) : aggregateBatting(slice as BatterGame[])
      out.push({ g: i + 1, v: typeof agg[stat.key] === 'number' ? agg[stat.key] : null })
    }
    return out
  }, [games, window, stat.key, isPitcher])

  const seasonBaseline = useMemo(() => {
    if (games.length === 0) return null
    const agg: any = isPitcher ? aggregatePitching(games as PitcherGame[]) : aggregateBatting(games as BatterGame[])
    return typeof agg[stat.key] === 'number' ? agg[stat.key] : null
  }, [games, stat.key, isPitcher])

  return (
    <div className="sticky top-6 bg-white border border-stone-200 rounded-xl p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">
        ⊕ Build a chart
      </div>
      <p className="text-[10px] font-serif italic text-stone-400 mb-4">
        Pick a stat and a window — rolling average over this season's games.
      </p>

      <div className="mb-3">
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">Stat</div>
        <div className="flex flex-wrap gap-1.5">
          {stats.map(s => (
            <button
              key={s.key}
              onClick={() => setStatKey(s.key)}
              className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-full border ${
                statKey === s.key
                  ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]'
                  : 'border-stone-300 text-stone-500 hover:border-stone-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">Window</div>
        <div className="flex items-center gap-3">
          <button onClick={() => setWindowSize(w => Math.max(3, w - 1))} className="w-7 h-7 flex items-center justify-center border border-stone-300 rounded-full font-mono text-xs hover:border-stone-900">‹</button>
          <span className="font-mono text-sm w-16 text-center">{window} games</span>
          <button onClick={() => setWindowSize(w => Math.min(games.length || w, w + 1))} className="w-7 h-7 flex items-center justify-center border border-stone-300 rounded-full font-mono text-xs hover:border-stone-900">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs font-serif italic text-stone-400 py-6 text-center">Loading…</p>
      ) : games.length < window ? (
        <p className="text-xs font-serif italic text-stone-400 py-6 text-center">
          Need at least {window} games — {games.length} played.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rolling} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="g" tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#a8a29e' }} />
            <YAxis tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#a8a29e' }} width={36} domain={['auto', 'auto']} />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(stat.decimals) : '—')} labelFormatter={l => `Game ${l}`} />
            {seasonBaseline != null && (
              <ReferenceLine y={seasonBaseline} stroke="#a8a29e" strokeDasharray="4 3" />
            )}
            <Line type="monotone" dataKey="v" stroke="#FF5722" strokeWidth={2} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}