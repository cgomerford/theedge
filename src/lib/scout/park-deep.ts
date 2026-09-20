// src/lib/scout/park-deep.ts
//
// Scout §8 (Park factors deep) — Baseball Savant Statcast Park Factors for one
// venue: runs / HR / wOBA / hard-hit / 2B / 3B / K / BB indexes (100 = league
// average, 3-year rolling so a single hot month doesn't move it), split by
// session — All / Day / Night / Roof closed — and by batter hand.
//
// Savant's park-factor CSV export is not available, but the page embeds the full
// table as `var data = [...]` in its HTML; that is what is parsed here. Each page
// is ~120KB, so Next's fetch cache holds it (12h). Savant venue_id is the MLB
// venue id, so the venue is matched by id, falling back to name.

const SAVANT = 'https://baseballsavant.mlb.com/leaderboard/statcast-park-factors'

export type Session = 'All' | 'Day' | 'Night' | 'Roof Closed'

export type ParkIndexes = {
  pa: number
  runs: number; hr: number; woba: number; hardhit: number
  h1b: number; h2b: number; h3b: number; so: number; bb: number
}

export type ParkDeep = {
  venueName: string
  years: string
  bySession: Partial<Record<Session, ParkIndexes>>
  byHand: { L: ParkIndexes | null; R: ParkIndexes | null }
  rank: { runs: number; hr: number; of: number } | null
}

type RawRow = Record<string, string>

async function fetchTable(condition: Session, batSide: '' | 'L' | 'R'): Promise<RawRow[]> {
  const url = `${SAVANT}?type=year&year=${new Date().getFullYear()}&batSide=${batSide}&stat=index_wOBA&condition=${encodeURIComponent(condition)}&rolling=3&parks=mlb`
  try {
    const res = await fetch(url, { next: { revalidate: 43200 }, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)' }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []
    const html = await res.text()
    const m = html.match(/var data = (\[[\s\S]*?\]);/)
    return m ? (JSON.parse(m[1]) as RawRow[]) : []
  } catch { return [] }
}

const n = (v: string | undefined) => (v == null || v === '' ? 0 : Number(v))
const toIndexes = (r: RawRow): ParkIndexes => ({
  pa: n(r.n_pa), runs: n(r.index_runs), hr: n(r.index_hr), woba: n(r.index_woba), hardhit: n(r.index_hardhit),
  h1b: n(r.index_1b), h2b: n(r.index_2b), h3b: n(r.index_3b), so: n(r.index_so), bb: n(r.index_bb),
})

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function getParkDeep(venueId: number | null, venueName: string): Promise<ParkDeep | null> {
  const sessions: Session[] = ['All', 'Day', 'Night', 'Roof Closed']
  const [tables, left, right] = await Promise.all([
    Promise.all(sessions.map((s) => fetchTable(s, ''))),
    fetchTable('All', 'L'),
    fetchTable('All', 'R'),
  ])
  const find = (rows: RawRow[]) => rows.find((r) => (venueId != null && Number(r.venue_id) === venueId) || norm(r.venue_name) === norm(venueName))
  const all = find(tables[0])
  if (!all) return null

  const bySession: ParkDeep['bySession'] = {}
  sessions.forEach((s, i) => { const r = find(tables[i]); if (r) bySession[s] = toIndexes(r) })
  const lr = find(left), rr = find(right)

  const runsRank = [...tables[0]].sort((a, b) => n(b.index_runs) - n(a.index_runs)).findIndex((r) => r.venue_id === all.venue_id) + 1
  const hrRank = [...tables[0]].sort((a, b) => n(b.index_hr) - n(a.index_hr)).findIndex((r) => r.venue_id === all.venue_id) + 1
  return {
    venueName: all.venue_name,
    years: `${Number(all.key_year) - Number(all.key_num_years_rolling) + 1}–${all.key_year}`,
    bySession, byHand: { L: lr ? toIndexes(lr) : null, R: rr ? toIndexes(rr) : null },
    rank: { runs: runsRank, hr: hrRank, of: tables[0].length },
  }
}
