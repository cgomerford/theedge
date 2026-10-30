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
import PitchFinder from '@/components/pitch-shape/PitchFinder'
import PitchFinderV2 from '@/components/pitch-shape/PitchFinderV2'
import { Empty } from '@/components/team/ui'
import { isProViewer } from '@/lib/require-pro'
import { getCurrentSubscriber } from '@/lib/auth'
import Link from 'next/link'
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

// The redesign (PitchFinderV2 + the new sandbox) is the default; ?view=classic opens the previous page until it is retired.
const switchStyle = (on: boolean): React.CSSProperties => ({ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 4, border: `1px solid ${on ? '#1A1A1A' : '#e7e2d8'}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#FAF8F3' : '#1A1A1A', fontWeight: 700, fontSize: 14, textDecoration: 'none' })

export default async function ShapeSandboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'classic' ? 'classic' : 'new'
  const isPro = await isProViewer()
  const pitchTypes = await getAvailablePitchTypes()
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Pitch Shape Lab', path: '/mlb/lab/pitch-shape' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#B83A0E' }}>⊕ MLB · LAB · PITCH SHAPE LAB</div>
          <div role="group" aria-label="Choose a view" style={{ display: 'flex', gap: 6 }}>
            <Link href="/mlb/lab/pitch-shape" scroll={false} aria-current={view === 'new' ? 'page' : undefined} style={switchStyle(view === 'new')}>New view</Link>
            <Link href="/mlb/lab/pitch-shape?view=classic" scroll={false} aria-current={view === 'classic' ? 'page' : undefined} style={switchStyle(view === 'classic')}>Classic view</Link>
          </div>
        </div>
        {pitchTypes.length === 0
          ? <Empty>League shape data isn’t built yet. Check back after the next nightly refresh.</Empty>
          : view === 'new' ? (
            <>
              <PitchFinderV2 isPro={isPro} pitchTypes={pitchTypes} />
              <div style={{ margin: '44px 0 10px', borderTop: '1px solid #e7e2d8', paddingTop: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#B83A0E' }}><XMark /> 02 · DIAL IN A SHAPE</div>
                <h2 style={{ margin: '4px 0 6px', fontWeight: 800, fontSize: 'clamp(26px,4vw,38px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>What have pitches shaped like this produced?</h2>
                <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 760, margin: '0 0 14px', lineHeight: 1.5 }}>
                  Build a pitch, or load a real one, and see how the league’s pitches with the same shape have done. Change one thing and see what moves. The shaded part of each slider is where real pitches live.
                </p>
              </div>
              <SandboxClient isPro={isPro} pitchTypes={pitchTypes} variant="new" />
              <p style={{ fontSize: 13, margin: '22px 0 0' }}>
                Looking for one pitcher? <Link href="/mlb/lab/pitching-lab" style={{ color: '#B83A0E', fontWeight: 700 }}>Open the Pitching Lab</Link> and use its Shape tab.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(34px,5.6vw,52px)', letterSpacing: '-.02em', lineHeight: 1 }}>Pitch Shape Lab</h1>
              <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 760, margin: '0 0 18px', lineHeight: 1.5 }}>
                Where on the map are pitches most effective, and who throws one from there? Every pitch has a shape. Compare it with the league’s pitches shaped like it and you can see which spots work and whose results are ahead of, or behind, their shape. <b>A description of what happened, not a forecast.</b>
              </p>
              <p style={{ fontSize: 13, margin: '0 0 18px' }}>
                Looking for one pitcher? <Link href="/mlb/lab/pitching-lab" style={{ color: '#FF5722', fontWeight: 700 }}>Open the Pitching Lab</Link> and use its Shape tab.
              </p>
              <PitchFinder isPro={isPro} pitchTypes={pitchTypes} />
              <div style={{ margin: '40px 0 10px', borderTop: '1px solid #1A1A1A', paddingTop: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722' }}><XMark /> 02</div>
                <h2 style={{ margin: '2px 0 4px', fontWeight: 800, fontSize: 28, letterSpacing: '-.01em' }}>Dial in a shape</h2>
                <p style={{ color: '#5b5347', fontSize: 14, maxWidth: 720, margin: '0 0 14px' }}>
                  Set a velocity, ride, run and arm angle and see what pitches shaped like it have produced.
                </p>
              </div>
              <SandboxClient isPro={isPro} pitchTypes={pitchTypes} />
            </>
          )}
      </div>
    </main>
  )
}
