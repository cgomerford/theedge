// src/lib/pitcher-statcast-profile.ts
//
// Per-pitcher Statcast profile for tonight's board — pulls one pitcher's
// full-season pitch log directly from Baseball Savant's raw pitch search
// (curl-verified real columns: balls, strikes, pitch_type, delta_run_exp,
// miss_distance, swing_length, game_date). Scoped to a single pitcher via
// pitchers_lookup[] so this stays a fast, cacheable live fetch — a
// league-wide pull of the same data would be many MB and needs a real
// cron pipeline, which is genuinely out of scope for a homepage card.
//
// Two things come out of one fetch, since both live in the same CSV:
//   1. runValueByCount — delta_run_exp averaged by pitch type x count.
//      "Run value" here follows delta_run_exp's own sign convention:
//      NEGATIVE = good for the pitcher (suppresses the batting team's run
//      expectancy), POSITIVE = good for the hitter.
//   2. missProfile — on swinging strikes only, avg miss_distance (inches,
//      real Statcast bat-tracking metric — how far the bat's sweet spot
//      was from the ball) and avg swing_length (inches the bat head
//      traveled), split season vs last 30 days. We deliberately do NOT
//      attempt an "early/late swing" read from intercept_ball_minus_
//      batter_pos_y_inches — its sign convention isn't confirmed against
//      Savant's own docs, and this file follows the same "confirmed, not
//      assumed" bar as abs-challenges.ts.

import { getPitcherFullSeasonGameLog, getPitcherHitsFromGameFeed } from '@/lib/mlb'
import { withSavantCache } from '@/lib/savant-cache'

const SEASON = 2026
// Below this a count bucket's AVERAGED metrics (run value, hard-hit%) are
// too noisy to show — but does NOT gate hitsAllowed/runsAllowed, which are
// exact discrete counts, not averages, so a bucket can appear in
// runValueByCount below this threshold if it has a real hit/run on it.
// Exported so MlbDeepDives.tsx's heatCellStyle can apply the same gate
// per-metric instead of the source silently dropping the row.
export const MIN_COUNT_SAMPLE = 6

// Hit outcomes that count as a "hit" for the hits-allowed cut — matches
// events' own vocabulary, curl-verified against a real pitcher's 2026 log.
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const HARD_HIT_MPH = 95 // Statcast's own standard hard-hit threshold (exit velo >= 95mph)

export type PitchCountRunValue = {
  pitchType: string
  balls: number
  strikes: number
  pitches: number
  avgRunValue: number // delta_run_exp sign convention: negative = good for pitcher
  battedBalls: number // pitches put in play (type === 'X') in this bucket
  hardHitRate: number | null // share of battedBalls at >=95mph exit velo; null = no batted balls to rate
  hitsAllowed: number // events in {single, double, triple, home_run}
  runsAllowed: number // sum of (post_bat_score - bat_score) across pitches in this bucket — runs that scored following these pitches. Close to "RBI given up" but not identical: it also credits runs that score via error or wild pitch, which official RBI scoring excludes. Labeled "Runs allowed" in the UI for that reason.
}

export type ArsenalPitch = {
  pitchType: string
  pitches: number
  pctUsage: number
  // Season-wide, UNFILTERED by MIN_COUNT_SAMPLE (unlike runValueByCount's
  // per-count buckets, which drop any (pitchType, balls, strikes) combo
  // thrown fewer than MIN_COUNT_SAMPLE times to keep the count grid from
  // showing noisy single-pitch cells). The UI's "Total" column promises to
  // reconcile with the pitcher's official season hit/run totals once every
  // arsenal pitch is selected — that promise only holds if hits/runs from
  // low-sample counts aren't silently dropped before summing, so these two
  // fields are accumulated straight off every row, independent of the
  // count-bucket display filter.
  hitsAllowed: number
  runsAllowed: number
}

export type MissWindow = {
  whiffs: number
  avgMissDistanceIn: number | null
  avgSwingLengthIn: number | null
}

export type PitcherStatcastProfile = {
  pitcherId: number
  season: number
  totalPitches: number
  runValueByCount: PitchCountRunValue[]
  arsenal: ArsenalPitch[] // every pitch type this pitcher has actually thrown this season, sorted by usage — not a fixed top-N, so the UI can build per-pitcher toggle buttons
  missSeason: MissWindow
  missLast30: MissWindow
  // Hits recovered from MLB's own official play-by-play feed for outings
  // that Baseball Savant's public per-pitch CSV was missing entirely (see
  // the backfill below getPitcherStatcastProfile) — already folded into
  // arsenal[].hitsAllowed above; kept separately so the UI can say exactly
  // what was recovered instead of a vague "data can be incomplete" hedge.
  hitsBackfill: { games: number; hits: number }
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

export async function getPitcherStatcastProfile(pitcherId: number): Promise<PitcherStatcastProfile | null> {
  return withSavantCache(
    `pitcher-statcast-profile:${pitcherId}:${SEASON}`,
    21600,
    () => fetchPitcherStatcastProfile(pitcherId),
  )
}

async function fetchPitcherStatcastProfile(pitcherId: number): Promise<PitcherStatcastProfile | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${SEASON}%7C&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&game_date_gt=${SEASON}-01-01&game_date_lt=${SEASON}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 }, // 6h — a starter's log doesn't change until his next start
    })
    if (!res.ok) return null
    text = await res.text()
  } catch (err) {
    console.error(`getPitcherStatcastProfile fetch failed (${pitcherId}):`, err)
    return null
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return null

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (name: string) => headers.indexOf(name)
  const iPitchType = idx('pitch_type')
  const iBalls = idx('balls')
  const iStrikes = idx('strikes')
  const iRunExp = idx('delta_run_exp')
  const iDesc = idx('description')
  const iMiss = idx('miss_distance')
  const iSwingLen = idx('swing_length')
  const iDate = idx('game_date')
  const iType = idx('type') // 'S' (strike) | 'B' (ball) | 'X' (ball in play)
  const iEvents = idx('events')
  const iLaunchSpeed = idx('launch_speed')
  const iBatScore = idx('bat_score')
  const iPostBatScore = idx('post_bat_score')
  const iGamePk = idx('game_pk')

  if (iPitchType === -1 || iBalls === -1 || iStrikes === -1 || iRunExp === -1) return null

  const csvGamePks = new Set<number>()
  const countBuckets = new Map<string, {
    pitchType: string; balls: number; strikes: number; sum: number; n: number
    battedBalls: number; hardHitBalls: number; hitsAllowed: number; runsAllowed: number
  }>()
  const arsenalTotals = new Map<string, number>()
  const arsenalHits = new Map<string, number>()
  const arsenalRuns = new Map<string, number>()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  let totalPitches = 0
  const missSeason = { sumMiss: 0, nMiss: 0, sumLen: 0, nLen: 0, whiffs: 0 }
  const missLast30 = { sumMiss: 0, nMiss: 0, sumLen: 0, nLen: 0, whiffs: 0 }

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const pitchType = cells[iPitchType]
    const balls = Number(cells[iBalls])
    const strikes = Number(cells[iStrikes])
    const runExp = Number(cells[iRunExp])
    if (!pitchType || Number.isNaN(balls) || Number.isNaN(strikes) || Number.isNaN(runExp)) continue

    totalPitches++
    arsenalTotals.set(pitchType, (arsenalTotals.get(pitchType) ?? 0) + 1)

    const gamePk = iGamePk !== -1 ? Number(cells[iGamePk]) : NaN
    if (!Number.isNaN(gamePk)) csvGamePks.add(gamePk)

    const key = `${pitchType}-${balls}-${strikes}`
    const bucket = countBuckets.get(key) ?? { pitchType, balls, strikes, sum: 0, n: 0, battedBalls: 0, hardHitBalls: 0, hitsAllowed: 0, runsAllowed: 0 }
    bucket.sum += runExp
    bucket.n += 1

    const pitchTypeCode = iType !== -1 ? cells[iType] : ''
    if (pitchTypeCode === 'X') {
      bucket.battedBalls++
      const ev = iLaunchSpeed !== -1 ? Number(cells[iLaunchSpeed]) : NaN
      if (!Number.isNaN(ev) && ev >= HARD_HIT_MPH) bucket.hardHitBalls++
    }
    const eventName = iEvents !== -1 ? cells[iEvents] : ''
    if (HIT_EVENTS.has(eventName)) {
      bucket.hitsAllowed++
      arsenalHits.set(pitchType, (arsenalHits.get(pitchType) ?? 0) + 1)
    }

    const preScore = iBatScore !== -1 ? Number(cells[iBatScore]) : NaN
    const postScore = iPostBatScore !== -1 ? Number(cells[iPostBatScore]) : NaN
    if (!Number.isNaN(preScore) && !Number.isNaN(postScore) && postScore > preScore) {
      const runs = postScore - preScore
      bucket.runsAllowed += runs
      arsenalRuns.set(pitchType, (arsenalRuns.get(pitchType) ?? 0) + runs)
    }

    countBuckets.set(key, bucket)

    const description = iDesc !== -1 ? cells[iDesc] : ''
    if (description === 'swinging_strike' || description === 'swinging_strike_blocked') {
      const miss = iMiss !== -1 ? Number(cells[iMiss]) : NaN
      const swingLen = iSwingLen !== -1 ? Number(cells[iSwingLen]) : NaN
      const gameDate = iDate !== -1 ? new Date(cells[iDate]) : null
      const isRecent = gameDate ? gameDate >= thirtyDaysAgo : false

      missSeason.whiffs++
      if (!Number.isNaN(miss)) { missSeason.sumMiss += miss; missSeason.nMiss++ }
      if (!Number.isNaN(swingLen)) { missSeason.sumLen += swingLen; missSeason.nLen++ }

      if (isRecent) {
        missLast30.whiffs++
        if (!Number.isNaN(miss)) { missLast30.sumMiss += miss; missLast30.nMiss++ }
        if (!Number.isNaN(swingLen)) { missLast30.sumLen += swingLen; missLast30.nLen++ }
      }
    }
  }

  if (totalPitches === 0) return null

  // Backfill: cross-check the CSV's own game_pk coverage against MLB's
  // authoritative game log. Only outings the official log says had at
  // least one hit AND that never showed up in the CSV at all are worth
  // the extra fetch — most pitchers have zero, so this is a no-op fetch
  // count in the common case, not a per-pitcher tax.
  let backfillGames = 0
  let backfillHits = 0
  try {
    const gameLog = await getPitcherFullSeasonGameLog(pitcherId, SEASON)
    const missingGames = gameLog.filter(g => g.hits > 0 && !csvGamePks.has(g.gamePk))
    if (missingGames.length > 0) {
      const results = await Promise.all(missingGames.map(g => getPitcherHitsFromGameFeed(g.gamePk, pitcherId)))
      for (const hits of results) {
        if (hits.length === 0) continue
        backfillGames++
        for (const h of hits) {
          arsenalHits.set(h.pitchType, (arsenalHits.get(h.pitchType) ?? 0) + 1)
          backfillHits++

          // Also land the hit on its actual (pitchType, balls, strikes) cell,
          // not just the pitch-type row's aggregate — deliberately leaving
          // n/sum (pitches, run-value) untouched since we only know a hit
          // happened here, not the pitch's delta_run_exp. A bucket that
          // exists ONLY because of this (pitches === 0) has no Statcast
          // telemetry at all, just a confirmed hit from MLB's own feed.
          const key = `${h.pitchType}-${h.balls}-${h.strikes}`
          const bucket = countBuckets.get(key) ?? { pitchType: h.pitchType, balls: h.balls, strikes: h.strikes, sum: 0, n: 0, battedBalls: 0, hardHitBalls: 0, hitsAllowed: 0, runsAllowed: 0 }
          bucket.hitsAllowed++
          countBuckets.set(key, bucket)
        }
      }
    }
  } catch (err) {
    console.error(`getPitcherStatcastProfile backfill failed (${pitcherId}):`, err)
  }

  // A bucket clears the bar for display if it has EITHER enough pitches for
  // a meaningful average (run value / hard-hit%) OR at least one hit/run —
  // a hit is a discrete, certain fact even at n=1, not a noisy rate, so the
  // MIN_COUNT_SAMPLE noise filter (meant for averages) shouldn't be able to
  // silently swallow a real recorded hit or run on a rarely-thrown count.
  // The UI itself decides, per metric, whether a low-sample bucket's
  // run-value/hard-hit figure is trustworthy enough to show (see
  // heatCellStyle in MlbDeepDives.tsx) — this only controls what data makes
  // it out of this function at all.
  const runValueByCount: PitchCountRunValue[] = [...countBuckets.values()]
    .filter(b => b.n >= MIN_COUNT_SAMPLE || b.hitsAllowed > 0 || b.runsAllowed !== 0)
    .map(b => ({
      pitchType: b.pitchType,
      balls: b.balls,
      strikes: b.strikes,
      pitches: b.n,
      avgRunValue: b.n > 0 ? Math.round((b.sum / b.n) * 1000) / 1000 : 0,
      battedBalls: b.battedBalls,
      hardHitRate: b.battedBalls > 0 ? Math.round((b.hardHitBalls / b.battedBalls) * 1000) / 1000 : null,
      hitsAllowed: b.hitsAllowed,
      runsAllowed: Math.round(b.runsAllowed * 10) / 10,
    }))

  const arsenal: ArsenalPitch[] = [...arsenalTotals.entries()]
    .map(([pitchType, pitches]) => ({
      pitchType,
      pitches,
      pctUsage: Math.round((pitches / totalPitches) * 1000) / 10,
      hitsAllowed: arsenalHits.get(pitchType) ?? 0,
      runsAllowed: Math.round((arsenalRuns.get(pitchType) ?? 0) * 10) / 10,
    }))
    .sort((a, b) => b.pitches - a.pitches)

  const toWindow = (w: typeof missSeason): MissWindow => ({
    whiffs: w.whiffs,
    avgMissDistanceIn: w.nMiss > 0 ? Math.round((w.sumMiss / w.nMiss) * 10) / 10 : null,
    avgSwingLengthIn: w.nLen > 0 ? Math.round((w.sumLen / w.nLen) * 10) / 10 : null,
  })

  return {
    pitcherId,
    season: SEASON,
    totalPitches,
    runValueByCount,
    arsenal,
    missSeason: toWindow(missSeason),
    missLast30: toWindow(missLast30),
    hitsBackfill: { games: backfillGames, hits: backfillHits },
  }
}
