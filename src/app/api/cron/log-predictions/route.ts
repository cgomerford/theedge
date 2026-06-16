export const maxDuration = 800

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

const NARRATIVE_REGEN_THRESHOLD = 15

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < tasks.length; i += limit) {
    const chunk = tasks.slice(i, i + limit)
    const chunkResults = await Promise.all(chunk.map(t => t()))
    results.push(...chunkResults)
  }
  return results
}

export const dynamic   = 'force-dynamic'
export const revalidate = 0

function formatLineup(players: any[]): Array<{ order: number; name: string; position: string }> {
  return players
    .slice(0, 9)
    .map((p, index) => ({
      order:    index + 1,
      name:     p.fullName ?? 'Unknown',
      position: p.primaryPosition?.abbreviation ?? '?',
    }))
    .slice(0, 5)
}

export async function GET(request: Request) {
  const authHeader  = request.headers.get('authorization')
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.EDGE_CRON_AUTH,
  ].filter(Boolean)

  const isValid = validSecrets.some(secret => authHeader === `Bearer ${secret}`)

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url_date = new URL(request.url).searchParams.get('date')
    const today    = url_date ?? new Date().toISOString().split('T')[0]

    const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,venue,lineups`
    const res  = await fetch(url)
    const data = await res.json()

    const games = data.dates?.[0]?.games ?? []
    console.log(`Found ${games.length} games for ${today}`)

 let predictions_logged    = 0
    let predictions_skipped   = 0
    let narratives_regenerated = 0
    let narratives_kept       = 0
    const errors: string[]    = []

   const tasks = games.map((game: any) => async () => {
      try {
      if (!game.teams?.home?.team?.id || !game.teams?.away?.team?.id) {
          predictions_skipped++
          return
        }

        if (game.status?.abstractGameState === 'Final') {
          predictions_skipped++
          return
        }

        const result = await calculateEdgeScore({
          home_team_id:    game.teams.home.team.id,
          away_team_id:    game.teams.away.team.id,
          home_pitcher_id: game.teams.home.probablePitcher?.id ?? null,
          away_pitcher_id: game.teams.away.probablePitcher?.id ?? null,
          venue_name:      game.venue?.name ?? '',
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

        const { data: existing } = await supa
          .from('edge_predictions')
          .select('edge_score, summary, story_lead, narrative, narrative_pro, lineups_confirmed, home_stories, away_stories, contrarian, pro_takeaways, fantasy_cards')
          .eq('game_pk', game.gamePk)
          .single()

      const forceRegen = new URL(request.url).searchParams.get('force') === 'true'
const hasExistingNarrative = !forceRegen && !!(existing?.summary && existing?.narrative)
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

        let summary:       string | null = existing?.summary      ?? null
        let story_lead:    string | null = existing?.story_lead   ?? null
        let narrative:     string | null = existing?.narrative    ?? null
        let narrative_pro: string | null = existing?.narrative_pro ?? null
        let home_stories:  any           = existing?.home_stories  ?? null
        let away_stories:  any           = existing?.away_stories  ?? null
        let contrarian:    string | null = existing?.contrarian   ?? null
        let pro_takeaways: any           = existing?.pro_takeaways ?? null
        let fantasy_cards: FantasyCards | null = existing?.fantasy_cards ?? null

        const shouldGenerateFantasy =
          !existing?.fantasy_cards ||
          (!existing?.fantasy_cards?.lineups_used && lineupsConfirmed)

        console.log(
          `Game ${game.gamePk}: shouldRegenerate=${shouldRegenerate}, ` +
          `locked=${narrativeLocked}, hasExisting=${hasExistingNarrative}, ` +
          `scoreSwing=${scoreSwing.toFixed(1)}, lineupsConfirmed=${lineupsConfirmed}`
        )

        // ── Narrative regeneration ────────────────────────────────────
        if (shouldRegenerate) {
         // ── Fetch H2H pitcher data ────────────────────────────────
          const homePitcherId = game.teams.home.probablePitcher?.id ?? null
          const awayPitcherId = game.teams.away.probablePitcher?.id ?? null
          const awayTeamId = game.teams.away.team.id
          const homeTeamId = game.teams.home.team.id

          const [homeH2H, awayH2H, homePlatoon, awayPlatoon] = await Promise.all([
            homePitcherId ? supa
              .from('pitcher_h2h')
              .select('wins,losses,era,games,innings_pitched')
              .eq('player_id', homePitcherId)
              .eq('opponent_team_id', awayTeamId)
              .eq('season', 9999)
              .single()
              .then(r => r.data ?? null, () => null)
              : Promise.resolve(null),
            awayPitcherId ? supa
              .from('pitcher_h2h')
              .select('wins,losses,era,games,innings_pitched')
              .eq('player_id', awayPitcherId)
              .eq('opponent_team_id', homeTeamId)
              .eq('season', 9999)
              .single()
              .then(r => r.data ?? null, () => null)
              : Promise.resolve(null),
            supa
              .from('team_platoon_splits')
              .select('vs_lhp_ops,vs_rhp_ops,vs_lhp_avg,vs_rhp_avg')
              .eq('team_id', homeTeamId)
              .eq('season', 2026)
              .single()
              .then(r => r.data ?? null, () => null),
            supa
              .from('team_platoon_splits')
              .select('vs_lhp_ops,vs_rhp_ops,vs_lhp_avg,vs_rhp_avg')
              .eq('team_id', awayTeamId)
              .eq('season', 2026)
              .single()
              .then(r => r.data ?? null, () => null),
          ])

          // ── Derive platoon context strings ────────────────────────
          const homePitcherHand = result.components_raw?.home_pitcher?.throws ?? null
          const awayPitcherHand = result.components_raw?.away_pitcher?.throws ?? null

          const awayVsLhp = awayPlatoon?.vs_lhp_ops
            ? `${awayPlatoon.vs_lhp_ops} OPS vs LHP`
            : null
          const awayVsRhp = awayPlatoon?.vs_rhp_ops
            ? `${awayPlatoon.vs_rhp_ops} OPS vs RHP`
            : null
          const homeVsLhp = homePlatoon?.vs_lhp_ops
            ? `${homePlatoon.vs_lhp_ops} OPS vs LHP`
            : null
          const homeVsRhp = homePlatoon?.vs_rhp_ops
            ? `${homePlatoon.vs_rhp_ops} OPS vs RHP`
            : null

          // ── H2H record strings ────────────────────────────────────
          const homeH2HRecord = homeH2H?.games
            ? `${homeH2H.wins}-${homeH2H.losses} in ${homeH2H.games}G`
            : null
          const homeH2HEra = homeH2H?.era
            ? String(Number(homeH2H.era).toFixed(2))
            : null
          const awayH2HRecord = awayH2H?.games
            ? `${awayH2H.wins}-${awayH2H.losses} in ${awayH2H.games}G`
            : null
          const awayH2HEra = awayH2H?.era
            ? String(Number(awayH2H.era).toFixed(2))
            : null

          const narrativeInputsBase = {
            home_team:        game.teams.home.team.name,
            away_team:        game.teams.away.team.name,
            edge_score:       result.edge_score,
            predicted_winner: result.predicted_winner,
            confidence_tier:  result.confidence_tier,
            components:       result.components,
            components_raw:   result.components_raw,
            venue_name:       game.venue?.name ?? '',
            streaks,
            // H2H pitcher history
            home_pitcher_vs_opponent_record: homeH2HRecord,
            home_pitcher_vs_opponent_era:    homeH2HEra,
            away_pitcher_vs_opponent_record: awayH2HRecord,
            away_pitcher_vs_opponent_era:    awayH2HEra,
            // Platoon splits
            away_vs_lhp_record: homePitcherHand === 'L' ? awayVsLhp : null,
            away_vs_rhp_record: homePitcherHand === 'R' ? awayVsRhp : null,
            home_vs_lhp_record: awayPitcherHand === 'L' ? homeVsLhp : null,
            home_vs_rhp_record: awayPitcherHand === 'R' ? homeVsRhp : null,
          }

         const generated = await generateNarrative(narrativeInputsBase)

if (generated) {
  summary       = generated.summary
  story_lead    = generated.story_lead
  narrative     = generated.narrative
  narrative_pro = generated.narrative_pro
  home_stories  = generated.home_stories
  away_stories  = generated.away_stories
  contrarian    = generated.contrarian
  pro_takeaways = generated.pro_takeaways
  narratives_regenerated++
  console.log(`Game ${game.gamePk}: narrative generated (cost $${generated.cost_usd.toFixed(4)})`)
}
        } else {
          narratives_kept++
        }

        // ── Fantasy cards ─────────────────────────────────────────────
        console.log(`Game ${game.gamePk}: shouldGenerateFantasy=${shouldGenerateFantasy}, existing=${!!existing?.fantasy_cards}`)

        if (shouldGenerateFantasy) {
          if (lineupsConfirmed && homeLineup) {
            console.log(`Game ${game.gamePk} passing to LLM:`, JSON.stringify(formatLineup(homeLineup)))
          }

          const generatedFantasy = await generateFantasyCards({
            home_team:        game.teams.home.team.name,
            away_team:        game.teams.away.team.name,
            home_abbr:        game.teams.home.team.abbreviation ?? 'HOME',
            away_abbr:        game.teams.away.team.abbreviation ?? 'AWAY',
            edge_score:       result.edge_score,
            confidence_tier:  result.confidence_tier,
            predicted_winner: result.predicted_winner,
            venue_name:       game.venue?.name ?? '',
            lineups_confirmed: lineupsConfirmed,
            components_raw:   result.components_raw,
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

        // ── Save to DB ────────────────────────────────────────────────
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
          fantasy_cards,
        )

   predictions_logged++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`Game ${game.gamePk}: ${msg}`)
      }
    })

    await runWithConcurrency(tasks, 5)

    return NextResponse.json({
      success: true,
      games_found:            games.length,
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