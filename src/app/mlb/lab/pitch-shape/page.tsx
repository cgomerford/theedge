// src/app/mlb/lab/pitch-shape/page.tsx
//
// Pitch Shape Lab landing = the Shape Sandbox (public). A static route, so it wins over the
// /mlb/lab/[slug] "coming soon" stub. Per-pitcher shape lives in the Pitching Lab's Shape tab. Free: four-seam + sweeper. Pro: every pitch type, outcome profile, slot
// context and compare. isPro comes from the real session; locked pitch types are refused by the API
// as well as dimmed in the UI.

import XMark from '@/components/XMark'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SandboxClient from '@/components/pitch-shape/SandboxClient'
import PitchFinderV2 from '@/components/pitch-shape/PitchFinderV2'
import { Empty } from '@/components/team/ui'
import { isProViewer } from '@/lib/require-pro'
import { getCurrentSubscriber } from '@/lib/auth'
import { getAvailablePitchTypes } from '@/lib/pitch-shape/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Pitch Shape Lab',
  description:
    'Find where pitches work on the shape map, who throws them, and dial in any velocity, break and arm angle to see what pitches shaped like it have produced.',
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
              <PitchFinderV2 isPro={isPro} pitchTypes={pitchTypes} />
              <div id="dial-in" style={{ margin: '44px 0 10px', borderTop: '1px solid #e7e2d8', paddingTop: 14, scrollMarginTop: 70 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#B83A0E' }}><XMark /> 02 · DIAL IN A SHAPE</div>
                <h2 style={{ margin: '4px 0 6px', fontWeight: 800, fontSize: 'clamp(26px,4vw,38px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>What have pitches shaped like this produced?</h2>
                <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 760, margin: '0 0 14px', lineHeight: 1.5 }}>
                  Build a pitch, or load a real one, and see how the league’s pitches with the same shape have done. Change one thing and see what moves. The shaded part of each slider is where real pitches live.
                </p>
              </div>
              <SandboxClient isPro={isPro} pitchTypes={pitchTypes} />
            </>
          )}
      </div>
    </main>
  )
}
