// src/app/mlb/teams/[slug]/page.tsx
//
// Team page, rebuilt to the build guide's layout: header with record / run differential / division place, three plain sentences, leaders,
// next game, roster link, park, team defence (pending) and the staff's pitch mix. Server-rendered with NO session read: the Follow button is a
// client island. The earlier club-profile view (components/team/TeamPage.tsx and its helpers) is left on disk.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import FollowIsland from '@/components/signup/FollowIsland'
import PendingBlock from '@/components/data/PendingBlock'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import { getTeamBits } from '@/lib/team-page'
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { pageMeta, noindex } from '@/lib/seo'
import { fitDescription } from '@/lib/game-slug'
import { SportsTeamSchema, BreadcrumbSchema } from '@/components/StructuredData'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) return { title: 'Team not found', ...noindex() }
  const description = fitDescription(`${team.name} 2026: record, run differential, division place, batting and pitching leaders, next game, park and pitch mix, with the sample size beside each number.`, ['Free account.'])
  return pageMeta({ title: `${team.name} 2026`, description, path: `/mlb/teams/${slug}` })
}

const MUTE = '#8a8275', LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const H = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div style={{ margin: '34px 0 8px' }}><h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{children}</h2>{sub ? <div style={{ fontSize: 13, color: MUTE }}>{sub}</div> : null}</div>
)
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
const ops3 = (v: number) => v.toFixed(3).replace(/^0/, '')

export default async function TeamRoute({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) notFound()
  const mlbId = teamIdBySlug(slug)
  if (!mlbId) notFound()
  const season = new Date().getFullYear()

  const venueId = (await mlb<{ teams?: { venue?: { id?: number } }[] }>(`/teams/${mlbId}`, 86400))?.teams?.[0]?.venue?.id ?? null
  const b = await getTeamBits(mlbId, season, venueId)
  const r = b.record
  const diff = r ? `${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${Math.abs(r.diff)}` : ''
  const divText = r ? `${ord(r.divRank)} in the ${r.division}` : ''

  // Three plain sentences from this season's numbers, only once the club has played 10 games.
  const sentences: string[] = r && r.games >= 10 ? [
    `The ${team.short} are ${r.w}-${r.l}, ${divText.replace(/^(\d+\w+) in/, '$1 in')}${r.divRank > 1 && r.gb && r.gb !== '-' ? `, ${r.gb} games back` : ''}.`,
    `They have scored ${(r.rs / r.games).toFixed(2)} runs a game and allowed ${(r.ra / r.games).toFixed(2)}, a run differential of ${diff} (n = ${r.games} games).`,
    r.lastTen ? `They are ${r.lastTen} over their last 10${r.home && r.road ? `, ${r.home} at home and ${r.road} on the road` : ''}.` : '',
  ].filter(Boolean) : []

  const when = b.next ? new Date(b.next.whenUtc).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', fontSize: 12, color: MUTE, whiteSpace: 'nowrap' }

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <SportsTeamSchema name={team.name} path={`/mlb/teams/${slug}`} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: team.name, path: `/mlb/teams/${slug}` }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '28px 24px 80px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 18px' }}>
          <TeamMark id={mlbId} abbr={team.abbrev} size={52} />
          <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{team.name} {season}</h1>
          <div style={{ marginLeft: 'auto' }}><FollowIsland kind="team" refId={slug} name={team.name} /></div>
        </header>
        {r ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 36px', margin: '16px 0 0', ...num }}>
            <div><div style={{ fontSize: 12, fontWeight: 800, color: MUTE }}>RECORD</div><b style={{ fontSize: 28 }}>{r.w}-{r.l}</b></div>
            <div><div style={{ fontSize: 12, fontWeight: 800, color: MUTE }}>RUN DIFFERENTIAL</div><b style={{ fontSize: 28 }}>{diff}</b></div>
            <div><div style={{ fontSize: 12, fontWeight: 800, color: MUTE }}>DIVISION</div><b style={{ fontSize: 28 }}>{ord(r.divRank)}</b> <span style={{ fontSize: 14, color: MUTE }}>{r.division}</span></div>
          </div>
        ) : <div style={{ marginTop: 14 }}><PendingBlock label="Record" /></div>}

        {sentences.length > 0 ? (
          <>
            <H>Three things to know</H>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 16, lineHeight: 1.7 }}>{sentences.map(t => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}

        <H>Leaders</H>
        <div className="tm-two">
          <style>{`.tm-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}@media(max-width:900px){.tm-two{grid-template-columns:minmax(0,1fr)}}`}</style>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>Batting · Min 50 PA</div>
            {b.batters.length === 0 ? <PendingBlock label="Batting leaders" /> : (
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, ...num }}>
                <thead><tr><th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#FAF8F3' }}>Player</th><th style={th}>OPS</th><th style={th}>HR</th><th style={th}>PA</th></tr></thead>
                <tbody>{b.batters.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}><Link href={`/mlb/players/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}><Headshot id={p.id} name={p.name} size={30} /><b>{p.name}</b></Link></td>
                    <td style={{ padding: 6, fontWeight: 800 }}>{ops3(p.ops)}</td><td style={{ padding: 6 }}>{p.hr}</td><td style={{ padding: 6, color: MUTE }}>{p.pa}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>Pitching · Min 50 BF</div>
            {b.pitchers.length === 0 ? <PendingBlock label="Pitching leaders" /> : (
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, ...num }}>
                <thead><tr><th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#FAF8F3' }}>Player</th><th style={th}>ERA</th><th style={th}>K%</th><th style={th}>IP</th></tr></thead>
                <tbody>{b.pitchers.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}><Link href={`/mlb/players/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}><Headshot id={p.id} name={p.name} size={30} /><b>{p.name}</b></Link></td>
                    <td style={{ padding: 6, fontWeight: 800 }}>{p.era.toFixed(2)}</td><td style={{ padding: 6 }}>{p.kpct.toFixed(1)}%</td><td style={{ padding: 6, color: MUTE }}>{p.ip}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>wRC+ is not stored yet, so batting is ranked by OPS. Hover and the full tables are on the player pages.</div>

        <H>Next game</H>
        {b.next ? (
          <Link href={`/mlb/${b.next.slug}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', padding: '12px 0', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, color: 'inherit', textDecoration: 'none', fontSize: 16 }}>
            <b>{b.next.home ? 'vs' : 'at'} {b.next.opp}</b><span style={num}>{when}</span>
            <span style={{ color: '#57534E' }}>{b.next.awayTeam}: {b.next.away.name ?? 'starter not announced yet'} · {b.next.homeTeam}: {b.next.homeP.name ?? 'starter not announced yet'}</span>
            <span style={{ marginLeft: 'auto', color: '#FF5722', fontWeight: 800 }}>Game page →</span>
          </Link>
        ) : <PendingBlock label="Next game" />}

        <div style={{ margin: '14px 0 0' }}><a href={`https://www.mlb.com/${slug}/roster`} rel="noopener" style={{ color: '#FF5722', fontWeight: 800 }}>Roster and depth chart on MLB.com →</a></div>

        <H>Park</H>
        {b.park ? (
          <div style={{ fontSize: 15, ...num }}><b>x9Lab park index {b.park.index}</b> <span style={{ color: MUTE }}>({b.park.homeGames} home and {b.park.roadGames} road games, {b.park.seasons}; 100 is average)</span></div>
        ) : <PendingBlock label="Park index" />}

        <H>Team defence</H>
        <PendingBlock label="Team defence" />

        <H sub={`Staff usage by pitch, weighted by pitches thrown, ${season} regular season`}>Pitch mix</H>
        {b.mix.length === 0 ? <PendingBlock label="Pitch mix" /> : (
          <>
            <div aria-hidden style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', maxWidth: 720 }}>{b.mix.map(m => <span key={m.code} style={{ width: `${m.pct}%`, background: pitchColor(m.code) }} />)}</div>
            <table style={{ width: '100%', maxWidth: 720, borderCollapse: 'collapse', fontSize: 15, marginTop: 8, ...num }}>
              <tbody>{b.mix.map(m => (
                <tr key={m.code} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: '6px 8px' }}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: pitchColor(m.code), marginRight: 8 }} /><b>{pitchLabel(m.code)}</b></td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.pct.toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>{Math.round(b.mixPitches).toLocaleString('en-US')} pitches in the stored staff data.</div>
          </>
        )}
      </div>
    </main>
  )
}
