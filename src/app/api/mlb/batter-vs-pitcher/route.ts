import { NextRequest, NextResponse } from 'next/server'
import { getBatterVsPitcher } from '@/lib/batter-stats'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const pitcherId = Number(searchParams.get('pitcherId'))
  if (!batterId || !pitcherId) return NextResponse.json({ error: 'batterId and pitcherId required' }, { status: 400 })

  const result = await getBatterVsPitcher(batterId, pitcherId)
  return NextResponse.json(result)
}
