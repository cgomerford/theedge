import { NextRequest, NextResponse } from 'next/server'
import { getPitcherPercentiles } from '@/lib/pitcher-percentiles'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const result = await getPitcherPercentiles(playerId, season)
  return NextResponse.json(result)
}