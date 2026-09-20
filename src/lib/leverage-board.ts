// src/lib/leverage-board.ts
//
// "Leverage Board" — the season's real biggest win-probability swings for
// one team, not a modeled "clutch" score. Reuses two endpoints already
// proven elsewhere in this codebase rather than inventing a new data
// source: the real per-game schedule/linescore (getTeamGameLog, from
// src/lib/season-shape.ts) to find candidate close/extra-inning games
// cheaply with zero extra fetches, then the real per-at-bat win
// probability endpoint (getGameWinProbability, src/lib/mlb-win-probability.ts,
// already used on game pages) for just those candidates — not all ~150
// games a season, to keep this a homepage-weight fetch (one schedule call
// + up to `limit` win-probability calls, lazy, per team, only when picked).

import { getTeamGameLog, type SeasonGame } from './season-shape'
import { getGameWinProbability } from './mlb-win-probability'

export type LeverageMoment = {
  gamePk: number
  date: string
  opponentName: string
  home: boolean
  win: boolean
  runsFor: number
  runsAgainst: number
  innings: number
  swingPct: number // real: the single biggest at-bat-to-at-bat win probability jump for THIS team, in percentage points
  inning: number
  halfInning: 'top' | 'bottom'
  winPctBefore: number
  winPctAfter: number
}

// One-run games and extra-inning games are, empirically, where a season's
// real biggest single-play win-probability swings live — cheap to filter
// from the game log already fetched, no extra call. Most recent first so
// a September homepage leads with the freshest drama.
function candidateGames(games: SeasonGame[], limit: number): SeasonGame[] {
  const close = games.filter(g => Math.abs(g.runsFor - g.runsAgainst) <= 1 || g.innings > 9)
  return close.slice(-limit).reverse()
}

export async function getLeverageMoments(teamId: number, season: number, limit = 8): Promise<LeverageMoment[]> {
  const games = await getTeamGameLog(teamId, season)
  const candidates = candidateGames(games, limit)

  const moments = await Promise.all(candidates.map(async (g): Promise<LeverageMoment | null> => {
    const points = await getGameWinProbability(g.gamePk)
    if (points.length < 2) return null

    let bestSwing = 0, bestIdx = -1
    for (let i = 1; i < points.length; i++) {
      // Some entries in the real feed are pregame/undated baseline rows
      // that fall back to inning 0 (see mlb-win-probability.ts) — skip
      // them as "the moment" so the board never shows a bogus "Top 0th".
      if (!points[i].inning) continue
      const prevOurs = g.home ? points[i - 1].homeWinPct : points[i - 1].awayWinPct
      const nowOurs = g.home ? points[i].homeWinPct : points[i].awayWinPct
      const swing = Math.abs(nowOurs - prevOurs)
      if (swing > bestSwing) { bestSwing = swing; bestIdx = i }
    }
    if (bestIdx < 1) return null
    const before = points[bestIdx - 1]
    const after = points[bestIdx]

    return {
      gamePk: g.gamePk,
      date: g.date,
      opponentName: g.opponentName,
      home: g.home,
      win: g.win,
      runsFor: g.runsFor,
      runsAgainst: g.runsAgainst,
      innings: g.innings,
      swingPct: Math.round(bestSwing * 10) / 10,
      inning: after.inning,
      halfInning: after.halfInning,
      winPctBefore: g.home ? before.homeWinPct : before.awayWinPct,
      winPctAfter: g.home ? after.homeWinPct : after.awayWinPct,
    }
  }))

  return moments
    .filter((m): m is LeverageMoment => m !== null)
    .sort((a, b) => b.swingPct - a.swingPct)
}
