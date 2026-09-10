import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import NFLGamePage from './NFLGamePage'
import { getNFLGameBySlugEnhanced } from '@/lib/nfl-schedule'
import { computeEdgeModelV1 } from '@/lib/nfl/edge-model'
import { getQbZoneProfile, getQbZoneLeagueAverages, getGameQbIds } from '@/lib/nfl/queries'

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const game = await getNFLGameBySlugEnhanced(slug)
  if (!game) return { title: 'NFL Game · The Edge' }
  return {
    title: `${game.awayTeam.shortName} at ${game.homeTeam.shortName} · The Edge`,
    description: `NFL game analysis — ${game.awayTeam.name} at ${game.homeTeam.name}.`,
  }
}

export default async function NFLGamePageRoute({ params }: Props) {
  const { slug } = await params
  const game = await getNFLGameBySlugEnhanced(slug)
  if (!game) notFound()
// Inside NFLGamePageRoute, alongside the existing edgeModel fetch:
const qbIds = await getGameQbIds(game.season, game.week, game.homeTeam.abbreviation, game.awayTeam.abbreviation)

const [edgeModel, awayQbZone, homeQbZone, leagueZoneAvgs] = await Promise.all([
  computeEdgeModelV1(game.homeTeam.id, game.awayTeam.id),
  qbIds.awayQbId ? getQbZoneProfile(qbIds.awayQbId, game.season) : Promise.resolve(null),
  qbIds.homeQbId ? getQbZoneProfile(qbIds.homeQbId, game.season) : Promise.resolve(null),
  getQbZoneLeagueAverages(game.season),
])

return (
  <main className="min-h-screen bg-[#FAF8F3]">
    <SiteHeader variant="page" />
    <NFLGamePage game={game} edgeModel={edgeModel} awayQbZone={awayQbZone} homeQbZone={homeQbZone} leagueZoneAvgs={leagueZoneAvgs} />
  </main>
)}