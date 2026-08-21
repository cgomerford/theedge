// src/app/api/mlb/leaders/route.ts
//
// On-demand leaderboard data for /mlb/leaders. Called client-side whenever
// a board's category or window changes — we don't prefetch all
// 15 categories × 6 windows server-side (that's 90 MLB API calls per page
// load), so this route is the single fetch point for anything beyond the
// three default season boards rendered at page load.

import { NextRequest, NextResponse } from 'next/server'
import { getWindowLeaders, LEADER_CATEGORIES, LEADER_WINDOWS, type LeaderWindow } from '@/lib/mlb-leaders'

export const revalidate = 1800

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? ''
  const window = (searchParams.get('window') ?? 'season') as LeaderWindow
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10))) : 15

  const validCategory = LEADER_CATEGORIES.some(c => c.slug === category)
  const validWindow = LEADER_WINDOWS.some(w => w.key === window)

  if (!validCategory) {
    return NextResponse.json(
      { available: false, reason: `Unknown category: ${category}` },
      { status: 400 }
    )
  }
  if (!validWindow) {
    return NextResponse.json(
      { available: false, reason: `Unknown window: ${window}` },
      { status: 400 }
    )
  }

  const result = await getWindowLeaders(category, window, limit)
  return NextResponse.json(result)
}