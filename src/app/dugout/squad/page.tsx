import { getCurrentSubscriber } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'
// Change line 5 in page.tsx to this:
import SquadBuilder from './SquadBuilder'
import type { PoolPlayer, SquadLineup } from '@/lib/ultimate-team-types'

export const metadata = {
  title: 'My Squad · The Edge',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SquadPage() {
  const subscriber = await getCurrentSubscriber()

  if (!subscriber) {
    redirect('/login?from=/dugout/squad')
  }

  if (!subscriber.is_pro && subscriber.role !== 'admin') {
    redirect('/dugout?upgrade=pro')
  }

  const supa = createAdminClient()

  // Load existing squad
  const { data: squad } = await supa
    .from('ultimate_team_squads')
    .select('lineup, squad_grade, total_percentile')
    .eq('subscriber_id', subscriber.id)
    .single()

  const lineup = (squad?.lineup ?? {}) as SquadLineup
  const playerIds = Object.values(lineup).filter((id): id is number => id != null)

  // Resolve players
  let players: Record<number, PoolPlayer> = {}
  if (playerIds.length > 0) {
    const { data: rows } = await supa
      .from('ultimate_team_players')
      .select('*')
      .in('player_id', playerIds)

    for (const p of (rows ?? []) as PoolPlayer[]) {
      players[p.player_id] = p
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0f0d]">
      <SiteHeader variant="page" />
      <SquadBuilder
        initialLineup={lineup}
        initialPlayers={players}
        initialGrade={squad?.squad_grade ?? null}
        initialPercentile={squad?.total_percentile ?? null}
      />
    </main>
  )
}