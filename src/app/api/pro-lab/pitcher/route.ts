// src/app/api/pro-lab/pitcher/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import {
  getPitcherDayNightSplit,
  getPitcherVeloLog,
  getPitcherBreakLog,
  getPitcherHRAllowedLog,
} from '@/lib/pro-lab-pitcher'

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
    const pitcherId = Number(searchParams.get('pitcherId'))
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())

    if (!pitcherId) {
      return NextResponse.json({ error: 'Missing pitcherId' }, { status: 400 })
    }

    // Run independently — one failing (e.g. Statcast CORS-proxy hiccup)
    // shouldn't take down the others. Each function already returns
    // null/[] on its own failure per the empty-state discipline.
    const [dayNight, veloLog, breakLog, hrLog] = await Promise.all([
      getPitcherDayNightSplit(pitcherId, season),
      getPitcherVeloLog(pitcherId, season),
      getPitcherBreakLog(pitcherId, season),
      getPitcherHRAllowedLog(pitcherId, season),
    ])

    return NextResponse.json({ dayNight, veloLog, breakLog, hrLog })
  } catch (err) {
    console.error('[api/pro-lab/pitcher]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load Pro Lab data', detail }, { status: 500 })
  }
}