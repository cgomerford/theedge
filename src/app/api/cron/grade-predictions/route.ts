import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
const authHeader = request.headers.get('authorization')
const validSecrets = [
  process.env.CRON_SECRET,         // Vercel-injected for scheduled runs
  process.env.EDGE_CRON_AUTH,      // Our manual auth for curl/testing
].filter(Boolean)

const isValid = validSecrets.some(secret => 
  authHeader === `Bearer ${secret}`
)

if (!isValid) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

  try {
    // Get all ungraded predictions older than 1 day
    // (gives games time to actually finish)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: predictions, error: fetchError } = await supa
      .from('edge_predictions')
      .select('*')
      .is('graded_at', null)
      .gte('game_date', threeDaysAgo)
      .lte('game_date', yesterday)

    if (fetchError) throw fetchError

    console.log(`Found ${predictions?.length ?? 0} ungraded predictions`)

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No predictions to grade',
        predictions_graded: 0,
      })
    }

    // Get unique game dates to fetch
    const dates = Array.from(new Set(predictions.map(p => p.game_date)))
    
    // Fetch results for each date
    const gameResults: Record<number, { homeScore: number; awayScore: number }> = {}
    
    for (const date of dates) {
      const url = `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=team,linescore`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      
      for (const block of data.dates ?? []) {
        for (const g of block.games ?? []) {
          // Only count completed games
          if (g.status?.abstractGameState !== 'Final') continue
          const detailed = g.status?.detailedState ?? ''
          if (['Postponed', 'Cancelled', 'Suspended'].some(s => detailed.includes(s))) continue
          
          const homeScore = g.teams?.home?.score
          const awayScore = g.teams?.away?.score
          if (homeScore == null || awayScore == null) continue
          
          gameResults[g.gamePk] = {
            homeScore,
            awayScore,
          }
        }
      }
    }

    console.log(`Fetched results for ${Object.keys(gameResults).length} games`)

    // Grade each prediction
    let predictions_graded = 0
    const updates: any[] = []

    for (const prediction of predictions) {
      const result = gameResults[prediction.game_pk]
      if (!result) continue  // game not finished yet, leave for next run

      const actualWinner = result.homeScore > result.awayScore ? 'home' : 'away'
      const wasCorrect = prediction.confidence_tier === 'tossup' 
        ? null  // toss-ups aren't graded
        : prediction.predicted_winner === actualWinner

      updates.push({
        id: prediction.id,
        actual_winner: actualWinner,
        home_score: result.homeScore,
        away_score: result.awayScore,
        was_correct: wasCorrect,
        graded_at: new Date().toISOString(),
      })

      predictions_graded++
    }
// Update each prediction individually (more reliable than batch upsert)
let actually_updated = 0
const updateErrors: string[] = []

for (const update of updates) {
  const { error: updateError } = await supa
    .from('edge_predictions')
    .update({
      actual_winner: update.actual_winner,
      home_score: update.home_score,
      away_score: update.away_score,
      was_correct: update.was_correct,
      graded_at: update.graded_at,
    })
    .eq('id', update.id)
  
  if (updateError) {
    updateErrors.push(`Game ${update.id}: ${updateError.message}`)
  } else {
    actually_updated++
  }
}

console.log(`Successfully updated ${actually_updated} of ${updates.length} predictions`)
if (updateErrors.length > 0) {
  console.error('Update errors:', updateErrors)
}
    // Compute quick accuracy stats
    const accuracy = predictions_graded > 0
      ? updates.filter(u => u.was_correct === true).length /
        updates.filter(u => u.was_correct !== null).length
      : null

    return NextResponse.json({
  success: true,
  predictions_found: predictions.length,
  predictions_graded: actually_updated,  // changed from predictions_graded
  accuracy_so_far: accuracy ? `${(accuracy * 100).toFixed(1)}%` : null,
  errors: updateErrors.length > 0 ? updateErrors : undefined,
})
  } catch (err) {
    console.error('Grading failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}