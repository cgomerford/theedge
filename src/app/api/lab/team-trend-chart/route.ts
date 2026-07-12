import { NextRequest, NextResponse } from 'next/server'
import { getAllTeamsRollingSeries, type TeamMetric } from '@/lib/lab'

const VALID: TeamMetric[] = ['runs_per_game', 'team_era', 'errors_per_game', 'team_ops']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric') as TeamMetric | null
  const season = searchParams.get('season')
  const window = searchParams.get('window')

  if (!metric || !VALID.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID.join(', ')}` }, { status: 400 })
  }

  try {
    const series = await getAllTeamsRollingSeries(metric, season ? Number(season) : new Date().getFullYear(), window ? Number(window) : 10)
    return NextResponse.json({ series })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load team trend', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}