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

export async function GET(req: NextRequest) {
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
