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
import { Suspense, cache } from 'react'
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


// ─── Streaming architecture ───────────────────────────────────────────────────
//
// The page function awaits ONLY what the shell needs (who is viewing + which
// game this slug is). Everything else lives in async server components below,
// each inside its own <Suspense>, so the shell paints immediately and every
// section streams in as its own data arrives. (This used to be three chained
// `await Promise.all` stages before any HTML was sent — on Vercel that was 15s+
// and timed out; in dev everything was warm so it looked fine.)

// Per-request memoisation: several Suspense children need the same data
// (series games, prediction, team stats). React's cache() lets them share ONE
// fetch for the duration of the request. getSeriesGamesFromDB is already cached.
const loadPrediction = cache(getEdgePrediction)
const loadSp = cache(buildSpData)
const loadTeamStats = cache(getTeamSeasonStats)
const loadTeamVenue = cache(getTeamVenueRecord)

// One failing upstream must not take the whole page down. Log with a prefix and
// return an EMPTY value (never a fabricated one).
async function safe<T>(name: string, p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p
  } catch (e) {
    console.error(`[game-page:${name}] failed:`, e instanceof Error ? e.message : e)
    return empty
  }
}

type TeamCtx = {
  id: number; name: string; abbr: string; color: string; slug?: string
  record?: { wins: number; losses: number }
  pitcherId?: number; pitcherName?: string
}
type GameCtx = {
  slug: string; isPro: boolean; gamePk: number; season: number
  gameDateApi: string; gameDateIso: string; gameTimeFormatted: string; venueName: string
  home: TeamCtx; away: TeamCtx
}

function seriesHeaderFrom(seriesGames: SeriesGameResult[], gamePk: number) {
  if (seriesGames.length < 2) return null
  const tonight = seriesGames.find(g => g.gamePk === gamePk)
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
  return { gameNumber: tonight?.gameNumber ?? 1, totalGames: seriesGames.length, record }
}

// Skeleton blocks — same footprint idea as the real cards so the layout doesn't jump.
function Skeleton({ h, label }: { h: number; label?: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 animate-pulse" style={{ minHeight: h }} aria-busy="true">
      {label ? <p className="text-[9px] font-mono uppercase tracking-widest text-stone-300 font-bold mb-3">{label}</p> : <div className="h-2.5 w-24 bg-stone-200 rounded mb-4" />}
      <div className="h-10 bg-stone-100 rounded" />
    </div>
  )
}

// ── Banner: weather + series header stream in; matchup/time/venue are instant ──
async function BannerAsync({ ctx }: { ctx: GameCtx }) {
  const venueInfo = getVenueInfo(ctx.venueName)
  const [weather, seriesGames] = await Promise.all([
    venueInfo && !venueInfo.indoor
      ? safe('weather', getGameWeather(venueInfo.lat, venueInfo.lon, ctx.gameDateIso), null)
      : Promise.resolve(null),
    safe('series-games', getSeriesGamesFromDB(ctx.gamePk), [] as SeriesGameResult[]),
  ])
  return (
    <GameBriefBanner
      awayAbbr={ctx.away.abbr} homeAbbr={ctx.home.abbr}
      gameTimeFormatted={ctx.gameTimeFormatted}
      venueName={ctx.venueName} city={venueInfo?.city ?? null} isDome={venueInfo?.indoor ?? false}
      weather={weather} series={seriesHeaderFrom(seriesGames, ctx.gamePk)}
    />
  )
}

async function JumpNavAsync({ ctx }: { ctx: GameCtx }) {
  const seriesGames = await safe('series-games', getSeriesGamesFromDB(ctx.gamePk), [] as SeriesGameResult[])
  return <JumpNav hasSeries={seriesGames.length >= 2} hasPostgames={seriesGames.some(g => g.isFinal)} />
}

// ── Team snapshot ──
async function SnapshotAsync({ ctx, side }: { ctx: GameCtx; side: 'home' | 'away' }) {
  const t = ctx[side]
  const [seasonStats, venueRecord] = await Promise.all([
    safe('team-season-stats', loadTeamStats(t.id, ctx.season), null),
    safe('team-venue-record', loadTeamVenue(t.id, ctx.season, ctx.venueName), null),
  ])
  return (
    <TeamSnapshotCard
      teamName={t.name} teamAbbr={t.abbr} record={t.record}
      season={ctx.season} venueName={ctx.venueName} seasonStats={seasonStats} venueRecord={venueRecord}
      slug={ctx.slug} isPro={ctx.isPro}
    />
  )
}

// ── Starting pitcher (the heavy one: percentiles, arsenal, trend, venue, splits) ──
async function PitcherAsync({ ctx, side }: { ctx: GameCtx; side: 'home' | 'away' }) {
  const t = ctx[side]
  const sp = await safe('starting-pitcher', loadSp(t.pitcherId, t.pitcherName, t.abbr, t.color, ctx.venueName), null)
  return <TeamPitcherCard pitcherId={t.pitcherId} pitcherName={t.pitcherName} sp={sp} isPro={ctx.isPro} />
}

// ── Edge indicator ──
async function EdgeAsync({ ctx }: { ctx: GameCtx }) {
  const prediction = await safe('edge-prediction', loadPrediction(ctx.gamePk), null)
  if (!prediction) {
    return <ShellPlaceholder title="Edge Indicator" note="No prediction on record for this game yet." />
  }
  const edgeProps: EdgeIndicatorPanelProps = {
    edge_score: prediction.edge_score,
    predicted_winner: prediction.predicted_winner,
    confidence_tier: prediction.confidence_tier,
    components: prediction.components,
    components_raw: prediction.components_raw,
    is_pro: ctx.isPro,
    home_team: ctx.home.name,
    away_team: ctx.away.name,
    home_team_abbr: ctx.home.abbr,
    away_team_abbr: ctx.away.abbr,
    updated_at: prediction.updated_at,
    away_primary_color: ctx.away.color,
    home_primary_color: ctx.home.color,
    lineups_confirmed: prediction.lineups_confirmed,
    home_team_id: ctx.home.id,
    away_team_id: ctx.away.id,
    away_team_slug: ctx.away.slug,
    home_team_slug: ctx.home.slug,
    llm_narrative: prediction.narrative,
    llm_narrative_pro: prediction.narrative_pro,
    pro_takeaways: prediction.pro_takeaways,
  }
  return <EdgeIndicatorPanel {...edgeProps} />
}

// ── Series sections (below Key Players). Renders nothing for a one-off game. ──
async function SeriesBelowAsync({ ctx }: { ctx: GameCtx }) {
  const seriesGames = await safe('series-games', getSeriesGamesFromDB(ctx.gamePk), [] as SeriesGameResult[])
  if (seriesGames.length < 2) return null

  const postgameRows = seriesGames
    .filter(g => g.isFinal)
    .map(g => ({
      gameNumber: g.gameNumber,
      slug: seriesGameSlug(g, ctx.away.name, ctx.home.name),
      awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
      awayScore: g.awayScore, homeScore: g.homeScore,
    }))

  return (
    <>
      <div id="series-stats" className="space-y-4">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Series Stats</p>
        {/* The ~9 box-score / win-probability fetches live in here, off the critical path. */}
        <Suspense fallback={<Skeleton h={320} label="Loading series stats…" />}>
          <SeriesStatsAsync ctx={ctx} seriesGames={seriesGames} />
        </Suspense>
      </div>

      <div id="postgame">
        <SeriesPostgameLinks rows={postgameRows} />
      </div>
    </>
  )
}

async function SeriesStatsAsync({ ctx, seriesGames }: { ctx: GameCtx; seriesGames: SeriesGameResult[] }) {
  const finalGames = seriesGames.filter(g => g.isFinal)
  const finalGamePks = finalGames.map(g => g.gamePk)
  const finalGamesForGrading = finalGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr }))
  const hasFinals = finalGamePks.length > 0

  const [
    awaySeriesStats, homeSeriesStats, seriesMomentum, awaySeriesBoxStats, homeSeriesBoxStats,
    seriesPerformers, seriesRisp, awaySeriesPitchingStats, homeSeriesPitchingStats,
  ] = await Promise.all([
    safe('series-batting-away', getSeriesBattingStatsFromDB(ctx.gamePk, ctx.away.id), []),
    safe('series-batting-home', getSeriesBattingStatsFromDB(ctx.gamePk, ctx.home.id), []),
    safe('series-momentum', getSeriesInningMomentum(seriesGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, isFinal: g.isFinal }))), []),
    hasFinals ? safe('series-box-away', getSeriesTeamBoxscoreStats(finalGamePks, ctx.away.id), null) : Promise.resolve(null),
    hasFinals ? safe('series-box-home', getSeriesTeamBoxscoreStats(finalGamePks, ctx.home.id), null) : Promise.resolve(null),
    safe('series-performers', getPerformersForGames(finalGamesForGrading, 6), null),
    hasFinals ? safe('series-risp', getSeriesRispStats(finalGamePks), null) : Promise.resolve(null),
    hasFinals ? safe('series-pitching-away', getSeriesPitchingStats(finalGamePks, ctx.away.id), [] as SeriesPitcherLine[]) : Promise.resolve([] as SeriesPitcherLine[]),
    hasFinals ? safe('series-pitching-home', getSeriesPitchingStats(finalGamePks, ctx.home.id), [] as SeriesPitcherLine[]) : Promise.resolve([] as SeriesPitcherLine[]),
  ])

  const seriesTopBatters: BatterPerformance[] = seriesPerformers?.batters.available ? seriesPerformers.batters.items : []
  const seriesTopPitchers: PitcherPerformance[] = seriesPerformers?.pitchers.available ? seriesPerformers.pitchers.items : []
  const awaySeriesRispStats: SeriesRispStats | null = seriesRisp?.away ?? null
  const homeSeriesRispStats: SeriesRispStats | null = seriesRisp?.home ?? null

  return (
    <>
      <div className="grid lg:grid-cols-[1fr_1.1fr_1fr] gap-4 items-start">
        <SeriesTeamPlayerCard
          title="Home stats" abbr={ctx.home.abbr} rows={homeSeriesStats}
          gamePks={seriesGames.map(g => g.gamePk)}
        />
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Series highlights</p>
          <SeriesMomentum
            momentum={seriesMomentum}
            awayAbbr={ctx.away.abbr} homeAbbr={ctx.home.abbr}
            awayColor={ctx.away.color} homeColor={ctx.home.color}
          />
          <div className="mt-4 pt-4 border-t border-stone-100">
            <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-3">Team stats — this series</p>
            <SeriesTeamStats
              awayAbbr={ctx.away.abbr} homeAbbr={ctx.home.abbr}
              awayRows={awaySeriesStats} homeRows={homeSeriesStats}
              awayBoxStats={awaySeriesBoxStats} homeBoxStats={homeSeriesBoxStats}
              awayRispStats={awaySeriesRispStats} homeRispStats={homeSeriesRispStats}
            />
          </div>
        </div>
        <SeriesTeamPlayerCard
          title="Away stats" abbr={ctx.away.abbr} rows={awaySeriesStats}
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
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  // The ONLY blocking work: who is viewing, and which game is this slug.
  const [subscriber, freshGames] = await Promise.all([
    getCurrentSubscriber(),
    getScheduleForDate(dateMatch[1]).catch(() => [] as MLBGame[]),
  ])
  // Never default to true (a `?? true` here once leaked Pro to logged-out users).
  // `next dev` unlocks Pro so the paid views can be built and tested locally.
  const isPro = (subscriber?.is_pro ?? false) || process.env.NODE_ENV === 'development'

  let game: MLBGame | null = freshGames.find(g => slugifyGame(g) === slug) ?? null
  if (!game) {
    // Only hit the cache table when the live schedule didn't have the game.
    const { data: cached, error } = await supa.from('game_previews').select('raw_data').eq('slug', slug).maybeSingle()
    if (error) console.error('[game-page] game_previews lookup failed:', error.message)
    if (cached?.raw_data) game = cached.raw_data as MLBGame
  }
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
  const awayTeamMeta = findTeamByName(awayTeam.name)
  const homeTeamMeta = findTeamByName(homeTeam.name)
  const venueName = game.venue?.name ?? ''
  const venueInfo = getVenueInfo(venueName)

  const ctx: GameCtx = {
    slug, isPro, gamePk: game.gamePk, season: new Date().getFullYear(),
    gameDateApi: game.gameDate?.split('T')[0] ?? dateMatch[1],
    gameDateIso: game.gameDate,
    gameTimeFormatted: new Date(game.gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    }) + ' ET',
    venueName,
    home: {
      id: homeTeam.id, name: homeTeam.name, abbr: homeTeam.abbreviation ?? 'HOME',
      color: homeTeamMeta?.primary_color ?? '#1A1A1A', slug: homeTeamMeta?.slug,
      record: game.teams.home.leagueRecord,
      pitcherId: game.teams.home.probablePitcher?.id, pitcherName: game.teams.home.probablePitcher?.fullName,
    },
    away: {
      id: awayTeam.id, name: awayTeam.name, abbr: awayTeam.abbreviation ?? 'AWAY',
      color: awayTeamMeta?.primary_color ?? '#FF5722', slug: awayTeamMeta?.slug,
      record: game.teams.away.leagueRecord,
      pitcherId: game.teams.away.probablePitcher?.id, pitcherName: game.teams.away.probablePitcher?.fullName,
    },
  }

  const battingCardFallback = <Skeleton h={90} />

  return (
    <>
      <SiteHeader variant="page" />
      <LiveTicker />
      <Suspense fallback={<JumpNav hasSeries={false} hasPostgames={false} />}>
        <JumpNavAsync ctx={ctx} />
      </Suspense>
      <div className="min-h-screen bg-stone-50">
        <div className="px-4 py-6 space-y-6" style={centered}>

          <Suspense fallback={
            <GameBriefBanner
              awayAbbr={ctx.away.abbr} homeAbbr={ctx.home.abbr}
              gameTimeFormatted={ctx.gameTimeFormatted}
              venueName={venueName} city={venueInfo?.city ?? null} isDome={venueInfo?.indoor ?? false}
              weather={null} series={null} pending
            />
          }>
            <BannerAsync ctx={ctx} />
          </Suspense>

          {/* ── Home / Away team panels + Edge Indicator ── */}
          <div className="grid lg:grid-cols-[1fr_1fr_340px] gap-4 items-start">
            {(['home', 'away'] as const).map(side => {
              const t = ctx[side]
              const opp = ctx[side === 'home' ? 'away' : 'home']
              return (
                <section key={side} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <img src={teamLogoUrl(t.id)} alt="" className="w-5 h-5 object-contain" />
                    <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">
                      {side === 'home' ? 'Home' : 'Away'} — {t.name}
                    </h2>
                  </div>
                  <Suspense fallback={<Skeleton h={180} label="Team Snapshot" />}>
                    <SnapshotAsync ctx={ctx} side={side} />
                  </Suspense>
                  <Suspense fallback={<Skeleton h={260} label="Starting Pitcher" />}>
                    <PitcherAsync ctx={ctx} side={side} />
                  </Suspense>
                  <Suspense fallback={battingCardFallback}>
                    <TeamBatterCard
                      slug={slug} teamId={t.id} gameDate={ctx.gameDateApi} gamePk={ctx.gamePk}
                      venueName={venueName} isPro={isPro}
                      opposingPitcherId={opp.pitcherId ?? null}
                      opposingPitcherName={opp.pitcherName ?? null}
                    />
                  </Suspense>
                </section>
              )
            })}

            <section className="space-y-3">
              <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">Edge Indicator</h2>
              <Suspense fallback={<Skeleton h={320} />}>
                <EdgeAsync ctx={ctx} />
              </Suspense>
            </section>
          </div>

          {/* ── 3 Key Players (independent stream) ── */}
          <div id="key-players">
            <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">3 Key Players</p>
            <Suspense fallback={<div className="p-8 text-center font-mono text-xs text-stone-400">Loading Key Players…</div>}>
              <KeyPlayersSlotAsync slug={slug} isPro={isPro} />
            </Suspense>
          </div>

          {/* ── Series stats + postgame links (only when the game is part of a tracked series) ── */}
          <Suspense fallback={null}>
            <SeriesBelowAsync ctx={ctx} />
          </Suspense>

        </div>
      </div>
    </>
  )
}
