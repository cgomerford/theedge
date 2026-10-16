// src/lib/lab/load-team-players.server-fetch-allowed.ts
//
// Browser → our own API routes (not an external fan-out in a render path).

import type { H2HLine, History, TeamPlayers } from '@/lib/lab/player-streaks'

export async function loadTeamPlayers(teamId: number, season: number): Promise<TeamPlayers> {
  const res = await fetch(`/api/admin/lab/team-players?team=${teamId}&season=${season}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TeamPlayers
}

export async function loadH2H(pitcherId: number, batterIds: number[]): Promise<Record<number, H2HLine | null>> {
  const res = await fetch(`/api/admin/lab/h2h?pitcher=${pitcherId}&batters=${batterIds.join(',')}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Record<number, H2HLine | null>
}

export async function loadHistory(teamId: number, season: number, year: number): Promise<History> {
  const res = await fetch(`/api/admin/lab/team-history?team=${teamId}&season=${season}&year=${year}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as History
}
