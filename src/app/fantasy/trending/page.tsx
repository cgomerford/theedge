// src/app/fantasy/trending/page.tsx

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipByMlbIds, getOwnershipByNames, getOwnershipTrend } from '@/lib/fantasy-ownership'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import TrendingBoard from './TrendingBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trending · The Edge Fantasy Desk',
  description: 'Players heating up or cooling off, by model signal and by real week-over-week ESPN ownership movement.',
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

export default async function TrendingPage() {
  const [subscriber, { picks, forDate, isStale }, ownershipTrend] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
    getOwnershipTrend({ daysAgo: 7, minDelta: 2, limit: 15 }),
  ])
  const isPro = subscriber?.is_pro ?? false

  const modelUp = picks.riser
  const modelDown = [...picks.faller, ...picks.cooler]
  const ownershipByPickId = await withOwnership([...modelUp, ...modelDown])

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="trending" isPro={isPro} />
      <TrendingBoard
        modelUp={modelUp}
        modelDown={modelDown}
        ownershipByPickId={ownershipByPickId}
        ownershipTrend={ownershipTrend}
        forDate={forDate}
        isStale={isStale}
      />
    </main>
  )
}
