import { NextRequest, NextResponse } from 'next/server'
import { getLeaders, LEADER_METRICS } from '@/lib/lab'

const VALID = Object.keys(LEADER_METRICS) as (keyof typeof LEADER_METRICS)[]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric') as keyof typeof LEADER_METRICS | null
  const season = searchParams.get('season')

  if (!metric || !VALID.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID.join(', ')}` }, { status: 400 })
  }

  try {
    const rows = await getLeaders(metric, season ? Number(season) : new Date().getFullYear(), 50)
    return NextResponse.json({ rows, group: LEADER_METRICS[metric].group, label: LEADER_METRICS[metric].label })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load leaders', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}