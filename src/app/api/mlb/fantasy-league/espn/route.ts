import { NextRequest, NextResponse } from 'next/server'
import { importEspnLeague } from '@/lib/fantasy-league'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const leagueId = Number(new URL(req.url).searchParams.get('leagueId'))
  if (!Number.isFinite(leagueId) || leagueId <= 0) {
    return NextResponse.json({ error: 'Numeric ESPN league ID required.' }, { status: 400 })
  }
  const result = await importEspnLeague(leagueId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result)
}
