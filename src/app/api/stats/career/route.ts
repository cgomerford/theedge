import { NextRequest, NextResponse } from 'next/server'
import { getBatterCareerTable, getPitcherCareerTable } from '@/lib/lab'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const subject = searchParams.get('subject') === 'pitcher' ? 'pitcher' : 'batter'
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const seasons = subject === 'pitcher' ? await getPitcherCareerTable(playerId) : await getBatterCareerTable(playerId)
  return NextResponse.json({ seasons })
}