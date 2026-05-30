import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateEdgeScore, logPrediction } from '@/lib/edge'
import { generateNarrative } from '@/lib/narrative'
import { aggregateGameStreaks } from '@/lib/streaks'
import type { GameStreaks } from '@/lib/streaks'
import { generateFantasyCards } from '@/lib/fantasy-cards'
import type { FantasyCards } from '@/lib/fantasy-cards'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Regenerate narrative only if score swings this many points.
// Set high enough that normal data refreshes don't trigger reruns,
// but low enough to catch genuine model changes (e.g. SP scratch).
const NARRATIVE_REGEN_THRESHOLD = 15

export const dynamic = 'force-dynamic'
export const revalidate = 0
function formatLineup(players: any[]): Array<{ order: number; name: string; position: string }> {
  return players
    .filter(p => p.battingOrder)
    .map(p => ({
      order: Math.round(parseInt(p.battingOrder) / 100),
      name: p.person?.fullName ?? 'Unknown',
      position: p.primaryPosition?.abbreviation ?? '?',
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 5)
}
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.EDGE_CRON_AUTH,
  ].filter(Boolean)

  const isValid = validSecrets.some(secret =>
    authHeader === `Bearer ${secret}`
  )

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
   const url_date = new URL(request.url).searchParams.get('date')
const today = url_date ?? new Date().toISOString().split('T')[0]
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

        const homeLineup = game.lineups?.homePlayers
        const awayLineup = game.lineups?.awayPlayers
        const lineupsConfirmed =
          Array.isArray(homeLineup) && homeLineup.length >= 9 &&
          Array.isArray(awayLineup) && awayLineup.length >= 9

        // ADDED: Fetch the new structured columns so we don't overwrite them with null
        const { data: existing } = await supa
          .from('edge_predictions')
          .select('edge_score, summary, story_lead, narrative, narrative_pro, lineups_confirmed, home_stories, away_stories, contrarian, pro_takeaways, fantasy_cards')
          .eq('game_pk', game.gamePk)
          .single()
          


        const hasExistingNarrative = !!(existing?.summary && existing?.narrative)
        const scoreSwing = existing
          ? Math.abs(existing.edge_score - result.edge_score)
          : 999

        const narrativeLocked =
          existing?.lineups_confirmed === true &&
          hasExistingNarrative &&
          scoreSwing < NARRATIVE_REGEN_THRESHOLD

        const shouldRegenerate = !narrativeLocked && (
          !hasExistingNarrative ||
          scoreSwing >= NARRATIVE_REGEN_THRESHOLD
        )

        let summary: string | null = existing?.summary ?? null
        let story_lead: string | null = existing?.story_lead ?? null
        let narrative: string | null = existing?.narrative ?? null
        let narrative_pro: string | null = existing?.narrative_pro ?? null
        
        
         let home_stories: any = existing?.home_stories ?? null
              let away_stories: any = existing?.away_stories ?? null
let contrarian: string | null = existing?.contrarian ?? null
let pro_takeaways: any = existing?.pro_takeaways ?? null
let fantasy_cards: FantasyCards | null = existing?.fantasy_cards ?? null  // ← ADD

// Only regenerate fantasy cards if: never generated, OR lineups just confirmed
const shouldGenerateFantasy =                                              // ← ADD
  !existing?.fantasy_cards ||                                             // ← ADD
  (!existing?.fantasy_cards?.lineups_used && lineupsConfirmed)            // ← ADD

        console.log(
          `Game ${game.gamePk}: shouldRegenerate=${shouldRegenerate}, ` +
          `locked=${narrativeLocked}, hasExisting=${hasExistingNarrative}, ` +
          `scoreSwing=${scoreSwing.toFixed(1)}, lineupsConfirmed=${lineupsConfirmed}`
        )

console.log(
  `Game ${game.gamePk}: shouldRegenerate=${shouldRegenerate}, ` +
  `locked=${narrativeLocked}, hasExisting=${hasExistingNarrative}, ` +
  `scoreSwing=${scoreSwing.toFixed(1)}, lineupsConfirmed=${lineupsConfirmed}`
)

// ── Narrative regeneration ────────────────────────────────────────────
if (shouldRegenerate) {
  const narrativeInputsBase = {
    home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name,
    edge_score: result.edge_score,
    predicted_winner: result.predicted_winner,
    confidence_tier: result.confidence_tier,
    components: result.components,
    components_raw: result.components_raw,
    venue_name: game.venue?.name ?? '',
    streaks,
  }

  const [generatedFree, generatedPro] = await Promise.all([
    generateNarrative({ ...narrativeInputsBase, is_pro: false }),
    generateNarrative({ ...narrativeInputsBase, is_pro: true }),
  ])

  if (generatedFree) {
    summary = generatedFree.summary
    story_lead = generatedFree.story_lead
    narrative = generatedFree.narrative
    home_stories = generatedFree.home_stories
    away_stories = generatedFree.away_stories
    contrarian = generatedFree.contrarian
    pro_takeaways = generatedFree.pro_takeaways
  }

  if (generatedPro) {
    narrative_pro = generatedPro.narrative
  }

  if (generatedFree || generatedPro) {
    narratives_regenerated++
    console.log(`Game ${game.gamePk}: narratives generated — free=${!!generatedFree}, pro=${!!generatedPro}`)
  }
} else {
  narratives_kept++
}

if (lineupsConfirmed && homeLineup) {
  console.log(`Game ${game.gamePk} raw home lineup sample:`, JSON.stringify(homeLineup[0]))
  console.log(`Game ${game.gamePk} formatted home lineup:`, JSON.stringify(formatLineup(homeLineup)))
}
// ── Fantasy cards — runs independently of narrative regeneration ──────
// ── Fantasy cards — runs independently of narrative regeneration ──────
console.log(`Game ${game.gamePk}: shouldGenerateFantasy=${shouldGenerateFantasy}, existing=${!!existing?.fantasy_cards}`)
if (shouldGenerateFantasy) {
  const generatedFantasy = await generateFantasyCards({
    home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name,
    home_abbr: game.teams.home.team.abbreviation ?? 'HOME',
    away_abbr: game.teams.away.team.abbreviation ?? 'AWAY',
    edge_score: result.edge_score,
    confidence_tier: result.confidence_tier,
    predicted_winner: result.predicted_winner,
    venue_name: game.venue?.name ?? '',
    lineups_confirmed: lineupsConfirmed,
    components_raw: result.components_raw,
    home_lineup: lineupsConfirmed && homeLineup ? formatLineup(homeLineup) : undefined,
    away_lineup: lineupsConfirmed && awayLineup ? formatLineup(awayLineup) : undefined,
  })

  if (generatedFantasy) {
    fantasy_cards = generatedFantasy
    console.log(`Game ${game.gamePk}: fantasy cards generated — lineups_used=${generatedFantasy.lineups_used}`)
  } else {
    console.error(`Game ${game.gamePk}: fantasy cards generation failed`)
  }
}

// ── Save to DB ────────────────────────────────────────────────────────
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
  narrative_pro,
  home_stories,
  away_stories,
  contrarian,
  pro_takeaways,
  fantasy_cards
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