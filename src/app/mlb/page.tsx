// src/app/mlb/page.tsx
//
// /mlb: the daily MLB dashboard. Top to bottom: follows row (signed in, client island) → state line + today's games as cockpit cards →
// postseason bracket / division standings → leaders → hot this week → news → player lookup. Server output is identical for every
// visitor and cached 5 minutes (no cookies are read here); live scores come from /api/mlb/live inside the games island.
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import HomeAskOrFollows from '@/components/home/HomeAskOrFollows'
import GamesDashboard from '@/components/mlb-home/GamesDashboard'
import BracketOrStandings from '@/components/mlb-home/BracketOrStandings'
import { Leaders, HotThisWeek } from '@/components/mlb-home/LeadersAndHot'
import { News, LabsSearch } from '@/components/mlb-home/NewsAndSearch'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { pageMeta } from '@/lib/seo'
import { getMLBNewsMultiSource, getMLBStatLeaders } from '@/lib/mlb-homepage'
import { getLatestArticles } from '@/lib/articles'
import { getHomeSlate } from '@/lib/mlb-homepage'
import {
  etDate, getSeasonState, getDashboardGames, getPostseasonBracket, getStandingsDash, getHotThisWeek, WEEK_LABEL,
  type DashDivision,
} from '@/lib/mlb-home-dashboard'

export const metadata = pageMeta({
  title: 'MLB games, standings and leaders',
  description: "Today's MLB games with both starting pitchers, the postseason bracket or division standings, leaders and the hottest players this week, in plain numbers with the sample size shown.",
  path: '/mlb',
})

export const revalidate = 300

function tightestRace(divs: DashDivision[], playingIds: Set<number>): string | null {
  let best: { text: string; gap: number } | null = null
  for (const d of divs) {
    const sorted = [...d.teams].sort((a, b) => a.divRank - b.divRank)
    const [lead, second] = sorted
    if (!lead || !second) continue
    const gap = Number(second.gb)
    if (!Number.isFinite(gap) || gap > 3) continue
    if (!playingIds.has(lead.id) && !playingIds.has(second.id)) continue
    const both = playingIds.has(lead.id) && playingIds.has(second.id)
    const text = `${d.name}: ${lead.name} lead the ${second.name} by ${gap} game${gap === 1 ? '' : 's'}${both ? ' and play them tonight' : ''}`
    if (!best || gap < best.gap) best = { text, gap }
  }
  return best?.text ?? null
}

export default async function MLBPage() {
  const date = etDate()
  const season = await getSeasonState(date)
  const post = season.state === 'postseason'
  const showBracket = post || season.state === 'offseason' || season.state === 'preseason'

  // Separate Promise.all blocks so adding a fetch never shifts the positional destructuring (CLAUDE.md).
  const [games, divisions, bracket] = await Promise.all([
    season.state === 'offseason' ? Promise.resolve([]) : getDashboardGames(date, post),
    getStandingsDash(date),
    showBracket ? getPostseasonBracket(season.year - (season.state === 'offseason' && Number(date.slice(5, 7)) <= 2 ? 1 : 0)) : Promise.resolve([]),
  ])
  const [hitters, pitchers, news, articles] = await Promise.all([
    season.state === 'offseason' ? Promise.resolve([]) : getHotThisWeek('hitting', post, date),
    season.state === 'offseason' ? Promise.resolve([]) : getHotThisWeek('pitching', post, date),
    getMLBNewsMultiSource(),
    getLatestArticles(6),
  ])
  const [hr, avg, so] = await Promise.all([
    getMLBStatLeaders('homeRuns', 5, 'batting'),
    getMLBStatLeaders('battingAverage', 5, 'batting'),
    getMLBStatLeaders('strikeOuts', 5, 'pitching'),
  ])
  // No games today in a live season: the next one for the state line.
  const slate = games.length === 0 && season.state !== 'offseason' ? await getHomeSlate() : null
  const next = slate && slate.game
    ? { label: `${slate.game.teams.away.team.name} at ${slate.game.teams.home.team.name}`, startUtc: slate.game.gameDate, venue: slate.game.venue?.name ?? '' }
    : null
  const playing = new Set(games.flatMap(g => [g.away.id, g.home.id]))

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '8px 24px 60px' }}>
        <HomeAskOrFollows>{null}</HomeAskOrFollows>
        <GamesDashboard season={season} date={date} games={games} tightest={post ? null : tightestRace(divisions, playing)} next={next} />
        <BracketOrStandings season={season} bracket={bracket} divisions={divisions} />
        <Leaders season={season} groups={[{ label: 'HOME RUNS', rows: hr }, { label: 'BATTING AVERAGE', rows: avg }, { label: 'STRIKEOUTS', rows: so }]} />
        {season.state !== 'offseason' && <HotThisWeek hitters={hitters} pitchers={pitchers} week={WEEK_LABEL(date)} post={post} />}
        <News news={news} articles={articles.map(a => ({ slug: a.slug, title: a.title, published_at: (a as unknown as { published_at?: string | null }).published_at ?? null }))} />
        <LabsSearch />
      </div>
    </main>
  )
}
