// src/app/api/lab/team-leaders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getTeamLeaders, type TeamMetric } from '@/lib/lab'

const VALID_METRICS: TeamMetric[] = ['runs_per_game', 'team_era', 'errors_per_game', 'team_ops']

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
    const metric = searchParams.get('metric') as TeamMetric | null
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())
    const limit = Number(searchParams.get('limit') ?? 5)

    if (!metric || !VALID_METRICS.includes(metric)) {
      return NextResponse.json({ error: 'Unknown metric' }, { status: 400 })
    }

    const leaders = await getTeamLeaders(metric, season, limit)
    return NextResponse.json({ leaders })
  } catch (err) {
    console.error('[lab/team-leaders]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load team leaders', detail }, { status: 500 })
  }
}