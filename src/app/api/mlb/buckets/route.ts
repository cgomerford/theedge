// src/app/api/mlb/buckets/route.ts
//
// On-demand data for the range-leaderboard cards on /mlb/leaders.
// Called client-side when a threshold pill is clicked.

import { NextRequest, NextResponse } from 'next/server'
import { getBucketLeaders, BUCKET_DEFINITIONS } from '@/lib/mlb-leaders'

export const revalidate = 1800

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bucket = searchParams.get('bucket') ?? ''
  const thresholdParam = searchParams.get('threshold')
  const limitParam = searchParams.get('limit')

  const def = BUCKET_DEFINITIONS.find(b => b.slug === bucket)
  if (!def) {
    return NextResponse.json({ available: false, reason: `Unknown bucket: ${bucket}` }, { status: 400 })
  }

  const threshold = thresholdParam ? Number(thresholdParam) : def.thresholds[0]
  if (!def.thresholds.includes(threshold)) {
    return NextResponse.json({ available: false, reason: `Invalid threshold ${threshold} for ${bucket}` }, { status: 400 })
  }

  const limit = limitParam ? Math.min(20, Math.max(1, parseInt(limitParam, 10))) : 10

  const result = await getBucketLeaders(bucket, threshold, limit)
  return NextResponse.json(result)
}