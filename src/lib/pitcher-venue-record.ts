// src/lib/pitcher-venue-record.ts
//
// Real per-ballpark pitching record — same real per-start decision data
// as getPitcherTeamRecord (pitcher-start-trends.ts's gameLog pull,
// stat.wins/stat.losses — confirmed live not to both reliably appear at
// the top level, hence reading the per-start stat block), joined against
// the real venue for each real gamePk (venue-schedule.ts) instead of
// grouped by opponent. `range: 'career'` pulls one real gameLog per real
// season from his real MLB debut year through the current season.

import { getVenuesForGames, getDebutYear } from '@/lib/venue-schedule'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type PitchingGameLogSplit = {
  game?: { gamePk?: number }
  stat?: { wins?: number; losses?: number; earnedRuns?: number; inningsPitched?: string }
}

export type PitcherVenueRecordRow = {
  venueId: number | null
  venue: string
  starts: number
  wins: number
  losses: number
  noDecisions: number
  era: number | null
}

function parseIP(ip: string | undefined): number | null {
  if (!ip) return null
  const [whole, partial] = ip.split('.').map(Number)
  if (Number.isNaN(whole)) return null
  const outs = whole * 3 + (partial === 1 ? 1 : partial === 2 ? 2 : 0)
  return outs > 0 ? outs / 3 : (whole === 0 && !partial ? 0 : null)
}

async function getPitchingSplitsForSeason(playerId: number, season: number, cacheSeconds: number): Promise<PitchingGameLogSplit[]> {
  try {
    const res = await fetch(`${MLB_API}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}`, { next: { revalidate: cacheSeconds } })
    if (!res.ok) return []
    const json = await res.json()
    return json.stats?.[0]?.splits ?? []
  } catch {
    return []
  }
}

export async function getPitcherVenueRecord(playerId: number, season: number, range: 'season' | 'career' = 'season'): Promise<PitcherVenueRecordRow[]> {
  try {
    let splits: PitchingGameLogSplit[]
    if (range === 'career') {
      const debutYear = await getDebutYear(playerId)
      const seasons = Array.from({ length: Math.max(1, season - debutYear + 1) }, (_, i) => debutYear + i)
      const currentYear = new Date().getFullYear()
      const perSeason = await Promise.all(seasons.map(yr => getPitchingSplitsForSeason(playerId, yr, yr < currentYear ? 86400 : 3600)))
      splits = perSeason.flat()
    } else {
      splits = await getPitchingSplitsForSeason(playerId, season, 3600)
    }
    if (splits.length === 0) return []

    const gamePks = [...new Set(splits.map(g => g.game?.gamePk).filter((x): x is number => x != null))]
    const venues = await getVenuesForGames(gamePks)

    const byVenue = new Map<string, { venueId: number | null; venue: string; wins: number; losses: number; noDecisions: number; starts: number; erSum: number; ipSum: number }>()

    for (const g of splits) {
      const gamePk = g.game?.gamePk
      const v = gamePk != null ? venues[gamePk] : undefined
      const key = v ? String(v.id) : 'unknown'
      const name = v?.name ?? 'Unknown venue'
      if (!byVenue.has(key)) byVenue.set(key, { venueId: v?.id ?? null, venue: name, wins: 0, losses: 0, noDecisions: 0, starts: 0, erSum: 0, ipSum: 0 })
      const row = byVenue.get(key)!
      const s = g.stat ?? {}
      row.starts++
      const isWin = Number(s.wins ?? 0) === 1
      const isLoss = Number(s.losses ?? 0) === 1
      if (isWin) row.wins++
      else if (isLoss) row.losses++
      else row.noDecisions++
      row.erSum += Number(s.earnedRuns ?? 0)
      const ip = parseIP(s.inningsPitched)
      if (ip != null) row.ipSum += ip
    }

    return [...byVenue.values()]
      .filter(r => r.venueId !== null)
      .map(r => ({
        venueId: r.venueId, venue: r.venue, starts: r.starts, wins: r.wins, losses: r.losses, noDecisions: r.noDecisions,
        era: r.ipSum > 0 ? Math.round((r.erSum * 9 / r.ipSum) * 100) / 100 : null,
      }))
      .sort((a, b) => b.starts - a.starts)
  } catch {
    return []
  }
}
