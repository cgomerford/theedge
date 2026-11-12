// src/app/mlb/milb/[gamePk]/page.tsx
//
// A game below MLB (Triple-A down to Rookie, plus Fall/Winter league): score, line score, scoring plays and box score from the MLB Stats API. The MLB game page (/mlb/[slug])
// reads the MLB schedule plus Statcast and scout-report tables, none of which exist for these games, so they get their own page in the same look. An MLB gamePk here is sent on to
// its real page. Linked from "Latest game" on the player page and the labs.

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { getMilbGame } from '@/lib/milb-game'
import { MilbGameView } from '@/components/milb-game/MilbGameView'
import { slugifyGame } from '@/lib/mlb'
import { noindex } from '@/lib/seo'

type Props = { params: Promise<{ gamePk: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getMilbGame(Number((await params).gamePk))
  if (!g) return { title: 'Game not found', ...noindex() }
  return { title: `${g.away.name} at ${g.home.name}, ${g.date}`, ...noindex() }
}

export default async function MilbGamePage({ params }: Props) {
  const g = await getMilbGame(Number((await params).gamePk))
  if (!g) notFound()
  if (g.isMlb) redirect(`/mlb/${slugifyGame({ gamePk: g.gamePk, gameDate: g.date, officialDate: g.date, status: { detailedState: '', abstractGameState: '' }, teams: { away: { team: { id: g.away.id, name: g.away.name } }, home: { team: { id: g.home.id, name: g.home.name } } }, venue: { name: '' } })}`)
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '16px 32px 72px' }}>
        <MilbGameView g={g} />
      </div>
    </main>
  )
}
