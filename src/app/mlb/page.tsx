// src/app/mlb/page.tsx
import SiteHeader from '@/components/SiteHeader'
import {
  getMLBStandings,
  getMLBStatLeaders,
  getMLBNewsMultiSource,
  MLB_STAT_CATEGORIES,
} from '@/lib/mlb-homepage'
import { getScheduleForDate } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import MLBHomepage from './MLBHomepage'
import { getAllActiveIL, getAllRecentTransactions } from '@/lib/team-transactions'
import { getLeagueStandardStats } from '@/lib/league-standard-stats'
import { getTeamRadarStats } from '@/lib/team-radar'
import MLBSubNav from '@/components/MLBSubNav'
import ArticlesTeaser from '@/components/ArticlesTeaser'

export const metadata = {
  title: 'MLB · The Edge',
  description: "Division standings, stat leaders, and today's edges — the GM briefing for baseball.",
}

export const revalidate = 1800

export default async function MLBPage() {
  const today = new Date().toISOString().split('T')[0]

  const [standings, news, games, predictions, activeIL, recentTransactions, leagueStandardStats, teamRadar, ...statLeaderGroups] = await Promise.all([
    getMLBStandings(),
    getMLBNewsMultiSource(),
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getAllActiveIL(),
    getAllRecentTransactions(5, ['IL', 'ACTIVATION', 'TRADE', 'SIGNING', 'CALLUP']),
    getLeagueStandardStats(new Date().getFullYear()),
    getTeamRadarStats(new Date().getFullYear()),
    ...MLB_STAT_CATEGORIES.map(cat => getMLBStatLeaders(cat.slug, 10, cat.group)),
  ])

  const statLeaders: Record<string, Awaited<ReturnType<typeof getMLBStatLeaders>>> = {}
  MLB_STAT_CATEGORIES.forEach((cat, i) => {
    statLeaders[cat.slug] = statLeaderGroups[i] as Awaited<ReturnType<typeof getMLBStatLeaders>>
  })

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <MLBHomepage
        standings={standings}
        statLeaders={statLeaders}
        games={games}
        predictions={predictions as Map<number, any>}
        news={news}
        activeIL={activeIL}
        recentTransactions={recentTransactions}
        leagueStandardStats={leagueStandardStats}
        teamRadarRows={teamRadar.rows}
        teamRadarFipConstant={teamRadar.cFIP}
        articlesTeaser={<ArticlesTeaser />}
      />
    </main>
  )
}