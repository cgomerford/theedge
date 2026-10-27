// Data for /mlb/stats leaderboards: Batting, Pitching and Statcast tables with MLB's qualification rule.
// Qualified = 3.1 plate appearances (batters) or 1.0 innings (pitchers) per team game. Statcast boards use player minimums instead (50 PA, about 50 batters faced).
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { createAdminClient } from '@/lib/supabase'
import { getAllBattersSeasonTable } from '@/lib/stats-data'
import { MLB_TEAMS } from '@/lib/teams'

export type BoardRow = { id: number; name: string; team: string; teamId: number | null; n: number; qualified: boolean; v: Record<string, number | null> }
export type BoardCol = { key: string; label: string; digits?: number; pct?: boolean; lead?: boolean; asc?: boolean; tip?: string; signed?: boolean }
export type Board = { rows: BoardRow[]; cols: BoardCol[]; moreCols?: BoardCol[]; n: { key: string; label: string }; sortKey: string; sortAsc: boolean; minText: string | null; through: string }

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
  { key: 'xwoba', label: 'xwOBA', digits: 3, lead: true }, { key: 'xba', label: 'xBA', digits: 3 }, { key: 'xbadiff', label: 'xBA − AVG', digits: 3, signed: true, tip: 'Expected average minus actual average. Positive means the contact quality was better than the results: unlucky.' }, { key: 'xslg', label: 'xSLG', digits: 3 },
  { key: 'ev', label: 'Avg EV', digits: 1 }, { key: 'hh', label: 'Hard-hit%', digits: 1, pct: true }, { key: 'barrel', label: 'Barrel%', digits: 1, pct: true },
]
export const STATCAST_PIT_COLS: BoardCol[] = [
  { key: 'xwoba', label: 'xwOBA against', digits: 3, asc: true, lead: true }, { key: 'xera', label: 'xERA', digits: 2, asc: true },
  { key: 'hh', label: 'Hard-hit%', digits: 1, pct: true, asc: true }, { key: 'barrel', label: 'Barrel%', digits: 1, pct: true, asc: true },
  { key: 'swstr', label: 'SwStr%', digits: 1, pct: true }, { key: 'chase', label: 'Chase%', digits: 1, pct: true },
]

const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

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

export async function getStatcastBatters(season: number): Promise<Board> {
  const rows = await getAllBattersSeasonTable(season)
  const out: BoardRow[] = rows.filter(r => Number(r.stats.pa ?? 0) >= 50 && r.stats.xwoba != null).map(r => ({
    id: r.id, name: r.name, team: r.team, teamId: r.teamId, n: Number(r.stats.pa), qualified: true,
    v: { xwoba: num(r.stats.xwoba), xba: num(r.stats.xba), xbadiff: num(r.stats.xba) != null && num(r.stats.avg) != null ? (num(r.stats.xba) as number) - (num(r.stats.avg) as number) : null, xslg: num(r.stats.xslg), ev: num(r.stats.avg_exit_velocity), hh: num(r.stats.hard_hit_pct), barrel: num(r.stats.barrel_pct) },
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

export const ADV_BAT_COLS: BoardCol[] = [
  { key: 'xbadiff', label: 'xBA − AVG', digits: 3, signed: true, lead: true, tip: 'Expected average minus actual average. Positive means the contact quality was better than the results: unlucky.' }, { key: 'iso', label: 'ISO', digits: 3 }, { key: 'babip', label: 'BABIP', digits: 3 }, { key: 'bbp', label: 'BB%', digits: 1, pct: true }, { key: 'kp', label: 'K%', digits: 1, pct: true, asc: true },
  { key: 'bbk', label: 'BB/K', digits: 2 }, { key: 'sweet', label: 'Sweet spot%', digits: 1, pct: true }, { key: 'maxev', label: 'Max EV', digits: 1 }, { key: 'sprint', label: 'Sprint speed', digits: 1 },
]
export const ADV_PIT_COLS: BoardCol[] = [
  { key: 'kbb', label: 'K-BB%', digits: 1, pct: true, lead: true }, { key: 'kp', label: 'K%', digits: 1, pct: true }, { key: 'bbp', label: 'BB%', digits: 1, pct: true, asc: true }, { key: 'kbbr', label: 'K/BB', digits: 2 },
  { key: 'babip', label: 'BABIP', digits: 3, asc: true }, { key: 'lob', label: 'LOB%', digits: 1, pct: true }, { key: 'gb', label: 'GB%', digits: 1, pct: true }, { key: 'fip', label: 'FIP', digits: 2, asc: true }, { key: 'xera', label: 'xERA', digits: 2, asc: true },
]

export async function getAdvancedBatters(season: number): Promise<Board> {
  const [rows, games] = await Promise.all([getAllBattersSeasonTable(season), teamGames(season)])
  const out: BoardRow[] = rows.filter(r => Number(r.stats.pa ?? 0) > 0).map(r => {
    const pa = Number(r.stats.pa), bb = num(r.stats.walks), k = num(r.stats.strikeouts), tg = games.get(r.teamId) ?? leagueGames(games)
    return { id: r.id, name: r.name, team: r.team, teamId: r.teamId, n: pa, qualified: pa >= 3.1 * tg,
      v: { xbadiff: num(r.stats.xba) != null && num(r.stats.avg) != null ? (num(r.stats.xba) as number) - (num(r.stats.avg) as number) : null, iso: num(r.stats.iso), babip: num(r.stats.babip), bbp: bb != null ? (bb / pa) * 100 : null, kp: k != null ? (k / pa) * 100 : null, bbk: bb != null && k ? bb / k : null, sweet: num(r.stats.sweet_spot_pct), maxev: num(r.stats.max_exit_velocity), sprint: num(r.stats.sprint_speed) } }
  })
  return { rows: out, cols: ADV_BAT_COLS, n: { key: 'pa', label: 'PA' }, sortKey: 'xbadiff', sortAsc: false, minText: `Qualified: ${(3.1 * leagueGames(games)).toFixed(0)} plate appearances (3.1 per team game). xBA − AVG above zero marks players whose contact has been better than their results.`, through: today() }
}

export async function getAdvancedPitchers(season: number): Promise<Board> {
  const [rows, games] = await Promise.all([pitcherRows(season), teamGames(season)])
  const out: BoardRow[] = rows.filter(r => Number(r.innings_pitched ?? 0) > 0).map(r => {
    const ip = Number(r.innings_pitched), tid = Number(r.team_id), tg = games.get(tid) ?? leagueGames(games)
    const k = num(r.k_pct), bb = num(r.bb_pct), lob = num(r.strand_rate)
    return { id: Number(r.player_id), name: String(r.player_name), team: abbr(tid), teamId: tid || null, n: ip, qualified: ip >= tg,
      v: { kbb: k != null && bb != null ? k - bb : null, kp: k, bbp: bb, kbbr: num(r.k_bb_ratio), babip: num(r.babip), lob: lob != null ? lob * 100 : null, gb: num(r.gb_rate), fip: num(r.fip), xera: num(r.xera) } }
  })
  return { rows: out, cols: ADV_PIT_COLS, n: { key: 'ip', label: 'IP' }, sortKey: 'kbb', sortAsc: false, minText: `Qualified: ${leagueGames(games)} innings pitched (1.0 per team game).`, through: today() }
}

// ── Batting and Pitching boards for any season, level and game type ─────────────────────────────────────────────────────────────
export type StatsCtx = { season: number; sportId: number; gameType: 'R' | 'P' | 'S' | 'A' }
export const LEVELS: { id: number; label: string }[] = [
  { id: 1, label: 'MLB' }, { id: 11, label: 'Triple-A' }, { id: 12, label: 'Double-A' }, { id: 13, label: 'High-A' }, { id: 14, label: 'Single-A' }, { id: 16, label: 'Rookie' },
]
export const GAME_TYPES: { id: StatsCtx['gameType']; label: string }[] = [
  { id: 'R', label: 'Regular season' }, { id: 'P', label: 'Postseason' }, { id: 'S', label: 'Spring training' }, { id: 'A', label: 'All-Star game' },
]
export const ctxLabel = (c: StatsCtx) => `${c.season} ${LEVELS.find(l => l.id === c.sportId)?.label ?? ''} ${GAME_TYPES.find(g => g.id === c.gameType)?.label.toLowerCase() ?? ''}`

type PoolSplit = { player: { id: number; fullName: string }; team?: { id: number; name?: string }; stat: Record<string, string | number> }
async function fetchPool(group: 'hitting' | 'pitching', c: StatsCtx): Promise<PoolSplit[]> {
  const out: PoolSplit[] = []
  for (let offset = 0; offset < 6000; offset += 1000) {   // the API returns at most 1,000 rows a request: page through
    const r = await mlb<{ stats?: { splits: PoolSplit[] }[] }>(`/stats?stats=season&group=${group}&sportId=${c.sportId}&season=${c.season}&gameType=${c.gameType}&playerPool=ALL&limit=1000&offset=${offset}`, c.season === new Date().getFullYear() ? 600 : 86400)
    const sp = r?.stats?.[0]?.splits ?? []
    out.push(...sp)
    if (sp.length < 1000) break
  }
  return out
}
async function teamGamesFor(c: StatsCtx): Promise<Map<number, number>> {
  const r = await mlb<{ stats?: { splits: { team: { id: number }; stat: { gamesPlayed?: number } }[] }[] }>(`/teams/stats?stats=season&group=hitting&season=${c.season}&sportId=${c.sportId}&gameType=${c.gameType}`, 3600)
  const m = new Map<number, number>()
  for (const s of r?.stats?.[0]?.splits ?? []) m.set(s.team.id, Number(s.stat.gamesPlayed ?? 0))
  return m
}
const chipOf = (teamId: number | undefined, name: string | undefined) => abbr(teamId) || (name ? name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() : '')

const BAT_MORE: BoardCol[] = [
  { key: 'g', label: 'G', digits: 0 }, { key: 'ab', label: 'AB', digits: 0 }, { key: 'h', label: 'H', digits: 0 }, { key: 'd', label: '2B', digits: 0 }, { key: 't', label: '3B', digits: 0 },
  { key: 'r', label: 'R', digits: 0 }, { key: 'tb', label: 'TB', digits: 0 }, { key: 'ibb', label: 'IBB', digits: 0 }, { key: 'hbp', label: 'HBP', digits: 0 }, { key: 'sf', label: 'SF', digits: 0 },
  { key: 'gidp', label: 'GIDP', digits: 0, asc: true }, { key: 'cs', label: 'CS', digits: 0, asc: true }, { key: 'iso', label: 'ISO', digits: 3 }, { key: 'babip', label: 'BABIP', digits: 3 },
  { key: 'bbp', label: 'BB%', digits: 1, pct: true }, { key: 'kp', label: 'K%', digits: 1, pct: true, asc: true }, { key: 'ppa', label: 'Pitches per PA', digits: 2 },
]
const PIT_MORE: BoardCol[] = [
  { key: 'g', label: 'G', digits: 0 }, { key: 'gs', label: 'GS', digits: 0 }, { key: 'cg', label: 'CG', digits: 0 }, { key: 'sho', label: 'SHO', digits: 0 }, { key: 'h', label: 'H', digits: 0, asc: true },
  { key: 'r', label: 'R', digits: 0, asc: true }, { key: 'er', label: 'ER', digits: 0, asc: true }, { key: 'hr', label: 'HR', digits: 0, asc: true }, { key: 'bb', label: 'BB', digits: 0, asc: true }, { key: 'k', label: 'K', digits: 0 },
  { key: 'hbp', label: 'HBP', digits: 0, asc: true }, { key: 'wp', label: 'WP', digits: 0, asc: true }, { key: 'hr9', label: 'HR/9', digits: 2, asc: true }, { key: 'h9', label: 'H/9', digits: 2, asc: true },
  { key: 'kp', label: 'K%', digits: 1, pct: true }, { key: 'bbp', label: 'BB%', digits: 1, pct: true, asc: true }, { key: 'kbb', label: 'K-BB%', digits: 1, pct: true }, { key: 'kbbr', label: 'K/BB', digits: 2 },
  { key: 'baa', label: 'AVG against', digits: 3, asc: true }, { key: 'gbao', label: 'GO/AO', digits: 2 }, { key: 'hld', label: 'HLD', digits: 0 }, { key: 'bs', label: 'BS', digits: 0, asc: true }, { key: 'ppi', label: 'Pitches per IP', digits: 1 },
]

export async function getBattingBoardFor(c: StatsCtx): Promise<Board> {
  const [pool, games] = await Promise.all([fetchPool('hitting', c), teamGamesFor(c)])
  const tgMax = leagueGames(games)
  const rows: BoardRow[] = pool.map(s => {
    const st = s.stat, pa = Number(st.plateAppearances ?? 0), ab = Number(st.atBats ?? 0), tg = games.get(s.team?.id ?? 0) ?? tgMax
    const bb = Number(st.baseOnBalls ?? 0), k = Number(st.strikeOuts ?? 0), slg = num(st.slg), avg = num(st.avg)
    return { id: s.player.id, name: s.player.fullName, team: chipOf(s.team?.id, s.team?.name), teamId: s.team?.id ?? null, n: pa, qualified: pa >= 3.1 * tg,
      v: { avg, obp: num(st.obp), slg, ops: num(st.ops), hr: num(st.homeRuns), rbi: num(st.rbi), sb: num(st.stolenBases), bb, k,
        g: num(st.gamesPlayed), ab, h: num(st.hits), d: num(st.doubles), t: num(st.triples), r: num(st.runs), tb: num(st.totalBases), ibb: num(st.intentionalWalks), hbp: num(st.hitByPitch), sf: num(st.sacFlies), gidp: num(st.groundIntoDoublePlay), cs: num(st.caughtStealing),
        iso: slg != null && avg != null ? slg - avg : null, babip: num(st.babip), bbp: pa ? (bb / pa) * 100 : null, kp: pa ? (k / pa) * 100 : null, ppa: pa ? Number(st.numberOfPitches ?? 0) / pa : null } }
  }).filter(r => r.n > 0)
  return { rows, cols: BATTING_COLS, moreCols: BAT_MORE, n: { key: 'pa', label: 'PA' }, sortKey: 'ops', sortAsc: false, minText: `Qualified: ${Math.round(3.1 * tgMax)} plate appearances (3.1 per team game, ${tgMax} games).`, through: today() }
}

export async function getPitchingBoardFor(c: StatsCtx): Promise<Board> {
  const [pool, games] = await Promise.all([fetchPool('pitching', c), teamGamesFor(c)])
  const tgMax = leagueGames(games)
  const rows: BoardRow[] = pool.map(s => {
    const st = s.stat, ip = Number(String(st.inningsPitched ?? '0').split('.')[0]) + Number(String(st.inningsPitched ?? '0').split('.')[1] ?? 0) / 3, bf = Number(st.battersFaced ?? 0), tg = games.get(s.team?.id ?? 0) ?? tgMax
    const k = Number(st.strikeOuts ?? 0), bb = Number(st.baseOnBalls ?? 0)
    return { id: s.player.id, name: s.player.fullName, team: chipOf(s.team?.id, s.team?.name), teamId: s.team?.id ?? null, n: Number(ip.toFixed(1)), qualified: ip >= tg,
      v: { era: num(st.era), whip: num(st.whip), k9: num(st.strikeoutsPer9Inn), bb9: num(st.walksPer9Inn), w: num(st.wins), l: num(st.losses), sv: num(st.saves),
        g: num(st.gamesPitched), gs: num(st.gamesStarted), cg: num(st.completeGames), sho: num(st.shutouts), h: num(st.hits), r: num(st.runs), er: num(st.earnedRuns), hr: num(st.homeRuns), bb, k, hbp: num(st.hitBatsmen), wp: num(st.wildPitches),
        hr9: num(st.homeRunsPer9), h9: num(st.hitsPer9Inn), kp: bf ? (k / bf) * 100 : null, bbp: bf ? (bb / bf) * 100 : null, kbb: bf ? ((k - bb) / bf) * 100 : null, kbbr: num(st.strikeoutWalkRatio), baa: num(st.avg), gbao: num(st.groundOutsToAirouts), hld: num(st.holds), bs: num(st.blownSaves), ppi: num(st.pitchesPerInning) } }
  }).filter(r => r.n > 0)
  return { rows, cols: PITCHING_COLS.filter(c2 => c2.key !== 'fip'), moreCols: PIT_MORE, n: { key: 'ip', label: 'IP' }, sortKey: 'era', sortAsc: true, minText: `Qualified: ${tgMax} innings pitched (1.0 per team game, ${tgMax} games).`, through: today() }
}
