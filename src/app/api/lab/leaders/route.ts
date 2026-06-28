// src/app/api/lab/leaders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getLeaders, LEADER_METRICS } from '@/lib/lab'

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
    const metric = searchParams.get('metric') as keyof typeof LEADER_METRICS | null
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())
    const limit = Number(searchParams.get('limit') ?? 5)

    if (!metric || !LEADER_METRICS[metric]) {
      return NextResponse.json({ error: 'Unknown metric' }, { status: 400 })
    }

    const leaders = await getLeaders(metric, season, limit)
    return NextResponse.json({ leaders, label: LEADER_METRICS[metric].label })
  } catch (err) {
    console.error('[lab/leaders]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load leaders', detail }, { status: 500 })
  }
}
