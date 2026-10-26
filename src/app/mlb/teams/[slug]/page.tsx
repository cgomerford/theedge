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
import type { Metadata } from 'next'
import FollowControl from '@/components/signup/FollowControl'
import { pageMeta, noindex } from '@/lib/seo'
import { fitDescription } from '@/lib/game-slug'
import { SportsTeamSchema, BreadcrumbSchema } from '@/components/StructuredData'
import { devPro } from '@/lib/dev-pro'
import { resolveViewer } from '@/lib/gate'

// Reading the subscriber session makes this route dynamic (per-request), like the
// Scout Report page. That is what lets the Pro "expand" panels be gated for real.
export const revalidate = 300

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const team = findTeamBySlug(slug)
  if (!team) return { title: 'Team not found', ...noindex() }
  const description = fitDescription(
    `${team.name} 2026: how the season has gone, rotation and bullpen ranks among the 30 clubs, pitch mix, offense, defense, roster and schedule, with the sample size beside each number.`,
    ['Free account.'],
  )
  return pageMeta({ title: `${team.name} 2026`, description, path: `/mlb/teams/${slug}` })
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
  const isPro = (subscriber?.is_pro ?? false) || devPro(sp.pro)
  // The team page's one gate (pitch quality by type): a free account may spend today's deep look on it.
  const gate = isPro ? { tier: 'pro' as const } : await resolveViewer('team_arsenal', slug)

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
      <SportsTeamSchema name={team.name} path={`/mlb/teams/${slug}`} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: team.name, path: `/mlb/teams/${slug}` }]} />
      <SiteHeader variant="page" />
      <TeamPage
        team={team}
        profile={profile}
        season={season}
        todayET={todayET}
        isPro={isPro}
        viewerTier={gate.tier}
        nextGame={nextGame}
        schedule={schedule}
        news={news}
        composition={composition}
        ilList={ilList}
        moves={moves}
        minors={minors}
        articlesSlot={<TeamArticles teamCode={team.abbrev} />}
        followSlot={<FollowControl kind="team" refId={slug} name={team.name} />}
      />
    </main>
  )
}
