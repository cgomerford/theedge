// src/lib/scout/situations.ts
//
// Situation breakdowns shared by Scout §4 (ABS challenges) and §5 (stolen
// bases): the ball-strike count, outs, inning, score margin and (for steals) which
// base — each bucket with attempts and how often it worked. Pure aggregation plus
// the stolen-base log loader.
//
// The rows come from scripts/fetch_game_situations.py (feed-derived: the count is
// the count BEFORE the pitch the challenge / steal happened on). Until
// scripts/sql/add_game_situations.sql has been applied and the backfill has run,
// the loaders return `null` and the UI shows a clear "not loaded yet" state
// instead of fabricating numbers.

import { createClient } from '@supabase/supabase-js'

export const MIN_SITUATION_N = 8       // cells/rows under this are drawn faded and not read into

export type Tally = { n: number; ok: number }
export const tally0 = (): Tally => ({ n: 0, ok: 0 })

/** One challenge or steal attempt, reduced to the fields every breakdown needs. */
export type SitRow = {
  balls: number | null
  strikes: number | null
  outs: number | null
  inning: number
  /** Score margin from the acting team's side (challenging / running team): + = leading. */
  margin: number | null
  /** ABS: 'empty' | 'on' | 'risp'; steals: '2B' | '3B' | 'HOME'. */
  kind: string | null
  ok: boolean
}

export const MARGIN_KEYS = ['trail3', 'trail12', 'tied', 'lead12', 'lead3'] as const
export type MarginKey = (typeof MARGIN_KEYS)[number]
export const MARGIN_LABEL: Record<MarginKey, string> = {
  trail3: 'Trailing by 3+', trail12: 'Trailing by 1–2', tied: 'Tied', lead12: 'Leading by 1–2', lead3: 'Leading by 3+',
}
const marginKey = (m: number): MarginKey => (m <= -3 ? 'trail3' : m < 0 ? 'trail12' : m === 0 ? 'tied' : m <= 2 ? 'lead12' : 'lead3')

export type Situations = {
  total: Tally
  /** with a usable count / situation recorded (rows loaded before the backfill have none) */
  withSituation: number
  byCount: Record<string, Tally>          // `${balls}-${strikes}`
  byOuts: Tally[]                          // 0,1,2
  byInning: Tally[]                        // index 0 = 1st … 8 = 9th+
  byMargin: Record<MarginKey, Tally>
  byKind: Record<string, Tally>
}

export function emptySituations(): Situations {
  return {
    total: tally0(), withSituation: 0,
    byCount: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${Math.floor(i / 3)}-${i % 3}`, tally0()])),
    byOuts: [tally0(), tally0(), tally0()],
    byInning: Array.from({ length: 9 }, tally0),
    byMargin: { trail3: tally0(), trail12: tally0(), tied: tally0(), lead12: tally0(), lead3: tally0() },
    byKind: {},
  }
}

const bump = (t: Tally, ok: boolean) => { t.n += 1; if (ok) t.ok += 1 }

export function addRow(s: Situations, r: SitRow) {
  bump(s.total, r.ok)
  bump(s.byInning[Math.min(9, Math.max(1, r.inning)) - 1], r.ok)
  if (r.balls == null || r.strikes == null) return
  s.withSituation += 1
  const c = s.byCount[`${r.balls}-${r.strikes}`]
  if (c) bump(c, r.ok)
  if (r.outs != null && r.outs >= 0 && r.outs <= 2) bump(s.byOuts[r.outs], r.ok)
  if (r.margin != null) bump(s.byMargin[marginKey(r.margin)], r.ok)
  if (r.kind) bump((s.byKind[r.kind] ??= tally0()), r.ok)
}

export function buildSituations(rows: SitRow[]): Situations {
  const s = emptySituations()
  for (const r of rows) addRow(s, r)
  return s
}

export const pct = (n: number, d: number): number | null => (d > 0 ? (n / d) * 100 : null)

// ─── Stolen-base log ─────────────────────────────────────────────────────

export type SbRow = {
  game_pk: number; game_date: string; inning: number
  running_team_id: number; fielding_team_id: number
  runner_id: number | null; runner_name: string | null; pitcher_id: number | null
  /** the hitter at the plate — null on rows written before add_sb_batter_context.sql + the backfill */
  batter_id?: number | null; batter_name?: string | null
  steal_of: '2B' | '3B' | 'HOME'; success: boolean
  balls: number | null; strikes: number | null; outs: number | null; run_diff: number | null
}

let sbCache: { at: number; rows: SbRow[] | null } | null = null
const TTL = 10 * 60 * 1000

/** All logged steal attempts, or null when the table doesn't exist / is empty. */
export async function getSbRows(): Promise<SbRow[] | null> {
  if (sbCache && Date.now() - sbCache.at < TTL) return sbCache.rows
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const rows: SbRow[] = []
  const BASE = 'game_pk, game_date, inning, running_team_id, fielding_team_id, runner_id, runner_name, pitcher_id, steal_of, success, balls, strikes, outs, run_diff'
  let cols = `${BASE}, batter_id, batter_name`
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supa.from('sb_attempt_log').select(cols).order('attempt_id').range(offset, offset + 999)
    if (error && error.code === '42703' && cols !== BASE) {
      // batter columns not added yet (scripts/sql/add_sb_batter_context.sql) — carry on without them
      cols = BASE; rows.length = 0; offset = -1000
      continue
    }
    if (error) {
      if (error.code !== 'PGRST205') console.error('[getSbRows] Supabase error:', error.message)
      sbCache = { at: Date.now(), rows: null }
      return null
    }
    rows.push(...((data ?? []) as unknown as SbRow[]))
    if (!data || data.length < 1000) break
  }
  const result = rows.length > 0 ? rows : null
  sbCache = { at: Date.now(), rows: result }
  return result
}

const sbToSit = (r: SbRow): SitRow => ({ balls: r.balls, strikes: r.strikes, outs: r.outs, inning: r.inning, margin: r.run_diff, kind: r.steal_of, ok: r.success })

/** One hitter, as the man at the plate while his club was running. */
export type AtBatRow = {
  id: number; name: string
  attempts: number; ok: number
  /** plate appearances that began with a runner on first and second open (chances to steal second) */
  opps: number
  /** steal-of-second attempts while he was up */
  attempts2b: number
}

export type AtBatView = {
  rows: AtBatRow[]
  /** the club's steal-of-second attempts per chance across the whole lineup, for comparison */
  clubRate2b: number | null
  clubOpps: number
  /** attempts that carry a batter (0 until the backfill has run) */
  attemptsWithBatter: number
}

export type SbSituations = {
  coveredThrough: string
  running: Situations          // this club's steal attempts
  against: Situations          // steal attempts against this club's defense
  league: Situations
  topRunners: { name: string; n: number; ok: number }[]
  /** who was at the plate when this club ran; null until batter columns are loaded */
  atBat: AtBatView | null
}

export const MIN_OPPS = 15       // chances (runner on 1st, 2nd open) a hitter needs before his attempt rate is read

async function getOpportunities(teamId: number): Promise<{ id: number; name: string; opps: number }[] | null> {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const byBatter = new Map<number, { id: number; name: string; opps: number }>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supa.from('sb_opportunity_log').select('batter_id, batter_name, opps').eq('batting_team_id', teamId).order('game_pk').range(offset, offset + 999)
    if (error) {
      if (error.code !== 'PGRST205') console.error('[getOpportunities] Supabase error:', error.message)
      return null
    }
    for (const r of (data ?? []) as { batter_id: number; batter_name: string | null; opps: number | string }[]) {
      const e = byBatter.get(r.batter_id) ?? { id: r.batter_id, name: r.batter_name ?? 'Unknown', opps: 0 }
      e.opps += Number(r.opps)
      byBatter.set(r.batter_id, e)
    }
    if (!data || data.length < 1000) break
  }
  return [...byBatter.values()]
}

export async function getSbSituations(teamId: number): Promise<SbSituations | null> {
  const rows = await getSbRows()
  if (!rows) return null
  const mine = rows.filter((r) => r.running_team_id === teamId)
  const runners = new Map<string, { name: string; n: number; ok: number }>()
  for (const r of mine) {
    const key = String(r.runner_id ?? r.runner_name)
    const e = runners.get(key) ?? { name: r.runner_name ?? 'Unknown', n: 0, ok: 0 }
    e.n += 1; if (r.success) e.ok += 1
    runners.set(key, e)
  }
  // who was at the plate when they ran, next to how many chances each hitter gave them
  let atBat: AtBatView | null = null
  const withBatter = mine.filter((r) => r.batter_id != null)
  if (withBatter.length > 0) {
    const opps = await getOpportunities(teamId)
    const by = new Map<number, AtBatRow>()
    const row = (id: number, name: string) => { let e = by.get(id); if (!e) { e = { id, name, attempts: 0, ok: 0, opps: 0, attempts2b: 0 }; by.set(id, e) } return e }
    for (const r of withBatter) {
      const e = row(r.batter_id as number, r.batter_name ?? 'Unknown')
      e.attempts += 1; if (r.success) e.ok += 1; if (r.steal_of === '2B') e.attempts2b += 1
    }
    for (const o of opps ?? []) row(o.id, o.name).opps = o.opps
    const clubOpps = (opps ?? []).reduce((a, o) => a + o.opps, 0)
    const club2b = withBatter.filter((r) => r.steal_of === '2B').length
    atBat = {
      rows: [...by.values()].sort((a, b) => b.attempts - a.attempts || b.opps - a.opps),
      clubRate2b: clubOpps > 0 ? (club2b / clubOpps) * 100 : null,
      clubOpps, attemptsWithBatter: withBatter.length,
    }
  }
  return {
    coveredThrough: rows.reduce((m, r) => (r.game_date > m ? r.game_date : m), ''),
    running: buildSituations(mine.map(sbToSit)),
    against: buildSituations(rows.filter((r) => r.fielding_team_id === teamId).map(sbToSit)),
    league: buildSituations(rows.map(sbToSit)),
    topRunners: [...runners.values()].sort((a, b) => b.n - a.n).slice(0, 5),
    atBat,
  }
}
