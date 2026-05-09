import { NextResponse } from 'next/server'
import { calculateEdgeScore, logPrediction } from '@/lib/edge'
import { generateNarrative } from '@/lib/narrative'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch tonight's games (or today if it's morning)
    const today = new Date().toISOString().split('T')[0]
    const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,venue`
    
    const res = await fetch(url)
    const data = await res.json()
    
    const games = data.dates?.[0]?.games ?? []
    console.log(`Found ${games.length} games for ${today}`)

    let predictions_logged = 0
    let predictions_skipped = 0
    const errors: string[] = []

    for (const game of games) {
      try {
        // Skip games that aren't preview-able
        if (!game.teams?.home?.team?.id || !game.teams?.away?.team?.id) {
          predictions_skipped++
          continue
        }

        // Skip already-finished games
        if (game.status?.abstractGameState === 'Final') {
          predictions_skipped++
          continue
        }

        const result = await calculateEdgeScore({
          home_team_id: game.teams.home.team.id,
          away_team_id: game.teams.away.team.id,
          home_pitcher_id: game.teams.home.probablePitcher?.id ?? null,
          away_pitcher_id: game.teams.away.probablePitcher?.id ?? null,
          venue_name: game.venue?.name ?? '',
        })

        const gameDate = game.officialDate ?? game.gameDate?.split('T')[0] ?? today


// Generate narrative (best effort — don't block prediction if LLM fails)
const narrative = await generateNarrative({
  home_team: game.teams.home.team.name,
  away_team: game.teams.away.team.name,
  edge_score: result.edge_score,
  predicted_winner: result.predicted_winner,
  confidence_tier: result.confidence_tier,
  components: result.components,
  components_raw: result.components_raw,
  venue_name: game.venue?.name ?? '',
})
await logPrediction(
  game.gamePk,
  gameDate,
  game.teams.home.team.id,
  game.teams.home.team.name,
  game.teams.away.team.id,
  game.teams.away.team.name,
  result,
  false,
  narrative?.summary ?? null,
  narrative?.narrative ?? null
)

        predictions_logged++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`Game ${game.gamePk}: ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      games_found: games.length,
      predictions_logged,
      predictions_skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('Prediction logging failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}