import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPlayerOutlook } from '@/lib/fantasy-league'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro === true || subscriber?.role === 'admin'
  if (!isPro) {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 })
  }

  const playerId = Number(new URL(req.url).searchParams.get('playerId'))
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const outlook = await getPlayerOutlook(playerId)
  if (!outlook) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  return NextResponse.json(outlook)
}
