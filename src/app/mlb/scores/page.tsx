// /mlb/scores: one day's games, a date picker, and a row per game (score, decisions, links). Box score detail lives on the postgame page.
// Server-rendered. The canonical URL carries no query string; ?date=YYYY-MM-DD only picks the day.
// Off-season (or any day with no games and no date picked): it shows the last day with games, labelled with that date.
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { TeamMark } from '@/components/home/Logo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { pageMeta } from '@/lib/seo'
import { getGamesOn, lastDayWithGames, nextGameAfter, shiftDay, todayET, type ScoreRow } from '@/lib/scores-page'

export const metadata = pageMeta({
  title: 'MLB scores',
  description: "Final scores for every MLB game by day, with the winning, losing and saving pitchers and links to each game's box score and scout report.",
  path: '/mlb/scores',
})

const MUTE = '#8a8275', LINE = '#e7e2d8'
const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
const timeET = (utc: string) => new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }

function Row({ g }: { g: ScoreRow }) {
  const awayWon = g.final && (g.away.score ?? 0) > (g.home.score ?? 0), homeWon = g.final && (g.home.score ?? 0) > (g.away.score ?? 0)
  const side = (t: ScoreRow['away'], won: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: won ? 800 : 500, fontSize: 18, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <TeamMark id={t.id} abbr={t.abbr} size={26} /><span>{t.score ?? ''}</span>
    </span>
  )
  const link: React.CSSProperties = { color: '#FF5722', fontWeight: 800, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }
  return (
    <li style={{ borderTop: `1px solid ${LINE}`, padding: '14px 0', display: 'grid', gridTemplateColumns: '120px 70px minmax(0, 1.4fr) minmax(0, 1.2fr) auto', gap: '8px 18px', alignItems: 'center' }} className="sc-row">
      <span style={{ fontSize: 14, color: MUTE }}>{g.final ? (g.status || 'Final') : g.live ? g.status : g.status || timeET(g.startUtc)}</span>
      <b style={{ fontSize: 14 }}>{g.label ?? ''}</b>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 22px' }}>{side(g.away, awayWon)}{side(g.home, homeWon)}</span>
      <span style={{ fontSize: 14, color: '#57534E' }}>{g.decisions ?? ''}</span>
      <span style={{ display: 'flex', gap: 16 }}>
        {g.final ? <Link href={`/mlb/${g.slug}/postgame`} style={link}>Box score</Link> : <Link href={`/mlb/${g.slug}`} style={link}>Game preview</Link>}
        <Link href={`/mlb/${g.slug}/scout-report`} style={link}>Scout report</Link>
      </span>
    </li>
  )
}

export default async function ScoresPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: asked } = await searchParams
  const today = todayET()
  const picked = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : null
  let date = picked ?? today
  let games = await getGamesOn(date)
  let fallbackNote: string | null = null
  if (!picked && games.length === 0) {
    const prev = await lastDayWithGames(today)
    if (prev) { date = prev; games = await getGamesOn(prev); fallbackNote = `No games today. Showing ${longDay(prev)}, the last day with games.` }
  }
  const next = await nextGameAfter(date)
  const noGamesToday = fallbackNote != null || (!picked && date === today && games.length === 0)
  const anyIfNeeded = games.some(g => g.label?.endsWith('*'))

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Scores', path: '/mlb/scores' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <style>{`@media (max-width:820px){.sc-row{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Scores</div>
        <h1 style={{ margin: '4px 0 14px', fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.02 }}>Scores</h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
          <Link href={`/mlb/scores?date=${shiftDay(date, -1)}`} style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }} aria-label="Previous day">← Previous day</Link>
          <b style={{ fontSize: 18 }}>{longDay(date)}</b>
          <Link href={`/mlb/scores?date=${shiftDay(date, 1)}`} style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }} aria-label="Next day">Next day →</Link>
          <form method="get" action="/mlb/scores" style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <input type="date" name="date" defaultValue={date} aria-label="Choose a date" style={{ height: 36, border: `1px solid ${LINE}`, borderRadius: 2, padding: '0 8px', background: '#fff', font: 'inherit' }} />
            <button type="submit" style={{ height: 36, border: '1px solid #1A1A1A', borderRadius: 2, background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>Go</button>
          </form>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
          {noGamesToday ? <span style={chip}><span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: MUTE }} />No games today</span> : null}
          {next ? <span style={chip}><span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75' }} />Next: {next.label ?? next.matchup} {shortDay(next.date)}</span> : null}
        </div>
        {fallbackNote ? <p style={{ margin: '0 0 8px', fontSize: 14, color: '#57534E' }}>{fallbackNote}</p> : null}

        {games.length === 0 ? (
          <p style={{ fontSize: 15, color: MUTE, padding: '14px 0', borderTop: `1px solid ${LINE}` }}>No games on {shortDay(date)}.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderBottom: `1px solid ${LINE}` }}>{games.map(g => <Row key={g.gamePk} g={g} />)}</ul>
        )}
        <p style={{ fontSize: 12, color: MUTE, marginTop: 10 }}>{anyIfNeeded ? '* Played only if necessary. ' : ''}Full box scores are on each game&apos;s box score page.</p>
      </div>
    </main>
  )
}
