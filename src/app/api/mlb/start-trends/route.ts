import { NextRequest, NextResponse } from 'next/server'
import { getPitcherStartTrends } from '@/lib/pitcher-start-trends'
import { requireDeepLook } from '@/lib/deep-look'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requireDeepLook('pitching_lab', new URL(req.url).searchParams.get('playerId'))
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const result = await getPitcherStartTrends(playerId, season)
  return NextResponse.json(result)
}
