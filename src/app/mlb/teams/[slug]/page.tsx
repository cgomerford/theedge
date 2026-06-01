// src/app/mlb/teams/[slug]/page.tsx
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import {
  getMLBTeamRecord,
  getMLBTeamNextGame,
  getMLBTeamLeaders,
  getMLBTeamNews,
} from '@/lib/mlb-homepage'
import TeamMiniDugout from './TeamMiniDugout'

export const revalidate = 1800

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) return { title: 'Team not found · The Edge' }
  return {
    title: `${team.name} · The Edge`,
    description: `${team.name} record, next game, team leaders and latest news.`,
  }
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) notFound()

  const mlbId = teamIdBySlug(slug)
  if (!mlbId) notFound()

  const [record, nextGame, leaders, news] = await Promise.all([
    getMLBTeamRecord(mlbId),
    getMLBTeamNextGame(mlbId),
    getMLBTeamLeaders(mlbId),
   getMLBTeamNews(slug, team.name),
  ])

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <TeamMiniDugout
        team={team}
        record={record}
        nextGame={nextGame}
        leaders={leaders}
        news={news}
      />
    </main>
  )
}