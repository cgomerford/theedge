// src/app/mlb/lab/batting-lab/page.tsx — Batting Lab index: the one h1, one search field, and today's lineups as plain link rows.
// Each lineup row opens that game's preview on the Batters tab (confirmed or last-known lineup, with head-to-head and splits).
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import PlayerSearch from '@/components/PlayerSearch'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Batting Lab',
  description: 'Search any MLB hitter for hot zones, spray direction, results by pitch type and head-to-head numbers, with the number of pitches or batted balls behind every stat.',
  path: '/mlb/lab/batting-lab',
})

export const revalidate = 1800

export default async function BattingLabPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getScheduleForDate(today).catch(() => [])

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Batting Lab', path: '/mlb/lab/batting-lab' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 80px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Batting Lab</h1>
        <div style={{ marginTop: 18 }}>
          <PlayerSearch header sport="MLB" placeholder="Search a batter" />
        </div>
        <h2 style={{ margin: '34px 0 4px', fontSize: 20, fontWeight: 800 }}>Today&apos;s lineups</h2>
        {games.length === 0 ? (
          <p style={{ fontSize: 14, color: '#8a8275', margin: '6px 0' }}>No games today.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {games.map(g => (
              <li key={g.gamePk} style={{ borderTop: '1px solid #e7e2d8' }}>
                <Link href={`/mlb/${slugifyGame(g)}?tab=batters`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', color: 'inherit', textDecoration: 'none', fontSize: 16 }}>
                  <b>{g.teams.away.team.name} at {g.teams.home.team.name}</b>
                  <span style={{ color: '#FF5722', fontWeight: 800 }}>Lineups</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
