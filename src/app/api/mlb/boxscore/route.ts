// src/app/api/mlb/boxscore/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getGameBoxScore } from '@/lib/game-boxscore'

export async function GET(req: NextRequest) {
  const gamePk = parseInt(req.nextUrl.searchParams.get('gamePk') ?? '0')
  if (!gamePk) return NextResponse.json(null, { status: 400 })

  const data = await getGameBoxScore(gamePk)
  if (!data) return NextResponse.json(null, { status: 404 })

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
  })
}
