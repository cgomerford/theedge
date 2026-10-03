// src/app/api/admin/pitcher-game-arm-angle/route.ts
//
// Feeds InGamePitcherCard's arm-angle panel. Separate from
// postgame-graphic-data because the upstream is genuinely different (a
// Savant CSV pull, not the MLB live feed) and only this one card needs it.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherGameArmAngle } from '@/lib/pitcher-game-arm-angle'

export async function GET(req: NextRequest) {
  const pitcherId = Number(req.nextUrl.searchParams.get('pitcherId'))
  const gamePk = Number(req.nextUrl.searchParams.get('gamePk'))
  const season = Number(req.nextUrl.searchParams.get('season')) || new Date().getFullYear()

  if (!pitcherId || !gamePk) {
    return NextResponse.json({ error: 'pitcherId and gamePk required' }, { status: 400 })
  }

  const result = await getPitcherGameArmAngle(pitcherId, gamePk, season)
  if (!result) return NextResponse.json({ error: 'Arm angle data unavailable' }, { status: 404 })

  return NextResponse.json(result)
}
