import { aggregateGameStreaks } from '../src/lib/streaks'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

async function main() {
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher`
  const res = await fetch(url)
  const data = await res.json()
  
  const games = data.dates?.[0]?.games ?? []
  const game = games.find((g: any) => 
    g.teams?.home?.probablePitcher?.id && 
    g.teams?.away?.probablePitcher?.id
  ) ?? games[0]

  if (!game) {
    console.log('No game found')
    return
  }

  console.log(`Test: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`)
  console.log('Fetching streaks (this takes 10-30 seconds)...\n')
  
  const start = Date.now()
  const streaks = await aggregateGameStreaks(
    game.teams.home.team.id,
    game.teams.away.team.id,
    game.teams.home.probablePitcher?.id ?? null,
    game.teams.home.probablePitcher?.fullName ?? null,
    game.teams.away.probablePitcher?.id ?? null,
    game.teams.away.probablePitcher?.fullName ?? null,
  )
  const elapsed = Math.round((Date.now() - start) / 1000)
  
  console.log(`Fetched in ${elapsed}s\n`)
  console.log('===== HOME PITCHER =====')
  console.log(streaks.home_pitcher)
  console.log('\n===== AWAY PITCHER =====')
  console.log(streaks.away_pitcher)
  console.log('\n===== HOME HOT BATTERS =====')
  streaks.home_hot_batters.forEach(b => console.log(`  ${b.player_name}: ${b.streak_label ?? 'hot'}`))
  console.log('\n===== HOME COLD BATTERS =====')
  streaks.home_cold_batters.forEach(b => console.log(`  ${b.player_name}: ${b.streak_label ?? 'cold'}`))
  console.log('\n===== AWAY HOT BATTERS =====')
  streaks.away_hot_batters.forEach(b => console.log(`  ${b.player_name}: ${b.streak_label ?? 'hot'}`))
  console.log('\n===== AWAY COLD BATTERS =====')
  streaks.away_cold_batters.forEach(b => console.log(`  ${b.player_name}: ${b.streak_label ?? 'cold'}`))
}

main().catch(console.error)