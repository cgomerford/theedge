// src/components/ScoutSlotAsync.tsx
//
// Full data-fetch for the Scout Report tab, extracted verbatim from
// mlb/[slug]/page.tsx's slotScout block so it can run as an independent
// async Server Component wrapped in <Suspense> — streams in after the
// Edge Indicator tab instead of blocking it. This is a COMPLETE
// relocation, not the smaller getScoutInputsForSlug() helper (that
// helper only feeds buildScoutReport's text rows, not the hot zones/
// spray/workload/bullpen-leverage/fielding/ABS/SB-tendency cards
// ScoutReportTab actually renders — confirmed against its real Props
// type before writing this).
//
// Duplicates the game lookup, getEdgePrediction, and getSeriesGamesFromDB
// calls that page.tsx also makes for other slots — deliberate, so this
// slot can resolve independently under Suspense rather than depending on
// props threaded from the parent. All three are cheap single-row/cached
// reads, not live external API walks.

import { getScheduleForDate, slugifyGame, getTeamForm, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { getActiveRosterIds } from '@/lib/active-roster'
import { getTopBatterStreaks, getPitcherTrend } from '@/lib/streaks'
import { getProjectedLineup } from '@/lib/lineups'
import { getTeamILList, getTeamTransactions } from '@/lib/team-transactions'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getPitcherHotZones, getBatterHotZones } from '@/lib/hot-zones'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getBullpenData } from '@/lib/bullpen'
import { getLast7DaysPitcherWorkloadFromDB } from '@/lib/pitcher-workload'
import { getSeasonGamePks, getBullpenReportFromDB, getEligibleRelieverIds, type BullpenReport } from '@/lib/bullpen-usage'
import { getFieldingAlignment } from '@/lib/fielding-alingment'
import { getPitcherCountTendency, getPitcherSequencing } from '@/lib/pitcher-sequencing'
import { getVenueFieldDimensions } from '@/lib/venue-dimensions'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import { getGameWeather, getGameRainOutlook } from '@/lib/mlb'
import { getABSChallengeRecord } from '@/lib/abs-challenges'
import { getSBTendency } from '@/lib/sb-tendency'
import { getLineupSpray } from '@/lib/batter-spray'
import { getSeriesGamesFromDB } from '@/lib/series-games'
import { findTeamByName } from '@/lib/teams'
import ScoutReportTab from './ScoutReportTab'
import {
  buildScoutReport,
  type ScoutInputs,
  type TransactionForScout,
  type ArsenalPitch,
  type BatterPitchSplitForScout,
  type LineupBatterForScout,
} from '@/lib/scout'



export default async function ScoutSlotAsync({ slug }: { slug: string }) {
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
  if (!game) return <div className="p-8 text-center text-stone-400 font-mono text-xs">Scout Report unavailable for this game.</div>

  const gameState = game.status?.abstractGameState
  const isFinal = gameState === 'Final'
  const subscriber = await getCurrentSubscriber()
  // TEMP: forced true so the new pro-gated layout can be reviewed locally
  // without a real pro session — revert to `subscriber?.is_pro ?? false`
  // before shipping.
  const isPro = true || (subscriber?.is_pro ?? false)
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
  const awayLiteralBatters = awayStreakData.all
  const homeLiteralBatters = homeStreakData.all

  const [awayLineup, homeLineup] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
  ])

  const [
    awayInjuries, homeInjuries,
    awayTransactions, homeTransactions,
    awayActiveRosterIds, homeActiveRosterIds,
  ] = await Promise.all([
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getTeamTransactions(game.teams.away.team.id),
    getTeamTransactions(game.teams.home.team.id),
    getActiveRosterIds(game.teams.away.team.id),
    getActiveRosterIds(game.teams.home.team.id),
  ])

  const seasonYear = new Date().getFullYear()
  const [awayFullStats, homeFullStats] = await Promise.all([
    awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
  ])

  const [awayPitcherHotZones, homePitcherHotZones, awayPitcherArsenalZones, homePitcherArsenalZones] = await Promise.all([
    awayPitcherId ? getPitcherHotZones(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherHotZones(homePitcherId) : Promise.resolve({}),
    awayPitcherId ? getPitcherZoneArsenal(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherZoneArsenal(homePitcherId) : Promise.resolve({}),
  ])

  const awayPitcherThrows = (((awayFullStats as any)?.throws) ?? 'R') as 'L' | 'R'
  const homePitcherThrows = (((homeFullStats as any)?.throws) ?? 'R') as 'L' | 'R'

  const awayPitcherTTO = awayFullStats ? {
    tto1_woba: (awayFullStats as any).tto1_woba ?? null, tto2_woba: (awayFullStats as any).tto2_woba ?? null, tto3_woba: (awayFullStats as any).tto3_woba ?? null,
    tto1_avg: (awayFullStats as any).tto1_avg ?? null, tto2_avg: (awayFullStats as any).tto2_avg ?? null, tto3_avg: (awayFullStats as any).tto3_avg ?? null,
    tto1_pa: (awayFullStats as any).tto1_pa ?? null, tto2_pa: (awayFullStats as any).tto2_pa ?? null, tto3_pa: (awayFullStats as any).tto3_pa ?? null,
  } : null
  const homePitcherTTO = homeFullStats ? {
    tto1_woba: (homeFullStats as any).tto1_woba ?? null, tto2_woba: (homeFullStats as any).tto2_woba ?? null, tto3_woba: (homeFullStats as any).tto3_woba ?? null,
    tto1_avg: (homeFullStats as any).tto1_avg ?? null, tto2_avg: (homeFullStats as any).tto2_avg ?? null, tto3_avg: (homeFullStats as any).tto3_avg ?? null,
    tto1_pa: (homeFullStats as any).tto1_pa ?? null, tto2_pa: (homeFullStats as any).tto2_pa ?? null, tto3_pa: (homeFullStats as any).tto3_pa ?? null,
  } : null

  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1],
  )

  const [awayWorkload, homeWorkload] = await Promise.all([
    getLast7DaysPitcherWorkloadFromDB(game.teams.away.team.id, awayActiveRosterIds),
    getLast7DaysPitcherWorkloadFromDB(game.teams.home.team.id, homeActiveRosterIds),
  ])

  const _bullpenSeason = new Date().getFullYear()
  const [awaySeasonGamePks, homeSeasonGamePks] = await Promise.all([
    getSeasonGamePks(game.teams.away.team.id, _bullpenSeason),
    getSeasonGamePks(game.teams.home.team.id, _bullpenSeason),
  ])
  const [awayBullpenReportRaw, homeBullpenReportRaw] = await Promise.all([
    getBullpenReportFromDB(game.teams.away.team.id, _bullpenSeason),
    getBullpenReportFromDB(game.teams.home.team.id, _bullpenSeason),
  ])
  const [awayEligibleRelieverIds, homeEligibleRelieverIds] = await Promise.all([
    getEligibleRelieverIds([...awayActiveRosterIds], _bullpenSeason, awayActiveRosterIds),
    getEligibleRelieverIds([...homeActiveRosterIds], _bullpenSeason, homeActiveRosterIds),
  ])

  awayWorkload.pitchers = awayWorkload.pitchers.filter(p => awayEligibleRelieverIds.has(p.playerId))
  homeWorkload.pitchers = homeWorkload.pitchers.filter(p => homeEligibleRelieverIds.has(p.playerId))

  const awayBullpenReport: BullpenReport = {
    ...awayBullpenReportRaw,
    relievers: awayBullpenReportRaw.relievers.filter(r => awayEligibleRelieverIds.has(r.playerId)),
  }
  const homeBullpenReport: BullpenReport = {
    ...homeBullpenReportRaw,
    relievers: homeBullpenReportRaw.relievers.filter(r => homeEligibleRelieverIds.has(r.playerId)),
  }

  const awayLineupBatterIds: number[] = (awayLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)
  const homeLineupBatterIds: number[] = (homeLineup?.batters ?? []).map((b: any) => b?.player_id).filter(Boolean)

  const [awayFieldingAlignment, homeFieldingAlignment] = await Promise.all([
    getFieldingAlignment(awayLineup?.batters ?? [], seasonYear),
    getFieldingAlignment(homeLineup?.batters ?? [], seasonYear),
  ])

  const [awayCountTendency, homeCountTendency, awaySequencing, homeSequencing] = await Promise.all([
    awayPitcherId ? getPitcherCountTendency(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherCountTendency(homePitcherId) : Promise.resolve({}),
    awayPitcherId ? getPitcherSequencing(awayPitcherId) : Promise.resolve({}),
    homePitcherId ? getPitcherSequencing(homePitcherId) : Promise.resolve({}),
  ])

  const _venueId = (game.venue as any)?.id as number | undefined
  const venueDimensions = _venueId ? await getVenueFieldDimensions(_venueId) : null

  const _venueInfo = getVenueInfo(game.venue?.name)
  const [weather, rainOutlook] = await Promise.all([
    !isFinal && _venueInfo && !_venueInfo.indoor ? getGameWeather(_venueInfo.lat, _venueInfo.lon, game.gameDate) : Promise.resolve(null),
    !isFinal && _venueInfo && !_venueInfo.indoor ? getGameRainOutlook(_venueInfo.lat, _venueInfo.lon, game.gameDate) : Promise.resolve(null),
  ])
  const windImpact = weather && game.venue?.name
    ? describeWindImpact(game.venue.name, weather.wind_direction, weather.wind_mph)
    : null
  const isIndoorVenue = _venueInfo?.indoor ?? false

  const [awayABSRecord, homeABSRecord, awaySBTendency, homeSBTendency] = await Promise.all([
    getABSChallengeRecord(game.teams.away.team.abbreviation ?? 'AWAY'),
    getABSChallengeRecord(game.teams.home.team.abbreviation ?? 'HOME'),
    getSBTendency(game.teams.away.team.id, seasonYear),
    getSBTendency(game.teams.home.team.id, seasonYear),
  ])

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

  const seriesGames = await getSeriesGamesFromDB(game.gamePk)

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
  const _formCols = 'player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games'

  async function fetchFormSignals(teamShort: string, signal: 'heating' | 'cooling', limit: number) {
    const shortName = teamShort.split(' ').slice(-1)[0]
    const today = await supa.from('player_form_signals')
      .select(_formCols)
      .eq('computed_date', _formDate).eq('player_type', 'batter').eq('signal', signal)
      .ilike('team_name', `%${shortName}%`)
      .order('magnitude', { ascending: false }).limit(limit)
    if (today.data?.length) return today.data
    const fallback = await supa.from('player_form_signals')
      .select(_formCols)
      .lt('computed_date', _formDate).eq('player_type', 'batter').eq('signal', signal)
      .ilike('team_name', `%${shortName}%`)
      .order('computed_date', { ascending: false })
      .order('magnitude', { ascending: false }).limit(limit)
    return fallback.data ?? []
  }

  const [_awayHeating, _awayCooling, _homeHeating, _homeCooling] = await Promise.all([
    fetchFormSignals(_awayTeamShort, 'heating', 2),
    fetchFormSignals(_awayTeamShort, 'cooling', 2),
    fetchFormSignals(_homeTeamShort, 'heating', 2),
    fetchFormSignals(_homeTeamShort, 'cooling', 2),
  ])
  const _awayFormData = [..._awayHeating, ..._awayCooling]
  const _homeFormData = [..._homeHeating, ..._homeCooling]

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

  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'

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
      l3_era: (awayFullStats as any)?.l3_era ?? null,
      whip: (awayFullStats as any)?.whip ?? null,
      k_per_9: (awayFullStats as any)?.k_per_9 ?? null,
      bb_per_9: (awayFullStats as any)?.bb_per_9 ?? null,
      first_pitch_strike_pct: (awayFullStats as any)?.first_pitch_strike_pct ?? null,
      first_pitch_mix: (homeFullStats as any).first_pitch_mix ?? null,
      two_strike_mix: (homeFullStats as any).two_strike_mix ?? null,
      tto1_woba: (awayFullStats as any)?.tto1_woba ?? null,
      tto2_woba: (awayFullStats as any)?.tto2_woba ?? null,
      tto3_woba: (awayFullStats as any)?.tto3_woba ?? null,
      tto1_pa: (awayFullStats as any)?.tto1_pa ?? null,
      tto2_pa: (awayFullStats as any)?.tto2_pa ?? null,
      tto3_pa: (awayFullStats as any)?.tto3_pa ?? null,
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

  return (
    <ScoutReportTab
      report={scoutReport}
      isPro={isPro}
      homeAbbr={_homeAbbr}
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
      awayWorkload={awayWorkload}
      homeWorkload={homeWorkload}
      awayBullpenReport={awayBullpenReport}
      homeBullpenReport={homeBullpenReport}
      awayTeamTrends={{
        sp_era: (awayFullStats as any)?.era ?? null,
        sp_fip: (awayFullStats as any)?.fip ?? null,
        bullpen_era: _teamRaw?.away_team?.bullpen_era ?? null,
        ops_l30: _teamRaw?.away_team?.ops_l30 ?? null,
        risp_avg: _teamRaw?.away_team?.risp_avg ?? null,
        risp_ops: _teamRaw?.away_team?.risp_ops ?? null,
      }}
      homeTeamTrends={{
        sp_era: (homeFullStats as any)?.era ?? null,
        sp_fip: (homeFullStats as any)?.fip ?? null,
        bullpen_era: _teamRaw?.home_team?.bullpen_era ?? null,
        ops_l30: _teamRaw?.home_team?.ops_l30 ?? null,
        risp_avg: _teamRaw?.home_team?.risp_avg ?? null,
        risp_ops: _teamRaw?.home_team?.risp_ops ?? null,
      }}
      awayRollingTrends={{
        sp_l3_era: (awayFullStats as any)?.l3_era ?? null,
        runs_per_game_l30: _teamRaw?.away_team?.runs_per_game_l30 ?? null,
        ops_l30: _teamRaw?.away_team?.ops_l30 ?? null,
        k_pct_l30: _teamRaw?.away_team?.k_pct ?? null,
        bb_pct_l30: _teamRaw?.away_team?.bb_pct ?? null,
      }}
      homeRollingTrends={{
        sp_l3_era: (homeFullStats as any)?.l3_era ?? null,
        runs_per_game_l30: _teamRaw?.home_team?.runs_per_game_l30 ?? null,
        ops_l30: _teamRaw?.home_team?.ops_l30 ?? null,
        k_pct_l30: _teamRaw?.home_team?.k_pct ?? null,
        bb_pct_l30: _teamRaw?.home_team?.bb_pct ?? null,
      }}
      awayFieldingAlignment={awayFieldingAlignment}
      homeFieldingAlignment={homeFieldingAlignment}
      awayABSRecord={awayABSRecord}
      homeABSRecord={homeABSRecord}
      awaySBTendency={awaySBTendency}
      homeSBTendency={homeSBTendency}
      venueDimensions={venueDimensions}
      ballparkWeather={weather}
      windImpact={windImpact}
      rainOutlook={rainOutlook}
      isIndoorVenue={isIndoorVenue}
      awayCountTendency={awayCountTendency}
      homeCountTendency={homeCountTendency}
      awaySequencing={awaySequencing}
      homeSequencing={homeSequencing}
    />
  )
}