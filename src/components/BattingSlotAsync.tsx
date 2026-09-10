// src/components/BattingSlotAsync.tsx
//
// Async Server Component for the Batting Lab tab, extracted from
// mlb/[slug]/page.tsx's slotBatting block so it streams independently
// under <Suspense>. Rebuilds the full "lineup + pitch-type splits" chain
// independently (game lookup, projected lineups, batter_pitch_type_splits
// query, zone arsenal map, opposing pitcher count tendency) rather than
// depending on props threaded from the parent — same reasoning as
// ScoutSlotAsync and PitchingSlotAsync. This duplicates fetches also made
// by ScoutSlotAsync (projected lineups) and PitchingSlotAsync (count
// tendency) — accepted tradeoff for independent Suspense resolution;
// worth revisiting once all slots are extracted and duplicate fetching
// across slots can be addressed as a single follow-up pass (e.g. request
// memoization via React `cache()`, already used elsewhere in this
// codebase for getBatterRawPitchLog).

import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getProjectedLineup } from '@/lib/lineups'
import { getPitcherCountTendency } from '@/lib/pitcher-sequencing'
import { getLineupZoneArsenal } from '@/lib/batter-zone-arsenal'
import { findTeamByName } from '@/lib/teams'
import BattingTab, { type LineupBatterForLab } from '@/components/BattingTab'
import type { BatterPitchSplitForScout } from '@/lib/scout'

export default async function BattingSlotAsync({ slug }: { slug: string }) {
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
  if (!game) return <div className="p-8 text-center text-stone-400 font-mono text-xs">Batting Lab unavailable for this game.</div>

  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'

  const [awayLineup, homeLineup] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
  ])

  const awayLineupBatterIds: number[] = (awayLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)
  const homeLineupBatterIds: number[] = (homeLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)

  const [awayCountTendency, homeCountTendency] = await Promise.all([
    awayPitcherId ? getPitcherCountTendency(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherCountTendency(homePitcherId) : Promise.resolve({}),
  ])

  const [awayBatterZoneArsenalMap, homeBatterZoneArsenalMap] = await Promise.all([
    getLineupZoneArsenal(awayLineupBatterIds),
    getLineupZoneArsenal(homeLineupBatterIds),
  ])

  const _allZoneClashIds = [...new Set([...awayLineupBatterIds, ...homeLineupBatterIds])]
  const { data: _pitchSplitRows } = _allZoneClashIds.length > 0
    ? await supa.from('batter_pitch_type_splits')
        .select('player_id, pitch_type, pitch_name, pa, ba, whiff_percent, est_woba, hard_hit_percent')
        .in('player_id', _allZoneClashIds)
    : { data: [] as any[] }

  const _splitsByPlayer = new Map<number, BatterPitchSplitForScout[]>()
  for (const row of (_pitchSplitRows ?? [])) {
    const list = _splitsByPlayer.get(row.player_id) ?? []
    list.push({
      pitch_type: row.pitch_type,
      pitch_name: row.pitch_name ?? null,
      pa: row.pa != null ? Number(row.pa) : null,
      ba: row.ba != null ? Number(row.ba) : null,
      whiff_percent: row.whiff_percent != null ? Number(row.whiff_percent) : null,
      est_woba: row.est_woba != null ? Number(row.est_woba) : null,
      hard_hit_percent: row.hard_hit_percent != null ? Number(row.hard_hit_percent) : null,
    })
    _splitsByPlayer.set(row.player_id, list)
  }

  function _buildLineupForLab(batters: any[] | undefined): LineupBatterForLab[] {
    return (batters ?? [])
      .map((b: any, i: number) => {
        const playerId = b?.player_id
        if (!playerId) return null
        return {
          player_id: playerId,
          player_name: b?.player_name ?? 'Unknown',
          batting_order: i + 1,
          splits: _splitsByPlayer.get(playerId) ?? [],
        }
      })
      .filter((b): b is LineupBatterForLab => b !== null)
  }

  const _awayLineupForLab = _buildLineupForLab(awayLineup?.batters)
  const _homeLineupForLab = _buildLineupForLab(homeLineup?.batters)

  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'

  return (
    <BattingTab
      away={awayLineup?.batters?.length ? {
        abbr: _awayAbbr,
        name: game.teams.away.team.name,
        color: awayColor,
        lineup: _awayLineupForLab,
        zoneArsenalByPlayer: awayBatterZoneArsenalMap,
        opposingPitcherCountTendency: homeCountTendency, // away batters face the HOME pitcher tonight
        opposingPitcherName: game.teams.home.probablePitcher?.fullName ?? 'TBD',
      } : null}
      home={homeLineup?.batters?.length ? {
        abbr: _homeAbbr,
        name: game.teams.home.team.name,
        color: homeColor,
        lineup: _homeLineupForLab,
        zoneArsenalByPlayer: homeBatterZoneArsenalMap,
        opposingPitcherCountTendency: awayCountTendency, // home batters face the AWAY pitcher tonight
        opposingPitcherName: game.teams.away.probablePitcher?.fullName ?? 'TBD',
      } : null}
    />
  )
}