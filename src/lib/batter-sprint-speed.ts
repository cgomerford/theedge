// Sprint Speed — confirmed real endpoint, header row verified earlier this
// session: "player_id","team_id","team","position","age",
// "competitive_runs","bolts","hp_to_1b","sprint_speed". Never wired into
// batter-stats.ts (which hardcodes sprint_speed: null) until now.

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

export async function getBatterSprintSpeed(playerId: number, season: number): Promise<number | null> {
  const url = `https://baseballsavant.mlb.com/leaderboard/sprint_speed?year=${season}&position=&team=&csv=true`
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const idIdx = headers.indexOf('player_id')
    const speedIdx = headers.indexOf('sprint_speed')
    if (idIdx === -1 || speedIdx === -1) return null
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]).map(c => c.replace(/"/g, ''))
      if (Number(cells[idIdx]) === playerId) {
        const v = parseFloat(cells[speedIdx])
        return isNaN(v) ? null : v
      }
    }
    return null
  } catch (err) {
    console.error('[batter-sprint-speed] fetch failed:', err)
    return null
  }
}