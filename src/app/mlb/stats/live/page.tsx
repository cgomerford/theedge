// src/app/mlb/stats/live/page.tsx
//
// Live situations — a sub page of The Stats. See the games in progress, copy a game's situation, and ask
// "when did this last happen?" by year, postseason / regular season, club and player.
// Pro-gated inside; isPro comes from isProViewer() (the same check the APIs use), never defaulted.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import LiveSituations from '@/components/stats/LiveSituations'
import { isProViewer } from '@/lib/require-pro'
import { getCurrentSubscriber } from '@/lib/auth'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'Live situations',
  description:
    'See what is happening in games right now and find the last time that situation happened, by year, postseason, club or player, with the sample shown.',
  path: '/mlb/stats/live',
})

export default async function LiveStatsPage() {
  const isPro = await isProViewer()
  const signedIn = !!(await getCurrentSubscriber())
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <div style={{ maxWidth: 1560, margin: '0 auto', padding: '18px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 13, color: '#8a8275', marginBottom: 6 }}>
          <Link href="/mlb/stats" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>The Stats</Link> <span aria-hidden>›</span> Live situations
        </nav>
        <h1 style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Live situations</h1>
        <p style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 15, color: '#5b5347', margin: '0 0 18px', maxWidth: 760 }}>
          See what is happening in games right now, then find the last time that exact situation came up.
        </p>
        <LiveSituations isPro={isPro} signedIn={signedIn} />
      </div>
    </main>
  )
}
