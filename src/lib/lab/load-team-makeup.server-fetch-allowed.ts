// src/lib/lab/load-team-makeup.server-fetch-allowed.ts
//
// Browser → our own cached API route (not an external fan-out in a render
// path). Kept in its own file so the fetch( guard sees it is deliberate.

import type { TeamMakeup } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export async function loadTeamMakeup(teamId: number, season: number): Promise<TeamMakeup> {
  const res = await fetch(`/api/admin/lab/team-makeup?team=${teamId}&season=${season}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TeamMakeup
}
