// src/lib/batter-team-record.ts
//
// Real per-opponent-team batting record — aggregates this batter's own
// real per-game log (MLB Stats API gameLog, group=hitting; confirmed live
// to carry a real `opponent` team on every game) by real opponent team.
// Mirrors pitcher-start-trends.ts's getPitcherTeamRecord, hitting side.
// `range: 'career'` pulls one real gameLog per real season from his real
// MLB debut year through the current season instead of just this season.

import { getDebutYear } from '@/lib/venue-schedule'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type HittingGameLogSplit = {
  opponent?: { id?: number; name?: string }
  stat?: {
    atBats?: number; hits?: number; doubles?: number; triples?: number; homeRuns?: number
    baseOnBalls?: number; strikeOuts?: number; totalBases?: number; hitByPitch?: number; sacFlies?: number
  }
}

export type BatterTeamRecordRow = {
  opponentId: number | null
  opponent: string
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
  } catch (err) {
    console.error('[getHittingSplitsForSeason] MLB API error:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function getBatterTeamRecord(playerId: number, season: number, range: 'season' | 'career' = 'season'): Promise<BatterTeamRecordRow[]> {
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

    const byOpponent = new Map<string, {
      opponentId: number | null; opponent: string; games: number
      ab: number; h: number; doubles: number; triples: number; hr: number; bb: number; so: number
      tb: number; hbp: number; sf: number
    }>()

    for (const g of splits) {
      const oppId = g.opponent?.id ?? null
      const oppName = g.opponent?.name ?? '—'
      const key = oppId != null ? String(oppId) : oppName
      if (!byOpponent.has(key)) {
        byOpponent.set(key, { opponentId: oppId, opponent: oppName, games: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, so: 0, tb: 0, hbp: 0, sf: 0 })
      }
      const row = byOpponent.get(key)!
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

    return [...byOpponent.values()]
      .map(r => {
        const avg = r.ab > 0 ? r.h / r.ab : null
        const pa = r.ab + r.bb + r.hbp + r.sf
        const obp = pa > 0 ? (r.h + r.bb + r.hbp) / pa : null
        const slg = r.ab > 0 ? r.tb / r.ab : null
        const ops = obp != null && slg != null ? obp + slg : null
        return {
          opponentId: r.opponentId, opponent: r.opponent, games: r.games,
          ab: r.ab, hits: r.h, doubles: r.doubles, triples: r.triples, hr: r.hr, bb: r.bb, so: r.so,
          avg: fmtRate(avg), obp: fmtRate(obp), slg: fmtRate(slg), ops: fmtRate(ops),
        }
      })
      .sort((a, b) => b.games - a.games)
  } catch (err) {
    console.error('[getBatterTeamRecord] error:', err instanceof Error ? err.message : err)
    return []
  }
}
