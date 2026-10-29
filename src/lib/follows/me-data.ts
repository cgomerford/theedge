// src/lib/follows/me-data.ts
//
// What /me shows for each followed player and team, from the MLB Stats API (free, no auth), read on the server per request. Nothing is stored and nothing is invented:
//   Player   his team, the line from his last game, "what changed" (the last 30 days against the season, with the plate appearances or batters faced behind each), and his team's next game
//   Team     its record, its last result and its next game
// A window with fewer than MIN_SAMPLE.whatChangedPA plate appearances (hitters) or whatChangedBF batters faced (pitchers) is reported as a small sample, never as a rate.
// Every function returns null / [] on failure and logs with its name.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { slugifyGame } from '@/lib/mlb'
import type { MLBGame } from '@/lib/mlb'
import { MLB_TEAMS, type Team } from '@/lib/teams'

const MLB = 'https://statsapi.mlb.com/api/v1'
const iso = (d: Date) => d.toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + days * 86400000)

async function get<T>(path: string, name: string): Promise<T | null> {
  try {
    const res = await throttledMlbFetch(`${MLB}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.error(`[${name}] MLB API HTTP`, res.status, path); return null }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[${name}] failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Games around today, per team (shared by the team rows and the players' next game) ───

export type GameRef = { slug: string; date: string; label: string; final: boolean; result: string | null }
type SchedGame = MLBGame & { status?: { abstractGameState?: string } }

const teamWindow = new Map<string, Promise<GameRef[]>>()
async function gamesAround(teamId: number): Promise<GameRef[]> {
  const key = `${iso(new Date())}:${teamId}`
  let p = teamWindow.get(key)
  if (!p) {
    p = (async () => {
      const j = await get<{ dates?: { games?: SchedGame[] }[] }>(`/schedule?sportId=1&teamId=${teamId}&startDate=${iso(shift(-14))}&endDate=${iso(shift(21))}&gameType=R,F,D,L,W`, 'gamesAround')
      const out: GameRef[] = []
      for (const g of (j?.dates ?? []).flatMap(d => d.games ?? [])) {
        const home = g.teams.home.team.id === teamId, me = home ? g.teams.home : g.teams.away, opp = home ? g.teams.away : g.teams.home
        const oppAbbr = MLB_TEAMS.find(t => t.id === opp.team.id)?.abbrev ?? opp.team.abbreviation ?? opp.team.name
        const date = g.officialDate ?? g.gameDate.split('T')[0]
        const final = g.status?.abstractGameState === 'Final'
        const ms = (me as { score?: number }).score, os = (opp as { score?: number }).score
        out.push({ slug: slugifyGame(g), date, label: `${home ? 'vs' : 'at'} ${oppAbbr}`, final, result: final && ms != null && os != null ? `${ms > os ? 'W' : 'L'} ${ms}–${os} ${home ? 'vs' : 'at'} ${oppAbbr}` : null })
      }
      return out.sort((a, b) => a.date.localeCompare(b.date))
    })()
    teamWindow.set(key, p)
  }
  return p
}
const nextOf = (g: GameRef[]) => g.find(x => !x.final) ?? null
const lastOf = (g: GameRef[]) => [...g].reverse().find(x => x.final) ?? null

// ─── Teams ───────────────────────────────────────────────────────────────

export type FollowedTeam = { slug: string; name: string; abbrev: string; id: number; record: string | null; last: GameRef | null; next: GameRef | null }

export async function getFollowedTeams(slugs: string[]): Promise<FollowedTeam[]> {
  const teams = slugs.map(s => MLB_TEAMS.find(t => t.slug === s)).filter((t): t is Team => !!t)
  if (teams.length === 0) return []
  const season = new Date().getFullYear()
  const st = await get<{ records?: { teamRecords?: { team: { id: number }; wins: number; losses: number }[] }[] }>(`/standings?leagueId=103,104&season=${season}`, 'getFollowedTeams')
  const rec = new Map<number, string>()
  for (const r of st?.records ?? []) for (const t of r.teamRecords ?? []) rec.set(t.team.id, `${Number(t.wins)}–${Number(t.losses)}`)
  return Promise.all(teams.map(async t => {
    const g = await gamesAround(t.id)
    return { slug: t.slug, name: t.name, abbrev: t.abbrev, id: t.id, record: rec.get(t.id) ?? null, last: lastOf(g), next: nextOf(g) }
  }))
}

// ─── Players ─────────────────────────────────────────────────────────────

export type ChangeRow = { label: string; last30: string; season: string }
export type StatTile = { v: string; l: string }
export type FollowedPlayer = {
  id: number; name: string; teamId: number | null; teamAbbrev: string | null; isPitcher: boolean; pos: string | null
  /** the season the tiles come from (the last season played when the new one has not started) */
  statsSeason: number
  /** eight stat tiles for the card (hitters G PA AVG OBP SLG OPS HR + one more; pitchers G IP ERA WHIP K BB K/9 + W or SV); empty when there is no season line */
  stats: StatTile[]
  /** formatted season figures, for the best-skill line */
  raw: Record<string, string>
  /** n = plate appearances (hitters) or batters faced (pitchers) over the whole season, for the percentile minimums */
  seasonN: number
  lastGame: { date: string; line: string; opp: string; kind: 'Postseason' | 'Regular season' } | null
  /** n = plate appearances (hitters) or batters faced (pitchers) in the last 30 days; rows is null when n is under the minimum */
  change: { n: number; seasonN: number; need: number; unit: string; rows: ChangeRow[] | null }
  next: GameRef | null
}

type Stat = Record<string, string | number>
type StatsResp = { stats?: { splits?: { date?: string; opponent?: { name?: string; id?: number }; isHome?: boolean; stat?: Stat }[] }[] }
const rate = (v: string | number | undefined) => (v == null || v === '' ? '—' : String(v))

function gameLine(s: Stat, pitcher: boolean, opp: string): string {
  if (pitcher) return `${rate(s.inningsPitched)} IP, ${Number(s.earnedRuns ?? 0)} ER, ${Number(s.strikeOuts ?? 0)} K, ${Number(s.baseOnBalls ?? 0)} BB ${opp}`
  const bits = [Number(s.homeRuns) > 0 ? (Number(s.homeRuns) > 1 ? `${s.homeRuns} HR` : 'HR') : null, Number(s.rbi) > 0 ? `${s.rbi} RBI` : null, Number(s.stolenBases) > 0 ? `${s.stolenBases} SB` : null].filter(Boolean)
  return `${Number(s.hits ?? 0)}-for-${Number(s.atBats ?? 0)}${bits.length ? `, ${bits.join(', ')}` : ''} ${opp}`
}

const num = (v: string | number | undefined) => (v == null || v === '' ? null : Number(v))
const show = (v: string | number | undefined) => (v == null || v === '' ? 'pending' : String(v))

function tilesOf(s: Stat | null, pitcher: boolean): { stats: StatTile[]; raw: Record<string, string> } {
  if (!s) return { stats: [], raw: {} }
  if (pitcher) {
    const saves = Number(s.saves ?? 0), wins = Number(s.wins ?? 0)
    const last = saves > 0 && saves >= wins ? { v: show(s.saves), l: 'SV' } : { v: show(s.wins), l: 'W' }
    return {
      stats: [{ v: show(s.gamesPlayed), l: 'G' }, { v: show(s.inningsPitched), l: 'IP' }, { v: show(s.era), l: 'ERA' }, { v: show(s.whip), l: 'WHIP' }, { v: show(s.strikeOuts), l: 'K' }, { v: show(s.baseOnBalls), l: 'BB' }, { v: show(s.strikeoutsPer9Inn), l: 'K/9' }, last],
      raw: { k: show(s.strikeOuts), bb: show(s.baseOnBalls), era: show(s.era), ip: show(s.inningsPitched), whip: show(s.whip) },
    }
  }
  // the eighth tile is whichever of BB, SB and RBI is highest
  const cands = [{ v: num(s.baseOnBalls), l: 'BB', raw: s.baseOnBalls }, { v: num(s.stolenBases), l: 'SB', raw: s.stolenBases }, { v: num(s.rbi), l: 'RBI', raw: s.rbi }].filter(c => c.v != null)
  const top = cands.sort((a, b) => (b.v as number) - (a.v as number))[0]
  return {
    stats: [{ v: show(s.gamesPlayed), l: 'G' }, { v: show(s.plateAppearances), l: 'PA' }, { v: show(s.avg), l: 'AVG' }, { v: show(s.obp), l: 'OBP' }, { v: show(s.slg), l: 'SLG' }, { v: show(s.ops), l: 'OPS' }, { v: show(s.homeRuns), l: 'HR' }, top ? { v: show(top.raw), l: top.l } : { v: 'pending', l: 'BB' }],
    raw: { bb: show(s.baseOnBalls), hr: show(s.homeRuns), avg: show(s.avg), sb: show(s.stolenBases), ops: show(s.ops), rbi: show(s.rbi) },
  }
}

async function onePlayer(id: number, name: string, statsSeason: number): Promise<FollowedPlayer> {
  const season = new Date().getFullYear()
  const person = await get<{ people?: { currentTeam?: { id?: number }; primaryPosition?: { abbreviation?: string } }[] }>(`/people/${id}?hydrate=currentTeam`, 'getFollowedPlayers')
  const p = person?.people?.[0]
  const pos = p?.primaryPosition?.abbreviation ?? null
  const pitcher = pos === 'P'
  const group = pitcher ? 'pitching' : 'hitting'
  const [seasonR, last30R, logR, postR] = await Promise.all([
    get<StatsResp>(`/people/${id}/stats?stats=season&group=${group}&season=${statsSeason}`, 'getFollowedPlayers'),
    get<StatsResp>(`/people/${id}/stats?stats=byDateRange&group=${group}&startDate=${iso(shift(-30))}&endDate=${iso(new Date())}&season=${season}`, 'getFollowedPlayers'),
    get<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${statsSeason}&gameType=R`, 'getFollowedPlayers'),
    get<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${statsSeason}&gameType=P`, 'getFollowedPlayers'),
  ])
  const sStat = seasonR?.stats?.[0]?.splits?.[0]?.stat ?? null
  const lStat = last30R?.stats?.[0]?.splits?.[0]?.stat ?? null
  const unit = pitcher ? 'batters faced' : 'plate appearances'
  const need = pitcher ? MIN_SAMPLE.whatChangedBF : MIN_SAMPLE.whatChangedPA
  const n = lStat ? Number(pitcher ? lStat.battersFaced : lStat.plateAppearances) || 0 : 0
  const seasonN = sStat ? Number(pitcher ? sStat.battersFaced : sStat.plateAppearances) || 0 : 0
  const cols: [string, string][] = pitcher ? [['ERA', 'era'], ['WHIP', 'whip'], ['K/9', 'strikeoutsPer9Inn']] : [['AVG', 'avg'], ['OPS', 'ops'], ['HR', 'homeRuns']]
  // the most recent game of any type: regular season and postseason game logs, newest date last
  type Split = NonNullable<NonNullable<StatsResp['stats']>[number]['splits']>[number] & { gameType?: string }
  const all = [...(logR?.stats?.[0]?.splits ?? []), ...(postR?.stats?.[0]?.splits ?? [])].filter(x => x.date && x.stat) as Split[]
  const lastSplit = all.sort((a, b) => String(a.date).localeCompare(String(b.date))).pop()
  const oppAbbr = MLB_TEAMS.find(t => t.id === lastSplit?.opponent?.id)?.abbrev ?? lastSplit?.opponent?.name ?? ''
  const teamId = p?.currentTeam?.id ?? null
  const games = teamId ? await gamesAround(teamId) : []
  const { stats, raw } = tilesOf(sStat, pitcher)
  return {
    id, name, teamId, teamAbbrev: MLB_TEAMS.find(t => t.id === teamId)?.abbrev ?? null, isPitcher: pitcher, pos, statsSeason, stats, raw, seasonN,
    lastGame: lastSplit?.stat && lastSplit.date ? { date: lastSplit.date, line: gameLine(lastSplit.stat, pitcher, '').trim(), opp: oppAbbr, kind: lastSplit.gameType === 'R' ? 'Regular season' : 'Postseason' } : null,
    change: { n, seasonN, need, unit, rows: lStat && sStat && n >= need ? cols.map(([label, k]) => ({ label, last30: rate(lStat[k]), season: rate(sStat[k]) })) : null },
    next: nextOf(games),
  }
}

export async function getFollowedPlayers(follows: { player_id: number; player_name: string }[], statsSeason = new Date().getFullYear()): Promise<FollowedPlayer[]> {
  return Promise.all(follows.map(f => onePlayer(f.player_id, f.player_name, statsSeason)))
}
