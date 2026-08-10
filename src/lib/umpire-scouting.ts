// src/lib/umpire-scouting.ts
//
// Powers a small "umpire" card on the pre-game Scout Report: who's behind
// the plate tonight, their season-long accuracy, and where they tend to
// miss calls most (high/low/inside/outside).
//
// SCOPE LIMITATION — worth reading before you wire this in: to find every
// game a given umpire worked this season, you'd ideally query league-wide,
// but I don't have a confirmed "umpire schedule" endpoint to do that
// cheaply. This instead walks the games in `teamGamePks` you pass in
// (typically this team's own season games, same list bullpen-usage.ts
// already fetches via getSeasonGamePks) and only counts the ones where
// this umpire actually worked home plate. That means the profile reflects
// "how this ump has called games involving this team" — a real, useful
// sample, but not their full league-wide season. If you want the true
// league-wide picture, that needs a proper umpire-schedule data source or
// a cron job aggregating across all 30 teams' games, not a per-page fetch.
//
// PERFORMANCE — this fetches every game in teamGamePks (could be 100+ by
// August) just to check who the HP ump was. Cached at 6h, concurrency-
// batched at 8, but still a real cost on first load. Same recommendation
// as bullpen-usage.ts: move to a nightly cron job writing precomputed
// rows to Supabase once you've confirmed the numbers look right.

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'
const CONCURRENCY = 8
const ZONE_HALF_WIDTH_FT = 0.83
const CALL_GRACE_FT = 0.5 / 12

export type UmpireSeasonProfile = {
  umpireName: string
  gamesWorkedAsHP: number
  totalTakes: number
  totalMissed: number
  accuracyPct: number
  missTendency: { high: number; low: number; inside: number; outside: number }
  tendencySummary: string
}

interface RawPlayEvent {
  isPitch?: boolean
  details?: { call?: { code?: string } }
  pitchData?: { coordinates?: { pX?: number; pZ?: number }; strikeZoneTop?: number; strikeZoneBottom?: number }
}
interface RawPlay { playEvents: RawPlayEvent[]; matchup: { batSide?: { code?: 'L' | 'R' | 'S' } } }
interface RawLiveFeed {
  liveData: {
    plays: { allPlays: RawPlay[] }
    boxscore?: { officials?: { official?: { fullName?: string }; officialType?: string }[] }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ─── Who's the HP umpire for a specific (usually upcoming) game ──────
export async function getUpcomingGameUmpire(gamePk: number): Promise<string | null> {
  try {
    const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data: RawLiveFeed = await res.json()
    const officials = data.liveData.boxscore?.officials ?? []
    const hp = officials.find(o => o.officialType?.toLowerCase().includes('home plate'))
    return hp?.official?.fullName ?? null
  } catch {
    return null
  }
}

// ─── Season profile for a named umpire, scoped to this team's games ──
export async function getUmpireSeasonProfile(umpireName: string, teamGamePks: number[]): Promise<UmpireSeasonProfile | null> {
  const feeds = await mapWithConcurrency(teamGamePks, CONCURRENCY, async (gamePk) => {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 21600 } })
      if (!res.ok) return null
      return (await res.json()) as RawLiveFeed
    } catch {
      return null
    }
  })

  let gamesWorked = 0
  let totalTakes = 0
  let totalMissed = 0
  const tendency = { high: 0, low: 0, inside: 0, outside: 0 }

  for (const data of feeds) {
    if (!data) continue
    const officials = data.liveData.boxscore?.officials ?? []
    const hp = officials.find(o => o.officialType?.toLowerCase().includes('home plate'))
    if (hp?.official?.fullName !== umpireName) continue // not this ump's game
    gamesWorked += 1

    for (const play of data.liveData.plays.allPlays) {
      for (const ev of play.playEvents) {
        if (!ev.isPitch) continue
        const code = ev.details?.call?.code
        const isBall = code === 'B'
        const isCalledStrike = code === 'C'
        if (!isBall && !isCalledStrike) continue

        totalTakes += 1

        const pX = ev.pitchData?.coordinates?.pX
        const pZ = ev.pitchData?.coordinates?.pZ
        const top = ev.pitchData?.strikeZoneTop
        const bottom = ev.pitchData?.strikeZoneBottom
        if (pX == null || pZ == null || top == null || bottom == null) continue

        const clearlyOutsideZone = Math.abs(pX) > ZONE_HALF_WIDTH_FT + CALL_GRACE_FT || pZ < bottom - CALL_GRACE_FT || pZ > top + CALL_GRACE_FT
        const clearlyInsideZone = Math.abs(pX) <= ZONE_HALF_WIDTH_FT - CALL_GRACE_FT && pZ >= bottom + CALL_GRACE_FT && pZ <= top - CALL_GRACE_FT
        const missed = (isCalledStrike && clearlyOutsideZone) || (isBall && clearlyInsideZone)
        if (!missed) continue

        totalMissed += 1
        // Which direction was the miss? Compare how far past the vertical vs horizontal edge the pitch was.
        const dz = pZ > top ? pZ - top : pZ < bottom ? bottom - pZ : 0
        const dx = Math.abs(pX) > ZONE_HALF_WIDTH_FT ? Math.abs(pX) - ZONE_HALF_WIDTH_FT : 0
        if (dz >= dx) {
          if (pZ > top) tendency.high += 1
          else if (pZ < bottom) tendency.low += 1
        } else {
          // pX sign convention: positive = catcher's right. For a RHB that's their inside
          // pitch, for a LHB that's outside. NOTE: I haven't verified this sign convention
          // against a live game with known batter handedness — if inside/outside come back
          // swapped in practice, flip the condition below.
          const batSide = play.matchup.batSide?.code
          const positiveIsInside = batSide !== 'L'
          const isInside = positiveIsInside ? pX > 0 : pX < 0
          if (isInside) tendency.inside += 1
          else tendency.outside += 1
        }
      }
    }
  }

  if (gamesWorked === 0) return null

  const accuracyPct = totalTakes > 0 ? Number((((totalTakes - totalMissed) / totalTakes) * 100).toFixed(1)) : 0
  const dominant = Object.entries(tendency).sort((a, b) => b[1] - a[1])[0]
  const tendencySummary = dominant && dominant[1] > 0
    ? `Tends to miss ${dominant[0]} most often`
    : 'No clear directional tendency in the sample'

  return { umpireName, gamesWorkedAsHP: gamesWorked, totalTakes, totalMissed, accuracyPct, missTendency: tendency, tendencySummary }
}
