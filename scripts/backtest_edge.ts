/**
 * scripts/backtest_edge.ts
 *
 * Replays every graded historical prediction through the CURRENT scoring
 * logic in src/lib/edge.ts — not a reimplementation, the actual functions,
 * imported directly. This is deliberately TypeScript, not Python: the whole
 * point of a backtest is validating the real production formulas, and a
 * second hand-written copy of them risks becoming exactly the kind of
 * silently-diverging duplicate logic this whole audit has been eliminating.
 *
 * What this validates: does replaying edge_predictions.components_raw
 * (the exact point-in-time snapshot logged before each game) through
 * TODAY's compute functions and weights predict the actual winner?
 *
 * Honest limitation: interaction fields added after a row was logged
 * (gb_percent_batting, oaa_lf/cf/rf, pull_pct_lhb/rhb) don't exist in
 * older rows' components_raw — those sub-factors null-guard to 0 for
 * that historical replay, same as a live game missing data today. This
 * strengthens automatically as new fetchers backfill going forward; it
 * does not need to be "fixed" to trust today's overall accuracy number.
 *
 * Run: npx tsx scripts/backtest_edge.ts
 * Env: reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from
 *      .env.local — loaded here, BEFORE importing edge.ts, since edge.ts
 *      constructs a Supabase client at module-load time and needs the
 *      env vars to already be set. (Static imports are hoisted above
 *      any top-level code in this file, so dotenv.config() has to run
 *      inside main() via a dynamic import — not a top-level import.)
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(__dirname, '../.env.local') })

const PAGE_SIZE = 1000

type GradedRow = {
  id: string
  game_pk: number
  game_date: string
  home_team: string
  away_team: string
  actual_winner: 'home' | 'away'
  components_raw: any
}

async function fetchAllGraded(supa: ReturnType<typeof createClient>): Promise<GradedRow[]> {
  const rows: GradedRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await supa
      .from('edge_predictions')
      .select('id, game_pk, game_date, home_team, away_team, actual_winner, components_raw')
      .not('graded_at', 'is', null)
      .not('actual_winner', 'is', null)
      .order('game_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...(data as GradedRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function main() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const supa = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Dynamic import — runs AFTER dotenv.config() above, so edge.ts's
  // top-level createClient() call sees the env vars.
  const { scoreFromComponentsRaw, WEIGHTS } = await import('../src/lib/edge')

  console.log('='.repeat(70))
  console.log('EDGE SCORE BACKTEST — replaying graded history through current logic')
  console.log('='.repeat(70))

  console.log('\nFetching graded predictions...')
  const rows = await fetchAllGraded(supa)
  console.log(`Found ${rows.length} graded predictions with a known outcome\n`)

  if (rows.length === 0) {
    console.log('Nothing to backtest.')
    return
  }

  type TierBucket = { total: number; correct: number }
  const tiers: Record<'strong' | 'moderate' | 'slight', TierBucket> = {
    strong:   { total: 0, correct: 0 },
    moderate: { total: 0, correct: 0 },
    slight:   { total: 0, correct: 0 },
  }
  let tossups = 0
  let predictions = 0
  let correct = 0
  let skipped = 0
  const skipReasons: string[] = []

  for (const row of rows) {
    if (!row.components_raw) {
      skipped++
      skipReasons.push(`${row.game_pk}: no components_raw stored`)
      continue
    }

    let scored
    try {
      scored = scoreFromComponentsRaw(row.components_raw, WEIGHTS)
    } catch (e) {
      skipped++
      skipReasons.push(`${row.game_pk}: scoring threw — ${e instanceof Error ? e.message : e}`)
      continue
    }

    if (scored.confidence_tier === 'tossup') {
      tossups++
      continue
    }

    predictions++
    const isCorrect = scored.predicted_winner === row.actual_winner
    if (isCorrect) correct++

    tiers[scored.confidence_tier].total++
    if (isCorrect) tiers[scored.confidence_tier].correct++
  }

  console.log('-'.repeat(70))
  console.log('RESULTS')
  console.log('-'.repeat(70))
  console.log(`\nTotal graded rows:     ${rows.length}`)
  console.log(`Skipped (bad data):    ${skipped}`)
  console.log(`Toss-ups (no pick):    ${tossups}`)
  console.log(`Predictions made:      ${predictions}`)

  if (predictions > 0) {
    console.log(`\nOVERALL ACCURACY: ${correct}/${predictions} = ${(100 * correct / predictions).toFixed(1)}%`)
  }

  console.log('\nBy confidence tier:')
  for (const tier of ['strong', 'moderate', 'slight'] as const) {
    const b = tiers[tier]
    if (b.total === 0) continue
    console.log(`  ${tier.padEnd(10)} (${String(b.total).padStart(4)} games): ${b.correct}/${b.total} = ${(100 * b.correct / b.total).toFixed(1)}%`)
  }

  if (skipped > 0) {
    console.log(`\n${skipped} row(s) skipped:`)
    for (const reason of skipReasons.slice(0, 10)) {
      console.log(`  - ${reason}`)
    }
    if (skipReasons.length > 10) {
      console.log(`  ... and ${skipReasons.length - 10} more`)
    }
  }

  console.log('\n' + '='.repeat(70))
}

main().catch(err => {
  console.error('Backtest failed:', err)
  process.exit(1)
})