// src/lib/nfl-edge/slate.ts
//
// Everything the NFL homepage needs for "this week's slate": each game with both clubs, records,
// the Edge lean chip (factor counts only), star-injury counts, weather/roof and rest badges.
//
// Tables read: nfl_games, nfl_teams, nfl_team_form (via factors.ts), nfl_injuries, nfl_depth_charts.
// All small, all cached upstream; nothing here calls an external API.

import { createAdminClient } from '@/lib/supabase'
import { getNflTeams, type NflTeam } from './teams'
import { currentWeek, getSeasonGames, isPrimetime, kickoffTime, isShortWeek, phaseOf, roofKind, weekLabel, type GamePhase, type NflGame, type RoofKind } from './games'
import { getLeagueForm, leagueRates, type LeagueForm } from './form'
import { computeEdgeRead, leanLabel, type Strength } from './factors'
import { fetchAll, getDepthChart } from './players'
import type { NflTickerGame } from '@/lib/nfl-ticker'

export type Record3 = { w: number; l: number; t: number }
export const recordStr = (r: Record3) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`

export function recordsFrom(games: NflGame[]): Map<string, Record3> {
  const m = new Map<string, Record3>()
  const bump = (id: string, k: 'w' | 'l' | 't') => {
    const r = m.get(id) ?? { w: 0, l: 0, t: 0 }
    r[k] += 1
    m.set(id, r)
  }
  for (const g of games) {
    if (g.seasonType !== 'REG' || g.homeScore == null || g.awayScore == null) continue
    if (g.homeScore === g.awayScore) { bump(g.homeId, 't'); bump(g.awayId, 't') }
    else if (g.homeScore > g.awayScore) { bump(g.homeId, 'w'); bump(g.awayId, 'l') }
    else { bump(g.awayId, 'w'); bump(g.homeId, 'l') }
  }
  return m
}

export type SlateGame = {
  game: NflGame
  home: NflTeam
  away: NflTeam
  phase: GamePhase
  homeRec: string
  awayRec: string
  read: { ready: boolean; label: string; lean: 'home' | 'away' | 'even'; strength: Strength; homeCount: number; awayCount: number; total: number }
  starInjuries: { home: number; away: number }
  roof: RoofKind
  primetime: boolean
  shortHome: boolean
  shortAway: boolean
  /** blended net EPA per play of both clubs; used only to choose the featured game */
  billing: number | null
}

export type Slate = {
  season: number
  week: number
  label: string
  games: SlateGame[]
  featured: SlateGame | null
  injuryTotals: { out: number; doubtful: number; questionable: number } | null
}

/** Starters listed Out or Doubtful this week: depth-chart rank 1 at any position. */
async function starInjuryCounts(teamIds: string[], season: number, week: number): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!teamIds.length) return out
  const sb = createAdminClient()
  const inj = await fetchAll<{ player_id: string; team_id: string }>(
    (a, b) => sb.from('nfl_injuries').select('player_id,team_id').eq('season', season).eq('week', week).in('team_id', teamIds).in('report_status', ['Out', 'Doubtful']).range(a, b),
    'starInjuryCounts:injuries',
  )
  if (!inj.length) return out
  const depth = await fetchAll<{ player_id: string; team_id: string; depth_rank: number }>(
    (a, b) => sb.from('nfl_depth_charts').select('player_id,team_id,depth_rank').eq('season', season).in('player_id', [...new Set(inj.map(i => i.player_id))]).eq('depth_rank', 1).range(a, b),
    'starInjuryCounts:depth',
  )
  const starters = new Set(depth.map(d => `${d.team_id}|${d.player_id}`))
  for (const i of inj) if (starters.has(`${i.team_id}|${i.player_id}`)) out.set(i.team_id, (out.get(i.team_id) ?? 0) + 1)
  return out
}

export async function starterQbId(teamId: string, season: number, fromGame: string | null): Promise<string | null> {
  if (fromGame) return fromGame
  const d = await getDepthChart(teamId, season)
  return d.filter(r => r.position === 'QB').sort((a, b) => a.depth_rank - b.depth_rank)[0]?.player_id ?? null
}

async function activeSeasonGames(now: Date): Promise<NflGame[]> {
  // The active season is the newest one that has games; the schedule is loaded a year at a time.
  const y = now.getUTCFullYear()
  const [a, b] = await Promise.all([getSeasonGames(y), getSeasonGames(y - 1)])
  return a.length ? a : b
}

export async function getSlate(now: Date = new Date()): Promise<Slate | null> {
  const games = await activeSeasonGames(now)
  if (!games.length) return null
  const week = currentWeek(games)
  if (week == null) return null
  return buildSlate(games, week, now, true)
}

/** Build the slate for one specific week. `withInjuryTotals` is only needed for the homepage strip. */
async function buildSlate(games: NflGame[], week: number, now: Date, withInjuryTotals: boolean): Promise<Slate | null> {
  const season = games[0].season
  const [teams, lf] = await Promise.all([getNflTeams(), getLeagueForm(season)])
  const records = recordsFrom(games)
  const weekGames = games.filter(g => g.week === week)
  const stars = await starInjuryCounts([...new Set(weekGames.flatMap(g => [g.homeId, g.awayId]))], season, week)
  const lr = leagueRates(lf as LeagueForm)

  const built = await Promise.all(
    weekGames.map(async (g): Promise<SlateGame | null> => {
      const home = teams.get(g.homeId), away = teams.get(g.awayId)
      if (!home || !away) return null
      const [hq, aq] = await Promise.all([starterQbId(g.homeId, season, g.homeQbId), starterQbId(g.awayId, season, g.awayQbId)])
      const r = await computeEdgeRead({ game: g, lf, homeQbId: hq, awayQbId: aq })
      const hr = lr.get(g.homeId), ar = lr.get(g.awayId)
      const net = (x?: typeof hr) => (x && x.offEpa != null && x.defEpa != null ? x.offEpa - x.defEpa : null)
      const hn = net(hr), an = net(ar)
      return {
        game: g, home, away, phase: phaseOf(g, now),
        homeRec: recordStr(records.get(g.homeId) ?? { w: 0, l: 0, t: 0 }), awayRec: recordStr(records.get(g.awayId) ?? { w: 0, l: 0, t: 0 }),
        read: { ready: r.ready && r.total > 0, label: leanLabel(r, home.id, away.id), lean: r.lean, strength: r.strength, homeCount: r.homeCount, awayCount: r.awayCount, total: r.total },
        starInjuries: { home: stars.get(g.homeId) ?? 0, away: stars.get(g.awayId) ?? 0 },
        roof: roofKind(g.roof, g.stadium), primetime: isPrimetime(g),
        shortHome: isShortWeek(g.homeRest), shortAway: isShortWeek(g.awayRest),
        billing: hn != null && an != null ? hn + an : null,
      }
    }),
  )
  const list = built.filter((x): x is SlateGame => !!x).sort((a, b) => (a.game.kickoff ?? '').localeCompare(b.game.kickoff ?? ''))

  // Featured game: the strongest combined net-EPA billing among games not yet final; primetime breaks ties.
  const open = list.filter(g => g.phase !== 'final')
  const pool = open.length ? open : list
  const featured =
    [...pool].sort((a, b) => ((b.billing ?? -9) + (b.primetime ? 0.05 : 0)) - ((a.billing ?? -9) + (a.primetime ? 0.05 : 0)))[0] ?? null

  // League-wide injury strip: how many players are Out / Doubtful / Questionable this week.
  let injuryTotals: Slate['injuryTotals'] = null
  const { data } = !withInjuryTotals ? { data: null } : await createAdminClient().from('nfl_injuries').select('report_status').eq('season', season).eq('week', week).not('report_status', 'is', null).limit(1000)
  if (data && data.length) {
    injuryTotals = { out: 0, doubtful: 0, questionable: 0 }
    for (const r of data as { report_status: string }[]) {
      if (r.report_status === 'Out') injuryTotals.out += 1
      else if (r.report_status === 'Doubtful') injuryTotals.doubtful += 1
      else if (r.report_status === 'Questionable') injuryTotals.questionable += 1
    }
  }

  return { season, week, label: weekGames[0] ? weekLabel(weekGames[0]) : `Week ${week}`, games: list, featured, injuryTotals }
}

/**
 * Ticker rows for the shared SportLiveTicker, built from nfl_games (nflverse) instead of ESPN.
 * Statuses come from the kickoff clock and posted scores; there is no live score feed.
 */
export async function getNflTicker(now: Date = new Date()): Promise<NflTickerGame[]> {
  const y = now.getUTCFullYear()
  const [a, b] = await Promise.all([getSeasonGames(y), getSeasonGames(y - 1)])
  const games = a.length ? a : b
  const week = currentWeek(games)
  if (week == null) return []
  const teams = await getNflTeams()
  return games
    .filter(g => g.week === week)
    .sort((x, y2) => (x.kickoff ?? '').localeCompare(y2.kickoff ?? ''))
    .flatMap((g): NflTickerGame[] => {
      const h = teams.get(g.homeId), aw = teams.get(g.awayId)
      if (!h || !aw) return []
      const ph = phaseOf(g, now)
      return [{
        slug: g.slug, awayAbbr: aw.id, homeAbbr: h.id, awayLogo: aw.logo, homeLogo: h.logo,
        awayScore: ph === 'final' ? g.awayScore : null, homeScore: ph === 'final' ? g.homeScore : null,
        status: ph === 'final' ? 'final' : ph === 'live' ? 'live' : 'scheduled',
        statusDisplay: kickoffTime(g.kickoff),
      }]
    })
}

// ── ticker: last week / this week / next week ───────────────────────────────

export type TickerWeek = { key: 'prev' | 'this' | 'next'; label: string; week: number; games: SlateGame[] }

/** The three weeks the homepage ticker can switch between (the NFL equivalent of MLB's yesterday / today / tomorrow). */
export async function getTickerWeeks(now: Date = new Date()): Promise<TickerWeek[]> {
  const games = await activeSeasonGames(now)
  const w = games.length ? currentWeek(games) : null
  if (w == null) return []
  const weeks = [...new Set(games.filter(g => g.seasonType === 'REG').map(g => g.week))].sort((a, b) => a - b)
  const pick: [TickerWeek['key'], string, number | undefined][] = [['prev', 'last week', weeks[weeks.indexOf(w) - 1]], ['this', 'this week', w], ['next', 'next week', weeks[weeks.indexOf(w) + 1]]]
  const out = await Promise.all(pick.filter(([, , wk]) => wk != null).map(async ([key, label, wk]) => {
    const s = await buildSlate(games, wk as number, now, false)
    return s ? ({ key, label, week: wk as number, games: s.games } as TickerWeek) : null
  }))
  return out.filter((x): x is TickerWeek => !!x)
}

// ── standings ───────────────────────────────────────────────────────────────

export type StandingRow = { id: string; w: number; l: number; t: number; pf: number; pa: number; streak: string; divW: number; divL: number }
export type DivisionStandings = { conference: 'AFC' | 'NFC'; division: string; teams: StandingRow[] }

const DIV_ORDER = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West']

/** Division standings from the regular-season results in nfl_games (no external feed). */
export async function getStandings(now: Date = new Date()): Promise<{ season: number; divisions: DivisionStandings[]; through: number } | null> {
  const [games, teams] = await Promise.all([activeSeasonGames(now), getNflTeams()])
  const reg = games.filter(g => g.seasonType === 'REG')
  if (!reg.length || !teams.size) return null
  const done = reg.filter(g => g.homeScore != null && g.awayScore != null).sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? ''))
  const rows = new Map<string, StandingRow & { results: string[] }>()
  for (const t of teams.values()) rows.set(t.id, { id: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: '—', divW: 0, divL: 0, results: [] })
  for (const g of done) {
    const h = rows.get(g.homeId), a = rows.get(g.awayId)
    if (!h || !a) continue
    const hs = g.homeScore as number, as = g.awayScore as number
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs
    const res = (mine: number, theirs: number) => (mine > theirs ? 'W' : mine < theirs ? 'L' : 'T')
    const hr = res(hs, as), ar = res(as, hs)
    h.results.push(hr); a.results.push(ar)
    if (hr === 'W') { h.w++; a.l++ } else if (hr === 'L') { h.l++; a.w++ } else { h.t++; a.t++ }
    if (g.divGame) { if (hr === 'W') { h.divW++; a.divL++ } else if (hr === 'L') { h.divL++; a.divW++ } }
  }
  for (const r of rows.values()) {
    const last = r.results[r.results.length - 1]
    if (last) { let n = 0; for (let i = r.results.length - 1; i >= 0 && r.results[i] === last; i--) n++; r.streak = `${last}${n}` }
  }
  const pct = (r: StandingRow) => (r.w + r.t / 2) / Math.max(r.w + r.l + r.t, 1)
  const divisions = DIV_ORDER.map((name): DivisionStandings => ({
    conference: name.startsWith('AFC') ? 'AFC' : 'NFC', division: name,
    teams: [...teams.values()].filter(t => t.division === name).map(t => rows.get(t.id)!).map(({ results, ...r }) => (void results, r))
      .sort((a, b) => pct(b) - pct(a) || (b.pf - b.pa) - (a.pf - a.pa) || a.id.localeCompare(b.id)),
  })).filter(d => d.teams.length)
  return { season: reg[0].season, divisions, through: Math.max(0, ...done.map(g => g.week)) }
}
