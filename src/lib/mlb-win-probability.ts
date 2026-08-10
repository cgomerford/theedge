// src/lib/mlb-win-probability.ts
//
// Fetches play-by-play win probability for a game and reshapes it into
// WinProbabilityPoint[] for <WinProbabilityChart />.
//
// VERIFY BEFORE TRUSTING IN PROD: this hits the same undocumented
// statsapi.mlb.com surface as pregame-stats.ts and lab.ts. The endpoint's
// field names (homeTeamWinProbability / awayTeamWinProbability /
// atBatIndex) are community-reverse-engineered, not officially documented.
// Run one real completed gamePk through this and diff the JSON before
// trusting it in prod — same rule as the rest of this codebase.
//
// Degrades to an empty array on any failure — never a fabricated flat 50%
// line. <WinProbabilityChart /> and the digest sparkline both treat
// winProbability.length === 0 as "omit the section," not "draw nothing
// useful anyway."

import type { WinProbabilityPoint } from '@/types/postgame'

const STATS_API = 'https://statsapi.mlb.com/api/v1'

type RawWinProbEntry = {
  atBatIndex?: number
  inning?: number
  halfInning?: 'top' | 'bottom'
  homeTeamWinProbability?: number
  awayTeamWinProbability?: number
}

export async function getGameWinProbability(gamePk: number): Promise<WinProbabilityPoint[]> {
  const url = `${STATS_API}/game/${gamePk}/winProbability`
  try {
    // Final games never change — safe to cache long. If you want this to
    // work for in-progress games too, drop revalidate way down (e.g. 60)
    // for games where gameState !== 'Final'.
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = (await res.json()) as RawWinProbEntry[]
    if (!Array.isArray(data)) return []

    return data
      .filter(
        (e): e is Required<Pick<RawWinProbEntry, 'atBatIndex' | 'homeTeamWinProbability' | 'awayTeamWinProbability'>> & RawWinProbEntry =>
          e.atBatIndex != null && e.homeTeamWinProbability != null && e.awayTeamWinProbability != null,
      )
      .map(e => ({
        atBatIndex: e.atBatIndex!,
        inning: e.inning ?? 0,
        halfInning: e.halfInning ?? 'top',
        homeWinPct: round1(e.homeTeamWinProbability!),
        awayWinPct: round1(e.awayTeamWinProbability!),
      }))
      .sort((a, b) => a.atBatIndex - b.atBatIndex)
  } catch {
    return []
  }
}

/** Fetches win probability and merges it onto an already-built report.
 *  Call this right after aggregateGameFeed() at the page/route level —
 *  kept separate because aggregateGameFeed() takes a pre-fetched feed and
 *  intentionally does no network I/O itself. */
export async function attachWinProbability<T extends { winProbability: WinProbabilityPoint[] }>(
  report: T,
  gamePk: number,
): Promise<T> {
  report.winProbability = await getGameWinProbability(gamePk)
  return report
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}