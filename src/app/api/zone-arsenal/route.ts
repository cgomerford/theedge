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
    const arsenal = await getPitcherZoneArsenal(Number(playerId))
    return NextResponse.json({ arsenal })
  } catch (err) {
    console.error('zone-arsenal route failed:', err)
    return NextResponse.json({ arsenal: {} }, { status: 500 })
  }
}
