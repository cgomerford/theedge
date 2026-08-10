// src/app/api/stats/percentile/route.ts
//
// Thin wrapper around lib/lab.ts's getMetricPercentile — exposes real
// MLB-leaderboard percentiles (vs the qualified-player pool) to the client
// for the season grade AND the Stats/Percentiles rail's extended list.
//
// EXTENDED 2026-08: batters now get counting stats (HR/RBI/SB/H/TB/BB) in
// addition to the original rate stats, so the percentile tile has more to
// show. All of these are safe to add without direction-inversion logic —
// MLB's /stats/leaders endpoint always returns rank-1-is-best regardless
// of whether the underlying stat is "higher is better" (HR) or "lower is
// better" (ERA), so getMetricPercentile's existing formula handles both
// correctly with no per-metric special-casing needed.
//
// Pitcher set stays at era/whip/k9 — LEADER_METRICS' only pitcher-scoped
// categories. Traditional pitcher strikeout COUNT isn't in LEADER_METRICS
// (its 'strikeOuts' key is the hitting-group "batters struck out" leaders,
// wrong metric entirely for a pitcher), so it's left out rather than wired
// to something misleading.

import { NextRequest, NextResponse } from 'next/server'
import { getMetricPercentile } from '@/lib/lab'

const BATTER_METRICS = ['ops', 'avg', 'obp', 'slg', 'homeRuns', 'rbi', 'stolenBases', 'hits', 'totalBases', 'baseOnBalls'] as const
const PITCHER_METRICS = ['era', 'whip', 'k9'] as const

const LABELS: Record<string, string> = {
  ops: 'OPS', avg: 'AVG', obp: 'OBP', slg: 'SLG',
  homeRuns: 'HR', rbi: 'RBI', stolenBases: 'SB', hits: 'H', totalBases: 'TB', baseOnBalls: 'BB',
  era: 'ERA', whip: 'WHIP', k9: 'K/9',
}

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const subject = req.nextUrl.searchParams.get('subject') === 'pitcher' ? 'pitcher' : 'batter'
  const season = Number(req.nextUrl.searchParams.get('season') ?? new Date().getFullYear())

  if (!playerId || isNaN(Number(playerId))) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  }

  const metrics = subject === 'pitcher' ? PITCHER_METRICS : BATTER_METRICS

  try {
    const results = await Promise.all(
      metrics.map(async metric => {
        const result = await getMetricPercentile(metric, season, Number(playerId))
        return { key: metric, label: LABELS[metric], percentile: result?.percentile ?? null }
      })
    )
    return NextResponse.json({ percentiles: results })
  } catch (err) {
    console.error('percentile route failed:', err)
    return NextResponse.json({ percentiles: metrics.map(m => ({ key: m, label: LABELS[m], percentile: null })) }, { status: 200 })
  }
}