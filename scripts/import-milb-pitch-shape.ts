// scripts/import-milb-pitch-shape.ts
//
// One-off importer for the Pitch Shape Lab's minor-league levels: Triple-A (aaa) and the Florida State League (fsl). No cron. The logic is in src/lib/milb-shape/importer.ts.
//
// TABLE OWNERSHIP (single writer): this script writes pitch_shape_bins_milb, pitch_shape_cells_milb, pitch_shape_pitcher_milb, pitch_shape_milb_coverage and
// pitch_shape_milb_runs, and nothing else does. It never touches an MLB table.
//
//   DRY RUN (the default; writes nothing, never connects to Supabase):
//     npx tsx scripts/import-milb-pitch-shape.ts --season=2026 --level=aaa --start=2026-08-01 --end=2026-08-01
//     npx tsx scripts/import-milb-pitch-shape.ts --season=2026 --level=fsl                  # the whole season: counts, null rates, gaps, size
//   WRITE (idempotent; resumable; refuses without the project ref):
//     npx tsx scripts/import-milb-pitch-shape.ts --write --confirm-project=<ref> --season=2026 --level=aaa
//   LOCAL PREVIEW (writes a file, never Supabase; read by the Lab in `next dev` only while the real tables are missing):
//     npx tsx scripts/import-milb-pitch-shape.ts --season=2026 --level=aaa --start=2026-08-01 --end=2026-08-02 --json
//   flags: --cache-dir=<dir> (default .dev-cache/milb-shape)   --refresh (ignore the response cache)   --chunk-days=3   --allow-incomplete (write even if a gap was reported)
//
// Responses are cached on disk (gzip), so a run that stops part-way resumes from the cache, and a rerun produces identical rows and adds no duplicates.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertWriteTarget, EXPECTED_PROJECT_REF, WriteRefusedError } from '../src/lib/milb-shape/guard'
import { buildPlan, report, runSummary, tablesOf, SOURCE, writePlan, type Db, type Deps } from '../src/lib/milb-shape/importer'
import { isMilb, parseLevel, type MilbLevel } from '../src/lib/milb-shape/levels'
import { fileCache, type Fetcher } from '../src/lib/milb-shape/savant'

/** The one place this job touches Savant: a plain GET with a browser-like agent and a two-minute limit. */
const defaultFetcher: Fetcher = async url => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 120000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctl.signal })
    return { status: res.status, text: await res.text() }
  } finally { clearTimeout(t) }
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  return hit === undefined ? undefined : hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true'
}

/** .env.local, read without printing anything. Names differ by context (see CLAUDE.md): support both. */
function loadEnv(): { url?: string; key?: string } {
  const file = path.resolve(process.cwd(), '.env.local')
  const env: Record<string, string> = {}
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  const get = (k: string) => process.env[k] || env[k]
  return { url: get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_KEY') }
}

async function main(): Promise<number> {
  const write = arg('write') === 'true'
  const season = Number(arg('season') ?? new Date().getFullYear())
  const wanted = arg('level')
  if (write && !wanted) { console.error('--write needs --level=aaa or --level=fsl'); return 2 }
  const levels: MilbLevel[] = wanted ? [parseLevel(wanted)].filter(isMilb) : ['aaa', 'fsl']
  if (wanted && levels.length === 0) { console.error(`--level must be aaa or fsl (got ${wanted})`); return 2 }

  let db: Db | null = null
  if (write) {
    const env = loadEnv()
    try {
      const t = assertWriteTarget(env.url, arg('confirm-project'))
      console.log(`WRITE TARGET: ${t.url}  project ref ${t.ref}${t.matchesExpected ? ' (matches the expected "theedge" ref)' : ` (NOT the expected ref ${EXPECTED_PROJECT_REF}; you confirmed it explicitly)`}`)
    } catch (e) {
      if (e instanceof WriteRefusedError) { console.error(e.message); return 3 }
      throw e
    }
    if (!env.key) { console.error('[guard] no Supabase service key found in the environment or .env.local'); return 3 }
    const supa = createClient(env.url as string, env.key, { auth: { persistSession: false } })
    db = {
      async upsert(table, rows, onConflict) { const { error } = await supa.from(table).upsert(rows, { onConflict }); if (error) throw new Error(`[upsert ${table}] ${error.message}`) },
      async deleteStale(table, match, before) {
        let q = supa.from(table).delete()
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
        const { error } = await q.lt('updated_at', before)
        if (error) throw new Error(`[deleteStale ${table}] ${error.message}`)
      },
    }
  } else {
    console.log('DRY RUN: nothing will be written and Supabase is not contacted.')
  }

  const cacheDir = arg('cache-dir') ?? '.dev-cache/milb-shape'
  if (arg('refresh') === 'true') fs.rmSync(cacheDir, { recursive: true, force: true })
  const deps: Deps = {
    fetcher: defaultFetcher, cache: fileCache(cacheDir), log: m => console.log(m),
    getJson: async url => { const r = await fetch(url); if (!r.ok) throw new Error(`[getJson] HTTP ${r.status} ${url}`); return r.json() },
  }

  for (const level of levels) {
    console.log(`\nBuilding ${level} ${season}...`)
    const plan = await buildPlan({ level, season, start: arg('start'), end: arg('end'), chunkDays: arg('chunk-days') ? Number(arg('chunk-days')) : undefined }, deps)
    console.log(report(plan))
    if (arg('json') === 'true') {
      const file = path.resolve('.dev-cache/milb-shape/tables.json')
      const prev = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>) : {}
      const t = tablesOf(plan), now = new Date().toISOString()
      const keep = (name: string) => (prev[name] ?? []).filter(r => !(r.level === level && String(r.span ?? r.season) === String(season)))
      const out = {
        pitch_shape_bins_milb: [...keep('pitch_shape_bins_milb'), ...t.bins],
        pitch_shape_cells_milb: [...keep('pitch_shape_cells_milb'), ...t.cells],
        pitch_shape_pitcher_milb: [...keep('pitch_shape_pitcher_milb'), ...t.pitchers],
        pitch_shape_milb_coverage: [...keep('pitch_shape_milb_coverage'), ...t.coverage],
        pitch_shape_results_milb: [...keep('pitch_shape_results_milb'), ...t.results],
        pitch_shape_results_pitcher_milb: [...keep('pitch_shape_results_pitcher_milb'), ...t.resultsPitchers],
        pitch_shape_milb_runs: [...keep('pitch_shape_milb_runs'), { level, season, source: SOURCE, fetched_at: plan.fetchedAt, complete: plan.complete, first_date: plan.firstDate, last_date: plan.lastDate, summary: runSummary(plan), updated_at: now }],
      }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(out))
      console.log(`\nWROTE the local preview file ${file} (${level} ${season}). Supabase was not contacted.`)
      continue
    }
    if (db) {
      if (!plan.complete && arg('allow-incomplete') !== 'true') { console.error(`\nNOT WRITING ${level}: ${plan.fetch.gaps.length} gap(s) reported. Fix and rerun (the cache keeps finished chunks), or pass --allow-incomplete to write it labelled partial.`); return 4 }
      await writePlan(plan, db)
      console.log(`\nWROTE ${level} ${season}${plan.complete ? '' : ' (partial, labelled so)'}.`)
    }
  }
  return 0
}

main().then(c => process.exit(c)).catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
