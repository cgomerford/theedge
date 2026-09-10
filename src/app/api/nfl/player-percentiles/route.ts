// src/app/api/nfl/player-percentiles/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getPlayerPercentiles, getPlayerProfile } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const season = Number(req.nextUrl.searchParams.get('season'))
  if (!id || !season) {
    return NextResponse.json({ error: 'missing id or season' }, { status: 400 })
  }
  try {
    const [profile, dials] = await Promise.all([getPlayerProfile(id), getPlayerPercentiles(id, season)])
    return NextResponse.json({
      name: profile?.fullName ?? id,
      position: profile?.position ?? '',
      teamId: profile?.teamId ?? '',
      headshotUrl: profile?.headshotUrl ?? null,
      dials,
    })
  } catch (e) {
    console.error('player-percentiles error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}