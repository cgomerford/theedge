import { NextRequest, NextResponse } from 'next/server'
import { getBatterArsenalStats } from '@/lib/batter-arsenal-stats'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const pitchTypesParam = searchParams.get('pitchTypes') ?? ''
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const pitchTypes = pitchTypesParam.split(',').map(s => s.trim()).filter(Boolean)
  if (!batterId || pitchTypes.length === 0) return NextResponse.json({ error: 'batterId and pitchTypes required' }, { status: 400 })

  const stats = await getBatterArsenalStats(batterId, pitchTypes, season)
  return NextResponse.json({ stats })
}
