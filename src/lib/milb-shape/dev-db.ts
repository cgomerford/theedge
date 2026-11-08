// src/lib/milb-shape/dev-db.ts
//
// LOCAL DEVELOPMENT ONLY. Until the migration has been run, the minor-league tables do not exist, so the Lab would be empty on a laptop. When (and only when) `next dev` is
// running AND the table is missing from Supabase AND this file exists:
//     .dev-cache/milb-shape/tables.json     written by   npx tsx scripts/import-milb-pitch-shape.ts --season=2026 --level=aaa --json
// the minor-league readers answer from it instead. Real Savant data, never invented. It is never used in a deployed build (NODE_ENV is 'production' there), and the moment the
// real tables exist the probe finds them and this file is ignored.

import fs from 'node:fs'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

const FILE = path.join(process.cwd(), '.dev-cache', 'milb-shape', 'tables.json')
let tables: Tables | null = null
let probedAt = 0   // when the real tables were last checked, so a dev server notices once they exist
let loadedAt = 0   // the file's modified time when it was read, so a fresh preview file is picked up without restarting

const cmp = (a: unknown, b: unknown) => (typeof a === 'number' || typeof b === 'number' ? Number(a) - Number(b) : String(a).localeCompare(String(b)))

function devClient(t: Tables) {
  return {
    from(table: string) {
      let rows: Row[] = t[table] ?? []
      let count: number | null = null
      const b: Record<string, unknown> = {}
      const chain = (f: (...a: unknown[]) => void) => (...a: unknown[]) => { f(...a); return b }
      b.select = chain((_c, opt) => { if ((opt as { count?: string } | undefined)?.count) count = -1 })
      b.eq = chain((k, v) => { rows = rows.filter(r => String(r[k as string]) === String(v)) })
      b.in = chain((k, v) => { const set = new Set((v as unknown[]).map(String)); rows = rows.filter(r => set.has(String(r[k as string]))) })
      b.gte = chain((k, v) => { rows = rows.filter(r => cmp(r[k as string], v) >= 0) })
      b.gt = chain((k, v) => { rows = rows.filter(r => cmp(r[k as string], v) > 0) })
      b.lt = chain((k, v) => { rows = rows.filter(r => cmp(r[k as string], v) < 0) })
      b.ilike = chain((k, p) => { const re = new RegExp(`^${String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i'); rows = rows.filter(r => re.test(String(r[k as string] ?? ''))) })
      b.order = chain((k, o) => { const asc = (o as { ascending?: boolean } | undefined)?.ascending !== false; rows = [...rows].sort((x, y) => (asc ? 1 : -1) * cmp(x[k as string], y[k as string])) })
      b.range = chain((a, z) => { rows = rows.slice(a as number, (z as number) + 1) })
      b.limit = chain(n => { rows = rows.slice(0, n as number) })
      b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: count === -1 ? rows.length : null }).then(res)
      return b
    },
  }
}

const TABLES = ['pitch_shape_bins_milb', 'pitch_shape_cells_milb', 'pitch_shape_pitcher_milb', 'pitch_shape_milb_coverage', 'pitch_shape_milb_runs', 'pitch_shape_results_milb', 'pitch_shape_results_pitcher_milb']
let missing = new Set<string>()   // tables that are in the preview file but not yet in Supabase

/**
 * The client the minor-league readers use: Supabase, or, in `next dev` only, the local preview file for any table Supabase does not have yet (so the outcomes tables can be tried
 * before their migration is run, while everything already loaded keeps coming from the real database). Re-checked every 30 seconds, so it stops the moment a table exists.
 */
export async function milbDb(): Promise<ReturnType<typeof createAdminClient>> {
  const real = createAdminClient()
  if (process.env.NODE_ENV !== 'development' || !fs.existsSync(FILE)) return real
  if (Date.now() - probedAt > 30_000) {
    probedAt = Date.now()
    const gone = new Set<string>()
    await Promise.all(TABLES.map(async t => { const r = await real.from(t).select('level').limit(1); if (r.error) gone.add(t) }))
    missing = gone
  }
  if (missing.size === 0) return real
  try {
    const m = fs.statSync(FILE).mtimeMs
    if (!tables || m !== loadedAt) { tables = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Tables; loadedAt = m }
  } catch { return real }
  const dev = devClient(tables as Tables)
  return { from: (t: string) => (missing.has(t) ? dev.from(t) : real.from(t)) } as unknown as ReturnType<typeof createAdminClient>
}
