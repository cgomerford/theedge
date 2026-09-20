import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchLog } from '@/lib/batter-pitch-log'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!batterId) return NextResponse.json({ error: 'batterId required' }, { status: 400 })

  const log = await getBatterPitchLog(batterId, season)
  if (!log) return NextResponse.json({ error: 'no data' }, { status: 404 })
  return NextResponse.json(log)
}
