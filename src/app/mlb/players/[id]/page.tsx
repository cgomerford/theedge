// src/app/mlb/players/[id]/page.tsx
//
// Server component. Fetches identity + bio in one shot (single MLB API
// hydrate call), passes it to the client shell. Statcast, splits, game
// log all fetch client-side per-tab so the initial render isn't blocked
// by Savant CSVs.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPlayerPageData } from '@/lib/player-page'
import SiteHeader from '@/components/SiteHeader'
import PlayerPageClient from './PlayerPageClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  
  const data = await getPlayerPageData(Number(id))
  if (!data) return { title: 'Player · The Edge' }
  const { identity } = data
  const teamAbbr = identity.currentTeam?.abbr ?? ''
  return {
    title: `${identity.fullName} — ${teamAbbr} ${identity.primaryPosition.abbreviation} · The Edge`,
    description: `Full statistical profile for ${identity.fullName}: Statcast, splits, trends, and game log.`,
  }
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const playerId = Number(id)
  if (!playerId) notFound()

  const data = await getPlayerPageData(playerId)
  if (!data) notFound()

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <PlayerPageClient data={data} />
    </main>
  )
}