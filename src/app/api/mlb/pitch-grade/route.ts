import { NextRequest, NextResponse } from 'next/server'
import { getPitchTypePercentiles } from '@/lib/pitch-type-percentiles'

export const dynamic = 'force-dynamic'  // public data, not per viewer

export async function GET(req: NextRequest) {
  // Open to everyone: the Arsenal tab's grade tile is on a free tab.
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const pitchType = searchParams.get('pitchType')
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId || !pitchType) return NextResponse.json({ error: 'playerId and pitchType required' }, { status: 400 })

  const result = await getPitchTypePercentiles(playerId, pitchType, season)
  return NextResponse.json(result)
}
