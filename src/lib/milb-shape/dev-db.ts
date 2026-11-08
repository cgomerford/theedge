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
let mode: 'real' | 'dev' | undefined
let tables: Tables | null = null
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

/** The client the minor-league readers use: Supabase, or in `next dev` with the tables missing, the local JSON file. */
export async function milbDb(): Promise<ReturnType<typeof createAdminClient>> {
  const real = createAdminClient()
  if (process.env.NODE_ENV !== 'development') return real
  if (mode === undefined) {
    mode = 'real'
    if (fs.existsSync(FILE)) {
      const probe = await real.from('pitch_shape_cells_milb').select('level').limit(1)
      if (probe.error) {
        try { tables = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Tables; mode = 'dev' } catch { mode = 'real' }
      }
    }
  }
  if (mode === 'dev') {
    try {
      const m = fs.statSync(FILE).mtimeMs
      if (m !== loadedAt) { tables = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Tables; loadedAt = m }
    } catch { /* keep what was loaded */ }
  }
  return mode === 'dev' && tables ? (devClient(tables) as unknown as ReturnType<typeof createAdminClient>) : real
}
