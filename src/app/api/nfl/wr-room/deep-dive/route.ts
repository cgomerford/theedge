// src/app/api/nfl/wr-room/deep-dive/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getWrNgsWeekly, getWrRadarProfile, getWrCoverageSplits, getWrPressureSplits } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const season = Number(req.nextUrl.searchParams.get('season'))

  if (!playerId || !season) {
    return NextResponse.json({ error: 'playerId and season are required' }, { status: 400 })
  }

  const [weekly, radar, coverage, pressure] = await Promise.all([
    getWrNgsWeekly(playerId, season),
    getWrRadarProfile(playerId, season),
    getWrCoverageSplits(playerId, season),
    getWrPressureSplits(playerId, season),
  ])

  return NextResponse.json({ weekly, radar, coverage, pressure })
}