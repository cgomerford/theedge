// src/app/fantasy/page.tsx

import { redirect } from 'next/navigation'
import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks } from '@/lib/fantasy'
import { getFantasyNews } from '@/lib/fantasy-news'
import { getAllRecentTransactions, getAllActiveIL } from '@/lib/team-transactions'
import SiteHeader from '@/components/SiteHeader'
import FantasyDashboard from './FantasyDashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fantasy Desk · The Edge',
  description: 'The full Pro trading floor — news wire, injury report, transaction wire, streamers, sell/sit, sleepers, two-start picks, and platform scoring.',
}

export default async function FantasyPage() {
  const [subscriber, fantasyResult, news, ilList, transactions] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
    getFantasyNews(),
    getAllActiveIL(),
    getAllRecentTransactions(14),
  ])

  if (!subscriber) redirect('/pricing')
  if (!subscriber.is_pro) redirect('/pricing')
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <FantasyDashboard
        picks={fantasyResult.picks}
        isStale={fantasyResult.isStale}
        news={news}
        ilList={ilList}
        transactions={transactions}
      />
    </main>
  )
}