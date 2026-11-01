import Link from 'next/link'
import { TeamMark } from './Logo'
import type { StripGame } from '@/lib/mlb-homepage'

// Condensed list of recent finished games on the homepage: one line each, the score and a link to the postgame report.

const MUTED = '#8a8275'

export default function RecentPostgames({ games }: { games: StripGame[] }) {
  if (games.length === 0) return null
  return (
    <section aria-labelledby="pg-h" style={{ padding: '8px 0 14px' }}>
      <h2 id="pg-h" style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }}>Recent postgame reports</h2>
      {games.map(g => {
        const awayWon = (g.away.score ?? 0) > (g.home.score ?? 0)
        const side = (t: StripGame['away'], won: boolean) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: won ? 800 : 600, color: won ? '#1A1A1A' : MUTED }}>
            <TeamMark id={t.id} abbr={t.abbr} size={18} /><span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.score}</span>
          </span>
        )
        return (
          <Link key={g.gamePk} href={`/mlb/${g.slug}/postgame`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 0', borderTop: '1px solid #e7e2d8', color: '#1A1A1A', textDecoration: 'none', fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {side(g.away, awayWon)}{side(g.home, !awayWon)}
              {g.label && <span style={{ fontSize: 12, fontWeight: 800 }}>{g.label}</span>}
            </span>
            <span style={{ fontSize: 12, color: MUTED }}>{g.dateLabel} · <span style={{ color: '#1A1A1A', fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 3 }}>Postgame report</span></span>
          </Link>
        )
      })}
    </section>
  )
}
