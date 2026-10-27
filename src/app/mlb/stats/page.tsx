// /mlb/stats: league leaderboards (Batting, Pitching, Statcast) with MLB's qualification rule, sortable tables and a "Qualified only" toggle.
// The query lab and Player Explorer are their own page now: /mlb/ask ("Ask the stats").
// Server-rendered; the active tab lives in ?tab= and the canonical address carries no query string.
import { Suspense } from 'react'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import Tabs from '@/components/ui/Tabs'
import LeaderboardTable from '@/components/stats/LeaderboardTable'
import { isProViewer } from '@/lib/require-pro'
import { isSignedIn } from '@/lib/require-signup'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import StatsFilters from '@/components/stats/StatsFilters'
import { getBattingBoardFor, getPitchingBoardFor, LEVELS, GAME_TYPES, ctxLabel, type StatsCtx, getStatcastBatters, getStatcastPitchers, getAdvancedBatters, getAdvancedPitchers, type Board } from '@/lib/stats-leaderboards'

export const metadata = pageMeta({
  title: 'MLB stats',
  description: 'MLB leaderboards for batting, pitching and Statcast, with the qualification rule or player minimum stated above every table.',
  path: '/mlb/stats',
})

const TABS = [{ id: 'batting', label: 'Batting' }, { id: 'pitching', label: 'Pitching' }, { id: 'statcast', label: 'Statcast' }, { id: 'advanced', label: 'Advanced' }]

function Board({ b, qualifiable, signedIn, name, group, ctx }: { b: Board; qualifiable: boolean; signedIn: boolean; name: string; group?: 'batting' | 'pitching'; ctx?: StatsCtx }) {
  return <LeaderboardTable group={group} ctx={ctx} seasons={Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => new Date().getFullYear() - i)} signedIn={signedIn} exportName={name} moreCols={b.moreCols} rows={b.rows} cols={b.cols} nLabel={b.n.label} nDigits={b.n.key === 'ip' ? 1 : 0} sortKey={b.sortKey} sortAsc={b.sortAsc} canFilter={qualifiable} minText={b.minText} />
}

export default async function MLBStatsPage({ searchParams }: { searchParams: Promise<{ tab?: string; season?: string; level?: string; type?: string }> }) {
  const sp = await searchParams
  const asked = sp.tab
  const tab = TABS.some(t => t.id === asked) ? (asked as string) : 'batting'
  const thisYear = new Date().getFullYear()
  const season = Number(sp.season) >= 1990 && Number(sp.season) <= thisYear ? Number(sp.season) : thisYear
  const sportId = LEVELS.some(l => l.id === Number(sp.level)) ? Number(sp.level) : 1
  const gameType = (GAME_TYPES.find(g => g.id === sp.type)?.id ?? 'R') as StatsCtx['gameType']
  const ctx: StatsCtx = { season, sportId, gameType }
  const mlbRegular = sportId === 1 && gameType === 'R'
  const name = `x9lab-${tab}-${season}-${sportId === 1 ? 'mlb' : 'milb' + sportId}-${gameType}`
  const isPro = await isProViewer()
  const signedIn = await isSignedIn()

  let body: React.ReactNode = null
  const only = (what: string) => <p style={{ fontSize: 15, color: '#57534E', margin: '14px 0' }}>{what} is MLB regular-season data only. Switch Level to MLB and Games to Regular season to see it. Selected: {ctxLabel(ctx)}.</p>
  if (tab === 'batting') { const b = await getBattingBoardFor(ctx); body = b.rows.length ? <Board b={b} qualifiable signedIn={signedIn} name={name} group="batting" ctx={ctx} /> : <p style={{ color: '#8a8275', margin: '14px 0' }}>No batting stats for {ctxLabel(ctx)}.</p> }
  else if (tab === 'pitching') { const b = await getPitchingBoardFor(ctx); body = b.rows.length ? <Board b={b} qualifiable signedIn={signedIn} name={name} group="pitching" ctx={ctx} /> : <p style={{ color: '#8a8275', margin: '14px 0' }}>No pitching stats for {ctxLabel(ctx)}.</p> }
  else if ((tab === 'statcast' || tab === 'advanced') && !mlbRegular) body = only(tab === 'statcast' ? 'Statcast' : 'Advanced stats')
  else if (tab === 'statcast') {
    const [bat, pit] = await Promise.all([getStatcastBatters(season), getStatcastPitchers(season)])
    body = (
      <>
        <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800 }}>Batters</h2><Board b={bat} qualifiable={false} signedIn={signedIn} name={`${name}-batters`} />
        <h2 style={{ margin: '32px 0 0', fontSize: 22, fontWeight: 800 }}>Pitchers</h2><Board b={pit} qualifiable={false} signedIn={signedIn} name={`${name}-pitchers`} />
        <p style={{ fontSize: 12, color: '#8a8275' }}>Baseball Savant expected stats and batted-ball data, {season} regular season, through the latest game stored.</p>
      </>
    )
  }

  else if (tab === 'advanced') {
    const [bat, pit] = await Promise.all([getAdvancedBatters(season), getAdvancedPitchers(season)])
    body = (
      <>
        <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800 }}>Batters</h2><Board b={bat} qualifiable signedIn={signedIn} name={`${name}-batters`} />
        <h2 style={{ margin: '32px 0 0', fontSize: 22, fontWeight: 800 }}>Pitchers</h2><Board b={pit} qualifiable signedIn={signedIn} name={`${name}-pitchers`} />
        <p style={{ fontSize: 12, color: '#8a8275' }}>Rates are worked out from the season totals above. Hover a number for its percentile among the players in the table.</p>
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
        <Suspense fallback={null}><StatsFilters seasons={Array.from({ length: thisYear - 1989 }, (_, i) => thisYear - i)} levels={LEVELS} types={GAME_TYPES} /></Suspense>
        <div style={{ marginTop: 12 }}>
          {body}
        </div>
      </div>
    </main>
  )
}
