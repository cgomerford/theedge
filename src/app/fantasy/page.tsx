// src/app/fantasy/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks } from '@/lib/fantasy'
import SiteHeader from '@/components/SiteHeader'
import FantasyDashboard from './FantasyDashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fantasy Desk · The Edge',
  description: 'The full Pro trading desk — streamers, movers, fallers, sleepers, platforms and two-start picks.',
}

export default async function FantasyPage() {
  const [subscriber, fantasyResult] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])

  // Not logged in → pricing
  if (!subscriber) redirect('/pricing')

  // Logged in but not Pro → pricing
  if (!subscriber.is_pro) redirect('/pricing')

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <FantasyDashboard
        picks={fantasyResult.picks}
        isStale={fantasyResult.isStale}
      />
    </main>
  )
}