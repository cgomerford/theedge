// src/app/trading-floor/page.tsx
//
// The Trading Floor — Pro-only command-center view combining:
//   - The Board (today's slate, sortable by Edge Score)
//   - Regression Watch (surface vs underlying stat divergence)
//   - The Wire (news / IL / transactions)
//
// Zone Clash is intentionally NOT included yet — it's real new model work
// (the pitcher/batter zone-overlap calculation doesn't exist), and was
// explicitly cut from V1 scope in the master strategy doc. Ship the three
// panels that are proven reuse + working pipelines; add Zone Clash as a
// follow-up once that calculation is built.
//
// Gating pattern matches /fantasy/page.tsx exactly: hard redirect to
// /pricing for non-Pro, not the blurred ProGate teaser (per your call that
// this is Pro-only, not a free conversion hook).

import { redirect } from 'next/navigation'
import { getCurrentSubscriber } from '@/lib/auth'
import { getBoardSlate } from '@/lib/trading-floor-board'
import { getRegressionWatch } from '@/lib/regression-watch'
import { getFantasyNews } from '@/lib/fantasy-news'
import { getAllRecentTransactions, getAllActiveIL } from '@/lib/team-transactions'
import SiteHeader from '@/components/SiteHeader'
import TradingFloorBoard from '@/components/TradingFloorBoard'
import RegressionWatchPanel from '@/components/RegressionWatchPanel'
import TradingFloorWire from '@/components/TradingFloorWire'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trading Floor · The Edge',
  description: 'Pro command center — tonight\'s slate, regression watch, and the wire, all in one view.',
}

function todayUTC(): string {
  return new Date().toISOString().split('T')[0]
}

export default async function TradingFloorPage() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) redirect('/pricing')
  if (!subscriber.is_pro) redirect('/pricing')

  const today = todayUTC()

  const [board, regression, news, ilList, transactions] = await Promise.all([
    getBoardSlate(today),
    getRegressionWatch(today),
    getFantasyNews(),
    getAllActiveIL(),
    getAllRecentTransactions(14),
  ])

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />

      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            ⊕ Pro · Trading Floor
          </div>
          <h1 className="font-serif font-light text-4xl sm:text-6xl tracking-tight leading-none">
            Tonight's desk<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-sm sm:text-base max-w-2xl">
            Every game, every mover, every move — in one view.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          {/* Left column */}
          <div className="flex flex-col gap-4">
            <TradingFloorBoard games={board} />
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <RegressionWatchPanel data={regression} />
            <TradingFloorWire news={news} ilList={ilList} transactions={transactions} />
          </div>
        </div>
      </div>
    </main>
  )
}
