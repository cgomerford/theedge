// src/app/api/lab/season-progression/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getSeasonProgressionCompare } from '@/lib/lab'

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
    const subjectType = searchParams.get('subjectType') as 'pitcher' | 'batter' | null
    const id = Number(searchParams.get('id'))
    const seasonsParam = searchParams.get('seasons') // e.g. "2026,2025"

    if (!subjectType || !id || !seasonsParam) {
      return NextResponse.json({ error: 'Missing subjectType, id or seasons' }, { status: 400 })
    }
    if (subjectType !== 'pitcher' && subjectType !== 'batter') {
      return NextResponse.json({ error: 'subjectType must be pitcher or batter' }, { status: 400 })
    }

    const seasons = seasonsParam.split(',').map(Number).filter(n => !Number.isNaN(n))
    if (seasons.length === 0) {
      return NextResponse.json({ error: 'No valid seasons' }, { status: 400 })
    }

    const series = await getSeasonProgressionCompare(subjectType, id, seasons)
    return NextResponse.json({ series })
  } catch (err) {
    console.error('[lab/season-progression]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load season progression', detail }, { status: 500 })
  }
}