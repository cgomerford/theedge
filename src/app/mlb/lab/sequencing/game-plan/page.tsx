// src/app/mlb/lab/sequencing/game-plan/page.tsx
//
// Sequencing Lab → Game Plan Card index: the most recent day that has stored cards, one link per game and starter. Free sign-up. Reads game_plan_cards only.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import SeqSectionNav from '@/components/sequencing-lab/SeqSectionNav'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getLatestCards } from '@/lib/game-plan/data'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'Game Plan Card',
  description: 'How a probable starter has fared against each hitter in the opposing lineup: first pitch, opener, two strikes, damage zones and the second look.',
  path: '/mlb/lab/sequencing/game-plan',
})
export const dynamic = 'force-dynamic'

export default async function GamePlanIndex() {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Game Plan Card"
      blurb="One line per hitter for a probable starter, with the sample behind every figure."
      preview={<ChartFramePreview title="How to read tonight's battery" x="Hitter" y="Line" />}
      features={['First pitch, opener, two strikes, damage zones and the second look for every hitter', 'A wristband view you can download']}
    />
  }
  const { date, cards } = await getLatestCards()
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <SeqSectionNav />
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5b5347' }}>§ Sequencing Lab · Game Plan Card</div>
        <h1 style={{ margin: '6px 0 10px', fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 }}>How to read tonight&apos;s battery</h1>
        <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: 1.5, maxWidth: 760 }}>Choose a game and a starter. Each card has one line per hitter in the opposing lineup, built from what has happened this season.</p>
        {cards.length === 0 ? <Empty>No Game Plan Cards have been built yet.</Empty> : (
          <>
            <div style={{ fontSize: 13, color: '#5b5347', marginBottom: 10 }}>Cards for {date}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              {cards.map(c => (
                <Link key={`${c.gamePk}-${c.pitcherId}`} href={`/mlb/lab/sequencing/game-plan/${c.gamePk}?pitcher=${c.pitcherId}`} style={{ background: '#fff', border: '2px solid #1A1A1A', padding: 16, textDecoration: 'none', color: '#1A1A1A', display: 'block' }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{c.card.starter.name} · {c.card.starter.hand === 'R' ? 'RHP' : 'LHP'}</div>
                  <div style={{ fontSize: 13, color: '#5b5347', marginTop: 2 }}>against {c.card.batting.name}</div>
                  <div style={{ fontSize: 12, color: '#5b5347', marginTop: 6 }}>{c.card.meta.away.abbr} at {c.card.meta.home.abbr} · {c.card.lineup_source === 'posted' ? 'Posted lineup' : `Recent lineup vs ${c.card.starter.hand === 'R' ? 'RHP' : 'LHP'}`}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
