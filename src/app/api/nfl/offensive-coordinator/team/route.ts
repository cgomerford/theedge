// src/app/api/nfl/offensive-coordinator/team/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getTeamFormationBreakdown } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  const season = Number(req.nextUrl.searchParams.get('season'))

  if (!teamId || !season) {
    return NextResponse.json({ error: 'teamId and season are required' }, { status: 400 })
  }

  const breakdown = await getTeamFormationBreakdown(teamId, season)
  return NextResponse.json({ breakdown })
}