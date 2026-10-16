// Earlier-season game logs for a club's current hitters: ?team=&season=&year=
import { NextRequest, NextResponse } from 'next/server'
import { getTeamHistory } from '@/lib/lab/team-players.server-fetch-allowed'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const teamId = Number(q.get('team')), year = Number(q.get('year'))
  const season = Number(q.get('season')) || new Date().getFullYear()
  if (!teamId || !year || year >= season) return NextResponse.json({ error: 'team and an earlier year required' }, { status: 400 })
  const result = await getTeamHistory(teamId, season, year)
  if (!result) return NextResponse.json({ error: 'History unavailable' }, { status: 404 })
  return NextResponse.json(result)
}
