// src/app/api/dashboard/hot-zones/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPlayerHotZones, type SubjectType } from '@/lib/playerCompare'

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
    const id = Number(searchParams.get('id'))
    const subjectType = searchParams.get('subjectType') as SubjectType | null

    if (!id || !subjectType) {
      return NextResponse.json({ error: 'Missing id or subjectType' }, { status: 400 })
    }

    const result = await getPlayerHotZones(id, subjectType)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[dashboard/hot-zones]', err)
    const detail = process.env.NODE_ENV !== 'production'
      ? (err instanceof Error ? err.message : String(err))
      : undefined
    return NextResponse.json({ error: 'Failed to load hot zones', detail }, { status: 500 })
  }
}