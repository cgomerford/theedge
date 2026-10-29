// src/app/mlb/lab/sequencing/second-look/page.tsx
//
// Sequencing Lab → Second Look (/mlb/lab/sequencing/second-look?hand=&stand=&ended=&pitch=&scope=&id=). Free sign-up for the league scope; the pitcher and hitter scopes are Pro:
// for anyone else the server sends the lock and reads nothing for that scope. Reads stored rows only (second_look_summary, second_look_baseline, league_pa_pairs); no live counting.

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import SecondLook from '@/components/sequencing-lab/SecondLook'
import SeqSectionNav from '@/components/sequencing-lab/SeqSectionNav'
import { ProGateRow } from '@/components/pro/ProGateView'
import { isSignedIn } from '@/lib/require-signup'
import { getViewerTier } from '@/lib/require-pro'
import { getSecondLook, RESULT_CLASSES, type ResultClass, type Scope, type SlFilters } from '@/lib/second-look/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Second Look',
  description: 'What happened the next time a hitter saw the same pitcher in the same game: how the second at-bat opened and ended after a strikeout, walk, hit or out on a given pitch, with the sample behind every number.',
  path: '/mlb/lab/sequencing/second-look',
})
export const dynamic = 'force-dynamic'

type SP = { hand?: string; stand?: string; ended?: string; pitch?: string; opened?: string; scope?: string; id?: string }

export default async function SecondLookPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open Second Look"
      blurb="See what pitchers threw the next time a hitter came up against them in the same game, and how those at-bats ended."
      preview={<ChartFramePreview title="The next time he sees him" x="First pitch" y="Share" />}
      features={['How the second at-bat opened after a strikeout, walk, hit or out on a given pitch', 'How those at-bats ended, split by whether the pitcher went back to the same pitch', 'Recent real pairs, with the sample behind every number']}
    />
  }
  const sp = await searchParams
  const scope: Scope = sp.scope === 'pitcher' || sp.scope === 'batter' ? sp.scope : 'league'
  const idNum = Number(sp.id)
  const filters: SlFilters = {
    hand: sp.hand === 'L' ? 'L' : 'R', stand: sp.stand === 'R' ? 'R' : 'L',
    result: RESULT_CLASSES.includes(sp.ended as ResultClass) ? (sp.ended as ResultClass) : 'K',
    pitch: /^[A-Z]{2}$/.test(sp.pitch ?? '') ? (sp.pitch as string) : null,
    opened: scope === 'league' && /^[A-Z]{2}$/.test(sp.opened ?? '') ? (sp.opened as string) : null,
    scope, id: Number.isInteger(idNum) && idNum > 0 ? idNum : null,
  }
  const tier = await getViewerTier()
  const locked = scope !== 'league' && tier !== 'pro'
  const season = new Date().getFullYear()
  // For a locked viewer the pitcher and hitter scopes are not read at all: the league lines still show behind the lock for the filters, but the scope rows are never fetched.
  const data = await getSecondLook(locked ? { ...filters, scope: 'league', id: null } : filters, season)
  const nameOfScope = !locked && scope !== 'league' && filters.id ? data?.names[filters.id] ?? null : null
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Sequencing Lab', path: '/mlb/lab/sequencing' }, { name: 'Second Look', path: '/mlb/lab/sequencing/second-look' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <SeqSectionNav />
        <SecondLook
          filters={filters} data={data} season={season} nameOfScope={nameOfScope}
          lockedNode={locked ? (
            <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>The pitcher and hitter views are part of Pro</div>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#5b5347' }}>See how one pitcher, or one hitter, has fared on a second look. The league view is open to everyone with an account.</p>
              <ProGateRow tier={tier} source="second_look" lockedLine="Pitcher and hitter views are part of Pro." />
            </div>
          ) : filters.scope !== 'league' && !filters.id ? (
            <div style={{ background: '#fff', border: '1px dashed #cfc9ba', borderRadius: 14, padding: 20, fontSize: 15, color: '#5b5347' }}>Find {scope === 'pitcher' ? 'a pitcher' : 'a hitter'} above to see their second looks.</div>
          ) : null}
        />
      </div>
    </main>
  )
}
