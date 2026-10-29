// src/app/mlb/lab/sequencing/game-plan/[gamePk]/page.tsx
//
// Sequencing Lab → Game Plan Card for one game (?pitcher=<id> chooses between the two probable starters). Free sign-up. Reads the stored card only (game_plan_cards).
// A game with no stored card shows that it has not been built yet; nothing is estimated.

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import GamePlanCard from '@/components/sequencing-lab/GamePlanCard'
import SeqSectionNav from '@/components/sequencing-lab/SeqSectionNav'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getCardsForGame } from '@/lib/game-plan/data'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'Game Plan Card',
  description: 'One line per hitter for a probable starter: first pitch, opener, two strikes, damage zones and the second time through, with the sample behind every figure.',
  path: '/mlb/lab/sequencing/game-plan',
})
export const dynamic = 'force-dynamic'

export default async function GamePlanPage({ params, searchParams }: { params: Promise<{ gamePk: string }>; searchParams: Promise<{ pitcher?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Game Plan Card"
      blurb="One line per hitter for tonight's starter: first pitch, opener, two strikes, damage zones and the second time through."
      preview={<ChartFramePreview title="How to read tonight's lineup" x="Hitter" y="Line" />}
      features={['First-pitch swing rate, opener, two-strike pitch and damage zones for every hitter', 'The second time through: what the pitcher opened with the next time a hitter faced him', 'A wristband view you can download']}
    />
  }
  const { gamePk } = await params
  const sp = await searchParams
  const pk = Number(gamePk)
  const cards = Number.isInteger(pk) && pk > 0 ? await getCardsForGame(pk) : []
  const pick = cards.find(c => String(c.pitcherId) === sp.pitcher) ?? cards[0]
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <SeqSectionNav />
        {!pick ? (
          <Empty>The Game Plan Card for this game has not been built yet. Cards are built from the named probable starters; check back once both are announced.</Empty>
        ) : (
          <GamePlanCard card={pick.card} others={cards.map(c => ({ pitcherId: c.pitcherId, name: c.card.starter.name, active: c.pitcherId === pick.pitcherId, href: `/mlb/lab/sequencing/game-plan/${pk}?pitcher=${c.pitcherId}` }))} />
        )}
      </div>
    </main>
  )
}
