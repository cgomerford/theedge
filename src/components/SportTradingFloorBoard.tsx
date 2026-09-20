'use client'

// src/components/SportTradingFloorBoard.tsx
//
// Homepage sport-switchable board. Does NOT modify TradingFloorBoard.tsx —
// that component keeps working exactly as-is for /fantasy. This wraps it
// with an MLB/NFL toggle ABOVE both cards (not nested inside one), so
// TradingFloorBoard's own "⊕ The Board" header renders once, un-duplicated,
// when MLB is selected.
//
//   MLB: the real, untouched <TradingFloorBoard> — Factors /8, Pen
//   fatigue dots, Park HR, Lineups confirmed, Driver.
//
//   NFL: its own small table — Factors /4, Confidence tier, Driver only.
//   NO fatigue dots / park factor / lineups column — that data doesn't
//   exist for NFL (see nfl-trading-floor-board.ts) and is not fabricated.

import { useState } from 'react'
import Link from 'next/link'
import TradingFloorBoard from './TradingFloorBoard'
import type { BoardGame } from '@/lib/trading-floor-board'
import { countAlignedNflFactors, NFL_TOTAL_FACTORS, type NflBoardGame } from '@/lib/nfl-trading-floor-board'

type Sport = 'mlb' | 'nfl'

function factorColor(count: number, total: number): string {
  const ratio = count / total
  if (ratio >= 0.62) return '#FF5722'
  if (ratio >= 0.37) return '#D97706'
  return '#78716C'
}

function tierColor(tier: NflBoardGame['confidence_tier']): string {
  switch (tier) {
    case 'strong': return '#FF5722'
    case 'moderate': return '#D97706'
    case 'slight': return '#78716C'
    default: return '#A8A29E'
  }
}

function NflBoardCard({ games }: { games: NflBoardGame[] }) {
  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">⊕ The Board</div>
        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">{games.length} games</span>
      </div>

      {games.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-stone-400">This week's slate isn't loaded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <thead>
              <tr className="border-b border-stone-100">
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-stone-400">Matchup</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Factors</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Tier</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Driver</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, i) => {
                const count = countAlignedNflFactors(g.components)
                return (
                  <tr key={g.eventId} className={`border-b border-stone-50 last:border-b-0 ${i % 2 === 1 ? 'bg-stone-50/50' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/nfl/${g.slug}`} className="hover:underline">
                        <span className="font-bold text-[#1A1A1A]">{g.away_abbr}</span>
                        <span className="text-stone-300 mx-1">@</span>
                        <span className="font-bold text-[#1A1A1A]">{g.home_abbr}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="font-mono text-xs font-bold" style={{ color: factorColor(count, NFL_TOTAL_FACTORS) }}>
                        {count}/{NFL_TOTAL_FACTORS}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-[9px] font-bold uppercase" style={{ color: tierColor(g.confidence_tier) }}>
                        {g.confidence_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {g.top_driver && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,87,34,0.12)', color: '#FF5722' }}>
                          {g.top_driver}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function SportTradingFloorBoard({
  mlbGames,
  nflGames,
}: {
  mlbGames: BoardGame[]
  nflGames: NflBoardGame[]
}) {
  const [sport, setSport] = useState<Sport>('mlb')

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setSport('mlb')}
          className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest font-bold border ${sport === 'mlb' ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'text-stone-500 border-stone-200'}`}
        >
          MLB
        </button>
        <button
          onClick={() => setSport('nfl')}
          className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest font-bold border ${sport === 'nfl' ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'text-stone-500 border-stone-200'}`}
        >
          NFL
        </button>
      </div>

      {sport === 'mlb' ? <TradingFloorBoard games={mlbGames} /> : <NflBoardCard games={nflGames} />}
    </div>
  )
}
