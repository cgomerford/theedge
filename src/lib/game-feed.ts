// src/lib/game-feed.ts
//
// Shared live-feed fetcher for anything that walks MLB game-by-game data
// (bullpen leverage report, SB tendency, and anything future). Wrapped in
// React's cache() — this GUARANTEES a given gamePk is only ever fetched
// once per request/render, regardless of how many different functions
// ask for it or in what order, unlike relying on Next.js's fetch()
// memoization matching identical URL+options across separate call sites
// (which should work per Next's docs, but wasn't something worth staking
// a ~1 minute page load on without an explicit guarantee).
//
// Added 2026-08-17 after getBullpenReport (bullpen-usage.ts) and
// getSBTendency (sb-tendency.ts) were independently walking the exact
// same ~150 games this season, each with their own raw fetch — doubling
// real fetch volume for zero benefit. Both now route through this.

import { cache } from 'react'

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'

export interface RawGameLiveFeed {
  gameData: { teams: { away: { id: number }; home: { id: number } } }
  liveData: { plays: { allPlays: any[] } }
}

export const getGameFeed = cache(async (gamePk: number): Promise<RawGameLiveFeed | null> => {
  try {
    const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 21600 } })
    if (!res.ok) return null
    return (await res.json()) as RawGameLiveFeed
  } catch {
    return null
  }
})