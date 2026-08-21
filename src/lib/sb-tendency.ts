// src/lib/sb-tendency.ts
//
// Stolen base attempt tendency by count, per team, full season. Curl-
// verified against real games before writing this — successful/failed
// steal attempts are NOT top-level play eventTypes (a steal doesn't end
// the batter's plate appearance, so it never becomes the play's own
// result). They live inside each play's `runners[]` array as
// runner.details.event, confirmed values: 'Stolen Base 2B',
// 'Stolen Base 3B', 'Caught Stealing 2B' (and presumably '3B'/'Home'
// variants, not separately confirmed — treat as real if seen, don't
// assume the full list).
//
// COUNT CAVEAT — read before trusting this data at face value: the
// `count` object used here is the count on the PLAY (i.e. the count when
// the batter's plate appearance resolved), not the exact pitch the
// runner broke on mid-count. MLB's live feed doesn't expose a clean
// per-pitch link for runner movements without a lot more work matching
// against playEvents timestamps. This is the same category of
// approximation as the blown-save/blown-lead methodology in
// bullpen-usage.ts — real signal, not the official precise number.
// Labelled as such wherever this data is displayed, not asserted as
// exact.
//
// SCOPE: only genuine steal attempts (runner_event containing 'Stolen
// Base' or 'Caught Stealing') are counted. Pickoffs are deliberately
// excluded — a pickoff is pitcher-initiated, not a baserunning decision,
// and conflating the two would misrepresent "how often does this team
// try to steal."
//
// COST: full-season game walk, same profile as bullpen-usage.ts (100+
// live-feed fetches by August) — same candidate for a nightly cron once
// the numbers here are sanity-checked against a source you trust.

import { getSeasonGamePks } from '@/lib/bullpen-usage'
import { getGameFeed } from '@/lib/game-feed'

const CONCURRENCY = 8

export type SBCountBucket = {
  balls: number
  strikes: number
  attempts: number
  successes: number
  caught: number
  successRate: number | null
}

export type SBTendencyReport = {
  totalAttempts: number
  totalSuccesses: number
  totalCaught: number
  successRate: number | null
  byCount: SBCountBucket[] // sorted by attempts descending
  gamesSampled: number
}

interface RawRunnerDetails { event?: string; isOut?: boolean }
interface RawRunner { details?: RawRunnerDetails; movement?: { isOut?: boolean } }
interface RawPlay {
  about: { inning: number; halfInning: 'top' | 'bottom' }
  count?: { balls?: number; strikes?: number }
  runners?: RawRunner[]
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

function isStealAttempt(event: string | undefined): 'success' | 'caught' | null {
  if (!event) return null
  const e = event.toLowerCase()
  if (e.includes('caught stealing')) return 'caught'
  if (e.includes('stolen base')) return 'success'
  return null
}

export async function getSBTendency(teamId: number, season: number): Promise<SBTendencyReport> {
  const gamePks = await getSeasonGamePks(teamId, season)

  // (balls, strikes) -> { attempts, successes, caught }
  const buckets = new Map<string, { balls: number; strikes: number; attempts: number; successes: number; caught: number }>()

  // True totals — every real attempt counts here regardless of whether
  // its count was valid enough to bucket below.
  let trueTotalAttempts = 0
  let trueTotalSuccesses = 0
  let trueTotalCaught = 0

  const feeds = await mapWithConcurrency(gamePks, CONCURRENCY, (gamePk) => getGameFeed(gamePk))

  gamePks.forEach((gamePk, idx) => {
    const data = feeds[idx]
    if (!data) return
    const isTeamHome = data.gameData.teams.home.id === teamId
    const isTeamAway = data.gameData.teams.away.id === teamId
    if (!isTeamHome && !isTeamAway) return

    for (const play of (data.liveData.plays.allPlays as RawPlay[])) {
      // Only count attempts made BY this team's baserunners — i.e. when
      // this team is batting (top half if away, bottom half if home).
      const teamIsBatting = (play.about.halfInning === 'top' && isTeamAway) || (play.about.halfInning === 'bottom' && isTeamHome)
      if (!teamIsBatting) continue

      for (const runner of play.runners ?? []) {
        const outcome = isStealAttempt(runner.details?.event)
        if (!outcome) continue

        trueTotalAttempts += 1
        if (outcome === 'success') trueTotalSuccesses += 1
        else trueTotalCaught += 1

        const balls = play.count?.balls ?? 0
        const strikes = play.count?.strikes ?? 0

        // VALIDITY FIX: play.count is the count when the PLATE APPEARANCE
        // resolved, not the count at the specific pitch the runner broke
        // on. For a PA ending in a walk, that's balls=4; for a strikeout,
        // strikes=3 — both real values on the play object, but neither
        // is a count a runner could have actually been stealing during
        // (max in-progress count is 3-2). Rather than display literally
        // impossible counts like "4-2" or "3-3", these get excluded from
        // the per-count breakdown. totalAttempts/totalSuccesses below
        // still count every real attempt regardless of count validity —
        // only the byCount breakdown is affected, and undercounts by
        // however many attempts happened on the final pitch of a walk
        // or strikeout play.
        if (balls > 3 || strikes > 2) continue

        const key = `${balls}-${strikes}`
        if (!buckets.has(key)) buckets.set(key, { balls, strikes, attempts: 0, successes: 0, caught: 0 })
        const bucket = buckets.get(key)!
        bucket.attempts += 1
        if (outcome === 'success') bucket.successes += 1
        else bucket.caught += 1
      }
    }
  })

  const byCount: SBCountBucket[] = [...buckets.values()]
    .map(b => ({
      balls: b.balls,
      strikes: b.strikes,
      attempts: b.attempts,
      successes: b.successes,
      caught: b.caught,
      successRate: b.attempts > 0 ? Math.round((b.successes / b.attempts) * 1000) / 1000 : null,
    }))
    .sort((a, b) => b.attempts - a.attempts)

  const totalAttempts = trueTotalAttempts
  const totalSuccesses = trueTotalSuccesses
  const totalCaught = trueTotalCaught

  return {
    totalAttempts,
    totalSuccesses,
    totalCaught,
    successRate: totalAttempts > 0 ? Math.round((totalSuccesses / totalAttempts) * 1000) / 1000 : null,
    byCount,
    gamesSampled: gamePks.length,
  }
}