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

export const metadata = {
  title: 'MLB · The Edge',
  description: "Division standings, stat leaders, and today's edges — the GM briefing for baseball.",
}

export const revalidate = 1800

export default async function MLBPage() {
  const today = new Date().toISOString().split('T')[0]

  const [standings, news, games, predictions, ...statLeaderGroups] = await Promise.all([
    getMLBStandings(),
    getMLBNewsMultiSource(),
    getScheduleForDate(today),
    getPredictionsForDate(today),
    ...MLB_STAT_CATEGORIES.map(cat => getMLBStatLeaders(cat.slug)),
  ])

  const statLeaders: Record<string, Awaited<ReturnType<typeof getMLBStatLeaders>>> = {}
  MLB_STAT_CATEGORIES.forEach((cat, i) => {
    statLeaders[cat.slug] = statLeaderGroups[i] as Awaited<ReturnType<typeof getMLBStatLeaders>>
  })

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <MLBHomepage
        standings={standings}
        statLeaders={statLeaders}
        games={games}
        predictions={predictions as Map<number, any>}
        news={news}
        today={today}
      />
    </main>
  )
}