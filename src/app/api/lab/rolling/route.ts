// src/app/api/lab/rolling/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getRollingMetric, type MetricKey, type SubjectType } from '@/lib/lab'

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
    const subjectType = searchParams.get('subjectType') as SubjectType | null
    const id = Number(searchParams.get('id'))
    const metric = searchParams.get('metric') as MetricKey | null
    const window = Number(searchParams.get('window') ?? 10)
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())

    if (!subjectType || !id || !metric) {
      return NextResponse.json({ error: 'Missing subjectType, id or metric' }, { status: 400 })
    }

    const points = await getRollingMetric({ subjectType, id, metric, season, window })
    return NextResponse.json({ points })
  } catch (err) {
    console.error('[lab/rolling]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load stats', detail }, { status: 500 })
  }
}