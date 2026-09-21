// src/app/nfl/[slug]/postgame/page.tsx — NFL Postgame. Free = what happened; Pro = trajectory.
// The play-by-play half is one precomputed row (nfl_game_postgame); Pro data is fetched ONLY for Pro viewers.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SportLiveTicker from '@/components/SportLiveTicker'
import GamePostgame from '@/components/nfl-edge/postgame/GamePostgame'
import { getTodayTickerGames } from '@/lib/mlb'
import { getGameBySlug, phaseOf } from '@/lib/nfl-edge/games'
import { getNflTeams } from '@/lib/nfl-edge/teams'
import { getNflTicker } from '@/lib/nfl-edge/slate'
import { getKeyScorecard, getNextGames, getPostgame, getProPostgame, getQbNights, getSnapLeaders, getTopPerformers } from '@/lib/nfl-edge/postgame'
import { isProViewer } from '@/lib/require-pro'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  const teams = await getNflTeams()
  const h = game && teams.get(game.homeId), a = game && teams.get(game.awayId)
  if (!game || !h || !a) return { title: 'NFL Postgame · The Edge' }
  const title = `${a.nick} at ${h.nick} — Postgame · The Edge`
  return { title, description: `What happened: ${a.name} at ${h.name}, Week ${game.week}. Win-probability swings, top performers, team stats and scoring drives.` }
}

export default async function NflPostgamePage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const teams = await getNflTeams()
  const home = teams.get(game.homeId), away = teams.get(game.awayId)
  if (!home || !away) notFound()

  // `isPro` comes from the real session. `?pro=0` previews the locked state, and only in `next dev`.
  let isPro = await isProViewer()
  if (process.env.NODE_ENV === 'development' && sp.pro === '0') isPro = false

  const [ticker, mlbTicker] = await Promise.all([getNflTicker(), getTodayTickerGames().catch(() => [])])
  const header = (
    <>
      <SiteHeader variant="page" />
      <SportLiveTicker mlbGames={mlbTicker} nflGames={ticker} defaultSport="nfl" />
    </>
  )

  if (phaseOf(game) !== 'final') {
    return (
      <main style={{ background: '#FAF8F3', minHeight: '100vh' }}>
        {header}
        <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 24px', textAlign: 'center', fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}>
          <h1 style={{ fontWeight: 800, fontSize: 34, margin: 0 }}>{away.nick} at {home.nick}</h1>
          <p style={{ color: '#5b5347', fontSize: 15, lineHeight: 1.5 }}>This game has not finished (or its final score has not been posted yet), so there is no postgame report. Check back after the final whistle.</p>
          <Link href={`/nfl/${game.slug}`} style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>Open the Game Preview →</Link>
        </div>
      </main>
    )
  }

  const payload = await getPostgame(game.id)
  const [performers, snaps, qbs, scorecard, nextGames] = await Promise.all([
    getTopPerformers(game), getSnapLeaders(game), getQbNights(game, payload), getKeyScorecard(game), getNextGames(game),
  ])
  // Pro data is only fetched (and therefore only ever serialised into the page) for Pro viewers.
  const pro = isPro ? await getProPostgame(game, payload) : null

  return (
    <main style={{ background: '#FAF8F3', minHeight: '100vh' }}>
      {header}
      <GamePostgame game={game} home={home} away={away} teams={teams} payload={payload} performers={performers} snaps={snaps} qbs={qbs} scorecard={scorecard} nextGames={nextGames} isPro={isPro} pro={pro} />
    </main>
  )
}
