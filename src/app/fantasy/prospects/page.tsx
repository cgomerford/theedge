// src/app/fantasy/prospects/page.tsx
//
// Change vs prior version: pre-resolves each unique team_name to a MiLB
// team_id so ProspectsBoard can render a working link to the roster page.
// This is a one-off lookup per page render (~5-15 teams) hitting a
// 24h-cached endpoint — negligible cost, closes the "clicking does
// nothing" gap.

import { getCurrentSubscriber } from '@/lib/auth'
import { getFantasyPicks } from '@/lib/fantasy'
import { resolveTeamNameMap } from '@/lib/fantasy-minors'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import ProspectsBoard from './ProspectsBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Prospect Watch · The Edge Fantasy Desk',
  description: 'Minor league standouts and call-up-adjacent prospects worth stashing, organized by organization.',
}

export default async function ProspectsPage() {
  const [subscriber, { picks, forDate, isStale }] = await Promise.all([
    getCurrentSubscriber(),
    getFantasyPicks(),
  ])
  const isPro = subscriber?.is_pro ?? false

  // Group by team_name — falls back to "Unaffiliated" if null
  const byTeam = new Map<string, typeof picks.prospect>()
  for (const p of picks.prospect) {
    const key = p.team_name ?? 'Unaffiliated'
    if (!byTeam.has(key)) byTeam.set(key, [])
    byTeam.get(key)!.push(p)
  }
  const grouped = Array.from(byTeam.entries())
    .map(([team, prospects]) => ({ team, prospects }))
    .sort((a, b) => a.team.localeCompare(b.team))

  // Resolve team names → MiLB team ids for the roster links
  const teamNames = grouped.map(g => g.team).filter(n => n !== 'Unaffiliated')
  const teamIdByName = await resolveTeamNameMap(teamNames)

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="prospects" isPro={isPro} />
      <ProspectsBoard
        grouped={grouped}
        teamIdByName={teamIdByName}
        forDate={forDate}
        isStale={isStale}
      />
    </main>
  )
}
