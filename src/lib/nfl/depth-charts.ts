// src/lib/nfl/depth-charts.ts
//
// Team starting lineups from ESPN's depth chart endpoint. Distinct from
// the roster endpoint (nfl.ts doesn't currently expose one, but if it
// ever does — roster returns EVERY player on the 90-man squad, unordered
// within each offense/defense group; this endpoint returns ordered
// starter->backup chains per specific position slot).
//
// Curl-verified 2026-08-16 against:
//   https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{id}/depthcharts
// Real-world sanity check: Chiefs QB slot returned
// [Mahomes, Fields, Nussmeier, Oladokun] — athletes[0] is the confirmed
// starter, not alphabetical or roster-order.
//
// Structure: depthchart[] is a list of SCHEME variants (e.g. "Base 4-3 D",
// "Special Teams", "3WR 1TE" for the Chiefs specifically — scheme names
// are team-specific, not a fixed set across the league, since teams run
// different base fronts/personnel packages). Each scheme has a
// `positions` map keyed by slot abbreviation (qb, rb, lde, etc.), each
// slot has an ordered `athletes[]` array.
//
// Because scheme names vary by team, this module classifies slots into
// offense/defense/specialTeams by READING each position's own `parent`
// metadata (present on every athlete's position object) rather than by
// trusting the scheme group's name — safer than assuming every team
// calls their groups the same thing.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

export type DepthChartPlayer = {
  athleteId: string
  name: string
  positionAbbr: string
  headshotUrl: string | null
  depthOrder: number   // 0 = starter, 1 = backup, etc.
}

export type TeamDepthChart = {
  teamId: string
  offense: DepthChartPlayer[]   // depthOrder === 0 only, one per unique position slot
  defense: DepthChartPlayer[]
}

// Known offensive position abbreviations (from the position tree's
// `parent.abbreviation` — confirmed 'OFF' shows up on offensive slots
// via the roster endpoint's position.parent field seen earlier).
// Used as a fallback classifier when a slot's own parent chain doesn't
// resolve cleanly.
const OFFENSE_POS = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'])
const DEFENSE_POS = new Set(['LDE', 'RDE', 'DE', 'DT', 'NT', 'LOLB', 'ROLB', 'MLB', 'LB', 'ILB', 'OLB', 'LCB', 'RCB', 'CB', 'FS', 'SS', 'S', 'DB'])

async function fetchTeamDepthChart(teamId: string): Promise<any | null> {
  try {
    const res = await fetch(`${ESPN}/teams/${teamId}/depthcharts`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.error(`fetchTeamDepthChart(${teamId}) error:`, e)
    return null
  }
}

export async function getTeamDepthChart(teamId: string): Promise<TeamDepthChart | null> {
  const data = await fetchTeamDepthChart(teamId)
  if (!data?.depthchart) return null

  const offense: DepthChartPlayer[] = []
  const defense: DepthChartPlayer[] = []
  const seenOffenseSlots = new Set<string>()
  const seenDefenseSlots = new Set<string>()

  for (const scheme of data.depthchart) {
    for (const [slotKey, slot] of Object.entries<any>(scheme.positions ?? {})) {
      const posAbbr: string = slot.position?.abbreviation ?? slotKey.toUpperCase()
      const starter = slot.athletes?.[0]
      if (!starter) continue

      const player: DepthChartPlayer = {
        athleteId: String(starter.id ?? ''),
        name: starter.displayName ?? starter.fullName ?? 'Unknown',
        positionAbbr: posAbbr,
        headshotUrl: starter.headshot?.href ?? null,
        depthOrder: 0,
      }

      if (OFFENSE_POS.has(posAbbr) && !seenOffenseSlots.has(posAbbr)) {
        offense.push(player)
        seenOffenseSlots.add(posAbbr)
      } else if (DEFENSE_POS.has(posAbbr) && !seenDefenseSlots.has(posAbbr)) {
        defense.push(player)
        seenDefenseSlots.add(posAbbr)
      }
      // Special teams / unrecognized positions intentionally dropped —
      // this preview is scoped to offense + defense per the product ask.
    }
  }

  return { teamId, offense, defense }
}