import { NextRequest, NextResponse } from 'next/server'
import { getBatterFielding, getOutsAboveAverage } from '@/lib/batter-fielding'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const [fielding, oaa] = await Promise.all([
    getBatterFielding(playerId, season),
    getOutsAboveAverage(playerId, season),
  ])
  return NextResponse.json({ fielding, oaa })
}