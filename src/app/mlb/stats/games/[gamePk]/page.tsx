// src/app/mlb/stats/games/[gamePk]/page.tsx
//
// One game in full — a live game follows itself every 15 s; a finished game is the complete record.
// Public; the "when did this last happen" search inside is Pro (isPro comes from isProViewer(), never defaulted).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import GameExplorer from '@/components/games/GameExplorer'
import { getGameExplorer } from '@/lib/game-explorer'
import { isProViewer } from '@/lib/require-pro'

export const metadata = {
  title: 'Game · The Stats · x9Lab',
  description: 'Every pitch and plate appearance of an MLB game, with the last time something like it happened.',
}

export default async function GamePage({ params }: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await params
  const pk = Number(gamePk)
  if (!Number.isInteger(pk) || pk <= 0) notFound()
  const [game, isPro] = await Promise.all([getGameExplorer(pk), isProViewer()])
  if (!game) notFound()
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <div style={{ maxWidth: 1560, margin: '0 auto', padding: '18px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontSize: 13, color: '#8a8275', marginBottom: 10 }}>
          <Link href="/mlb/stats" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>The Stats</Link> <span aria-hidden>›</span>{' '}
          <Link href={`/mlb/stats/games?date=${game.date}`} style={{ color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>Games</Link> <span aria-hidden>›</span> {game.away.abbr} at {game.home.abbr}
        </nav>
        <GameExplorer initial={game} isPro={isPro} />
      </div>
    </main>
  )
}
