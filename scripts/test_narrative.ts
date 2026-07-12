/**
 * scripts/test-narrative.ts
 *
 * Generates and prints a narrative for ONE game without touching any other games.
 * Does NOT write to the database — output is console only for review.
 *
 * Usage:
 *   npx tsx scripts/test-narrative.ts phi-at-kc-2026-07-06
 *
 * Replace the slug with any slug from your edge_predictions table.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { generateNarrative } from '../src/lib/narrative'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npx tsx scripts/test-narrative.ts <slug>')
    console.error('Example: npx tsx scripts/test-narrative.ts phi-at-kc-2026-07-06')
    process.exit(1)
  }

  console.log(`\nFetching prediction for: ${slug}`)

  const { data: pred, error } = await supa
    .from('edge_predictions')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !pred) {
    console.error('Could not find prediction for slug:', slug, error)
    process.exit(1)
  }

  console.log(`Found: ${pred.away_team} @ ${pred.home_team} — ${pred.game_date}`)
  console.log(`Edge score: ${pred.edge_score} | Tier: ${pred.confidence_tier} | Winner: ${pred.predicted_winner}`)
  console.log('\nBuilding narrative inputs from components_raw...\n')

  // Build narrative inputs from the stored prediction
  // This mirrors what log-predictions/route.ts does
  const inputs = {
    home_team:        pred.home_team,
    away_team:        pred.away_team,
    edge_score:       pred.edge_score,
    predicted_winner: pred.predicted_winner,
    confidence_tier:  pred.confidence_tier,
    components:       pred.components,
    components_raw:   pred.components_raw,
    venue_name:       pred.venue ?? '',
    game_time:        pred.game_time ?? undefined,
    weather:          pred.components_raw?.weather_raw ?? null,
    is_dome:          pred.components_raw?.park?.is_dome ?? false,
    streaks:          pred.streaks ?? null,
    series_game_number:    pred.series_game_number ?? null,
    series_games_total:    pred.series_games_total ?? null,
    away_series_wins:      pred.away_series_wins ?? null,
    home_series_wins:      pred.home_series_wins ?? null,
    series_runs_so_far:    pred.series_runs_so_far ?? null,
    away_pitcher_vs_opponent_era:    pred.away_pitcher_vs_opponent_era ?? null,
    away_pitcher_vs_opponent_record: pred.away_pitcher_vs_opponent_record ?? null,
    home_pitcher_vs_opponent_era:    pred.home_pitcher_vs_opponent_era ?? null,
    home_pitcher_vs_opponent_record: pred.home_pitcher_vs_opponent_record ?? null,
    away_vs_lhp_record: pred.away_vs_lhp_record ?? null,
    away_vs_rhp_record: pred.away_vs_rhp_record ?? null,
    home_vs_lhp_record: pred.home_vs_lhp_record ?? null,
    home_vs_rhp_record: pred.home_vs_rhp_record ?? null,
    away_pitcher_last_start:    pred.away_pitcher_last_start ?? null,
    home_pitcher_last_start:    pred.home_pitcher_last_start ?? null,
    away_pitcher_injury_return: pred.away_pitcher_injury_return ?? null,
    home_pitcher_injury_return: pred.home_pitcher_injury_return ?? null,
  }

  console.log('Calling Gemini...\n')
  const result = await generateNarrative(inputs as any)

  if (!result) {
    console.error('generateNarrative returned null — check Gemini API key and logs above')
    process.exit(1)
  }

  console.log('═══════════════════════════════════════')
  console.log('SUMMARY (one-liner):')
  console.log(result.summary)

  console.log('\n═══════════════════════════════════════')
  console.log('STORY LEAD:')
  console.log(result.story_lead)

  console.log('\n═══════════════════════════════════════')
  console.log('NARRATIVE (free):')
  console.log(result.narrative)

  console.log('\n═══════════════════════════════════════')
  console.log('NARRATIVE PRO:')
  console.log(result.narrative_pro)

  console.log('\n═══════════════════════════════════════')
  console.log('CONTRARIAN:')
  console.log(result.contrarian)

  console.log('\n═══════════════════════════════════════')
  console.log('HOME STORIES:')
  result.home_stories?.forEach(s => console.log(`  [${s.stat}] ${s.text}`))

  console.log('\nAWAY STORIES:')
  result.away_stories?.forEach(s => console.log(`  [${s.stat}] ${s.text}`))

  console.log('\n═══════════════════════════════════════')
  console.log(`Cost: $${result.cost_usd.toFixed(5)}`)
  console.log('\n✅ Done — nothing written to DB. To persist, run the cron for this game only.')

  // Optionally write to DB — uncomment if you want to save the result
  /*
  await supa.from('edge_predictions').update({
    narrative:      result.narrative,
    narrative_pro:  result.narrative_pro,
    summary:        result.summary,
    story_lead:     result.story_lead,
    contrarian:     result.contrarian,
    home_stories:   result.home_stories,
    away_stories:   result.away_stories,
    pro_takeaways:  result.pro_takeaways,
    game_day_notes: result.game_day_notes,
  }).eq('slug', slug)
  console.log('✅ Written to DB')
  */
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})