// src/lib/batter-venue-record.ts
//
// Real per-ballpark batting record — this batter's real per-game log
// (MLB Stats API gameLog, group=hitting) joined against the real venue
// for each real gamePk (venue-schedule.ts), aggregated by real ballpark.
// `range: 'career'` pulls one real gameLog per real season from his real
// MLB debut year through the current season instead of just this season.

import { getVenuesForGames, getDebutYear } from '@/lib/venue-schedule'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type HittingGameLogSplit = {
  game?: { gamePk?: number }
  stat?: {
    atBats?: number; hits?: number; doubles?: number; triples?: number; homeRuns?: number
    baseOnBalls?: number; strikeOuts?: number; totalBases?: number; hitByPitch?: number; sacFlies?: number
  }
}

export type BatterVenueRecordRow = {
  venueId: number | null
  venue: string
  games: number
  ab: number
  hits: number
  doubles: number
  triples: number
  hr: number
  bb: number
  so: number
  avg: string
  obp: string
  slg: string
  ops: string
}

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}

async function getHittingSplitsForSeason(playerId: number, season: number, cacheSeconds: number): Promise<HittingGameLogSplit[]> {
  try {
    const res = await fetch(`${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}`, { next: { revalidate: cacheSeconds } })
    if (!res.ok) return []
    const json = await res.json()
    return json.stats?.[0]?.splits ?? []
  } catch {
    return []
  }
}

export async function getBatterVenueRecord(playerId: number, season: number, range: 'season' | 'career' = 'season'): Promise<BatterVenueRecordRow[]> {
  try {
    let splits: HittingGameLogSplit[]
    if (range === 'career') {
      const debutYear = await getDebutYear(playerId)
      const seasons = Array.from({ length: Math.max(1, season - debutYear + 1) }, (_, i) => debutYear + i)
      // Past seasons are done and won't change — cache them far longer
      // than the current-season pull.
      const currentYear = new Date().getFullYear()
      const perSeason = await Promise.all(seasons.map(yr => getHittingSplitsForSeason(playerId, yr, yr < currentYear ? 86400 : 3600)))
      splits = perSeason.flat()
    } else {
      splits = await getHittingSplitsForSeason(playerId, season, 3600)
    }
    if (splits.length === 0) return []

    const gamePks = [...new Set(splits.map(g => g.game?.gamePk).filter((x): x is number => x != null))]
    const venues = await getVenuesForGames(gamePks)

    const byVenue = new Map<string, {
      venueId: number | null; venue: string; games: number
      ab: number; h: number; doubles: number; triples: number; hr: number; bb: number; so: number
      tb: number; hbp: number; sf: number
    }>()

    for (const g of splits) {
      const gamePk = g.game?.gamePk
      const v = gamePk != null ? venues[gamePk] : undefined
      const key = v ? String(v.id) : 'unknown'
      const name = v?.name ?? 'Unknown venue'
      if (!byVenue.has(key)) byVenue.set(key, { venueId: v?.id ?? null, venue: name, games: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, so: 0, tb: 0, hbp: 0, sf: 0 })
      const row = byVenue.get(key)!
      const s = g.stat ?? {}
      row.games++
      row.ab += s.atBats ?? 0
      row.h += s.hits ?? 0
      row.doubles += s.doubles ?? 0
      row.triples += s.triples ?? 0
      row.hr += s.homeRuns ?? 0
      row.bb += s.baseOnBalls ?? 0
      row.so += s.strikeOuts ?? 0
      row.tb += s.totalBases ?? 0
      row.hbp += s.hitByPitch ?? 0
      row.sf += s.sacFlies ?? 0
    }

    return [...byVenue.values()]
      .filter(r => r.venueId !== null)
      .map(r => {
        const avg = r.ab > 0 ? r.h / r.ab : null
        const pa = r.ab + r.bb + r.hbp + r.sf
        const obp = pa > 0 ? (r.h + r.bb + r.hbp) / pa : null
        const slg = r.ab > 0 ? r.tb / r.ab : null
        const ops = obp != null && slg != null ? obp + slg : null
        return {
          venueId: r.venueId, venue: r.venue, games: r.games,
          ab: r.ab, hits: r.h, doubles: r.doubles, triples: r.triples, hr: r.hr, bb: r.bb, so: r.so,
          avg: fmtRate(avg), obp: fmtRate(obp), slg: fmtRate(slg), ops: fmtRate(ops),
        }
      })
      .sort((a, b) => b.games - a.games)
  } catch {
    return []
  }
}
