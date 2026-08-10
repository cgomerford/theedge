import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import {
  getMLBTeamRecord,
  getMLBTeamNextGame,
  getMLBTeamLeaders,
  getMLBTeamNews,
} from '@/lib/mlb-homepage'
import { getTeamComposition } from '@/lib/team-composition'
import { getTeamRankings } from '@/lib/team-rankings'
import { getTeamTransactions } from '@/lib/team-transactions'
import { getTeamRoster, getRollingMetric, type TeamMetric, type RollingPoint } from '@/lib/lab'
import { getRosterGrades } from '@/lib/team-grades'
import { getTeamUpcomingSchedule } from '@/lib/team-schedule'
import { getAffiliateStandouts } from '@/lib/team-minors'
import TeamDugoutView from '@/components/TeamDugoutView'

// ── NEW: lineup optimizer + bullpen usage ──
import { fetchConfirmedLineup, fetchBatterSplits, optimizeLineupBySlotHistory } from '@/lib/lineup-optimizer'
import { getPlayerSlotProfiles } from '@/lib/lineup-slot-stats'
import { getBullpenReport, getRecentGamePks, getSeasonGamePks, getEligibleRelieverIds } from '@/lib/bullpen-usage'
import { getLast7DaysPitcherWorkload } from '@/lib/pitcher-workload'

export const revalidate = 60

const ROLLING_METRICS: TeamMetric[] = ['runs_per_game', 'team_era', 'errors_per_game', 'team_ops']

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) return { title: 'Team not found · The Edge' }
  return {
    title: `${team.name} · The Edge`,
    description: `${team.name} record, next game, roster grades and latest news.`,
  }
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) notFound()

  const mlbId = teamIdBySlug(slug)
  if (!mlbId) notFound()

  const season = new Date().getFullYear()

  // Roster is fetched first and standalone (not inside the big Promise.all)
  // because getRosterGrades depends on the list of player IDs from it.
  const roster = await getTeamRoster(mlbId)

  const [
    record, nextGame, leaders, news, composition, rankings, allTransactions,
    grades, schedule, minors, rollingEntries,
  ] = await Promise.all([
    getMLBTeamRecord(mlbId),
    getMLBTeamNextGame(mlbId),
    getMLBTeamLeaders(mlbId),
    getMLBTeamNews(slug, team.name),
    getTeamComposition(mlbId),
    getTeamRankings(mlbId, season),
    getTeamTransactions(mlbId, 30),
    getRosterGrades(roster.map(p => p.id), season),
    getTeamUpcomingSchedule(mlbId),
    getAffiliateStandouts(mlbId, season),
    Promise.all(
      ROLLING_METRICS.map(async metric => {
        const points = await getRollingMetric({ subjectType: 'team', id: mlbId, metric, season, window: 10 })
        return [metric, points] as const
      })
    ),
  ])

  const rollingSeries = Object.fromEntries(rollingEntries) as Record<TeamMetric, RollingPoint[]>
  const ilList = allTransactions.filter((t: any) => t.category === 'IL')
  const moves = allTransactions.filter((t: any) => t.category !== 'IL')

  // ── NEW: shared game sample for lineup slot history ──
  // Lineup slot history still uses a recent-games sample (see
  // lib/lineup-slot-stats.ts) — only the bullpen module moved to full
  // season, per your request.
  const recentGamePks = await getRecentGamePks(mlbId, 15, 30)

  // ── NEW: Lineup data ──
  // Confirmed lineup only exists once MLB posts it (~60-90 min before
  // first pitch), and only for the NEXT game if it's today. If nextGame
  // is null or further out, fetchConfirmedLineup comes back null and the
  // LineupCard falls back to the Optimized view automatically.
  //
  // ASSUMPTION: nextGame has a `gamePk` field — I don't have
  // mlb-homepage.ts to confirm the exact MLBNextGame shape. If TypeScript
  // complains here, send that file over and I'll fix the field name.
  const batterIds = roster.filter(p => p.primaryPosition !== 'P').map(p => p.id)
  const [confirmedLineup, batterSplits, slotProfiles] = await Promise.all([
    nextGame ? fetchConfirmedLineup((nextGame as any).gamePk, nextGame.isHome) : Promise.resolve(null),
    fetchBatterSplits(batterIds, season),
    getPlayerSlotProfiles(mlbId, recentGamePks),
  ])
  const optimizedLineupVsRHP = optimizeLineupBySlotHistory(slotProfiles, batterSplits, 'R')
  const optimizedLineupVsLHP = optimizeLineupBySlotHistory(slotProfiles, batterSplits, 'L')

  // ── NEW: Bullpen data ──
  // Full season now (per your request) rather than a recent-games
  // sample — see the scope note at the top of lib/bullpen-usage.ts for
  // the fetch-volume tradeoff and the cron-job alternative if page load
  // ends up feeling slow.
  const seasonGamePks = await getSeasonGamePks(mlbId, season)
  const rawBullpenReport = await getBullpenReport(mlbId, seasonGamePks, season)

  // Eligible relievers: non-starter, real season-wide appearances >= 3
  // (not just appearances captured in this team's games — correct for
  // mid-season trades), AND currently on the active roster. `roster` is
  // already fetched above for the rest of the page.
  const currentRosterIds = new Set(roster.map(p => p.id))
  const relieverIds = await getEligibleRelieverIds(rawBullpenReport.relievers.map(r => r.playerId), season, currentRosterIds)
  const bullpenReport = {
    ...rawBullpenReport,
    relievers: rawBullpenReport.relievers.filter(r => relieverIds.has(r.playerId)),
  }

  // ── NEW: Last 7 days pitcher workload ──
  // Fetch unfiltered first so we can apply the same non-starter check as
  // the bullpen module (minAppearances=0 here — a reliever who's only
  // pitched once or twice in the last 7 days should still show up; we're
  // not gating on season-long volume for this view, just excluding true
  // starters and anyone off the roster).
  const rawWorkload = await getLast7DaysPitcherWorkload(mlbId)
  const workloadPitcherIds = rawWorkload.pitchers.map(p => p.playerId)
  const nonStarterRosterIds = await getEligibleRelieverIds(workloadPitcherIds, season, currentRosterIds, 0)
  const last7DaysWorkload = {
    ...rawWorkload,
    pitchers: rawWorkload.pitchers.filter(p => nonStarterRosterIds.has(p.playerId)),
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <TeamDugoutView
        team={team}
        mlbId={mlbId}
        record={record}
        nextGame={nextGame}
        leaders={leaders}
        news={news}
        composition={composition}
        rankings={rankings}
        moves={moves}
        ilList={ilList}
        roster={roster}
        grades={grades}
        schedule={schedule}
        minors={minors}
        rollingSeries={rollingSeries}
        confirmedLineup={confirmedLineup}
        optimizedLineupVsRHP={optimizedLineupVsRHP}
        optimizedLineupVsLHP={optimizedLineupVsLHP}
        bullpenReport={bullpenReport}
        last7DaysWorkload={last7DaysWorkload}
      />
    </main>
  )
}