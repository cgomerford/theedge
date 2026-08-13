// src/lib/nfl-scout.ts
//
// THE NFL SCOUT REPORT — pure selector, v1 (team-level).
//
// Mirrors src/lib/scout.ts's shape and discipline: weighted candidate
// rows, per-team selection targets, never fabricate, degraded-note when
// short. The MLB version leans on pitcher arsenal + lineup matchup data;
// this v1 leans on ESPN's season team totals (see nfl-team-stats.ts).
//
// HONEST LIMITATION vs the MLB version: scout.ts can say "this pitcher's
// slider matches up against this specific lineup's known weakness vs
// sliders" — a real matchup cross-reference. This file cannot do that
// yet. It can only say "this team's pass offense ranks well/poorly" and
// "this team's defense ranks well/poorly" — two season-long facts sitting
// next to each other, not a verified interaction between them. Label
// these as team-strength rows, not matchup rows, until athlete-level
// splits are wired and a real cross-reference (e.g. "this team's
// pass rush ranks well AND faces a QB who gets sacked a lot") is built
// deliberately with its own weighting, the way scout.ts's chase-vs-putaway
// rows were.

import type { NFLTeamStatsForScout, NFLStatValue } from './team-stats'

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type NFLScoutSection = 'passing' | 'rushing' | 'defense' | 'situational' | 'specialTeams'
export type NFLScoutLean = 'home' | 'away' | 'neutral'

export type NFLScoutRow = {
  id: string
  section: NFLScoutSection
  subsection: string
  line: string
  highlight?: string
  lean: NFLScoutLean
  leanLabel: string
  sampleTag: string
  weight: number
}

export type NFLScoutReport = {
  rows: NFLScoutRow[]
  targetCount: number
  actualCount: number
  bySection: Record<NFLScoutSection, NFLScoutRow[]>
  degradedNote: string | null
  previewStrip: { passing?: NFLScoutRow; defense?: NFLScoutRow; situational?: NFLScoutRow }
  keyEdges: NFLScoutRow[]
}

export type NFLScoutInputs = {
  homeAbbr: string
  awayAbbr: string
  homeTeamName: string
  awayTeamName: string
  homeStats: NFLTeamStatsForScout | null
  awayStats: NFLTeamStatsForScout | null
}

// ─── Per-team targets — deliberately smaller than MLB's, because
// team-level season stats run out of real signal faster than MLB's
// per-pitch arsenal data does. Padding past this to hit a bigger number
// would mean manufacturing filler rows from noise. ──────────────────
const PER_TEAM_TARGETS = {
  passing: 2,
  rushing: 1,
  defense: 2,
  specialTeams: 1,
} as const

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

function ord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function ownLean(ownAbbr: string, homeAbbr: string): NFLScoutLean {
  return ownAbbr === homeAbbr ? 'home' : 'away'
}

function oppLean(lean: NFLScoutLean): NFLScoutLean {
  if (lean === 'home') return 'away'
  if (lean === 'away') return 'home'
  return 'neutral'
}

// Rank-based strength check — ESPN gives us rank out of 32 teams
// directly, which is a cleaner signal than the arbitrary numeric
// thresholds scout.ts had to invent for MLB stats without built-in ranks.
const STRONG_RANK = 8   // top quarter of the league
const WEAK_RANK = 24    // bottom quarter of the league (33 - 8)

function isStrong(stat: NFLStatValue | null): boolean {
  return stat?.rank != null && stat.rank <= STRONG_RANK
}
function isWeak(stat: NFLStatValue | null): boolean {
  return stat?.rank != null && stat.rank >= WEAK_RANK
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 1 · PASSING
// ─────────────────────────────────────────────────────────────────────

function buildPassingRows(
  team: NFLTeamStatsForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): NFLScoutRow[] {
  if (!team) return []
  const rows: NFLScoutRow[] = []
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg = oppLean(leanPos)
  const sub = `${team.team_name} passing`

  const qbr = team.qbRating
  if (qbr && (isStrong(qbr) || isWeak(qbr))) {
    const strong = isStrong(qbr)
    rows.push({
      id: `passing-${ownAbbr}-qbr`,
      section: 'passing',
      subsection: sub,
      line: strong
        ? `Passer rating ${qbr.displayValue} (${qbr.rankDisplayValue} in NFL).`
        : `Passer rating ${qbr.displayValue} (${qbr.rankDisplayValue} in NFL) — below-average through the air.`,
      highlight: qbr.displayValue,
      lean: strong ? leanPos : leanNeg,
      leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: strong ? 88 : 82,
    })
  }

  const ypa = team.yardsPerPassAttempt
  if (ypa && (isStrong(ypa) || isWeak(ypa))) {
    const strong = isStrong(ypa)
    rows.push({
      id: `passing-${ownAbbr}-ypa`,
      section: 'passing',
      subsection: sub,
      line: strong
        ? `${ypa.displayValue} yards/attempt (${ypa.rankDisplayValue}) — pushing the ball down the field.`
        : `${ypa.displayValue} yards/attempt (${ypa.rankDisplayValue}) — short, low-explosive passing game.`,
      highlight: `${ypa.displayValue} Y/A`,
      lean: strong ? leanPos : leanNeg,
      leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: strong ? 76 : 68,
    })
  }

  // Sacks taken: using raw value thresholds, not ESPN's `rank` field.
  // We haven't confirmed which direction ESPN ranks this stat (does
  // rank 1 mean fewest sacks allowed, or most?) — verify against a
  // second team's JSON before trusting isStrong()/isWeak() on this one.
  const sacks = team.sacksTaken
  if (sacks && sacks.value >= 45) {
    rows.push({
      id: `passing-${ownAbbr}-sacks-high`,
      section: 'passing',
      subsection: sub,
      line: `${sacks.displayValue} sacks allowed this season — protection has been an issue.`,
      highlight: `${sacks.displayValue} sacks`,
      lean: leanNeg,
      leanLabel: `${oppAbbr} +`,
      sampleTag: 'season total · ESPN',
      weight: 70,
    })
  } else if (sacks && sacks.value <= 20) {
    rows.push({
      id: `passing-${ownAbbr}-sacks-low`,
      section: 'passing',
      subsection: sub,
      line: `Only ${sacks.displayValue} sacks allowed this season — clean pocket.`,
      highlight: `${sacks.displayValue} sacks`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season total · ESPN',
      weight: 64,
    })
  }

  const intPct = team.interceptionPct
  if (intPct && intPct.value >= 3.2) {
    rows.push({
      id: `passing-${ownAbbr}-int-high`,
      section: 'passing',
      subsection: sub,
      line: `Interception rate ${intPct.displayValue}% — turnover-prone through the air.`,
      highlight: `${intPct.displayValue}% INT`,
      lean: leanNeg,
      leanLabel: `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 74,
    })
  } else if (intPct && intPct.value <= 1.5) {
    rows.push({
      id: `passing-${ownAbbr}-int-low`,
      section: 'passing',
      subsection: sub,
      line: `Interception rate ${intPct.displayValue}% — takes care of the ball.`,
      highlight: `${intPct.displayValue}% INT`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 60,
    })
  }

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 2 · RUSHING
// ─────────────────────────────────────────────────────────────────────

function buildRushingRows(
  team: NFLTeamStatsForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): NFLScoutRow[] {
  if (!team) return []
  const rows: NFLScoutRow[] = []
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg = oppLean(leanPos)
  const sub = `${team.team_name} rushing`

  const ypc = team.yardsPerRushAttempt
  if (ypc && (isStrong(ypc) || isWeak(ypc))) {
    const strong = isStrong(ypc)
    rows.push({
      id: `rushing-${ownAbbr}-ypc`,
      section: 'rushing',
      subsection: sub,
      line: strong
        ? `${ypc.displayValue} yards/carry (${ypc.rankDisplayValue}) — moving the ball on the ground.`
        : `${ypc.displayValue} yards/carry (${ypc.rankDisplayValue}) — struggling to establish the run.`,
      highlight: `${ypc.displayValue} Y/C`,
      lean: strong ? leanPos : leanNeg,
      leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: strong ? 72 : 66,
    })
  }

  const bigPlays = team.rushingBigPlays
  if (bigPlays && isStrong(bigPlays)) {
    rows.push({
      id: `rushing-${ownAbbr}-big`,
      section: 'rushing',
      subsection: sub,
      line: `${bigPlays.displayValue} rushes of 20+ yards (${bigPlays.rankDisplayValue}) — explosive when it breaks.`,
      highlight: `${bigPlays.displayValue} big runs`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 58,
    })
  }

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 3 · DEFENSE
// ─────────────────────────────────────────────────────────────────────

function buildDefenseRows(
  team: NFLTeamStatsForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): NFLScoutRow[] {
  if (!team) return []
  const rows: NFLScoutRow[] = []
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg = oppLean(leanPos)
  const sub = `${team.team_name} defense`

  const sacks = team.defSacks
  if (sacks && isStrong(sacks)) {
    rows.push({
      id: `defense-${ownAbbr}-sacks`,
      section: 'defense',
      subsection: sub,
      line: `${sacks.displayValue} sacks (${sacks.rankDisplayValue}) — gets to the quarterback.`,
      highlight: `${sacks.displayValue} sacks`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 84,
    })
  } else if (sacks && isWeak(sacks)) {
    rows.push({
      id: `defense-${ownAbbr}-sacks-low`,
      section: 'defense',
      subsection: sub,
      line: `Only ${sacks.displayValue} sacks (${sacks.rankDisplayValue}) — limited pass rush.`,
      highlight: `${sacks.displayValue} sacks`,
      lean: leanNeg,
      leanLabel: `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 78,
    })
  }

  const tfl = team.tacklesForLoss
  if (tfl && isStrong(tfl)) {
    rows.push({
      id: `defense-${ownAbbr}-tfl`,
      section: 'defense',
      subsection: sub,
      line: `${tfl.displayValue} tackles for loss (${tfl.rankDisplayValue}) — disruptive up front.`,
      highlight: `${tfl.displayValue} TFL`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 70,
    })
  }

  const pd = team.passesDefended
  if (pd && isStrong(pd)) {
    rows.push({
      id: `defense-${ownAbbr}-pd`,
      section: 'defense',
      subsection: sub,
      line: `${pd.displayValue} passes defended (${pd.rankDisplayValue}) — active secondary.`,
      highlight: `${pd.displayValue} PD`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 66,
    })
  } else if (pd && isWeak(pd)) {
    rows.push({
      id: `defense-${ownAbbr}-pd-low`,
      section: 'defense',
      subsection: sub,
      line: `Only ${pd.displayValue} passes defended (${pd.rankDisplayValue}) — coverage has been vulnerable.`,
      highlight: `${pd.displayValue} PD`,
      lean: leanNeg,
      leanLabel: `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 72,
    })
  }

  const ints = team.defInterceptions
  if (ints && isStrong(ints)) {
    rows.push({
      id: `defense-${ownAbbr}-int`,
      section: 'defense',
      subsection: sub,
      line: `${ints.displayValue} interceptions (${ints.rankDisplayValue}) — takes the ball away through the air.`,
      highlight: `${ints.displayValue} INT`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 62,
    })
  }

  // `hurries` deliberately excluded — see the caveat in nfl-team-stats.ts.
  // Do not add a hurries row here until that field is re-verified.

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 4 · SITUATIONAL (shared, not per-team-target-gated)
// ─────────────────────────────────────────────────────────────────────

function buildSituationalRows(inputs: NFLScoutInputs): NFLScoutRow[] {
  const rows: NFLScoutRow[] = []
  const { homeStats, awayStats, homeAbbr, awayAbbr } = inputs

  for (const [team, ownAbbr, oppAbbr, leanPos] of [
    [homeStats, homeAbbr, awayAbbr, 'home' as NFLScoutLean],
    [awayStats, awayAbbr, homeAbbr, 'away' as NFLScoutLean],
  ] as const) {
    if (!team) continue
    const leanNeg = oppLean(leanPos)

    const rz = team.redzoneScoringPct
    if (rz && (isStrong(rz) || isWeak(rz))) {
      const strong = isStrong(rz)
      rows.push({
        id: `situational-${ownAbbr}-rz`,
        section: 'situational',
        subsection: team.team_name,
        line: strong
          ? `Red zone scoring ${rz.displayValue}% (${rz.rankDisplayValue}) — finishes drives.`
          : `Red zone scoring ${rz.displayValue}% (${rz.rankDisplayValue}) — stalls out close to the goal line.`,
        highlight: `${rz.displayValue}% RZ`,
        lean: strong ? leanPos : leanNeg,
        leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
        sampleTag: 'season · ESPN',
        weight: strong ? 80 : 76,
      })
    }

    const third = team.thirdDownConvPct
    if (third && (isStrong(third) || isWeak(third))) {
      const strong = isStrong(third)
      rows.push({
        id: `situational-${ownAbbr}-3rd`,
        section: 'situational',
        subsection: team.team_name,
        line: strong
          ? `3rd down conversion ${third.displayValue}% (${third.rankDisplayValue}) — keeps drives alive.`
          : `3rd down conversion ${third.displayValue}% (${third.rankDisplayValue}) — struggles to move the chains.`,
        highlight: `${third.displayValue}% 3rd`,
        lean: strong ? leanPos : leanNeg,
        leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
        sampleTag: 'season · ESPN',
        weight: strong ? 74 : 70,
      })
    }

    const to = team.turnOverDifferential
    if (to && Math.abs(to.value) >= 5) {
      const positive = to.value > 0
      rows.push({
        id: `situational-${ownAbbr}-turnover`,
        section: 'situational',
        subsection: team.team_name,
        line: positive
          ? `Turnover differential +${to.value} — wins the takeaway battle.`
          : `Turnover differential ${to.value} — gives the ball away more than it takes it.`,
        highlight: `${to.value > 0 ? '+' : ''}${to.value}`,
        lean: positive ? leanPos : leanNeg,
        leanLabel: positive ? `${ownAbbr} +` : `${oppAbbr} +`,
        sampleTag: 'season · ESPN',
        weight: 78,
      })
    }
  }

  return rows.sort((a, b) => b.weight - a.weight).slice(0, 4)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 5 · SPECIAL TEAMS
// ─────────────────────────────────────────────────────────────────────

function buildSpecialTeamsRows(
  team: NFLTeamStatsForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): NFLScoutRow[] {
  if (!team) return []
  const rows: NFLScoutRow[] = []
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg = oppLean(leanPos)
  const sub = `${team.team_name} special teams`

  const fg = team.fieldGoalPct
  if (fg && (isStrong(fg) || isWeak(fg))) {
    const strong = isStrong(fg)
    rows.push({
      id: `st-${ownAbbr}-fg`,
      section: 'specialTeams',
      subsection: sub,
      line: strong
        ? `Field goal accuracy ${fg.displayValue}% (${fg.rankDisplayValue}) — reliable in scoring range.`
        : `Field goal accuracy ${fg.displayValue}% (${fg.rankDisplayValue}) — has missed makeable kicks.`,
      highlight: `${fg.displayValue}% FG`,
      lean: strong ? leanPos : leanNeg,
      leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: strong ? 56 : 60,
    })
  }

  const punt = team.netAvgPuntYards
  if (punt && isStrong(punt)) {
    rows.push({
      id: `st-${ownAbbr}-punt`,
      section: 'specialTeams',
      subsection: sub,
      line: `Net punt average ${punt.displayValue} yards (${punt.rankDisplayValue}) — wins the field-position battle.`,
      highlight: `${punt.displayValue} net`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'season · ESPN',
      weight: 48,
    })
  }

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  Per-team selector (identical discipline to scout.ts — no padding
//  with junk if a section is short; short is just reported honestly)
// ─────────────────────────────────────────────────────────────────────

function selectPerTeamSection(candidates: NFLScoutRow[], target: number): NFLScoutRow[] {
  return [...candidates].sort((a, b) => b.weight - a.weight).slice(0, target)
}

// ─────────────────────────────────────────────────────────────────────
//  ASSEMBLE
// ─────────────────────────────────────────────────────────────────────

export function buildNFLScoutReport(inputs: NFLScoutInputs): NFLScoutReport {
  const { homeStats, awayStats, homeAbbr, awayAbbr } = inputs

  const passingHome = selectPerTeamSection(buildPassingRows(homeStats, homeAbbr, awayAbbr, homeAbbr), PER_TEAM_TARGETS.passing)
  const passingAway = selectPerTeamSection(buildPassingRows(awayStats, awayAbbr, homeAbbr, homeAbbr), PER_TEAM_TARGETS.passing)

  const rushingHome = selectPerTeamSection(buildRushingRows(homeStats, homeAbbr, awayAbbr, homeAbbr), PER_TEAM_TARGETS.rushing)
  const rushingAway = selectPerTeamSection(buildRushingRows(awayStats, awayAbbr, homeAbbr, homeAbbr), PER_TEAM_TARGETS.rushing)

  const defenseHome = selectPerTeamSection(buildDefenseRows(homeStats, homeAbbr, awayAbbr, homeAbbr), PER_TEAM_TARGETS.defense)
  const defenseAway = selectPerTeamSection(buildDefenseRows(awayStats, awayAbbr, homeAbbr, homeAbbr), PER_TEAM_TARGETS.defense)

  const stHome = selectPerTeamSection(buildSpecialTeamsRows(homeStats, homeAbbr, awayAbbr, homeAbbr), PER_TEAM_TARGETS.specialTeams)
  const stAway = selectPerTeamSection(buildSpecialTeamsRows(awayStats, awayAbbr, homeAbbr, homeAbbr), PER_TEAM_TARGETS.specialTeams)

  const situational = buildSituationalRows(inputs)

  const bySection: Record<NFLScoutSection, NFLScoutRow[]> = {
    passing: [...passingAway, ...passingHome],
    rushing: [...rushingAway, ...rushingHome],
    defense: [...defenseAway, ...defenseHome],
    situational,
    specialTeams: [...stAway, ...stHome],
  }

  const rows = ([
    ...bySection.passing,
    ...bySection.rushing,
    ...bySection.defense,
    ...bySection.situational,
    ...bySection.specialTeams,
  ] as NFLScoutRow[])

  const shortfalls: string[] = []
  if (passingHome.length < PER_TEAM_TARGETS.passing) shortfalls.push(`${homeAbbr} passing ${passingHome.length}/${PER_TEAM_TARGETS.passing}`)
  if (passingAway.length < PER_TEAM_TARGETS.passing) shortfalls.push(`${awayAbbr} passing ${passingAway.length}/${PER_TEAM_TARGETS.passing}`)
  if (defenseHome.length < PER_TEAM_TARGETS.defense) shortfalls.push(`${homeAbbr} defense ${defenseHome.length}/${PER_TEAM_TARGETS.defense}`)
  if (defenseAway.length < PER_TEAM_TARGETS.defense) shortfalls.push(`${awayAbbr} defense ${defenseAway.length}/${PER_TEAM_TARGETS.defense}`)
  if (!homeStats) shortfalls.push(`${homeAbbr} stats unavailable`)
  if (!awayStats) shortfalls.push(`${awayAbbr} stats unavailable`)

  const degradedNote = shortfalls.length > 0 ? shortfalls.join(' · ') : null

  const pickTop = (sec: NFLScoutSection) => [...bySection[sec]].sort((a, b) => b.weight - a.weight)[0]

  return {
    rows,
    targetCount: (PER_TEAM_TARGETS.passing + PER_TEAM_TARGETS.rushing + PER_TEAM_TARGETS.defense + PER_TEAM_TARGETS.specialTeams) * 2,
    actualCount: rows.length,
    bySection,
    degradedNote,
    previewStrip: {
      passing: pickTop('passing'),
      defense: pickTop('defense'),
      situational: pickTop('situational'),
    },
    keyEdges: [...rows].sort((a, b) => b.weight - a.weight).slice(0, 5),
  }
}
