// Data for /mlb/stats leaderboards: Batting, Pitching and Statcast tables with MLB's qualification rule.
// Qualified = 3.1 plate appearances (batters) or 1.0 innings (pitchers) per team game. Statcast boards use player minimums instead (50 PA, about 50 batters faced).
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { createAdminClient } from '@/lib/supabase'
import { getAllBattersSeasonTable } from '@/lib/stats-data'
import { MLB_TEAMS } from '@/lib/teams'

export type BoardRow = { id: number; name: string; team: string; teamId: number | null; n: number; qualified: boolean; v: Record<string, number | null> }
export type BoardCol = { key: string; label: string; digits?: number; pct?: boolean; lead?: boolean; asc?: boolean; tip?: string }
export type Board = { rows: BoardRow[]; cols: BoardCol[]; n: { key: string; label: string }; sortKey: string; sortAsc: boolean; minText: string | null; through: string }

const abbr = (teamId: number | null | undefined) => MLB_TEAMS.find(t => t.id === teamId)?.abbrev ?? ''

/** Games played per club this season (the qualification rule counts team games). */
async function teamGames(season: number): Promise<Map<number, number>> {
  const r = await mlb<{ stats?: { splits: { team: { id: number }; stat: { gamesPlayed?: number } }[] }[] }>(`/teams/stats?stats=season&group=hitting&season=${season}&sportId=1`, 3600)
  const m = new Map<number, number>()
  for (const s of r?.stats?.[0]?.splits ?? []) m.set(s.team.id, Number(s.stat.gamesPlayed ?? 0))
  return m
}
const leagueGames = (m: Map<number, number>) => Math.max(0, ...m.values())
const today = () => new Date().toISOString().slice(0, 10)

export const BATTING_COLS: BoardCol[] = [
  { key: 'avg', label: 'AVG', digits: 3 }, { key: 'obp', label: 'OBP', digits: 3 }, { key: 'slg', label: 'SLG', digits: 3 }, { key: 'ops', label: 'OPS', digits: 3, lead: true },
  { key: 'hr', label: 'HR', digits: 0 }, { key: 'rbi', label: 'RBI', digits: 0 }, { key: 'sb', label: 'SB', digits: 0 }, { key: 'bb', label: 'BB', digits: 0 }, { key: 'k', label: 'K', digits: 0 },
]
export const PITCHING_COLS: BoardCol[] = [
  { key: 'era', label: 'ERA', digits: 2, asc: true, lead: true }, { key: 'whip', label: 'WHIP', digits: 2, asc: true }, { key: 'k9', label: 'K/9', digits: 1 }, { key: 'bb9', label: 'BB/9', digits: 1, asc: true },
  { key: 'fip', label: 'FIP', digits: 2, asc: true }, { key: 'w', label: 'W', digits: 0 }, { key: 'l', label: 'L', digits: 0, asc: true }, { key: 'sv', label: 'SV', digits: 0 },
]
export const STATCAST_BAT_COLS: BoardCol[] = [
  { key: 'xwoba', label: 'xwOBA', digits: 3, lead: true }, { key: 'xba', label: 'xBA', digits: 3 }, { key: 'xslg', label: 'xSLG', digits: 3 },
  { key: 'ev', label: 'Avg EV', digits: 1 }, { key: 'hh', label: 'Hard-hit%', digits: 1, pct: true }, { key: 'barrel', label: 'Barrel%', digits: 1, pct: true },
]
export const STATCAST_PIT_COLS: BoardCol[] = [
  { key: 'xwoba', label: 'xwOBA against', digits: 3, asc: true, lead: true }, { key: 'xera', label: 'xERA', digits: 2, asc: true },
  { key: 'hh', label: 'Hard-hit%', digits: 1, pct: true, asc: true }, { key: 'barrel', label: 'Barrel%', digits: 1, pct: true, asc: true },
  { key: 'swstr', label: 'SwStr%', digits: 1, pct: true }, { key: 'chase', label: 'Chase%', digits: 1, pct: true },
]

const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function getBattingBoard(season: number): Promise<Board> {
  const [rows, games] = await Promise.all([
    mlb<{ stats?: { splits: { player: { id: number; fullName: string }; team?: { id: number }; stat: Record<string, string | number> }[] }[] }>(`/stats?stats=season&group=hitting&sportId=1&season=${season}&limit=1000&playerPool=ALL`, 600),
    teamGames(season),
  ])
  const out: BoardRow[] = (rows?.stats?.[0]?.splits ?? []).map(s => {
    const pa = Number(s.stat.plateAppearances ?? 0), tg = games.get(s.team?.id ?? 0) ?? leagueGames(games)
    return { id: s.player.id, name: s.player.fullName, team: abbr(s.team?.id), teamId: s.team?.id ?? null, n: pa, qualified: pa >= 3.1 * tg,
      v: { avg: num(s.stat.avg), obp: num(s.stat.obp), slg: num(s.stat.slg), ops: num(s.stat.ops), hr: num(s.stat.homeRuns), rbi: num(s.stat.rbi), sb: num(s.stat.stolenBases), bb: num(s.stat.baseOnBalls), k: num(s.stat.strikeOuts) } }
  }).filter(r => r.n > 0)
  return { rows: out, cols: BATTING_COLS, n: { key: 'pa', label: 'PA' }, sortKey: 'ops', sortAsc: false, minText: `Qualified: ${(3.1 * leagueGames(games)).toFixed(0)} plate appearances (3.1 per team game).`, through: today() }
}

async function pitcherRows(season: number): Promise<Record<string, unknown>[]> {
  const supa = createAdminClient(), all: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {   // PostgREST caps a request at 1,000 rows: page through
    const { data, error } = await supa.from('pitcher_stats').select('*').eq('season', season).range(from, from + 999)
    if (error) { console.error('[pitcherRows] Supabase error:', error.message); break }
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return all
}

export async function getPitchingBoard(season: number): Promise<Board> {
  const [rows, games] = await Promise.all([pitcherRows(season), teamGames(season)])
  const out: BoardRow[] = rows.filter(r => Number(r.innings_pitched ?? 0) > 0).map(r => {
    const ip = Number(r.innings_pitched), tid = Number(r.team_id), tg = games.get(tid) ?? leagueGames(games)
    return { id: Number(r.player_id), name: String(r.player_name), team: abbr(tid), teamId: tid || null, n: ip, qualified: ip >= tg,
      v: { era: num(r.era), whip: num(r.whip), k9: num(r.k_per_9), bb9: num(r.bb_per_9), fip: num(r.fip), w: num(r.wins), l: num(r.losses), sv: num(r.saves) } }
  })
  return { rows: out, cols: PITCHING_COLS, n: { key: 'ip', label: 'IP' }, sortKey: 'era', sortAsc: true, minText: `Qualified: ${leagueGames(games)} innings pitched (1.0 per team game).`, through: today() }
}

export async function getStatcastBatters(season: number): Promise<Board> {
  const rows = await getAllBattersSeasonTable(season)
  const out: BoardRow[] = rows.filter(r => Number(r.stats.pa ?? 0) >= 50 && r.stats.xwoba != null).map(r => ({
    id: r.id, name: r.name, team: r.team, teamId: r.teamId, n: Number(r.stats.pa), qualified: true,
    v: { xwoba: num(r.stats.xwoba), xba: num(r.stats.xba), xslg: num(r.stats.xslg), ev: num(r.stats.avg_exit_velocity), hh: num(r.stats.hard_hit_pct), barrel: num(r.stats.barrel_pct) },
  }))
  return { rows: out, cols: STATCAST_BAT_COLS, n: { key: 'pa', label: 'PA' }, sortKey: 'xwoba', sortAsc: false, minText: 'Minimum: 50 plate appearances. Hard-hit% needs 25 batted balls.', through: today() }
}

export async function getStatcastPitchers(season: number): Promise<Board> {
  const rows = await pitcherRows(season)
  // Batters faced is not stored per pitcher; 12 innings is about 50 batters faced.
  const out: BoardRow[] = rows.filter(r => Number(r.innings_pitched ?? 0) >= 12 && r.xwoba_allowed != null).map(r => ({
    id: Number(r.player_id), name: String(r.player_name), team: abbr(Number(r.team_id)), teamId: Number(r.team_id) || null, n: Number(r.innings_pitched), qualified: true,
    v: { xwoba: num(r.xwoba_allowed), xera: num(r.xera), hh: num(r.hard_hit_pct), barrel: num(r.barrel_pct), swstr: num(r.swstr_pct), chase: num(r.chase_rate) },
  }))
  return { rows: out, cols: STATCAST_PIT_COLS, n: { key: 'ip', label: 'IP' }, sortKey: 'xwoba', sortAsc: true, minText: 'Minimum: 50 batters faced (about 12 innings).', through: today() }
}
