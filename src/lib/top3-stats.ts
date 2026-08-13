// src/lib/top3-stats.ts
//
// Compiles a fixed set of 20 "top 3" leaderboards off a day's PostgameReport[]
// for the /admin/yesterday-stats A4 printout / PDF export feature.
//
// Every category is a literal derived stat pulled straight off the
// aggregated reports — same discipline as yesterday-stats.ts. Nothing here
// is a model output or a composite score.
//
// TWO CATEGORIES USE A HEURISTIC, FLAGGED HERE AND NOT ELSEWHERE:
// `PitcherGameLine` has no explicit "is this the starter" flag (the MLB
// feed aggregation doesn't attempt to resolve that). For
// `starter-strike-pct`, `most-bullpen-innings`, and `most-pitches-starter`,
// this file treats "the pitcher with the most outsRecorded on the team"
// as the starter. That's right the overwhelming majority of the time, but
// it will misidentify on a true bullpen/opener day where a reliever ends
// up with the most outs. Worth a manual glance on the sheet before you
// tweet from those three specific cards.

import type { PostgameReport, PitcherGameLine, BatterGameLine } from '@/types/postgame'
import type { Top3Category, Top3Entry, Top3StatCategory, Top3StatsPayload } from '@/types/live-tracker'

// ── Cross-reference helpers ─────────────────────────────────────────────
// Several superlatives (fastestPitch, hardestHit, etc.) carry a player id
// and name but not a teamId — cross-reference against the game's own
// pitchers/batters arrays rather than guessing.

function pitcherTeamId(report: PostgameReport, pitcherId: number): number | null {
  return report.pitchers.find(p => p.pitcherId === pitcherId)?.teamId ?? null
}

function batterTeamId(report: PostgameReport, batterId: number): number | null {
  const all = [...report.batters.away, ...report.batters.home]
  return all.find(b => b.batterId === batterId)?.teamId ?? null
}

function teamAbbrOfId(report: PostgameReport, teamId: number | null): string | null {
  if (teamId == null) return null
  if (report.away.teamId === teamId) return report.away.abbreviation
  if (report.home.teamId === teamId) return report.home.abbreviation
  return null
}

function opponentAbbrOfId(report: PostgameReport, teamId: number | null): string | null {
  if (teamId == null) return null
  if (report.away.teamId === teamId) return report.home.abbreviation
  if (report.home.teamId === teamId) return report.away.abbreviation
  return null
}

/** Heuristic starter identification — see file header note. Returns null
 *  if the team has no pitching lines at all (shouldn't happen for a Final
 *  game, but never assume). */
function starterFor(report: PostgameReport, teamId: number): PitcherGameLine | null {
  const teamPitchers = report.pitchers.filter(p => p.teamId === teamId)
  if (teamPitchers.length === 0) return null
  return teamPitchers.reduce((best, p) => (p.outsRecorded > best.outsRecorded ? p : best), teamPitchers[0])
}

function outsToIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

// ── Generic ranking helper ──────────────────────────────────────────────

function top3<T>(sorted: T[], mapFn: (item: T, rank: 1 | 2 | 3) => Top3Entry): Top3Entry[] {
  return sorted.slice(0, 3).map((item, i) => mapFn(item, (i + 1) as 1 | 2 | 3))
}

const CATEGORY_LABEL: Record<Top3StatCategory, string> = {
  'fastest-pitch': 'Fastest Pitch',
  'hardest-hit': 'Hardest Hit (EV)',
  'longest-hr': 'Longest Home Run',
  'most-strikeouts': 'Most Strikeouts',
  'best-swstr-pct': 'Best Swinging-Strike %',
  'multi-hr': 'Multi-HR Games',
  'best-starter-line': 'Best Starter Line',
  'highest-spin': 'Highest Spin Rate',
  'sharpest-break': 'Sharpest Break',
  'longest-at-bat': 'Longest At-Bat',
  'most-patient': 'Most Patient (Pitches Seen)',
  'biggest-inning': 'Biggest Single Inning',
  'blowout-margin': 'Biggest Blowout',
  'most-rbi': 'Most RBI',
  'most-stolen-bases': 'Most Stolen Bases',
  'most-extra-base-hits': 'Most Extra-Base Hits',
  'starter-strike-pct': 'Best Starter Strike %',
  'most-bullpen-innings': 'Most Bullpen Innings',
  'hardest-hit-team': 'Hardest-Hit Team (Hard-Hit %)',
  'most-pitches-starter': 'Most Pitches, a Starter',
}

// Fixed display order — this is what fills the 4x5 grid on the sheet, in
// this exact order. Keep it at 20 if you add/remove a category; the sheet
// layout assumes 20 slots.
const CATEGORY_ORDER: Top3StatCategory[] = [
  'fastest-pitch',
  'hardest-hit',
  'longest-hr',
  'most-strikeouts',
  'best-swstr-pct',
  'multi-hr',
  'best-starter-line',
  'highest-spin',
  'sharpest-break',
  'longest-at-bat',
  'most-patient',
  'biggest-inning',
  'blowout-margin',
  'most-rbi',
  'most-stolen-bases',
  'most-extra-base-hits',
  'starter-strike-pct',
  'most-bullpen-innings',
  'hardest-hit-team',
  'most-pitches-starter',
]

export function compileTop3Stats(reports: PostgameReport[], date: string, gamesMissing: number): Top3StatsPayload {
  const byCategory: Record<Top3StatCategory, Top3Entry[]> = {} as Record<Top3StatCategory, Top3Entry[]>

  // 1. Fastest pitch
  byCategory['fastest-pitch'] = top3(
    reports
      .map(r => (r.superlatives.fastestPitch ? { r, v: r.superlatives.fastestPitch } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.speed - a.v.speed),
    ({ r, v }, rank) => {
      const teamId = pitcherTeamId(r, v.pitcherId)
      return {
        rank, playerId: v.pitcherId, playerName: v.pitcherName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.speed} mph`, detail: `${v.typeDescription} · ${v.inning}th`, gameSlug: r.slug,
      }
    }
  )

  // 2. Hardest hit (exit velo)
  byCategory['hardest-hit'] = top3(
    reports
      .map(r => (r.superlatives.hardestHit ? { r, v: r.superlatives.hardestHit } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.exitVelo - a.v.exitVelo),
    ({ r, v }, rank) => {
      const teamId = batterTeamId(r, v.batterId)
      return {
        rank, playerId: v.batterId, playerName: v.batterName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.exitVelo} mph`, detail: v.resultEvent.replace(/_/g, ' '), gameSlug: r.slug,
      }
    }
  )

  // 3. Longest home run — from battedBalls filtered to actual HRs, not
  // superlatives.longestHit (which can be any hit type)
  byCategory['longest-hr'] = top3(
    reports
      .flatMap(r => r.battedBalls
        .filter(b => b.resultEvent === 'home_run' && b.totalDistance != null)
        .map(b => ({ r, b })))
      .sort((a, b) => (b.b.totalDistance ?? 0) - (a.b.totalDistance ?? 0)),
    ({ r, b }, rank) => ({
      rank, playerId: b.batterId, playerName: b.batterName,
      teamId: b.battingTeamId, teamAbbr: teamAbbrOfId(r, b.battingTeamId), opponentAbbr: opponentAbbrOfId(r, b.battingTeamId),
      value: `${b.totalDistance} ft`, detail: `${b.inning}th inning`, gameSlug: r.slug,
    })
  )

  // 4. Most strikeouts (any pitcher)
  const allPitcherLines = reports.flatMap(r => r.pitchers.map(p => ({ r, p })))
  byCategory['most-strikeouts'] = top3(
    [...allPitcherLines].sort((a, b) => b.p.strikeouts - a.p.strikeouts),
    ({ r, p }, rank) => ({
      rank, playerId: p.pitcherId, playerName: p.pitcherName,
      teamId: p.teamId, teamAbbr: teamAbbrOfId(r, p.teamId), opponentAbbr: opponentAbbrOfId(r, p.teamId),
      value: `${p.strikeouts} K`, detail: `${outsToIp(p.outsRecorded)} IP`, gameSlug: r.slug,
    })
  )

  // 5. Best swinging-strike % (min 40 pitches, so a 2-batter relief outing can't dominate)
  byCategory['best-swstr-pct'] = top3(
    allPitcherLines
      .filter(({ p }) => p.pitchesThrown >= 40)
      .sort((a, b) => b.p.swingMiss.swStrPct - a.p.swingMiss.swStrPct),
    ({ r, p }, rank) => ({
      rank, playerId: p.pitcherId, playerName: p.pitcherName,
      teamId: p.teamId, teamAbbr: teamAbbrOfId(r, p.teamId), opponentAbbr: opponentAbbrOfId(r, p.teamId),
      value: `${p.swingMiss.swStrPct}%`, detail: `${p.pitchesThrown} pitches`, gameSlug: r.slug,
    })
  )

  // 6. Multi-HR games
  const allBatterLines = reports.flatMap(r => [...r.batters.away, ...r.batters.home].map(b => ({ r, b })))
  byCategory['multi-hr'] = top3(
    allBatterLines
      .filter(({ b }) => b.homeRuns >= 2)
      .sort((a, b) => b.b.homeRuns - a.b.homeRuns),
    ({ r, b }, rank) => ({
      rank, playerId: b.batterId, playerName: b.batterName,
      teamId: b.teamId, teamAbbr: teamAbbrOfId(r, b.teamId), opponentAbbr: opponentAbbrOfId(r, b.teamId),
      value: `${b.homeRuns} HR`, detail: `${b.rbi} RBI`, gameSlug: r.slug,
    })
  )

  // 7. Best starter line — min 4 IP, sorted by outs recorded then earned runs (stated, not hidden)
  byCategory['best-starter-line'] = top3(
    allPitcherLines
      .filter(({ p }) => p.outsRecorded >= 12)
      .sort((a, b) => b.p.outsRecorded - a.p.outsRecorded || a.p.earnedRunsAllowed - b.p.earnedRunsAllowed),
    ({ r, p }, rank) => ({
      rank, playerId: p.pitcherId, playerName: p.pitcherName,
      teamId: p.teamId, teamAbbr: teamAbbrOfId(r, p.teamId), opponentAbbr: opponentAbbrOfId(r, p.teamId),
      value: `${outsToIp(p.outsRecorded)} IP`, detail: `${p.earnedRunsAllowed} ER, ${p.strikeouts} K`, gameSlug: r.slug,
    })
  )

  // 8. Highest spin rate
  byCategory['highest-spin'] = top3(
    reports
      .map(r => (r.superlatives.highestSpin ? { r, v: r.superlatives.highestSpin } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.spinRate - a.v.spinRate),
    ({ r, v }, rank) => {
      const teamId = pitcherTeamId(r, v.pitcherId)
      return {
        rank, playerId: v.pitcherId, playerName: v.pitcherName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.spinRate} rpm`, detail: v.typeDescription, gameSlug: r.slug,
      }
    }
  )

  // 9. Sharpest break
  byCategory['sharpest-break'] = top3(
    reports
      .map(r => (r.superlatives.mostBreak ? { r, v: r.superlatives.mostBreak } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.breakLength - a.v.breakLength),
    ({ r, v }, rank) => {
      const teamId = pitcherTeamId(r, v.pitcherId)
      return {
        rank, playerId: v.pitcherId, playerName: v.pitcherName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.breakLength}"`, detail: v.typeDescription, gameSlug: r.slug,
      }
    }
  )

  // 10. Longest at-bat
  byCategory['longest-at-bat'] = top3(
    reports
      .map(r => (r.superlatives.longestAtBat ? { r, v: r.superlatives.longestAtBat } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.pitches - a.v.pitches),
    ({ r, v }, rank) => {
      const teamId = batterTeamId(r, v.batterId)
      return {
        rank, playerId: v.batterId, playerName: v.batterName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.pitches} pitches`, detail: `vs ${v.pitcherName}`, gameSlug: r.slug,
      }
    }
  )

  // 11. Most patient (pitches seen)
  byCategory['most-patient'] = top3(
    reports
      .map(r => (r.superlatives.mostPatientBatter ? { r, v: r.superlatives.mostPatientBatter } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.pitchesSeen - a.v.pitchesSeen),
    ({ r, v }, rank) => {
      const teamId = batterTeamId(r, v.batterId)
      return {
        rank, playerId: v.batterId, playerName: v.batterName,
        teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.pitchesSeen} pitches`, detail: `${v.plateAppearances} PA`, gameSlug: r.slug,
      }
    }
  )

  // 12. Biggest single inning
  byCategory['biggest-inning'] = top3(
    reports
      .map(r => (r.superlatives.biggestInning ? { r, v: r.superlatives.biggestInning } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.v.runs - a.v.runs),
    ({ r, v }, rank) => {
      const teamId = v.teamAbbreviation === r.away.abbreviation ? r.away.teamId
        : v.teamAbbreviation === r.home.abbreviation ? r.home.teamId : null
      return {
        rank, playerId: null, playerName: null,
        teamId, teamAbbr: v.teamAbbreviation, opponentAbbr: opponentAbbrOfId(r, teamId),
        value: `${v.runs} runs`, detail: `${v.inning}th inning`, gameSlug: r.slug,
      }
    }
  )

  // 13. Biggest blowout
  byCategory['blowout-margin'] = top3(
    reports
      .map(r => {
        const margin = Math.abs(r.finalAwayScore - r.finalHomeScore)
        const winnerIsHome = r.finalHomeScore > r.finalAwayScore
        return {
          r, margin,
          winnerTeamId: winnerIsHome ? r.home.teamId : r.away.teamId,
          winnerAbbr: winnerIsHome ? r.home.abbreviation : r.away.abbreviation,
          loserAbbr: winnerIsHome ? r.away.abbreviation : r.home.abbreviation,
        }
      })
      .sort((a, b) => b.margin - a.margin),
    ({ r, margin, winnerTeamId, winnerAbbr, loserAbbr }, rank) => ({
      rank, playerId: null, playerName: null,
      teamId: winnerTeamId, teamAbbr: winnerAbbr, opponentAbbr: loserAbbr,
      value: `+${margin}`, detail: `beat ${loserAbbr} by ${margin}`, gameSlug: r.slug,
    })
  )

  // 14. Most RBI
  byCategory['most-rbi'] = top3(
    [...allBatterLines].sort((a, b) => b.b.rbi - a.b.rbi),
    ({ r, b }, rank) => ({
      rank, playerId: b.batterId, playerName: b.batterName,
      teamId: b.teamId, teamAbbr: teamAbbrOfId(r, b.teamId), opponentAbbr: opponentAbbrOfId(r, b.teamId),
      value: `${b.rbi} RBI`, detail: `${b.hits}-for-${b.atBats}`, gameSlug: r.slug,
    })
  )

  // 15. Most stolen bases
  byCategory['most-stolen-bases'] = top3(
    allBatterLines
      .filter(({ b }) => b.stolenBases >= 1)
      .sort((a, b) => b.b.stolenBases - a.b.stolenBases),
    ({ r, b }, rank) => ({
      rank, playerId: b.batterId, playerName: b.batterName,
      teamId: b.teamId, teamAbbr: teamAbbrOfId(r, b.teamId), opponentAbbr: opponentAbbrOfId(r, b.teamId),
      value: `${b.stolenBases} SB`, detail: `${b.runsScored} R`, gameSlug: r.slug,
    })
  )

  // 16. Most extra-base hits
  byCategory['most-extra-base-hits'] = top3(
    allBatterLines
      .map(({ r, b }) => ({ r, b, xbh: b.doubles + b.triples + b.homeRuns }))
      .filter(({ xbh }) => xbh >= 1)
      .sort((a, b) => b.xbh - a.xbh),
    ({ r, b, xbh }, rank) => ({
      rank, playerId: b.batterId, playerName: b.batterName,
      teamId: b.teamId, teamAbbr: teamAbbrOfId(r, b.teamId), opponentAbbr: opponentAbbrOfId(r, b.teamId),
      value: `${xbh} XBH`, detail: `${b.doubles} 2B, ${b.triples} 3B, ${b.homeRuns} HR`, gameSlug: r.slug,
    })
  )

  // 17. Best starter strike % — heuristic starter identification, see file header
  const starterLines: { r: PostgameReport; p: PitcherGameLine }[] = []
  for (const r of reports) {
    for (const teamId of [r.away.teamId, r.home.teamId]) {
      const s = starterFor(r, teamId)
      if (s && s.pitchesThrown > 0) starterLines.push({ r, p: s })
    }
  }
  byCategory['starter-strike-pct'] = top3(
    [...starterLines].sort((a, b) => (b.p.strikesThrown / b.p.pitchesThrown) - (a.p.strikesThrown / a.p.pitchesThrown)),
    ({ r, p }, rank) => ({
      rank, playerId: p.pitcherId, playerName: p.pitcherName,
      teamId: p.teamId, teamAbbr: teamAbbrOfId(r, p.teamId), opponentAbbr: opponentAbbrOfId(r, p.teamId),
      value: `${((p.strikesThrown / p.pitchesThrown) * 100).toFixed(1)}%`,
      detail: `${p.strikesThrown}/${p.pitchesThrown} pitches`, gameSlug: r.slug,
    })
  )

  // 18. Most bullpen innings — total team outsRecorded minus the identified starter's outs
  const bullpenLines: { r: PostgameReport; teamId: number; outs: number }[] = []
  for (const r of reports) {
    for (const teamId of [r.away.teamId, r.home.teamId]) {
      const teamPitchers = r.pitchers.filter(p => p.teamId === teamId)
      if (teamPitchers.length === 0) continue
      const starter = starterFor(r, teamId)
      const totalOuts = teamPitchers.reduce((sum, p) => sum + p.outsRecorded, 0)
      const bullpenOuts = starter ? totalOuts - starter.outsRecorded : totalOuts
      if (bullpenOuts > 0) bullpenLines.push({ r, teamId, outs: bullpenOuts })
    }
  }
  byCategory['most-bullpen-innings'] = top3(
    [...bullpenLines].sort((a, b) => b.outs - a.outs),
    ({ r, teamId, outs }, rank) => ({
      rank, playerId: null, playerName: null,
      teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
      value: `${outsToIp(outs)} IP`, detail: 'bullpen total', gameSlug: r.slug,
    })
  )

  // 19. Hardest-hit team (hard-hit %) — min 15 balls in play so a rain-shortened game doesn't skew it
  const hardHitLines: { r: PostgameReport; teamId: number; abbr: string; pct: number; balls: number }[] = []
  for (const r of reports) {
    const pairs: [number, typeof r.battedBallMix.away][] = [
      [r.away.teamId, r.battedBallMix.away],
      [r.home.teamId, r.battedBallMix.home],
    ]
    for (const [teamId, mix] of pairs) {
      if (mix.ballsInPlay >= 15) {
        hardHitLines.push({ r, teamId, abbr: teamAbbrOfId(r, teamId) ?? '', pct: mix.hardHitPct, balls: mix.ballsInPlay })
      }
    }
  }
  byCategory['hardest-hit-team'] = top3(
    [...hardHitLines].sort((a, b) => b.pct - a.pct),
    ({ r, teamId, pct, balls }, rank) => ({
      rank, playerId: null, playerName: null,
      teamId, teamAbbr: teamAbbrOfId(r, teamId), opponentAbbr: opponentAbbrOfId(r, teamId),
      value: `${pct}%`, detail: `${balls} balls in play`, gameSlug: r.slug,
    })
  )

  // 20. Most pitches thrown by a starter — heuristic starter identification, see file header
  byCategory['most-pitches-starter'] = top3(
    [...starterLines].sort((a, b) => b.p.pitchesThrown - a.p.pitchesThrown),
    ({ r, p }, rank) => ({
      rank, playerId: p.pitcherId, playerName: p.pitcherName,
      teamId: p.teamId, teamAbbr: teamAbbrOfId(r, p.teamId), opponentAbbr: opponentAbbrOfId(r, p.teamId),
      value: `${p.pitchesThrown} pitches`, detail: `${outsToIp(p.outsRecorded)} IP`, gameSlug: r.slug,
    })
  )

  const categories: Top3Category[] = CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABEL[category],
    entries: byCategory[category],
  }))

  return { date, gamesIncluded: reports.length, gamesMissing, categories }
}