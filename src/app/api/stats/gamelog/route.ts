// src/app/api/stats/gamelog/route.ts
//
// GET /api/stats/gamelog?subject=batter&playerId=123&season=2026
// Returns the full season's per-game log; the client slices it into
// "last X games" vs "rest of season" windows so changing X doesn't need
// another round trip.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterGameLog, getPitcherGameLog } from '@/lib/stats-gamelog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get('subject')
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())

  if (!playerId || (subject !== 'batter' && subject !== 'pitcher')) {
    return NextResponse.json({ error: 'playerId and subject (batter|pitcher) required' }, { status: 400 })
  }

  const games = subject === 'batter'
    ? await getBatterGameLog(playerId, season)
    : await getPitcherGameLog(playerId, season)

  return NextResponse.json({ games })
}