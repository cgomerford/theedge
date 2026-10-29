// src/app/mlb/lab/sequencing/game-plan/page.tsx
//
// Sequencing Lab → Game Plan Card index: the most recent day that has stored cards, one link per game and starter. Free sign-up. Reads game_plan_cards only.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import SeqSectionNav from '@/components/sequencing-lab/SeqSectionNav'
import { PageHead } from '@/components/sequencing-lab/ui'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { getCardDates, getLatestCards } from '@/lib/game-plan/data'
import { getCurrentSubscriber } from '@/lib/auth'
import { etDate } from '@/lib/mlb-home-dashboard'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'Game Plan Card',
  description: 'How a probable starter has fared against each hitter in the opposing lineup: first pitch, opener, two strikes, damage zones and the second look.',
  path: '/mlb/lab/sequencing/game-plan',
})
export const dynamic = 'force-dynamic'

const SEASON_START = '2026-03-25'
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default async function GamePlanIndex({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Game Plan Card"
      blurb="One line per hitter for a probable starter, with the sample behind every figure."
      preview={<ChartFramePreview title="How to read tonight's battery" x="Hitter" y="Line" />}
      features={['First pitch, opener, two strikes, damage zones and the second look for every hitter', 'A wristband view you can download']}
    />
  }
  const sp = await searchParams
  const today = etDate()
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : null
  const picked = asked && asked >= SEASON_START && asked <= today ? asked : null
  const [{ date, cards }, dates] = await Promise.all([getLatestCards(picked ?? undefined), getCardDates()])
  const shown = picked ?? date
  const isAdmin = (await getCurrentSubscriber())?.role === 'admin'
  const past = !!shown && shown < today
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <SeqSectionNav />
        <PageHead kicker="Sequencing Lab · Game Plan Card" title="How to read tonight's battery" intro="Choose a game and a starter. Each card has one line per hitter in the opposing lineup, built from what has happened this season. Choose any date to open a back-dated card, built from only what was known before that day." />
        <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end', margin: '0 0 14px' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: '#a89e8c', textTransform: 'uppercase' }}>Date
            <input type="date" name="date" min={SEASON_START} max={today} defaultValue={shown ?? today} style={{ font: 'inherit', fontSize: 14, fontWeight: 700, color: '#1A1A1A', border: '1px solid #e7e2d8', borderRadius: 8, padding: '7px 10px', background: '#fff' }} />
          </label>
          <button type="submit" style={{ font: 'inherit', fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '8px 16px', border: '1px solid #FF5722', background: '#fff1ea', color: '#FF5722', cursor: 'pointer' }}>Show this date</button>
          {shown && <>
            <Link href={`/mlb/lab/sequencing/game-plan?date=${addDays(shown, -1)}`} style={{ fontSize: 13, fontWeight: 800, padding: '8px 12px', borderRadius: 999, border: '1px solid #e7e2d8', background: '#fff', color: '#1A1A1A', textDecoration: 'none' }}>← Day before</Link>
            {addDays(shown, 1) <= today && <Link href={`/mlb/lab/sequencing/game-plan?date=${addDays(shown, 1)}`} style={{ fontSize: 13, fontWeight: 800, padding: '8px 12px', borderRadius: 999, border: '1px solid #e7e2d8', background: '#fff', color: '#1A1A1A', textDecoration: 'none' }}>Day after →</Link>}
          </>}
        </form>
        {dates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 16px' }} aria-label="Dates with cards">
            <span style={{ fontSize: 12, fontWeight: 800, color: '#8a8275', alignSelf: 'center', marginRight: 4 }}>Dates with cards</span>
            {dates.slice(0, 14).map(d => <Link key={d.date} href={`/mlb/lab/sequencing/game-plan?date=${d.date}`} style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 999, border: `1px solid ${d.date === shown ? '#FF5722' : '#e7e2d8'}`, background: d.date === shown ? '#fff1ea' : '#fff', color: d.date === shown ? '#FF5722' : '#1A1A1A', textDecoration: 'none' }}>{label(d.date).replace(/ \d{4}$/, '')} · {d.n}</Link>)}
          </div>
        )}
        {past && <p style={{ margin: '0 0 14px', fontSize: 13, color: '#5b5347', maxWidth: 760 }}><b>Back-dated:</b> a card for a day that has already been played is built from the pitches before that day only. Later games, the end-of-season Stuff grade and the hitter groups are not used, so it shows what could have been known then. After the game, the third tab sets the card against what was thrown.</p>}
        {cards.length === 0 ? <Empty>{picked ? `No Game Plan Cards have been built for ${label(picked)}.` : 'No Game Plan Cards have been built yet.'}{isAdmin && picked ? ` To back-date it, run: python3 scripts/build_game_plan_cards.py --date ${picked}` : ''}</Empty> : (
          <>
            <div style={{ fontSize: 13, color: '#5b5347', marginBottom: 10 }}>Cards for {label(date as string)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              {cards.map(c => (
                <Link key={`${c.gamePk}-${c.pitcherId}`} href={`/mlb/lab/sequencing/game-plan/${c.gamePk}?pitcher=${c.pitcherId}`} style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 16, textDecoration: 'none', color: '#1A1A1A', display: 'block' }}>
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
