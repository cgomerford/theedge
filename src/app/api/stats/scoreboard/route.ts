// src/app/api/stats/scoreboard/route.ts
//
// GET /api/stats/scoreboard?date=YYYY-MM-DD — every game on a date (ET), for the Games scoreboard to refresh itself.

import { NextRequest, NextResponse } from 'next/server'
import { getScoreboard } from '@/lib/game-explorer'

export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Use ?date=YYYY-MM-DD.' }, { status: 400 })
  return NextResponse.json({ date, games: await getScoreboard(date) }, { headers: { 'Cache-Control': 'no-store' } })
}
