// src/app/mlb/lab/sequencing/page.tsx
//
// The league-wide Sequencing Lab: compare every pitcher's sequencing, open one pitcher (?pitcher=<id>&split=all|vs_lhb|vs_rhb), see the league. SIGN-UP gate only (no Pro),
// like the Contact Lab. Reads stored rows only (pitcher_pitch_sequencing, pitcher_count_tendency, pitcher_stats): no Savant fetch in the render path.
// A static route, so it wins over /mlb/lab/[slug].

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import SequencingLab from '@/components/sequencing-lab/SequencingLab'
import SeqSectionNav from '@/components/sequencing-lab/SeqSectionNav'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getKStructure } from '@/lib/k-structure/data'
import { getPitcherShape, getSeqBoard, getSeqDetail, getSeqEvents, MIN_SEQ, type SeqSplit } from '@/lib/sequencing-lab/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Sequencing Lab',
  description: 'Compare how every pitcher sequences: what he throws after each pitch, in each count and with two strikes, where he goes, and how that compares with the league, with the sample behind every number.',
  path: '/mlb/lab/sequencing',
})
export const dynamic = 'force-dynamic'

export default async function SequencingLabPage({ searchParams }: { searchParams: Promise<{ pitcher?: string; split?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Sequencing Lab"
      blurb="Compare how every pitcher sequences, and open any one of them, with the sample behind every number."
      preview={<ChartFramePreview title="What comes next" x="After this pitch" y="Next pitch" />}
      features={['Every pitcher in one table: repeats, fastball to slower, first-pitch and two-strike choices, against the league', 'One pitcher in full: a grid of what follows each pitch and what he throws in every count', 'Where he goes in each count, on Statcast\'s 13 zones']}
    />
  }
  const sp = await searchParams
  const id = Number(sp.pitcher)
  const split: SeqSplit = sp.split === 'vs_lhb' || sp.split === 'vs_rhb' ? sp.split : 'all'
  const season = new Date().getFullYear()
  const board = await getSeqBoard(season)
  const wanted = !!board && Number.isInteger(id) && id > 0
  const [detail, events, shape, kStructure] = wanted ? await Promise.all([getSeqDetail(id, season), getSeqEvents(id, season), getPitcherShape(id, season), getKStructure(id, season)]) : [null, [], {}, null]
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Sequencing Lab', path: '/mlb/lab/sequencing' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <SeqSectionNav />
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Sequencing Lab</div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>How every pitcher sequences</h1>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: '#5b5347', maxWidth: 760 }}>What comes after each pitch, what is thrown in each count and with two strikes, and where, for every pitcher against the league.</p>
        {!board ? <Empty>The sequencing tables are not loaded yet.</Empty> : <SequencingLab board={board} detail={detail} events={events} shape={shape} selectedId={detail ? id : null} split={split} minSeq={MIN_SEQ} season={season} kStructure={kStructure} />}
      </div>
    </main>
  )
}
