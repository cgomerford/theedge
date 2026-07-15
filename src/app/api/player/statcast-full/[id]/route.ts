import { NextRequest, NextResponse } from 'next/server'
import { getBatterStatcastFull, getPitcherStatcastFull } from '@/lib/player-statcast-full'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const playerId = Number(id)
  const { searchParams } = new URL(_req.url)
  const isPitcher = searchParams.get('type') === 'pitcher'
  if (!playerId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const data = isPitcher
    ? await getPitcherStatcastFull(playerId)
    : await getBatterStatcastFull(playerId)
  return NextResponse.json(data)
}