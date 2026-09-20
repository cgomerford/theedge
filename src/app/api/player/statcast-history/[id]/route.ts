// src/app/api/player/statcast-history/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getPlayerStatcastHistory } from '@/lib/player-statcast-history'
import { requirePro } from '@/lib/require-pro'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Pro-only data (Statcast trends tab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { id } = await params
  const subject = req.nextUrl.searchParams.get('subject') === 'pitcher' ? 'pitcher' : 'batter'
  const playerId = Number(id)

  if (!playerId) return NextResponse.json({ error: 'invalid player id' }, { status: 400 })

  try {
    const seasons = await getPlayerStatcastHistory(playerId, subject)
    return NextResponse.json({ seasons })
  } catch (err) {
    console.error('statcast-history route failed:', err)
    return NextResponse.json({ seasons: [] }, { status: 200 })
  }
}