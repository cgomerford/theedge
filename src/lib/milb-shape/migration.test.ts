import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Manual-review checks made automatic where a file can be read: the draft migration is additive, keeps every table private, and nothing in the browser bundle can carry a secret.
const MIG = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261109120000_pitch_shape_milb.sql'), 'utf8')
const code = MIG.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const TABLES = ['pitch_shape_bins_milb', 'pitch_shape_cells_milb', 'pitch_shape_pitcher_milb', 'pitch_shape_milb_coverage', 'pitch_shape_milb_runs']

describe('the migration draft', () => {
  it('only creates new tables: no drop, delete, truncate, update, or alter of an existing table', () => {
    expect(code).not.toMatch(/\b(drop|delete|truncate|update|grant|revoke)\b/i)
    expect(code).not.toMatch(/alter\s+table\s+(?!if exists\s)(?!pitch_shape_\w+_milb|pitch_shape_milb_\w+)/i)
    for (const t of TABLES) expect(code).toMatch(new RegExp(`create table if not exists ${t}\\b`))
    // every table the migration touches is one of the five new ones; no MLB table name appears as a target
    const targets = [...code.matchAll(/(?:create table if not exists|alter table|create index if not exists \w+ on)\s+(\w+)/gi)].map(m => m[1])
    for (const t of targets) expect(TABLES).toContain(t)
  })
  it('turns row-level security on for every table and adds no policy, so only the server\'s service role can read or write', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table ${t} enable row level security`))
    expect(code).not.toMatch(/create policy/i)
  })
  it('limits level to Triple-A and the Florida State League with a check constraint on every table', () => {
    expect((code.match(/check \(level in \('aaa', 'fsl'\)\)/g) ?? []).length).toBe(TABLES.length)
  })
  it('keys each table so a level-season is replaced as a unit and a pitcher keeps one row per level', () => {
    expect(code).toMatch(/primary key \(level, span, pitch_type, p_throws, velo_bin, ivb_bin, hb_bin, slot_bin\)/)
    expect(code).toMatch(/primary key \(level, span, pitch_type, p_throws\)/)
    expect(code).toMatch(/primary key \(level, season, pitcher_id, pitch_type\)/)
  })
})

describe('secrets', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
  it('no component or client module mentions a service key or reads a server-only variable', () => {
    const files = [...walk('src/components/pitch-shape'), 'src/lib/milb-shape/levels.ts', 'src/lib/milb-shape/url.ts', 'src/lib/milb-shape/capability.ts', 'src/lib/milb-shape/closest.ts'].filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8')
      expect(t, f).not.toMatch(/SERVICE_ROLE|SERVICE_KEY|createAdminClient|process\.env/)
    }
  })
  it('the importer reads its key from the environment and never prints it', () => {
    const t = fs.readFileSync('scripts/import-milb-pitch-shape.ts', 'utf8')
    expect(t).not.toMatch(/console\.(log|error)\([^)]*env\.key/)
    expect(t).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE/)
  })
})
