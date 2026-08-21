// src/lib/nfl/qb-room-season.ts
//
// Aggregates QB Room data across every completed game a team has played
// this season (preseason now, regular season once it starts — same
// function, no season-specific branching needed). Builds on
// game-plays.ts (per-game play parsing) and game-id-resolver.ts logic,
// but pulls event IDs from the team schedule endpoint directly rather
// than resolving one date at a time — one fetch gets the whole season's
// game list with real ESPN event IDs already attached.

import { getGamePlays, summarizeQBRoom, type ParsedPlay, type QBRoomSummary } from './game-plays'
import { getTeamDepthChart } from './depth-charts'

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

type SeasonGameRef = { eventId: string; date: string; isComplete: boolean }

// Fix in qb-room-season.ts — replace the broken filter in getTeamCompletedGameIds:

async function getTeamCompletedGameIds(teamId: string, season: number): Promise<SeasonGameRef[]> {
  try {
    const res = await fetch(`${ESPN}/teams/${teamId}/schedule?season=${season}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const events: any[] = data.events ?? []

    // Confirmed via curl 2026-08-16: completion status lives at
    // competitions[0].status.type.completed / .state, NOT at the
    // top level the way the scoreboard endpoint shapes it. This is a
    // genuinely different response shape from /scoreboard despite both
    // being "ESPN NFL schedule-ish" endpoints — don't assume they match.
    return events
      .filter(e => e.competitions?.[0]?.status?.type?.completed === true)
      .map(e => ({
        eventId: String(e.id),
        date: e.date,
        isComplete: true,
      }))
  } catch (e) {
    console.error(`getTeamCompletedGameIds(${teamId}) error:`, e)
    return []
  }
}


export type SeasonQBRoom = {
  athleteId: string
  name: string
  gamesPlayed: number
  summary: QBRoomSummary
  trails: QBPassTrail[]   // NEW — individual passes for the trajectory chart
}

// Sums two QBRoomSummary objects field by field, including merging their zoneChart maps.
function mergeSummaries(a: QBRoomSummary, b: QBRoomSummary): QBRoomSummary {
  const zoneChart: QBRoomSummary['zoneChart'] = {}
  const keys = new Set([...Object.keys(a.zoneChart), ...Object.keys(b.zoneChart)])
  for (const k of keys) {
    const za = a.zoneChart[k] ?? { attempts: 0, completions: 0 }
    const zb = b.zoneChart[k] ?? { attempts: 0, completions: 0 }
    zoneChart[k] = { attempts: za.attempts + zb.attempts, completions: za.completions + zb.completions }
  }
  return {
    passerAthleteId: a.passerAthleteId,
    totalAttempts: a.totalAttempts + b.totalAttempts,
    completions: a.completions + b.completions,
    shotgunAttempts: a.shotgunAttempts + b.shotgunAttempts,
    underCenterAttempts: a.underCenterAttempts + b.underCenterAttempts,
    redZoneAttempts: a.redZoneAttempts + b.redZoneAttempts,
    redZoneCompletions: a.redZoneCompletions + b.redZoneCompletions,
    zoneChart,
  }
}

export async function getSeasonQBRoom(teamId: string, season: number): Promise<SeasonQBRoom | null> {
  const games = await getTeamCompletedGameIds(teamId, season)
  if (games.length === 0) return null

  const allPlaysByGame = await Promise.all(games.map(g => getGamePlays(g.eventId)))

  const attemptCounts = new Map<string, number>()
  for (const plays of allPlaysByGame) {
    for (const p of plays) {
      if (!p.isPass || !p.passerAthleteId || p.teamId !== teamId) continue
      attemptCounts.set(p.passerAthleteId, (attemptCounts.get(p.passerAthleteId) ?? 0) + 1)
    }
  }
  if (attemptCounts.size === 0) return null
  const primaryAthleteId = [...attemptCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]

  let merged: QBRoomSummary | null = null
  let gamesPlayed = 0
  const trails: QBPassTrail[] = []

  for (const plays of allPlaysByGame) {
    const gameSummary = summarizeQBRoom(plays, primaryAthleteId)
    if (gameSummary.totalAttempts === 0) continue
    gamesPlayed++
    merged = merged ? mergeSummaries(merged, gameSummary) : gameSummary

    for (const p of plays) {
      if (p.isPass && p.passerAthleteId === primaryAthleteId && p.depth && p.direction) {
        trails.push({ depth: p.depth, direction: p.direction, isComplete: !!p.isComplete })
      }
    }
  }
  if (!merged) return null

  const chart = await getTeamDepthChart(teamId)
  const fromChart = chart?.offense.find(p => p.athleteId === primaryAthleteId)?.name
  let name = fromChart
  if (!name) {
    for (const plays of allPlaysByGame) {
      const withRef = plays.find(p => p.passerAthleteId === primaryAthleteId && p.passerAthleteRef)
      if (withRef?.passerAthleteRef) {
        try {
          const res = await fetch(withRef.passerAthleteRef, { next: { revalidate: 86400 } })
          if (res.ok) {
            const data = await res.json()
            name = data.displayName ?? data.fullName
          }
        } catch {}
        break
      }
    }
  }

  return { athleteId: primaryAthleteId, name: name ?? 'Unknown', gamesPlayed, summary: merged, trails }
}

export type QBPassTrail = {
  depth: 'short' | 'medium' | 'deep'
  direction: 'left' | 'middle' | 'right'
  isComplete: boolean
}
