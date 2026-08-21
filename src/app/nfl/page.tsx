// src/app/nfl/page.tsx
import SiteHeader from '@/components/SiteHeader'
import { getNFLStandings, getNFLTeams } from '@/lib/nfl'
import { getRecentNFLGamesAdapted } from '@/lib/nfl/games-adapter'
import { getNFLCurrentWeek } from '@/lib/nfl-schedule'
import { fetchNFLHomepageLeaders } from '@/lib/nfl/leaders'
import { fetchNFLNews } from '@/lib/nfl/news'
import { getHomepageTransactions } from '@/lib/nfl/roster-transactions'
import { getFantasyOwnershipLeaders, getFantasyProTeams } from '@/lib/nfl/fantasy-ownership'
import { getTeamDepthChart } from '@/lib/nfl/depth-charts'
import NFLHomepage from './NFLHomepage'

export const metadata = {
  title: 'NFL · The Edge',
  description: 'Division standings, stat leaders, and league news.',
}

export const revalidate = 3600

const CURRENT_SEASON = 2026

// ESPN's team ids (1-34, non-contiguous — see nfl.ts for the full list).
// Depth chart fetching all 32 teams per homepage load is unnecessary
// weight for a preview column — this rotates a fixed-size subset by day
// of year so the preview varies day to day without hitting all 32 every
// request. Full 32-team browsing belongs on a dedicated page, not here.
const ALL_TEAM_IDS = [
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
  '17','18','19','20','21','22','23','24','25','26','27','28','29','30','32','33','34',
]
const DEPTH_CHART_PREVIEW_SIZE = 8

function getTodaysTeamSubset(): string[] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  const start = dayOfYear % ALL_TEAM_IDS.length
  const subset: string[] = []
  for (let i = 0; i < DEPTH_CHART_PREVIEW_SIZE; i++) {
    subset.push(ALL_TEAM_IDS[(start + i) % ALL_TEAM_IDS.length])
  }
  return subset
}

export default async function NFLPage() {
  const todaysTeamIds = getTodaysTeamSubset()

  const [standings, teams, recentGames, currentWeek, leaders, news, transactions, fantasyOwnership, fantasyProTeams, depthCharts] = await Promise.all([
    getNFLStandings(),
    getNFLTeams(),
    getRecentNFLGamesAdapted(12, 1),
    getNFLCurrentWeek(),
    fetchNFLHomepageLeaders(CURRENT_SEASON),
    fetchNFLNews(20),
    getHomepageTransactions(20),
    getFantasyOwnershipLeaders(20),
    getFantasyProTeams(),
    // One fetch per team in today's subset, in parallel. Nulls (failed
    // fetches) are filtered out below rather than shown as broken cards.
    Promise.all(todaysTeamIds.map(id => getTeamDepthChart(id))),
  ])

  const upcomingGames = recentGames
  const safeDepthCharts = depthCharts.filter((c): c is NonNullable<typeof c> => c !== null)

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <NFLHomepage
        upcomingGames={upcomingGames}
        weekSchedule={currentWeek}
        leaders={leaders}
        news={news}
        transactions={transactions}
        standings={standings}
        teams={teams}
        season={CURRENT_SEASON}
        fantasyOwnership={fantasyOwnership}
        fantasyProTeams={fantasyProTeams}
        depthCharts={safeDepthCharts}
      />
    </main>
  )
}