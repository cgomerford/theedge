// src/components/game-preview/TeamBatterCard.tsx
//
// "Select a Batter" box. Self-contained async Server Component (own
// getProjectedLineup fetch) so it can stream independently under
// <Suspense>, same pattern as the *SlotAsync components elsewhere in
// this app.
//
// Hot zones are pre-fetched for every batter in the lineup (cheap
// Supabase reads, real data, one row per player — nothing like the
// Savant-CSV N+1 problem flagged elsewhere in this codebase's history)
// so BatterSelector can switch between all 9 instantly. Team-wide
// streaks are fetched once here too. The heavier per-player lookups
// (park record, vs-pitcher, situational splits) are NOT pre-fetched —
// BatterSelector's Standard Stats modal fetches those on demand only for
// whichever batter is actually opened (see player-extra-stats route).

import { getProjectedLineup } from '@/lib/lineups'
import { getBatterHotZones, type BatterHotZones } from '@/lib/hot-zones'
import { getTopBatterStreaks, type BatterStreak } from '@/lib/streaks'
import BatterSelector from './BatterSelector'

export default async function TeamBatterCard({
  slug, teamId, gameDate, gamePk, venueName, opposingPitcherId, opposingPitcherName, isPro,
}: {
  slug: string
  teamId: number
  gameDate: string
  gamePk: number
  venueName: string
  opposingPitcherId: number | null
  opposingPitcherName: string | null
  isPro: boolean
}) {
  const season = new Date(gameDate).getFullYear()
  const lineup = await getProjectedLineup(teamId, gameDate, gamePk)

  const [hotZonesList, streaks] = await Promise.all([
    Promise.all(lineup.batters.map(b => getBatterHotZones(b.player_id))),
    getTopBatterStreaks(teamId),
  ])

  const hotZonesByBatter: Record<number, Record<string, BatterHotZones>> = {}
  lineup.batters.forEach((b, i) => { hotZonesByBatter[b.player_id] = hotZonesList[i] })

  const streaksByBatter: Record<number, BatterStreak> = {}
  streaks.all.forEach(s => { streaksByBatter[s.player_id] = s })

  return (
    <BatterSelector
      slug={slug}
      batters={lineup.batters}
      lineupSource={lineup.source}
      hotZonesByBatter={hotZonesByBatter}
      streaksByBatter={streaksByBatter}
      venueName={venueName}
      opposingPitcherId={opposingPitcherId}
      opposingPitcherName={opposingPitcherName}
      season={season}
      isPro={isPro}
    />
  )
}
