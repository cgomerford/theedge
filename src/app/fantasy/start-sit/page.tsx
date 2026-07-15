// src/app/fantasy/start-sit/page.tsx

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipByMlbIds, getOwnershipByNames } from '@/lib/fantasy-ownership'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import StartSitBoard from './StartSitBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Start/Sit & Waiver Wire · The Edge Fantasy Desk',
  description: "Today's streamer starts and waiver-wire targets, with real ESPN ownership so you know what's actually available.",
}

async function withOwnership(picks: FantasyPick[]) {
  const mlbIds = picks.map(p => p.player_id).filter((id): id is number => id != null)
  const names = picks.filter(p => p.player_id == null).map(p => p.player_name)
  const [byId, byName] = await Promise.all([
    getOwnershipByMlbIds(mlbIds),
    getOwnershipByNames(names),
  ])
  const map: Record<number, number | null> = {}
  for (const p of picks) {
    map[p.id] = p.player_id
      ? byId.get(p.player_id)?.percent_owned ?? null
      : byName.get(p.player_name)?.percent_owned ?? null
  }
  return map
}

export default async function StartSitPage() {
  const [subscriber, { picks, forDate, isStale }] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const allPicks = [...picks.streamer, ...picks.sleeper]
  const ownershipByPickId = await withOwnership(allPicks)

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="start-sit" isPro={isPro} />
      <StartSitBoard
        streamers={picks.streamer}
        sleepers={picks.sleeper}
        ownershipByPickId={ownershipByPickId}
        forDate={forDate}
        isStale={isStale}
        isPro={isPro}
      />
    </main>
  )
}
