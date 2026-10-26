// src/app/api/batter-zones/route.ts
//
// On-demand fetch of a single batter's hot zones, for the Tale of the
// Tape selector on Behind the Plate. The two defaults (away leadoff,
// home leadoff) are still fetched server-side in page.tsx as before —
// this route only serves the OTHER batters in the lineup, fetched
// lazily on click.
//
// Mirrors the pattern already used by /api/spray-chart and /api/hot-zones.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterHotZones } from '@/lib/hot-zones'
import { requireAnyDeepLook } from '@/lib/deep-look'

export async function GET(req: NextRequest) {
  // Guard: Pro, or today's free deep look for this player (lib/deep-look.ts). The UI lock is not the gate.
  const denied = await requireAnyDeepLook([['batting_lab', req.nextUrl.searchParams.get('playerId')], ['pitching_lab', req.nextUrl.searchParams.get('forPitcher')], ['player_trends', req.nextUrl.searchParams.get('playerId')]])
  if (denied) return denied
  const playerId = req.nextUrl.searchParams.get('playerId')

  if (!playerId || isNaN(Number(playerId))) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  }

  try {
    const zones = await getBatterHotZones(Number(playerId))
    return NextResponse.json({ zones })
  } catch (err) {
    console.error('batter-zones route failed:', err)
    return NextResponse.json({ zones: {} }, { status: 500 })
  }
}
