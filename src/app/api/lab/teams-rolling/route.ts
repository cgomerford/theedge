// src/app/api/lab/teams-rolling/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getAllTeamsRollingSeries, type TeamMetric } from '@/lib/lab'

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
    const window = Number(searchParams.get('window') ?? 10)

    if (!metric || !VALID_METRICS.includes(metric)) {
      return NextResponse.json({ error: 'Unknown metric' }, { status: 400 })
    }

    const series = await getAllTeamsRollingSeries(metric, season, window)
    return NextResponse.json({ series })
  } catch (err) {
    console.error('[lab/teams-rolling]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load team trends', detail }, { status: 500 })
  }
}