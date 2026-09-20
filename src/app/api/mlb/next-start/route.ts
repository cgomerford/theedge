import { NextRequest, NextResponse } from 'next/server'
import { getNextStart, getStartOpponentLineup } from '@/lib/pitcher-next-start'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const nextStart = await getNextStart(playerId)
  if (!nextStart) {
    return NextResponse.json({ nextStart: null, lineup: [], lineupAsOf: null, lineupSource: 'unavailable' as const })
  }

  const { lineup, asOfDate, source } = await getStartOpponentLineup(nextStart)
  return NextResponse.json({ nextStart, lineup, lineupAsOf: asOfDate, lineupSource: source })
}
