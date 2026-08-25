import { createClient } from '@supabase/supabase-js'

const SEASON = new Date().getFullYear()
const MLB_API = 'https://statsapi.mlb.com/api/v1'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function main() {
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/standings?leagueId=103,104&season=${SEASON}&date=${today}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`Standings fetch failed: ${res.status}`)
    process.exit(1)
  }
  const data = await res.json()

  const rows: any[] = []
  for (const record of data.records ?? []) {
    const divisionName = record.division?.name ?? '—'
    const leagueId = record.league?.id ?? 0
    for (const t of record.teamRecords ?? []) {
      if (!t.team?.id) continue
      rows.push({
        team_id: t.team.id, season: SEASON, name: t.team.name ?? '—',
        abbreviation: t.team.abbreviation ?? '', wins: t.leagueRecord?.wins ?? 0,
        losses: t.leagueRecord?.losses ?? 0, division_name: divisionName, league_id: leagueId,
        division_rank: parseInt(t.divisionRank ?? '0'), games_back: t.gamesBack ?? '-',
        wild_card_rank: t.wildCardRank ? parseInt(t.wildCardRank) : null,
        wild_card_games_back: t.wildCardGamesBack ?? null, streak: t.streak?.streakCode ?? '',
      })
    }
  }

  console.log(`${rows.length} team rows. Sample:`, rows[0])
  console.log('Upserting. Ctrl+C within 5s to abort.')
  await new Promise(r => setTimeout(r, 5000))

  const { error } = await supabase.from('mlb_standings').upsert(rows, { onConflict: 'team_id,season' })
  if (error) console.error('Upsert failed:', error.message)
  else console.log('Done.')
}

main()