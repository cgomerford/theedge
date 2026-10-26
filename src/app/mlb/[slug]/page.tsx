// src/app/mlb/[slug]/page.tsx
//
// 2026-10-26: tabs added (?tab=): Game Preview (default) · Pitchers · Batters · Bullpen & park · Series · Scout report (link).
// The old single-scroll page now lives under "Series" (team snapshots, key players, series stats, postgame links).
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
  getScheduleForDate, slugifyGame, teamLogoUrl, type MLBGame
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
import SeriesTeamStats from '@/components/game-preview/SeriesTeamStats'
import SeriesTopPerformers from '@/components/game-preview/SeriesTopPerformers'
import SeriesPostgameLinks from '@/components/game-preview/SeriesPostgameLinks'
import ShellPlaceholder from '@/components/game-preview/ShellPlaceholder'
import type { StartingPitcherData } from '@/components/game-preview/StartingPitcherPanel'
import type { PercentileRow } from '@/components/charts/types'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { getCurrentSubscriber } from '@/lib/auth'
import type { Metadata } from 'next'
import FollowControl from '@/components/signup/FollowControl'
import Tabs from '@/components/ui/Tabs'
import { TeamMark } from '@/components/home/Logo'
import { PreviewTab } from '@/components/game-cockpit/PreviewTab'
import { PitchersTab, BattersTab, BullpenParkTab, type CockpitCtx } from '@/components/game-cockpit/GameTabs'
import { resolveViewer } from '@/lib/gate'
import type { ViewerTier } from '@/lib/require-pro-types'
import { pageMeta, noindex } from '@/lib/seo'
import { parseGameSlug, gameTitle, fitDescription } from '@/lib/game-slug'
import { SportsEventSchema, BreadcrumbSchema } from '@/components/StructuredData'
import { devPro } from '@/lib/dev-pro'
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
import { SITE_URL } from '@/lib/site'

export const revalidate = 300 // lineups + probables refresh every 5 minutes
export const maxDuration = 60 // was 15; a brief Supabase stall (pitcher_stats took 7.8s) turned into a hard timeout

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string; tab?: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = parseGameSlug(slug)
  if (!p) return { title: 'Game preview', ...noindex() }
  const title = gameTitle(p)
  const description = fitDescription(
    `${p.awayName} at ${p.homeName} on ${p.dateLabel}: probable starters, lineups, bullpen workload and pitch data in plain numbers, with the sample size beside each stat.`,
    ['Free account.'],
  )
  return pageMeta({ title, description, path: `/mlb/${slug}`, type: 'article' })
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

// The Standard Stats modal reads only these four fields of MLB's raw split object; send nothing else (the rest of it would sit in the page payload).
function pickSit(raw: { avg?: unknown; era?: unknown; battersFaced?: unknown; plateAppearances?: unknown } | null): { avg?: unknown; era?: unknown; battersFaced?: unknown; plateAppearances?: unknown } | null {
  return raw ? { avg: raw.avg, era: raw.era, battersFaced: raw.battersFaced, plateAppearances: raw.plateAppearances } : null
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
    qualified: percentiles.qualified, trend, venueRecord, situational: { risp: pickSit(risp), basesEmpty: pickSit(basesEmpty) },
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
  slug: string; isPro: boolean; viewerTier: ViewerTier; freeLook: boolean; lookOpen: { feature: string; entityId: string } | null; gamePk: number; season: number
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
      {label ? <p className="text-[9px] uppercase tracking-widest text-stone-300 font-bold mb-3">{label}</p> : <div className="h-2.5 w-24 bg-stone-200 rounded mb-4" />}
      <div className="h-10 bg-stone-100 rounded" />
    </div>
  )
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
        <p className="text-[9px] uppercase tracking-widest text-orange-600 font-bold">Series Stats</p>
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
      <div className="gc-three">
        <SeriesTeamPlayerCard
          title="Home stats" abbr={ctx.home.abbr} rows={homeSeriesStats}
          gamePks={seriesGames.map(g => g.gamePk)}
        />
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-3">Series highlights</p>
          <SeriesMomentum
            momentum={seriesMomentum}
            awayAbbr={ctx.away.abbr} homeAbbr={ctx.home.abbr}
            awayColor={ctx.away.color} homeColor={ctx.home.color}
          />
          <div className="mt-4 pt-4 border-t border-stone-100">
            <p className="text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-3">Team stats — this series</p>
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
        <p className="text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-3">Top performers — this series</p>
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

export default async function GamePreview({ params, searchParams }: Props) {
  const { slug } = await params
  const { pro, tab: tabParam } = await searchParams
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  // The ONLY blocking work: who is viewing, and which game is this slug.
  const [subscriber, freshGames] = await Promise.all([
    getCurrentSubscriber(),
    getScheduleForDate(dateMatch[1]).catch(() => [] as MLBGame[]),
  ])
  // Never default to true (a `?? true` here once leaked Pro to logged-out users).
  // Local testing: add ?pro=1 under `next dev` (see lib/dev-pro.ts).
  const isPro = (subscriber?.is_pro ?? false) || devPro(pro)

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

  // The zone heatmaps are the page's one gate. A free account opens its daily look with a button; visiting does not spend it.
  const gate = isPro ? { tier: 'pro' as const, freeLook: false, state: 'pro' as const } : await resolveViewer('game_zones', String(game.gamePk))

  const ctx: GameCtx = {
    slug, isPro, viewerTier: gate.tier, freeLook: gate.freeLook, lookOpen: gate.state === 'look_left' ? { feature: 'game_zones', entityId: String(game.gamePk) } : null, gamePk: game.gamePk, season: new Date().getFullYear(),
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
  const tabIds = ['preview', 'pitchers', 'batters', 'bullpen', 'series'] as const
  const tab = (tabIds as readonly string[]).includes(String(tabParam)) ? String(tabParam) : 'preview'

  const cockpitCtx: CockpitCtx = {
    gamePk: ctx.gamePk, season: ctx.season, gameDate: dateMatch[1], venueId: game.venue?.id ?? null, venueName,
    home: { id: ctx.home.id, name: ctx.home.name, abbr: ctx.home.abbr, pitcherId: ctx.home.pitcherId, pitcherName: ctx.home.pitcherName },
    away: { id: ctx.away.id, name: ctx.away.name, abbr: ctx.away.abbr, pitcherId: ctx.away.pitcherId, pitcherName: ctx.away.pitcherName },
  }
  const dateLabel = new Date(`${dateMatch[1]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const seriesContext = game.seriesDescription && game.seriesDescription !== 'Regular Season' && game.seriesGameNumber
    ? `${game.seriesDescription} · Game ${game.seriesGameNumber}` : null
  const tabFallback = <div style={{ padding: '24px 0', fontSize: 14, color: '#8a8275' }}>Loading</div>

  return (
    <>
      <SportsEventSchema awayTeam={awayTeam.name} homeTeam={homeTeam.name} gameDate={game.gameDate} venue={venueName || null} path={`/mlb/${slug}`} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: `${awayTeam.name} at ${homeTeam.name}`, path: `/mlb/${slug}` }]} />
      <style>{`.gc-two{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.gc-three{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:16px;align-items:start}@media(max-width:900px){.gc-two,.gc-three{grid-template-columns:1fr}}`}</style>
      <SiteHeader variant="page" />
      <LiveTicker />
      <div className="min-h-screen" style={{ background: '#FAF8F3' }}>
        <div className="px-4 py-6" style={centered}>
          <header style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#1A1A1A' }}>{ctx.away.name} at {ctx.home.name}</h1>
            <div style={{ marginTop: 6, fontSize: 14, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>
              {dateLabel} · {ctx.gameTimeFormatted} · {venueName}{venueInfo?.city ? `, ${venueInfo.city}` : ''}{seriesContext ? ` · ${seriesContext}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginTop: 12 }}>
              {(['away', 'home'] as const).map(side => {
                const t = ctx[side]
                return (
                  <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TeamMark id={t.id} abbr={t.abbr} size={32} />
                    <div>
                      <div style={{ fontWeight: 800 }}>{t.name}</div>
                      {t.record ? <div style={{ fontSize: 13, color: '#8a8275', fontVariantNumeric: 'tabular-nums' }}>{t.record.wins}-{t.record.losses}</div> : null}
                    </div>
                    <FollowControl kind="team" refId={String(t.id)} name={t.name} />
                  </div>
                )
              })}
            </div>
          </header>

          <Suspense fallback={null}>
            <Tabs
              label="Game sections"
              defaultTab="preview"
              tabs={[
                { id: 'preview', label: 'Game Preview' },
                { id: 'pitchers', label: 'Pitchers' },
                { id: 'batters', label: 'Batters' },
                { id: 'bullpen', label: 'Bullpen & park' },
                { id: 'series', label: 'Series' },
                { id: 'scout', label: 'Scout report', href: `/mlb/${slug}/scout-report` },
              ]}
            />
          </Suspense>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'preview' && <Suspense fallback={tabFallback}><PreviewTab ctx={cockpitCtx} seriesLabel={seriesContext} /></Suspense>}
            {tab === 'pitchers' && (
              <Suspense fallback={tabFallback}>
                <PitchersTab ctx={cockpitCtx} zones={
                  <div className="gc-two">
                    {(['away', 'home'] as const).map(side => (
                      <Suspense key={side} fallback={<Skeleton h={260} label="Starting Pitcher" />}><PitcherAsync ctx={ctx} side={side} /></Suspense>
                    ))}
                  </div>
                } />
              </Suspense>
            )}
            {tab === 'batters' && (
              <Suspense fallback={tabFallback}>
                <BattersTab ctx={cockpitCtx} zones={
                  <div className="gc-two">
                    {(['away', 'home'] as const).map(side => {
                      const t = ctx[side]
                      const opp = ctx[side === 'home' ? 'away' : 'home']
                      return (
                        <Suspense key={side} fallback={battingCardFallback}>
                          <TeamBatterCard
                            slug={slug} teamId={t.id} gameDate={ctx.gameDateApi} gamePk={ctx.gamePk}
                            venueName={venueName} isPro={isPro} viewerTier={ctx.viewerTier} freeLook={ctx.freeLook} lookOpen={ctx.lookOpen}
                            opposingPitcherId={opp.pitcherId ?? null}
                            opposingPitcherName={opp.pitcherName ?? null}
                          />
                        </Suspense>
                      )
                    })}
                  </div>
                } />
              </Suspense>
            )}
            {tab === 'bullpen' && <Suspense fallback={tabFallback}><BullpenParkTab ctx={cockpitCtx} /></Suspense>}
            {tab === 'series' && (
              <div className="space-y-6" style={{ marginTop: 16 }}>
                <div className="gc-two">
                  {(['away', 'home'] as const).map(side => (
                    <Suspense key={side} fallback={<Skeleton h={180} label="Team Snapshot" />}><SnapshotAsync ctx={ctx} side={side} /></Suspense>
                  ))}
                </div>
                <div id="key-players">
                  <p className="text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-3">3 Key Players</p>
                  <Suspense fallback={<div className="p-8 text-center text-xs text-stone-400">Loading Key Players…</div>}>
                    <KeyPlayersSlotAsync slug={slug} isPro={isPro} />
                  </Suspense>
                </div>
                <Suspense fallback={null}><SeriesBelowAsync ctx={ctx} /></Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
