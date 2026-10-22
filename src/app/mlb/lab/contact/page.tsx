// src/app/mlb/lab/contact/page.tsx
//
// The Contact Lab (replaces the Swing Decisions page; mockup "x9Lab Batting Lab: Nerve Centre"). One page: Contact Engine, Swing Changes, Three True
// Outcomes for a hitter chosen with ?hitter=<id>. SIGN-UP gate only (isSignedIn), no Pro. Reads precomputed rows only (contact profile, monthly swing,
// TTO); no Savant fetch in the render path. A static route, so it wins over /mlb/lab/[slug].

import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import ContactLab from '@/components/contact-lab/ContactLab'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getContactLeaders, getContactProfile } from '@/lib/contact-profile/data'
import { getSwingMonthly, getTtoLeaders, getTtoProfile } from '@/lib/nerve-centre/data'

export const metadata: Metadata = {
  title: 'Contact Lab · The Edge',
  description: 'How a hitter stands, swings, makes contact and what the plate appearance becomes: Pull AIR% against barrel rate, month-by-month swing changes, and strikeout-walk-homer mix, with the sample behind every number.',
}
export const dynamic = 'force-dynamic'

export default async function ContactLabPage({ searchParams }: { searchParams: Promise<{ hitter?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Contact Lab"
      blurb="Follow a hitter from how he stands to what the ball did, with the sample behind every number."
      features={['Contact Engine: Pull AIR% against barrel rate for every hitter with 100+ batted balls', 'Swing Changes: stance, bat speed and attack angle by month, beside the results', 'Three True Outcomes: the strikeout, walk and home-run mix, and how steady it is']}
    />
  }
  const { hitter } = await searchParams
  const leaders = await getContactLeaders()
  const wanted = Number(hitter)
  const byN = leaders ? [...leaders.rows].sort((a, b) => b.n - a.n) : []
  const selectedId = Number.isInteger(wanted) && wanted > 0 ? wanted : byN[0]?.id ?? 0
  const season = leaders?.season ?? new Date().getFullYear()

  const [contact, swing, ttoProfile, ttoLeaders] = leaders
    ? await Promise.all([getContactProfile(selectedId), getSwingMonthly(selectedId, season), getTtoProfile(selectedId, season), getTtoLeaders(season)])
    : [null, null, null, null]

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        {!leaders || leaders.rows.length === 0
          ? <Empty>Contact data isn’t built yet. It refreshes weekly from Baseball Savant.</Empty>
          : <ContactLab leaders={leaders} selectedId={selectedId} contact={contact} swing={swing?.mine ?? null} ttoProfile={ttoProfile} ttoLeaders={ttoLeaders} ttoSeason={season} />}
      </div>
    </main>
  )
}
