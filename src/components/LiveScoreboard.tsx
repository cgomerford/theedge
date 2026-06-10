'use client'

/**
 * src/components/LiveScoreboard.tsx
 *
 * Compact live scoreboard shown at the top of the game page shell
 * when a game is in progress. Matches the dark scoreboard aesthetic
 * from the /tonight scores page.
 *
 * Auto-refreshes every 30 seconds via router.refresh().
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  awayTeam: string
  homeTeam: string
  awayAbbr: string
  homeAbbr: string
  awayLogoUrl: string
  homeLogoUrl: string
  awayRuns: number
  homeRuns: number
  awayHits?: number
  homeHits?: number
  awayErrors?: number
  homeErrors?: number
  inningState?: string       // 'Top' | 'Bottom' | 'Middle' | 'End'
  currentInning?: string     // 'Top 3rd' etc
  isLive: boolean
  isFinal: boolean
  gameTime?: string
}

export default function LiveScoreboard({
  awayTeam, homeTeam, awayAbbr, homeAbbr,
  awayLogoUrl, homeLogoUrl,
  awayRuns, homeRuns,
  awayHits, homeHits,
  awayErrors, homeErrors,
  inningState, currentInning,
  isLive, isFinal, gameTime,
}: Props) {
  const router = useRouter()

  // Auto-refresh every 30s when live
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(interval)
  }, [isLive, router])

  if (!isLive && !isFinal) return null

  const awayLeading = awayRuns > homeRuns
  const homeLeading = homeRuns > awayRuns

  return (
    <div className="bg-[#111110] border-b border-[#2A2A28] px-4 py-4">
      <div className="max-w-4xl mx-auto">

        {/* Status bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ea580c]" />
              </span>
            )}
            <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${isLive ? 'text-[#ea580c]' : 'text-stone-400'}`}>
              {isFinal ? 'Final' : currentInning ?? 'Live'}
            </span>
          </div>
          {isLive && (
            <span className="font-mono text-[9px] text-stone-500 uppercase tracking-widest">
              Updates every 30s
            </span>
          )}
        </div>

        {/* Scoreboard table */}
        <div className="w-full">
          <table className="w-full font-mono">
            <thead>
              <tr className="border-b border-[#2A2A28]">
                <th className="text-left pb-2 text-[9px] uppercase tracking-widest text-stone-500 font-normal w-full">Team</th>
                <th className="pb-2 text-center text-[9px] uppercase tracking-widest text-stone-300 font-bold px-4 min-w-[40px]">R</th>
                <th className="pb-2 text-center text-[9px] uppercase tracking-widest text-stone-500 font-normal px-3 min-w-[32px]">H</th>
                <th className="pb-2 text-center text-[9px] uppercase tracking-widest text-stone-500 font-normal px-3 min-w-[32px]">E</th>
              </tr>
            </thead>
            <tbody>
              {/* Away row */}
              <tr className="border-b border-[#2A2A28]/50">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <img src={awayLogoUrl} alt={awayAbbr} className="w-6 h-6 object-contain shrink-0" />
                    <span className={`text-sm font-bold tracking-wide ${awayLeading ? 'text-white' : 'text-stone-400'}`}>
                      {awayTeam}
                    </span>
                  </div>
                </td>
                <td className={`py-3 text-center text-xl font-bold px-4 ${awayLeading ? 'text-white' : 'text-stone-400'}`}>
                  {awayRuns}
                </td>
                <td className="py-3 text-center text-sm text-stone-500 px-3">{awayHits ?? '–'}</td>
                <td className="py-3 text-center text-sm text-stone-600 px-3">{awayErrors ?? '–'}</td>
              </tr>

              {/* Home row */}
              <tr>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <img src={homeLogoUrl} alt={homeAbbr} className="w-6 h-6 object-contain shrink-0" />
                    <span className={`text-sm font-bold tracking-wide ${homeLeading ? 'text-white' : 'text-stone-400'}`}>
                      {homeTeam}
                    </span>
                  </div>
                </td>
                <td className={`py-3 text-center text-xl font-bold px-4 ${homeLeading ? 'text-white' : 'text-stone-400'}`}>
                  {homeRuns}
                </td>
                <td className="py-3 text-center text-sm text-stone-500 px-3">{homeHits ?? '–'}</td>
                <td className="py-3 text-center text-sm text-stone-600 px-3">{homeErrors ?? '–'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tied indicator */}
        {isLive && awayRuns === homeRuns && (
          <div className="mt-2 text-center">
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Tied</span>
          </div>
        )}
      </div>
    </div>
  )
}
