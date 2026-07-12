import { NextRequest, NextResponse } from 'next/server'
import { getPlayerSeasonStats } from '@/lib/lab'

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

  try {
    const rows = await getPlayerSeasonStats(subjectType, Number(id), season ? Number(season) : new Date().getFullYear())
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load season stats', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}