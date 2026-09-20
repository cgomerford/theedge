// src/app/mlb/teams/[slug]/page.tsx
//
// Team page. The redesign (2026-09) replaced the old "Dugout" view with a full
// club profile — see components/team/TeamPage.tsx. The old view and its
// exclusive components are in components/archive/ (not deleted).
//
// Data: getTeamProfile() does the league-wide ranking + season story + roster
// (fast, cached); everything else is the existing, already-verified data
// function it always was. New fetches go in their OWN Promise.all blocks
// (CLAUDE.md: never splice into a positional destructure).

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import { getMLBTeamNextGame, getMLBTeamNews } from '@/lib/mlb-homepage'
import { getTeamComposition } from '@/lib/team-composition'
import { getTeamTransactions } from '@/lib/team-transactions'
import { getTeamUpcomingSchedule } from '@/lib/team-schedule'
import { getAffiliateStandouts } from '@/lib/team-minors'
import { getTeamProfile } from '@/lib/team-profile'
import TeamArticles from '@/components/TeamArticles'
import TeamPage from '@/components/team/TeamPage'
import { getCurrentSubscriber } from '@/lib/auth'

// Reading the subscriber session makes this route dynamic (per-request), like the
// Scout Report page. That is what lets the Pro "expand" panels be gated for real.
export const revalidate = 300

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) return { title: 'Team not found · The Edge' }
  return {
    title: `${team.name} — season, staff, offense & roster · The Edge`,
    description: `${team.name} profile: how the season has gone, rotation and bullpen ranks, pitch mix, offense, defense, ABS challenges, roster and schedule.`,
  }
}

export default async function TeamRoute({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const team = findTeamBySlug(slug)
  if (!team) notFound()
  const mlbId = teamIdBySlug(slug)
  if (!mlbId) notFound()

  // isPro: the real subscriber flag. `next dev` only: Pro panels are unlocked
  // for local testing (same override the Scout Report page uses) — add ?pro=0
  // to the URL to preview the LOCKED state. NODE_ENV is 'production' on every
  // deployed build, so real visitors are gated by is_pro alone.
  const subscriber = await getCurrentSubscriber()
  const isPro = (subscriber?.is_pro ?? false) || (process.env.NODE_ENV === 'development' && sp.pro !== '0')

  const season = new Date().getFullYear()
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const profile = await getTeamProfile(mlbId, season, todayET)
  if (!profile) {
    console.error('[TeamRoute] getTeamProfile returned null for', slug)
    notFound()
  }

  const [nextGame, news, composition, transactions, schedule, minors] = await Promise.all([
    getMLBTeamNextGame(mlbId),
    getMLBTeamNews(slug, team.name),
    getTeamComposition(mlbId),
    getTeamTransactions(mlbId, 30),
    getTeamUpcomingSchedule(mlbId),
    getAffiliateStandouts(mlbId, season),
  ])
  const ilList = transactions.filter((t) => t.category === 'IL')
  const moves = transactions.filter((t) => t.category !== 'IL')

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <TeamPage
        team={team}
        profile={profile}
        season={season}
        todayET={todayET}
        isPro={isPro}
        nextGame={nextGame}
        schedule={schedule}
        news={news}
        composition={composition}
        ilList={ilList}
        moves={moves}
        minors={minors}
        articlesSlot={<TeamArticles teamCode={team.abbrev} />}
      />
    </main>
  )
}
