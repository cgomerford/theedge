// src/components/PitchingSlotAsync.tsx
//
// Async Server Component for the Pitching Lab tab, extracted from
// mlb/[slug]/page.tsx's slotPitching block so it streams independently
// under <Suspense> instead of blocking the rest of the page.
//
// Self-contained: does its own game lookup, subscriber/isPro check, and
// team-color resolution rather than depending on props threaded from the
// parent — same reasoning as ScoutSlotAsync. countTendency/sequencing are
// fetched here independently even though slotBatting (still inline in
// page.tsx for now) also needs them — accepted duplicate fetching until
// Batting Lab gets the same extraction treatment.

import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPitcherStatsFull, getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { getPitcherCountTendency, getPitcherSequencing } from '@/lib/pitcher-sequencing'
import { getBullpenData } from '@/lib/bullpen'
import { findTeamByName } from '@/lib/teams'
import PitchingTab from '@/components/PitchingTab'
import BullpenPanel from '@/components/BullpenPanel'

export default async function PitchingSlotAsync({ slug }: { slug: string }) {
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
  if (!game) return <div className="p-8 text-center text-stone-400 font-mono text-xs">Pitching Lab unavailable for this game.</div>

  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? false

  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const seasonYear = new Date().getFullYear()

  const [awayFullStats, homeFullStats, awayMovementDB, homeMovementDB] = await Promise.all([
    awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
    awayPitcherId ? getPitchMovementFromDB(awayPitcherId, seasonYear) : Promise.resolve([]),
    homePitcherId ? getPitchMovementFromDB(homePitcherId, seasonYear) : Promise.resolve([]),
  ])

  const [awayCountTendency, homeCountTendency, awaySequencing, homeSequencing] = await Promise.all([
    awayPitcherId ? getPitcherCountTendency(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherCountTendency(homePitcherId) : Promise.resolve({}),
    awayPitcherId ? getPitcherSequencing(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherSequencing(homePitcherId) : Promise.resolve({}),
  ])

  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1],
  )

  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'

  return (
    <div className="space-y-10">
      <PitchingTab
        awayPitcher={awayPitcherId ? {
          id: awayPitcherId,
          name: game.teams.away.probablePitcher?.fullName ?? 'TBD',
          abbr: game.teams.away.team.abbreviation ?? 'AWAY',
          side: 'Away starter', color: awayColor, fullStats: awayFullStats, movementRows: awayMovementDB,
          countTendency: awayCountTendency, sequencing: awaySequencing,
        } : null}
        homePitcher={homePitcherId ? {
          id: homePitcherId,
          name: game.teams.home.probablePitcher?.fullName ?? 'TBD',
          abbr: game.teams.home.team.abbreviation ?? 'HOME',
          side: 'Home starter', color: homeColor, fullStats: homeFullStats, movementRows: homeMovementDB,
          countTendency: homeCountTendency, sequencing: homeSequencing,
        } : null}
      />
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Bullpen availability</p>
        <BullpenPanel home={homeBullpen} away={awayBullpen} isPro={isPro} />
      </div>
    </div>
  )
}