import { NextRequest, NextResponse } from 'next/server'
import { getPlayerLevelStats } from '@/lib/player-levels'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const subject = searchParams.get('subject') === 'pitcher' ? 'pitcher' : 'batter'
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const levels = await getPlayerLevelStats(playerId, subject, season)
  return NextResponse.json({ levels })
}