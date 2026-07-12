// src/app/stats/page.tsx

import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import StatsExplorer from '@/components/stats/StatsExplorer'
import { getCurrentSubscriber } from '@/lib/auth'

export const metadata = { title: 'The Stats · The Edge' }

export default async function StatsPage() {
  // DEV-ONLY bypass — same pattern as /lab. Gated on NODE_ENV so it can't
  // accidentally run in production.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    return (
      <main className="min-h-screen bg-[#FAF8F3]">
        <SiteHeader />
        <StatsExplorer isPro={false} isSignedIn={true} />
      </main>
    )
  }

  const subscriber = await getCurrentSubscriber()
  if (!subscriber) redirect('/?error=signin_required')

  // isPro must never default to true — same rule as everywhere else in this
  // codebase, after the live isPro-leak bug. ?? false, not ?? true.
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      <StatsExplorer isPro={isPro} isSignedIn={true} />
    </main>
  )
}