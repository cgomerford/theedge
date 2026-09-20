// src/lib/league-standard-stats.ts
//
// League-wide standard (non-Statcast) team stats for the homepage's
// "league shape" section — one bulk MLB Stats API call per group (hitting,
// pitching) returns ALL 30 teams' real season-to-date totals at once
// (curl-verified: /api/v1/teams/stats?stats=season&group=hitting returns
// 30 splits, each carrying team.id/team.name/stat), so this is 2 requests
// total, not 30 — the same bulk-over-per-team lesson as
// getTopBattersByPlateAppearances in batter-stats.ts.
//
// Deliberately "standard" stats only (AVG/HR/RBI/OPS/SB, ERA/W/SO/WHIP/SV)
// — the same categories MLBHomepage.tsx's own BATTING_TABS/PITCHING_TABS
// already use — not Statcast/advanced metrics, which live in the Deep
// Dives section instead.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type LeagueTeamStatRow = {
  teamId: number
  teamName: string
  avg: number
  hr: number
  rbi: number
  ops: number
  sb: number
  era: number
  wins: number
  so: number
  whip: number
  saves: number
}

export const STANDARD_STAT_DEFS = [
  { key: 'avg', label: 'Batting Average', group: 'Batting', higherIsBetter: true, fmt: (v: number) => v.toFixed(3).replace(/^0/, '') },
  { key: 'hr', label: 'Home Runs', group: 'Batting', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
  { key: 'rbi', label: 'RBI', group: 'Batting', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
  { key: 'ops', label: 'OPS', group: 'Batting', higherIsBetter: true, fmt: (v: number) => v.toFixed(3).replace(/^0/, '') },
  { key: 'sb', label: 'Stolen Bases', group: 'Batting', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
  { key: 'era', label: 'ERA', group: 'Pitching', higherIsBetter: false, fmt: (v: number) => v.toFixed(2) },
  { key: 'wins', label: 'Wins', group: 'Pitching', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
  { key: 'so', label: 'Strikeouts', group: 'Pitching', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
  { key: 'whip', label: 'WHIP', group: 'Pitching', higherIsBetter: false, fmt: (v: number) => v.toFixed(2) },
  { key: 'saves', label: 'Saves', group: 'Pitching', higherIsBetter: true, fmt: (v: number) => String(Math.round(v)) },
] as const

export type StandardStatKey = (typeof STANDARD_STAT_DEFS)[number]['key']

export async function getLeagueStandardStats(season: number): Promise<LeagueTeamStatRow[]> {
  const [hitRes, pitRes] = await Promise.all([
    fetch(`${MLB_API}/teams/stats?stats=season&group=hitting&sportId=1&season=${season}`, { next: { revalidate: 3600 } }),
    fetch(`${MLB_API}/teams/stats?stats=season&group=pitching&sportId=1&season=${season}`, { next: { revalidate: 3600 } }),
  ])
  if (!hitRes.ok || !pitRes.ok) return []

  type Split = { team: { id: number; name: string }; stat: Record<string, string | number | undefined> }
  const [hitData, pitData] = await Promise.all([hitRes.json(), pitRes.json()])
  const hitSplits: Split[] = hitData.stats?.[0]?.splits ?? []
  const pitSplits: Split[] = pitData.stats?.[0]?.splits ?? []

  const pitByTeam = new Map<number, Split['stat']>(pitSplits.map(s => [s.team.id, s.stat]))

  return hitSplits
    .filter(s => pitByTeam.has(s.team.id))
    .map((s): LeagueTeamStatRow => {
      const bat = s.stat
      // Safe: already filtered to teams present in pitByTeam above.
      const pit = pitByTeam.get(s.team.id)!
      return {
        teamId: s.team.id,
        teamName: s.team.name,
        avg: parseFloat(String(bat.avg ?? '0')),
        hr: Number(bat.homeRuns ?? 0),
        rbi: Number(bat.rbi ?? 0),
        ops: parseFloat(String(bat.ops ?? '0')),
        sb: Number(bat.stolenBases ?? 0),
        era: parseFloat(String(pit.era ?? '0')),
        wins: Number(pit.wins ?? 0),
        so: Number(pit.strikeOuts ?? 0),
        whip: parseFloat(String(pit.whip ?? '0')),
        saves: Number(pit.saves ?? 0),
      }
    })
}
