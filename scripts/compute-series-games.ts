import { createClient } from '@supabase/supabase-js'
import { getSeriesGames } from '../src/lib/series-games'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function main() {
  const today = new Date().toISOString().split('T')[0]
  const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${today}`)
  const data = await res.json()

  const todaysGames: { gamePk: number; homeId: number; awayId: number }[] = []
  for (const dateBlock of data.dates ?? []) {
    for (const g of dateBlock.games ?? []) {
      const homeId = g.teams?.home?.team?.id
      const awayId = g.teams?.away?.team?.id
      if (homeId && awayId) todaysGames.push({ gamePk: g.gamePk, homeId, awayId })
    }
  }

  console.log(`${todaysGames.length} games today. Sample:`, todaysGames[0])

  const rows: any[] = []
  for (const g of todaysGames) {
    const seriesGames = await getSeriesGames(g.homeId, g.awayId, today, g.gamePk)
    rows.push({
      tonight_game_pk: g.gamePk, home_team_id: g.homeId, away_team_id: g.awayId,
      game_date: today, series_games: seriesGames,
    })
  }

  console.log(`Upserting ${rows.length} rows. Ctrl+C within 5s to abort.`)
  await new Promise(r => setTimeout(r, 5000))

  const { error } = await supabase.from('series_games_cache').upsert(rows, { onConflict: 'tonight_game_pk' })
  if (error) console.error('Upsert failed:', error.message)
  else console.log('Done.')
}

main()