// src/app/lab/page.tsx

import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import PlayersDashboard from '@/components/PlayersDashboard'
import { getCurrentSubscriber } from '@/lib/auth'

export const metadata = { title: 'Dashboard - The Edge' }

export default async function LabPage() {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    return (
      <main className="min-h-screen bg-[#FAF8F3]">
        <SiteHeader />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
 
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-3">Dashboard.</h1>
          <p className="font-serif italic text-stone-500 mb-8 max-w-xl">
            Every stat we track, for any player, side by side. Free for everyone.
          </p>
          <PlayersDashboard />
        </div>
      </main>
    )
  }

  const subscriber = await getCurrentSubscriber()
  if (!subscriber) redirect('/?error=signin_required')

return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-3">Player cards.</h1>
        <p className="font-serif italic text-stone-500 mb-8 max-w-xl">
          Every stat we track, for any player, side by side. Free for everyone.
        </p>
        <PlayersDashboard />
      </div>
    </main>
  )
}