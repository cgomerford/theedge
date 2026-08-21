// src/app/api/nfl/week-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getNFLWeekSchedule } from '@/lib/nfl-schedule'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const week = Number(searchParams.get('week') ?? '2')
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const seasontype = Number(searchParams.get('seasontype') ?? '1')

  const data = await getNFLWeekSchedule(season, week, seasontype)
  return NextResponse.json(data ?? { week, label: `Week ${week}`, games: [] })
}