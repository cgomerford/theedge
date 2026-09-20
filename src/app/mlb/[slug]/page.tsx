// src/app/mlb/[slug]/page.tsx
//
// REBUILT 2026-09-18 (per George's wireframe): Header/Ticker →
// [Home team panel | Away team panel | Edge Indicator] → Series header
// bar → [Player stats of the series + Series highlights | 3 Key Players]
// → Postgame reports of the series. Single scroll, no tabs — the old
// tabbed shell (GamePageShell + its *SlotAsync tab content) is archived
// at src/components/archive/, fully superseded by this layout.
//
// 2026-09-18 v3: "Pitching Radar & Arsenal" and "Batting Radar" are now
// real mini-preview cards (PitcherRadarMiniCard / BatterRadarMiniCard) —
// enough real content (percentile bars, top pitch, a mini hot-zone
// glance) to give the team panels genuine height instead of two thin
// placeholder boxes. Clicking either opens the full detail
// (StartingPitcherPanel / BattingPanel) in a grey-the-page-out
// DetailModal, same interaction language as the Edge Indicator's factor
// rows. This replaced a v2 that swapped the Edge Indicator column itself
// between views (RightRailContext/RightRail, now archived) — per George,
// the Edge Indicator should stay put and each mini-view should open its
// own overlay instead. A JumpNav below the Edge Indicator anchor-scrolls
// to the series/key-players/postgame sections further down the page.
//
// Still shelled out (see ShellPlaceholder usages): each pitcher's last 5
// starts, and team-level series highlight stats (LOB/K/BB/RISP trends).

import {
  getScheduleForDate, slugifyGame, teamLogoUrl, getGameWeather, type MLBGame
} from '@/lib/mlb'
import { getVenueInfo } from '@/lib/venues'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { after } from 'next/server'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import KeyPlayersSlotAsync from '@/components/KeyPlayersSlotAsync'
import { SeriesTeamPlayerCard } from '@/components/SeriesPlayerStats'
import SeriesMomentum from '@/components/SeriesMomentum'
import TeamPitcherCard from '@/components/game-preview/TeamPitcherCard'
import TeamBatterCard from '@/components/game-preview/TeamBatterCard'
import TeamSnapshotCard from '@/components/game-preview/TeamSnapshotCard'
import GameBriefBanner from '@/components/game-preview/GameBriefBanner'
import SeriesTeamStats from '@/components/game-preview/SeriesTeamStats'
import SeriesTopPerformers from '@/components/game-preview/SeriesTopPerformers'
import SeriesPostgameLinks from '@/components/game-preview/SeriesPostgameLinks'
import ShellPlaceholder from '@/components/game-preview/ShellPlaceholder'
import JumpNav from '@/components/game-preview/JumpNav'
import EdgeIndicatorPanel, { type EdgeIndicatorPanelProps } from '@/components/game-preview/EdgeIndicatorPanel'
import type { StartingPitcherData } from '@/components/game-preview/StartingPitcherPanel'
import type { PercentileRow } from '@/components/charts/types'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { getCurrentSubscriber } from '@/lib/auth'
import { findTeamByName } from '@/lib/teams'
import { getSeriesGamesFromDB, type SeriesGameResult } from '@/lib/series-games'
import { getSeriesBattingStatsFromDB, getSeriesTeamBoxscoreStats, getSeriesRispStats, getSeriesPitchingStats, type SeriesRispStats, type SeriesPitcherLine } from '@/lib/series-stats'
import { getSeriesInningMomentum } from '@/lib/series-momentum'
import { getPerformersForGames, type BatterPerformance, type PitcherPerformance } from '@/lib/mlb-recap'
import { getPitcherPercentiles } from '@/lib/pitcher-percentiles'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherTrend } from '@/lib/streaks'
import { getPitcherVenueRecord } from '@/lib/pitcher-venue-record'
import { fetchPitchingSplit } from '@/lib/player-splits'
import { getTeamSeasonStats, getTeamVenueRecord } from '@/lib/team-season-stats'

export const revalidate = 60
export const maxDuration = 60 // was 15; a brief Supabase stall (pitcher_stats took 7.8s) turned into a hard timeout

type Props = { params: Promise<{ slug: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  const dateStr = dateMatch?.[1] ?? ''
  const matchup = slug
    .replace(/-(\d{4}-\d{2}-\d{2})(-game\d+)?$/, '')
    .replace(/-at-/, ' at ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  const displayDate = dateStr
    ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
  const title = `${matchup}${displayDate ? ` — ${displayDate}` : ''} · The Edge`
  const description = `Pre-game analysis and a data-driven read for ${matchup}.`
  return {
    title, description,
    openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// Reconstructs a slug for another game in the same series from a
// SeriesGameResult — it only carries abbreviations, not team ids/full
// names, so this borrows tonight's game's team names (same two teams
// for every game in a series) the same way SeriesSlotAsync did before
// being archived.
function seriesGameSlug(g: SeriesGameResult, awayName: string, homeName: string) {
  return slugifyGame({
    gamePk: g.gamePk, gameDate: g.officialDate, officialDate: g.officialDate,
    status: { detailedState: '', abstractGameState: '' },
    teams: {
      away: { team: { id: 0, name: awayName } },
      home: { team: { id: 0, name: homeName } },
    },
    venue: { name: '' },
  })
}

// era/fip/whip/bb_pct/barrel_pct/hard_hit_pct are "lower is better" —
// matches PERCENTILE_COLS in lib/pitcher-percentiles.ts (not exported
// from there, so mirrored here rather than reworking that file's public
// shape for one caller).
const PITCHER_HIGHER_IS_BETTER: Record<string, boolean> = {
  era: false, fip: false, whip: false, k_pct: true, bb_pct: false,
  whiff_pct: true, chase_rate: true, barrel_pct: false, hard_hit_pct: false,
}

async function buildSpData(
  pitcherId: number | undefined, pitcherName: string | undefined,
  teamAbbr: string, teamColor: string, venueName: string,
): Promise<StartingPitcherData | null> {
  if (!pitcherId) return null
  const season = new Date().getFullYear()
  const [percentiles, arsenalBySplit, trend, venueRecords, risp, basesEmpty] = await Promise.all([
    getPitcherPercentiles(pitcherId, season),
    getPitcherZoneArsenal(pitcherId),
    getPitcherTrend(pitcherId, pitcherName ?? 'TBD'),
    getPitcherVenueRecord(pitcherId, season, 'season'),
    fetchPitchingSplit(pitcherId, season, 'risp'),
    fetchPitchingSplit(pitcherId, season, 'e'),
  ])

  const percentileRows: PercentileRow[] = percentiles.stats
    .filter((s): s is typeof s & { percentile: number } => s.percentile != null)
    .map(s => ({
      label: s.label, percentile: s.percentile, rawValue: s.value,
      higherIsBetter: PITCHER_HIGHER_IS_BETTER[s.key] ?? true,
    }))

  const allSplit = arsenalBySplit['all']
  const arsenal = allSplit
    ? Object.values(allSplit.arsenal)
      .sort((a, b) => (b.usage_pct ?? 0) - (a.usage_pct ?? 0))
      .map(p => {
        let whiffs = 0, swings = 0
        for (const z of Object.values(p.zones)) {
          whiffs += z.whiffs ?? 0
          swings += z.swings ?? 0
        }
        return {
          pitchName: p.pitch_name, usagePct: p.usage_pct, avgVelo: p.avg_velo,
          whiffPct: swings > 0 ? (whiffs / swings) * 100 : null,
        }
      })
    : []

  const venueRecord = venueName
    ? venueRecords.find(r => r.venue.trim().toLowerCase() === venueName.trim().toLowerCase()) ?? null
    : null

  return {
    pitcherId, pitcherName: pitcherName ?? 'TBD', teamAbbr, teamColor, percentileRows, arsenal,
    qualified: percentiles.qualified, trend, venueRecord, situational: { risp, basesEmpty },
  }
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  const [subscriber, freshGames, { data: cached }] = await Promise.all([
    getCurrentSubscriber(),
    getScheduleForDate(dateMatch[1]).catch(() => [] as MLBGame[]),
    supa.from('game_previews').select('*').eq('slug', slug).single(),
  ])
  const isPro = subscriber?.is_pro ?? true

  let game: MLBGame | null = freshGames.find(g => slugifyGame(g) === slug) ?? null
  if (!game && cached?.raw_data) game = cached.raw_data as MLBGame
  if (!game) notFound()

  // Cache-refresh side effect — doesn't need to block the response.
  const gameForUpsert = game
  after(() => {
    void supa.from('game_previews').upsert({
      slug, league: 'mlb', game_date: dateMatch[1], home_team: gameForUpsert.teams.home.team.name,
      away_team: gameForUpsert.teams.away.team.name, home_team_id: gameForUpsert.teams.home.team.id,
      away_team_id: gameForUpsert.teams.away.team.id, game_time: gameForUpsert.gameDate, venue: gameForUpsert.venue?.name,
      status: gameForUpsert.status?.detailedState, raw_data: gameForUpsert,
    }, { onConflict: 'slug' })
  })

  const awayTeam = game.teams.away.team
  const homeTeam = game.teams.home.team
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const awayTeamMeta = findTeamByName(awayTeam.name)
  const homeTeamMeta = findTeamByName(homeTeam.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'
  const awayAbbr = awayTeam.abbreviation ?? 'AWAY'
  const homeAbbr = homeTeam.abbreviation ?? 'HOME'

  const venueName = game.venue?.name ?? ''
  const venueInfo = getVenueInfo(venueName)
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'
  const season = new Date().getFullYear()

  const [
    prediction, seriesGames, spHome, spAway, weather,
    homeSeasonStats, awaySeasonStats, homeVenueRecord, awayVenueRecord,
  ] = await Promise.all([
    getEdgePrediction(game.gamePk),
    getSeriesGamesFromDB(game.gamePk),
    buildSpData(game.teams.home.probablePitcher?.id, game.teams.home.probablePitcher?.fullName, homeAbbr, homeColor, venueName),
    buildSpData(game.teams.away.probablePitcher?.id, game.teams.away.probablePitcher?.fullName, awayAbbr, awayColor, venueName),
    venueInfo && !venueInfo.indoor ? getGameWeather(venueInfo.lat, venueInfo.lon, game.gameDate) : Promise.resolve(null),
    getTeamSeasonStats(homeTeam.id, season),
    getTeamSeasonStats(awayTeam.id, season),
    getTeamVenueRecord(homeTeam.id, season, venueName),
    getTeamVenueRecord(awayTeam.id, season, venueName),
  ])
  const hasSeries = seriesGames.length >= 2

  // Series-derived data — header bar's Game X of Y, series W-L, player
  // stats, momentum chart, postgame links. All skipped when this game
  // isn't part of a tracked series.
  let seriesHeader: { gameNumber: number; totalGames: number; record: { away: number; home: number } } | null = null
  let awaySeriesStats: Awaited<ReturnType<typeof getSeriesBattingStatsFromDB>> = []
  let homeSeriesStats: Awaited<ReturnType<typeof getSeriesBattingStatsFromDB>> = []
  let seriesMomentum: Awaited<ReturnType<typeof getSeriesInningMomentum>> = []
  let awaySeriesBoxStats: Awaited<ReturnType<typeof getSeriesTeamBoxscoreStats>> | null = null
  let homeSeriesBoxStats: Awaited<ReturnType<typeof getSeriesTeamBoxscoreStats>> | null = null
  let awaySeriesRispStats: SeriesRispStats | null = null
  let homeSeriesRispStats: SeriesRispStats | null = null
  let awaySeriesPitchingStats: SeriesPitcherLine[] = []
  let homeSeriesPitchingStats: SeriesPitcherLine[] = []
  let seriesTopBatters: BatterPerformance[] = []
  let seriesTopPitchers: PitcherPerformance[] = []
  let postgameRows: { gameNumber: number; slug: string; awayAbbr: string; homeAbbr: string; awayScore: number | null; homeScore: number | null }[] = []

  if (hasSeries) {
    const tonight = seriesGames.find(g => g.gamePk === game!.gamePk)
    const record = seriesGames.reduce(
      (acc, g) => {
        if (g.isFinal && g.awayScore !== null && g.homeScore !== null) {
          if (g.awayScore > g.homeScore) acc.away += 1
          else if (g.homeScore > g.awayScore) acc.home += 1
        }
        return acc
      },
      { away: 0, home: 0 },
    )
    seriesHeader = { gameNumber: tonight?.gameNumber ?? 1, totalGames: seriesGames.length, record }

    postgameRows = seriesGames
      .filter(g => g.isFinal)
      .map(g => ({
        gameNumber: g.gameNumber,
        slug: seriesGameSlug(g, awayTeam.name, homeTeam.name),
        awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
        awayScore: g.awayScore, homeScore: g.homeScore,
      }))

    const finalGamePks = seriesGames.filter(g => g.isFinal).map(g => g.gamePk)
    const finalGamesForGrading = seriesGames
      .filter(g => g.isFinal)
      .map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr }))

    let seriesPerformers: Awaited<ReturnType<typeof getPerformersForGames>>
    let seriesRisp: Awaited<ReturnType<typeof getSeriesRispStats>> | null
    ;[
      awaySeriesStats, homeSeriesStats, seriesMomentum, awaySeriesBoxStats, homeSeriesBoxStats,
      seriesPerformers, seriesRisp, awaySeriesPitchingStats, homeSeriesPitchingStats,
    ] = await Promise.all([
      getSeriesBattingStatsFromDB(game.gamePk, awayTeam.id),
      getSeriesBattingStatsFromDB(game.gamePk, homeTeam.id),
      getSeriesInningMomentum(seriesGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, isFinal: g.isFinal }))),
      finalGamePks.length > 0 ? getSeriesTeamBoxscoreStats(finalGamePks, awayTeam.id) : Promise.resolve(null),
      finalGamePks.length > 0 ? getSeriesTeamBoxscoreStats(finalGamePks, homeTeam.id) : Promise.resolve(null),
      getPerformersForGames(finalGamesForGrading, 6),
      finalGamePks.length > 0 ? getSeriesRispStats(finalGamePks) : Promise.resolve(null),
      finalGamePks.length > 0 ? getSeriesPitchingStats(finalGamePks, awayTeam.id) : Promise.resolve([]),
      finalGamePks.length > 0 ? getSeriesPitchingStats(finalGamePks, homeTeam.id) : Promise.resolve([]),
    ])
    seriesTopBatters = seriesPerformers.batters.available ? seriesPerformers.batters.items : []
    seriesTopPitchers = seriesPerformers.pitchers.available ? seriesPerformers.pitchers.items : []
    awaySeriesRispStats = seriesRisp?.away ?? null
    homeSeriesRispStats = seriesRisp?.home ?? null
  }

  const edgeProps: EdgeIndicatorPanelProps | null = prediction ? {
    edge_score: prediction.edge_score,
    predicted_winner: prediction.predicted_winner,
    confidence_tier: prediction.confidence_tier,
    components: prediction.components,
    components_raw: prediction.components_raw,
    is_pro: isPro,
    home_team: homeTeam.name,
    away_team: awayTeam.name,
    home_team_abbr: homeAbbr,
    away_team_abbr: awayAbbr,
    updated_at: prediction.updated_at,
    away_primary_color: awayColor,
    home_primary_color: homeColor,
    lineups_confirmed: prediction.lineups_confirmed,
    home_team_id: homeTeam.id,
    away_team_id: awayTeam.id,
    away_team_slug: awayTeamMeta?.slug,
    home_team_slug: homeTeamMeta?.slug,
    llm_narrative: prediction.narrative,
    llm_narrative_pro: prediction.narrative_pro,
    pro_takeaways: prediction.pro_takeaways,
  } : null

  const battingCardFallback = (
    <div className="bg-white border border-stone-200 rounded-xl p-4 animate-pulse" aria-hidden="true">
      <div className="h-2.5 w-24 bg-stone-200 rounded mb-4" />
      <div className="h-14 bg-stone-100 rounded" />
    </div>
  )

  return (
    <>
      <SiteHeader variant="page" />
      <LiveTicker />
      <JumpNav hasSeries={hasSeries} hasPostgames={postgameRows.length > 0} />
      <div className="min-h-screen bg-stone-50">
        <div className="px-4 py-6 space-y-6" style={centered}>

          <GameBriefBanner
            awayAbbr={awayAbbr} homeAbbr={homeAbbr}
            gameTimeFormatted={gameTimeFormatted}
            venueName={venueName} city={venueInfo?.city ?? null} isDome={venueInfo?.indoor ?? false}
            weather={weather}
            series={hasSeries && seriesHeader ? seriesHeader : null}
          />

          {/* ── Home / Away team panels + Edge Indicator ── */}
          <div className="grid lg:grid-cols-[1fr_1fr_340px] gap-4 items-start">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <img src={teamLogoUrl(homeTeam.id)} alt="" className="w-5 h-5 object-contain" />
                <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">Home — {homeTeam.name}</h2>
              </div>
              <TeamSnapshotCard
                teamName={homeTeam.name} teamAbbr={homeAbbr} record={game.teams.home.leagueRecord}
                season={season} venueName={venueName} seasonStats={homeSeasonStats} venueRecord={homeVenueRecord}
                slug={slug} isPro={isPro}
              />
              <TeamPitcherCard
                pitcherId={game.teams.home.probablePitcher?.id}
                pitcherName={game.teams.home.probablePitcher?.fullName} sp={spHome} isPro={isPro}
              />
              <Suspense fallback={battingCardFallback}>
                <TeamBatterCard
                  slug={slug} teamId={homeTeam.id} gameDate={gameDateApi} gamePk={game.gamePk}
                  venueName={venueName} isPro={isPro}
                  opposingPitcherId={game.teams.away.probablePitcher?.id ?? null}
                  opposingPitcherName={game.teams.away.probablePitcher?.fullName ?? null}
                />
              </Suspense>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <img src={teamLogoUrl(awayTeam.id)} alt="" className="w-5 h-5 object-contain" />
                <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">Away — {awayTeam.name}</h2>
              </div>
              <TeamSnapshotCard
                teamName={awayTeam.name} teamAbbr={awayAbbr} record={game.teams.away.leagueRecord}
                season={season} venueName={venueName} seasonStats={awaySeasonStats} venueRecord={awayVenueRecord}
                slug={slug} isPro={isPro}
              />
              <TeamPitcherCard
                pitcherId={game.teams.away.probablePitcher?.id}
                pitcherName={game.teams.away.probablePitcher?.fullName} sp={spAway} isPro={isPro}
              />
              <Suspense fallback={battingCardFallback}>
                <TeamBatterCard
                  slug={slug} teamId={awayTeam.id} gameDate={gameDateApi} gamePk={game.gamePk}
                  venueName={venueName} isPro={isPro}
                  opposingPitcherId={game.teams.home.probablePitcher?.id ?? null}
                  opposingPitcherName={game.teams.home.probablePitcher?.fullName ?? null}
                />
              </Suspense>
            </section>

            <section className="space-y-3">
              <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">Edge Indicator</h2>
              {edgeProps ? (
                <EdgeIndicatorPanel {...edgeProps} />
              ) : (
                <ShellPlaceholder title="Edge Indicator" note="No prediction on record for this game yet." />
              )}
            </section>
          </div>

            {/* ── Series ── (Game X of Y / series record moved into GameBriefBanner up top).
                 3 Key Players stays full-width. Series Stats is now 3
                 columns — Home Stats / Series Highlights / Away Stats —
                 with a full-width "best graded players" reel underneath
                 the highlights card (was one stacked full-width block). */}
            {hasSeries && seriesHeader ? (
              <>
                <Suspense fallback={<div className="p-8 text-center font-mono text-xs text-stone-400">Loading Key Players…</div>}>
                  <div id="key-players">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">3 Key Players</p>
                    <KeyPlayersSlotAsync slug={slug} isPro={isPro} />
                  </div>
                </Suspense>

                <div id="series-stats" className="space-y-4">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Series Stats</p>
                  <div className="grid lg:grid-cols-[1fr_1.1fr_1fr] gap-4 items-start">
                    <SeriesTeamPlayerCard
                      title="Home stats" abbr={homeAbbr} rows={homeSeriesStats}
                      gamePks={seriesGames.map(g => g.gamePk)}
                    />
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Series highlights</p>
                      <SeriesMomentum
                        momentum={seriesMomentum}
                        awayAbbr={awayAbbr} homeAbbr={homeAbbr}
                        awayColor={awayColor} homeColor={homeColor}
                      />
                      <div className="mt-4 pt-4 border-t border-stone-100">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-3">Team stats — this series</p>
                        <SeriesTeamStats
                          awayAbbr={awayAbbr} homeAbbr={homeAbbr}
                          awayRows={awaySeriesStats} homeRows={homeSeriesStats}
                          awayBoxStats={awaySeriesBoxStats} homeBoxStats={homeSeriesBoxStats}
                          awayRispStats={awaySeriesRispStats} homeRispStats={homeSeriesRispStats}
                        />
                      </div>
                    </div>
                    <SeriesTeamPlayerCard
                      title="Away stats" abbr={awayAbbr} rows={awaySeriesStats}
                      gamePks={seriesGames.map(g => g.gamePk)}
                    />
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Top performers — this series</p>
                    <SeriesTopPerformers
                      batters={seriesTopBatters} pitchers={seriesTopPitchers}
                      awayBattingLines={awaySeriesStats} homeBattingLines={homeSeriesStats}
                      awayPitchingLines={awaySeriesPitchingStats} homePitchingLines={homeSeriesPitchingStats}
                    />
                  </div>
                </div>

                <div id="postgame">
                  <SeriesPostgameLinks rows={postgameRows} />
                </div>
              </>
            ) : (
              <div id="key-players">
                <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">3 Key Players</p>
                <Suspense fallback={<div className="p-8 text-center font-mono text-xs text-stone-400">Loading Key Players…</div>}>
                  <KeyPlayersSlotAsync slug={slug} isPro={isPro} />
                </Suspense>
              </div>
            )}

        </div>
      </div>
    </>
  )
}
