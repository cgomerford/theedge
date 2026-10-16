// One club's hitters (with game logs) and pitchers for the Lab Players panel.
import { NextRequest, NextResponse } from 'next/server'
import { getTeamPlayers } from '@/lib/lab/team-players.server-fetch-allowed'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const teamId = Number(req.nextUrl.searchParams.get('team'))
  const season = Number(req.nextUrl.searchParams.get('season')) || new Date().getFullYear()
  if (!teamId) return NextResponse.json({ error: 'team required' }, { status: 400 })
  const result = await getTeamPlayers(teamId, season)
  if (!result) return NextResponse.json({ error: 'Player data unavailable' }, { status: 404 })
  return NextResponse.json(result)
}
