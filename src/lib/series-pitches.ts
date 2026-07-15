// Pitch-level data for one batter across a date window — confirmed working
// endpoint (2026-07-13), first per-pitch data source in this codebase.
// Everything else touching Statcast so far is season-aggregate leaderboards.
//
// game_date_gt/game_date_lt are EXCLUSIVE per the confirmed URL params —
// widened by one day on each side so boundary-date games aren't dropped.

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

export type PitchRecord = {
  pitchType: string
  pitchName: string
  plateX: number | null
  plateZ: number | null
  description: string
  gameDate: string
  szTop: number | null
  szBot: number | null
  balls: number | null
  strikes: number | null
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export async function getBatterPitchesInWindow(
  batterId: number, startDate: string, endDate: string
): Promise<PitchRecord[]> {
  const gt = shiftDate(startDate, -1)
  const lt = shiftDate(endDate, 1)
  // Confirmed working 2026-07-13 — hfSea (season) alone returns 0 rows even
  // for real, active players. game_date_gt/game_date_lt are REQUIRED for
  // Savant to execute an actual search rather than an empty result set.
  // Full param set matches what Savant's own search UI generates, verified
  // via curl -i showing 21 real data rows (not just the header line).
  const url = `https://baseballsavant.mlb.com/statcast_search/csv?hfGT=R%7C&hfSea=${new Date(startDate).getFullYear()}%7C&player_type=batter&batters_lookup%5B%5D=${batterId}&game_date_gt=${gt}&game_date_lt=${lt}&group_by=name&min_pitches=0&min_results=0&min_pas=0&sort_col=pitches&sort_order=desc&type=details&minors=false&wbc=false&csv=true`
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })
    if (!res.ok) {
      console.error(`[series-pitches] fetch failed: ${res.status}`)
      return []
    }
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const idx = (key: string) => headers.indexOf(key)
    const numAt = (cells: string[], key: string): number | null => {
      const v = parseFloat(cells[idx(key)])
      return isNaN(v) ? null : v
    }

    const rows: PitchRecord[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]).map(c => c.replace(/"/g, ''))
      rows.push({
        pitchType: cells[idx('pitch_type')] ?? '',
        pitchName: cells[idx('pitch_name')] ?? cells[idx('pitch_type')] ?? '—',
        plateX: numAt(cells, 'plate_x'),
        plateZ: numAt(cells, 'plate_z'),
        description: cells[idx('description')] ?? '',
        gameDate: cells[idx('game_date')] ?? '',
        szTop: numAt(cells, 'sz_top'),
        szBot: numAt(cells, 'sz_bot'),
        balls: numAt(cells, 'balls'),
        strikes: numAt(cells, 'strikes'),
      })
    }
    return rows.filter(r => r.plateX !== null && r.plateZ !== null)
  } catch (err) {
    console.error('[series-pitches] fetch threw:', err)
    return []
  }
}