    // src/app/api/lab/league-radar/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getLeagueRadar } from '@/lib/lab'

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
    const season = Number(searchParams.get('season') ?? new Date().getFullYear())

    const axes = await getLeagueRadar(season)
    return NextResponse.json({ axes })
  } catch (err) {
    console.error('[lab/league-radar]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load league radar', detail }, { status: 500 })
  }
}
