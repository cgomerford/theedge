// src/app/mlb/lab/stuff/page.tsx
//
// x9Stuff Lab: the in-house pitch grades. Choose a pitcher with ?pitcher=<id>. SIGN-UP gate only (no Pro), like the Contact and Sequencing labs.
// Reads stored rows only (stuff_lab_* tables written by scripts/load_stuff_lab.py, pitch_shape_* and pitch_events): no Savant fetch in the render path.
// Until the grades are loaded the page shows an empty state. A static route, so it wins over /mlb/lab/[slug].

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import StuffLab from '@/components/stuff-lab/StuffLab'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getStuffBoard, getStuffDetail } from '@/lib/stuff-lab/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'x9Stuff Lab',
  description: 'How a team\'s analytics department grades a pitch before the results come in: Stuff, Command and Overall on a 100 scale, the arsenal, movement and how each pitch has ended, with the sample behind every number.',
  path: '/mlb/lab/stuff',
})
export const dynamic = 'force-dynamic'

export default async function StuffLabPage({ searchParams }: { searchParams: Promise<{ pitcher?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the x9Stuff Lab"
      blurb="See how a pitch is graded before the results come in, for every pitcher in the league, with the sample behind every number."
      preview={<ChartFramePreview title="Pitch grades" x="Stuff" y="Command" />}
      features={['Stuff, Command and Overall for every pitcher on a 100 scale', 'Every pitch in his arsenal: speed, break, spin and its grade', 'How each pitch has actually ended, and how it moves against the league']}
    />
  }
  const sp = await searchParams
  const season = new Date().getFullYear()
  const board = await getStuffBoard(season)
  const wanted = Number(sp.pitcher)
  const fallback = board ? [...board.pitchers].filter(p => p.pitches >= 500 && p.stuff != null).sort((a, b) => (b.stuff as number) - (a.stuff as number))[0] : undefined
  const selected = board ? board.pitchers.find(p => p.id === wanted) ?? fallback ?? null : null
  const detail = selected ? await getStuffDetail(selected.id, season) : null
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'x9Stuff Lab', path: '/mlb/lab/stuff' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>x9Stuff Lab</div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>How a pitch is graded</h1>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: '#5b5347', maxWidth: 760 }}>How a team&apos;s analytics department grades a pitch before the results come in. Every pitcher, every pitch, on a 100 scale where 100 is league average.</p>
        {!board ? <Empty>The pitch grades are not loaded yet.</Empty> : <StuffLab board={board} selected={selected} detail={detail} season={season} />}
      </div>
    </main>
  )
}
