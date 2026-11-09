// src/app/mlb/lab/pitch-shape/page.tsx
//
// Pitch Shape Lab landing = the Shape Sandbox (public). A static route, so it wins over the
// /mlb/lab/[slug] "coming soon" stub. Per-pitcher shape lives in the Pitching Lab's Shape tab. Free: four-seam + sweeper. Pro: every pitch type, outcome profile, slot
// context and compare. isPro comes from the real session; locked pitch types are refused by the API
// as well as dimmed in the UI.

import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import PitchFinderV2 from '@/components/pitch-shape/PitchFinderV2'
import LevelBar from '@/components/pitch-shape/LevelBar'
import { Empty } from '@/components/team/ui'
import { isProViewer } from '@/lib/require-pro'
import { getCurrentSubscriber } from '@/lib/auth'
import { getAvailablePitchTypes } from '@/lib/pitch-shape/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Pitch Shape Lab',
  description:
    'Find where pitches work on the shape map, who throws them, and see what pitches shaped like it have produced.',
  path: '/mlb/lab/pitch-shape',
})
export const dynamic = 'force-dynamic'

export default async function ShapeSandboxPage() {
  const isPro = await isProViewer()
  const pitchTypes = await getAvailablePitchTypes()
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Pitch Shape Lab', path: '/mlb/lab/pitch-shape' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1640, margin: '0 auto', padding: '22px 24px 100px' }}>
        {pitchTypes.length === 0
          ? <Empty>League shape data isn’t built yet. Check back after the next nightly refresh.</Empty>
          : (
            <>
              <LevelBar />
              <PitchFinderV2 isPro={isPro} pitchTypes={pitchTypes} />
            </>
          )}
      </div>
    </main>
  )
}
