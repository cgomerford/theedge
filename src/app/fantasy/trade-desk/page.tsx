// src/app/fantasy/trade-desk/page.tsx
//
// Deliberately NOT a "trade value score" page — you don't have rest-of-season
// projections in the data model, and a fabricated composite score would
// violate the site's data-honesty pattern (no invented rankings/projections
// elsewhere, shouldn't start here). Built instead as a real Sell High / Buy Low
// board off riser/faller signals you already trust — useful, nothing made up.
//
// A true "mock trade builder" (pick 2+ players, compare rosters) is a
// separate, larger product decision — needs player search UI and a defined
// valuation methodology you sign off on. Flagged as a follow-up, not built here.

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipByMlbIds, getOwnershipByNames } from '@/lib/fantasy-ownership'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import TradeDeskBoard from './TradeDeskBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trade Desk · The Edge Fantasy Desk',
  description: 'Sell-high and buy-low candidates based on real trending signals — trade targets worth exploring.',
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

export default async function TradeDeskPage() {
  const [subscriber, { picks, forDate, isStale }] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])
  const isPro = subscriber?.is_pro ?? false

  // Sell high = riser (performing above baseline — highest perceived value right now)
  // Buy low = faller/cooler (performing below baseline — lowest perceived value right now)
  const sellHigh = picks.riser
  const buyLow = [...picks.faller, ...picks.cooler]
  const ownershipByPickId = await withOwnership([...sellHigh, ...buyLow])

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="trade-desk" isPro={isPro} />
      <TradeDeskBoard
        sellHigh={sellHigh}
        buyLow={buyLow}
        ownershipByPickId={ownershipByPickId}
        forDate={forDate}
        isStale={isStale}
      />
    </main>
  )
}
