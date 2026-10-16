'use server'

// src/components/admin/stat-line/actions.ts
//
// Server actions for the stat-line builder (behind /admin's basic-auth proxy).
// Free MLB Stats API only; field names verified against live responses
// (roster: person/position/status; gameLog: splits[].stat/date/opponent/isHome).

import { toGameLine, type GameLine, type Group } from './logic'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type RosterPlayer = { id: number; name: string; pos: string; group: Group; jersey: string }

export async function loadRoster(teamId: number): Promise<RosterPlayer[]> {
  try {
    const res = await fetch(`${MLB}/teams/${teamId}/roster?rosterType=active`, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    if (!res.ok) { console.error('[loadRoster] HTTP', res.status); return [] }
    const data = await res.json()
    return (data.roster ?? []).map((r: { person: { id: number; fullName: string }; position?: { abbreviation?: string; type?: string }; jerseyNumber?: string }) => ({
      id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation ?? '',
      group: (r.position?.type === 'Pitcher' ? 'pitching' : 'hitting') as Group, jersey: r.jerseyNumber ?? '',
    }))
  } catch (err) {
    console.error('[loadRoster] failed:', err)
    return []
  }
}

/** Latest first. Tries the current season, then the one before (off-season / new player). */
export async function loadGameLog(playerId: number, group: Group, season: number): Promise<GameLine[]> {
  for (const yr of [season, season - 1]) {
    try {
      const res = await fetch(`${MLB}/people/${playerId}/stats?stats=gameLog&season=${yr}&group=${group}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
      if (!res.ok) { console.error('[loadGameLog] HTTP', res.status); continue }
      const data = await res.json()
      const splits = data.stats?.[0]?.splits ?? []
      const lines = splits.map((s: Parameters<typeof toGameLine>[1]) => toGameLine(group, s)).filter((x: GameLine | null): x is GameLine => !!x)
      if (lines.length) return lines.reverse().slice(0, 15)
    } catch (err) {
      console.error('[loadGameLog] failed:', err)
    }
  }
  return []
}
