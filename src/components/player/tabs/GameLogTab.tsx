'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BatterGame, PitcherGame } from '@/lib/stats-gamelog'

export default function GameLogTab({ playerId, isPitcher }: { playerId: number; isPitcher: boolean }) {
  const [games, setGames] = useState<(BatterGame | PitcherGame)[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'home' | 'away'>('all')

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

  const filtered = useMemo(() => {
    return games.filter(g => {
      if (filter === 'home' && !g.isHome) return false
      if (filter === 'away' && g.isHome) return false
      return true
    })
  }, [games, filter])

  if (loading) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">Loading game log…</p>
  if (games.length === 0) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">No games this season yet.</p>

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3 flex-wrap">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
          ⊕ Game log
        </div>
        <div className="ml-auto flex gap-2 items-center flex-wrap">
          <FilterGroup label="Site" value={filter} setValue={setFilter as any} options={[['all', 'All'], ['home', 'Home'], ['away', 'Away']]} />
          <span className="text-[10px] font-mono text-stone-400">{filtered.length}/{games.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50">
            <tr>
              {(isPitcher ? PITCHER_HEADERS : BATTER_HEADERS).map(h => (
                <th key={h} className={`px-3 py-2.5 text-[9px] font-mono uppercase tracking-widest text-stone-500 whitespace-nowrap ${h === 'Date' || h === 'Opp' ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((g, i) => isPitcher ? <PitcherRow key={i} g={g as PitcherGame} /> : <BatterRow key={i} g={g as BatterGame} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const BATTER_HEADERS = ['Date', 'Opp', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'K', 'SB', 'AVG']
const PITCHER_HEADERS = ['Date', 'Opp', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'ERA']

function BatterRow({ g }: { g: BatterGame }) {
  const avg = g.ab > 0 ? (g.h / g.ab).toFixed(3).replace(/^0/, '') : '—'
  return (
    <tr className="border-t border-stone-50 hover:bg-stone-50/50">
      <td className="px-3 py-2 font-mono text-stone-600 whitespace-nowrap">{g.date}</td>
      <td className="px-3 py-2 font-mono text-stone-700 whitespace-nowrap">{g.isHome ? 'vs ' : '@ '}{g.opponent}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.ab}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.h}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.doubles}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.triples}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.hr}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">—</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.rbi}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.bb}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.so}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.sb}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900 font-bold">{avg}</td>
    </tr>
  )
}

function PitcherRow({ g }: { g: PitcherGame }) {
  const era = g.ip > 0 ? ((g.er / g.ip) * 9).toFixed(2) : '—'
  return (
    <tr className="border-t border-stone-50 hover:bg-stone-50/50">
      <td className="px-3 py-2 font-mono text-stone-600 whitespace-nowrap">{g.date}</td>
      <td className="px-3 py-2 font-mono text-stone-700 whitespace-nowrap">{g.isHome ? 'vs ' : '@ '}{g.opponent}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.ip.toFixed(1)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.h}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">—</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.er}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.bb}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.so}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{g.hr}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900 font-bold">{era}</td>
    </tr>
  )
}

function FilterGroup({
  label, value, setValue, options,
}: {
  label: string
  value: string
  setValue: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</span>
      <div className="flex">
        {options.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setValue(k)}
            className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 border ${
              value === k ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500 hover:border-stone-900'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}