// Thin wrapper around getPitcherRecentStarts (lib/mlb.ts) — that function
// already existed and worked server-side (used pre-rewrite); this route
// is the only new thing, needed because PlayerShareBuilder is a client
// component and can't call it directly.
import { NextRequest, NextResponse } from 'next/server'
import { getPitcherRecentStarts } from '@/lib/mlb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const limit = Number(searchParams.get('limit') ?? 5)
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  const starts = await getPitcherRecentStarts(playerId, limit)
  return NextResponse.json({ starts })
}