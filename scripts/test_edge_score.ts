/**
 * Quick test — calculate Edge Score for a real game tonight.
 * Run with: npx tsx scripts/test_edge_score.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { calculateEdgeScore } from '../src/lib/edge'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

async function main() {
  // Get tonight's first game
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,venue`
  
  console.log(`Fetching games for ${today}...`)
  const res = await fetch(url)
  const data = await res.json()
  
  const games = data.dates?.[0]?.games ?? []
  if (games.length === 0) {
    console.log('No games scheduled today')
    return
  }
  
  // Pick first game with both probable pitchers
  const game = games.find((g: any) => 
    g.teams?.home?.probablePitcher?.id && 
    g.teams?.away?.probablePitcher?.id
  ) ?? games[0]
  
  console.log(`\nTest game: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`)
  console.log(`Venue: ${game.venue.name}`)
  console.log(`Pitchers: ${game.teams.away.probablePitcher?.fullName ?? 'TBD'} vs ${game.teams.home.probablePitcher?.fullName ?? 'TBD'}\n`)
  
  // Calculate Edge Score
  const result = await calculateEdgeScore({
    home_team_id: game.teams.home.team.id,
    away_team_id: game.teams.away.team.id,
    home_pitcher_id: game.teams.home.probablePitcher?.id ?? null,
    away_pitcher_id: game.teams.away.probablePitcher?.id ?? null,
    venue_name: game.venue.name,
  })
  
  console.log('============================================')
  console.log('EDGE SCORE RESULT')
  console.log('============================================')
  console.log(`Edge Score: ${result.edge_score > 0 ? '+' : ''}${result.edge_score}`)
  console.log(`Predicted winner: ${result.predicted_winner === 'home' ? game.teams.home.team.name : game.teams.away.team.name}`)
  console.log(`Confidence: ${result.confidence_tier}`)
  console.log('\nComponent breakdown:')
  for (const [key, value] of Object.entries(result.components)) {
    const sign = (value as number) > 0 ? '+' : ''
    console.log(`  ${key.padEnd(20)} ${sign}${value}`)
  }
  console.log('\nRaw inputs (for transparency):')
  console.log('  Home pitcher:', result.components_raw.home_pitcher 
    ? `${result.components_raw.home_pitcher.player_name} (FIP: ${result.components_raw.home_pitcher.fip}, ERA: ${result.components_raw.home_pitcher.era})` 
    : 'No data')
  console.log('  Away pitcher:', result.components_raw.away_pitcher 
    ? `${result.components_raw.away_pitcher.player_name} (FIP: ${result.components_raw.away_pitcher.fip}, ERA: ${result.components_raw.away_pitcher.era})` 
    : 'No data')
  console.log('  Home team:', result.components_raw.home_team 
    ? `R/G L30: ${result.components_raw.home_team.runs_per_game_l30}, BP ERA: ${result.components_raw.home_team.bullpen_era}` 
    : 'No data')
  console.log('  Away team:', result.components_raw.away_team 
    ? `R/G L30: ${result.components_raw.away_team.runs_per_game_l30}, BP ERA: ${result.components_raw.away_team.bullpen_era}` 
    : 'No data')
  console.log('  Park:', result.components_raw.park.venue_name, `(run factor: ${result.components_raw.park.run_factor})`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})