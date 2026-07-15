// Aggregates batting lines across a series' completed games for one team.
// Reuses the confirmed-working boxscore endpoint from lineups.ts
// (${MLB_API}/game/${gamePk}/boxscore) — new aggregation, not a new
// unverified API surface.
//
// UNVERIFIED FIELD SHAPE — player.stats.batting.{atBats,hits,homeRuns,rbi,
// baseOnBalls,strikeOuts} are documented MLB fields, not yet confirmed
// against a live response for this project. console.log below until
// verified, same convention as the rest of this build.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type SeriesBatterLine = {
  playerId: number
  name: string
  gamesPlayed: number
  ab: number
  hits: number
  home_runs: number
  rbi: number
  walks: number
  strikeouts: number
  avg: string
}

export async function getSeriesBattingStats(gamePks: number[], teamId: number): Promise<SeriesBatterLine[]> {
  const totals = new Map<number, SeriesBatterLine>()
  let logged = false

  for (const gamePk of gamePks) {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/boxscore`, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const data = await res.json()

      const homeId = data.teams?.home?.team?.id
      const awayId = data.teams?.away?.team?.id
      const teamData = homeId === teamId ? data.teams.home : awayId === teamId ? data.teams.away : null
      if (!teamData) continue

      const players = Object.values(teamData.players ?? {}) as any[]
      if (!logged && players[0]) {
        console.log('[series-stats] raw player.stats.batting shape:', JSON.stringify(players[0]?.stats?.batting))
        logged = true
      }

      for (const player of players) {
        const batting = player.stats?.batting
        if (!batting || (batting.atBats ?? 0) === 0) continue
        const id = player.person?.id
        if (!id) continue

        const existing = totals.get(id) ?? {
          playerId: id, name: player.person?.fullName ?? '—', gamesPlayed: 0,
          ab: 0, hits: 0, home_runs: 0, rbi: 0, walks: 0, strikeouts: 0, avg: '—',
        }
        existing.gamesPlayed += 1
        existing.ab += batting.atBats ?? 0
        existing.hits += batting.hits ?? 0
        existing.home_runs += batting.homeRuns ?? 0
        existing.rbi += batting.rbi ?? 0
        existing.walks += batting.baseOnBalls ?? 0
        existing.strikeouts += batting.strikeOuts ?? 0
        totals.set(id, existing)
      }
    } catch (err) {
      console.error('[series-stats] boxscore fetch failed:', gamePk, err)
    }
  }

  const rows = Array.from(totals.values())
  for (const r of rows) r.avg = r.ab > 0 ? (r.hits / r.ab).toFixed(3).replace(/^0/, '') : '—'
  return rows.sort((a, b) => b.hits - a.hits)
}