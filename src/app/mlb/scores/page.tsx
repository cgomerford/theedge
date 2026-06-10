import { Metadata } from 'next'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl, type MLBGame } from '@/lib/mlb'

interface ExtendedMLBGame extends MLBGame {
  // 1. Extend the nested teams object to include score
  teams: {
    away: MLBGame['teams']['away'] & { score?: number }
    home: MLBGame['teams']['home'] & { score?: number }
  }
  // 2. Keep the linescore fields intact
  linescore?: {
    currentInningOrdinal?: string
    inningState?: string
    teams?: {
      away?: { hits?: number; errors?: number }
      home?: { hits?: number; errors?: number }
    }
  }
}

// Revalidate every 60 seconds so scores stay fresh without hammering the API
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Live Scores & Matchups · The Edge',
  description: 'Live out-of-town scoreboard and structural matchup breakdowns for every MLB game today.',
}

export default async function ScoresPage() {
  // Fetch today's schedule 
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const rawGames = await getScheduleForDate(today)
  
  // Apply our extended type here so TypeScript knows about the 'score' and 'linescore' properties
  const games = rawGames as ExtendedMLBGame[]

  // Sort games: Live first, then Pre-game, then Final
  const sortedGames = [...games].sort((a, b) => {
    const statusOrder: Record<string, number> = { 'Live': 1, 'Preview': 2, 'Final': 3 }
    const aStatus = statusOrder[a.status.abstractGameState] || 4
    const bStatus = statusOrder[b.status.abstractGameState] || 4
    if (aStatus !== bStatus) return aStatus - bStatus
    return new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()
  })

  return (
    <main className="min-h-screen bg-[#fafaf9] text-stone-900 font-sans">
      <SiteHeader />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* ── HEADER ── */}
        <header className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[#ea580c] text-[10px] font-mono uppercase tracking-widest">
              — Out of Town Scoreboard
            </div>
            <div className="text-[10px] font-mono text-stone-500 uppercase tracking-widest flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ea580c]"></span>
              </span>
              Live Updates
            </div>
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold text-stone-900 mb-3 tracking-tight"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            Scores &amp; Matchups
          </h1>
          <p className="text-base text-stone-500 font-serif italic">
            Live box scores and access to deep structural breakdowns.
          </p>
        </header>

        {/* ── SCOREBOARD GRID ── */}
        {sortedGames.length === 0 ? (
          <div className="text-center py-16 bg-white border border-stone-200 rounded-xl">
            <p className="font-serif italic text-stone-400">No games scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
            {sortedGames.map((game) => {
              const awayTeam = game.teams.away
              const homeTeam = game.teams.home
              const isLive = game.status.abstractGameState === 'Live'
              const isFinal = game.status.abstractGameState === 'Final'
              
              // Fallback linescore data if the API doesn't provide it yet
              const awayR = awayTeam.score ?? 0
              const homeR = homeTeam.score ?? 0
              const awayH = game.linescore?.teams?.away?.hits ?? '-'
              const homeH = game.linescore?.teams?.home?.hits ?? '-'
              const awayE = game.linescore?.teams?.away?.errors ?? '-'
              const homeE = game.linescore?.teams?.home?.errors ?? '-'

              return (
                <Link
                  key={game.gamePk}
                  href={`/mlb/${slugifyGame(game)}`}
                  className="block bg-[#111110] border border-[#2A2A28] rounded-xl p-5 hover:border-stone-500 hover:shadow-lg transition group relative overflow-hidden"
                >
                  {/* Subtle top edge highlight for live games */}
                  {isLive && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#ea580c]" />
                  )}

                  {/* Top Bar: Status */}
                  <div className="flex justify-between items-center mb-4">
                    <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${isLive ? 'text-[#ea580c]' : 'text-stone-400'}`}>
                      {isLive ? `${game.linescore?.inningState || ''} ${game.linescore?.currentInningOrdinal || 'Live'}` : 
                       isFinal ? 'Final' : 
                       formatGameTime(game.gameDate)}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-stone-600">
                      View Matchup →
                    </span>
                  </div>

                  {/* Classic R-H-E Table */}
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="text-[10px] border-b border-[#2A2A28]">
                        <th className="pb-2 font-normal text-stone-500 w-full uppercase tracking-widest">Team</th>
                        <th className="pb-2 font-normal px-2 text-center text-stone-400">R</th>
                        <th className="pb-2 font-normal px-2 text-center text-stone-600">H</th>
                        <th className="pb-2 font-normal pl-2 text-center text-stone-600">E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Away Row */}
                      <tr className="border-b border-[#2A2A28]/50">
                        <td className="py-2.5 flex items-center gap-2.5">
                          <img
                            src={teamLogoUrl(awayTeam.team.id)}
                            alt={awayTeam.team.name}
                            className="w-5 h-5 object-contain"
                          />
                          <span className="text-white font-bold text-sm tracking-wide">
                            {shortName(awayTeam.team.name)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-white font-bold text-sm">{awayR}</td>
                        <td className="py-2.5 px-2 text-center text-stone-400 text-xs">{awayH}</td>
                        <td className="py-2.5 pl-2 text-center text-stone-500 text-xs">{awayE}</td>
                      </tr>
                      
                      {/* Home Row */}
                      <tr>
                        <td className="py-2.5 flex items-center gap-2.5">
                          <img
                            src={teamLogoUrl(homeTeam.team.id)}
                            alt={homeTeam.team.name}
                            className="w-5 h-5 object-contain"
                          />
                          <span className="text-white font-bold text-sm tracking-wide">
                            {shortName(homeTeam.team.name)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-white font-bold text-sm">{homeR}</td>
                        <td className="py-2.5 px-2 text-center text-stone-400 text-xs">{homeH}</td>
                        <td className="py-2.5 pl-2 text-center text-stone-500 text-xs">{homeE}</td>
                      </tr>
                    </tbody>
                  </table>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    }) + ' ET'
  } catch {
    return '—'
  }
}