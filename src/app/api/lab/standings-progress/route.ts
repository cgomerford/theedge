// src/app/api/lab/standings-progress/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getStandingsProgression, DIVISIONS } from '@/lib/lab'

export async function GET(request: NextRequest) {
  try {
    const devBypass = process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true'
    if (!devBypass) {
      const subscriber = await getCurrentSubscriber()
      if (!subscriber?.is_pro) {
        return NextResponse.json({ error: 'Pro required' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(request.url)
    const division = searchParams.get('division') ?? 'AL East'
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())

    const teamIds = DIVISIONS[division]
    if (!teamIds) {
      return NextResponse.json({ error: 'Unknown division' }, { status: 400 })
    }

    const series = await getStandingsProgression(season, teamIds)
    return NextResponse.json({ series })
  } catch (err) {
    console.error('[lab/standings-progress]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load standings progression', detail }, { status: 500 })
  }
}