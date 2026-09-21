// src/app/nfl/[slug]/scout/page.tsx — NFL Scout Report (signup / Pro).
//
// Gating (mirrors the MLB Scout Report and DESIGN_SYSTEM §5), all decided on the server:
//   - logged out      -> signup wall only; NO data is fetched or shipped
//   - signed up       -> availability, form, snaps, situational, special teams, coach-card teaser
//   - Pro             -> the Pro desk; its data (getNgs, FTN, splits, usage) is fetched ONLY when isPro is true
// `isPro` is never defaulted. In `next dev`, Pro is unlocked and `?pro=0` previews the locked state.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SportLiveTicker from '@/components/SportLiveTicker'
import SignupForm from '@/components/home/SignupForm'
import ScoutReport, { type ProScoutData, type TeamView } from '@/components/nfl-edge/scout/ScoutReport'
import { C, Card, DISCLAIMER, GameHero, MONO, NflStyles, SANS, TabStrip } from '@/components/nfl-edge/ui'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { getTodayTickerGames } from '@/lib/mlb'
import { getGameBySlug, kickoffLabel, weekLabel } from '@/lib/nfl-edge/games'
import { getNflTeams, type NflTeam } from '@/lib/nfl-edge/teams'
import { column, ftnRatesOf, getLeagueForm, leagueRates, rankOf, ratesOf, teamBlend, type LeagueForm } from '@/lib/nfl-edge/form'
import { getNflTicker } from '@/lib/nfl-edge/slate'
import { getTeamUsage } from '@/lib/nfl-edge/players'
import { buildWatchList, getAvailability, getKicking, getNgs, getSnapBoard, getSplitSums, getSplits, sumSums } from '@/lib/nfl-edge/scout'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string }> }

export const revalidate = 300

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  const teams = await getNflTeams()
  const h = game && teams.get(game.homeId), a = game && teams.get(game.awayId)
  if (!game || !h || !a) return { title: 'NFL Scout Report · The Edge' }
  const title = `${a.nick} at ${h.nick} — Scout Report · The Edge`
  return { title, description: `Availability, form trends, snap shares and situational football for ${a.name} at ${h.name}, Week ${game.week}.` }
}

function windowView(lf: LeagueForm, id: string, k: 'season_sum' | 'l3' | 'l5') {
  const w = lf.cur.get(id)?.[k]
  return w && w.games > 0 ? { r: ratesOf({ off: w.off, def: w.def }), games: w.games } : null
}

export default async function NflScoutPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const teams = await getNflTeams()
  const home = teams.get(game.homeId), away = teams.get(game.awayId)
  if (!home || !away) notFound()

  const dev = process.env.NODE_ENV === 'development'
  const subscriber = await getCurrentSubscriber()
  const signedUp = !!subscriber || dev
  let isPro = await isProViewer()
  if (dev && sp.pro === '0') isPro = false

  const [ticker, mlbTicker] = await Promise.all([getNflTicker(), getTodayTickerGames().catch(() => [])])
  const header = (
    <>
      <SiteHeader variant="page" />
      <SportLiveTicker mlbGames={mlbTicker} nflGames={ticker} defaultSport="nfl" />
    </>
  )

  // ── signup wall: no data below this line runs for logged-out viewers ──
  if (!signedUp) {
    return (
      <main style={{ background: C.cream, minHeight: '100vh' }}>
        {header}
        <div className="tp-root" style={{ fontFamily: SANS }}>
          <NflStyles />
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
            <GameHero game={game} home={home} away={away} kicker={`Scout Report · ${weekLabel(game)} · ${kickoffLabel(game.kickoff)}`} />
            <TabStrip game={game} active="scout" />
            <div style={{ marginTop: 28, maxWidth: 760 }}>
              <Card title="Free with signup">
                <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.01em', color: C.ink }}>The operating brief for this game.</div>
                <p style={{ fontSize: 14.5, color: '#5b5347', lineHeight: 1.55, margin: '8px 0 14px' }}>Sign up free to open the Scout Report. Here is what is inside:</p>
                <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                  {['Availability desk with next-man-up arrows', 'Form trends: EPA game by game, with the plays behind each number', 'Snap and personnel shares, last 3 vs season', 'Situational football: by down and in the red zone', 'A coach card of what to watch'].map(f => (
                    <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13.5 }}><span style={{ color: C.orange }}>◆</span>{f}</li>
                  ))}
                </ul>
                <SignupForm source={`nfl-scout-${slug}`} buttonLabel="Open the Scout Report →" />
                <p style={{ fontFamily: MONO, fontSize: 10, color: C.faint, margin: '12px 0 0' }}>Already a member? <Link href="/login" style={{ color: C.orange }}>Log in</Link> · Pro adds FTN charting, Next Gen Stats depth and matchup clashes.</p>
              </Card>
            </div>
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 30 }}>{DISCLAIMER}</p>
          </div>
        </div>
      </main>
    )
  }

  const lf = await getLeagueForm(game.season)
  const lr = leagueRates(lf)
  const build = async (t: NflTeam): Promise<TeamView> => {
    const b = teamBlend(lf, t.id)
    const [avail, splits, snaps, kicking] = await Promise.all([
      getAvailability(t.id, game.season, game.week), getSplits(t.id, game.season), getSnapBoard(t.id, game.season), getKicking(t.id, game.season),
    ])
    return { team: t, blended: ratesOf(b), season: windowView(lf, t.id, 'season_sum'), l3: windowView(lf, t.id, 'l3'), l5: windowView(lf, t.id, 'l5'), usesPrior: b.usesPrior, avail, splits, snaps, kicking }
  }
  const [awayView, homeView] = await Promise.all([build(away), build(home)])
  const watch = buildWatchList({ game, homeId: home.id, awayId: away.id, lr, availability: { home: homeView.avail.units, away: awayView.avail.units } })

  // ── Pro data: only fetched for Pro viewers ──
  let pro: ProScoutData | null = null
  if (isPro) {
    const [ngsA, ngsH, sumsA, sumsH, useA, useH] = await Promise.all([
      getNgs(away.id, game.season), getNgs(home.id, game.season), getSplitSums(away.id, game.season), getSplitSums(home.id, game.season),
      getTeamUsage(away.id, game.season), getTeamUsage(home.id, game.season),
    ])
    const bA = teamBlend(lf, away.id), bH = teamBlend(lf, home.id)
    const rA = ratesOf(bA), rH = ratesOf(bH)
    const e = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
    const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
    const rk = (v: number | null, pick: (r: typeof rA) => number | null, hb: boolean) => rankOf(v, column(lr, pick), hb)
    const clash = (label: string, a: { v: number | null; pick: (r: typeof rA) => number | null; hb: boolean; f: (v: number | null) => string }, h: { v: number | null; pick: (r: typeof rA) => number | null; hb: boolean; f: (v: number | null) => string }, note: string) =>
      ({ label, away: { v: a.f(a.v), rank: rk(a.v, a.pick, a.hb) }, home: { v: h.f(h.v), rank: rk(h.v, h.pick, h.hb) }, note })
    const isNight = (k: string | null) => (k ? Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(new Date(k))) >= 19 : false)
    const epa = (list: { off: Record<string, number> }[]) => { const s = sumSums(list.map(x => x.off)); return list.length && s.plays ? s.epa / s.plays : null }
    const venueRow = (label: string, keep: (x: (typeof sumsA)[number]) => boolean) => {
      const a = sumsA.filter(keep), h = sumsH.filter(keep)
      return { label, away: e(epa(a)), home: e(epa(h)), awayN: a.length, homeN: h.length }
    }
    const usage = (u: Awaited<ReturnType<typeof getTeamUsage>>, v: TeamView, t: NflTeam) => v.snaps.offense.slice(0, 6).map(p => {
      const row = u.rows.find(x => x.name === p.name)
      return { team: t.id, name: p.name, pos: p.pos, tgtShare: row && u.teamTargets > 0 ? row.targets / u.teamTargets : null, snap: p.season }
    })
    pro = {
      ngs: [ngsA, ngsH],
      ftnO: [ftnRatesOf(bA.ftn_off), ftnRatesOf(bH.ftn_off)], ftnD: [ftnRatesOf(bA.ftn_def), ftnRatesOf(bH.ftn_def)],
      clash: [
        clash(`${away.id} pass offense vs ${home.id} pass defense`, { v: rA.passEpaO, pick: r => r.passEpaO, hb: true, f: e }, { v: rH.passEpaD, pick: r => r.passEpaD, hb: false, f: e }, 'EPA per dropback: gained (left) vs allowed (right). Rank 1 = best.'),
        clash(`${home.id} pass offense vs ${away.id} pass defense`, { v: rA.passEpaD, pick: r => r.passEpaD, hb: false, f: e }, { v: rH.passEpaO, pick: r => r.passEpaO, hb: true, f: e }, 'EPA per dropback: allowed (left) vs gained (right).'),
        clash(`${away.id} run offense vs ${home.id} run defense`, { v: rA.rushEpaO, pick: r => r.rushEpaO, hb: true, f: e }, { v: rH.rushEpaD, pick: r => r.rushEpaD, hb: false, f: e }, 'EPA per carry.'),
        clash(`${home.id} run offense vs ${away.id} run defense`, { v: rA.rushEpaD, pick: r => r.rushEpaD, hb: false, f: e }, { v: rH.rushEpaO, pick: r => r.rushEpaO, hb: true, f: e }, 'EPA per carry.'),
        clash(`${away.id} protection vs ${home.id} pass rush`, { v: rA.sackAllowed, pick: r => r.sackAllowed, hb: false, f: pc }, { v: rH.sackGen, pick: r => r.sackGen, hb: true, f: pc }, 'Sacks per dropback: allowed vs generated.'),
        clash(`${home.id} protection vs ${away.id} pass rush`, { v: rA.sackGen, pick: r => r.sackGen, hb: true, f: pc }, { v: rH.sackAllowed, pick: r => r.sackAllowed, hb: false, f: pc }, 'Sacks per dropback: generated vs allowed.'),
      ],
      venue: [venueRow('Home games', x => x.isHome), venueRow('Road games', x => !x.isHome), venueRow('Day (before 7pm ET)', x => !isNight(x.kickoff)), venueRow('Night (7pm ET+)', x => isNight(x.kickoff)), venueRow('Roofed stadium', x => x.roof === 'dome' || x.roof === 'closed'), venueRow('Outdoors', x => x.roof === 'outdoors' || x.roof === 'open')],
      usage: [...usage(useA, awayView, away), ...usage(useH, homeView, home)],
    }
  }

  return (
    <main style={{ background: C.cream, minHeight: '100vh' }}>
      {header}
      <ScoutReport game={game} away={away} home={home} awayView={awayView} homeView={homeView} watch={watch} isPro={isPro} pro={pro} />
    </main>
  )
}
