/**
 * src/lib/nhl/preview.ts
 *
 * getNhlPreview(slug): one function, one cache key, revalidate 900s (15 min) --
 * everything the /nhl/[slug] page needs: the game, both teams, recent-form
 * tiles (record, GF/GA, PP%/PK%, 5v5 shot-attempt share -- all computed by us
 * from nhl_team_game_state/nhl_pbp_events/nhl_strength_timeline, never a raw
 * NHL "advanced stat"), recent goalie starts, season series, deployment strips
 * and availability. All reads are from nhl_* tables -- nothing is fetched from
 * the NHL API at render time.
 *
 * Slug format: {away-full-name}-at-{home-full-name}-{yyyy-mm-dd}, lower-kebab,
 * matching nhl_teams.full_name slugified. Returns null on no match (caller 404s).
 */

import { createAdminClient } from '@/lib/supabase'
import { getDeploymentStrip } from './deployment'
import { getAvailabilityDesk } from './availability'
import type { StripData } from '@/lib/usage-strip/types'
import type { AvailabilityEntry } from './availability'

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; data: NhlPreview | null }>()
const inFlight = new Map<string, Promise<NhlPreview | null>>()

export interface NhlPreviewTeam {
  id: number
  abbrev: string
  fullName: string
  color: string | null
  textColor: string | null
}

export interface NhlRecentForm {
  gamesPlayed: number
  wins: number
  losses: number
  otLosses: number
  gfPerGame: number | null
  gaPerGame: number | null
  ppPct: number | null
  pkPct: number | null
  shotAttemptShare5v5: number | null
  lastGameDate: string | null
}

export interface NhlGoalieStart {
  playerId: number
  name: string
  lastStarts: { gameId: number; gameDate: string; decision: string | null; evSavePct: number | null }[]
  restDays: number | null
  backToBack: boolean
  seasonEvSavePct: number | null
}

export interface NhlPreview {
  game: {
    gameId: number
    gameDate: string
    startTimeUtc: string | null
    venue: string | null
    venueTz: string | null
    gameState: string
  }
  away: NhlPreviewTeam
  home: NhlPreviewTeam
  awayForm: NhlRecentForm
  homeForm: NhlRecentForm
  awayGoalies: NhlGoalieStart[]
  homeGoalies: NhlGoalieStart[]
  seasonSeries: { gameId: number; gameDate: string; awayScore: number | null; homeScore: number | null }[]
  awayDeployment: StripData
  homeDeployment: StripData
  awayAvailability: AvailabilityEntry[]
  homeAvailability: AvailabilityEntry[]
  awayRestDays: number | null
  homeRestDays: number | null
}

function restDaysBefore(gameDate: string, lastGameDate: string | null): number | null {
  if (!lastGameDate) return null
  const days = Math.round((new Date(gameDate).getTime() - new Date(lastGameDate).getTime()) / 86400000)
  return days - 1 // 1 day apart = 0 days rest = back-to-back
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function parseSlug(slug: string): { awaySlug: string; homeSlug: string; date: string } | null {
  const match = slug.match(/^(.+)-at-(.+)-(\d{4}-\d{2}-\d{2})$/)
  if (!match) return null
  return { awaySlug: match[1], homeSlug: match[2], date: match[3] }
}

export async function getNhlPreview(slug: string): Promise<NhlPreview | null> {
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data
  const pending = inFlight.get(slug)
  if (pending) return pending

  const promise = buildNhlPreview(slug)
    .then((data) => {
      cache.set(slug, { at: Date.now(), data })
      return data
    })
    .finally(() => inFlight.delete(slug))
  inFlight.set(slug, promise)
  return promise
}

async function buildNhlPreview(slug: string): Promise<NhlPreview | null> {
  const parsed = parseSlug(slug)
  if (!parsed) return null

  const supa = createAdminClient()
  const { data: teamRows, error: teamError } = await supa
    .from('nhl_teams')
    .select('team_id,abbrev,full_name,color_hex,text_on_hex')
  if (teamError) {
    console.error('[getNhlPreview] Supabase error reading nhl_teams:', teamError.message)
    return null
  }

  const awayTeamRow = (teamRows ?? []).find((t) => t.full_name && slugify(t.full_name) === parsed.awaySlug)
  const homeTeamRow = (teamRows ?? []).find((t) => t.full_name && slugify(t.full_name) === parsed.homeSlug)
  if (!awayTeamRow || !homeTeamRow) return null

  const { data: gameRow, error: gameError } = await supa
    .from('nhl_games')
    .select('game_id,season,game_date,start_time_utc,venue,venue_tz,game_state,away_team_id,home_team_id')
    .eq('game_date', parsed.date)
    .eq('away_team_id', awayTeamRow.team_id)
    .eq('home_team_id', homeTeamRow.team_id)
    .maybeSingle()
  if (gameError) {
    console.error('[getNhlPreview] Supabase error reading nhl_games:', gameError.message)
    return null
  }
  if (!gameRow) return null

  const season = gameRow.season as number
  const toTeam = (row: typeof awayTeamRow): NhlPreviewTeam => ({
    id: row.team_id,
    abbrev: row.abbrev,
    fullName: row.full_name ?? row.abbrev,
    color: row.color_hex,
    textColor: row.text_on_hex,
  })

  const [awayForm, homeForm, awayGoalies, homeGoalies, seasonSeries, awayDeployment, homeDeployment, awayAvailability, homeAvailability] =
    await Promise.all([
      getRecentForm(supa, awayTeamRow.team_id, season, gameRow.game_date as string),
      getRecentForm(supa, homeTeamRow.team_id, season, gameRow.game_date as string),
      getRecentGoalieStarts(supa, awayTeamRow.team_id, season, gameRow.game_date as string),
      getRecentGoalieStarts(supa, homeTeamRow.team_id, season, gameRow.game_date as string),
      getSeasonSeries(supa, awayTeamRow.team_id, homeTeamRow.team_id, season),
      getDeploymentStrip(awayTeamRow.team_id, season, 'nhl_toi_5v5', 8),
      getDeploymentStrip(homeTeamRow.team_id, season, 'nhl_toi_5v5', 8),
      getAvailabilityDesk(awayTeamRow.team_id, season),
      getAvailabilityDesk(homeTeamRow.team_id, season),
    ])

  return {
    game: {
      gameId: gameRow.game_id,
      gameDate: gameRow.game_date,
      startTimeUtc: gameRow.start_time_utc,
      venue: gameRow.venue,
      venueTz: gameRow.venue_tz,
      gameState: gameRow.game_state,
    },
    away: toTeam(awayTeamRow),
    home: toTeam(homeTeamRow),
    awayForm,
    homeForm,
    awayGoalies,
    homeGoalies,
    seasonSeries,
    awayDeployment,
    homeDeployment,
    awayAvailability,
    homeAvailability,
    awayRestDays: restDaysBefore(gameRow.game_date as string, awayForm.lastGameDate),
    homeRestDays: restDaysBefore(gameRow.game_date as string, homeForm.lastGameDate),
  }
}

async function getRecentForm(
  supa: ReturnType<typeof createAdminClient>,
  teamId: number,
  season: number,
  beforeDate: string,
  windowSize = 5,
): Promise<NhlRecentForm> {
  const { data: games, error } = await supa
    .from('nhl_games')
    .select('game_id,game_date,home_team_id,away_team_id,home_score,away_score,last_period_type,ingest_status')
    .eq('season', season)
    .eq('ingest_status', 'ingested')
    .lt('game_date', beforeDate)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('game_date', { ascending: false })
    .limit(windowSize)
  if (error) {
    console.error('[getRecentForm] Supabase error:', error.message)
  }
  const recent = games ?? []
  if (recent.length === 0) {
    return {
      gamesPlayed: 0, wins: 0, losses: 0, otLosses: 0, gfPerGame: null, gaPerGame: null,
      ppPct: null, pkPct: null, shotAttemptShare5v5: null, lastGameDate: null,
    }
  }

  let wins = 0, losses = 0, otLosses = 0, gf = 0, ga = 0
  const gameIds: number[] = []
  for (const g of recent) {
    gameIds.push(g.game_id as number)
    const isHome = g.home_team_id === teamId
    const teamScore = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
    const oppScore = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)
    gf += teamScore
    ga += oppScore
    if (teamScore > oppScore) wins++
    else if (g.last_period_type && g.last_period_type !== 'REG') otLosses++
    else losses++
  }

  const { data: stateRows, error: stateError } = await supa
    .from('nhl_team_game_state')
    .select('game_id,team_id,pp_opps,pp_goals,sh_goals_against')
    .eq('team_id', teamId)
    .in('game_id', gameIds)
  if (stateError) console.error('[getRecentForm] Supabase error reading nhl_team_game_state:', stateError.message)

  let ppOpps = 0, ppGoals = 0, pkOpps = 0, pkGoalsAgainst = 0
  for (const s of stateRows ?? []) {
    ppOpps += s.pp_opps ?? 0
    ppGoals += s.pp_goals ?? 0
    pkGoalsAgainst += s.sh_goals_against ?? 0
  }
  // PK opportunities = the opponent's PP opportunities in the same games --
  // read from the opponent's own team_game_state row per game.
  const { data: oppStateRows } = await supa
    .from('nhl_team_game_state')
    .select('game_id,team_id,pp_opps')
    .in('game_id', gameIds)
    .neq('team_id', teamId)
  for (const s of oppStateRows ?? []) {
    pkOpps += s.pp_opps ?? 0
  }

  const shotAttemptShare5v5 = await get5v5ShotAttemptShare(supa, teamId, gameIds)

  return {
    gamesPlayed: recent.length,
    wins,
    losses,
    otLosses,
    gfPerGame: gf / recent.length,
    gaPerGame: ga / recent.length,
    ppPct: ppOpps > 0 ? ppGoals / ppOpps : null,
    pkPct: pkOpps > 0 ? 1 - pkGoalsAgainst / pkOpps : null,
    shotAttemptShare5v5,
    lastGameDate: recent[0].game_date,
  }
}

const SHOT_ATTEMPT_TYPES = ['goal', 'shot-on-goal', 'missed-shot', 'blocked-shot']

async function get5v5ShotAttemptShare(
  supa: ReturnType<typeof createAdminClient>,
  teamId: number,
  gameIds: number[],
): Promise<number | null> {
  if (gameIds.length === 0) return null
  let forCount = 0
  let againstCount = 0
  for (const gameId of gameIds) {
    const [{ data: plays, error: playsError }, { data: timeline, error: timelineError }] = await Promise.all([
      supa.from('nhl_pbp_events').select('game_sec,event_owner_team_id,type_desc_key').eq('game_id', gameId).in('type_desc_key', SHOT_ATTEMPT_TYPES),
      supa.from('nhl_strength_timeline').select('start_sec,end_sec,home_skaters,away_skaters').eq('game_id', gameId),
    ])
    if (playsError || timelineError) {
      console.error('[get5v5ShotAttemptShare] Supabase error:', playsError?.message, timelineError?.message)
      continue
    }
    const fiveOnFive = (timeline ?? []).filter((t) => t.home_skaters === 5 && t.away_skaters === 5)
    for (const play of plays ?? []) {
      const inFiveOnFive = fiveOnFive.some((t) => play.game_sec >= t.start_sec && play.game_sec < t.end_sec)
      if (!inFiveOnFive) continue
      if (play.event_owner_team_id === teamId) forCount++
      else againstCount++
    }
  }
  const total = forCount + againstCount
  return total > 0 ? forCount / total : null
}

async function getRecentGoalieStarts(
  supa: ReturnType<typeof createAdminClient>,
  teamId: number,
  season: number,
  beforeDate: string,
): Promise<NhlGoalieStart[]> {
  const { data: goalieRows, error } = await supa
    .from('nhl_goalie_game')
    .select('game_id,player_id,team_id,starter,decision,ev_sa,ev_saves')
    .eq('team_id', teamId)
    .eq('starter', true)
  if (error) {
    console.error('[getRecentGoalieStarts] Supabase error:', error.message)
    return []
  }

  const { data: games } = await supa
    .from('nhl_games')
    .select('game_id,game_date')
    .eq('season', season)
    .lt('game_date', beforeDate)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('game_date', { ascending: false })
  const dateByGame = new Map((games ?? []).map((g) => [g.game_id as number, g.game_date as string]))

  interface GoalieGameRow {
    game_id: number
    player_id: number
    team_id: number
    starter: boolean
    decision: string | null
    ev_sa: number | null
    ev_saves: number | null
  }
  const byPlayer = new Map<number, GoalieGameRow[]>()
  for (const row of (goalieRows ?? []) as GoalieGameRow[]) {
    if (!dateByGame.has(row.game_id)) continue
    const list = byPlayer.get(row.player_id) ?? []
    list.push(row)
    byPlayer.set(row.player_id, list)
  }

  const { data: playerRows } = await supa.from('nhl_players').select('player_id,full_name').in('player_id', [...byPlayer.keys()])
  const nameByPlayer = new Map((playerRows ?? []).map((p) => [p.player_id as number, p.full_name as string]))

  const result: NhlGoalieStart[] = []
  for (const [playerId, rows] of byPlayer) {
    const sorted = [...rows].sort((a, b) => (dateByGame.get(b.game_id)! > dateByGame.get(a.game_id)! ? 1 : -1))
    const last3 = sorted.slice(0, 3)
    const evSa = sorted.reduce((sum, r) => sum + (r.ev_sa ?? 0), 0)
    const evSaves = sorted.reduce((sum, r) => sum + (r.ev_saves ?? 0), 0)
    const lastDate = last3[0] ? dateByGame.get(last3[0].game_id) : undefined
    const restDays = lastDate ? Math.round((new Date(beforeDate).getTime() - new Date(lastDate).getTime()) / 86400000) : null
    result.push({
      playerId,
      name: nameByPlayer.get(playerId) ?? `Player ${playerId}`,
      lastStarts: last3.map((r) => ({
        gameId: r.game_id,
        gameDate: dateByGame.get(r.game_id) ?? '',
        decision: r.decision,
        evSavePct: r.ev_sa ? r.ev_saves! / r.ev_sa : null,
      })),
      restDays,
      backToBack: restDays === 1,
      seasonEvSavePct: evSa > 0 ? evSaves / evSa : null,
    })
  }
  return result.sort((a, b) => (b.lastStarts[0]?.gameDate ?? '').localeCompare(a.lastStarts[0]?.gameDate ?? ''))
}

async function getSeasonSeries(
  supa: ReturnType<typeof createAdminClient>,
  awayTeamId: number,
  homeTeamId: number,
  season: number,
) {
  const { data, error } = await supa
    .from('nhl_games')
    .select('game_id,game_date,away_score,home_score,away_team_id,home_team_id')
    .eq('season', season)
    .eq('ingest_status', 'ingested')
    .or(
      `and(away_team_id.eq.${awayTeamId},home_team_id.eq.${homeTeamId}),and(away_team_id.eq.${homeTeamId},home_team_id.eq.${awayTeamId})`,
    )
    .order('game_date', { ascending: true })
  if (error) {
    console.error('[getSeasonSeries] Supabase error:', error.message)
    return []
  }
  return (data ?? []).map((g) => ({ gameId: g.game_id, gameDate: g.game_date, awayScore: g.away_score, homeScore: g.home_score }))
}
