// src/app/nfl/[slug]/page.tsx

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import NFLGamePage from './NFLGamePage'
import { getNFLGameBySlugEnhanced } from '@/lib/nfl-schedule'
import { getNFLGamePageData } from '@/lib/nfl-game'

type Props = {
  params: Promise<{ slug: string }>
}

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
  const [game, pageData] = await Promise.all([
    getNFLGameBySlugEnhanced(slug),
    getNFLGamePageData(slug),
  ])

  if (!game) notFound()

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <NFLGamePage
        game={game!}
        dbGame={pageData.dbGame}
        homeStats={pageData.homeStats}
        awayStats={pageData.awayStats}
        edgeScore={pageData.edgeScore}
        narrative={pageData.narrative}
      />
    </main>
  )
}