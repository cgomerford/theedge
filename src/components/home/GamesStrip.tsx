import Link from 'next/link'
import { TeamMark } from './Logo'
import LocalTime from './LocalTime'
import type { HomeGame } from '@/lib/mlb-homepage'

// Up to 7 games in a row (scrolls sideways on phones). Off-season: "Season returns in spring" plus the last real final.

const MUTED = '#8a8275'

function Side({ id, abbr, record, starter }: { id: number; abbr: string; record: string | null; starter: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <TeamMark id={id} abbr={abbr} size={20} />
      {record && <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{record}</span>}
      <span style={{ fontSize: 13, color: '#1A1A1A' }}>{starter ?? 'TBD'}</span>
    </div>
  )
}

export default function GamesStrip({ games, offSeason, lastFinal, lastFinalDate }: { games: HomeGame[]; offSeason: boolean; lastFinal: HomeGame | null; lastFinalDate: string | null }) {
  if (offSeason) {
    const d = lastFinalDate ? new Date(`${lastFinalDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
    return (
      <section aria-labelledby="games-h" style={{ padding: '8px 0 24px' }}>
        <h2 id="games-h" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Season returns in spring</h2>
        {lastFinal && (
          <Link href={`/mlb/${lastFinal.slug}/postgame`} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10, color: '#1A1A1A', textDecoration: 'none', fontSize: 16 }}>
            <TeamMark id={lastFinal.away.id} abbr={lastFinal.away.abbr} /> <b style={{ fontVariantNumeric: 'tabular-nums' }}>{lastFinal.away.score ?? ''}</b>
            <span style={{ color: MUTED }}>at</span>
            <TeamMark id={lastFinal.home.id} abbr={lastFinal.home.abbr} /> <b style={{ fontVariantNumeric: 'tabular-nums' }}>{lastFinal.home.score ?? ''}</b>
            <span style={{ fontSize: 13, color: MUTED }}>Final{d ? ` · ${d}` : ''}</span>
          </Link>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="games-h" style={{ padding: '8px 0 24px' }}>
      <h2 id="games-h" style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }}>Today&apos;s games</h2>
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8' }}>
        {games.map((g, i) => (
          <Link key={g.gamePk} href={`/mlb/${g.slug}${g.status === 'final' ? '/postgame' : ''}`} style={{ flex: '0 0 auto', minWidth: 236, padding: '12px 16px', borderLeft: i === 0 ? 0 : '1px solid #e7e2d8', color: '#1A1A1A', textDecoration: 'none', display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: MUTED }}>
              {g.status === 'scheduled' ? <LocalTime iso={g.startIso} /> : g.status === 'live' ? 'Live' : 'Final'}
            </span>
            <Side id={g.away.id} abbr={g.away.abbr} record={g.away.record} starter={g.away.starter} />
            <Side id={g.home.id} abbr={g.home.abbr} record={g.home.record} starter={g.home.starter} />
          </Link>
        ))}
      </div>
    </section>
  )
}
