// src/components/SeriesSlotAsync.tsx
//
// Async Server Component for the Series tab, extracted from
// mlb/[slug]/page.tsx's slotSeriesTab block so it streams independently
// under <Suspense>. Same self-contained pattern as the other *SlotAsync
// components. getSeriesGamesFromDB is React `cache()`-wrapped, so the
// overlap with page.tsx's own lightweight call (used only to decide
// whether to show the Series tab at all) and SidebarSlotAsync's series
// carousel dedupes for free within the same request.

import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getSeriesGamesFromDB, type SeriesGameResult } from '@/lib/series-games'
import { getEdgePredictionsByGamePks } from '@/lib/edge-fetch'
import { getSeriesBattingStatsFromDB } from '@/lib/series-stats'
import { getSeriesInningMomentum } from '@/lib/series-momentum'
import { findTeamByName } from '@/lib/teams'
import SeriesMomentum from '@/components/SeriesMomentum'
import SeriesPredictions from '@/components/SeriesPredictions'
import SeriesPlayerStats from '@/components/SeriesPlayerStats'

export default async function SeriesSlotAsync({ slug }: { slug: string }) {
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
  if (!game) return null

  const seriesGames: SeriesGameResult[] = await getSeriesGamesFromDB(game.gamePk)
  if (seriesGames.length === 0) return null

  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'
  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'

  const [seriesPredictionsByGamePk, awaySeriesStats, homeSeriesStats, seriesMomentum] = await Promise.all([
    getEdgePredictionsByGamePks(seriesGames.map(g => g.gamePk)),
    getSeriesBattingStatsFromDB(game.gamePk, game.teams.away.team.id),
    getSeriesBattingStatsFromDB(game.gamePk, game.teams.home.team.id),
    getSeriesInningMomentum(seriesGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, isFinal: g.isFinal }))),
  ])

  const seriesPredictionRows = seriesGames.map(g => {
    const p = seriesPredictionsByGamePk.get(g.gamePk)
    const gameSlug = slugifyGame({
      gamePk: g.gamePk, gameDate: g.officialDate, officialDate: g.officialDate,
      status: { detailedState: '', abstractGameState: '' },
      teams: {
        away: { team: { id: 0, name: game!.teams.away.team.name } },
        home: { team: { id: 0, name: game!.teams.home.team.name } },
      },
      venue: { name: '' },
    })
    return {
      gameNumber: g.gameNumber, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
      awayScore: g.awayScore, homeScore: g.homeScore, isFinal: g.isFinal,
      predicted_winner: p?.predicted_winner ?? null, confidence_tier: p?.confidence_tier ?? null,
      gameSlug,
    }
  })

  return (
    <div className="space-y-6">
      <SeriesMomentum
        momentum={seriesMomentum} awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayColor={awayColor} homeColor={homeColor}
      />
      <SeriesPredictions rows={seriesPredictionRows} />
      <SeriesPlayerStats
        awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayRows={awaySeriesStats} homeRows={homeSeriesStats}
        gamePks={seriesGames.map(g => g.gamePk)}
      />
    </div>
  )
}
