// src/app/mlb/stats/page.tsx
//
// The Stats hub: "Ask the Stats" (league-wide query lab) + the Player Explorer.
// Public page; Pro features are gated inside. isPro comes from isProViewer() —
// the same check the API uses — so the page and /api/stats/query always agree,
// and `next dev` unlocks Pro locally (cookie edge_force_locked=1 previews the
// locked state). It is never defaulted to true; on a deployed build it can
// only be true for a real Pro subscriber.

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import StatsHub from '@/components/stats/StatsHub'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'

export const metadata = {
  title: 'The Stats · x9Lab',
  description: 'Search any MLB stat by season, game type, inning, count and more — then chart it, compare years and export it.',
}

export default async function MLBStatsPage() {
  const [subscriber, isPro] = await Promise.all([getCurrentSubscriber(), isProViewer()])
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <StatsHub isPro={isPro} isSignedIn={!!subscriber} />
    </main>
  )
}
