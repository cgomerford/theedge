// src/app/nfl/[slug]/page.tsx — NFL Game Preview (the free door).
//
// Reads only cached / precomputed data (nfl_games, nfl_team_form, depth charts, injuries, player stats);
// nothing is fetched live from ESPN or any external API in the render path.
// Scout Report is /nfl/[slug]/scout, Postgame is /nfl/[slug]/postgame.

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import SportLiveTicker from '@/components/SportLiveTicker'
import { getTodayTickerGames } from '@/lib/mlb'
import GamePreview from '@/components/nfl-edge/preview/GamePreview'
import { getGameBySlug, getSeasonGames } from '@/lib/nfl-edge/games'
import { getNflTeams } from '@/lib/nfl-edge/teams'
import { getLeagueForm, leagueRates } from '@/lib/nfl-edge/form'
import { computeEdgeRead } from '@/lib/nfl-edge/factors'
import { getQbCard, getTeamPlayers, getTeamUsage, type PlayerCard } from '@/lib/nfl-edge/players'
import { getNflTicker, recordStr, recordsFrom, starterQbId } from '@/lib/nfl-edge/slate'
import { buildKeyPlayers, buildSnapshot, getRecentForm } from '@/lib/nfl-edge/preview'

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 300

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  const teams = await getNflTeams()
  const h = game && teams.get(game.homeId), a = game && teams.get(game.awayId)
  if (!game || !h || !a) return { title: 'NFL Game · The Edge' }
  const title = `${a.nick} at ${h.nick} — Game Preview · The Edge`
  const description = `Week ${game.week} ${a.name} at ${h.name}: the factor read, starting quarterbacks, likely starters and key players.`
  return { title, description, openGraph: { title, description, type: 'article' }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function NflGamePreviewPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const teams = await getNflTeams()
  const home = teams.get(game.homeId), away = teams.get(game.awayId)
  if (!home || !away) notFound()

  const [ticker, mlbTicker] = await Promise.all([getNflTicker(), getTodayTickerGames().catch(() => [])])
  const [hq, aq, lf, seasonGames] = await Promise.all([
    starterQbId(game.homeId, game.season, game.homeQbId),
    starterQbId(game.awayId, game.season, game.awayQbId),
    getLeagueForm(game.season),
    getSeasonGames(game.season),
  ])
  const lr = leagueRates(lf)
  const [read, homePlayers, awayPlayers, form] = await Promise.all([
    computeEdgeRead({ game, lf, homeQbId: hq, awayQbId: aq }),
    getTeamPlayers(game.homeId, game.season, game.week, hq),
    getTeamPlayers(game.awayId, game.season, game.week, aq),
    getRecentForm(game),
  ])
  const [homeQb, awayQb, homeUse, awayUse] = await Promise.all([
    getQbCard(homePlayers.qb, game.season), getQbCard(awayPlayers.qb, game.season),
    getTeamUsage(game.homeId, game.season), getTeamUsage(game.awayId, game.season),
  ])

  const records = recordsFrom(seasonGames)
  const rec = (id: string) => recordStr(records.get(id) ?? { w: 0, l: 0, t: 0 })
  const pts = (id: string): [number, number] => {
    const done = seasonGames.filter(g => g.seasonType === 'REG' && g.homeScore != null && g.awayScore != null && (g.homeId === id || g.awayId === id))
    return [done.reduce((t, g) => t + (g.homeId === id ? g.homeScore! : g.awayScore!), 0), done.length]
  }
  const weapon = (u: Awaited<ReturnType<typeof getTeamUsage>>): string | null => {
    const top = u.rows.filter(r => r.pos !== 'QB' && r.targets > 0).sort((a, b) => b.targets - a.targets)[0]
    if (!top || u.teamTargets < 10) return null
    return `${top.name} — ${((top.targets / u.teamTargets) * 100).toFixed(0)}% of team targets (${top.targets} of ${u.teamTargets}, ${game.season})`
  }
  const keyCards = (p: typeof homePlayers): PlayerCard[] => [...p.skill]

  return (
    <main style={{ background: '#FAF8F3', minHeight: '100vh' }}>
      <SiteHeader variant="page" />
      <SportLiveTicker mlbGames={mlbTicker} nflGames={ticker} defaultSport="nfl" />
      <GamePreview
        game={game} home={home} away={away} homeRec={rec(home.id)} awayRec={rec(away.id)}
        read={read}
        snapshot={buildSnapshot(lr, home.id, away.id, { home: pts(home.id), away: pts(away.id) })}
        qbs={[awayQb, homeQb]} weapons={[weapon(awayUse), weapon(homeUse)]}
        homePlayers={homePlayers} awayPlayers={awayPlayers}
        homeKey={buildKeyPlayers(keyCards(homePlayers), away.id, away.nick, lr)} awayKey={buildKeyPlayers(keyCards(awayPlayers), home.id, home.nick, lr)}
        lastMeeting={form.lastMeeting} homeForm={form.homeForm} awayForm={form.awayForm} teams={teams}
      />
    </main>
  )
}
