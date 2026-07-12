import { NextRequest, NextResponse } from 'next/server'
import { getPlayerTrend } from '@/lib/lab'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subjectType = searchParams.get('subjectType')
  const id = searchParams.get('id')
  const season = searchParams.get('season')

  if (subjectType !== 'pitcher' && subjectType !== 'batter') {
    return NextResponse.json({ error: 'subjectType must be pitcher or batter' }, { status: 400 })
  }
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const seasonNum = season ? Number(season) : new Date().getFullYear()

  try {
    const rows = await getPlayerTrend(subjectType, Number(id), seasonNum)
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load player trend', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}