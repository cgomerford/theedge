// src/components/TradingFloorBoard.tsx
'use client'

// "The Board" — Trading Floor slate overview. Sortable table of tonight's
// games: Edge Score, bullpen fatigue dots, park HR factor, top driver tag.
// Receives pre-fetched data from getBoardSlate() — no client-side fetching.

import { useState } from 'react'
import Link from 'next/link'
import type { BoardGame, BullpenFatigue } from '@/lib/trading-floor-board'

interface TradingFloorBoardProps {
  games: BoardGame[]
}

const FATIGUE_DOT: Record<BullpenFatigue, string> = {
  fresh: 'bg-emerald-500',
  used: 'bg-yellow-400',
  taxed: 'bg-orange-500',
  gassed: 'bg-red-500',
  unknown: 'bg-stone-300',
}

const FATIGUE_LABEL: Record<BullpenFatigue, string> = {
  fresh: 'Fresh',
  used: 'Used',
  taxed: 'Taxed',
  gassed: 'Gassed',
  unknown: '?',
}

// Count how many of the 8 components are meaningfully aligned (|value| > 5).
// Shown in "Factors" column — how many data points are pointing in the same
// direction — without showing a directional +/- score or pick.
function countAlignedFactors(components: Record<string, number> | null | undefined): number {
  if (!components) return 0
  return Object.values(components).filter(v => Math.abs(v) > 5).length
}

function factorBadgeColor(count: number): string {
  if (count >= 5) return '#FF5722'
  if (count >= 3) return '#D97706'
  return '#78716C'
}

function driverBadgeStyle(driver: string | null): { bg: string; color: string } {
  switch (driver) {
    case 'pitcher': return { bg: 'rgba(34,197,94,0.12)', color: '#16A34A' }
    case 'bullpen': return { bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    case 'offense': return { bg: 'rgba(217,119,6,0.12)', color: '#D97706' }
    case 'matchup': return { bg: 'rgba(255,87,34,0.12)', color: '#FF5722' }
    case 'park': return { bg: 'rgba(37,99,235,0.12)', color: '#2563EB' }
    default: return { bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  }
}

type SortKey = 'edge' | 'time'

export default function TradingFloorBoard({ games }: TradingFloorBoardProps) {
  const [sortBy, setSortBy] = useState<SortKey>('edge')

  const sorted = [...games].sort((a, b) => {
    if (sortBy === 'edge') {
      return countAlignedFactors(b.components) - countAlignedFactors(a.components)
    }
    return 0
  })

  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          ⊕ The Board
        </div>
        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">
          {games.length} games
        </span>
      </div>

      {games.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-stone-400">
            Today's slate isn't loaded yet — check back closer to first pitch.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <thead>
              <tr className="border-b border-stone-100">
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-stone-400">Matchup</th>
                <th
                  onClick={() => setSortBy('edge')}
                  className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide cursor-pointer text-center"
                  style={{ color: sortBy === 'edge' ? '#FF5722' : '#A8A29E' }}
                >
                  Factors{sortBy === 'edge' ? ' ▾' : ''}
                </th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Pen</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Park HR</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Lineups</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-center text-stone-400">Driver</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((g, i) => (
                <tr
                  key={g.game_pk}
                  className={`border-b border-stone-50 last:border-b-0 ${i % 2 === 1 ? 'bg-stone-50/50' : ''}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/mlb/${g.slug}`} className="hover:underline">
                      <span className="font-bold text-[#1A1A1A]">{g.away_abbr}</span>
                      <span className="text-stone-300 mx-1">@</span>
                      <span className="font-bold text-[#1A1A1A]">{g.home_abbr}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const count = countAlignedFactors(g.components)
                      return (
                        <span
                          className="font-mono text-xs font-bold"
                          style={{ color: factorBadgeColor(count) }}
                        >
                          {count}/8
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${FATIGUE_DOT[g.away_pitcher_fatigue]}`}
                        title={`${g.away_abbr} bullpen: ${FATIGUE_LABEL[g.away_pitcher_fatigue]}`}
                      />
                      <span className="text-stone-300 text-[9px]">·</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${FATIGUE_DOT[g.home_pitcher_fatigue]}`}
                        title={`${g.home_abbr} bullpen: ${FATIGUE_LABEL[g.home_pitcher_fatigue]}`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {g.park_hr_factor !== null ? (
                      <span
                        className="font-bold"
                        style={{
                          color: g.park_hr_factor > 1.05 ? '#DC2626' : g.park_hr_factor < 0.9 ? '#2563EB' : '#78716C',
                        }}
                      >
                        {g.park_hr_factor.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={g.lineups_confirmed ? 'text-emerald-600' : 'text-stone-300'}>
                      {g.lineups_confirmed ? '✓' : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {g.top_driver && (
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={driverBadgeStyle(g.top_driver)}
                      >
                        {g.top_driver}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}