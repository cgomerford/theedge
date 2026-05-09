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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Fetch today's games WITH lineup data
    const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,lineups,linescore`
    const res = await fetch(url)
    const data = await res.json()
    
    const games = data.dates?.[0]?.games ?? []
    console.log(`Checking lineups for ${games.length} games`)

    let lineups_confirmed_count = 0
    let lineups_pending_count = 0
    let already_final_count = 0
    const errors: string[] = []

    for (const game of games) {
      try {
        // Skip games that are already final
        if (game.status?.abstractGameState === 'Final') {
          already_final_count++
          continue
        }

        // Check if lineup data is present
        const homeLineup = game.lineups?.homePlayers
        const awayLineup = game.lineups?.awayPlayers
        const lineupsConfirmed = 
          Array.isArray(homeLineup) && homeLineup.length >= 9 &&
          Array.isArray(awayLineup) && awayLineup.length >= 9

        // Update the prediction record with lineup status
        const { error } = await supa
          .from('edge_predictions')
          .update({
            lineups_confirmed: lineupsConfirmed,
            updated_at: new Date().toISOString(),
          })
          .eq('game_pk', game.gamePk)

        if (error) {
          errors.push(`Game ${game.gamePk}: ${error.message}`)
          continue
        }

        if (lineupsConfirmed) {
          lineups_confirmed_count++
        } else {
          lineups_pending_count++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`Game ${game.gamePk}: ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      games_checked: games.length,
      lineups_confirmed: lineups_confirmed_count,
      lineups_pending: lineups_pending_count,
      already_final: already_final_count,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('Lineup refresh failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}