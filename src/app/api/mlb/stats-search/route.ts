// src/app/api/mlb/stats-search/route.ts
//
// Single fetch point for /mlb/leaders' search page. The catalog itself
// (STAT_CATALOG) ships to the client for instant search-as-you-type; this
// route is only hit once a stat is picked, to run its real leaderboard
// fetch server-side (MLB Stats API and Baseball Savant both get called
// from the server everywhere else in this app — keeping it consistent
// here too, rather than betting on Savant's CORS policy from the browser).

import { NextRequest, NextResponse } from 'next/server'
import { STAT_CATALOG, getStatLeaderboard, PITCH_TYPES, type PitchTypeCode } from '@/lib/stats-search'

export const revalidate = 1800

const VALID_PITCH_TYPES = new Set(PITCH_TYPES.map(p => p.code))

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') ?? ''
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(30, Math.max(1, parseInt(limitParam, 10))) : 15
  const pitchTypeParam = searchParams.get('pitchType')
  const pitchType = pitchTypeParam && VALID_PITCH_TYPES.has(pitchTypeParam as PitchTypeCode) ? (pitchTypeParam as PitchTypeCode) : undefined

  const entry = STAT_CATALOG.find(e => e.key === key)
  if (!entry) {
    return NextResponse.json({ rows: [], error: `Unknown stat key: ${key}` }, { status: 400 })
  }

  const rows = await getStatLeaderboard(entry, limit, pitchType)
  return NextResponse.json({ rows })
}
