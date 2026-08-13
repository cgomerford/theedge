import {
  getScheduleForDate, slugifyGame, teamLogoUrl, getTeamForm, type MLBGame
} from '@/lib/mlb'
import { getDivisionStandings, getLeagueStandings } from '@/lib/standings'
import StandingsCard from '@/components/StandingsCard'
import RaceForOctober from '@/components/RaceForOctober'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { getTopBatterStreaks, getPitcherTrend } from '@/lib/streaks'
import { getLineupSpray } from '@/lib/batter-spray' 
import LiveTicker from '@/components/LiveTicker'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { findTeamByName } from '@/lib/teams'
import { getPitchVelocityRanges } from '@/lib/pitch-velocity'
import { getCurrentSubscriber } from '@/lib/auth'
import GamePageShell from '@/components/GamePageShell'
import { getUpcomingGameUmpire, getUmpireSeasonProfile } from '@/lib/umpire-scouting'
import { getSeasonGamePks } from '@/lib/bullpen-usage'

import ScrollProgress from '@/components/ScrollProgress'
import { getProjectedLineup } from '@/lib/lineups'
import LineupCompare from '@/components/LineupCompare'
import TeamIntelExtras from '@/components/TeamIntelExtras'
import PitchingTab from '@/components/PitchingTab'
import { getPitcherStatsFull, getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { getTeamILList, getTeamTransactions } from '@/lib/team-transactions'
import { getAffiliateStandouts } from '@/lib/team-minors'
import { getHotColdStreaks } from '@/lib/hot-cold'
import HotColdStreaks from '@/components/HotColdStreaks'
import BullpenPanel from '@/components/BullpenPanel'
import { getBullpenData } from '@/lib/bullpen'
import EdgeIndicator from '@/components/EdgeIndicator'
import Contrarian from '@/components/Contrarian'
import { getSeriesGames } from '@/lib/series-games'
import type { SeriesGameResult } from '@/lib/series-games'
import SeriesMomentum from '@/components/SeriesMomentum'
import SeriesCarousel from '@/components/SeriesCarousel'
import SeriesPredictions from '@/components/SeriesPredictions'
import SeriesPlayerStats from '@/components/SeriesPlayerStats'
import { getSeriesBattingStats } from '@/lib/series-stats'
import { getSeriesInningMomentum } from '@/lib/series-momentum'
import { getPitcherHotZones, getBatterHotZones } from '@/lib/hot-zones'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import ScoutReportTab from '@/components/ScoutReportTab'
import {
  buildScoutReport,
  type ScoutInputs,
  type TransactionForScout,
  type ArsenalPitch,
  type BatterPitchSplitForScout,
  type LineupBatterForScout,
} from '@/lib/scout'

async function getActiveRosterIds(teamId: number): Promise<Set<number>> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return new Set()
    const data = await res.json()
    return new Set((data.roster ?? []).map((r: any) => r.person?.id).filter(Boolean))
  } catch {
    return new Set()
  }
}
export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

// ─── Sidebar cards ────────────────────────────────────────────────────────────

function TrendsCard({ awayAbbr, homeAbbr, awayForm, homeForm }: {
  awayAbbr: string; homeAbbr: string; awayForm: any; homeForm: any
}) {
  if (!awayForm && !homeForm) return <Stub label="Team Forms" note="Form data unavailable for this game." />
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Team Forms</p>
      <div className="space-y-3">
        {[{ abbr: awayAbbr, form: awayForm }, { abbr: homeAbbr, form: homeForm }].map(({ abbr, form }) => form && (
          <div key={abbr}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-stone-900">{abbr}</span>
              <span className={`text-xs font-mono font-bold ${form.streak_type === 'W' ? 'text-green-600' : form.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                {form.streak}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
              <span>L10 <span className="text-stone-700 font-bold">{form.last_10_wins}-{form.last_10_losses}</span></span>
              <span>R/G <span className="text-stone-700 font-bold">{form.runs_per_game_l10?.toFixed(1) ?? '–'}</span></span>
              <span className={(form.run_diff_l10 ?? 0) > 0 ? 'text-green-600 font-bold' : (form.run_diff_l10 ?? 0) < 0 ? 'text-red-500 font-bold' : 'text-stone-700 font-bold'}>
                {(form.run_diff_l10 ?? 0) > 0 ? '+' : ''}{form.run_diff_l10?.toFixed(1) ?? '–'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stub({ label, note }: { label: string; note?: string }) {
  return (
    <div className="border border-dashed border-stone-300 rounded-xl p-6 text-center bg-stone-50/50 h-full flex flex-col items-center justify-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">{label}</p>
      {note && <p className="text-[10px] font-serif italic text-stone-400 leading-snug">{note}</p>}
    </div>
  )
}

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
  const description = `Pre-game analysis, Edge Score, and data-driven read for ${matchup}.`
  return {
    title, description,
    openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? true
  const isSignedIn = subscriber !== null

  const { data: cached } = await supa.from('game_previews').select('*').eq('slug', slug).single()
  let game: MLBGame | null = null
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {}
  if (!game && cached?.raw_data) game = cached.raw_data as MLBGame
  if (!game) notFound()

  await supa.from('game_previews').upsert({
    slug, league: 'mlb', game_date: dateMatch[1], home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name, home_team_id: game.teams.home.team.id,
    away_team_id: game.teams.away.team.id, game_time: game.gameDate, venue: game.venue?.name,
    status: game.status?.detailedState, raw_data: game,
  }, { onConflict: 'slug' })

  const gameState = game.status?.abstractGameState
  const isLive = gameState === 'Live'
  const isFinal = gameState === 'Final'
  const liveGame = game as any
  const liveScore = (isLive || isFinal) ? {
    awayRuns: liveGame.teams?.away?.score ?? 0,
    homeRuns: liveGame.teams?.home?.score ?? 0,
    isLive, isFinal,
  } : undefined

  // ── Umpire scouting ──────────────────────────────────────────────────────
  const umpireSeasonYear = new Date().getFullYear()
  const umpireName = await getUpcomingGameUmpire(game.gamePk)
  const umpireSeasonGamePks = umpireName ? await getSeasonGamePks(game.teams.home.team.id, umpireSeasonYear) : []
  const umpireProfile = umpireName ? await getUmpireSeasonProfile(umpireName, umpireSeasonGamePks) : null

  // ── Data fetching (unchanged from previous rev) ─────────────────────────
  const prediction = await getEdgePrediction(game.gamePk)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
const [awayStreakData, homeStreakData, awayPitcherTrend, homePitcherTrend] = await Promise.all([
  getTopBatterStreaks(game.teams.away.team.id),
  getTopBatterStreaks(game.teams.home.team.id),
  awayPitcherId ? getPitcherTrend(awayPitcherId, game.teams.away.probablePitcher?.fullName ?? '') : Promise.resolve(null),
  homePitcherId ? getPitcherTrend(homePitcherId, game.teams.home.probablePitcher?.fullName ?? '') : Promise.resolve(null),
])

const awayLiteralBatters = [...awayStreakData.hot, ...awayStreakData.cold]
const homeLiteralBatters = [...homeStreakData.hot, ...homeStreakData.cold]
  const [awayLineup, homeLineup] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
  ])

const [
    awayInjuries, homeInjuries,
    awayTransactions, homeTransactions,
    awayStandouts, homeStandouts,
    awayActiveRosterIds, homeActiveRosterIds,
  ] = await Promise.all([
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getTeamTransactions(game.teams.away.team.id),
    getTeamTransactions(game.teams.home.team.id),
    getAffiliateStandouts(game.teams.away.team.id, new Date().getFullYear()),
    getAffiliateStandouts(game.teams.home.team.id, new Date().getFullYear()),
    getActiveRosterIds(game.teams.away.team.id),
    getActiveRosterIds(game.teams.home.team.id),
  ])
  const awayCallups = awayTransactions.filter((t: any) => t.category === 'CALLUP' || t.is_milb_move)
  const homeCallups = homeTransactions.filter((t: any) => t.category === 'CALLUP' || t.is_milb_move)

  const seasonYear = new Date().getFullYear()
  const [awayFullStats, homeFullStats, awayMovementDB, homeMovementDB] = await Promise.all([
    awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
    awayPitcherId ? getPitchMovementFromDB(awayPitcherId, seasonYear) : Promise.resolve([]),
    homePitcherId ? getPitchMovementFromDB(homePitcherId, seasonYear) : Promise.resolve([]),
  ])
const [awayPitcherHotZones, homePitcherHotZones, awayPitcherArsenalZones, homePitcherArsenalZones] = await Promise.all([
    awayPitcherId ? getPitcherHotZones(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherHotZones(homePitcherId) : Promise.resolve({}),
    awayPitcherId ? getPitcherZoneArsenal(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherZoneArsenal(homePitcherId) : Promise.resolve({}),
  ])
const [awayPitcherVelocityRanges, homePitcherVelocityRanges] = await Promise.all([
    awayPitcherId ? getPitchVelocityRanges(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitchVelocityRanges(homePitcherId) : Promise.resolve({}),
  ])
  const awayPitcherThrows = (((awayFullStats as any)?.throws) ?? 'R') as 'L' | 'R'
  const homePitcherThrows = (((homeFullStats as any)?.throws) ?? 'R') as 'L' | 'R'

   const awayPitcherTTO = awayFullStats ? {
    tto1_woba: (awayFullStats as any).tto1_woba ?? null, tto2_woba: (awayFullStats as any).tto2_woba ?? null, tto3_woba: (awayFullStats as any).tto3_woba ?? null,
    tto1_pa: (awayFullStats as any).tto1_pa ?? null, tto2_pa: (awayFullStats as any).tto2_pa ?? null, tto3_pa: (awayFullStats as any).tto3_pa ?? null,
  } : null
  const homePitcherTTO = homeFullStats ? {
    tto1_woba: (homeFullStats as any).tto1_woba ?? null, tto2_woba: (homeFullStats as any).tto2_woba ?? null, tto3_woba: (homeFullStats as any).tto3_woba ?? null,
    tto1_pa: (homeFullStats as any).tto1_pa ?? null, tto2_pa: (homeFullStats as any).tto2_pa ?? null, tto3_pa: (homeFullStats as any).tto3_pa ?? null,
  } : null
  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1],
  )

  const streakRows = await getHotColdStreaks(
    awayLineup?.batters ?? [], homeLineup?.batters ?? [],
    game.teams.away.team.abbreviation ?? 'AWAY',
    game.teams.home.team.abbreviation ?? 'HOME',
  )

  const awayLineupBatterIds: number[] = (awayLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)
  const homeLineupBatterIds: number[] = (homeLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)
const [awayLineupSpray, homeLineupSpray] = await Promise.all([
    getLineupSpray(awayLineupBatterIds),
    getLineupSpray(homeLineupBatterIds),
  ])
  const [awayLineupZonesArr, homeLineupZonesArr] = await Promise.all([
    Promise.all(awayLineupBatterIds.map((id: number) => getBatterHotZones(id))),
    Promise.all(homeLineupBatterIds.map((id: number) => getBatterHotZones(id))),
  ])

  const awayLineupZones = awayLineupBatterIds.map((id: number, i: number) => ({
    playerId: id,
    playerName: (awayLineup?.batters?.[i] as any)?.player_name ?? 'Unknown',
    zones: awayLineupZonesArr[i],
  }))
  const homeLineupZones = homeLineupBatterIds.map((id: number, i: number) => ({
    playerId: id,
    playerName: (homeLineup?.batters?.[i] as any)?.player_name ?? 'Unknown',
    zones: homeLineupZonesArr[i],
  }))

  const [awayForm, homeForm] = await Promise.all([
    getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
  ])

  const seriesGames: SeriesGameResult[] = await getSeriesGames(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1], game.gamePk,
  )

  function gameChipDate(officialDate: string, isTonight: boolean): string {
    if (isTonight) return 'Tonight'
    return new Date(officialDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })
  }

  const seriesCarouselGames = seriesGames.map(g => ({
    gameNumber: g.gameNumber, gamePk: g.gamePk, date: gameChipDate(g.officialDate, g.isTonight),
    awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, awayScore: g.awayScore, homeScore: g.homeScore,
    isFinal: g.isFinal, isTonight: g.isTonight,
  }))

  const [seriesPredictionRows, awaySeriesStats, homeSeriesStats] = await Promise.all([
    Promise.all(seriesGames.map(async g => {
      const p = await getEdgePrediction(g.gamePk)
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
    })),
    getSeriesBattingStats(seriesGames.filter(g => g.isFinal).map(g => g.gamePk), game.teams.away.team.id),
    getSeriesBattingStats(seriesGames.filter(g => g.isFinal).map(g => g.gamePk), game.teams.home.team.id),
  ])

  const seriesMomentum = await getSeriesInningMomentum(
    seriesGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, isFinal: g.isFinal }))
  )

  const season = new Date().getFullYear()
  const [awayStandings, homeStandings] = await Promise.all([
    getDivisionStandings(game.teams.away.team.id, season),
    getDivisionStandings(game.teams.home.team.id, season),
  ])
  const awayRow = awayStandings?.teams.find(t => t.teamId === game!.teams.away.team.id) ?? null
  const homeRow = homeStandings?.teams.find(t => t.teamId === game!.teams.home.team.id) ?? null
  const [awayLeagueStandings, homeLeagueStandings] = await Promise.all([
    awayStandings ? getLeagueStandings(awayStandings.leagueId, season) : Promise.resolve([]),
    homeStandings ? getLeagueStandings(homeStandings.leagueId, season) : Promise.resolve([]),
  ])

  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'
  const awaySlug = (awayTeamMeta as any)?.slug ?? undefined
  const homeSlug = (homeTeamMeta as any)?.slug ?? undefined

  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  // ── Scout Report inputs ─────────────────────────────────────────────────
  const _scoutSeason = new Date().getFullYear()
  const [awayArsenalRes, homeArsenalRes] = await Promise.all([
    awayPitcherId
      ? supa.from('pitch_arsenals')
          .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
          .eq('player_id', awayPitcherId).eq('season', _scoutSeason)
          .order('percentage', { ascending: false })
      : Promise.resolve({ data: [] }),
    homePitcherId
     ? supa.from('pitch_arsenals')
          .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
          .eq('player_id', homePitcherId).eq('season', _scoutSeason)
          .order('percentage', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])
  const _awayArsenal: ArsenalPitch[] = (awayArsenalRes?.data ?? []) as ArsenalPitch[]
  const _homeArsenal: ArsenalPitch[] = (homeArsenalRes?.data ?? []) as ArsenalPitch[]

  // ── Zone Clash: lineup vs. opposing pitcher's arsenal ────────────────────
  // Reuses awayLineupBatterIds/homeLineupBatterIds (already computed above
  // from the existing getProjectedLineup() call) — deliberately NOT a new
  // lineup fetch. Runs off the predicted lineup, not requiring
  // lineups_confirmed (confirmed fine by George). Joins against
  // batter_pitch_type_splits (scripts/fetch_batter_pitch_splits.py, sourced
  // from Baseball Savant's Pitch Arsenal Stats leaderboard, batter mode).
  const _allZoneClashIds = [...new Set([...awayLineupBatterIds, ...homeLineupBatterIds])]

  const { data: _pitchSplitRows } = _allZoneClashIds.length > 0
    ? await supa.from('batter_pitch_type_splits')
        .select('player_id, pitch_type, pitch_name, pa, ba, whiff_percent, est_woba, hard_hit_percent')
        .in('player_id', _allZoneClashIds)
    : { data: [] as any[] }

  // Supabase numeric columns return as strings — explicit Number() coercion,
  // same rule as everywhere else in this codebase.
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

  // Batting order = array index + 1 — same assumption already relied on
  // elsewhere on this page (awayLineupZones/homeLineupZones map the same
  // way against awayLineup.batters / homeLineup.batters by index).
  function _buildLineupForScout(batters: any[] | undefined): LineupBatterForScout[] {
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
      .filter((b): b is LineupBatterForScout => b !== null)
  }

  const _awayLineupForScout = _buildLineupForScout(awayLineup?.batters)
  const _homeLineupForScout = _buildLineupForScout(homeLineup?.batters)

  const _projectedPlayerIds = new Set<number>(
    [
      ...(awayLineup?.batters?.map((b: any) => b?.player_id) ?? []),
      ...(homeLineup?.batters?.map((b: any) => b?.player_id) ?? []),
      awayPitcherId, homePitcherId,
    ].filter((id): id is number => typeof id === 'number' && id > 0)
  )
  const _scoutTransactions: TransactionForScout[] = [
    ...(awayTransactions ?? []), ...(homeTransactions ?? []),
  ].map((t: any) => ({
    player_name: t.player_name ?? '', category: t.category ?? '', type_code: t.type_code ?? '',
    description: t.description ?? '', transaction_date: t.transaction_date ?? '',
    il_days: t.il_days ?? null, injury_reason: t.injury_reason ?? null,
    affects_tonight: _projectedPlayerIds.has(t.player_id ?? -1),
  }))

  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'
  const _tonightIdx = seriesGames.findIndex(g => g.isTonight)
  const _seriesGameNumber = _tonightIdx >= 0
    ? seriesGames[_tonightIdx].gameNumber
    : (seriesGames[seriesGames.length - 1]?.gameNumber ?? null)
  const _finishedGames = seriesGames.filter(g => g.isFinal)
  const _awayWins = _finishedGames.filter(g => (g.awayScore ?? 0) > (g.homeScore ?? 0)).length
  const _homeWins = _finishedGames.filter(g => (g.homeScore ?? 0) > (g.awayScore ?? 0)).length
  const _seriesStanding = _finishedGames.length === 0
    ? null
    : _awayWins > _homeWins
      ? `${_awayAbbr} leads ${_awayWins}-${_homeWins}`
      : _homeWins > _awayWins
        ? `${_homeAbbr} leads ${_homeWins}-${_awayWins}`
        : `Series tied ${_awayWins}-${_homeWins}`

  const _teamRaw: any = prediction?.components_raw

  const _formDate = new Date().toISOString().split('T')[0]
  const _awayTeamShort = game.teams.away.team.name
  const _homeTeamShort = game.teams.home.team.name

  const [_awayFormRes, _homeFormRes] = await Promise.all([
    supa.from('player_form_signals')
      .select('player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games')
      .eq('computed_date', _formDate).eq('player_type', 'batter')
      .ilike('team_name', `%${_awayTeamShort.split(' ').slice(-1)[0]}%`)
      .order('magnitude', { ascending: false }).limit(3),
    supa.from('player_form_signals')
      .select('player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games')
      .eq('computed_date', _formDate).eq('player_type', 'batter')
      .ilike('team_name', `%${_homeTeamShort.split(' ').slice(-1)[0]}%`)
      .order('magnitude', { ascending: false }).limit(3),
  ])

  const _awayFormData = _awayFormRes?.data?.length
    ? _awayFormRes.data
    : (await supa.from('player_form_signals')
        .select('player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games')
        .lt('computed_date', _formDate).eq('player_type', 'batter')
        .ilike('team_name', `%${_awayTeamShort.split(' ').slice(-1)[0]}%`)
        .order('computed_date', { ascending: false })
        .order('magnitude', { ascending: false }).limit(3)).data ?? []

  const _homeFormData = _homeFormRes?.data?.length
    ? _homeFormRes.data
    : (await supa.from('player_form_signals')
        .select('player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games')
        .lt('computed_date', _formDate).eq('player_type', 'batter')
        .ilike('team_name', `%${_homeTeamShort.split(' ').slice(-1)[0]}%`)
        .order('computed_date', { ascending: false })
        .order('magnitude', { ascending: false }).limit(3)).data ?? []

const _toHotStreak = (row: any): import('@/lib/scout').HotStreakPlayer => ({
    player_id: row.player_id, player_name: row.player_name, team_abbr: row.team_name ?? '',
    player_type: row.player_type, signal: row.signal,
    signal_quality: row.signal_quality, metric: row.metric,
    current_value: Number(row.current_value), extreme_value: Number(row.extreme_value),
    magnitude: Number(row.magnitude),
    recentGameLog: Array.isArray(row.trend) ? row.trend.map(Number) : undefined,
    avg: row.avg != null ? Number(row.avg) : undefined,
    rbi: row.rbi != null ? Number(row.rbi) : undefined,
    runs: row.runs != null ? Number(row.runs) : undefined,
    walks: row.walks != null ? Number(row.walks) : undefined,
    games: row.games != null ? Number(row.games) : undefined,
  })

 const _awayInjuredIds = new Set((awayInjuries ?? []).map((i: any) => i.player_id).filter(Boolean))
  const _homeInjuredIds = new Set((homeInjuries ?? []).map((i: any) => i.player_id).filter(Boolean))

function dedupeByPlayerId(rows: ReturnType<typeof _toHotStreak>[]) {
    const byId = new Map<number, ReturnType<typeof _toHotStreak>>()
    for (const r of rows) {
      const existing = byId.get(r.player_id)
      if (!existing || r.magnitude > existing.magnitude) byId.set(r.player_id, r)
    }
    return Array.from(byId.values())
  }

  const awayRosterCheckAvailable = awayActiveRosterIds.size > 0
  const homeRosterCheckAvailable = homeActiveRosterIds.size > 0

  const _awayHotStreaks = dedupeByPlayerId(
    (_awayFormData ?? [])
      .map(_toHotStreak)
      .filter(s => !_awayInjuredIds.has(s.player_id) && (!awayRosterCheckAvailable || awayActiveRosterIds.has(s.player_id)))
  )
  const _homeHotStreaks = dedupeByPlayerId(
    (_homeFormData ?? [])
      .map(_toHotStreak)
      .filter(s => !_homeInjuredIds.has(s.player_id) && (!homeRosterCheckAvailable || homeActiveRosterIds.has(s.player_id)))
  )
  const scoutInputs: ScoutInputs = {
    homeAbbr: _homeAbbr, awayAbbr: _awayAbbr,
    homeTeamName: game.teams.home.team.name, awayTeamName: game.teams.away.team.name,
    awayPitcher: (awayPitcherId && awayFullStats) ? {
      player_id: awayPitcherId,
      player_name: game.teams.away.probablePitcher?.fullName ?? '',
      throws: ((awayFullStats as any).throws ?? null) as 'L' | 'R' | null,
      era: (awayFullStats as any).era ?? null, fip: (awayFullStats as any).fip ?? null,
    l3_era: (awayFullStats as any).l3_era ?? null,
      whip: (awayFullStats as any).whip ?? null,
      k_per_9: (awayFullStats as any).k_per_9 ?? null,
      bb_per_9: (awayFullStats as any).bb_per_9 ?? null,
      first_pitch_strike_pct: (awayFullStats as any).first_pitch_strike_pct ?? null,
      first_pitch_mix: (awayFullStats as any).first_pitch_mix ?? null,
      two_strike_mix: (awayFullStats as any).two_strike_mix ?? null,
        tto1_woba: (awayFullStats as any).tto1_woba ?? null,
      tto2_woba: (awayFullStats as any).tto2_woba ?? null,
      tto3_woba: (awayFullStats as any).tto3_woba ?? null,
      tto1_pa: (awayFullStats as any).tto1_pa ?? null,
      tto2_pa: (awayFullStats as any).tto2_pa ?? null,
      tto3_pa: (awayFullStats as any).tto3_pa ?? null,
      arsenal: _awayArsenal, season_pitches_thrown: null,
    } : null,
    homePitcher: (homePitcherId && homeFullStats) ? {
      player_id: homePitcherId,
      player_name: game.teams.home.probablePitcher?.fullName ?? '',
      throws: ((homeFullStats as any).throws ?? null) as 'L' | 'R' | null,
      era: (homeFullStats as any).era ?? null, fip: (homeFullStats as any).fip ?? null,
      l3_era: (awayFullStats as any).l3_era ?? null,
      whip: (awayFullStats as any).whip ?? null,
      k_per_9: (awayFullStats as any).k_per_9 ?? null,
      bb_per_9: (awayFullStats as any).bb_per_9 ?? null,
      first_pitch_strike_pct: (awayFullStats as any).first_pitch_strike_pct ?? null,
      first_pitch_mix: (homeFullStats as any).first_pitch_mix ?? null,
      two_strike_mix: (homeFullStats as any).two_strike_mix ?? null,
         tto1_woba: (awayFullStats as any).tto1_woba ?? null,
      tto2_woba: (awayFullStats as any).tto2_woba ?? null,
      tto3_woba: (awayFullStats as any).tto3_woba ?? null,
      tto1_pa: (awayFullStats as any).tto1_pa ?? null,
      tto2_pa: (awayFullStats as any).tto2_pa ?? null,
      tto3_pa: (awayFullStats as any).tto3_pa ?? null,
      arsenal: _homeArsenal, season_pitches_thrown: null,
    } : null,
    awayTeamStats: _teamRaw?.away_team ? {
      team_abbr: _awayAbbr, team_name: game.teams.away.team.name,
      runs_per_game_l30: _teamRaw.away_team.runs_per_game_l30 ?? null,
      ops_l30: _teamRaw.away_team.ops_l30 ?? null, iso: _teamRaw.away_team.iso ?? null,
      k_pct: _teamRaw.away_team.k_pct ?? null, bb_pct: _teamRaw.away_team.bb_pct ?? null,
      xwoba: _teamRaw.away_team.xwoba ?? null, hard_hit_pct: _teamRaw.away_team.hard_hit_pct ?? null,
      chase_pct_vs_rhp: _teamRaw.away_team.chase_pct_vs_rhp ?? null,
      chase_pct_vs_lhp: _teamRaw.away_team.chase_pct_vs_lhp ?? null,
      chase_pct_rank_mlb: _teamRaw.away_team.chase_pct_rank_mlb ?? null,
      first_pitch_swing_pct: _teamRaw.away_team.first_pitch_swing_pct ?? null,
      first_pitch_swing_rank_mlb: _teamRaw.away_team.first_pitch_swing_rank_mlb ?? null,
      two_strike_k_pct: _teamRaw.away_team.two_strike_k_pct ?? null,
      two_strike_whiff_vs_breaking: _teamRaw.away_team.two_strike_whiff_vs_breaking ?? null,
      hotStreaks: _awayHotStreaks,
    } : null,
    homeTeamStats: _teamRaw?.home_team ? {
      team_abbr: _homeAbbr, team_name: game.teams.home.team.name,
      runs_per_game_l30: _teamRaw.home_team.runs_per_game_l30 ?? null,
      ops_l30: _teamRaw.home_team.ops_l30 ?? null, iso: _teamRaw.home_team.iso ?? null,
      k_pct: _teamRaw.home_team.k_pct ?? null, bb_pct: _teamRaw.home_team.bb_pct ?? null,
      xwoba: _teamRaw.home_team.xwoba ?? null, hard_hit_pct: _teamRaw.home_team.hard_hit_pct ?? null,
      chase_pct_vs_rhp: _teamRaw.home_team.chase_pct_vs_rhp ?? null,
      chase_pct_vs_lhp: _teamRaw.home_team.chase_pct_vs_lhp ?? null,
      chase_pct_rank_mlb: _teamRaw.home_team.chase_pct_rank_mlb ?? null,
      first_pitch_swing_pct: _teamRaw.home_team.first_pitch_swing_pct ?? null,
      first_pitch_swing_rank_mlb: _teamRaw.home_team.first_pitch_swing_rank_mlb ?? null,
      two_strike_k_pct: _teamRaw.home_team.two_strike_k_pct ?? null,
      two_strike_whiff_vs_breaking: _teamRaw.home_team.two_strike_whiff_vs_breaking ?? null,
    hotStreaks: _homeHotStreaks,
    } : null,
    awayBullpen: awayBullpen ? {
      team_abbr: _awayAbbr, team_name: game.teams.away.team.name,
      innings_yesterday: _teamRaw?.away_team?.bullpen_innings_yesterday ?? null,
      ip_last_3: _teamRaw?.away_team?.bullpen_ip_last_3 ?? null,
      closer_available: _teamRaw?.away_team?.closer_available ?? null,
      setup1_available: _teamRaw?.away_team?.setup1_available ?? null,
      setup2_available: _teamRaw?.away_team?.setup2_available ?? null,
      bullpen_era: _teamRaw?.away_team?.bullpen_era ?? null,
      depth_arm_l3_era: null, depth_arm_name: null,
    } : null,
    homeBullpen: homeBullpen ? {
      team_abbr: _homeAbbr, team_name: game.teams.home.team.name,
      innings_yesterday: _teamRaw?.home_team?.bullpen_innings_yesterday ?? null,
      ip_last_3: _teamRaw?.home_team?.bullpen_ip_last_3 ?? null,
      closer_available: _teamRaw?.home_team?.closer_available ?? null,
      setup1_available: _teamRaw?.home_team?.setup1_available ?? null,
      setup2_available: _teamRaw?.home_team?.setup2_available ?? null,
      bullpen_era: _teamRaw?.home_team?.bullpen_era ?? null,
      depth_arm_l3_era: null, depth_arm_name: null,
    } : null,
    transactions: _scoutTransactions,
    weather: null,
    park: _teamRaw?.park ? {
      venue_name: game.venue?.name ?? '',
      hr_factor: _teamRaw.park.hr_factor ?? null,
      doubles_factor: null,
      runs_factor: _teamRaw.park.run_factor ?? null,
    } : null,
    series: _seriesGameNumber != null ? {
      seriesGameNumber: _seriesGameNumber,
      seriesTotalGames: seriesGames.length,
      standing: _seriesStanding,
      homeDayAfterNight: _teamRaw?.home_team?.day_after_night ?? null,
      awayDayAfterNight: _teamRaw?.away_team?.day_after_night ?? null,
    } : null,
    awayLineup: _awayLineupForScout,
    homeLineup: _homeLineupForScout,
  }

  const _awayStreakBatterIds = _awayHotStreaks.filter(s => s.player_type === 'batter').map(s => s.player_id)
  const _homeStreakBatterIds = _homeHotStreaks.filter(s => s.player_type === 'batter').map(s => s.player_id)

  const [_awayBatterZonesArr, _homeBatterZonesArr] = await Promise.all([
    Promise.all(_awayStreakBatterIds.map(id => getBatterHotZones(id))),
    Promise.all(_homeStreakBatterIds.map(id => getBatterHotZones(id))),
  ])
  const _awayBatterZonesMap = new Map(_awayStreakBatterIds.map((id, i) => [id, _awayBatterZonesArr[i]]))
  const _homeBatterZonesMap = new Map(_homeStreakBatterIds.map((id, i) => [id, _homeBatterZonesArr[i]]))

  const awayStreaksWithZones = _awayHotStreaks.map(s => ({ ...s, zones: _awayBatterZonesMap.get(s.player_id) }))
  const homeStreaksWithZones = _homeHotStreaks.map(s => ({ ...s, zones: _homeBatterZonesMap.get(s.player_id) }))  
  const scoutReport = buildScoutReport(scoutInputs)

  // ── PINNED HERO ──────────────────────────────────────────────────────────
  const pinnedHero = (prediction?.story_lead || prediction?.predicted_winner) ? (
    <div className="px-4 py-4" style={centered}>
      <div className="space-y-3">
        {prediction?.predicted_winner && (
          <div className="border-l-[3px] border-orange-500 pl-5 py-0.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 mb-1">Edge lean</p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem', lineHeight: 1, color: '#1A1A1A' }}>
                {prediction.predicted_winner}
              </span>
              {prediction.confidence_tier && (
                <span className="text-xs font-mono uppercase tracking-widest text-stone-400">
                  {prediction.confidence_tier} lean
                </span>
              )}
            </div>
          </div>
        )}
        {prediction?.story_lead && (
          <div className="border-l-[3px] border-stone-200 pl-5">
            <p className="text-base md:text-lg font-serif italic text-stone-700 leading-relaxed">{prediction.story_lead}</p>
          </div>
        )}
      </div>
    </div>
  ) : null

  // ── SLOT: READ (Edge Indicator is the whole thing) ──────────────────────
  const slotRead = (
    <div className="space-y-8">
      {prediction && (
        <EdgeIndicator
          edge_score={prediction.edge_score}
          predicted_winner={prediction.predicted_winner}
          confidence_tier={prediction.confidence_tier}
          components={prediction.components}
          components_raw={prediction.components_raw}
          home_team={game.teams.home.team.name}
          away_team={game.teams.away.team.name}
          home_team_abbr={game.teams.home.team.abbreviation ?? undefined}
          away_team_abbr={game.teams.away.team.abbreviation ?? undefined}
          updated_at={prediction.updated_at}
          away_primary_color={awayColor}
          home_primary_color={homeColor}
          lineups_confirmed={prediction.lineups_confirmed}
          home_team_id={game.teams.home.team.id}
          away_team_id={game.teams.away.team.id}
          away_team_slug={awaySlug}
          home_team_slug={homeSlug}
          is_pro={isPro}
          llm_narrative={prediction.narrative}
          llm_narrative_pro={prediction.narrative_pro}
          pro_takeaways={prediction.pro_takeaways}
        />
      )}
      {prediction?.contrarian && (
        <section>
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold mb-4 text-red-500">§ The Contrarian Angle</h3>
          <Contrarian text={prediction.contrarian} />
        </section>
      )}
    </div>
  )

  // ── SLOT: SCOUT ───────────────────────────────────────────────────────────
const slotScout = (
    <ScoutReportTab
      report={scoutReport}
      homeAbbr={_homeAbbr}
      umpireName={umpireName}
      umpireProfile={umpireProfile}
      awayPitcherHotZones={awayPitcherHotZones}
      homePitcherHotZones={homePitcherHotZones}
      awayPitcherArsenalZones={awayPitcherArsenalZones}
      homePitcherArsenalZones={homePitcherArsenalZones}
      awayPitcherId={awayPitcherId}
      homePitcherId={homePitcherId}
      awayPitcherTTO={awayPitcherTTO}
      homePitcherTTO={homePitcherTTO}
      awayLiteralBatters={awayLiteralBatters}
homeLiteralBatters={homeLiteralBatters}
awayPitcherTrend={awayPitcherTrend}
homePitcherTrend={homePitcherTrend}
      awayBatterStreaks={awayStreaksWithZones}
      homeBatterStreaks={homeStreaksWithZones}
awayLineupSpray={awayLineupSpray}
      homeLineupSpray={homeLineupSpray}
      awayLineupSize={awayLineupBatterIds.length}
      homeLineupSize={homeLineupBatterIds.length}
      awayLineupZones={awayLineupZones}
      homeLineupZones={homeLineupZones}
      awayPitcherThrows={awayPitcherThrows}
      homePitcherThrows={homePitcherThrows}
      awayAbbr={_awayAbbr}
      homeName={game.teams.home.team.name}
      awayName={game.teams.away.team.name}
      homeColor={homeColor}
      awayColor={awayColor}
      homeTeamId={game.teams.home.team.id}
      awayTeamId={game.teams.away.team.id}
      awayPitcherName={game.teams.away.probablePitcher?.fullName ?? 'TBD'}
      homePitcherName={game.teams.home.probablePitcher?.fullName ?? 'TBD'}
    
    />
  )

  // ── SLOT: PITCHING LAB (bullpen folded in) ──────────────────────────────
  const slotPitching = (
    <div className="space-y-10">
      <PitchingTab
        awayPitcher={awayPitcherId ? {
          id: awayPitcherId,
          name: game.teams.away.probablePitcher?.fullName ?? 'TBD',
          abbr: game.teams.away.team.abbreviation ?? 'AWAY',
          side: 'Away starter', fullStats: awayFullStats, movementRows: awayMovementDB,
        } : null}
        homePitcher={homePitcherId ? {
          id: homePitcherId,
          name: game.teams.home.probablePitcher?.fullName ?? 'TBD',
          abbr: game.teams.home.team.abbreviation ?? 'HOME',
          side: 'Home starter', fullStats: homeFullStats, movementRows: homeMovementDB,
        } : null}
      />
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Bullpen availability</p>
        <BullpenPanel home={homeBullpen} away={awayBullpen} isPro={isPro} />
      </div>
    </div>
  )

  // ── SLOT: TEAMS (lineups + hot/cold folded in) ──────────────────────────
  const slotTeams = (
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

  // ── SLOT: SERIES (conditional) ──────────────────────────────────────────
  const slotSeriesTab = seriesGames.length >= 1 ? (
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
  ) : undefined

  // ── SIDEBAR (wireframe order: Series → Team Forms → Standings+Chart → Race for October) ──
  const slotSidebar = (
    <>
      {seriesGames.length >= 1 && (
        <SeriesCarousel
          games={seriesCarouselGames}
          awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        />
      )}

      <TrendsCard
        awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayForm={awayForm} homeForm={homeForm}
      />

     <StandingsCard
        awayTeamId={game.teams.away.team.id} homeTeamId={game.teams.home.team.id}
        awayStandings={awayStandings} homeStandings={homeStandings}
      />

      {awayRow && awayStandings && (
        <RaceForOctober team={awayRow} divisionTeams={awayStandings.teams} wildCardTeams={awayLeagueStandings} abbr={_awayAbbr} />
      )}
      {homeRow && homeStandings && (
        <RaceForOctober team={homeRow} divisionTeams={homeStandings.teams} wildCardTeams={homeLeagueStandings} abbr={_homeAbbr} />
      )}
    </>
  )

  return (
    <>
      <ScrollProgress />
      <SiteHeader variant="page" />
      <LiveTicker />
      <GamePageShell
        homeTeam={game.teams.home.team.name} awayTeam={game.teams.away.team.name}
        homeAbbr={_homeAbbr} awayAbbr={_awayAbbr}
        homeLogoUrl={teamLogoUrl(game.teams.home.team.id)}
        awayLogoUrl={teamLogoUrl(game.teams.away.team.id)}
        gameTime={gameTimeFormatted} venue={game.venue?.name}
        isPro={isPro} isSignedIn={isSignedIn} liveScore={liveScore}
        pinnedHero={pinnedHero}
        slotSidebar={slotSidebar}
        slotRead={slotRead}
        slotScout={slotScout}
        slotPitching={slotPitching}
        slotTeams={slotTeams}
        slotSeriesTab={slotSeriesTab}
      />
    </>
  )
}