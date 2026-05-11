import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateEdgeScore, logPrediction } from '@/lib/edge'
import { generateNarrative } from '@/lib/narrative'
import { aggregateGameStreaks } from '@/lib/streaks'
import type { GameStreaks } from '@/lib/streaks'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NARRATIVE_REGEN_THRESHOLD = 5  // regenerate narrative if score swings >5

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,venue,lineups`
    
    const res = await fetch(url)
    const data = await res.json()
    
    const games = data.dates?.[0]?.games ?? []
    console.log(`Found ${games.length} games for ${today}`)

    let predictions_logged = 0
    let predictions_skipped = 0
    let narratives_regenerated = 0
    let narratives_kept = 0
    const errors: string[] = []

    for (const game of games) {
      try {
        if (!game.teams?.home?.team?.id || !game.teams?.away?.team?.id) {
          predictions_skipped++
          continue
        }

        // Skip already-finished games (don't waste resources)
        if (game.status?.abstractGameState === 'Final') {
          predictions_skipped++
          continue
        }

        // Calculate Edge Score with current data
        const result = await calculateEdgeScore({
          home_team_id: game.teams.home.team.id,
          away_team_id: game.teams.away.team.id,
          home_pitcher_id: game.teams.home.probablePitcher?.id ?? null,
          away_pitcher_id: game.teams.away.probablePitcher?.id ?? null,
          venue_name: game.venue?.name ?? '',
        })

        // Fetch streak data (best effort — don't block on failure)
let streaks: GameStreaks | null = null
try {
  streaks = await aggregateGameStreaks(
    game.teams.home.team.id,
    game.teams.away.team.id,
    game.teams.home.probablePitcher?.id ?? null,
    game.teams.home.probablePitcher?.fullName ?? null,
    game.teams.away.probablePitcher?.id ?? null,
    game.teams.away.probablePitcher?.fullName ?? null,
  )
} catch (err) {
  console.error(`Streak fetch failed for game ${game.gamePk}:`, err)
}

        const gameDate = game.officialDate ?? game.gameDate?.split('T')[0] ?? today

        // Detect lineup status
        const homeLineup = game.lineups?.homePlayers
        const awayLineup = game.lineups?.awayPlayers
        const lineupsConfirmed = 
          Array.isArray(homeLineup) && homeLineup.length >= 9 &&
          Array.isArray(awayLineup) && awayLineup.length >= 9

        // Check if we should regenerate narrative
        // Skip if existing prediction has narrative AND score didn't swing significantly
       const { data: existing } = await supa
  .from('edge_predictions')
  .select('edge_score, summary, story_lead, narrative')
  .eq('game_pk', game.gamePk)
  .single()

        const hasExistingNarrative = existing?.summary && existing?.narrative
        const scoreSwing = existing 
          ? Math.abs(existing.edge_score - result.edge_score)
          : 999  // force regen if no existing record

        const shouldRegenerateNarrative = 
          !hasExistingNarrative || 
          scoreSwing >= NARRATIVE_REGEN_THRESHOLD

    let summary: string | null = existing?.summary ?? null
let story_lead: string | null = existing?.story_lead ?? null
let narrative: string | null = existing?.narrative ?? null

if (shouldRegenerateNarrative) {
  const generated = await generateNarrative({
    home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name,
    edge_score: result.edge_score,
    predicted_winner: result.predicted_winner,
    confidence_tier: result.confidence_tier,
    components: result.components,
    components_raw: result.components_raw,
    venue_name: game.venue?.name ?? '',
    streaks: streaks,
  })

  if (generated) {
    summary = generated.summary
    story_lead = generated.story_lead
    narrative = generated.narrative
    narratives_regenerated++
  }
} else {
  narratives_kept++
}

 await logPrediction(
  game.gamePk,
  gameDate,
  game.teams.home.team.id,
  game.teams.home.team.name,
  game.teams.away.team.id,
  game.teams.away.team.name,
  result,
  lineupsConfirmed,
  summary,
  story_lead,
  narrative,
  streaks,
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
      narratives_regenerated,
      narratives_kept,
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