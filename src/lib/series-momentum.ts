// Inning-by-inning cumulative run differential, per completed game in a
// series — the actual "where did this game swing" data. Genuinely new
// endpoint for this codebase; nothing else touches per-inning scoring,
// only final scores (series-games.ts) and boxscore batting totals
// (series-stats.ts). UNVERIFIED FIELD SHAPE — innings[].home/away.runs
// are documented MLB fields, not yet confirmed live. console.log below
// until verified, same convention as the rest of this build.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type InningDiffPoint = { inning: number; diff: number } // diff = cumulative home runs minus away runs after this inning

export type GameMomentum = {
  gamePk: number
  gameNumber: number
  points: InningDiffPoint[]
}

export async function getSeriesInningMomentum(
  games: { gamePk: number; gameNumber: number; isFinal: boolean }[]
): Promise<GameMomentum[]> {
  let logged = false
  return Promise.all(
    games.filter(g => g.isFinal).map(async g => {
      try {
        const res = await fetch(`${MLB_API}/game/${g.gamePk}/linescore`, { next: { revalidate: 3600 } })
        if (!res.ok) return { gamePk: g.gamePk, gameNumber: g.gameNumber, points: [] }
        const data = await res.json()
        if (!logged) {
          console.log('[series-momentum] raw linescore shape:', JSON.stringify(data).slice(0, 500))
          logged = true
        }
        let homeRuns = 0, awayRuns = 0
        const points: InningDiffPoint[] = (data.innings ?? []).map((inn: any) => {
          homeRuns += inn.home?.runs ?? 0
          awayRuns += inn.away?.runs ?? 0
          return { inning: inn.num, diff: homeRuns - awayRuns }
        })
        return { gamePk: g.gamePk, gameNumber: g.gameNumber, points }
      } catch (err) {
        console.error('[series-momentum] fetch failed:', g.gamePk, err)
        return { gamePk: g.gamePk, gameNumber: g.gameNumber, points: [] }
      }
    })
  )
}