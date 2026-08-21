import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import NFLGamePage from './NFLGamePage'
import { getNFLGameBySlugEnhanced } from '@/lib/nfl-schedule'
import { computeEdgeModelV1 } from '@/lib/nfl/edge-model'
import { getSeasonQBRoom } from '@/lib/nfl/qb-room-season'


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
const [edgeModel, awaySeasonQB, homeSeasonQB] = await Promise.all([
  computeEdgeModelV1(game.homeTeam.id, game.awayTeam.id),
  getSeasonQBRoom(game.awayTeam.id, game.season),
  getSeasonQBRoom(game.homeTeam.id, game.season),
])

return (
  <main className="min-h-screen bg-[#FAF8F3]">
    <SiteHeader variant="page" />
    <NFLGamePage game={game} edgeModel={edgeModel} awaySeasonQB={awaySeasonQB} homeSeasonQB={homeSeasonQB} />
  </main>
)}
