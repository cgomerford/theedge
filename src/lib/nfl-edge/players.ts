// src/lib/nfl-edge/players.ts
//
// Players for the NFL game pages: starters from the depth chart, injury dots, snap shares, and each
// player's season + last-three lines (for the tap-through modals), plus the QB league table used for
// QB percentiles.
//
// Tables read: nfl_depth_charts, nfl_players, nfl_injuries, nfl_snap_counts, nfl_player_stats_weekly
// (writers: scripts/nfl/sync_depth_charts.py, sync_teams.py/players, sync_injuries.py, sync_snap_counts.py,
//  sync_players.py). Numeric columns are coerced with Number() and every list is paginated past
// PostgREST's 1,000-row cap.
//
// NOTE ON THE DEPTH CHART: nflverse publishes a season-level snapshot (week = null), not a per-week
// chart. It is labelled "depth chart as filed" in the UI; it is not a confirmed weekly starter list.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'

export type InjuryStatus = { status: 'Out' | 'Doubtful' | 'Questionable' | null; practice: string | null; injury: string | null }

export type GameLine = {
  season: number; week: number
  att: number; cmp: number; passYds: number; passTd: number; int: number; passEpa: number; cpoe: number | null
  carries: number; rushYds: number; rushTd: number; rushEpa: number
  targets: number; rec: number; recYds: number; recTd: number; recEpa: number
  tgtShare: number | null; airShare: number | null
}

export type PlayerCard = {
  id: string; name: string; pos: string; team: string
  headshot: string | null; jersey: string | null
  slot: string; depth: number
  injury: InjuryStatus | null
  snapPct: number | null; snapWeek: number | null
  seasonLabel: string | null      // e.g. "2026 · 2 games" or "2025 · 17 games"
  seasonLine: Omit<GameLine, 'season' | 'week' | 'cpoe' | 'tgtShare' | 'airShare'> & { games: number; tgtShare: number | null; cpoe: number | null } | null
  last3: GameLine[]
}

export type InjuryRow = {
  playerId: string; name: string; team: string; pos: string | null
  status: 'Out' | 'Doubtful' | 'Questionable' | null
  practice: string | null; injury: string | null; depth: number | null; isStarter: boolean
}

const N = (v: unknown): number => (v == null ? 0 : Number(v))
const NN = (v: unknown): number | null => (v == null ? null : Number(v))

/** Pages through a query 1,000 rows at a time. */
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, tag: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) {
      console.error(`[${tag}] Supabase error:`, error.message)
      return out
    }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

const STAT_COLS =
  'player_id,season,week,attempts,completions,passing_yards,passing_tds,interceptions,passing_epa,cpoe,carries,rushing_yards,rushing_tds,rushing_epa,targets,receptions,receiving_yards,receiving_tds,receiving_epa,target_share,air_yards_share'

type StatRow = Record<string, unknown> & { player_id: string; season: number; week: number }

function toLine(r: StatRow): GameLine {
  return {
    season: r.season, week: r.week,
    att: N(r.attempts), cmp: N(r.completions), passYds: N(r.passing_yards), passTd: N(r.passing_tds), int: N(r.interceptions),
    passEpa: N(r.passing_epa), cpoe: NN(r.cpoe),
    carries: N(r.carries), rushYds: N(r.rushing_yards), rushTd: N(r.rushing_tds), rushEpa: N(r.rushing_epa),
    targets: N(r.targets), rec: N(r.receptions), recYds: N(r.receiving_yards), recTd: N(r.receiving_tds), recEpa: N(r.receiving_epa),
    tgtShare: NN(r.target_share), airShare: NN(r.air_yards_share),
  }
}

export function sumLines(ls: GameLine[]): NonNullable<PlayerCard['seasonLine']> {
  const s = {
    games: ls.length, att: 0, cmp: 0, passYds: 0, passTd: 0, int: 0, passEpa: 0,
    carries: 0, rushYds: 0, rushTd: 0, rushEpa: 0, targets: 0, rec: 0, recYds: 0, recTd: 0, recEpa: 0,
    tgtShare: null as number | null, cpoe: null as number | null,
  }
  let cpW = 0, cpN = 0, tsSum = 0, tsN = 0
  for (const l of ls) {
    s.att += l.att; s.cmp += l.cmp; s.passYds += l.passYds; s.passTd += l.passTd; s.int += l.int; s.passEpa += l.passEpa
    s.carries += l.carries; s.rushYds += l.rushYds; s.rushTd += l.rushTd; s.rushEpa += l.rushEpa
    s.targets += l.targets; s.rec += l.rec; s.recYds += l.recYds; s.recTd += l.recTd; s.recEpa += l.recEpa
    if (l.cpoe != null && l.att > 0) { cpW += l.cpoe * l.att; cpN += l.att }
    if (l.tgtShare != null && l.targets > 0) { tsSum += l.tgtShare; tsN += 1 }
  }
  s.cpoe = cpN > 0 ? cpW / cpN : null
  s.tgtShare = tsN > 0 ? tsSum / tsN : null
  return s
}

type DepthRow = { player_id: string; player_name: string; position: string; depth_rank: number }

const loadDepth = unstable_cache(
  async (teamId: string, season: number): Promise<DepthRow[]> => {
    const rows = await fetchAll<DepthRow>(
      (a, b) => createAdminClient().from('nfl_depth_charts').select('player_id,player_name,position,depth_rank').eq('team_id', teamId).eq('season', season).order('depth_rank').range(a, b),
      'getDepthChart',
    )
    return rows.map(r => ({ ...r, depth_rank: N(r.depth_rank) }))
  },
  ['nfl-edge-depth'],
  { revalidate: 3600 },
)

export async function getDepthChart(teamId: string, season: number): Promise<DepthRow[]> {
  return loadDepth(teamId, season)
}

/** Depth-chart position → the slot label the page uses. */
function firstAt(depth: DepthRow[], pos: string, n = 1): DepthRow[] {
  const seen = new Set<string>()
  const out: DepthRow[] = []
  for (const r of depth.filter(d => d.position === pos).sort((a, b) => a.depth_rank - b.depth_rank)) {
    if (seen.has(r.player_id)) continue
    seen.add(r.player_id)
    out.push(r)
    if (out.length >= n) break
  }
  return out
}

type PlayerRow = { gsis_id: string; pfr_id: string | null; full_name: string; position: string | null; headshot_url: string | null; jersey_number: number | string | null }

export type TeamPlayers = {
  qb: PlayerCard | null
  skill: PlayerCard[]     // RB1, WR1-3, TE1
  ol: PlayerCard[]        // LT, LG, C, RG, RT
  defense: PlayerCard[]   // three defenders
  injuries: InjuryRow[]   // everyone on this week's report
  depthAsOf: string
}

export async function getInjuries(teamId: string, season: number, week: number): Promise<InjuryRow[]> {
  const rows = await fetchAll<{ player_id: string; player_name: string; team_id: string; report_status: string | null; practice_status: string | null; injury: string | null }>(
    (a, b) => createAdminClient().from('nfl_injuries').select('player_id,player_name,team_id,report_status,practice_status,injury').eq('team_id', teamId).eq('season', season).eq('week', week).range(a, b),
    'getInjuries',
  )
  if (!rows.length) return []
  const depth = await getDepthChart(teamId, season)
  const rankById = new Map<string, DepthRow>()
  for (const d of depth) {
    const cur = rankById.get(d.player_id)
    if (!cur || d.depth_rank < cur.depth_rank) rankById.set(d.player_id, d)
  }
  return rows.map(r => {
    const d = rankById.get(r.player_id)
    const status = r.report_status === 'Out' || r.report_status === 'Doubtful' || r.report_status === 'Questionable' ? r.report_status : null
    return {
      playerId: r.player_id, name: r.player_name, team: r.team_id, pos: d?.position ?? null,
      status, practice: r.practice_status, injury: r.injury, depth: d?.depth_rank ?? null, isStarter: !!d && d.depth_rank === 1,
    }
  })
}

export async function getTeamPlayers(teamId: string, season: number, week: number, preferQbId?: string | null): Promise<TeamPlayers> {
  const depth = await getDepthChart(teamId, season)
  const qbRow = (preferQbId ? depth.find(d => d.player_id === preferQbId) : null) ?? firstAt(depth, 'QB')[0]
  const picks: { slot: string; row: DepthRow }[] = []
  if (qbRow) picks.push({ slot: 'QB', row: qbRow })
  firstAt(depth, 'RB').forEach(r => picks.push({ slot: 'RB', row: r }))
  firstAt(depth, 'WR', 3).forEach((r, i) => picks.push({ slot: `WR${i + 1}`, row: r }))
  firstAt(depth, 'TE').forEach(r => picks.push({ slot: 'TE', row: r }))
  for (const p of ['LT', 'LG', 'C', 'RG', 'RT']) firstAt(depth, p).forEach(r => picks.push({ slot: p, row: r }))
  for (const p of ['LDE', 'MLB', 'LCB']) firstAt(depth, p).forEach(r => picks.push({ slot: `DEF:${p}`, row: r }))

  const ids = [...new Set(picks.map(p => p.row.player_id))]
  const sb = createAdminClient()
  const [players, injuries, stats] = await Promise.all([
    ids.length ? sb.from('nfl_players').select('gsis_id,pfr_id,full_name,position,headshot_url,jersey_number').in('gsis_id', ids) : Promise.resolve({ data: [], error: null }),
    getInjuries(teamId, season, week),
    ids.length
      ? fetchAll<StatRow>(
          (a, b) => sb.from('nfl_player_stats_weekly').select(STAT_COLS).in('player_id', ids).in('season', [season - 1, season]).order('season').order('week').range(a, b),
          'getTeamPlayers:stats',
        )
      : Promise.resolve([] as StatRow[]),
  ])
  if (players.error) console.error('[getTeamPlayers] Supabase error:', players.error.message)
  const pRows = new Map(((players.data ?? []) as PlayerRow[]).map(p => [p.gsis_id, p]))

  // Snap share in the team's most recent game (snap counts are keyed by PFR id).
  const pfrIds = [...pRows.values()].map(p => p.pfr_id).filter((x): x is string => !!x)
  const snaps = pfrIds.length
    ? await fetchAll<{ player_id: string; week: number; offense_pct: number | null; defense_pct: number | null }>(
        (a, b) => sb.from('nfl_snap_counts').select('player_id,week,offense_pct,defense_pct').eq('team_id', teamId).eq('season', season).in('player_id', pfrIds).order('week', { ascending: false }).range(a, b),
        'getTeamPlayers:snaps',
      )
    : []
  const latestSnap = new Map<string, { week: number; off: number | null; def: number | null }>()
  for (const s of snaps) if (!latestSnap.has(s.player_id)) latestSnap.set(s.player_id, { week: s.week, off: NN(s.offense_pct), def: NN(s.defense_pct) })

  const injBy = new Map(injuries.map(i => [i.playerId, i]))
  const byPlayer = new Map<string, GameLine[]>()
  for (const r of stats) {
    const arr = byPlayer.get(r.player_id) ?? []
    arr.push(toLine(r))
    byPlayer.set(r.player_id, arr)
  }

  const cards = picks.map(({ slot, row }): PlayerCard => {
    const p = pRows.get(row.player_id)
    const games = (byPlayer.get(row.player_id) ?? []).filter(g => g.att + g.carries + g.targets > 0)
    const cur = games.filter(g => g.season === season)
    // Season line: this season if the player has played, else last season (labelled as such).
    const basis = cur.length ? cur : games.filter(g => g.season === season - 1)
    const basisSeason = cur.length ? season : season - 1
    const inj = injBy.get(row.player_id)
    const snap = p?.pfr_id ? latestSnap.get(p.pfr_id) : undefined
    const isDef = slot.startsWith('DEF:')
    return {
      id: row.player_id, name: p?.full_name ?? row.player_name, pos: p?.position ?? row.position, team: teamId,
      headshot: p?.headshot_url ?? null, jersey: p?.jersey_number != null ? String(p.jersey_number) : null,
      slot: isDef ? 'DEF' : slot, depth: row.depth_rank,
      injury: inj && (inj.status || inj.practice) ? { status: inj.status, practice: inj.practice, injury: inj.injury } : null,
      snapPct: snap ? (isDef ? snap.def : snap.off) : null, snapWeek: snap?.week ?? null,
      seasonLabel: basis.length ? `${basisSeason} · ${basis.length} game${basis.length === 1 ? '' : 's'}` : null,
      seasonLine: basis.length ? sumLines(basis) : null,
      last3: games.slice(-3),
    }
  })

  return {
    qb: cards.find(c => c.slot === 'QB') ?? null,
    skill: cards.filter(c => ['RB', 'WR1', 'WR2', 'WR3', 'TE'].includes(c.slot)),
    ol: cards.filter(c => ['LT', 'LG', 'C', 'RG', 'RT'].includes(c.slot)),
    defense: cards.filter(c => c.slot === 'DEF'),
    injuries,
    depthAsOf: 'Depth chart as filed by nflverse (season snapshot, not a confirmed weekly starter list)',
  }
}

// ── QB league table (percentiles) ────────────────────────────────────────────

export type QbSeason = {
  id: string; season: number; games: number; att: number; cmp: number; yds: number; td: number; int: number; epa: number; cpoe: number | null
}

const loadQbTable = unstable_cache(
  async (season: number): Promise<QbSeason[]> => {
    const rows = await fetchAll<StatRow>(
      (a, b) => createAdminClient().from('nfl_player_stats_weekly').select('player_id,season,week,attempts,completions,passing_yards,passing_tds,interceptions,passing_epa,cpoe').eq('position', 'QB').gt('attempts', 0).in('season', [season - 1, season]).range(a, b),
      'getQbTable',
    )
    const by = new Map<string, QbSeason & { cpW: number }>()
    for (const r of rows) {
      const k = `${r.player_id}|${r.season}`
      const q = by.get(k) ?? { id: r.player_id, season: r.season, games: 0, att: 0, cmp: 0, yds: 0, td: 0, int: 0, epa: 0, cpoe: null, cpW: 0 }
      const att = N(r.attempts)
      q.games += 1; q.att += att; q.cmp += N(r.completions); q.yds += N(r.passing_yards); q.td += N(r.passing_tds); q.int += N(r.interceptions); q.epa += N(r.passing_epa)
      if (r.cpoe != null) q.cpW += Number(r.cpoe) * att
      by.set(k, q)
    }
    return [...by.values()].map(({ cpW, ...q }) => ({ ...q, cpoe: q.att > 0 ? cpW / q.att : null }))
  },
  ['nfl-edge-qb-table'],
  { revalidate: 3600 },
)

export async function getQbTable(season: number): Promise<QbSeason[]> {
  return loadQbTable(season)
}

export type QbMetricKey = 'epaAtt' | 'cpoe' | 'compPct' | 'ypa' | 'tdPct' | 'intPct'
export const QB_METRICS: { key: QbMetricKey; label: string; higherBetter: boolean; fmt: (v: number) => string }[] = [
  { key: 'epaAtt', label: 'EPA / attempt', higherBetter: true, fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) },
  { key: 'cpoe', label: 'CPOE', higherBetter: true, fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) },
  { key: 'compPct', label: 'Completion %', higherBetter: true, fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'ypa', label: 'Yards / attempt', higherBetter: true, fmt: v => v.toFixed(1) },
  { key: 'tdPct', label: 'TD %', higherBetter: true, fmt: v => (v * 100).toFixed(1) + '%' },
  { key: 'intPct', label: 'INT %', higherBetter: false, fmt: v => (v * 100).toFixed(1) + '%' },
]

export function qbValues(q: { att: number; cmp: number; yds: number; td: number; int: number; epa: number; cpoe: number | null }): Record<QbMetricKey, number | null> {
  const a = q.att
  return {
    epaAtt: a > 0 ? q.epa / a : null, cpoe: q.cpoe, compPct: a > 0 ? q.cmp / a : null,
    ypa: a > 0 ? q.yds / a : null, tdPct: a > 0 ? q.td / a : null, intPct: a > 0 ? q.int / a : null,
  }
}

export type QbCardData = {
  id: string; name: string; team: string; headshot: string | null; jersey: string | null
  basisLabel: string; basisAtt: number; basisGames: number; isPriorSeason: boolean
  qualifyingQbs: number
  metrics: { key: QbMetricKey; label: string; display: string; pct: number | null }[]
  td: number; int: number
  last3: GameLine[]
  thin: boolean
}

/** Season basis: this season once the QB has 60+ attempts, otherwise last season (clearly labelled). */
export async function getQbCard(card: PlayerCard | null, season: number): Promise<QbCardData | null> {
  if (!card) return null
  const table = await getQbTable(season)
  const mine = table.filter(q => q.id === card.id)
  const cur = mine.find(q => q.season === season)
  const prev = mine.find(q => q.season === season - 1)
  const useCur = !!cur && cur.att >= 60
  const basis = useCur ? cur : prev ?? cur
  if (!basis) {
    return {
      id: card.id, name: card.name, team: card.team, headshot: card.headshot, jersey: card.jersey,
      basisLabel: 'No NFL passing sample', basisAtt: 0, basisGames: 0, isPriorSeason: false, qualifyingQbs: 0,
      metrics: [], td: 0, int: 0, last3: card.last3, thin: true,
    }
  }
  const minAtt = basis.season === season ? 30 : 200
  const pool = table.filter(q => q.season === basis.season && q.att >= minAtt)
  const mineVals = qbValues(basis)
  const metrics = QB_METRICS.map(m => {
    const v = mineVals[m.key]
    const all = pool.map(q => qbValues(q)[m.key]).filter((x): x is number => x != null)
    let pct: number | null = null
    if (v != null && all.length >= 8) {
      const below = all.filter(x => (m.higherBetter ? x < v : x > v)).length
      const equal = all.filter(x => x === v).length
      pct = Math.round(((below + equal / 2) / all.length) * 100)
    }
    return { key: m.key, label: m.label, display: v == null ? '—' : m.fmt(v), pct }
  })
  return {
    id: card.id, name: card.name, team: card.team, headshot: card.headshot, jersey: card.jersey,
    basisLabel: `${basis.season} season · ${basis.games} game${basis.games === 1 ? '' : 's'}`,
    basisAtt: basis.att, basisGames: basis.games, isPriorSeason: basis.season !== season, qualifyingQbs: pool.length,
    metrics, td: basis.td, int: basis.int, last3: card.last3, thin: basis.att < 60,
  }
}

/** Team receiving / rushing usage this season: denominators for target share and carry share. */
export type Usage = { playerId: string; name: string; pos: string; targets: number; rec: number; recYds: number; carries: number; rushYds: number; games: number }

export async function getTeamUsage(teamId: string, season: number): Promise<{ rows: Usage[]; teamTargets: number; teamCarries: number; games: number }> {
  const rows = await fetchAll<{ player_id: string; player_name: string; position: string; week: number; targets: number | null; receptions: number | null; receiving_yards: number | null; carries: number | null; rushing_yards: number | null }>(
    (a, b) => createAdminClient().from('nfl_player_stats_weekly').select('player_id,player_name,position,week,targets,receptions,receiving_yards,carries,rushing_yards').eq('team_id', teamId).eq('season', season).range(a, b),
    'getTeamUsage',
  )
  const by = new Map<string, Usage>()
  const weeks = new Set<number>()
  for (const r of rows) {
    weeks.add(r.week)
    const u = by.get(r.player_id) ?? { playerId: r.player_id, name: r.player_name, pos: r.position, targets: 0, rec: 0, recYds: 0, carries: 0, rushYds: 0, games: 0 }
    u.targets += N(r.targets); u.rec += N(r.receptions); u.recYds += N(r.receiving_yards); u.carries += N(r.carries); u.rushYds += N(r.rushing_yards)
    if (N(r.targets) + N(r.carries) > 0) u.games += 1
    by.set(r.player_id, u)
  }
  const list = [...by.values()]
  return {
    rows: list, games: weeks.size,
    teamTargets: list.filter(u => u.pos !== 'QB').reduce((s, u) => s + u.targets, 0),
    teamCarries: list.reduce((s, u) => s + u.carries, 0),
  }
}
