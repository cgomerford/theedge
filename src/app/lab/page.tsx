// src/app/lab/page.tsx

import { redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import LabDashboard from '@/components/LabDashboard'
import { getCurrentSubscriber } from '@/lib/auth'

export const metadata = { title: 'The Lab · The Edge' }

export default async function LabPage() {
  // DEV-ONLY bypass — lets you hit /lab locally without signing in.
  // Gated on NODE_ENV so this can't accidentally run in production.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    return (
      <main className="min-h-screen bg-[#FAF8F3]">
        <SiteHeader />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-[10px] font-mono uppercase tracking-widest text-red-600 mb-2">⚠ DEV_BYPASS_AUTH active</div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-3">Roll your own.</h1>
          <p className="font-serif italic text-stone-500 mb-8 max-w-xl">
            Pick a player or a team, pick a metric, pick a window. Same rolling-average logic the model runs under the hood.
          </p>
          <LabDashboard />
        </div>
      </main>
    )
  }

  const subscriber = await getCurrentSubscriber()
  if (!subscriber) redirect('/?error=signin_required')

  const isPro = subscriber.is_pro ?? false

  if (!isPro) {
    return (
      <main className="min-h-screen bg-[#FAF8F3]">
        <SiteHeader />
        <div className="max-w-xl mx-auto px-4 py-24 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-3">⊕ Pro feature</div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 mb-4">The Lab is a Pro feature.</h1>
          <p className="font-serif italic text-stone-500 mb-8">
            Roll your own ERA, OPS, FIP and more — any player, any team, any window. Pro unlocks it.
          </p>
          <Link
            href="/pricing"
            className="inline-block bg-[#FF5722] text-white px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-orange-600 transition"
          >
            Go Pro · £6/mo →
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">⊕ Pro · The Lab</div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-3">Roll your own.</h1>
        <p className="font-serif italic text-stone-500 mb-8 max-w-xl">
          Pick a player or a team, pick a metric, pick a window. Same rolling-average logic the model runs under the hood.
        </p>
        <LabDashboard />
      </div>
    </main>
  )
}