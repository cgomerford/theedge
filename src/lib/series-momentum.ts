// Per-play win-probability swings across a series' completed games — the
// same math MLB's own in-game win-probability graph is built from, not a
// home-grown cumulative run differential. Confirmed live against
// /game/{gamePk}/winProbability: each element carries a real
// homeTeamWinProbability (0-100) plus about.inning/isTopInning/
// atBatIndex, already in chronological play order. This is deliberately
// spikier than run-diff — a single big play (HR, DP, walk-off) swings win
// probability hard in one step, where run differential only moves at the
// next scoring play and sits flat for the rest of the half-inning.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type InningDiffPoint = { inning: number; isTopInning: boolean; playIndex: number; diff: number } // diff = homeTeamWinProbability - 50, rounded to whole points

export type GameMomentum = {
  gamePk: number
  gameNumber: number
  points: InningDiffPoint[]
}

type RawWinProbPlay = {
  about?: { inning?: number; isTopInning?: boolean; atBatIndex?: number }
  homeTeamWinProbability?: number
}

export async function getSeriesInningMomentum(
  games: { gamePk: number; gameNumber: number; isFinal: boolean }[]
): Promise<GameMomentum[]> {
  return Promise.all(
    games.filter(g => g.isFinal).map(async g => {
      try {
        const res = await fetch(`${MLB_API}/game/${g.gamePk}/winProbability`, { next: { revalidate: 3600 } })
        if (!res.ok) return { gamePk: g.gamePk, gameNumber: g.gameNumber, points: [] }
        const data: RawWinProbPlay[] = await res.json()

        const points: InningDiffPoint[] = data
          .filter(p => typeof p.homeTeamWinProbability === 'number' && p.about?.inning != null)
          .map(p => ({
            inning: p.about!.inning!,
            isTopInning: p.about!.isTopInning ?? false,
            playIndex: p.about!.atBatIndex ?? 0,
            diff: Math.round(p.homeTeamWinProbability! - 50),
          }))
        return { gamePk: g.gamePk, gameNumber: g.gameNumber, points }
      } catch (err) {
        console.error('[series-momentum] fetch failed:', g.gamePk, err)
        return { gamePk: g.gamePk, gameNumber: g.gameNumber, points: [] }
      }
    })
  )
}
