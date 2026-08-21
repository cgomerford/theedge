// src/lib/nfl/scout-report.ts
//
// Assembles ScoutReportData for a single game. Two genuinely different
// data situations depending on game status:
//
//   PRE-GAME: no play-by-play exists yet (the game hasn't happened), so
//   this pulls starters from the depth chart data (depth-charts.ts,
//   curl-verified earlier this session) — same starter/backup ordering
//   already used in the Roster Construction homepage preview.
//
//   POST-GAME: real play-by-play exists. Pulls it via game-plays.ts,
//   identifies the starting QB from the depth chart (first offense slot
//   tagged QB), and runs summarizeQBRoom() against that QB's actual
//   pass attempts in this specific game.
//
// Player names for passer/receiver IDs come from the depth chart roster
// (an id->name map built from both teams' offense/defense arrays) rather
// than extra per-player fetches — the depth chart already has every
// starter's name and ID, and play-by-play participants are overwhelmingly
// starters/rotation players who'll be in that set. A play-by-play
// participant NOT found in the depth chart roster (backup/late-game sub)
// falls back to "Unknown" rather than guessing — flagged, not hidden.
//
// KNOWN GAP: resolving a real ESPN event ID for a PAST game's slug isn't
// built yet — getNFLGameBySlugEnhanced() only searches the current
// week's live scoreboard, so any completed game outside that window
// falls back to a synthetic (non-ESPN-numeric) id. Until a proper
// date-scoped scoreboard lookup is built and curl-verified, this module
// accepts an explicit eventId override for specific games. TB @ NYJ
// (2026-08-14) is hardcoded below as the first wired example.

import { getTeamDepthChart, type TeamDepthChart, type DepthChartPlayer } from './depth-charts'
import { getGamePlays, summarizeQBRoom, summarizeTargets, type QBRoomSummary, type ParsedPlay } from './game-plays'

// Interim slug -> real ESPN event ID map. Extend this as more games get
// wired; replace with a real date-scoped lookup once that's built and verified.
const KNOWN_EVENT_IDS: Record<string, string> = {
  'tampa-bay-buccaneers-at-new-york-jets-2026-08-14': '401873276',
}

export type ScoutReportTeam = {
  qb: string
  skill: string[]   // formatted "POS Name" lines for RB/WR/TE starters
}

export type ScoutReportQB = {
  name: string
  summary: QBRoomSummary
  redZonePlays: ParsedPlay[]
}

export type ScoutReportData = {
  awayStarters: ScoutReportTeam | null
  homeStarters: ScoutReportTeam | null
  awayQB: ScoutReportQB | null
  homeQB: ScoutReportQB | null
}

function buildStartersView(chart: TeamDepthChart | null): ScoutReportTeam | null {
  if (!chart) return null
  const qb = chart.offense.find(p => p.positionAbbr === 'QB')
  const skill = chart.offense
    .filter(p => ['RB', 'WR', 'TE'].includes(p.positionAbbr))
    .map(p => `${p.positionAbbr} ${p.name}`)

  return {
    qb: qb?.name ?? 'TBD',
    skill,
  }
}

function buildAthleteNameMap(charts: (TeamDepthChart | null)[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const chart of charts) {
    if (!chart) continue
    for (const p of [...chart.offense, ...chart.defense]) {
      map.set(p.athleteId, p.name)
    }
  }
  return map
}

async function buildQBView(
  plays: ParsedPlay[],
  teamId: string,
  nameMap: Map<string, string>
): Promise<ScoutReportQB | null> {
  const primary = findPrimaryPasser(plays, teamId)
  if (!primary) return null

  const summary = summarizeQBRoom(plays, primary.athleteId)
  const redZonePlays = plays.filter(
    p => p.isPass && p.passerAthleteId === primary.athleteId && p.isRedZone
  )

  // Name resolution order: depth chart (covers starters who did play),
  // then a direct athlete fetch (covers backups), then an honest fallback.
  let name = nameMap.get(primary.athleteId)
  if (!name && primary.ref) name = await resolveAthleteName(primary.ref)

  return {
    name: name ?? 'Unknown',
    summary,
    redZonePlays,
  }
}
export async function getScoutReportData(
  slug: string,
  isFinal: boolean,
  awayTeamId: string,
  homeTeamId: string
): Promise<ScoutReportData> {
  const [awayChart, homeChart] = await Promise.all([
    getTeamDepthChart(awayTeamId),
    getTeamDepthChart(homeTeamId),
  ])

  const awayStarters = buildStartersView(awayChart)
  const homeStarters = buildStartersView(homeChart)

  if (!isFinal) {
    return { awayStarters, homeStarters, awayQB: null, homeQB: null }
  }

  const eventId = KNOWN_EVENT_IDS[slug]
  if (!eventId) {
    console.warn(`getScoutReportData: no known eventId for slug "${slug}" — post-game data unavailable`)
    return { awayStarters, homeStarters, awayQB: null, homeQB: null }
  }

  // TEMPORARY DEBUG — remove once the bug is found
  console.log('[scout-report] eventId:', eventId, '| awayTeamId:', awayTeamId, '| homeTeamId:', homeTeamId)

  const plays = await getGamePlays(eventId)

  // TEMPORARY DEBUG — remove once the bug is found
  console.log('[scout-report] plays fetched:', plays.length)
  const uniqueTeamIds = [...new Set(plays.map(p => p.teamId))]
  console.log('[scout-report] teamIds actually seen in play data:', uniqueTeamIds)

  const nameMap = buildAthleteNameMap([awayChart, homeChart])

  const [awayQB, homeQB] = await Promise.all([
    buildQBView(plays, awayTeamId, nameMap),
    buildQBView(plays, homeTeamId, nameMap),
  ])

  // TEMPORARY DEBUG — remove once the bug is found
  console.log('[scout-report] awayQB found:', !!awayQB, '| homeQB found:', !!homeQB)

  return { awayStarters, homeStarters, awayQB, homeQB }
}

async function resolveAthleteName(ref: string): Promise<string> {
  try {
    const res = await fetch(ref, { next: { revalidate: 86400 } })
    if (!res.ok) return 'Unknown'
    const data = await res.json()
    return data.displayName ?? data.fullName ?? 'Unknown'
  } catch {
    return 'Unknown'
  }
}
function findPrimaryPasser(plays: ParsedPlay[], teamId: string): { athleteId: string; ref: string | null; attempts: number } | null {
  const counts = new Map<string, { attempts: number; ref: string | null }>()
  for (const p of plays) {
    if (!p.isPass || !p.passerAthleteId || p.teamId !== teamId) continue
    const entry = counts.get(p.passerAthleteId) ?? { attempts: 0, ref: p.passerAthleteRef }
    entry.attempts++
    counts.set(p.passerAthleteId, entry)
  }
  if (counts.size === 0) return null
  const [athleteId, data] = [...counts.entries()].sort((a, b) => b[1].attempts - a[1].attempts)[0]
  return { athleteId, ref: data.ref, attempts: data.attempts }
}