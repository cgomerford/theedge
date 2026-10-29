// src/app/me/page.tsx
//
// My x9Lab: the signed-in dashboard. A status strip (following, season, recaps, plan); one card per followed player (season stat tiles, Statcast percentiles with the Pro set gated on
// the server, best skill); a panel per followed club (record, latest roster moves from team_transactions); "For your follows"; a recap email preview; and the labs quick-launch row.
// With no follows it shows one "Build your dashboard" panel with three suggestions. Settings moved to /me/settings (the pill at the top right). Private, never cached, signed-out
// visitors go to Create account. Missing values show "pending"; modules with no data source say "Coming soon"; nothing is invented.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { initialsOf } from '@/components/ui/InitialsChip'
import EmptyState, { type Suggestion } from '@/components/me/EmptyState'
import FollowsFeed from '@/components/me/FollowsFeed'
import LabTiles from '@/components/me/LabTiles'
import PlayerCard from '@/components/me/PlayerCard'
import RecapPreview from '@/components/me/RecapPreview'
import StatusStrip from '@/components/me/StatusStrip'
import TeamPanel from '@/components/me/TeamPanel'
import { C, CARD, EYEBROW, GREY, SANS, dateShort } from '@/components/me/ui'
import { getCurrentSubscriber } from '@/lib/auth'
import { FREE_LIMITS } from '@/lib/follows/config'
import { getPlayerFollows } from '@/lib/follows'
import { getFollowFeed } from '@/lib/follows/feed'
import { getFollowedPlayers, getFollowedTeams } from '@/lib/follows/me-data'
import { getPercentileBlocks } from '@/lib/follows/percentiles'
import { getSeasonState } from '@/lib/mlb-home-dashboard'
import { getTeamTransactions } from '@/lib/team-transactions'
import { MLB_TEAMS } from '@/lib/teams'
import { noindex } from '@/lib/seo'
import { signupHref } from '@/lib/site'

export const metadata = { title: 'My x9Lab', ...noindex() }
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CSS = `
.me-wrap{max-width:1180px;margin:0 auto;padding:28px 16px 70px}
.me-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:22px 0 22px}
.me-main{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:20px;align-items:start}
.me-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}
.me-side{display:grid;gap:14px;min-width:0}
.me-labs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.me-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
@media (max-width:1023px){.me-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.me-main{grid-template-columns:minmax(0,1fr)}.me-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.me-labs{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:639px){.me-cards{grid-template-columns:minmax(0,1fr)}.me-labs{grid-template-columns:repeat(2,minmax(0,1fr))}.me-wrap{padding-top:20px}}
`

export default async function MePage() {
  const sub = await getCurrentSubscriber()
  if (!sub) redirect(signupHref('me'))
  const isPro = sub.is_pro === true

  const [seasonState, follows] = await Promise.all([getSeasonState(), getPlayerFollows(sub.id)])
  const inSeason = seasonState.state === 'regular' || seasonState.state === 'postseason'
  const thisYear = new Date().getFullYear()
  // The stats come from the season being played; before the new one starts (Jan to Opening Day) they are last season's, and the card says so.
  const statsSeason = !inSeason && seasonState.nextStart && seasonState.nextStart.slice(0, 4) === String(seasonState.year) ? seasonState.year - 1 : seasonState.year

  const [players, teams] = await Promise.all([getFollowedPlayers(follows, statsSeason), getFollowedTeams(sub.teams)])
  const empty = players.length === 0 && teams.length === 0
  const pickHref = sub.preferences_token ? `/preferences/${sub.preferences_token}` : null
  const initials = initialsOf(sub.email.split('@')[0])

  // The empty state's three suggestions, each with one real stat from the same loaders.
  let suggestions: Suggestion[] = []
  if (empty) {
    const [sTeams, sPlayers] = await Promise.all([
      getFollowedTeams(['phillies']),
      getFollowedPlayers([{ player_id: 547180, player_name: 'Bryce Harper' }, { player_id: 681082, player_name: 'Bryson Stott' }], statsSeason),
    ])
    suggestions = [
      ...sTeams.map(t => ({ kind: 'team' as const, refId: t.slug, name: t.name, id: t.id, abbr: t.abbrev, line: `Team · ${t.record ?? 'pending'} in ${statsSeason}` })),
      ...sPlayers.map(p => ({ kind: 'player' as const, refId: String(p.id), name: p.name, id: p.id, abbr: p.teamAbbrev ?? '', line: `${p.teamAbbrev ?? 'Team pending'} · ${p.raw.ops && p.raw.ops !== 'pending' ? `${p.raw.ops} OPS` : 'season line pending'}` })),
    ]
  }

  // Everything below is only needed when there is something to show.
  const [blocks, feed, moves] = empty ? ([new Map(), [], []] as [Awaited<ReturnType<typeof getPercentileBlocks>>, Awaited<ReturnType<typeof getFollowFeed>>, Awaited<ReturnType<typeof getTeamTransactions>>[]]) : await Promise.all([
    getPercentileBlocks(players.map(p => ({ id: p.id, isPitcher: p.isPitcher, n: p.seasonN })), statsSeason, isPro),
    getFollowFeed(teams.map(t => ({ id: t.id, short: MLB_TEAMS.find(x => x.slug === t.slug)?.short ?? t.name })), players.map(p => ({ id: p.id, name: p.name }))),
    Promise.all(teams.map(t => getTeamTransactions(t.id, 30))),
  ])

  const firstTeam = teams[0]
  const teamLine = firstTeam ? `${MLB_TEAMS.find(x => x.slug === firstTeam.slug)?.short ?? firstTeam.name} ${firstTeam.record ?? 'pending'}` : null
  const nextAny = (firstTeam?.next ?? players.find(p => p.next)?.next) ?? null
  const recapLine = players.slice(0, 3).map(p => {
    const last = p.name.split(' ').slice(-1)[0]
    const v = p.isPitcher ? p.raw.era : p.raw.ops
    return v && v !== 'pending' ? `${last} ${v} ${p.isPitcher ? 'ERA' : 'OPS'}` : null
  }).filter(Boolean).join(' · ') || null
  const leftToAdd = Math.max(0, FREE_LIMITS.team - teams.length)

  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: SANS }}>
      <SiteHeader variant="page" />
      <style>{CSS}</style>
      <div className="me-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={EYEBROW}>My x9Lab{inSeason ? ' · In season' : ''}</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(34px, 5.4vw, 54px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05 }}>My x9Lab</h1>
          </div>
          <Link href="/me/settings" style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 999, padding: '7px 14px', background: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>{initials} · Settings</Link>
        </div>

        <StatusStrip players={players.length} teams={teams.length} isPro={isPro} inSeason={inSeason} teamLine={teamLine} nextGame={nextAny ? `Next: ${dateShort(nextAny.date)} ${nextAny.label}` : null} />

        {empty ? <EmptyState items={suggestions} isPro={isPro} /> : (
          <div className="me-main">
            <div style={{ minWidth: 0 }}>
              {players.length === 0
                ? <div style={{ ...CARD, padding: 18, fontSize: 15, color: GREY }}>Follow a player from his page to see him here.</div>
                : <div className="me-cards">{players.map(p => <PlayerCard key={p.id} p={p} block={blocks.get(p.id)} isPro={isPro} inSeason={inSeason} thisYear={thisYear} />)}</div>}
              <LabTiles />
            </div>
            <aside className="me-side" aria-label="Your teams and follows">
              {teams.length === 0
                ? <div style={{ ...CARD, padding: 16, fontSize: 14, color: GREY }}>No team followed yet. {pickHref && (isPro || leftToAdd > 0) && <Link href={pickHref} style={{ color: C.orange, fontWeight: 800, textDecoration: 'none' }}>+ Add a team{isPro ? '' : ` (${leftToAdd} left)`}</Link>}</div>
                : teams.map((t, i) => <TeamPanel key={t.slug} team={t} moves={moves[i] ?? []} inSeason={inSeason} statsSeason={statsSeason} leftToAdd={leftToAdd} isPro={isPro} pickHref={pickHref} showAdd={i === teams.length - 1} />)}
              <FollowsFeed rows={feed} />
              <RecapPreview line={recapLine} season={statsSeason} />
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
