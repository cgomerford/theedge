import Link from 'next/link'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { getCurrentSubscriber } from '@/lib/auth'
import { FOLLOW_LIMITS, getPlayerFollows } from '@/lib/follows'
import { findTeamBySlug } from '@/lib/teams'
import { noindex } from '@/lib/seo'
import ManageSubscriptionButton from '@/components/pro/ManageSubscriptionButton'

export const metadata = { title: 'My x9Lab', ...noindex() }

const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', margin: 0 }
const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid #e7e2d8', fontSize: 16, color: '#1A1A1A', textDecoration: 'none' }

// Signed-in dashboard. For now: header, the follows list and settings links (the /me layout prompt fills in the rest).
export default async function MePage() {
  const sub = await getCurrentSubscriber()
  if (!sub) redirect('/signup?source=me')

  const players = await getPlayerFollows(sub.id)
  const teams = sub.teams.map(slug => findTeamBySlug(slug)).filter((t): t is NonNullable<typeof t> => Boolean(t))

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 16px 80px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>My x9Lab</h1>
        <p style={{ margin: '6px 0 36px', fontSize: 15, color: '#8a8275', wordBreak: 'break-all' }}>{sub.email}</p>

        <section aria-labelledby="teams-h" style={{ marginBottom: 36 }}>
          <h2 id="teams-h" style={LABEL}>Teams you follow{sub.is_pro ? '' : ` (${teams.length} of ${FOLLOW_LIMITS.team})`}</h2>
          <div style={{ marginTop: 10 }}>
            {teams.length === 0 ? (
              <p style={{ ...ROW, color: '#8a8275', margin: 0 }}>No teams followed yet.</p>
            ) : (
              teams.map(t => (
                <Link key={t.slug} href={`/mlb/teams/${t.slug}`} style={ROW}>
                  <b>{t.name}</b>
                  <span style={{ color: '#8a8275' }}>{t.abbrev}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="players-h" style={{ marginBottom: 36 }}>
          <h2 id="players-h" style={LABEL}>Players you follow{sub.is_pro ? '' : ` (${players.length} of ${FOLLOW_LIMITS.player})`}</h2>
          <div style={{ marginTop: 10 }}>
            {players.length === 0 ? (
              <p style={{ ...ROW, color: '#8a8275', margin: 0 }}>No players followed yet.</p>
            ) : (
              players.map(p => (
                <Link key={p.player_id} href={`/mlb/players/${p.player_id}`} style={ROW}>
                  <b>{p.player_name}</b>
                </Link>
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="settings-h">
          <h2 id="settings-h" style={LABEL}>Settings</h2>
          <div style={{ marginTop: 10 }}>
            {sub.preferences_token && <Link href={`/preferences/${sub.preferences_token}`} style={ROW}><b>Email preferences</b></Link>}
            {sub.is_pro ? (
              <ManageSubscriptionButton style={{ ...ROW, width: '100%', background: 'none', border: 0, borderTop: '1px solid #e7e2d8', textAlign: 'left' }} />
            ) : (
              <Link href="/pricing" style={ROW}><b>Plans</b></Link>
            )}
            <form action="/api/auth/logout" method="POST"><button type="submit" style={{ ...ROW, width: '100%', background: 'none', border: 0, borderTop: '1px solid #e7e2d8', textAlign: 'left', cursor: 'pointer' }}><b>Sign out</b></button></form>
          </div>
        </section>
      </div>
    </main>
  )
}
