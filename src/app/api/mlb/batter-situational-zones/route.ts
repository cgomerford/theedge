import { NextRequest, NextResponse } from 'next/server'
import { getBatterSituationalZones } from '@/lib/batter-situational-zones'
import { requirePro } from '@/lib/require-pro'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season')) || new Date().getFullYear()
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const data = await getBatterSituationalZones(playerId, season)
  return NextResponse.json(data ?? { error: 'No real situational data on record yet' })
}
