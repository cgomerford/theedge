import { describe, it, expect } from 'vitest'
import { buildPlan, estimate, report, tablesOf, writePlan, type Db, type Deps } from './importer'
import { MlbMasqueradeError } from './league'
import type { ChunkCache, Fetcher } from './savant'
import { GAMES_A, GAMES_AAA, TEAMS_A, TEAMS_AAA, csvText, row, type Row } from './test-fixtures'

const noSleep = async () => undefined
const dayOf = (url: string, which: 'gt' | 'lt') => url.match(new RegExp(`game_date_${which}=(\\d{4}-\\d{2}-\\d{2})`))![1]

// the world: AAA games 1001 (Aug 1), 1002 (Aug 2), 1003 (Aug 3); FSL game 2001 (Aug 1) plus a Carolina League game 2002 that Savant's Single-A response also carries
const dataset = (): Row[] => {
  const out: Row[] = []
  let ab = 0
  for (const g of [1001, 1002, 1003, 1004, 1005]) for (let i = 0; i < 8; i++) out.push(row({ game: g, ab: ++ab, pn: 1, pitcher: 100 + (i % 2), description: ['ball', 'swinging_strike', 'foul', 'called_strike'][i % 4] }))
  // Savant lists some balls in play twice
  out.push(row({ game: 1001, ab: 900, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: 0.3, launch_speed: 97, bb_type: 'line_drive' }))
  out.push(row({ game: 1001, ab: 900, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: 0.3, launch_speed: 97, bb_type: 'line_drive' }))
  // Single-A: two Florida State League games and one Carolina League game (Savant's Single-A response carries all three leagues)
  for (const [g, n] of [[2001, 6], [2003, 3], [2002, 4]] as const) for (let i = 0; i < n; i++) out.push(row({ game: g, ab: ++ab + 1000, pn: 1, pitcher: 300, description: ['ball', 'swinging_strike'][i % 2] }))
  return out
}
const dateOf = (g: number) => ({ 1001: '2026-08-01', 1002: '2026-08-02', 1003: '2026-08-03', 1004: '2026-08-04', 1005: '2026-08-05', 2001: '2026-08-01', 2002: '2026-08-01', 2003: '2026-08-02' } as Record<number, string>)[g]

function world(opts: { failOn?: () => string | null; mlbMasquerade?: boolean } = {}) {
  const calls: string[] = []
  const fetcher: Fetcher = async url => {
    calls.push(url)
    const bad = opts.failOn?.()
    if (bad && dayOf(url, 'gt') <= bad && dayOf(url, 'lt') >= bad) throw new Error('network down')
    const a = dayOf(url, 'gt'), b = dayOf(url, 'lt')
    const rows = opts.mlbMasquerade
      ? Array.from({ length: 30 }, (_, i) => row({ game: 700000 + (i % 4), ab: i + 1, pn: 1, home_team: 'NYY', away_team: 'BOS' }))
      : dataset().filter(r => { const d = dateOf(Number(r.game_pk)); const lvl = url.includes('hfLevel=AAA') ? 1 : 2; return d >= a && d <= b && Math.floor(Number(r.game_pk) / 1000) === lvl })
    return { status: 200, text: rows.length ? csvText(rows) : '' }
  }
  const aaaGames = [...GAMES_AAA, ...[1004, 1005].map(gamePk => ({ gamePk, gameType: 'R', officialDate: dateOf(gamePk), teams: { home: { team: { id: 234 } }, away: { team: { id: 431 } } } }))]
  const getJson = async (url: string) => {
    if (url.includes('/teams?sportId=11')) return { teams: TEAMS_AAA }
    if (url.includes('/teams?sportId=14')) return { teams: TEAMS_A }
    if (url.includes('/schedule?sportId=11')) return { dates: [{ games: aaaGames }] }
    if (url.includes('/schedule?sportId=14')) return { dates: [{ games: GAMES_A }] }
    throw new Error(`unexpected ${url}`)
  }
  const deps: Deps = { fetcher, getJson, sleep: noSleep, gapMs: 0 }
  return { deps, calls }
}
const memCache = (): ChunkCache => { const m = new Map<string, string>(); return { async get(k) { return m.get(k) ?? null }, async set(k, t) { m.set(k, t) } } }

class MemDb implements Db {
  tables = new Map<string, Map<string, Record<string, unknown>>>()
  writes = 0
  async upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
    const t = this.tables.get(table) ?? new Map(); this.tables.set(table, t)
    for (const r of rows) { t.set(onConflict.split(',').map(k => String(r[k])).join('|'), { ...r }); this.writes++ }
  }
  async deleteStale(table: string, match: Record<string, string | number>, before: string) {
    const t = this.tables.get(table); if (!t) return
    for (const [k, r] of t) if (Object.entries(match).every(([a, b]) => String(r[a]) === String(b)) && String(r.updated_at) < before) t.delete(k)
  }
  count(table: string) { return this.tables.get(table)?.size ?? 0 }
  /** everything stored, except the fetch time, which a rerun legitimately updates */
  snapshot() { return JSON.stringify([...this.tables].map(([n, t]) => [n, [...t].sort()])).replace(/"(fetched_at|fetchedAt)":"[^"]*"/g, '"$1":"-"') }
}

describe('buildPlan', () => {
  it('builds Triple-A tables from the right games, drops duplicate balls in play and reports what it did', async () => {
    const { deps } = world()
    const p = await buildPlan({ level: 'aaa', season: 2026 }, deps)
    expect(p.complete).toBe(true)
    expect(p.firstDate).toBe('2026-08-01'); expect(p.lastDate).toBe('2026-08-05')
    expect(p.agg.summary.duplicates).toBe(1)
    expect(p.agg.summary.rows).toBe(5 * 8 + 1)
    expect(p.rejects.kept.aaa).toBe(5 * 8 + 2)   // the duplicate was kept by the league filter and removed by the aggregator
    expect(report(p)).toMatch(/exact duplicates dropped: 1/)
    expect(report(p)).toMatch(/GAPS \(incomplete coverage\): 0/)
    const est = estimate(tablesOf(p)); expect(est.totalRows).toBeGreaterThan(0)
  })
  it('FAILS CLOSED when the response is really MLB', async () => {
    await expect(buildPlan({ level: 'aaa', season: 2026 }, world({ mlbMasquerade: true }).deps)).rejects.toBeInstanceOf(MlbMasqueradeError)
  })
  it('splits a truncated chunk (small cap here) and still ends with every pitch once', async () => {
    const { deps } = world()
    const clean = await buildPlan({ level: 'aaa', season: 2026 }, world().deps)
    const capped = await buildPlan({ level: 'aaa', season: 2026, chunkDays: 5, cap: 30 }, deps)
    expect(capped.fetch.truncatedChunks.length).toBeGreaterThan(0)
    expect(capped.complete).toBe(true)
    expect(JSON.stringify(tablesOf(capped))).toBe(JSON.stringify(tablesOf(clean)))
  })
  it('RESUMES after a partial failure: the first run reports a gap, the rerun fills it from the cache plus the missing day, and the result equals a clean run', async () => {
    const cache = memCache()
    let broken: string | null = '2026-08-04'
    const w = world({ failOn: () => broken })
    const first = await buildPlan({ level: 'aaa', season: 2026, chunkDays: 1 }, { ...w.deps, cache, getJson: w.deps.getJson, tries: 1 } as Deps)
    expect(first.complete).toBe(false)
    expect(first.fetch.gaps.map(g => g.start)).toEqual(['2026-08-04'])
    const requestsFirst = w.calls.length
    broken = null
    const second = await buildPlan({ level: 'aaa', season: 2026, chunkDays: 1 }, { ...w.deps, cache })
    expect(second.complete).toBe(true)
    expect(w.calls.length - requestsFirst).toBeLessThanOrEqual(4)          // only the failed day (and its retries) went back to the network
    expect(second.fetch.fromCache).toBeGreaterThanOrEqual(4)
    const clean = await buildPlan({ level: 'aaa', season: 2026, chunkDays: 1 }, world().deps)
    expect(JSON.stringify(tablesOf(second))).toBe(JSON.stringify(tablesOf(clean)))
  })
  it('keeps the two levels apart: the FSL plan holds the two FSL games, counts the Carolina League game as left out, and has no Triple-A pitch', async () => {
    const p = await buildPlan({ level: 'fsl', season: 2026 }, world().deps)
    expect(p.agg.summary.rows).toBe(9)
    expect(p.rejects.otherLeague).toEqual({ 'Carolina League': 4 })
    expect(tablesOf(p).coverage.map(c => c.park).sort()).toEqual(['CLW', 'JUP'])
    expect(tablesOf(p).bins.every(b => b.level === 'fsl')).toBe(true)
    const aaa = await buildPlan({ level: 'aaa', season: 2026 }, world().deps)
    expect(aaa.agg.summary.rows).toBe(41)   // none of the Single-A rows
  })
})

describe('writePlan', () => {
  it('is idempotent: running the same write twice leaves identical tables and no extra rows', async () => {
    const plan = await buildPlan({ level: 'aaa', season: 2026 }, world().deps)
    const db = new MemDb()
    await writePlan(plan, db, '2026-11-09T10:00:00.000Z')
    const once = db.snapshot(), counts = ['pitch_shape_bins_milb', 'pitch_shape_cells_milb', 'pitch_shape_pitcher_milb', 'pitch_shape_milb_coverage', 'pitch_shape_milb_runs'].map(t => db.count(t))
    await writePlan(await buildPlan({ level: 'aaa', season: 2026 }, world().deps), db, '2026-11-09T10:00:00.000Z')
    expect(db.snapshot()).toBe(once)
    expect(['pitch_shape_bins_milb', 'pitch_shape_cells_milb', 'pitch_shape_pitcher_milb', 'pitch_shape_milb_coverage', 'pitch_shape_milb_runs'].map(t => db.count(t))).toEqual(counts)
    expect(db.count('pitch_shape_milb_runs')).toBe(1)
  })
  it('removes rows an earlier run wrote and this one no longer produces, only for this level and season', async () => {
    const db = new MemDb()
    await db.upsert('pitch_shape_bins_milb', [{ level: 'aaa', span: '2026', pitch_type: 'FF', p_throws: 'R', velo_bin: 1, ivb_bin: 1, hb_bin: 1, slot_bin: 1, updated_at: '2026-01-01T00:00:00Z' }], 'level,span,pitch_type,p_throws,velo_bin,ivb_bin,hb_bin,slot_bin')
    await db.upsert('pitch_shape_bins_milb', [{ level: 'fsl', span: '2026', pitch_type: 'FF', p_throws: 'R', velo_bin: 1, ivb_bin: 1, hb_bin: 1, slot_bin: 1, updated_at: '2026-01-01T00:00:00Z' }], 'level,span,pitch_type,p_throws,velo_bin,ivb_bin,hb_bin,slot_bin')
    await writePlan(await buildPlan({ level: 'aaa', season: 2026 }, world().deps), db, '2026-11-09T10:00:00.000Z')
    const bins = [...db.tables.get('pitch_shape_bins_milb')!.values()]
    expect(bins.some(b => b.level === 'aaa' && b.updated_at === '2026-01-01T00:00:00Z')).toBe(false)
    expect(bins.some(b => b.level === 'fsl')).toBe(true)
  })
  it('records the run last, with provenance: source, fetch time, null counts and completeness', async () => {
    const plan = await buildPlan({ level: 'aaa', season: 2026 }, world().deps)
    const order: string[] = []
    const db: Db = { async upsert(t) { order.push(t) }, async deleteStale() { /* none */ } }
    await writePlan(plan, db)
    expect(order[order.length - 1]).toBe('pitch_shape_milb_runs')
    const mem = new MemDb(); await writePlan(plan, mem)
    const run = [...mem.tables.get('pitch_shape_milb_runs')!.values()][0] as { source: string; fetched_at: string; complete: boolean; summary: { nulls: Record<string, number>; capabilities: { axes: { armAngle: boolean } } } }
    expect(run.source).toMatch(/Savant/); expect(run.fetched_at).toBeTruthy(); expect(run.complete).toBe(true)
    expect(Object.keys(run.summary.nulls)).toContain('arm_angle')
    expect(run.summary.capabilities.axes.armAngle).toBe(true)
  })
})
