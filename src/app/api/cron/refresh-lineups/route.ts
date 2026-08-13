import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findTeamByName } from '@/lib/teams'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── MLB API shapes we actually read (verified via curl 2026-08-12) ───────────
//
// game.lineups.homePlayers / awayPlayers: flat array, NOT wrapped in `.person`.
// Batting order is the array index (0 = leadoff), there is no explicit
// battingOrder field on each entry. Shape per entry:
//   { id, fullName, link, firstName, lastName,
//     primaryPosition: { code, name, type, abbreviation }, useName }
type MlbLineupPlayer = {
  id: number
  fullName: string
  primaryPosition?: { abbreviation?: string }
}

function resolveAbbr(teamName: string | undefined, fallback: string): string {
  if (!teamName) return fallback
  const team = findTeamByName(teamName)
  return team?.abbrev ?? teamName.split(' ').pop()?.toUpperCase() ?? fallback
}

/**
 * Writes one team's lineup for one game. Clear-before-write per (game_pk,
 * team_abbr) — lineups can change right up until first pitch, and a stale
 * row from an earlier same-day check should never survive a later one that
 * found a different (or no) lineup. Same pattern as fetch_player_form.py's
 * clear_today().
 */
async function writeLineup(
  gamePk: number,
  teamAbbr: string,
  players: MlbLineupPlayer[],
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supa
    .from('game_lineups')
    .delete()
    .eq('game_pk', gamePk)
    .eq('team_abbr', teamAbbr)

  if (deleteError) {
    return { error: `delete failed: ${deleteError.message}` }
  }

  if (players.length === 0) return { error: null }

  const rows = players.map((p, i) => ({
    game_pk: gamePk,
    team_abbr: teamAbbr,
    batting_order: i + 1,
    player_id: p.id,
    player_name: p.fullName,
    position: p.primaryPosition?.abbreviation ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error: insertError } = await supa.from('game_lineups').insert(rows)
  if (insertError) {
    return { error: `insert failed: ${insertError.message}` }
  }
  return { error: null }
}

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
    let lineups_written_count = 0
    const errors: string[] = []

    for (const game of games) {
      try {
        // Skip games that are already final
        if (game.status?.abstractGameState === 'Final') {
          already_final_count++
          continue
        }

        // Check if lineup data is present
        const homeLineup: MlbLineupPlayer[] = game.lineups?.homePlayers ?? []
        const awayLineup: MlbLineupPlayer[] = game.lineups?.awayPlayers ?? []
        const lineupsConfirmed =
          Array.isArray(homeLineup) && homeLineup.length >= 9 &&
          Array.isArray(awayLineup) && awayLineup.length >= 9

        // Update the prediction record with lineup status (existing behaviour, unchanged)
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

        // NEW: persist actual lineup rows (batting order + player IDs) so
        // scout.ts can build lineup-vs-pitch-type rows. Only write when we
        // have real data — empty state beats a half-written 3-player lineup.
        if (lineupsConfirmed) {
          const homeAbbr = resolveAbbr(game.teams?.home?.team?.name, 'HOM')
          const awayAbbr = resolveAbbr(game.teams?.away?.team?.name, 'AWY')

          const [homeWrite, awayWrite] = await Promise.all([
            writeLineup(game.gamePk, homeAbbr, homeLineup),
            writeLineup(game.gamePk, awayAbbr, awayLineup),
          ])

          if (homeWrite.error) errors.push(`Game ${game.gamePk} home lineup: ${homeWrite.error}`)
          if (awayWrite.error) errors.push(`Game ${game.gamePk} away lineup: ${awayWrite.error}`)
          if (!homeWrite.error && !awayWrite.error) lineups_written_count++

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
      lineups_written: lineups_written_count,
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