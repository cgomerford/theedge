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
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'MLB games, standings and leaders',
  description:
    "Today's MLB games with starting pitchers and bullpen workload, plus division standings and season leaders, in plain numbers with the sample size shown.",
  path: '/mlb',
})

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
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <h1 style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 24px 0', fontSize: 26, fontWeight: 900, letterSpacing: '-0.01em', color: '#1A1A1A' }}>MLB games, standings and leaders</h1>
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