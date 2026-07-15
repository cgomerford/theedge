// src/app/fantasy/yesterday/page.tsx

import { getCurrentSubscriber } from '@/lib/auth'
import { getYesterdaysSignals } from '@/lib/fantasy-yesterday'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import YesterdayBoard from './YesterdayBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "Last Night's Numbers · The Edge Fantasy Desk",
  description: 'Strikeout leaders, hardest-hit balls, and extra-base-hit leaders from last night\'s slate.',
}

export default async function YesterdayPage() {
  const [subscriber, signals] = await Promise.all([
    getCurrentSubscriber(),
    getYesterdaysSignals(),
  ])
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="yesterday" isPro={isPro} />
      <YesterdayBoard signals={signals} />
    </main>
  )
}
