// src/app/api/nfl/qb-room/deep-dive/route.ts
// FULL REPLACEMENT — adds coverage/pressure/formation to the response.

import { NextRequest, NextResponse } from 'next/server'
import { getQbNgsWeekly, getQbZoneProfile, getQbRadarProfile, getQbCoverageSplits, getQbPressureSplits, getQbFormationRate } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const season = Number(req.nextUrl.searchParams.get('season'))

  if (!playerId || !season) {
    return NextResponse.json({ error: 'playerId and season are required' }, { status: 400 })
  }

  const [weekly, zoneProfile, radar, coverage, pressure, formation] = await Promise.all([
    getQbNgsWeekly(playerId, season),
    getQbZoneProfile(playerId, season),
    getQbRadarProfile(playerId, season),
    getQbCoverageSplits(playerId, season),
    getQbPressureSplits(playerId, season),
    getQbFormationRate(playerId, season),
  ])

  return NextResponse.json({ weekly, zoneProfile, radar, coverage, pressure, formation })
}