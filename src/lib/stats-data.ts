// src/lib/stats-data.ts
//
// Season-table fetchers for /stats.
//
// PITCHER: one Supabase query against `pitcher_stats` → every pitcher, every
// filter, in one round trip. "All teams" works out of the box.
//
// BATTER: no season-stats table exists. getBatterSeasonStats() in
// batter-stats.ts is a live, per-player MLB Stats API call — fine for one
// player (that's what /lab does today), not fine for ~200 qualified batters
// on one page load. So batters are TEAM-SCOPED here, same pattern as
// AdminDataRoomSection: pick a team → fetch that team's ~13-15 hitters live,
// in parallel. "All teams" isn't offered for batters in v1 — searching a
// specific player by name still works (single-player fetch, same as /lab).
//
// pitcher_stats has no explicit SP/RP column. Proxying role off `starts`:
// starts > 0 in the current season → SP, else RP. This is a guess — verify
// against a few known relievers who also spot-started before trusting it for
// the position filter.

import { createAdminClient } from '@/lib/supabase'
import {
  getBatterSeasonStats,
  getBatterStatcast,
  type BatterStatcast,
} from '@/lib/batter-stats'
import { MLB_TEAMS } from '@/lib/teams'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// Same defensive wrapper pregame-stats.ts uses for the admin dashboard —
// a bad/missing field degrades to null instead of throwing and taking the
// whole team fetch down with it.
async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// id -> abbreviation, built from teams.ts's slug/abbrev list + the id map it
// already keeps privately for other lookups. Mirrors the pattern lab.ts uses
// (TEAM_NAMES) — worth hoisting one shared copy into teams.ts itself next
// time either file changes, so this map isn't a third copy of the same 30 rows.
const TEAM_ID_TO_ABBREV: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
}
function abbrevForTeamId(id: number | null | undefined): string {
  if (!id) return '—'
  return TEAM_ID_TO_ABBREV[id] ?? '—'
}

export type StatsRow = {
  id: number
  name: string
  team: string        // abbreviation
  teamId: number
  pos: string
  age: number | null
  stats: Record<string, number | null>
}

// ── PITCHERS ────────────────────────────────────────────────────────────

export async function getPitcherStatsTable(opts: {
  season: number
  teamId?: number
  role?: 'SP' | 'RP'
  minIp?: number // default 3 — filters stub rows (no IP recorded yet) and
                  // one-off position-player mop-up appearances (MLB really
                  // does let position players pitch blowouts, and it lands
                  // in this table with a real, tiny-sample, often absurd
                  // line). This is a heuristic, not a position lookup —
                  // pitcher_stats has no position column to filter on
                  // directly. A legitimate rookie reliever with a genuinely
                  // small early-season sample could get caught by this too;
                  // raise/lower minIp if that turns out to matter more than
                  // filtering out the position-player noise.
}): Promise<StatsRow[]> {
  const minIp = opts.minIp ?? 3
  const supa = createAdminClient()
  let query = supa.from('pitcher_stats').select('*').eq('season', opts.season)
  if (opts.teamId) query = query.eq('team_id', opts.teamId)

  const { data, error } = await query
  if (error) {
    console.error('[stats-data] pitcher_stats query failed:', error)
    return []
  }

  let rows: StatsRow[] = (data ?? [])
    .filter((r: any) => (r.innings_pitched ?? 0) >= minIp)
    .map((r: any) => ({
      id: r.player_id,
      name: r.player_name,
      team: abbrevForTeamId(r.team_id),
      teamId: r.team_id,
      pos: (r.starts ?? 0) > 0 ? 'SP' : 'RP', // proxy — see file header note
      age: null,
      stats: { ...r },
    }))

  if (opts.role) rows = rows.filter(r => r.pos === opts.role)
  return rows
}

// ── BATTERS: league-wide default ─────────────────────────────────────────
//
// UNVERIFIED ENDPOINT SHAPE — same caveat as the rest of this codebase's
// undocumented statsapi.mlb.com usage (see lab.ts's own notes on this).
// `/api/v1/stats?stats=season&group=hitting&sportId=1` without a playerId
// or teamId is expected to return every player with a hitting line that
// season in one response (mirrors the shape lab.ts's fetchAllTeamSeasonValues
// already relies on for team-level bulk queries). Run it once and
// console.log(json.stats?.[0]?.splits?.length) before trusting this in prod —
// if it comes back empty or capped low, this needs a `limit` bump or a
// `playerPool=ALL` param.
//
// This replaces the original per-team-only design: instead of requiring a
// team pick before any batter data loads, the whole league loads once (one
// stats call + one Statcast CSV pass) and team/position become client-side
// filters, matching how pitchers already work.
// League-wide position lookup — the bulk hitting-stats endpoint's position
// field is unreliable (confirmed: it was blank for most rows, which is why
// the position filter chips did nothing). Real fix: pull every team's active
// roster (30 parallel, cheap, cached-free calls) and build an id→position
// map from that instead. This is what actually makes the SS/1B/etc chips work.
async function getLeagueWidePositions(): Promise<Map<number, string>> {
  const ids = Object.keys(TEAM_ID_TO_ABBREV).map(Number)
  const map = new Map<number, string>()
  const rosters = await Promise.all(
    ids.map(id => safeFetchJson<any>(`${MLB_API}/teams/${id}/roster?rosterType=active`))
  )
  rosters.forEach(json => {
    for (const p of json?.roster ?? []) {
      if (p.position?.type !== 'Pitcher') {
        map.set(p.person.id, p.position?.abbreviation ?? '—')
      }
    }
  })
  return map
}

export async function getAllBattersSeasonTable(season: number): Promise<StatsRow[]> {
// limit=1000 covers volume; playerPool=ALL is the one that actually
  // matters — without it this endpoint silently restricts to "qualified"
  // batters only (confirmed 2026-07-12: totalSplits self-reported 148,
  // matching splits.length exactly — the API wasn't truncating a bigger
  // result, it was filtering to the qualified pool *before* counting).
  // Same class of bug as the team-grades.ts roster-grade fix earlier this
  // session, hitting a second endpoint independently.
  const url = `${MLB_API}/stats?stats=season&group=hitting&sportId=1&season=${season}&limit=1000&playerPool=ALL`
  const [json, positions] = await Promise.all([
    safeFetchJson<any>(url),
    getLeagueWidePositions(),
  ])
  const splits = json?.stats?.[0]?.splits ?? []
  const totalSplits = json?.stats?.[0]?.totalSplits
  console.log(`[stats-data] bulk batter fetch: got ${splits.length} rows, totalSplits reports ${totalSplits}`)
  if (typeof totalSplits === 'number' && totalSplits > splits.length) {
    console.warn(`[stats-data] bulk batter fetch is short by ${totalSplits - splits.length} rows — bump limit further`)
  }
  if (splits.length === 0) {
    console.warn('[stats-data] bulk batter fetch returned 0 rows — endpoint shape may be wrong, verify against a real response')
    return []
  }

  const ids = splits.map((s: any) => s.player?.id).filter(Boolean)
  const statcastMap = await getBatterStatcastBatch(ids)

  return splits.map((s: any): StatsRow => {
    const st = s.stat ?? {}
    const sc = statcastMap.get(s.player?.id)
    return {
      id: s.player?.id,
      name: s.player?.fullName ?? '—',
      team: abbrevForTeamId(s.team?.id),
      teamId: s.team?.id,
      pos: positions.get(s.player?.id) ?? s.player?.primaryPosition?.abbreviation ?? '—',
      age: null,
      stats: {
        games: st.gamesPlayed ?? null,
        pa: st.plateAppearances ?? null,
        hits: st.hits ?? null,
        avg: num(st.avg), obp: num(st.obp), slg: num(st.slg), ops: num(st.ops),
        home_runs: st.homeRuns ?? null, rbi: st.rbi ?? null, stolen_bases: st.stolenBases ?? null,
        iso: (num(st.slg) !== null && num(st.avg) !== null) ? Math.round(((num(st.slg) as number) - (num(st.avg) as number)) * 1000) / 1000 : null,
        babip: num(st.babip),
    walks: st.baseOnBalls ?? null, strikeouts: st.strikeOuts ?? null,
     // Derived directly from PA already in this row — no separate Savant
        // fetch needed. Matches Savant's own definition (BB or K / PA).
        // Stored 0-100 to match pct100 in stats-columns.ts (same convention
        // as every other percent field in this table) — NOT 0-1.
        bb_pct: st.plateAppearances ? Math.round((Number(st.baseOnBalls ?? 0) / st.plateAppearances) * 1000) / 10 : null,
        k_pct: st.plateAppearances ? Math.round((Number(st.strikeOuts ?? 0) / st.plateAppearances) * 1000) / 10 : null,
        ...sc,
      },
    }
  })
}

// ── BATTERS: team-scoped (fallback / legacy) ─────────────────────────────
// Superseded by getAllBattersSeasonTable for the default view — kept for
// cases where a confirmed, position-accurate roster snapshot matters more
// than one extra round trip (e.g. a team page that already has the roster).

// Quote-aware CSV line parser — same one src/app/api/spray-chart/route.ts
// already uses successfully. A naive .split(',') corrupts column alignment
// the moment any field (player name, team name) contains a comma inside
// quotes — which reads as exactly the "BB% shows sprint speed" symptom,
// since it's a per-row misalignment rather than a total failure.
function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

// Fetch the Savant percentile CSV once, return every player's row keyed by
// MLBAM id. Replaces N redundant CSV downloads with 1 for a team of N.
// Fetch the Savant percentile CSV once, return every player's row keyed by
// MLBAM id. Replaces N redundant CSV downloads with 1 for a team of N.
// The old single-CSV version pulled from percentile-rankings — which
// returns PERCENTILE RANKS (0-100), not raw stat values. That's why
// Alonso's "xBA" showed 76.000 instead of ~.280 (see chat 2026-07-12).
// This version merges two SEPARATE raw-value leaderboards instead, by
// player_id: expected_statistics (xBA/xSLG/xwOBA) and statcast (Avg/Max
// EV, Barrel%, HardHit%, Sweet Spot%). min=1, not "Qualified" — matches
// the playerPool=ALL fix on the MLB-API side, every batter with at least
// one batted ball, not just qualified regulars.
//
// KNOWN GAP: k_pct, bb_pct, sprint_speed are NOT sourced here. The old
// code pulled them from percentile-rankings too, meaning those were also
// silently percentile ranks mislabeled as raw K%/BB%/sprint speed, not
// just xBA/xSLG/xwOBA. K%/BB% should be computed from strikeouts/walks/pa
// already present in this file's season-stats fetch instead of re-hitting
// Savant for them. Sprint speed needs a third leaderboard
// (baseballsavant.mlb.com/leaderboard/sprint_speed) — deliberately left
// null rather than faked; wire it up as a separate pass if/when it matters.
function blankStatcast(): BatterStatcast {
  return {
    xba: null, xslg: null, xwoba: null,
    barrel_pct: null, hard_hit_pct: null, sweet_spot_pct: null,
    avg_exit_velocity: null, max_exit_velocity: null,
    sprint_speed: null, k_pct: null, bb_pct: null,
  }
}

async function fetchSavantCSV(url: string): Promise<{ headers: string[]; lines: string[] } | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })
    if (!res.ok) {
      console.error(`[stats-data] Savant CSV fetch failed: ${res.status} — ${url}`)
      return null
    }
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''))
    return { headers, lines }
  } catch (err) {
    console.error('[stats-data] Savant CSV fetch threw:', err)
    return null
  }
}

export async function getBatterStatcastBatch(
  playerIds: number[]
): Promise<Map<number, BatterStatcast>> {
  const season = new Date().getFullYear()
  const wanted = new Set(playerIds)
  const out = new Map<number, BatterStatcast>()

const [expected, exitVelo, sprint] = await Promise.all([
    fetchSavantCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&position=&team=&min=1&csv=true`),
    fetchSavantCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&position=&team=&min=1&csv=true`),
    fetchSavantCSV(`https://baseballsavant.mlb.com/leaderboard/sprint_speed?year=${season}&position=&team=&csv=true`),
  ])

  console.log(`[stats-data] Statcast: expected_statistics ${expected ? 'ok, ' + (expected.lines.length - 1) + ' rows' : 'FAILED'}`)
  console.log(`[stats-data] Statcast: exit velo/barrels ${exitVelo ? 'ok, ' + (exitVelo.lines.length - 1) + ' rows' : 'FAILED'}`)
  console.log(`[stats-data] Statcast: sprint speed ${sprint ? 'ok, ' + (sprint.lines.length - 1) + ' rows' : 'FAILED'}`)
  if (expected) {
    const idIdx = expected.headers.indexOf('player_id')
    const get = (cells: string[], key: string): number | null => {
      const idx = expected.headers.indexOf(key)
      if (idx === -1) return null
      const val = parseFloat(cells[idx])
      return isNaN(val) ? null : val
    }
    for (let i = 1; i < expected.lines.length; i++) {
      const cells = parseCSVLine(expected.lines[i]).map(c => c.replace(/"/g, ''))
      const id = Number(cells[idIdx])
      if (!wanted.has(id)) continue
      out.set(id, {
        ...(out.get(id) ?? blankStatcast()),
        xba: get(cells, 'est_ba'),
        xslg: get(cells, 'est_slg'),
        xwoba: get(cells, 'est_woba'),
      })
    }
  }

  if (exitVelo) {
    const idIdx = exitVelo.headers.indexOf('player_id')
    const get = (cells: string[], key: string): number | null => {
      const idx = exitVelo.headers.indexOf(key)
      if (idx === -1) return null
      const val = parseFloat(cells[idx])
      return isNaN(val) ? null : val
    }
    for (let i = 1; i < exitVelo.lines.length; i++) {
      const cells = parseCSVLine(exitVelo.lines[i]).map(c => c.replace(/"/g, ''))
      const id = Number(cells[idIdx])
      if (!wanted.has(id)) continue
      out.set(id, {
        ...(out.get(id) ?? blankStatcast()),
        avg_exit_velocity: get(cells, 'avg_hit_speed'),
        max_exit_velocity: get(cells, 'max_hit_speed'),
        barrel_pct: get(cells, 'brl_percent'),
        hard_hit_pct: get(cells, 'ev95percent'),
        sweet_spot_pct: get(cells, 'anglesweetspotpercent'),
      })
    }
  }

 if (sprint) {
    const idIdx = sprint.headers.indexOf('player_id')
    const speedIdx = sprint.headers.indexOf('sprint_speed')
    for (let i = 1; i < sprint.lines.length; i++) {
      const cells = parseCSVLine(sprint.lines[i]).map(c => c.replace(/"/g, ''))
      const id = Number(cells[idIdx])
      if (!wanted.has(id)) continue
      const val = parseFloat(cells[speedIdx])
      out.set(id, { ...(out.get(id) ?? blankStatcast()), sprint_speed: isNaN(val) ? null : val })
    }
  }

  console.log(`[stats-data] Statcast: merged data for ${out.size} of ${wanted.size} requested players`)
  return out
}

// Active hitters on one team's 40-man/active roster.
async function getTeamHitterIds(teamId: number): Promise<{ id: number; name: string; pos: string; age: number | null }[]> {
  const url = `${MLB_API}/teams/${teamId}/roster?rosterType=active`
  const json = await safeFetchJson<any>(url)
  if (!json) return []
  return (json.roster ?? [])
    .filter((p: any) => p.position?.type !== 'Pitcher')
    .map((p: any) => ({
      id: p.person.id,
      name: p.person.fullName,
      pos: p.position?.abbreviation ?? '—',
      age: null, // roster endpoint doesn't return age — add a /people call if the table needs it
    }))
}

// Parses the string-formatted rate stats MLB's API returns (".312", not 0.312).
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '—') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? null : n
}

export async function getBatterStatsForTeam(opts: {
  season: number
  teamId: number
  teamAbbr: string
}): Promise<StatsRow[]> {
  const hitters = await getTeamHitterIds(opts.teamId)
  if (hitters.length === 0) return []

  const [seasonStats, statcastMap] = await Promise.all([
    Promise.all(hitters.map(h => getBatterSeasonStats(h.id))),
    getBatterStatcastBatch(hitters.map(h => h.id)),
  ])

  return hitters.map((h, i) => {
    const s = seasonStats[i]
    const sc = statcastMap.get(h.id)
    return {
      id: h.id,
      name: h.name,
      team: opts.teamAbbr,
      teamId: opts.teamId,
      pos: h.pos,
      age: h.age,
      stats: {
        pa: s?.pa ?? null,
        hits: s?.hits ?? null,
        avg: num(s?.avg), obp: num(s?.obp), slg: num(s?.slg), ops: num(s?.ops),
        home_runs: s?.home_runs ?? null, rbi: s?.rbi ?? null, stolen_bases: s?.stolen_bases ?? null,
        iso: num(s?.iso), babip: num(s?.babip),
        walks: s?.walks ?? null, strikeouts: s?.strikeouts ?? null,
        ...sc,
      },
    }
  })
}

// Single-player path — same shape used by /lab's search box today.
export async function getBatterStatsForPlayer(playerId: number, teamAbbr: string, teamId: number, name: string, pos: string): Promise<StatsRow | null> {
  const [s, statcastMap] = await Promise.all([
    getBatterSeasonStats(playerId),
    getBatterStatcastBatch([playerId]),
  ])
  if (!s) return null
  const sc = statcastMap.get(playerId)
  return {
    id: playerId, name, team: teamAbbr, teamId, pos, age: null,
    stats: {
      games: null, // BatterSeasonStats (single-player endpoint) doesn't carry gamesPlayed — only the bulk fetch does
      pa: s.pa, hits: s.hits, avg: num(s.avg), obp: num(s.obp), slg: num(s.slg), ops: num(s.ops),
      home_runs: s.home_runs, rbi: s.rbi, stolen_bases: s.stolen_bases,
      iso: num(s.iso), babip: num(s.babip), walks: s.walks, strikeouts: s.strikeouts,
      ...sc,
    },
  }
}