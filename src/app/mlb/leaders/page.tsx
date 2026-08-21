// src/app/mlb/leaders/page.tsx
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import {
  getSeasonLeaders,
  LEADER_CATEGORIES,
  LEADER_WINDOWS,
  BUCKET_DEFINITIONS,
  type LeaderRow,
} from '@/lib/mlb-leaders'
import MLBLeaderboardPage from './MLBLeaderboardPage'

export const metadata = {
  title: 'MLB Leaderboards · The Edge',
  description: 'League leaders across every major hitting and pitching stat — season totals, splits, and threshold breakdowns.',
}

export const revalidate = 1800

// Default categories for the three columns on first load. The client
// component can swap any column to any category/window afterward — these
// just avoid a blank page while that first client fetch would otherwise
// be in flight.
const DEFAULT_COLUMN_CATEGORIES = ['onBasePlusSlugging', 'earnedRunAverage', 'homeRuns']

export default async function MLBLeadersPage() {
  const defaultResults = await Promise.all(
    DEFAULT_COLUMN_CATEGORIES.map(slug => getSeasonLeaders(slug, 15))
  )

  const initialBoards = DEFAULT_COLUMN_CATEGORIES.map((slug, i) => ({
    category: slug,
    window: 'season' as const,
    rows: defaultResults[i],
  }))

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <MLBLeaderboardPage
        initialBoards={initialBoards}
        categories={LEADER_CATEGORIES}
        windows={LEADER_WINDOWS}
        buckets={BUCKET_DEFINITIONS}
      />
    </main>
  )
}