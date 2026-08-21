import { NextRequest, NextResponse } from 'next/server'
import { getBatterCareerPitchTypeSplit } from '@/lib/series-matchup'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const pitchType = req.nextUrl.searchParams.get('pitchType')
  if (!playerId || !pitchType) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }
  const result = await getBatterCareerPitchTypeSplit(Number(playerId), pitchType)
  return NextResponse.json(result)
}