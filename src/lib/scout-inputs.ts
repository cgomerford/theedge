// src/lib/scout-inputs.ts
//
// Standalone extraction of the ScoutInputs-assembly logic from
// mlb/[slug]/page.tsx, for use by the admin Scout Report video export.
// Deliberately does NOT touch mlb/[slug]/page.tsx — this is a parallel
// path that fetches only what buildScoutReport() actually consumes, so
// admin/scout-video doesn't pay for or depend on the game page's other
// display-only fetches (umpire scouting, lineup hot-zone maps, series
// carousel data, standings, pitch movement DB, velocity ranges).
//
// ⚠ DRIFT RISK: this duplicates real logic from the game page rather than
// sharing a single function, because extracting a shared helper would mean
// editing the live game page and I only have one snapshot of it to work
// from. If the ScoutInputs assembly in mlb/[slug]/page.tsx changes later
// (new team-stat fields, a different transactions filter, etc.), this file
// needs the same change made by hand — it will NOT pick it up
// automatically. Worth revisiting as a shared lib function once this
// admin tool has proven itself, per the "single owner" principle elsewhere
// in the codebase.

import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getBullpenData } from '@/lib/bullpen'
import { getTeamTransactions, getTeamILList } from '@/lib/team-transactions'
import { getProjectedLineup } from '@/lib/lineups'
import { getSeriesGames } from '@/lib/series-games'
import type {
  ScoutInputs,
  TransactionForScout,
  ArsenalPitch,
  HotStreakPlayer,
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

function dedupeByPlayerId(rows: HotStreakPlayer[]): HotStreakPlayer[] {
  const byId = new Map<number, HotStreakPlayer>()
  for (const r of rows) {
    const existing = byId.get(r.player_id)
    if (!existing || r.magnitude > existing.magnitude) byId.set(r.player_id, r)
  }
  return Array.from(byId.values())
}

export interface ScoutInputsResult {
  game: MLBGame
  inputs: ScoutInputs
  awayAbbr: string
  homeAbbr: string
}

/**
 * Rebuilds the same ScoutInputs the live game page would build for this
 * slug, right now. Returns null (never fabricates) if the game can't be
 * resolved. Mirrors mlb/[slug]/page.tsx's assembly as of the snapshot
 * this file was written against — see the drift-risk note above.
 */
export async function getScoutInputsForSlug(slug: string): Promise<ScoutInputsResult | null> {
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

  const prediction = await getEdgePrediction(game.gamePk)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'

  const [awayFullStats, homeFullStats] = await Promise.all([
    awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
  ])

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

  const [awayLineup, homeLineup, awayInjuries, homeInjuries, awayTransactions, homeTransactions] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getTeamTransactions(game.teams.away.team.id),
    getTeamTransactions(game.teams.home.team.id),
  ])

  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1],
  )

  const seriesGames = await getSeriesGames(
    game.teams.home.team.id, game.teams.away.team.id, dateMatch[1], game.gamePk,
  )

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

  const [_awayFormRes, _homeFormRes, awayActiveRosterIds, homeActiveRosterIds] = await Promise.all([
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
    getActiveRosterIds(game.teams.away.team.id),
    getActiveRosterIds(game.teams.home.team.id),
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

  const _toHotStreak = (row: any): HotStreakPlayer => ({
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

  // Fail OPEN on an empty active-roster set — see the identical comment in
  // mlb/[slug]/page.tsx: an empty set almost always means the Stats API
  // fetch failed, not that zero players are active.
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

  const inputs: ScoutInputs = {
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
    // NOTE: same-source quirk preserved from the game page — home pitcher's
    // l3_era/whip/k_per_9/bb_per_9/first_pitch_strike_pct/tto* read from
    // awayFullStats, not homeFullStats. That's how mlb/[slug]/page.tsx does
    // it today (visible in the pasted source), so this stays byte-for-byte
    // consistent with what the live game page actually shows — not fixing
    // it here since a silent divergence between this export and the live
    // page would be worse than a bug that's at least consistent everywhere.
    // Worth flagging to fix in page.tsx itself if it's genuinely a bug.
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
  }

  return { game, inputs, awayAbbr: _awayAbbr, homeAbbr: _homeAbbr }
}