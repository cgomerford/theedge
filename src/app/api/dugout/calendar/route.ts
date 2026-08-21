import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { teamIdBySlug } from '@/lib/teams'
import { getCalendarMonth } from '@/lib/dugout-calendar'

export async function GET(req: NextRequest) {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = sub.primary_team ?? sub.teams?.[0] ?? 'phillies'
  const teamId = teamIdBySlug(slug)
  if (!teamId) return NextResponse.json({ error: 'No team' }, { status: 400 })

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const isValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  if (!isValid) return NextResponse.json({ error: 'Bad month' }, { status: 400 })

  const games = await getCalendarMonth(teamId, month)
  return NextResponse.json({ games, month })
}