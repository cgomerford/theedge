import { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import LiveGameCard, { type ExtendedMLBGame } from '@/components/LiveGameCard'
import { getScheduleForDate } from '@/lib/mlb'

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
      <MLBSubNav />

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
          >
            Scores &amp; Matchups
          </h1>
          <p className="text-base text-stone-500 italic">
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
            {sortedGames.map((game) => (
              <LiveGameCard key={game.gamePk} game={game} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}