import { calculateEdgeScore } from '../src/lib/edge'
import { generateNarrative } from '../src/lib/narrative'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

async function main() {
  // Get tonight's games
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher,venue`
  const res = await fetch(url)
  const data = await res.json()
  
  const games = data.dates?.[0]?.games ?? []
  const playable = games.filter((g: any) => 
    g.teams?.home?.probablePitcher?.id && 
    g.teams?.away?.probablePitcher?.id
  )

  console.log(`Testing narrative on ${Math.min(3, playable.length)} games...\n`)

  for (let i = 0; i < Math.min(3, playable.length); i++) {
    const game = playable[i]
    
    console.log(`==========================================`)
    console.log(`${game.teams.away.team.name} @ ${game.teams.home.team.name}`)
    console.log(`==========================================`)

    // Calculate Edge Score
    const edgeResult = await calculateEdgeScore({
      home_team_id: game.teams.home.team.id,
      away_team_id: game.teams.away.team.id,
      home_pitcher_id: game.teams.home.probablePitcher?.id ?? null,
      away_pitcher_id: game.teams.away.probablePitcher?.id ?? null,
      venue_name: game.venue.name,
    })

    console.log(`Edge: ${edgeResult.edge_score >= 0 ? '+' : ''}${edgeResult.edge_score} (${edgeResult.confidence_tier})`)
    console.log(`Predicted: ${edgeResult.predicted_winner === 'home' ? game.teams.home.team.name : game.teams.away.team.name}\n`)

    // Generate narrative
    const narrative = await generateNarrative({
      home_team: game.teams.home.team.name,
      away_team: game.teams.away.team.name,
      edge_score: edgeResult.edge_score,
      predicted_winner: edgeResult.predicted_winner,
      confidence_tier: edgeResult.confidence_tier,
      components: edgeResult.components,
      components_raw: edgeResult.components_raw,
      venue_name: game.venue.name,
      
    })

    if (!narrative) {
      console.log('FAILED to generate narrative\n')
      continue
    }

    console.log(`SUMMARY (${narrative.summary.length} chars):`)
    console.log(`  "${narrative.summary}"\n`)
    console.log(`NARRATIVE (${narrative.narrative.length} chars):`)
    console.log(`  ${narrative.narrative}\n`)
    console.log(`Cost: $${narrative.cost_usd.toFixed(6)}\n`)
  }
}

main().catch(console.error)