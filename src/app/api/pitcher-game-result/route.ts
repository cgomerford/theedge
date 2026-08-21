// src/app/api/pitcher-game-result/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getPitcherGameResult } from '@/lib/pitcher-series-edge'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const gamePk = req.nextUrl.searchParams.get('gamePk')
  const gameDate = req.nextUrl.searchParams.get('gameDate')

  if (!playerId || !gamePk || !gameDate) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  const result = await getPitcherGameResult(Number(playerId), Number(gamePk), gameDate)
  return NextResponse.json(result)
}