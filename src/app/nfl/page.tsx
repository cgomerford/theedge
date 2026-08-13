import SiteHeader from '@/components/SiteHeader'
import { getNFLStandings, getNFLTeams } from '@/lib/nfl'
import { getNFLCurrentWeek } from '@/lib/nfl-schedule'
import { fetchNFLHomepageLeaders } from '@/lib/nfl/leaders'
import { fetchNFLNews } from '@/lib/nfl/news'
import { getHomepageInjuryReport } from '@/lib/nfl/transactions'
import NFLHomepage from './NFLHomepage'

export const metadata = {
  title: 'NFL · The Edge',
  description: 'Division standings, stat leaders, and league news.',
}

export const revalidate = 3600

// NFL "season" is the year the season STARTS in (e.g. games played
// Sept 2026 - Feb 2027 are season=2026). Kickoff is Sept 9, 2026 per
// the project plan, so 2026 is correct for the entire 2026-27 season
// including the Feb 2027 playoffs. This will need to become 2027 next
// August — not on any timer, has to be bumped by hand or replaced with
// real season-detection logic (ESPN's calendar endpoint, unverified,
// would be the source if you want this automatic).
const CURRENT_SEASON = 2026

export default async function NFLPage() {
  // Fetch everything in parallel — these are five independent data
  // sources with no dependencies on each other, matching the pattern
  // getNFLGamePageData already uses for the game page.
  const [standings, teams, currentWeek, leaders, news, transactions] = await Promise.all([
    getNFLStandings(),
    getNFLTeams(),
    getNFLCurrentWeek(),
    fetchNFLHomepageLeaders(CURRENT_SEASON),
    fetchNFLNews(20),
    getHomepageInjuryReport(7),
  ])

  // getNFLCurrentWeek() returns one NFLWeek with a flat games array —
  // that's what the homepage's day-grouping expects. If this is empty
  // during the off-season (no "current week" concept when no games are
  // scheduled), the homepage's ScheduleSection already shows an empty
  // state gracefully rather than crashing.
  const upcomingGames = currentWeek?.games ?? []

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <NFLHomepage
        upcomingGames={upcomingGames}
        leaders={leaders}
        news={news}
        transactions={transactions}
        standings={standings}
        teams={teams}
        season={CURRENT_SEASON}
      />
    </main>
  )
}