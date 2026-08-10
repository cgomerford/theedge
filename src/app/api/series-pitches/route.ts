// Server-side proxy for the hover card — browser-to-MLB-API CORS is
// untested for this endpoint, so this route does the fetch, not the
// client (same rationale as before this moved off Savant).
//
// 2026-08-09: switched from batterId+start+end (Savant CSV date-range
// search, confirmed returning zero rows for real players/real dates —
// see series-pitches.ts header) to batterId+gamePks (MLB's own live
// feed, fetched per exact game). No more date-range ambiguity — the
// caller already knows precisely which games make up the series.
import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchesFromGames } from '@/lib/series-pitches'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const gamePksParam = searchParams.get('gamePks')

  if (!batterId || !gamePksParam) {
    return NextResponse.json({ error: 'batterId and gamePks required' }, { status: 400 })
  }

  const gamePks = gamePksParam
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)

  if (gamePks.length === 0) {
    return NextResponse.json({ error: 'gamePks must contain at least one valid game ID' }, { status: 400 })
  }

  const pitches = await getBatterPitchesFromGames(gamePks, batterId)
  console.log(`[series-pitches] batter ${batterId}, games [${gamePks.join(',')}]: ${pitches.length} pitches`)
  return NextResponse.json({ pitches })
}