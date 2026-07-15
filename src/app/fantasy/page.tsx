// src/app/fantasy/page.tsx
//
// Fantasy Hub — entry point. Server component. Fetches:
//   1. Subscriber (for Pro gating)
//   2. Fantasy picks (daily_fantasy_picks)
//   3. Ownership lookup for every pick (fantasy_ownership)
//
// Ownership is best-effort: unmatched picks render as "—", never fake data.

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipByMlbIds, getOwnershipByNames } from '@/lib/fantasy-ownership'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import FantasyHub from './FantasyHub'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fantasy Desk · The Edge',
  description:
    "Start/sit calls, waiver targets, trending players, prospect watch, and trade value — derived from The Edge's own model, cross-referenced with real ESPN ownership.",
}

export default async function FantasyPage() {
  const [subscriber, fantasyResult] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])

  const isPro = subscriber?.is_pro ?? false

  // Flatten all picks and gather lookup keys
  const allPicks: FantasyPick[] = [
    ...fantasyResult.picks.streamer,
    ...fantasyResult.picks.sleeper,
    ...fantasyResult.picks.mover,
    ...fantasyResult.picks.faller,
    ...fantasyResult.picks.cooler,
    ...fantasyResult.picks.riser,
    ...fantasyResult.picks.prospect,
  ]

  const mlbIds = allPicks
    .map(p => p.player_id)
    .filter((id): id is number => id != null)

  const namesNeedingLookup = allPicks
    .filter(p => p.player_id == null)
    .map(p => p.player_name)

  const [ownByMlbId, ownByName] = await Promise.all([
    getOwnershipByMlbIds(mlbIds),
    getOwnershipByNames(namesNeedingLookup),
  ])

  // Flat lookup keyed by pick.id → percent (null if no match)
  const ownershipByPickId: Record<number, number | null> = {}
  for (const p of allPicks) {
    let pct: number | null = null
    if (p.player_id) {
      pct = ownByMlbId.get(p.player_id)?.percent_owned ?? null
    } else {
      pct = ownByName.get(p.player_name)?.percent_owned ?? null
    }
    ownershipByPickId[p.id] = pct
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="home" isPro={isPro} />
      <FantasyHub
        picks={fantasyResult.picks}
        ownershipByPickId={ownershipByPickId}
        forDate={fantasyResult.forDate}
        isStale={fantasyResult.isStale}
        isPro={isPro}
      />
    </main>
  )
}