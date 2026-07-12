// src/app/stats/player/[id]/page.tsx
//
// Deliberately PUBLIC — this is the page every share-card tweet links to.
// Per the master strategy's own rule ("never send a cold visitor to the
// homepage, send them to a live game page that proves value in 5 seconds"),
// redirecting an unauthenticated visitor straight to sign-in here would
// defeat the entire point of the share feature: the tweet's click-through
// would hit a wall instead of showing the stat line. The read-only view is
// public; PlayerShareBuilder itself gates the interactive controls (window
// adjust, download, copy) behind sign-in.
//
// generateMetadata replaces what used to be a static `metadata` export —
// every player now gets a real title/description instead of the same
// generic "Player Stat Line" for all ~780 rostered players. Falls back to
// a generic description if the stats fetch fails; never blocks the page.

import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import PlayerShareBuilder from '@/components/stats/PlayerShareBuilder'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPlayerSeasonStats } from '@/lib/lab'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ subject?: string; name?: string; team?: string; pos?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const sp = await searchParams
  const subject: 'pitcher' | 'batter' = sp.subject === 'pitcher' ? 'pitcher' : 'batter'
  const name = sp.name ?? 'Player'
  const team = sp.team ?? ''
  const pos = sp.pos ?? ''

  let description = `${name} stats and season trend, game by game, on The Edge.`
  try {
    const stats = await getPlayerSeasonStats(subject, Number(id), new Date().getFullYear())
    const lookup = Object.fromEntries(stats.map(s => [s.key, s.value]))
    if (subject === 'batter' && lookup.avg && lookup.avg !== '—') {
      description = `${name}${team ? ` (${team})` : ''} — ${lookup.avg}/${lookup.obp}/${lookup.slg}, ${lookup.homeRuns} HR, ${lookup.rbi} RBI. Full season progression, game by game, on The Edge.`
    } else if (subject === 'pitcher' && lookup.era && lookup.era !== '—') {
      description = `${name}${team ? ` (${team})` : ''} — ${lookup.era} ERA, ${lookup.whip} WHIP, ${lookup.strikeOuts} K. Full season progression, game by game, on The Edge.`
    }
  } catch {
    // Falls back to the generic description above — a stats-fetch hiccup
    // shouldn't block the page or leave metadata blank.
  }

  const title = `${name}${pos ? ` (${pos})` : ''} Stats & Season Trend · The Edge`
  const canonical = `https://edgereportdaily.com/stats/player/${id}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PlayerSharePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const subscriber = await getCurrentSubscriber()

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      <PlayerShareBuilder
        playerId={Number(id)}
        subject={sp.subject === 'pitcher' ? 'pitcher' : 'batter'}
        name={sp.name ?? 'Player'}
        team={sp.team ?? '—'}
        pos={sp.pos ?? '—'}
        isSignedIn={!!subscriber}
      />
    </main>
  )
}