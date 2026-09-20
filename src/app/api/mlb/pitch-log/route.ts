import { NextRequest, NextResponse } from 'next/server'
import { getPitcherPitchLog } from '@/lib/pitcher-pitch-log'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const pitchType = searchParams.get('pitchType')
  const range = searchParams.get('range') === 'career' ? 'career' : 'season'
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const log = await getPitcherPitchLog(playerId, season, range)
  if (!log) return NextResponse.json({ error: 'no data' }, { status: 404 })
  if (pitchType && pitchType !== 'ALL') {
    return NextResponse.json({ ...log, pitches: log.pitches.filter(p => p.pitchType === pitchType) })
  }
  return NextResponse.json(log)
}
