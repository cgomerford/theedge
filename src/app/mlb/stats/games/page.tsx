// src/app/mlb/stats/games/page.tsx
//
// Games — a sub page of The Stats. An out-of-town-style scoreboard for any date: today's games live,
// and every past day's games, each opening the full game explorer (/mlb/stats/games/[gamePk]).
// Public; the Pro-only part is the "when did this last happen" search inside a game.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import GamesBoard from '@/components/games/GamesBoard'
import { getScoreboard } from '@/lib/game-explorer'
import { isProViewer } from '@/lib/require-pro'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'MLB games by date',
  description:
    'Every MLB game on any date: live scores, final box scores, and every pitch and plate appearance, with the last time something like it happened.',
  path: '/mlb/stats/games',
})

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: q } = await searchParams
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today
  const [games, isPro] = await Promise.all([getScoreboard(date), isProViewer()])
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav isPro={isPro} />
      <div style={{ maxWidth: 1560, margin: '0 auto', padding: '18px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 13, color: '#8a8275', marginBottom: 6 }}>
          <Link href="/mlb/stats" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>The Stats</Link> <span aria-hidden>›</span> Games
        </nav>
        <h1 style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Games</h1>
        <p style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 15, color: '#5b5347', margin: '0 0 18px', maxWidth: 760 }}>
          Every game on the slate — today&apos;s live, and any day in the past. Open one to see every pitch and every player, and ask when something like it last happened.
        </p>
        <GamesBoard key={date} date={date} today={today} initialGames={games} />
      </div>
    </main>
  )
}
