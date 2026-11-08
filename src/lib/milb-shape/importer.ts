// src/lib/milb-shape/importer.ts
//
// The importer's logic, kept apart from the command line so it can be tested on fixtures with no network and no database.
//   buildPlan  : teams -> league registry -> schedule -> chunked Savant pull -> league filter -> de-duplicate -> aggregate        (writes nothing)
//   report     : the dry-run text: counts by level, park and month, null rates, truncated chunks and gaps, estimated rows and size
//   writePlan  : idempotent upserts of the plan's rows, then removal of that level-season's rows this run did not produce, then the run record
// A rerun builds the same plan from the same (cached) responses, so its upserts overwrite identical rows and add nothing. A failure part-way through fetching leaves the
// response cache behind, so the next run picks up from there; a failure part-way through writing is repaired by running the write again.

import { Aggregator, type BinRow, type CellsRow, type CoverageRow, type PitcherRow } from './aggregate'
import { capabilitiesFrom, type Capabilities } from './capability'
import { SPORT_ID, type MilbLevel } from './levels'
import { addGames, emptyRejects, filterRows, makeRegistry, mergeRejects, type ApiGame, type ApiTeam, type Registry, type Rejects } from './league'
import { fetchRange, type ChunkCache, type FetchReport, type Fetcher } from './savant'

const STATS = 'https://statsapi.mlb.com/api/v1'
export const SOURCE = 'Baseball Savant statcast-search-minors CSV (minors=true), leagues and games verified against the MLB Stats API'

export type Deps = {
  fetcher: Fetcher
  getJson: (url: string) => Promise<unknown>
  cache?: ChunkCache
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
  gapMs?: number
}
export type PlanOpts = { level: MilbLevel; season: number; start?: string; end?: string; chunkDays?: number; cap?: number }

export type Plan = {
  level: MilbLevel; season: number
  agg: Aggregator
  fetch: FetchReport
  rejects: Rejects
  registryNotes: string[]
  firstDate: string | null; lastDate: string | null
  complete: boolean
  rangeStart: string; rangeEnd: string
  gamesInSchedule: number
  fetchedAt: string
}

/** Month windows covering start..end, for schedule requests. */
function monthWindows(start: string, end: string): [string, string][] {
  const out: [string, string][] = []
  let d = new Date(`${start}T00:00:00Z`)
  const stop = new Date(`${end}T00:00:00Z`)
  while (d <= stop) {
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    const e = last > stop ? stop : last
    out.push([d.toISOString().slice(0, 10), e.toISOString().slice(0, 10)])
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  }
  return out
}

export async function loadRegistry(deps: Deps, level: MilbLevel, season: number, start: string, end: string): Promise<{ reg: Registry; games: number }> {
  const teams = async (sport: number) => ((await deps.getJson(`${STATS}/teams?sportId=${sport}&season=${season}`)) as { teams?: ApiTeam[] }).teams ?? []
  const reg = makeRegistry(await teams(11), await teams(14))
  for (const [a, b] of monthWindows(start, end)) {
    const j = (await deps.getJson(`${STATS}/schedule?sportId=${SPORT_ID[level]}&startDate=${a}&endDate=${b}&gameType=R`)) as { dates?: { games: ApiGame[] }[] }
    addGames(reg, (j.dates ?? []).flatMap(d => d.games))
  }
  return { reg, games: [...reg.games.values()].filter(g => g.level === level).length }
}

export async function buildPlan(o: PlanOpts, deps: Deps): Promise<Plan> {
  const start = o.start ?? `${o.season}-03-01`, end = o.end ?? `${o.season}-11-15`
  const { reg, games } = await loadRegistry(deps, o.level, o.season, start, end)
  const levelGames = [...reg.games.values()].filter(g => g.level === o.level).map(g => g.date).filter(Boolean).sort()
  if (levelGames.length === 0) throw new Error(`[buildPlan] the schedule has no ${o.level} games between ${start} and ${end}`)
  const first = levelGames[0], last = levelGames[levelGames.length - 1]
  const agg = new Aggregator(o.level, o.season)
  let rejects = emptyRejects()
  const rep = await fetchRange({
    start: first, end: last, season: o.season, level: o.level, fetcher: deps.fetcher, cache: deps.cache, sleep: deps.sleep, log: deps.log, chunkDays: o.chunkDays, gapMs: deps.gapMs, cap: o.cap,
  }, rows => {
    const f = filterRows(rows, reg, o.level)   // throws on an MLB response: the run stops rather than filter it
    rejects = mergeRejects(rejects, f.rejects)
    for (const r of f.rows) agg.add(r)
  })
  return {
    level: o.level, season: o.season, agg, fetch: rep, rejects, registryNotes: reg.notes, firstDate: first, lastDate: last, complete: rep.gaps.length === 0,
    rangeStart: first, rangeEnd: last, gamesInSchedule: games, fetchedAt: new Date().toISOString(),
  }
}

export function capsOf(p: Plan): Capabilities {
  return capabilitiesFrom(p.level, p.season, p.agg.summary, p.complete, p.firstDate, p.lastDate, p.fetchedAt)
}

/** The summary stored with the run: counts, per-field null counts, rejects, gaps and the capabilities. */
export function runSummary(p: Plan) {
  const s = p.agg.summary
  return {
    ...s,
    rangeStart: p.rangeStart, rangeEnd: p.rangeEnd, gamesInSchedule: p.gamesInSchedule,
    rejects: p.rejects, truncatedChunks: p.fetch.truncatedChunks, gaps: p.fetch.gaps, requests: p.fetch.requests, fromCache: p.fetch.fromCache, notes: p.registryNotes,
    capabilities: capsOf(p),
  }
}

const monthName = (m: number) => ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] ?? String(m)

export type Tables = { bins: BinRow[]; cells: CellsRow[]; pitchers: PitcherRow[]; coverage: CoverageRow[] }
export const tablesOf = (p: Plan): Tables => ({ bins: p.agg.binRows(), cells: p.agg.cellRows(), pitchers: p.agg.pitcherRows(), coverage: p.agg.coverageRows() })

/** Rough storage estimate: JSON bytes of every row, which is close to what Postgres holds (before index overhead). */
export function estimate(t: Tables) {
  const mb = (x: unknown[]) => x.reduce<number>((n, r) => n + JSON.stringify(r).length, 0) / 1e6
  const rows = { bins: t.bins.length, cells: t.cells.length, pitchers: t.pitchers.length, coverage: t.coverage.length }
  const size = { bins: mb(t.bins), cells: mb(t.cells), pitchers: mb(t.pitchers), coverage: mb(t.coverage) }
  return { rows, size, totalRows: rows.bins + rows.cells + rows.pitchers + rows.coverage, totalMb: size.bins + size.cells + size.pitchers + size.coverage }
}

export function report(p: Plan): string {
  const s = p.agg.summary, t = tablesOf(p), est = estimate(t)
  const L: string[] = []
  const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : 'n/a')
  L.push(`== ${p.level.toUpperCase()} ${p.season}: ${p.rangeStart} to ${p.rangeEnd}  (schedule: ${p.gamesInSchedule} games)`)
  L.push(`requests ${p.fetch.requests}, from cache ${p.fetch.fromCache}, good chunks ${p.fetch.chunks}`)
  L.push(`rows after league filter and de-duplication: ${s.rows}   exact duplicates dropped: ${s.duplicates}   key conflicts: ${s.keyConflicts}`)
  L.push(`usable pitches (standard type, speed, movement): ${s.usable} (${pct(s.usable, s.rows)})   with an arm angle: ${s.withSlot} (${pct(s.withSlot, s.usable)})`)
  L.push(`rows left out: other leagues ${JSON.stringify(p.rejects.otherLeague)}   unresolved game ${p.rejects.unresolved}   home-club mismatch ${p.rejects.mismatch}   quarantined games ${p.rejects.quarantinedGames.length}${p.rejects.quarantinedGames.length ? ` (${p.rejects.quarantinedGames.slice(0, 10).join(', ')}${p.rejects.quarantinedGames.length > 10 ? ', ...' : ''})` : ''}`)
  L.push('null rate per field (all rows):  ' + Object.entries(s.nulls).map(([k, v]) => `${k} ${pct(v, s.rows)}`).join('  '))
  L.push(`balls in play ${s.bbe}; null rate on them:  ` + Object.entries(s.bbeNulls).map(([k, v]) => `${k} ${pct(v, s.bbe)}`).join('  '))
  const byMonth = new Map<number, { games: number; pitches: number }>()
  const byPark = new Map<string, { games: number; pitches: number; tracked: number }>()
  for (const c of t.coverage) {
    const m = byMonth.get(c.month) ?? { games: 0, pitches: 0 }; m.games += c.games; m.pitches += c.pitches; byMonth.set(c.month, m)
    const k = byPark.get(c.park) ?? { games: 0, pitches: 0, tracked: 0 }; k.games += c.games; k.pitches += c.pitches; k.tracked += c.tracked; byPark.set(c.park, k)
  }
  L.push('by month: ' + [...byMonth].sort((a, b) => a[0] - b[0]).map(([m, v]) => `${monthName(m)} ${v.games}g/${v.pitches}p`).join('  '))
  L.push('by park (home club): ' + [...byPark].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k} ${v.games}g/${v.pitches}p`).join('  '))
  const untracked = [...byPark].filter(([, v]) => v.pitches > 0 && v.tracked / v.pitches < 0.9).sort((a, b) => a[0].localeCompare(b[0]))
  L.push(`parks with under 90% of pitches tracked: ${untracked.length ? untracked.map(([k, v]) => `${k} ${pct(v.tracked, v.pitches)}`).join('  ') : 'none'}`)
  L.push(`truncated chunks (split): ${p.fetch.truncatedChunks.length}${p.fetch.truncatedChunks.length ? ' ' + p.fetch.truncatedChunks.map(c => `${c.start}..${c.end}`).join(', ') : ''}`)
  L.push(`GAPS (incomplete coverage): ${p.fetch.gaps.length}${p.fetch.gaps.map(g => `\n   ${g.start}..${g.end}: ${g.reason}`).join('')}`)
  if (p.registryNotes.length) L.push('notes: ' + p.registryNotes.join(' | '))
  L.push(`planned storage: bins ${est.rows.bins} rows (${est.size.bins.toFixed(2)} MB), cells ${est.rows.cells} (${est.size.cells.toFixed(2)} MB), pitchers ${est.rows.pitchers} (${est.size.pitchers.toFixed(2)} MB), coverage ${est.rows.coverage} (${est.size.coverage.toFixed(2)} MB)  =>  ${est.totalRows} rows, about ${est.totalMb.toFixed(1)} MB as JSON`)
  const c = capsOf(p)
  L.push(`capabilities: coverage ${c.coverage}; axes ${JSON.stringify(c.axes)}; arm angle on ${c.armAngleShare == null ? 'n/a' : (c.armAngleShare * 100).toFixed(1) + '%'}; contact data ${c.outcomes.contact ? 'yes' : 'pending'}`)
  return L.join('\n')
}

export type Db = {
  upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void>
  /** delete this level-season's rows whose updated_at is before `before` (rows an earlier run wrote that this run no longer produces) */
  deleteStale(table: string, match: Record<string, string | number>, before: string): Promise<void>
}

const chunked = <T,>(xs: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o }

/** Idempotent write. Throws (and writes the run record only at the very end) if any step fails; running it again completes the job. */
export async function writePlan(p: Plan, db: Db, now = new Date().toISOString()): Promise<void> {
  const t = tablesOf(p)
  const stamp = <R extends object>(rows: R[]) => rows.map(r => ({ ...r, updated_at: now }))
  const at = { level: p.level }
  for (const part of chunked(stamp(t.bins), 1000)) await db.upsert('pitch_shape_bins_milb', part, 'level,span,pitch_type,p_throws,velo_bin,ivb_bin,hb_bin,slot_bin')
  await db.deleteStale('pitch_shape_bins_milb', { ...at, span: String(p.season) }, now)
  for (const part of chunked(stamp(t.cells), 20)) await db.upsert('pitch_shape_cells_milb', part, 'level,span,pitch_type,p_throws')
  await db.deleteStale('pitch_shape_cells_milb', { ...at, span: String(p.season) }, now)
  for (const part of chunked(stamp(t.pitchers), 500)) await db.upsert('pitch_shape_pitcher_milb', part, 'level,season,pitcher_id,pitch_type')
  await db.deleteStale('pitch_shape_pitcher_milb', { ...at, season: p.season }, now)
  for (const part of chunked(stamp(t.coverage), 500)) await db.upsert('pitch_shape_milb_coverage', part, 'level,season,month,park')
  await db.deleteStale('pitch_shape_milb_coverage', { ...at, season: p.season }, now)
  await db.upsert('pitch_shape_milb_runs', [{
    level: p.level, season: p.season, source: SOURCE, fetched_at: p.fetchedAt, complete: p.complete, first_date: p.firstDate, last_date: p.lastDate, summary: runSummary(p), updated_at: now,
  }], 'level,season')
}
