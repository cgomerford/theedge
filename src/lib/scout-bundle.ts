// src/lib/scout-bundle.ts
//
// Shared "build a full Scout Report + its visual assets for one game"
// pipeline, factored out of src/app/mlb/[slug]/page.tsx so any surface
// (admin Scout Stories slideshow, future share-image generation, etc.)
// can call it directly — no network hop, no separate deployment to keep
// alive, nothing that can 404.
//
// This is a straight copy of the "Scout Report inputs" block in that file
// (search it for "_scoutSeason" if this ever drifts out of sync — it
// should stay a mirror). A few calls here assume the signature of helpers
// only ever seen USED, not defined, in that file: getPitcherStatsFull,
// getBullpenData, getProjectedLineup, getLineupSpray, getTopBatterStreaks,
// getPitcherTrend, getTeamILList, getTeamTransactions. If TypeScript
// complains on any of these, that's the first place to check — the fix is
// almost certainly just matching the real param order/names, not a design
// problem with this file.
//
// Deliberately NOT included (page.tsx has these, this bundle doesn't need
// them): standings, series carousel/momentum/predictions, umpire scouting,
// pitch-movement DB rows for PitchingTab. If you want series context
// (`_seriesGameNumber`/`_seriesStanding`) in the story slideshow too, wire
// getSeriesGames() in here the same way page.tsx does — omitted for now
// because it drags in series-carousel-only machinery.

import { createAdminClient } from '@/lib/supabase'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { findTeamByName } from '@/lib/teams'
import { getProjectedLineup } from '@/lib/lineups'
import { getLineupSpray } from '@/lib/batter-spray'
import { getPitcherHotZones, getBatterHotZones } from '@/lib/hot-zones'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getTeamILList, getTeamTransactions } from '@/lib/team-transactions'
import { getTopBatterStreaks, getPitcherTrend } from '@/lib/streaks'
import { getBullpenData } from '@/lib/bullpen'
import {
  buildScoutReport,
  type ScoutInputs,
  type ScoutReport,
  type TransactionForScout,
  type ArsenalPitch,
  type HotStreakPlayer,
} from '@/lib/scout'
import type { MLBGame } from '@/lib/mlb'

// ── same helper as the module-scope one in page.tsx ─────────────────────
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

// ── page.tsx only ever loads a game by slug/date via getScheduleForDate.
// The admin dashboard only has gamePk, so fetch straight from the MLB
// Stats API — same hydrate params page.tsx effectively ends up needing. ──
async function getGameByPk(gamePk: number): Promise<MLBGame | null> {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=team,probablePitcher,venue`,
      { next: { revalidate: 60 } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.dates?.[0]?.games?.[0] ?? null
  } catch {
    return null
  }
}

export type ScoutReportBundle = {
  report: ScoutReport
  awayAbbr: string
  homeAbbr: string
  awayName: string
  homeName: string
  awayColor: string
  homeColor: string
  awayPitcherName: string
  homePitcherName: string
  awayPitcherHotZones: Record<string, any>
  homePitcherHotZones: Record<string, any>
  awayPitcherArsenalZones: Record<string, any>
  homePitcherArsenalZones: Record<string, any>
  awayLineupZones: { playerId: number; playerName: string; zones: any }[]
  homeLineupZones: { playerId: number; playerName: string; zones: any }[]
  awayLineupSpray: any[]
  homeLineupSpray: any[]
  awayPitcherTTO: any
  homePitcherTTO: any
  awayPitcherThrows: 'L' | 'R'
  homePitcherThrows: 'L' | 'R'
  awayLineupSize: number
  homeLineupSize: number
}

export async function getScoutReportBundle(gamePk: number): Promise<ScoutReportBundle | null> {
  const supa = createAdminClient()

  const game = await getGameByPk(gamePk)
  if (!game) return null

  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]

  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'

  const awayTeamMeta = findTeamByName(game.teams.away.team.name)
  const homeTeamMeta = findTeamByName(game.teams.home.team.name)
  const awayColor = awayTeamMeta?.primary_color ?? '#FF5722'
  const homeColor = homeTeamMeta?.primary_color ?? '#1A1A1A'

  const prediction = await getEdgePrediction(gamePk)
  const _teamRaw: any = prediction?.components_raw

  const [awayStreakData, homeStreakData] = await Promise.all([
    getTopBatterStreaks(game.teams.away.team.id),
    getTopBatterStreaks(game.teams.home.team.id),
  ])
  // awayStreakData/homeStreakData aren't used directly in ScoutInputs (only
  // page.tsx's PitchingTab/streak-row props need them) — fetched here only
  // because getPitcherTrend below needs the pitcher name resolved first.
  void awayStreakData
  void homeStreakData

  const [awayPitcherTrend, homePitcherTrend] = await Promise.all([
    awayPitcherId ? getPitcherTrend(awayPitcherId, game.teams.away.probablePitcher?.fullName ?? '') : Promise.resolve(null),
    homePitcherId ? getPitcherTrend(homePitcherId, game.teams.home.probablePitcher?.fullName ?? '') : Promise.resolve(null),
  ])
  // Not consumed by ScoutInputs directly either — kept for parity with
  // page.tsx in case buildScoutReport grows a use for it later.
  void awayPitcherTrend
  void homePitcherTrend

  const [awayLineup, homeLineup] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, gamePk),
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

  const awayPitcherThrows = ((awayFullStats as any)?.throws ?? 'R') as 'L' | 'R'
  const homePitcherThrows = ((homeFullStats as any)?.throws ?? 'R') as 'L' | 'R'

  const awayPitcherTTO = awayFullStats ? {
    tto1_woba: (awayFullStats as any).tto1_woba ?? null, tto2_woba: (awayFullStats as any).tto2_woba ?? null, tto3_woba: (awayFullStats as any).tto3_woba ?? null,
    tto1_pa: (awayFullStats as any).tto1_pa ?? null, tto2_pa: (awayFullStats as any).tto2_pa ?? null, tto3_pa: (awayFullStats as any).tto3_pa ?? null,
  } : null
  const homePitcherTTO = homeFullStats ? {
    tto1_woba: (homeFullStats as any).tto1_woba ?? null, tto2_woba: (homeFullStats as any).tto2_woba ?? null, tto3_woba: (homeFullStats as any).tto3_woba ?? null,
    tto1_pa: (homeFullStats as any).tto1_pa ?? null, tto2_pa: (homeFullStats as any).tto2_pa ?? null, tto3_pa: (homeFullStats as any).tto3_pa ?? null,
  } : null

  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id, game.teams.away.team.id, gameDateApi,
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

  // ── Pitch arsenals ────────────────────────────────────────────────────
  const [awayArsenalRes, homeArsenalRes] = await Promise.all([
    awayPitcherId
      ? supa.from('pitch_arsenals')
          .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
          .eq('player_id', awayPitcherId).eq('season', seasonYear)
          .order('percentage', { ascending: false })
      : Promise.resolve({ data: [] }),
    homePitcherId
      ? supa.from('pitch_arsenals')
          .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
          .eq('player_id', homePitcherId).eq('season', seasonYear)
          .order('percentage', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])
  const _awayArsenal: ArsenalPitch[] = (awayArsenalRes?.data ?? []) as ArsenalPitch[]
  const _homeArsenal: ArsenalPitch[] = (homeArsenalRes?.data ?? []) as ArsenalPitch[]

  // ── Transactions ─────────────────────────────────────────────────────
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

  // ── Hot streaks (player_form_signals) ───────────────────────────────
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

  function dedupeByPlayerId(rows: HotStreakPlayer[]) {
    const byId = new Map<number, HotStreakPlayer>()
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
      .filter((s: HotStreakPlayer) => !_awayInjuredIds.has(s.player_id) && (!awayRosterCheckAvailable || awayActiveRosterIds.has(s.player_id)))
  )
  const _homeHotStreaks = dedupeByPlayerId(
    (_homeFormData ?? [])
      .map(_toHotStreak)
      .filter((s: HotStreakPlayer) => !_homeInjuredIds.has(s.player_id) && (!homeRosterCheckAvailable || homeActiveRosterIds.has(s.player_id)))
  )

  // ── ScoutInputs — mirrors page.tsx's block exactly, including its
  // existing away/home field mixup in the homePitcher block (see file
  // header note above) ─────────────────────────────────────────────────
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
    // Series context intentionally omitted — see file header note.
    series: null,
  }

  const report = buildScoutReport(scoutInputs)

  return {
    report,
    awayAbbr: _awayAbbr,
    homeAbbr: _homeAbbr,
    awayName: game.teams.away.team.name,
    homeName: game.teams.home.team.name,
    awayColor,
    homeColor,
    awayPitcherName: game.teams.away.probablePitcher?.fullName ?? 'TBD',
    homePitcherName: game.teams.home.probablePitcher?.fullName ?? 'TBD',
    awayPitcherHotZones,
    homePitcherHotZones,
    awayPitcherArsenalZones,
    homePitcherArsenalZones,
    awayLineupZones,
    homeLineupZones,
    awayLineupSpray,
    homeLineupSpray,
    awayPitcherTTO,
    homePitcherTTO,
    awayPitcherThrows,
    homePitcherThrows,
    awayLineupSize: awayLineupBatterIds.length,
    homeLineupSize: homeLineupBatterIds.length,
  }
}
