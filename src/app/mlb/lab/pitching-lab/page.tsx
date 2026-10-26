// src/app/mlb/lab/pitching-lab/page.tsx
//
// v1 of the standalone Pitching Lab: search any real pitcher and see the
// same real arsenal/movement/count-tendency/sequencing/hot-zone data the
// per-game Pitching Lab tab already renders — see PitchingLabExplorer.tsx
// + /api/mlb/pitching-lab. Tonight's games stay listed below as a quick
// jump into the live matchup view (GamePageShell's own Pitching Lab tab,
// built on PitchingSlotAsync.tsx) for anyone who wants that instead.

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { PitchingHome } from '@/components/labs/LabHome'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Pitching Lab',
  description:
    'Search any MLB pitcher for a full arsenal breakdown: count tendencies, sequencing, locations and hot zones, with the number of pitches behind every stat.',
  path: '/mlb/lab/pitching-lab',
})

export const revalidate = 1800

export default function PitchingLabPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Pitching Lab', path: '/mlb/lab/pitching-lab' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <PitchingHome />
    </main>
  )
}
