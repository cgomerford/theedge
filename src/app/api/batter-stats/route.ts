import { NextRequest, NextResponse } from 'next/server'
import {
  getBatterSeasonStats,
  getBatterSplits,
  getBatterStatcast,
  getBatterVsPitcher,
} from '@/lib/batter-stats'

export const dynamic = 'force-dynamic' // ← add this

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId  = parseInt(searchParams.get('playerId') ?? '0')
  const type      = searchParams.get('type')
  const pitcherId = parseInt(searchParams.get('pitcherId') ?? '0')

  if (!playerId) return NextResponse.json(null, { status: 400 })

  switch (type) {
    case 'season':
      return NextResponse.json(await getBatterSeasonStats(playerId), {
        headers: { 'Cache-Control': 'no-store' }  // ← add this
      })
    case 'splits':
      return NextResponse.json(await getBatterSplits(playerId), {
        headers: { 'Cache-Control': 'no-store' }
      })
    case 'statcast':
      return NextResponse.json(await getBatterStatcast(playerId), {
        headers: { 'Cache-Control': 'no-store' }
      })
    case 'vs':
      if (!pitcherId) return NextResponse.json(null)
      return NextResponse.json(await getBatterVsPitcher(playerId, pitcherId), {
        headers: { 'Cache-Control': 'no-store' }
      })
    default:
      return NextResponse.json(null, { status: 400 })
  }
}