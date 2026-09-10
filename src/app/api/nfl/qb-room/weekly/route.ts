// src/app/api/nfl/qb-room/weekly/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getQbNgsWeekly } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const season = Number(req.nextUrl.searchParams.get('season'))

  if (!playerId || !season) {
    return NextResponse.json({ error: 'playerId and season are required' }, { status: 400 })
  }

  const weekly = await getQbNgsWeekly(playerId, season)
  return NextResponse.json({ weekly })
}