import { NextRequest, NextResponse } from 'next/server'
import { getPitcherSituationalZones } from '@/lib/pitcher-situational-zones'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const result = await getPitcherSituationalZones(playerId, season)
  if (!result) return NextResponse.json({ error: 'no data' }, { status: 404 })
  return NextResponse.json(result)
}
