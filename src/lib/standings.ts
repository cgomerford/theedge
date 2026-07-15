// Division + wildcard standings. Same URL getTeamForm() in mlb.ts already
// calls — that function only extracts streak and discards the rest; this
// parses what it throws away. Two functions hitting the identical URL is
// a real duplicate-fetch worth merging later, not done here to avoid
// touching getTeamForm's already-working behavior mid-build.
//
// UNVERIFIED FIELD SHAPE — divisionRank, gamesBack, wildCardRank,
// wildCardGamesBack are documented MLB Stats API fields, not yet
// confirmed against a live response for this project. console.log below
// until verified, same convention as playerPool=ALL elsewhere in this repo.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type DivisionStandingRow = {
  teamId: number
  name: string
  abbreviation: string
  wins: number
  losses: number
  divisionRank: number
  gamesBack: string // MLB returns "-" for the division leader, else a string like "4.5"
  wildCardRank: number | null
  wildCardGamesBack: string | null
  streak: string
}

export type DivisionStandings = {
  divisionName: string
  leagueId: number
  teams: DivisionStandingRow[]
}

// League-wide wildcard neighbors — same confirmed URL as getDivisionStandings,
// but collects every division in the league instead of stopping at the
// team's own division, since the wildcard race spans all three.
export async function getLeagueStandings(leagueId: number, season: number): Promise<DivisionStandingRow[]> {
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/standings?leagueId=103,104&season=${season}&date=${today}`
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const data = await res.json()
    const rows: DivisionStandingRow[] = []
    for (const record of data.records ?? []) {
      if (record.league?.id !== leagueId) continue
      for (const t of record.teamRecords ?? []) {
        rows.push({
          teamId: t.team?.id,
          name: t.team?.name ?? '—',
          abbreviation: t.team?.abbreviation ?? '',
          wins: t.leagueRecord?.wins ?? 0,
          losses: t.leagueRecord?.losses ?? 0,
          divisionRank: parseInt(t.divisionRank ?? '0'),
          gamesBack: t.gamesBack ?? '-',
          wildCardRank: t.wildCardRank ? parseInt(t.wildCardRank) : null,
          wildCardGamesBack: t.wildCardGamesBack ?? null,
          streak: t.streak?.streakCode ?? '',
        })
      }
    }
    return rows.sort((a, b) => (a.wildCardRank ?? 99) - (b.wildCardRank ?? 99))
  } catch (err) {
    console.error('[standings] league fetch failed:', err)
    return []
  }
}

export async function getDivisionStandings(teamId: number, season: number): Promise<DivisionStandings | null> {
  const today = new Date().toISOString().split('T')[0]
  const url = `${MLB_API}/standings?leagueId=103,104&season=${season}&date=${today}`

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = await res.json()

    for (const record of data.records ?? []) {
      const teamRecords = record.teamRecords ?? []
      const match = teamRecords.find((t: any) => t.team?.id === teamId)
      if (!match) continue

      console.log('[standings] raw teamRecord shape:', JSON.stringify(match).slice(0, 600))

 console.log('[standings] raw record.division shape:', JSON.stringify(record.division))
      return {
        divisionName: record.division?.name ?? '—',
        leagueId: record.league?.id ?? 0,
        teams: teamRecords
          .map((t: any) => ({
            teamId: t.team?.id,
            name: t.team?.name ?? '—',
            abbreviation: t.team?.abbreviation ?? '',
            wins: t.leagueRecord?.wins ?? 0,
            losses: t.leagueRecord?.losses ?? 0,
            divisionRank: parseInt(t.divisionRank ?? '0'),
            gamesBack: t.gamesBack ?? '-',
            wildCardRank: t.wildCardRank ? parseInt(t.wildCardRank) : null,
            wildCardGamesBack: t.wildCardGamesBack ?? null,
            streak: t.streak?.streakCode ?? '',
          }))
          .sort((a: DivisionStandingRow, b: DivisionStandingRow) => a.divisionRank - b.divisionRank),
      }
    }
    return null
  } catch (err) {
    console.error('[standings] fetch failed:', err)
    return null
  }
}