// One-off: builds public.park_hit_map from Baseball Savant hit locations (single, double, triple, home run), last 3 seasons.
// Every hit hit AT the park counts, by either team. Needs public.park_index to be filled first (it supplies venue and team ids).
// Single writer of park_hit_map. Run: npx tsx scripts/compute-park-hits.ts
// Prints a 5-row sample and waits 8 seconds (Ctrl-C to abort) before upserting.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
if (!SB_URL || !KEY) { console.error('Missing Supabase env vars'); process.exit(1) }

const YEAR = new Date().getFullYear()
const SEASONS = [YEAR - 2, YEAR - 1, YEAR]
const KIND: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out
}

async function main() {
  const supa = createClient(SB_URL!, KEY!)
  const { data: parks, error } = await supa.from('park_index').select('venue_id, team_id')
  if (error || !parks?.length) { console.error('[compute-park-hits] park_index empty or unreadable:', error?.message); process.exit(1) }
  const teamsRes = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1')
  const abbr = new Map<number, string>(((await teamsRes.json()).teams as { id: number; abbreviation: string }[]).map(t => [t.id, t.abbreviation]))

  const rows: { venue_id: number; seasons: string; n_hits: number; through: string; points: number[]; updated_at: string }[] = []
  for (const p of parks as { venue_id: number; team_id: number }[]) {
    const team = abbr.get(Number(p.team_id))
    if (!team) { console.log(`No abbreviation for team ${p.team_id}, skipping venue ${p.venue_id}`); continue }
    const points: number[] = []; let through = ''
    // Savant filters by the BATTER's club: the home club's own hits (hfTeam) plus the visitors' hits against it (hfOpponent + Away).
    // Rows are then kept only when the game was played at this club's park.
    const base = (season: number) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea=${season}%7C&hfAB=single%7Cdouble%7Ctriple%7Chome%5C\.%5C\.run%7C&player_type=batter&type=details&min_pitches=0&min_results=0&min_pas=0`
    for (const season of SEASONS) {
      for (const filter of [`&hfTeam=${team}%7C`, `&hfOpponent=${team}%7C&home_road=Away`]) {
        const res: Response = await fetch(base(season) + filter, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!res.ok) { console.error(`  ${team} ${season}: HTTP ${res.status}`); continue }
        const lines: string[] = (await res.text()).replace(/^\uFEFF/, '').trim().split('\n')
        const h = parseLine(lines[0]).map(s => s.replace(/"/g, '').toLowerCase())
        const ix = (k: string) => h.indexOf(k)
        const [iHome, iEv, iX, iY, iDate] = [ix('home_team'), ix('events'), ix('hc_x'), ix('hc_y'), ix('game_date')]
        for (let i = 1; i < lines.length; i++) {
          const c = parseLine(lines[i]).map(s => s.replace(/"/g, ''))
          if (c[iHome] !== team) continue                       // only games AT this park
          const kind = KIND[c[iEv]]; const hx = parseFloat(c[iX]); const hy = parseFloat(c[iY])
          if (!kind || !Number.isFinite(hx) || !Number.isFinite(hy)) continue
          points.push(Math.round((hx - 125.42) * 2.5), Math.round((198.27 - hy) * 2.5), kind)
          if (c[iDate] > through) through = c[iDate]
        }
        await sleep(1200)
      }
    }
    console.log(`${team}: ${points.length / 3} hits through ${through}`)
    if (points.length >= 300) rows.push({ venue_id: Number(p.venue_id), seasons: `${SEASONS[0]}-${SEASONS[2]}`, n_hits: points.length / 3, through, points, updated_at: new Date().toISOString() })
  }
  console.log(`${rows.length} parks. Sample:`); console.table(rows.slice(0, 5).map(r => ({ venue_id: r.venue_id, seasons: r.seasons, n_hits: r.n_hits, through: r.through, first_points: r.points.slice(0, 6).join(',') })))
  console.log('Upserting in 8 seconds. Ctrl-C to abort.')
  await sleep(8000)
  const { error: e2 } = await supa.from('park_hit_map').upsert(rows, { onConflict: 'venue_id' })
  if (e2) { console.error('[compute-park-hits] Supabase error:', e2.message); process.exit(1) }
  console.log('Done.')
}
main().catch(e => { console.error(e); process.exit(1) })
