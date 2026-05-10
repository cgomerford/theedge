import { getProjectedLineup } from '../src/lib/lineups'

async function main() {
  console.log('Script started')
  
  const today = new Date().toISOString().split('T')[0]
  console.log(`Date: ${today}`)
  
  console.log(`Testing lineup fetch for Phillies on ${today}...\n`)
  
  const start = Date.now()
  const lineup = await getProjectedLineup(143, today)
  const elapsed = Math.round((Date.now() - start) / 1000)
  
  console.log(`Fetched in ${elapsed}s`)
  console.log(`Source: ${lineup.source}`)
  console.log(`Game date used: ${lineup.game_date_used}`)
  console.log(`Game PK used: ${lineup.game_pk_used}`)
  console.log(`\n=== BATTING ORDER ===`)
  
  for (const batter of lineup.batters) {
    const avg = batter.season_avg !== null ? batter.season_avg.toFixed(3) : '---'
    const ops = batter.season_ops !== null ? batter.season_ops.toFixed(3) : '---'
    console.log(`${batter.batting_order}. ${batter.player_name.padEnd(25)} ${batter.position.padEnd(4)} AVG ${avg}  OPS ${ops}`)
  }
}

main()
  .then(() => {
    console.log('\n[done]')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[error]', err)
    process.exit(1)
  })