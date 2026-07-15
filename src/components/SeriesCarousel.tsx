'use client'

import { useState } from 'react'

type SeriesGame = {
  gameNumber: number
  gamePk: number
  date: string
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
  isFinal: boolean
  isTonight: boolean
}

// Correct won/tied/leads wording, computed from actual results rather than
// a single "lead" label that doesn't know when a series is decided
// (2026-07-13 fix — old SeriesTrajectory always said "lead", never seen its
// source to patch directly, so this is a clean replacement instead).
function seriesStatusLabel(games: SeriesGame[], awayAbbr: string, homeAbbr: string): string {
  const awayWins = games.filter(g => g.isFinal && g.awayScore !== null && g.homeScore !== null && g.awayScore > g.homeScore!).length
  const homeWins = games.filter(g => g.isFinal && g.awayScore !== null && g.homeScore !== null && g.homeScore! > g.awayScore!).length
  const clinch = Math.ceil(games.length / 2)

  if (awayWins === 0 && homeWins === 0) return 'Series starts tonight'
  if (awayWins === homeWins) return `${awayAbbr} ${awayWins} – ${homeWins} ${homeAbbr} · Tied`

  const leader = awayWins > homeWins ? awayAbbr : homeAbbr
  const leaderWins = Math.max(awayWins, homeWins)
  const verb = leaderWins >= clinch ? 'won the series' : 'leads'
  return `${awayAbbr} ${awayWins} – ${homeWins} ${homeAbbr} · ${leader} ${verb}`
}

export default function SeriesCarousel({
  games, awayAbbr, homeAbbr,
}: {
  games: SeriesGame[]
  awayAbbr: string
  homeAbbr: string
}) {
  const tonightIndex = games.findIndex(g => g.isTonight)
  const [index, setIndex] = useState(tonightIndex === -1 ? games.length - 1 : tonightIndex)

  if (games.length === 0) return null
  const g = games[index]

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">Series · {games.length} games</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-stone-300 disabled:opacity-20 hover:text-stone-900 text-lg px-1"
          aria-label="Previous game"
        >‹</button>

        <div
          className="flex-1 border border-stone-100 rounded-lg p-3"
          style={g.isTonight ? { borderColor: '#FF5722' } : undefined}
        >
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">
            <span>Game {g.gameNumber} · {g.date}</span>
            {g.isTonight && <span className="text-orange-600 font-bold">● Tonight</span>}
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className={g.isFinal && (g.awayScore ?? 0) > (g.homeScore ?? 0) ? 'font-bold text-stone-900' : 'text-stone-500'}>{g.awayAbbr}</span>
            <span className="font-bold text-stone-900">{g.awayScore ?? '–'} - {g.homeScore ?? '–'}</span>
            <span className={g.isFinal && (g.homeScore ?? 0) > (g.awayScore ?? 0) ? 'font-bold text-stone-900' : 'text-stone-500'}>{g.homeAbbr}</span>
          </div>
        </div>

        <button
          onClick={() => setIndex(i => Math.min(games.length - 1, i + 1))}
          disabled={index === games.length - 1}
          className="text-stone-300 disabled:opacity-20 hover:text-stone-900 text-lg px-1"
          aria-label="Next game"
        >›</button>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-3">
        {games.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className="rounded-full transition"
            style={{ width: i === index ? 16 : 6, height: 6, background: i === index ? '#FF5722' : '#e7e2d6' }}
            aria-label={`Game ${i + 1}`}
          />
        ))}
      </div>

      <p className="text-[10px] font-mono text-stone-500 text-center mt-3">{seriesStatusLabel(games, awayAbbr, homeAbbr)}</p>
    </div>
  )
}