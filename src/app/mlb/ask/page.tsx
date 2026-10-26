// /mlb/ask: "Ask the stats", the league-wide query lab and Player Explorer (StatsHub). Pro features are gated inside, exactly as before.
// isPro comes from isProViewer(), the same check the API uses; it is never defaulted to true.
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import StatsHub from '@/components/stats/StatsHub'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Ask the stats',
  description: 'Search any MLB stat by season, game type, inning, count and more, then chart it and compare years. The sample size is shown beside every number.',
  path: '/mlb/ask',
})

export default async function AskTheStatsPage() {
  const [subscriber, isPro] = await Promise.all([getCurrentSubscriber(), isProViewer()])
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Ask the stats', path: '/mlb/ask' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <StatsHub isPro={isPro} isSignedIn={!!subscriber} />
    </main>
  )
}
