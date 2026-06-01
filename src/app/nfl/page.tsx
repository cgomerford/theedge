import SiteHeader from '@/components/SiteHeader'
import {
  getNFLStandings,
  getNFLNews,
  getNFLTeams,
  getNFLKeyDates,
  getNFLStatLeadersWithFallback,
  STAT_CATEGORIES,
} from '@/lib/nfl'
import NFLHomepage from './NFLHomepage'

export const metadata = {
  title: 'NFL · The Edge',
  description: 'Division standings, stat leaders, and league news.',
}

export const revalidate = 3600

export default async function NFLPage() {
  // Fetch base data
  const standings = await getNFLStandings()
  const news = await getNFLNews()
  const teams = await getNFLTeams()
  const keyDates = getNFLKeyDates()

  // Fetch each stat category individually — no spread destructuring
  const passingyards   = await getNFLStatLeadersWithFallback('passingyards')
  const rushingyards   = await getNFLStatLeadersWithFallback('rushingyards')
  const receivingyards = await getNFLStatLeadersWithFallback('receivingyards')
  const touchdowns     = await getNFLStatLeadersWithFallback('touchdowns')
  const interceptions  = await getNFLStatLeadersWithFallback('interceptions')
  const sacks          = await getNFLStatLeadersWithFallback('sacks')

  const statLeaders = {
    passingyards,
    rushingyards,
    receivingyards,
    touchdowns,
    interceptions,
    sacks,
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <NFLHomepage
        standings={standings}
        statLeaders={statLeaders}
        news={news}
        teams={teams}
        keyDates={keyDates}
      />
    </main>
  )
}