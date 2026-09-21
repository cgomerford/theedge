// src/lib/nfl-edge/games.ts
//
// The NFL schedule as the pages need it: slate, single-game lookup by slug, kickoff formatting.
// Source: nfl_games (writer: scripts/nfl/sync_schedule.py). Spreads / totals are NEVER stored there
// and never appear here (brand rule: not a betting product).
//
// LIMITATIONS worth knowing (they are shown honestly in the UI, not papered over):
//  - nflverse has no live feed. A game is "live" only by the clock (kicked off < 4h ago, no score yet);
//    once nflverse posts a score it is final. Live scores are not shown.
//  - temp / wind are filled by nflverse AFTER a game is played; upcoming games have none.
//  - roof is null for retractable-roof stadiums until game day.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { getNflTeams, type NflTeam } from './teams'

export type GamePhase = 'upcoming' | 'live' | 'awaiting' | 'final'

export type NflGame = {
  id: string
  slug: string
  season: number
  seasonType: string
  week: number
  gameday: string           // YYYY-MM-DD, Eastern
  kickoff: string | null    // ISO UTC
  homeId: string
  awayId: string
  homeScore: number | null
  awayScore: number | null
  stadium: string | null
  roof: string | null
  surface: string | null
  temp: number | null
  wind: number | null
  referee: string | null
  divGame: boolean
  overtime: boolean
  homeRest: number | null
  awayRest: number | null
  homeQbId: string | null
  homeQbName: string | null
  awayQbId: string | null
  awayQbName: string | null
}

type GameRow = {
  game_id: string; season: number; season_type: string; week: number; gameday: string; gametime: string | null
  home_team: string; away_team: string; home_score: number | null; away_score: number | null
  stadium: string | null; roof: string | null; surface: string | null; temp: number | null; wind: number | null
  referee: string | null; div_game: boolean | null; overtime: boolean | null; home_rest: number | null; away_rest: number | null
  home_qb_id: string | null; home_qb_name: string | null; away_qb_id: string | null; away_qb_name: string | null
}

const COLS =
  'game_id,season,season_type,week,gameday,gametime,home_team,away_team,home_score,away_score,stadium,roof,surface,temp,wind,referee,div_game,overtime,home_rest,away_rest,home_qb_id,home_qb_name,away_qb_id,away_qb_name'

export function gameSlug(g: { awayId: string; homeId: string; gameday: string }, teams: Map<string, NflTeam>): string {
  const a = teams.get(g.awayId)?.slug ?? g.awayId.toLowerCase()
  const h = teams.get(g.homeId)?.slug ?? g.homeId.toLowerCase()
  return `${a}-at-${h}-${g.gameday}`
}

const loadSeason = unstable_cache(
  async (season: number): Promise<NflGame[]> => {
    const [teams, res] = await Promise.all([
      getNflTeams(),
      createAdminClient().from('nfl_games').select(COLS).eq('season', season).order('gameday').order('gametime'),
    ])
    if (res.error) {
      console.error('[getSeasonGames] Supabase error:', res.error.message)
      return []
    }
    return (res.data as GameRow[]).map(r => {
      const base = {
        id: r.game_id, season: r.season, seasonType: r.season_type, week: r.week, gameday: r.gameday, kickoff: r.gametime,
        homeId: r.home_team, awayId: r.away_team,
        homeScore: r.home_score, awayScore: r.away_score,
        stadium: r.stadium, roof: r.roof, surface: r.surface,
        temp: r.temp == null ? null : Number(r.temp), wind: r.wind == null ? null : Number(r.wind),
        referee: r.referee, divGame: !!r.div_game, overtime: !!r.overtime,
        homeRest: r.home_rest, awayRest: r.away_rest,
        homeQbId: r.home_qb_id, homeQbName: r.home_qb_name, awayQbId: r.away_qb_id, awayQbName: r.away_qb_name,
      }
      return { ...base, slug: gameSlug(base, teams) }
    })
  },
  ['nfl-edge-season-games'],
  { revalidate: 300 },
)

export async function getSeasonGames(season: number): Promise<NflGame[]> {
  return loadSeason(season)
}

/** Season a calendar date belongs to (Jan–Mar games are the previous season's playoffs). */
export function seasonOfDate(d: Date): number {
  return d.getUTCMonth() <= 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
}

export function phaseOf(g: NflGame, now: Date = new Date()): GamePhase {
  if (g.homeScore != null && g.awayScore != null) return 'final'
  if (!g.kickoff) return 'upcoming'
  const start = new Date(g.kickoff).getTime()
  const t = now.getTime()
  if (t < start) return 'upcoming'
  if (t - start < 4 * 3600 * 1000) return 'live'
  return 'awaiting'
}

export async function getGameBySlug(slug: string): Promise<NflGame | null> {
  const m = /-(\d{4})-(\d{2})-(\d{2})$/.exec(slug)
  if (!m) return null
  const season = seasonOfDate(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
  const games = await getSeasonGames(season)
  return games.find(g => g.slug === slug) ?? null
}

/** The week the slate should show: the first week with a game not yet final, else the last week. */
export function currentWeek(games: NflGame[]): number | null {
  const reg = games.filter(g => g.seasonType === 'REG')
  const pool = reg.length ? reg : games
  if (!pool.length) return null
  const open = pool.filter(g => g.homeScore == null || g.awayScore == null)
  if (open.length) return Math.min(...open.map(g => g.week))
  return Math.max(...pool.map(g => g.week))
}

const ET = 'America/New_York'

export function kickoffLabel(iso: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ET }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET }).format(d)
  return `${day} ${time} ET`
}

export function kickoffTime(iso: string | null): string {
  if (!iso) return 'TBD'
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET }).format(new Date(iso)) + ' ET'
}

export function dateLabel(gameday: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(gameday + 'T12:00:00Z'))
}

/** Today's date in Eastern time, YYYY-MM-DD. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function weekLabel(g: { seasonType: string; week: number }): string {
  if (g.seasonType === 'REG') return `Week ${g.week}`
  return ({ 19: 'Wild Card', 20: 'Divisional', 21: 'Conference Championship', 22: 'Super Bowl' } as Record<number, string>)[g.week] ?? `Week ${g.week}`
}

export type RoofKind = 'dome' | 'outdoors' | 'retractable' | 'unknown'

/** nflverse roof values: dome / closed (retractable, shut) / open (retractable, open) / outdoors / null. */
export function roofKind(roof: string | null, _stadium?: string | null): RoofKind {
  if (roof === 'dome' || roof === 'closed') return 'dome'
  if (roof === 'outdoors' || roof === 'open') return 'outdoors'
  if (roof == null) return 'unknown'
  return 'unknown'
}

export function isPrimetime(g: NflGame): boolean {
  if (!g.kickoff) return false
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: ET }).format(new Date(g.kickoff)))
  return h >= 19
}

export function isShortWeek(rest: number | null): boolean {
  return rest != null && rest <= 5
}
