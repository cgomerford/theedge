// One-off: builds public.park_index from MLB Stats API final scores, last 3 seasons.
// Index = 100 * (runs per game, both teams, in the club's HOME games) / (same, in its ROAD games).
// Single writer of park_index. Run: npx tsx scripts/compute-park-index.ts
// Prints a 5-row sample and waits 8 seconds (Ctrl-C to abort) before upserting.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('Missing Supabase env vars'); process.exit(1) }

const YEAR = new Date().getFullYear()
const SEASONS = [YEAR - 2, YEAR - 1, YEAR]
type Acc = { venueId: number; homeRuns: number; homeGames: number; roadRuns: number; roadGames: number; venueGames: Map<number, number> }

async function main() {
  const teams = new Map<number, Acc>() // team id -> totals
  for (const season of SEASONS) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}&gameType=R`)
    if (!res.ok) throw new Error(`schedule ${season}: ${res.status}`)
    const json = await res.json() as { dates: { games: { status: { abstractGameState: string }; venue?: { id: number }; teams: { home: { score?: number; team: { id: number } }; away: { score?: number; team: { id: number } } } }[] }[] }
    for (const d of json.dates ?? []) for (const g of d.games) {
      if (g.status.abstractGameState !== 'Final') continue
      const h = g.teams.home, a = g.teams.away
      if (h.score == null || a.score == null || !g.venue?.id) continue
      const runs = h.score + a.score
      const home = teams.get(h.team.id) ?? { venueId: g.venue.id, homeRuns: 0, homeGames: 0, roadRuns: 0, roadGames: 0, venueGames: new Map() }
      home.venueGames.set(g.venue.id, (home.venueGames.get(g.venue.id) ?? 0) + 1)
      home.venueId = [...home.venueGames.entries()].sort((a, b) => b[1] - a[1])[0][0] // the club's main home park, not a one-off neutral-site game
      home.homeRuns += runs; home.homeGames += 1
      teams.set(h.team.id, home)
      const road = teams.get(a.team.id) ?? { venueId: 0, homeRuns: 0, homeGames: 0, roadRuns: 0, roadGames: 0, venueGames: new Map() }
      road.roadRuns += runs; road.roadGames += 1
      teams.set(a.team.id, road)
    }
  }
  const rows = [...teams.entries()].filter(([, t]) => t.homeGames > 0 && t.roadGames > 0 && t.venueId).map(([teamId, t]) => {
    const homeRpg = t.homeRuns / t.homeGames, roadRpg = t.roadRuns / t.roadGames
    return { venue_id: t.venueId, team_id: teamId, seasons: `${SEASONS[0]}-${SEASONS[2]}`, home_rpg: +homeRpg.toFixed(3), road_rpg: +roadRpg.toFixed(3), index: Math.round((100 * homeRpg) / roadRpg), home_games: t.homeGames, road_games: t.roadGames, updated_at: new Date().toISOString() }
  })
  // Two clubs can share a latest home venue (e.g. a temporary park): keep the club with more home games there.
  const byVenue = new Map<number, (typeof rows)[number]>()
  for (const r of rows) {
    const cur = byVenue.get(r.venue_id)
    if (cur) console.log(`Duplicate venue ${r.venue_id}: teams ${cur.team_id} (${cur.home_games}) and ${r.team_id} (${r.home_games})`)
    if (!cur || r.home_games > cur.home_games) byVenue.set(r.venue_id, r)
  }
  rows.length = 0
  rows.push(...byVenue.values())
  console.log(`${rows.length} parks. Sample:`); console.table(rows.slice(0, 5))
  console.log('Upserting in 8 seconds. Ctrl-C to abort.')
  await new Promise(r => setTimeout(r, 8000))
  const { error } = await createClient(URL!, KEY!).from('park_index').upsert(rows, { onConflict: 'venue_id' })
  if (error) { console.error('[compute-park-index] Supabase error:', error.message); process.exit(1) }
  console.log('Done.')
}
main().catch(e => { console.error(e); process.exit(1) })
