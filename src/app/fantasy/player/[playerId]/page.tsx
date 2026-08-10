// src/app/fantasy/player/[playerId]/page.tsx
//
// The Player Deep-Dive page. Every fantasy board (Cooling Off, Heating Up,
// Waiver Targets, Prospects, Sell/Buy Low) routes into this. One canonical
// place to answer "what's going on with this guy" — trend chart, radar,
// splits, plate discipline, and a plain-English "why".

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPlayerSignalContext } from '@/lib/fantasy-player'
import { buildPlayerNarrative } from '@/lib/fantasy-narrative'
import { getOwnershipByMlbIds, getOwnershipTrend } from '@/lib/fantasy-ownership'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import PlayerDeepDive from './PlayerDeepDive'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const ctx = await getPlayerSignalContext(Number(playerId))
  if (!ctx) return { title: 'Player · The Edge Fantasy Desk' }
  return {
    title: `${ctx.meta.fullName} · The Edge Fantasy Desk`,
    description: `Recent form, Statcast signals, and the read on ${ctx.meta.fullName}.`,
  }
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const [{ playerId: rawId }, { from }] = await Promise.all([params, searchParams])
  const playerId = Number(rawId)
  if (!Number.isFinite(playerId)) notFound()

  const ctx = await getPlayerSignalContext(playerId)
  if (!ctx) notFound()

  const narrative = buildPlayerNarrative(ctx)

  const [ownershipMap, ownershipTrend] = await Promise.all([
    getOwnershipByMlbIds([playerId]),
    getOwnershipTrend({ daysAgo: 7, minDelta: 0, limit: 200 }),
  ])
  const ownership = ownershipMap.get(playerId)
  // Ownership trend query returns all significant movers — we filter to
  // this specific player. If ownership history is thin, this is null and
  // the UI degrades to just showing current %.
  const ownershipMove =
    ownershipTrend.risers.find(r => r.mlb_player_id === playerId)
    ?? ownershipTrend.fallers.find(f => f.mlb_player_id === playerId)
    ?? null

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active={fromToNav(from)} isPro={true} />

      {/* Back link — keeps the user oriented when they've deep-linked in
          from a specific board vs. a bookmark. */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-6">
        <BackLink from={from} />
      </div>

      <PlayerDeepDive
        ctx={ctx}
        narrative={narrative}
        ownership={ownership?.percent_owned ?? null}
        ownershipMove={ownershipMove}
      />
    </main>
  )
}

function fromToNav(from: string | undefined):
  'trending' | 'prospects' | 'start-sit' | 'trade-desk' | 'yesterday' | undefined {
  switch (from) {
    case 'trending':
    case 'prospects':
    case 'start-sit':
    case 'trade-desk':
    case 'yesterday':
      return from
    default:
      return undefined
  }
}

function BackLink({ from }: { from: string | undefined }) {
  const links: Record<string, { href: string; label: string }> = {
    trending: { href: '/fantasy/trending', label: '← Back to Trending' },
    prospects: { href: '/fantasy/prospects', label: '← Back to Prospect Watch' },
    'start-sit': { href: '/fantasy/start-sit', label: '← Back to Start/Sit' },
    'trade-desk': { href: '/fantasy/trade-desk', label: '← Back to Trade Desk' },
    yesterday: { href: '/fantasy/yesterday', label: '← Back to Last Night' },
  }
  const { href, label } = links[from ?? ''] ?? { href: '/fantasy', label: '← Back to Fantasy Desk' }
  return (
    <Link
      href={href}
      className="font-mono text-[10px] uppercase tracking-widest text-stone-400 hover:text-[#FF5722] transition"
    >
      {label}
    </Link>
  )
}
