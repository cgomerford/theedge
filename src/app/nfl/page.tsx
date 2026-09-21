// src/app/nfl/page.tsx
//
// NFL homepage, built to match the MLB homepage: site header → sub-nav → (player search, card ticker with a
// last / this / next-week bar, main column + news / articles sidebar). Free, no per-viewer content, so it is
// statically regenerated. The old leaders / standings page now lives at /nfl/league.
// Data comes from nflverse-backed tables; the only live fetch is the ESPN NFL headlines feed (15-minute cache).

import SiteHeader from '@/components/SiteHeader'
import NFLSubNav from '@/components/NFLSubNav'
import ArticlesTeaser from '@/components/ArticlesTeaser'
import NflHome from '@/components/nfl-edge/home/NflHome'
import { getSlate, getStandings, getTickerWeeks } from '@/lib/nfl-edge/slate'
import { getNflTeams } from '@/lib/nfl-edge/teams'
import { getLeagueForm } from '@/lib/nfl-edge/form'
import { buildTeamBoard, getCoverageDesk, getLeaders } from '@/lib/nfl-edge/league'
import { fetchNFLNews } from '@/lib/nfl/news'

export const metadata = {
  title: 'NFL · The Edge',
  description: "This week's NFL slate in plain English: who is playing, which factors lean where, league leaders, standings, team quality and the coverage desk.",
}

export const revalidate = 300

export default async function NflHomePage() {
  const [slate, weeks, standings, teams, news] = await Promise.all([getSlate(), getTickerWeeks(), getStandings(), getNflTeams(), fetchNFLNews(12).catch(() => [])])
  const season = slate?.season ?? new Date().getUTCFullYear()
  const [lf, leaders, coverage] = await Promise.all([getLeagueForm(season), getLeaders(season), getCoverageDesk(season)])
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <NFLSubNav />
      <NflHome
        slate={slate} weeks={weeks} standings={standings} leaders={leaders} board={buildTeamBoard(lf)} coverage={coverage} teams={teams}
        news={news.slice(0, 9).map(n => ({ id: String(n.id), headline: n.headline, link: n.articleUrl ?? '#', published: n.published }))}
        articlesTeaser={<ArticlesTeaser />}
      />
    </main>
  )
}
