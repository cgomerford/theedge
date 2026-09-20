// src/app/fantasy/page.tsx
//
// Fantasy Desk — trading floor. Extra fetches are best-effort: a
// two-start or MiLB miss must never blank the slate.

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipByMlbIds, getOwnershipByNames, getOwnershipTrend } from '@/lib/fantasy-ownership'
import { getTonightAllPitchers } from '@/lib/fantasy-ticker'
import { getTwoStartPitchers } from '@/lib/fantasy-two-start'
import { getMilbOpsLeaders } from '@/lib/fantasy-minors'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import FantasyHub from './Fantasyhub'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fantasy Desk · The Edge',
  description:
    "Who to start, sit, grab, and trade. Real ESPN roster rates, not vibes.",
}

async function settled<T>(p: Promise<T>, fallback: T): Promise<T> {
  const r = await Promise.allSettled([p])
  return r[0].status === 'fulfilled' ? r[0].value : fallback
}

export default async function FantasyPage() {
  const [subscriber, fantasyResult] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])

  const isPro = subscriber?.is_pro ?? false

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

  const [ownByMlbId, ownByName, ticker, twoStarts, ownTrend, aaaLeaders, aaLeaders] = await Promise.all([
    getOwnershipByMlbIds(mlbIds),
    getOwnershipByNames(namesNeedingLookup),
    settled(getTonightAllPitchers(), []),
    settled(getTwoStartPitchers(), []),
    settled(getOwnershipTrend({ daysAgo: 7, minDelta: 2, limit: 12 }), { risers: [], fallers: [] }),
    settled(getMilbOpsLeaders(11, 8), []),
    settled(getMilbOpsLeaders(12, 8), []),
  ])

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
        ticker={ticker}
        twoStarts={twoStarts.slice(0, 10)}
        ownRisers={ownTrend.risers}
        ownFallers={ownTrend.fallers}
        aaaLeaders={aaaLeaders}
        aaLeaders={aaLeaders}
      />
    </main>
  )
}
