// src/lib/yesterday-stats.ts
//
// Cross-game leaderboard compiler — takes every PostgameReport from a day's
// slate and ranks out a curated set of tweet-draftable nuggets. Quotas per
// category sum to 30 by design (see CATEGORY_QUOTAS); if a day's actual
// data is sparse in a category (e.g. no multi-HR games), the total comes in
// under 30 rather than padding with weak entries — better a short list than
// a diluted one.
//
// Every value here is a literal derived stat pulled straight off the
// aggregated reports. No ranking is a proprietary score — "best pitching
// line" below is sorted by outs recorded then earned runs allowed, which is
// stated plainly, not hidden behind a composite number.

import type { PostgameReport } from '@/types/postgame'
import type { StatNugget, StatNuggetCategory, YesterdayStatsPayload } from '@/types/live-tracker'

const CATEGORY_QUOTAS: Record<StatNuggetCategory, number> = {
  'fastest-pitch': 4,
  'hardest-hit': 4,
  'longest-hit': 3,
  'strikeouts': 4,
  'swinging-strike-pct': 3,
  'multi-hr': 3,
  'best-pitching-line': 3,
  'longest-at-bat': 2,
  'most-patient': 2,
  'biggest-inning': 1,
  'blowout-margin': 1,
}

let idCounter = 0
function nextId(category: string): string {
  idCounter += 1
  return `${category}-${idCounter}`
}

export function compileYesterdayStats(reports: PostgameReport[], date: string, gamesMissing: number): YesterdayStatsPayload {
  idCounter = 0
  const nuggets: StatNugget[] = []

  // fastest pitch
  push(nuggets, 'fastest-pitch', reports
    .map(r => r.superlatives.fastestPitch ? { r, v: r.superlatives.fastestPitch } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.speed - a.v.speed)
    .map(({ r, v }, i) => ({
      id: nextId('fastest-pitch'), category: 'fastest-pitch' as const, rank: i + 1,
      headline: `${v.pitcherName} hit ${v.speed} mph with the ${v.typeDescription.toLowerCase()}`,
      value: `${v.speed} mph`, playerName: v.pitcherName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // hardest hit
  push(nuggets, 'hardest-hit', reports
    .map(r => r.superlatives.hardestHit ? { r, v: r.superlatives.hardestHit } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.exitVelo - a.v.exitVelo)
    .map(({ r, v }, i) => ({
      id: nextId('hardest-hit'), category: 'hardest-hit' as const, rank: i + 1,
      headline: `${v.batterName} barreled one at ${v.exitVelo} mph`,
      value: `${v.exitVelo} mph`, playerName: v.batterName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // longest hit
  push(nuggets, 'longest-hit', reports
    .map(r => r.superlatives.longestHit ? { r, v: r.superlatives.longestHit } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.distance - a.v.distance)
    .map(({ r, v }, i) => ({
      id: nextId('longest-hit'), category: 'longest-hit' as const, rank: i + 1,
      headline: `${v.batterName} hit one ${v.distance} feet`,
      value: `${v.distance} ft`, playerName: v.batterName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // strikeouts, any pitcher
  const allPitcherLines = reports.flatMap(r => r.pitchers.map(p => ({ r, p })))
  push(nuggets, 'strikeouts', allPitcherLines
    .sort((a, b) => b.p.strikeouts - a.p.strikeouts)
    .slice(0, 10)
    .map(({ r, p }, i) => ({
      id: nextId('strikeouts'), category: 'strikeouts' as const, rank: i + 1,
      headline: `${p.pitcherName} struck out ${p.strikeouts} over ${Math.floor(p.outsRecorded / 3)}.${p.outsRecorded % 3} IP`,
      value: `${p.strikeouts} K`, playerName: p.pitcherName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // swinging strike % (min 40 pitches so a two-batter relief outing doesn't dominate)
  push(nuggets, 'swinging-strike-pct', allPitcherLines
    .filter(({ p }) => p.pitchesThrown >= 40)
    .sort((a, b) => b.p.swingMiss.swStrPct - a.p.swingMiss.swStrPct)
    .map(({ r, p }, i) => ({
      id: nextId('swstr'), category: 'swinging-strike-pct' as const, rank: i + 1,
      headline: `${p.pitcherName} ran a ${p.swingMiss.swStrPct}% swinging-strike rate`,
      value: `${p.swingMiss.swStrPct}%`, playerName: p.pitcherName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // multi-HR
  const allBatterLines = reports.flatMap(r => [...r.batters.away, ...r.batters.home].map(b => ({ r, b })))
  push(nuggets, 'multi-hr', allBatterLines
    .filter(({ b }) => b.homeRuns >= 2)
    .sort((a, b) => b.b.homeRuns - a.b.homeRuns)
    .map(({ r, b }, i) => ({
      id: nextId('multi-hr'), category: 'multi-hr' as const, rank: i + 1,
      headline: `${b.batterName} hit ${b.homeRuns} home runs`,
      value: `${b.homeRuns} HR`, playerName: b.batterName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // best pitching line — sorted plainly by outs recorded then earned runs,
  // stated as such, not a hidden composite score
  push(nuggets, 'best-pitching-line', allPitcherLines
    .filter(({ p }) => p.outsRecorded >= 12) // at least 4 IP
    .sort((a, b) => b.p.outsRecorded - a.p.outsRecorded || a.p.earnedRunsAllowed - b.p.earnedRunsAllowed)
    .map(({ r, p }, i) => ({
      id: nextId('best-line'), category: 'best-pitching-line' as const, rank: i + 1,
      headline: `${p.pitcherName}: ${Math.floor(p.outsRecorded / 3)}.${p.outsRecorded % 3} IP, ${p.earnedRunsAllowed} ER, ${p.strikeouts} K`,
      value: `${Math.floor(p.outsRecorded / 3)}.${p.outsRecorded % 3} IP`, playerName: p.pitcherName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // longest at-bat
  push(nuggets, 'longest-at-bat', reports
    .map(r => r.superlatives.longestAtBat ? { r, v: r.superlatives.longestAtBat } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.pitches - a.v.pitches)
    .map(({ r, v }, i) => ({
      id: nextId('longest-ab'), category: 'longest-at-bat' as const, rank: i + 1,
      headline: `${v.batterName} fought off ${v.pitches} pitches from ${v.pitcherName}`,
      value: `${v.pitches} pitches`, playerName: v.batterName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // most patient
  push(nuggets, 'most-patient', reports
    .map(r => r.superlatives.mostPatientBatter ? { r, v: r.superlatives.mostPatientBatter } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.pitchesSeen - a.v.pitchesSeen)
    .map(({ r, v }, i) => ({
      id: nextId('patient'), category: 'most-patient' as const, rank: i + 1,
      headline: `${v.batterName} saw ${v.pitchesSeen} pitches in ${v.plateAppearances} plate appearances`,
      value: `${v.pitchesSeen} pitches`, playerName: v.batterName, teamAbbr: null, opponentAbbr: null, gameSlug: r.slug,
    })))

  // biggest inning
  push(nuggets, 'biggest-inning', reports
    .map(r => r.superlatives.biggestInning ? { r, v: r.superlatives.biggestInning } : null)
    .filter(nonNull)
    .sort((a, b) => b.v.runs - a.v.runs)
    .map(({ r, v }, i) => ({
      id: nextId('big-inning'), category: 'biggest-inning' as const, rank: i + 1,
      headline: `${v.teamAbbreviation} scored ${v.runs} runs in one inning`,
      value: `${v.runs} runs`, playerName: null, teamAbbr: v.teamAbbreviation, opponentAbbr: null, gameSlug: r.slug,
    })))

  // blowout margin
  push(nuggets, 'blowout-margin', reports
    .map(r => {
      const margin = Math.abs(r.finalAwayScore - r.finalHomeScore)
      const winner = r.finalHomeScore > r.finalAwayScore ? r.home.abbreviation : r.away.abbreviation
      const loser = r.finalHomeScore > r.finalAwayScore ? r.away.abbreviation : r.home.abbreviation
      return { r, margin, winner, loser }
    })
    .sort((a, b) => b.margin - a.margin)
    .map(({ r, margin, winner, loser }, i) => ({
      id: nextId('blowout'), category: 'blowout-margin' as const, rank: i + 1,
      headline: `${winner} beat ${loser} by ${margin} runs`,
      value: `${margin}-run margin`, playerName: null, teamAbbr: winner, opponentAbbr: loser, gameSlug: r.slug,
    })))

  return {
    date,
    gamesIncluded: reports.length,
    gamesMissing,
    nuggets: nuggets.slice(0, 30),
  }
}

function push(target: StatNugget[], category: StatNuggetCategory, ranked: StatNugget[]) {
  target.push(...ranked.slice(0, CATEGORY_QUOTAS[category]))
}

function nonNull<T>(x: T | null): x is T {
  return x !== null
}
