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
      />
    </main>
  )
}