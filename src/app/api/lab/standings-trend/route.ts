import { NextRequest, NextResponse } from 'next/server'
import { getStandingsProgression, DIVISIONS } from '@/lib/lab'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const division = searchParams.get('division')
  const season = searchParams.get('season')

  if (!division || !(division in DIVISIONS)) {
    return NextResponse.json({ error: `division must be one of: ${Object.keys(DIVISIONS).join(', ')}` }, { status: 400 })
  }

  try {
    const series = await getStandingsProgression(season ? Number(season) : new Date().getFullYear(), DIVISIONS[division])
    return NextResponse.json({ series })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load standings', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}