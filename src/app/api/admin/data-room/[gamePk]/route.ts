// src/app/api/admin/data-room/[gamePk]/route.ts
//
// Thin JSON endpoint for the dashboard's lazy Data Room fetch. Computes
// rolling stats + rule-based takes for ONE game on demand — nothing here
// runs until a game is selected client-side.
//
// ⚠ AUTH TODO: confirm middleware.ts's matcher covers /api/admin/:path*,
// not just /admin/:path*. Route handlers under /api are a separate tree
// from page routes and basic-auth middleware often only matches one or the
// other. If it doesn't already, add '/api/admin/:path*' to the matcher —
// otherwise this endpoint is reachable unauthenticated.

import { NextRequest, NextResponse } from 'next/server'
import { getDataRoomBundle } from '@/lib/pregame-stats'
import { buildAllTakes } from '@/lib/pregame-takes'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gamePk: string }> },
) {
  const { gamePk } = await params
  const pk = Number(gamePk)
  if (!pk) {
    return NextResponse.json({ error: 'invalid gamePk' }, { status: 400 })
  }

  const bundle = await getDataRoomBundle(pk)
  if (!bundle) {
    return NextResponse.json({ error: 'no data for gamePk' }, { status: 404 })
  }

  const { info, homeStats, awayStats, homeWatchlist, awayWatchlist } = bundle
  const takes = buildAllTakes(
    { abbr: info.homeAbbr, stats: homeStats, watchlist: homeWatchlist },
    { abbr: info.awayAbbr, stats: awayStats, watchlist: awayWatchlist },
  )

  return NextResponse.json({
    info,
    home: { stats: homeStats, watchlist: homeWatchlist, takes: takes.home },
    away: { stats: awayStats, watchlist: awayWatchlist, takes: takes.away },
  })
}