// src/lib/abs-challenges.ts
//
// ABS (Automated Ball-Strike) Challenge System record, per team, for the
// 2026 season. Curl-verified against the live endpoint before writing
// this — GET /leaderboard/abs-challenges?...&csv=true returns real CSV
// with these confirmed columns (not assumed):
//   entity_name, team_abbr, level, n_challenges, n_overturns, n_confirms,
//   rate_overturns, n_challenges_against, n_overturns_against,
//   n_confirms_against, rate_overturns_against, ...(many more advanced
//   columns not used here)
//
// 2026-08-20 (later): confirmed the real value via Savant's own Network
// tab request, not another guess — 'catching-team' is correct. The UI
// dropdown label ("Fielding Team") doesn't match the API parameter
// string, which is why 'fielding-team' also crashed the same way
// 'pitching-team' did. Two curl-verified team-level categories now:
//   'batting-team'  — challenges initiated by this team's batters
//   'catching-team' — challenges initiated by this team's pitcher/catcher
// Both confirmed returning clean CSV with team names in entity_name,
// same column shape.

const SEASON = 2026

export type ABSChallengeRecord = {
  team_abbr: string
  season: number
  // Batter-initiated (challenging called strikes)
  batting_challenges: number
  batting_overturns: number
  batting_confirms: number
  batting_success_rate: number | null
  // Pitcher/catcher-initiated (challenging called balls) — CONFIRMED,
  // via challengeType=catching-team
  pitching_challenges: number
  pitching_overturns: number
  pitching_confirms: number
  pitching_success_rate: number | null
  // Combined, both directions
  total_challenges: number
  total_overturns: number
  total_success_rate: number | null
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

type RawRow = {
  team_abbr: string
  n_challenges: number
  n_overturns: number
  n_confirms: number
  rate_overturns: number | null
}

async function fetchLeaderboard(challengeType: 'batting-team' | 'catching-team'): Promise<RawRow[]> {
  const url = [
    'https://baseballsavant.mlb.com/leaderboard/abs-challenges',
    `?gameType=regular&year=${SEASON}&challengeType=${challengeType}`,
    '&level=mlb&minChal=0&minOppChal=0&sort=n_challenges&sortDir=desc&page=0&pageSize=50&csv=true',
  ].join('')

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 }, // 6h — same cadence as other season-aggregate Savant pulls
    })
    if (!res.ok) return []
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
    const idx = (name: string) => headers.indexOf(name)
    const abbrIdx = idx('team_abbr')
    const nChalIdx = idx('n_challenges')
    const nOverIdx = idx('n_overturns')
    const nConfIdx = idx('n_confirms')
    const rateIdx = idx('rate_overturns')

    if (abbrIdx === -1 || nChalIdx === -1) return []

    const rows: RawRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
      const abbr = cells[abbrIdx]
      if (!abbr) continue
      rows.push({
        team_abbr: abbr,
        n_challenges: Number(cells[nChalIdx] ?? 0) || 0,
        n_overturns: Number(cells[nOverIdx] ?? 0) || 0,
        n_confirms: Number(cells[nConfIdx] ?? 0) || 0,
        rate_overturns: cells[rateIdx] ? Number(cells[rateIdx]) : null,
      })
    }
    return rows
  } catch (err) {
    console.error(`ABS leaderboard fetch failed (${challengeType}):`, err)
    return []
  }
}

export async function getABSChallengeRecord(teamAbbr: string): Promise<ABSChallengeRecord | null> {
  const [battingRows, catchingRows] = await Promise.all([
    fetchLeaderboard('batting-team'),
    fetchLeaderboard('catching-team'),
  ])

  const battingRow = battingRows.find(r => r.team_abbr === teamAbbr)
  const catchingRow = catchingRows.find(r => r.team_abbr === teamAbbr)

  if (!battingRow && !catchingRow) return null

  const battingChallenges = battingRow?.n_challenges ?? 0
  const battingOverturns = battingRow?.n_overturns ?? 0
  const pitchingChallenges = catchingRow?.n_challenges ?? 0
  const pitchingOverturns = catchingRow?.n_overturns ?? 0

  const totalChallenges = battingChallenges + pitchingChallenges
  const totalOverturns = battingOverturns + pitchingOverturns

  return {
    team_abbr: teamAbbr,
    season: SEASON,
    batting_challenges: battingChallenges,
    batting_overturns: battingOverturns,
    batting_confirms: battingRow?.n_confirms ?? 0,
    batting_success_rate: battingRow?.rate_overturns ?? null,
    pitching_challenges: pitchingChallenges,
    pitching_overturns: pitchingOverturns,
    pitching_confirms: catchingRow?.n_confirms ?? 0,
    pitching_success_rate: catchingRow?.rate_overturns ?? null,
    total_challenges: totalChallenges,
    total_overturns: totalOverturns,
    total_success_rate: totalChallenges > 0 ? Math.round((totalOverturns / totalChallenges) * 1000) / 1000 : null,
  }
}