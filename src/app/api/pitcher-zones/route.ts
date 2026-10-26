// src/app/api/pitcher-zones/route.ts
//
// On-demand fetch of a single pitcher's real hot zones (Supabase-cached
// pitcher_hot_zones table). Mirrors /api/batter-zones/route.ts exactly,
// pitcher side — new consumer: the Batting Lab's Hot Zone Overlay tab,
// which overlays a real opponent pitcher on top of the batter's own zones.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherHotZones } from '@/lib/hot-zones'
import { requireAnyDeepLook } from '@/lib/deep-look'

export async function GET(req: NextRequest) {
  // Guard: Pro, or today's free deep look for this player (lib/deep-look.ts). The UI lock is not the gate.
  const denied = await requireAnyDeepLook([['pitching_lab', req.nextUrl.searchParams.get('playerId')], ['batting_lab', req.nextUrl.searchParams.get('forBatter')], ['player_trends', req.nextUrl.searchParams.get('playerId')]])
  if (denied) return denied
  const playerId = req.nextUrl.searchParams.get('playerId')

  if (!playerId || isNaN(Number(playerId))) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  }

  try {
    const zones = await getPitcherHotZones(Number(playerId))
    return NextResponse.json({ zones })
  } catch (err) {
    console.error('pitcher-zones route failed:', err)
    return NextResponse.json({ zones: {} }, { status: 500 })
  }
}
