// src/app/api/admin/batter-game-vs-season/route.ts
//
// Feeds InGameBatterCard's "Tonight vs season" module — the batter's season
// line (MLB Stats API) and season Statcast averages (exit velo/hard-hit/
// barrel%), both free/no-auth, bounded per-click admin fetches (same cost
// profile as the arm-angle route). Separate from postgame-graphic-data
// because these are per-player season lookups, not this game's live feed.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterSeasonStats, getBatterStatcast } from '@/lib/batter-stats'

export async function GET(req: NextRequest) {
  const playerId = Number(req.nextUrl.searchParams.get('playerId'))
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const [seasonStats, statcast] = await Promise.all([
    getBatterSeasonStats(playerId),
    getBatterStatcast(playerId),
  ])

  return NextResponse.json({ seasonStats, statcast })
}
