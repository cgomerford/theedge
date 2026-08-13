// src/app/api/pro-lab/batter/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import {
  getBatterDayNightSplit,
  getBatterExitVeloLog,
  getBatterHRLog,
} from '@/lib/pro-lab-batter'

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
    const batterId = Number(searchParams.get('batterId'))
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())

    if (!batterId) {
      return NextResponse.json({ error: 'Missing batterId' }, { status: 400 })
    }

    const [dayNight, veloLog, hrLog] = await Promise.all([
      getBatterDayNightSplit(batterId, season),
      getBatterExitVeloLog(batterId, season),
      getBatterHRLog(batterId, season),
    ])

    return NextResponse.json({ dayNight, veloLog, hrLog })
  } catch (err) {
    console.error('[api/pro-lab/batter]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load Pro Lab data', detail }, { status: 500 })
  }
}
