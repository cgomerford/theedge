// Multi-level stat lines for one player — MLB + AAA + AA + A, whichever
// actually have data this season. Confirmed real 2026-07-14 via direct
// curl against a real AAA stint (Jared Jones, sportId=11, Indianapolis
// Indians) — same /people/{id}/stats endpoint shape as MLB, just a
// different sportId. Levels with no games this season are simply absent
// from the returned map — the UI shows a button only for keys present.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export const LEVELS = [
  { key: 'mlb', label: 'MLB', sportId: 1 },
  { key: 'aaa', label: 'AAA', sportId: 11 },
  { key: 'aa', label: 'AA', sportId: 12 },
  { key: 'a', label: 'A', sportId: 13 },
] as const

export type LevelKey = typeof LEVELS[number]['key']

export type LevelStatLine = {
  level: LevelKey
  teamName: string
  leagueName: string
  gamesPlayed: number
  // Batting fields (null for pitchers)
  avg: string | null
  obp: string | null
  slg: string | null
  ops: string | null
  homeRuns: number | null
  rbi: number | null
  // Pitching fields (null for batters)
  era: string | null
  whip: string | null
  strikeOuts: number | null
  inningsPitched: string | null
}

export async function getPlayerLevelStats(
  playerId: number, subject: 'batter' | 'pitcher', season: number
): Promise<Partial<Record<LevelKey, LevelStatLine>>> {
  const group = subject === 'batter' ? 'hitting' : 'pitching'
  const results = await Promise.all(
    LEVELS.map(async lvl => {
      try {
        const res = await fetch(
          `${MLB_API}/people/${playerId}/stats?stats=season&group=${group}&sportId=${lvl.sportId}&season=${season}`,
          { cache: 'no-store' }
        )
        if (!res.ok) return null
        const data = await res.json()
        const split = data.stats?.[0]?.splits?.[0]
        const s = split?.stat
        if (!s || !s.gamesPlayed) return null // no real games at this level this season
        return {
          key: lvl.key,
          line: {
            level: lvl.key,
            teamName: split.team?.name ?? '—',
            leagueName: split.league?.name ?? '—',
            gamesPlayed: s.gamesPlayed,
            avg: s.avg ?? null,
            obp: s.obp ?? null,
            slg: s.slg ?? null,
            ops: s.ops ?? null,
            homeRuns: s.homeRuns ?? null,
            rbi: s.rbi ?? null,
            era: s.era ?? null,
            whip: s.whip ?? null,
            strikeOuts: s.strikeOuts ?? null,
            inningsPitched: s.inningsPitched ?? null,
          } as LevelStatLine,
        }
      } catch {
        return null
      }
    })
  )

  const out: Partial<Record<LevelKey, LevelStatLine>> = {}
  for (const r of results) {
    if (r) out[r.key] = r.line
  }
  return out
}