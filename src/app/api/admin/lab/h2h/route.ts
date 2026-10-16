// Career batter-vs-pitcher lines: ?pitcher=<id>&batters=<id,id,...>
import { NextRequest, NextResponse } from 'next/server'
import { getH2H } from '@/lib/lab/team-players.server-fetch-allowed'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const pitcher = Number(req.nextUrl.searchParams.get('pitcher'))
  const batters = (req.nextUrl.searchParams.get('batters') ?? '').split(',').map(Number).filter(Boolean).slice(0, 40)
  if (!pitcher || batters.length === 0) return NextResponse.json({ error: 'pitcher and batters required' }, { status: 400 })
  return NextResponse.json(await getH2H(pitcher, batters))
}
