// src/app/mlb/lab/batting-lab/page.tsx — Batting Lab index: the one h1, one search field, and today's lineups as plain link rows.
// Each lineup row opens that game's preview on the Batters tab (confirmed or last-known lineup, with head-to-head and splits).
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { BattingHome } from '@/components/labs/LabHome'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Batting Lab',
  description: 'Search any MLB hitter for hot zones, spray direction, results by pitch type and head-to-head numbers, with the number of pitches or batted balls behind every stat.',
  path: '/mlb/lab/batting-lab',
})

export const revalidate = 1800

export default function BattingLabPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Batting Lab', path: '/mlb/lab/batting-lab' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <BattingHome />
    </main>
  )
}
