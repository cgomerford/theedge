import Link from 'next/link'
import { TeamMark } from './Logo'
import LocalTime from './LocalTime'
import type { HomeStrip, StripGame } from '@/lib/mlb-homepage'

// "Today's games": up to 7 cards in a row (scrolls sideways on phones). A postseason series shows every game of the
// series; the next game is marked with an orange bar.

const MUTED = '#8a8275'
const STATE_TEXT: Record<StripGame['state'], string> = { final: 'Final', live: 'Live', next: 'Next', scheduled: 'Scheduled', 'if-needed': 'If needed' }

function Card({ g }: { g: StripGame }) {
  const bar = g.state === 'next' ? '#FF5722' : g.state === 'final' ? '#8a8275' : '#e7e2d8'
  return (
    <Link
      href={`/mlb/${g.slug}${g.state === 'final' ? '/postgame' : ''}`}
      style={{ flex: '0 0 auto', width: 208, boxSizing: 'border-box', borderTop: `4px solid ${bar}`, border: '1px solid #e7e2d8', borderTopWidth: 4, borderTopColor: bar, borderRadius: 14, padding: '10px 14px 12px', background: '#fff', color: '#1A1A1A', textDecoration: 'none', display: 'grid', gap: 4 }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
        <span>{g.label ?? ''}</span>
        <span style={{ color: MUTED, fontWeight: 600 }}>{STATE_TEXT[g.state]}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 16, fontWeight: 800 }}>
        <TeamMark id={g.away.id} abbr={g.away.abbr} size={18} />
        <span style={{ color: MUTED, fontWeight: 600 }}>@</span>
        <TeamMark id={g.home.id} abbr={g.home.abbr} size={18} />
      </span>
      <span style={{ fontSize: 13, color: '#3a352c' }}>{g.detail}</span>
      <span style={{ fontSize: 12, color: MUTED }}>
        {g.dateLabel}
        {g.state !== 'final' && g.state !== 'live' && (g.timeTbc ? ' · time TBC' : <> · <LocalTime iso={g.startIso} /></>)}
      </span>
    </Link>
  )
}

export default function GamesStrip({ strip }: { strip: HomeStrip }) {
  if (strip.games.length === 0) {
    return (
      <section aria-labelledby="games-h" style={{ padding: '8px 0 20px' }}>
        <h2 id="games-h" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Season returns in spring</h2>
      </section>
    )
  }
  return (
    <section aria-labelledby="games-h" style={{ padding: '4px 0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 10 }}>
        <h2 id="games-h" style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Today&apos;s games</h2>
        {strip.note && <span style={{ fontSize: 13, color: MUTED }}>{strip.note}</span>}
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 6 }}>
        {strip.games.map(g => <Card key={g.gamePk} g={g} />)}
      </div>
      {strip.hasIfNeeded && <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>* if needed · times shown when MLB posts them</p>}
    </section>
  )
}
