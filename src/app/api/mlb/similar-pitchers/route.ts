import { NextRequest, NextResponse } from 'next/server'
import { findSimilarPitchers } from '@/lib/pitcher-similarity'
import { requirePro } from '@/lib/require-pro'

export const revalidate = 1800

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const similar = await findSimilarPitchers(playerId, season)
  return NextResponse.json({ similar })
}
