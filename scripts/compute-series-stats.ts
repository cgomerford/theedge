import { createClient } from '@supabase/supabase-js'
import { getSeriesBattingStats } from '../src/lib/series-stats'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function main() {
  const { data: cachedSeries } = await supabase
    .from('series_games_cache')
    .select('*')

  if (!cachedSeries || cachedSeries.length === 0) {
    console.log('No cached series found — run compute-series-games.ts first.')
    return
  }

  const rows: any[] = []
  for (const series of cachedSeries) {
    const finishedGamePks = (series.series_games ?? [])
      .filter((g: any) => g.isFinal)
      .map((g: any) => g.gamePk)

    if (finishedGamePks.length === 0) continue

    const homeStats = await getSeriesBattingStats(finishedGamePks, series.home_team_id)
    const awayStats = await getSeriesBattingStats(finishedGamePks, series.away_team_id)

    rows.push(
      { tonight_game_pk: series.tonight_game_pk, team_id: series.home_team_id, batting_lines: homeStats },
      { tonight_game_pk: series.tonight_game_pk, team_id: series.away_team_id, batting_lines: awayStats },
    )
  }

  console.log(`${rows.length} team-series rows. Sample:`, rows[0])
  console.log('Upserting. Ctrl+C within 5s to abort.')
  await new Promise(r => setTimeout(r, 5000))

  const { error } = await supabase.from('series_batting_stats').upsert(rows, { onConflict: 'tonight_game_pk,team_id' })
  if (error) console.error('Upsert failed:', error.message)
  else console.log('Done.')
}

main()