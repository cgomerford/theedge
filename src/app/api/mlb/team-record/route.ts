import { NextRequest, NextResponse } from 'next/server'
import { getPitcherTeamRecord } from '@/lib/pitcher-start-trends'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const range = searchParams.get('range') === 'career' ? 'career' : 'season'
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const rows = await getPitcherTeamRecord(playerId, season, range)
  return NextResponse.json({ rows })
}
