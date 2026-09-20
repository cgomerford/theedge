// src/app/mlb/stats/page.tsx
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import StatsSearchPage from '@/components/StatsSearchPage'

export const metadata = {
  title: 'Stats Search · The Edge',
  description: 'Search any real MLB stat — box score, fielding, and Statcast — and get a live leaderboard.',
}

export const revalidate = 1800

export default function MLBStatsPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <StatsSearchPage />
    </main>
  )
}
