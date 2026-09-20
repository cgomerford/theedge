import { NextRequest, NextResponse } from 'next/server'
import { getPitchTypePercentiles } from '@/lib/pitch-type-percentiles'
import { requirePro } from '@/lib/require-pro'

export const revalidate = 1800

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const pitchType = searchParams.get('pitchType')
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId || !pitchType) return NextResponse.json({ error: 'playerId and pitchType required' }, { status: 400 })

  const result = await getPitchTypePercentiles(playerId, pitchType, season)
  return NextResponse.json(result)
}
