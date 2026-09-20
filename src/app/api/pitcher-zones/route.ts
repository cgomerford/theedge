// src/app/api/pitcher-zones/route.ts
//
// On-demand fetch of a single pitcher's real hot zones (Supabase-cached
// pitcher_hot_zones table). Mirrors /api/batter-zones/route.ts exactly,
// pitcher side — new consumer: the Batting Lab's Hot Zone Overlay tab,
// which overlays a real opponent pitcher on top of the batter's own zones.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherHotZones } from '@/lib/hot-zones'

export async function GET(req: NextRequest) {
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
