// src/app/api/mlb/pitch-shape/pitcher-overall/route.ts
//
// One pitcher's overall season numbers and where they rank, for the Pitch Shape Lab's player detail.
//   ?id=<pitcher id>&season=2026
// Ranks come from pitch_shape_results_pitcher; Savant percentile ranks are trimmed to the free three for a viewer who is not Pro, on the server (getPercentileBlocks).
import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherOverall } from '@/lib/pitch-shape/overall'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get('id')), season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(season) || season < 2024 || season > new Date().getFullYear() + 1) return NextResponse.json({ error: 'Bad id or season' }, { status: 400 })
  return NextResponse.json({ overall: await getPitcherOverall(id, season, await isProViewer()) })
}
