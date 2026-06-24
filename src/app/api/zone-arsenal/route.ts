// src/app/api/zone-arsenal/route.ts
//
// On-demand fetch of a single pitcher's zone arsenal, for the Tale of the
// Tape selector on Behind the Plate. The two defaults (home SP, away SP)
// are still fetched server-side in page.tsx as before — this route only
// serves the OTHER pitchers in the selector, fetched lazily on click.
//
// Mirrors the pattern already used by /api/spray-chart and /api/hot-zones.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')

  if (!playerId || isNaN(Number(playerId))) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  }

  try {
    const arsenal = await getPitcherZoneArsenal(Number(playerId))
    return NextResponse.json({ arsenal })
  } catch (err) {
    console.error('zone-arsenal route failed:', err)
    return NextResponse.json({ arsenal: {} }, { status: 500 })
  }
}
