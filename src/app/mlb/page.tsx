// src/app/mlb/page.tsx
//
// /mlb: the daily MLB dashboard. Top to bottom: follows row (signed in, client island) → state line + today's games as cockpit cards →
// postseason bracket / division standings → leaders → hot this week → news → player lookup. Server output is identical for every
// visitor and cached 5 minutes (no cookies are read here); live scores come from /api/mlb/live inside the games island.
import { getOffseasonCalendar } from '@/lib/mlb-offseason'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import HomeAskOrFollows from '@/components/home/HomeAskOrFollows'
import GamesDashboard from '@/components/mlb-home/GamesDashboard'
import BracketOrStandings from '@/components/mlb-home/BracketOrStandings'
import { Leaders, HotThisMonth } from '@/components/mlb-home/LeadersAndHot'
import { LabsSearch } from '@/components/mlb-home/NewsAndSearch'
import HomeRail from '@/components/home/HomeRail'
import { PostseasonLeadersRail, StatOfTheDayRail } from '@/components/mlb-home/RailExtras'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { pageMeta } from '@/lib/seo'
import { getMLBStatLeaders } from '@/lib/mlb-homepage'
import { getHomeSlate } from '@/lib/mlb-homepage'
import {
  etDate, getSeasonState, getDashboardGames, getPostseasonBracket, getStandingsDash, getHotThisMonth, getPostseasonLeaders, getStatOfTheDay, MONTH_LABEL,
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
  const [hitters, pitchers, postLeaders, statOfDay] = await Promise.all([
    season.state === 'offseason' ? Promise.resolve([]) : getHotThisMonth('hitting', post, date),
    season.state === 'offseason' ? Promise.resolve([]) : getHotThisMonth('pitching', post, date),
    season.state === 'postseason' || season.state === 'offseason' ? getPostseasonLeaders(season.year - (season.state === 'offseason' && Number(date.slice(5, 7)) <= 2 ? 1 : 0)) : Promise.resolve([]),
    getStatOfTheDay(date),
  ])
  const [hr, avg, so] = await Promise.all([
    getMLBStatLeaders('homeRuns', 10, 'batting'),
    getMLBStatLeaders('battingAverage', 10, 'batting'),
    getMLBStatLeaders('strikeOuts', 10, 'pitching'),
  ])
  // No games today in a live season: the next one for the state line.
  const slate = games.length === 0 && season.state !== 'offseason' ? await getHomeSlate() : null
  const next = slate && slate.game && slate.mode !== 'last'   // 'last' is the most recent FINAL game, never a game still to come
    ? { label: `${slate.game.teams.away.team.name} at ${slate.game.teams.home.team.name}`, startUtc: slate.game.gameDate, venue: slate.game.venue?.name ?? '' }
    : null
  const calendar = season.state === 'offseason' || season.state === 'preseason' ? await getOffseasonCalendar(season) : []
  const playing = new Set(games.flatMap(g => [g.away.id, g.home.id]))

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <style>{`.ml-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0 40px;align-items:start}.ml-rail{padding-top:20px}@media (max-width:1100px){.ml-layout{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '8px 16px 60px' }}>
       <div className="ml-layout">
        <div style={{ minWidth: 0 }}>
        <HomeAskOrFollows>{null}</HomeAskOrFollows>
        <div id="scout-reports" style={{ scrollMarginTop: 16 }}><GamesDashboard season={season} date={date} games={games} tightest={post ? null : tightestRace(divisions, playing)} next={next} calendar={calendar} /></div>
        <BracketOrStandings season={season} bracket={bracket} divisions={divisions} />
        <Leaders season={season} groups={[{ label: 'HOME RUNS', rows: hr }, { label: 'BATTING AVERAGE', rows: avg }, { label: 'STRIKEOUTS', rows: so }]} />
        {season.state !== 'offseason' && <HotThisMonth hitters={hitters} pitchers={pitchers} week={MONTH_LABEL(date)} post={post} />}
        <LabsSearch />
        </div>
        <div className="ml-rail">
          <HomeRail top={<><PostseasonLeadersRail groups={postLeaders} year={season.year} /><StatOfTheDayRail stat={statOfDay} /></>} />
        </div>
       </div>
      </div>
    </main>
  )
}
