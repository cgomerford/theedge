import { NextRequest, NextResponse } from 'next/server'
import { getBatterSprintSpeed } from '@/lib/batter-sprint-speed'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const sprintSpeed = await getBatterSprintSpeed(playerId, season)
  return NextResponse.json({ sprintSpeed })
}