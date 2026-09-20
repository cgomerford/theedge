// src/components/TeamsSlotAsync.tsx
//
// Async Server Component for the Teams tab, extracted from
// mlb/[slug]/page.tsx's slotTeams block so it streams independently under
// <Suspense> instead of blocking the whole page (including the default
// Read tab) on injuries/transactions/minors/lineups/hot-cold data. Same
// self-contained pattern as ScoutSlotAsync/PitchingSlotAsync/BattingSlotAsync
// — own game lookup, own data fetching, no props threaded from the parent.
// getTeamILList and getProjectedLineup are React `cache()`-wrapped, so the
// calls this makes that overlap with KeyPlayersSlotAsync/other slots dedupe
// for free within the same request.

import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import { getProjectedLineup } from '@/lib/lineups'
import { getTeamILList, getTeamTransactions } from '@/lib/team-transactions'
import { getAffiliateStandouts } from '@/lib/team-minors'
import { getHotColdStreaks } from '@/lib/hot-cold'
import TeamIntelExtras from '@/components/TeamIntelExtras'
import LineupCompare from '@/components/LineupCompare'
import HotColdStreaks from '@/components/HotColdStreaks'

export default async function TeamsSlotAsync({ slug }: { slug: string }) {
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) return null

  let game: MLBGame | null = null
  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {}
  if (!game) {
    const { data: cached } = await supa.from('game_previews').select('raw_data').eq('slug', slug).single()
    if (cached?.raw_data) game = cached.raw_data as MLBGame
  }
  if (!game) return <div className="p-8 text-center text-stone-400 font-mono text-xs">Teams unavailable for this game.</div>

  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'

  const [subscriber, awayLineup, homeLineup, awayInjuries, homeInjuries, awayTransactions, homeTransactions, awayStandouts, homeStandouts] = await Promise.all([
    getCurrentSubscriber(),
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getTeamTransactions(game.teams.away.team.id),
    getTeamTransactions(game.teams.home.team.id),
    getAffiliateStandouts(game.teams.away.team.id, new Date().getFullYear()),
    getAffiliateStandouts(game.teams.home.team.id, new Date().getFullYear()),
  ])
  const isPro = subscriber?.is_pro ?? true

  const awayCallups = awayTransactions.filter((t: any) => t.category === 'CALLUP' || t.is_milb_move)
  const homeCallups = homeTransactions.filter((t: any) => t.category === 'CALLUP' || t.is_milb_move)

  const streakRows = await getHotColdStreaks(
    awayLineup?.batters ?? [], homeLineup?.batters ?? [],
    _awayAbbr, _homeAbbr,
  )

  return (
    <div className="space-y-10">
      <TeamIntelExtras
        awayTeamName={game.teams.away.team.name} homeTeamName={game.teams.home.team.name}
        awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayInjuries={awayInjuries} homeInjuries={homeInjuries}
        awayCallups={awayCallups} homeCallups={homeCallups}
        awayStandouts={awayStandouts} homeStandouts={homeStandouts}
      />
      <div>
        <h3 className="text-xs font-mono uppercase tracking-widest font-bold mb-4 text-orange-600">§ Projected lineups</h3>
        <LineupCompare
          awayBatters={awayLineup?.batters ?? []} homeBatters={homeLineup?.batters ?? []}
          awayAbbr={_awayAbbr} homeAbbr={_homeAbbr} isPro={isPro}
        />
      </div>
      <HotColdStreaks
        rows={streakRows} awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayTeamName={game.teams.away.team.name} homeTeamName={game.teams.home.team.name}
      />
    </div>
  )
}
