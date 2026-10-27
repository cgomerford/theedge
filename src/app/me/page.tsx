import Link from 'next/link'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SmallSample from '@/components/data/SmallSample'
import PendingBlock from '@/components/data/PendingBlock'
import ManageSubscriptionButton from '@/components/pro/ManageSubscriptionButton'
import UnfollowButton from '@/components/pro/UnfollowButton'
import { getCurrentSubscriber } from '@/lib/auth'
import { FREE_LIMITS } from '@/lib/follows/config'
import { getPlayerFollows } from '@/lib/follows'
import { getFollowedPlayers, getFollowedTeams, type GameRef } from '@/lib/follows/me-data'
import { noindex } from '@/lib/seo'
import { signupHref } from '@/lib/site'

export const metadata = { title: 'My x9Lab', ...noindex() }
// Private page: read per request, never cached.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MUTE = '#8a8275'
const LINE = '#e7e2d8'
const H2: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722' }
const ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', padding: '14px 0', borderTop: `1px solid ${LINE}`, fontSize: 15, color: '#1A1A1A' }
const DATE = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function Next({ g }: { g: GameRef | null }) {
  if (!g) return <span style={{ color: MUTE, fontSize: 14 }}>No game scheduled</span>
  return <Link href={`/mlb/${g.slug}`} style={{ color: '#FF5722', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Next: {DATE(g.date)} {g.label} →</Link>
}

// Signed-in page: the players and teams a person follows, what changed for each, and their settings.
export default async function MePage() {
  const sub = await getCurrentSubscriber()
  if (!sub) redirect(signupHref('me'))

  const follows = await getPlayerFollows(sub.id)
  const [players, teams] = await Promise.all([getFollowedPlayers(follows), getFollowedTeams(sub.teams)])
  const counter = sub.is_pro
    ? `${players.length} player${players.length === 1 ? '' : 's'} · ${teams.length} team${teams.length === 1 ? '' : 's'}`
    : `${players.length} of ${FREE_LIMITS.player} players · ${teams.length} of ${FREE_LIMITS.team} teams`

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 16px 80px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>My x9Lab</h1>
        <p style={{ margin: '6px 0 36px', fontSize: 15, color: MUTE }}>{counter}</p>

        <section aria-labelledby="players-h" style={{ marginBottom: 40 }}>
          <h2 id="players-h" style={H2}>Players</h2>
          <div style={{ marginTop: 10 }}>
            {players.length === 0 ? (
              <p style={{ ...ROW, color: MUTE, margin: 0 }}>Follow a player from his page to see him here.</p>
            ) : players.map(p => (
              <div key={p.id} style={ROW}>
                <Link href={`/mlb/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none', flex: '1 1 220px', minWidth: 0 }}>
                  <Headshot id={p.id} name={p.name} size={40} />
                  <b style={{ fontSize: 17 }}>{p.name}</b>
                  {p.teamAbbrev && <TeamMark id={p.teamId ?? 0} abbr={p.teamAbbrev} size={20} />}
                </Link>
                <div style={{ flex: '2 1 280px', minWidth: 0, fontSize: 14, lineHeight: 1.5 }}>
                  <div><span style={{ color: MUTE }}>Last game:</span> {p.lastGame ? <>{p.lastGame.line} <span style={{ color: MUTE }}>({DATE(p.lastGame.date)})</span></> : <span style={{ color: MUTE }}>none this season</span>}</div>
                  <div>
                    <span style={{ color: MUTE }}>What changed, last 30 days against the season:</span>{' '}
                    {p.change.rows ? p.change.rows.map(r => <span key={r.label} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>{r.label} <b>{r.last30}</b> <span style={{ color: MUTE }}>vs {r.season}</span></span>) : <SmallSample n={p.change.n} />}
                    {p.change.rows && <span style={{ color: MUTE, fontSize: 12 }}> n {p.change.n.toLocaleString('en-US')} {p.change.unit}, season n {p.change.seasonN.toLocaleString('en-US')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: '1 1 200px', justifyContent: 'space-between' }}>
                  <Next g={p.next} />
                  <UnfollowButton kind="player" refId={String(p.id)} name={p.name} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="teams-h" style={{ marginBottom: 40 }}>
          <h2 id="teams-h" style={H2}>Teams</h2>
          <div style={{ marginTop: 10 }}>
            {teams.length === 0 ? (
              <p style={{ ...ROW, color: MUTE, margin: 0 }}>No teams followed yet. Choose your teams in settings below.</p>
            ) : teams.map(t => (
              <div key={t.slug} style={ROW}>
                <Link href={`/mlb/teams/${t.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none', flex: '1 1 220px' }}>
                  <TeamMark id={t.id} abbr={t.abbrev} size={28} /><b style={{ fontSize: 17 }}>{t.name}</b>
                </Link>
                <div style={{ flex: '2 1 280px', fontSize: 14, lineHeight: 1.5 }}>
                  <div><span style={{ color: MUTE }}>Record:</span> {t.record ? <b>{t.record}</b> : <span style={{ color: MUTE }}>not available</span>}</div>
                  <div><span style={{ color: MUTE }}>Last result:</span> {t.last?.result ? <>{t.last.result} <span style={{ color: MUTE }}>({DATE(t.last.date)})</span></> : <span style={{ color: MUTE }}>none in the last two weeks</span>}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: '1 1 200px', justifyContent: 'space-between' }}>
                  <Next g={t.next} />
                  <UnfollowButton kind="team" refId={t.slug} name={t.name} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="recap-h" style={{ marginBottom: 40 }}>
          <h2 id="recap-h" style={H2}>Recaps</h2>
          <p style={{ margin: '10px 0 0', fontSize: 15, color: '#3a352c' }}>We&apos;ll email you when recaps start.</p>
          <PendingBlock label="Recap email" />
        </section>

        <section aria-labelledby="settings-h">
          <h2 id="settings-h" style={H2}>Settings</h2>
          <div style={{ marginTop: 10 }}>
            <div style={{ ...ROW, justifyContent: 'space-between' }}><span style={{ color: MUTE }}>Email address</span><b style={{ wordBreak: 'break-all' }}>{sub.email}</b></div>
            {sub.preferences_token && <Link href={`/preferences/${sub.preferences_token}`} style={{ ...ROW, textDecoration: 'none' }}><b>Pick your teams</b></Link>}
            {sub.is_pro ? (
              <ManageSubscriptionButton style={{ ...ROW, width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left', fontFamily: 'inherit', color: '#1A1A1A' }} />
            ) : (
              <Link href="/pricing" style={{ ...ROW, textDecoration: 'none' }}><b>See plans</b></Link>
            )}
            <form action="/api/auth/logout" method="POST"><button type="submit" style={{ ...ROW, width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: '#1A1A1A' }}><b>Sign out</b></button></form>
          </div>
        </section>
      </div>
    </main>
  )
}
