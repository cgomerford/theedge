// src/app/fantasy/minors/team/[teamId]/page.tsx
//
// The Minor League team page. Reached from the Prospect Watch page's
// "Full farm system" link (now correctly pointing at MiLB team IDs) and
// from the future /fantasy/minors hub.

import { notFound } from 'next/navigation'
import {
  getMinorLeagueTeam,
  getMinorLeagueRoster,
  getMinorLeagueTeamStats,
  getMinorLeagueRecentOps,
} from '@/lib/fantasy-minors'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import MinorLeagueTeamBoard from './MinorLeagueTeamBoard'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const team = await getMinorLeagueTeam(Number(teamId))
  if (!team) return { title: 'Minor League Team · The Edge' }
  return {
    title: `${team.name} · ${team.level} · The Edge`,
    description: `Full roster and recent form for the ${team.name} — ${team.parentOrgName ?? ''} affiliate.`,
  }
}

export default async function MinorLeagueTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId: rawId } = await params
  const teamId = Number(rawId)
  if (!Number.isFinite(teamId)) notFound()

  const team = await getMinorLeagueTeam(teamId)
  if (!team) notFound()

  // Roster has to land first — the per-player stats fetchers need it to
  // know which players are hitters vs pitchers before they can request
  // the right stat group for each one.
  const roster = await getMinorLeagueRoster(teamId)
  const [seasonStats, recentOps] = await Promise.all([
    getMinorLeagueTeamStats(roster, team.sportId),
    getMinorLeagueRecentOps(roster, team.sportId),
  ])

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="prospects" isPro={true} />
      <MinorLeagueTeamBoard
        team={team}
        roster={roster}
        seasonStats={seasonStats}
        recentOps={recentOps}
      />
    </main>
  )
}
