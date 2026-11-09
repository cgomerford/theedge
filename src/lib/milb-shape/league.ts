// src/lib/milb-shape/league.ts
//
// Which games and pitches belong to which minor-league level, decided from the MLB Stats API and nothing else.
//   * Teams:    /api/v1/teams?sportId=11|14&season=Y carries each club's league (id and name). Single-A (sport 14) holds three leagues; the Florida State League is the
//               one whose NAME is "Florida State League". Its id is read from the API here, never assumed.
//   * Schedule: /api/v1/schedule?sportId=11|14&startDate&endDate gives every game's gamePk and its two clubs. A game's level is its home club's league.
// A Savant row is accepted only if its game_pk resolves to a Triple-A game or a Florida State League game. Everything else is counted and left out:
//   * a game from another Single-A league (Carolina, California)   -> excluded, counted by league
//   * a game_pk the schedule does not know                          -> quarantined (unresolved), counted
//   * a row whose home_team disagrees with the schedule's home club -> quarantined
// A response that looks like MLB (home_team is a major-league club, or most game_pks are unknown) fails the whole chunk instead of being filtered.

import { EXPECTED_LEAGUES, FSL_LEAGUE_NAME, type MilbLevel } from './levels'

export type ApiTeam = { id: number; abbreviation?: string; name?: string; league?: { id: number; name: string }; sport?: { id: number } }
export type ApiGame = { gamePk: number; gameType?: string; officialDate?: string; teams: { home: { team: { id: number; name?: string } }; away: { team: { id: number; name?: string } } }; venue?: { id?: number; name?: string } }

export type TeamInfo = { id: number; abbr: string; name: string; leagueId: number; leagueName: string; sportId: number }
export type GameInfo = { gamePk: number; date: string; homeTeamId: number; homeAbbr: string; awayTeamId: number; venue: string | null; leagueId: number; leagueName: string; level: MilbLevel | null }

export type Registry = {
  teams: Map<number, TeamInfo>
  games: Map<number, GameInfo>
  /** league id read from the API for each level (Triple-A has two) */
  leagues: Record<MilbLevel, number[]>
  /** differences between what the API says and what levels.ts expects, for the coverage report */
  notes: string[]
}

/** Major-league abbreviations (Savant's): if a "minor-league" response carries these as home_team, it is MLB data. */
export const MLB_ABBRS = new Set(['AZ', 'ARI', 'ATL', 'ATH', 'BAL', 'BOS', 'CHC', 'CIN', 'CLE', 'COL', 'CWS', 'DET', 'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK', 'PHI', 'PIT', 'SD', 'SEA', 'SF', 'STL', 'TB', 'TEX', 'TOR', 'WSH'])

/** Build the registry from the two team lists (sport 11 and sport 14). Throws when the Florida State League is not in the Single-A list. */
export function buildTeams(aaa: ApiTeam[], singleA: ApiTeam[]): { teams: Map<number, TeamInfo>; leagues: Record<MilbLevel, number[]>; notes: string[] } {
  const teams = new Map<number, TeamInfo>()
  const notes: string[] = []
  const add = (t: ApiTeam, sportId: number) => {
    if (!t.league) return
    teams.set(t.id, { id: t.id, abbr: (t.abbreviation ?? '').toUpperCase(), name: t.name ?? String(t.id), leagueId: t.league.id, leagueName: t.league.name, sportId })
  }
  aaa.forEach(t => add(t, 11))
  singleA.forEach(t => add(t, 14))
  const fsl = [...new Set(singleA.filter(t => t.league?.name === FSL_LEAGUE_NAME).map(t => t.league!.id))]
  if (fsl.length !== 1) throw new Error(`[league] expected exactly one league named "${FSL_LEAGUE_NAME}" in the Single-A team list, found ${fsl.length}`)
  const aaaLeagues = [...new Set(aaa.map(t => t.league?.id).filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b)
  if (aaaLeagues.length === 0) throw new Error('[league] the Triple-A team list has no leagues')
  const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
  if (!same(fsl, EXPECTED_LEAGUES.fsl)) notes.push(`Florida State League id from the API is ${fsl[0]}, levels.ts expected ${EXPECTED_LEAGUES.fsl.join(',')}; using the API's`)
  if (!same(aaaLeagues, EXPECTED_LEAGUES.aaa)) notes.push(`Triple-A league ids from the API are ${aaaLeagues.join(',')}, levels.ts expected ${EXPECTED_LEAGUES.aaa.join(',')}; using the API's`)
  return { teams, leagues: { aaa: aaaLeagues, fsl, afl: [], st: [] }, notes }
}

/** Add schedule games to a registry's game map. Spring training and postseason games are left out (the Lab is regular season). */
export function addGames(reg: Registry, games: ApiGame[]): void {
  for (const g of games) {
    if (g.gameType && g.gameType !== 'R') continue
    const home = reg.teams.get(g.teams.home.team.id)
    if (!home) continue   // a club outside the Triple-A and Single-A lists
    const level: MilbLevel | null = reg.leagues.aaa.includes(home.leagueId) ? 'aaa' : reg.leagues.fsl.includes(home.leagueId) ? 'fsl' : null
    reg.games.set(g.gamePk, {
      gamePk: g.gamePk, date: g.officialDate ?? '', homeTeamId: home.id, homeAbbr: home.abbr, awayTeamId: g.teams.away.team.id,
      venue: g.venue?.name ?? null, leagueId: home.leagueId, leagueName: home.leagueName, level,
    })
  }
}

export function makeRegistry(aaa: ApiTeam[], singleA: ApiTeam[]): Registry {
  const { teams, leagues, notes } = buildTeams(aaa, singleA)
  return { teams, leagues, games: new Map(), notes }
}

export type Rejects = {
  /** rows kept per level */
  kept: Record<MilbLevel, number>
  /** rows from games in another Single-A league (or a level not asked for), by league name */
  otherLeague: Record<string, number>
  /** rows whose game_pk the schedule did not resolve */
  unresolved: number
  /** rows whose home_team disagreed with the schedule's home club */
  mismatch: number
  quarantinedGames: number[]
}

export class MlbMasqueradeError extends Error {}

export type Row = { game_pk?: unknown; home_team?: unknown }

/**
 * Sort one chunk's rows into the level asked for, counting everything left out. Throws MlbMasqueradeError (fail closed) when the chunk looks like major-league data:
 * most home_team values are major-league clubs, or a third or more of the games are unknown to the schedule.
 */
export function filterRows<T extends Row>(rows: T[], reg: Registry, want: MilbLevel): { rows: T[]; rejects: Rejects } {
  const rejects: Rejects = emptyRejects()
  if (rows.length === 0) return { rows: [], rejects }
  let mlbHome = 0
  const pks = new Set<number>(), unknown = new Set<number>()
  for (const r of rows) {
    const pk = Number(r.game_pk)
    pks.add(pk)
    if (typeof r.home_team === 'string' && MLB_ABBRS.has(r.home_team.toUpperCase()) && !reg.games.has(pk)) mlbHome++
    if (!reg.games.has(pk)) unknown.add(pk)
  }
  if (mlbHome / rows.length > 0.5) throw new MlbMasqueradeError(`[filterRows] ${mlbHome} of ${rows.length} rows have a major-league home_team and no minor-league game: this is an MLB response`)
  if (pks.size > 0 && unknown.size / pks.size >= 1 / 3) throw new MlbMasqueradeError(`[filterRows] ${unknown.size} of ${pks.size} games are not in the minor-league schedule: refusing the chunk`)
  const kept: T[] = []
  const quarantined = new Set<number>()
  for (const r of rows) {
    const pk = Number(r.game_pk)
    const g = reg.games.get(pk)
    if (!g) { rejects.unresolved++; quarantined.add(pk); continue }
    if (g.level !== want) {
      const k = g.level ? `${g.leagueName} (${g.level})` : g.leagueName
      rejects.otherLeague[k] = (rejects.otherLeague[k] ?? 0) + 1
      continue
    }
    if (typeof r.home_team === 'string' && r.home_team && g.homeAbbr && r.home_team.toUpperCase() !== g.homeAbbr) { rejects.mismatch++; quarantined.add(pk); continue }
    rejects.kept[want]++
    kept.push(r)
  }
  rejects.quarantinedGames = [...quarantined].sort((a, b) => a - b)
  return { rows: kept, rejects }
}

export function mergeRejects(a: Rejects, b: Rejects): Rejects {
  const other: Record<string, number> = { ...a.otherLeague }
  for (const [k, v] of Object.entries(b.otherLeague)) other[k] = (other[k] ?? 0) + v
  return {
    kept: { aaa: a.kept.aaa + b.kept.aaa, fsl: a.kept.fsl + b.kept.fsl, afl: a.kept.afl + b.kept.afl, st: a.kept.st + b.kept.st }, otherLeague: other, unresolved: a.unresolved + b.unresolved, mismatch: a.mismatch + b.mismatch,
    quarantinedGames: [...new Set([...a.quarantinedGames, ...b.quarantinedGames])].sort((x, y) => x - y),
  }
}
export const emptyRejects = (): Rejects => ({ kept: { aaa: 0, fsl: 0, afl: 0, st: 0 }, otherLeague: {}, unresolved: 0, mismatch: 0, quarantinedGames: [] })
