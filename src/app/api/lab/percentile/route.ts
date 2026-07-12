import { NextRequest, NextResponse } from 'next/server'
import { getMetricPercentile, LEADER_METRICS } from '@/lib/lab'

const VALID_METRICS = Object.keys(LEADER_METRICS) as (keyof typeof LEADER_METRICS)[]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric') as keyof typeof LEADER_METRICS | null
  const id = searchParams.get('id')
  const season = searchParams.get('season')
  const poolSize = searchParams.get('poolSize')

  if (!metric || !VALID_METRICS.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 })
  }
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const seasonNum = season ? Number(season) : new Date().getFullYear()
  const pool = poolSize ? Number(poolSize) : 150

  try {
    const result = await getMetricPercentile(metric, seasonNum, Number(id), pool)
    // null is a valid, honest response — player exists but isn't in the
    // qualified pool. Not an error.
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load percentile', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}