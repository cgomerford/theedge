/**
 * src/app/nfl/league/page.tsx  (moved from src/app/nfl/page.tsx — the NFL homepage is now the slate page)
 *
 * No CSS block. All styling lives inline in the client components this
 * renders. Data-fetching logic is unchanged from before the reset, plus
 * top5QbRadars / top5WrRadars for the two radar cyclers below the 75/25
 * row (getQbRadarProfile / getWrRadarProfile in queries.ts).
 */

import SiteHeader from '@/components/SiteHeader'
import NflHomeClient from '@/app/nfl/NflHomeClient'
import { getBiggestRushEpaMover } from '@/lib/nfl/queries'
import { getTeamDefenseLeaders, getTeamFgLeaders } from '@/lib/nfl/queries'
import { getTeamYardsLeaders } from '@/lib/nfl/queries'
import {
  getThisWeeksGames,
  getAllTeamsWithReports,
  getQbLeaders,
  getRbLeaders,
  getWrLeaders,
  getTeLeaders,
  getAdvancedStatsLeaders,
  getStandings,
  getActiveStatsSeason,
  getFantasyPointsLeaders,
  getFantasyProjections,
  getInterceptionLeaders,
  getTacklesForLossLeaders,
  getTurnoverPlaymakerLeaders,
  getFieldGoalLeaders,
  getLeagueSchemeLeaders,
  getTeamStrengthMap,
  getQbRadarProfile,
  getWrRadarProfile,
  getLeagueCoverageTrend,
  getLeagueRouteTrend,
  getLeagueRushPassTrend,
  getLeagueSchemeEvolutionTrend,
  getBiggestPassEpaMover,
  getBiggestReceivingEpaMover,
  getBiggestFantasyMover,
  getBiggestTeamOffenseMover,
} from '@/lib/nfl/queries'

export const metadata = {
  title: 'NFL League Desk · The Edge',
  description: 'Season leaders, standings, and a coverage desk for the analytics era.',
}

export const revalidate = 300

export default async function NflHomePage() {
  const statsSeason = await getActiveStatsSeason()

  const [
    games,
    teams,
    qbLeaders,
    rbLeaders,
    wrLeaders,
    teLeaders,
    advLeaders,
    standings,
    fantasyLeaders,
    fantasyProjections,
    intLeaders,
    tflLeaders,
    turnoverLeaders,
    fgLeaders,
    leagueLeaders,
    teamStrength,
  ] = await Promise.all([
    getThisWeeksGames(statsSeason),
    getAllTeamsWithReports(statsSeason),
    getQbLeaders(statsSeason, 10),
    getRbLeaders(statsSeason, 10),
    getWrLeaders(statsSeason, 10),
    getTeLeaders(statsSeason, 10),
    getAdvancedStatsLeaders(statsSeason),
    getStandings(statsSeason),
    getFantasyPointsLeaders(statsSeason, 10),
    getFantasyProjections(),
    getInterceptionLeaders(statsSeason, 10),
    getTacklesForLossLeaders(statsSeason, 10),
    getTurnoverPlaymakerLeaders(statsSeason),
 getFieldGoalLeaders(statsSeason),
    getLeagueSchemeLeaders(statsSeason),
    getTeamStrengthMap(statsSeason),
  ])
 
const [leagueCoverageTrend, leagueRouteTrend, leagueRushPassTrend, leagueSchemeTrend] = await Promise.all([
  getLeagueCoverageTrend(),
  getLeagueRouteTrend(),
  getLeagueRushPassTrend(),
  getLeagueSchemeEvolutionTrend(),
])
const [biggestRushMover, biggestPassMover, biggestReceivingMover, biggestFantasyMover, biggestTeamMover] = await Promise.all([
  getBiggestRushEpaMover(statsSeason, statsSeason - 1, 50),
  getBiggestPassEpaMover(statsSeason, statsSeason - 1, 100),
  getBiggestReceivingEpaMover(statsSeason, statsSeason - 1, 30),
  getBiggestFantasyMover(statsSeason, statsSeason - 1, 6),
  getBiggestTeamOffenseMover(statsSeason, statsSeason - 1),
])
 
  const week = games[0]?.week ?? null
  const isLastYear = statsSeason !== 2026
const teamDefenseLeaders = await getTeamDefenseLeaders(statsSeason, 10)
const teamFgLeaders = await getTeamFgLeaders(statsSeason, 10)
  // ── QB / WR radar cyclers (below the 75/25 row) ──────────────────────
  // Independent from the Promise.all above since these depend on
  // qbLeaders/wrLeaders already having resolved. getQbRadarProfile /
  // getWrRadarProfile return null for anyone who doesn't clear the
  // qualification floor (100+ attempts / 30+ targets) -- filtered out
  // below rather than passed through as a broken entry.
  const [top5QbRadarsRaw, top5WrRadarsRaw] = await Promise.all([
    Promise.all(qbLeaders.slice(0, 5).map((l) => getQbRadarProfile(l.gsisId, statsSeason))),
    Promise.all(wrLeaders.slice(0, 5).map((l) => getWrRadarProfile(l.gsisId, statsSeason))),
  ])
  const teamYardsLeaders = await getTeamYardsLeaders(statsSeason, 10)

  const top5QbRadars = qbLeaders
    .slice(0, 5)
    .map((l, i) => (top5QbRadarsRaw[i] ? { profile: top5QbRadarsRaw[i]!, name: l.fullName } : null))
    .filter((x): x is { profile: NonNullable<(typeof top5QbRadarsRaw)[number]>; name: string } => x != null)

  const top5WrRadars = wrLeaders
    .slice(0, 5)
    .map((l, i) => (top5WrRadarsRaw[i] ? { profile: top5WrRadarsRaw[i]!, name: l.fullName, teamAbbr: l.teamId } : null))
    .filter((x): x is { profile: NonNullable<(typeof top5WrRadarsRaw)[number]>; name: string; teamAbbr: string } => x != null)

  return (
    <>
      <SiteHeader />
      <NflHomeClient
        statsSeason={statsSeason}
        week={week}
        games={games}
        teams={teams}
        qbLeaders={qbLeaders}
        rbLeaders={rbLeaders}
        wrLeaders={wrLeaders}
        teLeaders={teLeaders}
        advLeaders={advLeaders}
        standings={standings}
        fantasyLeaders={fantasyLeaders}
        fantasyProjections={fantasyProjections}
        intLeaders={intLeaders}
        tflLeaders={tflLeaders}
        turnoverLeaders={turnoverLeaders}
        fgLeaders={fgLeaders}
        leagueLeaders={leagueLeaders}
        teamStrength={teamStrength}
        isLastYear={isLastYear}
           top5QbRadars={top5QbRadars}
        top5WrRadars={top5WrRadars}
             teamYardsLeaders={teamYardsLeaders}
        teamDefenseLeaders={teamDefenseLeaders}
        teamFgLeaders={teamFgLeaders}
        leagueCoverageTrend={leagueCoverageTrend}
        leagueRouteTrend={leagueRouteTrend}
        leagueRushPassTrend={leagueRushPassTrend}
        leagueSchemeTrend={leagueSchemeTrend}
       biggestRushMover={biggestRushMover}
        biggestPassMover={biggestPassMover}
        biggestReceivingMover={biggestReceivingMover}
        biggestFantasyMover={biggestFantasyMover}
        biggestTeamMover={biggestTeamMover}
      />
 
    </>
  )
}