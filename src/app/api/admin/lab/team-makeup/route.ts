// src/app/api/admin/lab/team-makeup/route.ts
//
// One club's pitching make-up for the Lab page. The page calls this once per
// club (a few at a time) so the league view fills in as each club finishes —
// a cold club takes ~10-30 s to pull from Savant; a cached one is instant.

import { NextRequest, NextResponse } from 'next/server'
import { getTeamMakeup } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const teamId = Number(req.nextUrl.searchParams.get('team'))
  const season = Number(req.nextUrl.searchParams.get('season')) || new Date().getFullYear()
  if (!teamId) return NextResponse.json({ error: 'team required' }, { status: 400 })

  const result = await getTeamMakeup(teamId, season)
  if (!result) return NextResponse.json({ error: 'Pitch data unavailable' }, { status: 404 })
  return NextResponse.json(result)
}
