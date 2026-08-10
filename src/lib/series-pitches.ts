// Pitch-level data for one batter across a set of specific games.
//
// 2026-08-09: added getBatterPitchesFromGames — replaces the Savant CSV
// search (getBatterPitchesInWindow, kept below for now in case anything
// else references it) for the series pitch-hover feature. Confirmed the
// Savant date-range search was returning header-only, zero-row responses
// for a real active player with real recent at-bats (Kyle Schwarber,
// verified against MLB's own boxscore for the same games) — same result
// for a brand-new window AND a mid-July window, same result with/without
// group_by=name, same result from curl and a real browser. Root cause on
// Savant's side never fully identified; moved to a source we can verify
// directly instead of chasing it further.
//
// This function pulls MLB's own live game feed for a SPECIFIC list of
// gamePks (the exact games of the series, no date-range ambiguity) and
// extracts every pitch thrown to the given batter. Confirmed against a
// live response 2026-08-09 — pitchData.coordinates.pX/pZ are the plate
// coordinates, pitchData.strikeZoneTop/strikeZoneBottom are per-pitch
// real strike zone bounds (better than Savant's sz_top/sz_bot even —
// this is the zone for THIS specific pitch, not just this batter's
// average), details.type.code/description give pitch type, and
// details.description gives the outcome — mapped to the same Savant-
// style snake_case strings PitchLocationChart.tsx's classifyDescription
// already expects, so that component needed zero changes.

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const MLB_API_LIVE = 'https://statsapi.mlb.com/api/v1.1'

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

// Normalizes MLB live-feed's human-readable pitch call descriptions into
// the same Savant-style snake_case strings PitchLocationChart.tsx's
// classifyDescription() already parses — so that component didn't need
// any changes when the data source moved.
function normalizeDescription(details: any): string {
  if (details?.isInPlay) return 'hit_into_play'
  const d: string = (details?.description ?? '').toLowerCase()
  if (d.includes('swinging strike')) return 'swinging_strike'
  if (d.includes('called strike')) return 'called_strike'
  if (d.includes('foul')) return 'foul'
  if (d.includes('hit by pitch')) return 'hit_by_pitch'
  if (d.includes('ball')) return 'ball'
  if (d.includes('pitchout')) return 'pitchout'
  // Fallback: turn whatever MLB called it into a snake_case string rather
  // than silently dropping it into an unlabeled bucket.
  return d.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other'
}

async function fetchGamePitchesForBatter(gamePk: number, batterId: number): Promise<PitchRecord[]> {
  try {
    const res = await fetch(`${MLB_API_LIVE}/game/${gamePk}/feed/live`, { cache: 'no-store' })
    if (!res.ok) {
      console.error(`[series-pitches] live feed fetch failed for game ${gamePk}: ${res.status}`)
      return []
    }
    const data = await res.json()
    const plays = data?.liveData?.plays?.allPlays ?? []
    const gameDate: string = data?.gameData?.datetime?.officialDate ?? ''

    const rows: PitchRecord[] = []
    for (const play of plays) {
      if (play?.matchup?.batter?.id !== batterId) continue
      for (const ev of play.playEvents ?? []) {
        if (!ev?.isPitch) continue
        const pd = ev.pitchData ?? {}
        const coords = pd.coordinates ?? {}
        const details = ev.details ?? {}
        const count = ev.count ?? {}
        rows.push({
          pitchType: details.type?.code ?? '',
          pitchName: details.type?.description ?? details.type?.code ?? '—',
          plateX: typeof coords.pX === 'number' ? coords.pX : null,
          plateZ: typeof coords.pZ === 'number' ? coords.pZ : null,
          description: normalizeDescription(details),
          gameDate,
          szTop: typeof pd.strikeZoneTop === 'number' ? pd.strikeZoneTop : null,
          szBot: typeof pd.strikeZoneBottom === 'number' ? pd.strikeZoneBottom : null,
          balls: typeof count.balls === 'number' ? count.balls : null,
          strikes: typeof count.strikes === 'number' ? count.strikes : null,
        })
      }
    }
    return rows
  } catch (err) {
    console.error(`[series-pitches] live feed fetch threw for game ${gamePk}:`, err)
    return []
  }
}

/**
 * Every pitch thrown to this batter across a specific set of games — the
 * real gamePks of the series, no date-range guessing. One bad game fetch
 * never kills the others (each game is caught independently above).
 */
export async function getBatterPitchesFromGames(gamePks: number[], batterId: number): Promise<PitchRecord[]> {
  if (gamePks.length === 0) return []
  const results = await Promise.all(gamePks.map(gamePk => fetchGamePitchesForBatter(gamePk, batterId)))
  return results.flat()
}

// ─────────────────────────────────────────────────────────────────────
// LEGACY — Savant CSV date-range search. Kept in case anything else in
// the codebase still imports getBatterPitchesInWindow, but confirmed
// 2026-08-09 to return header-only/zero-row responses for a real player
// with real recent at-bats, on both a brand-new and a settled mid-July
// date range. Root cause not identified. Prefer getBatterPitchesFromGames
// above for any new work.
// ─────────────────────────────────────────────────────────────────────

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