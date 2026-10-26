// src/app/mlb/lab/platoon/page.tsx
//
// Platoon Lab, league view. SIGN-UP gate only (isSignedIn), no Pro. Reads precomputed rows (getPlatoonLeague, getContactLeaders for the hitter search); no Savant fetch in the render path.
// A static route, so it wins over /mlb/lab/[slug].

import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { TablePreview } from '@/components/pro/previews'
import PlatoonLeague from '@/components/platoon-lab/PlatoonLeague'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getPlatoonLeague } from '@/lib/platoon/data'
import { getContactLeaders } from '@/lib/contact-profile/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Platoon Lab',
  description:
    'Whose split against lefties and righties shows in the swing and whose only in the results: process gap against wOBA gap, with the sample behind each number.',
  path: '/mlb/lab/platoon',
})
export const dynamic = 'force-dynamic'

export default async function PlatoonLabPage() {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Platoon Lab"
      blurb="Is a hitter's split against left-handed vs right-handed pitching real, or sample size? Every number comes with its sample."
      preview={<TablePreview title="Platoon, league view" cols={['Hitter', 'Process gap', 'wOBA gap', 'Plate appearances (n)']} rows={['Hitter name']} />}
      features={['Process splits (bat speed, chase, contact point) beside results splits (K%, BB%, wOBA)', 'The sample behind every number, and what is not enough data yet', 'A league view of every hitter: process gap against wOBA gap']}
    />
  }
  const [league, leaders] = await Promise.all([getPlatoonLeague(), getContactLeaders()])
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Platoon Lab', path: '/mlb/lab/platoon' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 100px' }}>
        {!league || league.single.length === 0
          ? <Empty>Platoon data isn’t built yet.</Empty>
          : <PlatoonLeague league={league} picker={(leaders?.rows ?? []).map(r => ({ id: r.id, name: r.name, team: r.team, n: r.n }))} />}
      </div>
    </main>
  )
}
