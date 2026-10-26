// /mlb/stats: league leaderboards (Batting, Pitching, Statcast) with MLB's qualification rule, sortable tables and a "Qualified only" toggle.
// The earlier query lab and Player Explorer (StatsHub) stay available under the "Ask the stats" tab, with its Pro gates unchanged.
// Server-rendered; the active tab lives in ?tab= and the canonical address carries no query string.
import { Suspense } from 'react'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import Tabs from '@/components/ui/Tabs'
import StatsHub from '@/components/stats/StatsHub'
import LeaderboardTable from '@/components/stats/LeaderboardTable'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { getBattingBoard, getPitchingBoard, getStatcastBatters, getStatcastPitchers, type Board } from '@/lib/stats-leaderboards'

export const metadata = pageMeta({
  title: 'MLB stats',
  description: 'MLB leaderboards for batting, pitching and Statcast, with the qualification rule or player minimum stated above every table.',
  path: '/mlb/stats',
})

const TABS = [{ id: 'batting', label: 'Batting' }, { id: 'pitching', label: 'Pitching' }, { id: 'statcast', label: 'Statcast' }, { id: 'ask', label: 'Ask the stats' }]

function Board({ b, qualifiable }: { b: Board; qualifiable: boolean }) {
  return <LeaderboardTable rows={b.rows} cols={b.cols} nLabel={b.n.label} nDigits={b.n.key === 'ip' ? 1 : 0} sortKey={b.sortKey} sortAsc={b.sortAsc} canFilter={qualifiable} minText={b.minText} />
}

export default async function MLBStatsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: asked } = await searchParams
  const tab = TABS.some(t => t.id === asked) ? (asked as string) : 'batting'
  const season = new Date().getFullYear()
  const [subscriber, isPro] = await Promise.all([getCurrentSubscriber(), isProViewer()])

  let body: React.ReactNode = null
  if (tab === 'batting') body = <Board b={await getBattingBoard(season)} qualifiable />
  else if (tab === 'pitching') body = <Board b={await getPitchingBoard(season)} qualifiable />
  else if (tab === 'statcast') {
    const [bat, pit] = await Promise.all([getStatcastBatters(season), getStatcastPitchers(season)])
    body = (
      <>
        <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800 }}>Batters</h2><Board b={bat} qualifiable={false} />
        <h2 style={{ margin: '32px 0 0', fontSize: 22, fontWeight: 800 }}>Pitchers</h2><Board b={pit} qualifiable={false} />
        <p style={{ fontSize: 12, color: '#8a8275' }}>Baseball Savant expected stats and batted-ball data, {season} regular season, through the latest game stored.</p>
      </>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Stats', path: '/mlb/stats' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Stats</div>
        <h1 style={{ margin: '4px 0 14px', fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.02 }}>Stats</h1>
        <Suspense fallback={null}><Tabs label="Stats sections" defaultTab="batting" tabs={TABS} /></Suspense>
        <div style={{ marginTop: 12 }}>
          {tab === 'ask' ? <StatsHub isPro={isPro} isSignedIn={!!subscriber} /> : body}
        </div>
      </div>
    </main>
  )
}
