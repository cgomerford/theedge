// src/app/api/batter-pitch-by-pitch/route.ts
//
// Thin wrapper around getBatterPitchByPitchResult. pitchTypeFit is passed
// as a JSON-encoded query param (small payload — a handful of pitch types
// per pitcher) rather than refetched server-side, since Top3ForTheSeries
// already has it in memory from the original getSeriesTop3 call and
// re-deriving it here would mean a second round of pitch_arsenals /
// batter_pitch_type_splits queries for data the client already has.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchByPitchResult, type PitchTypeFitLine } from '@/lib/series-matchup'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const pitcherId = Number(searchParams.get('pitcherId'))
  const gamePk = Number(searchParams.get('gamePk'))
  const pitchTypeFitRaw = searchParams.get('pitchTypeFit')

  if (!batterId || !pitcherId || !gamePk || !pitchTypeFitRaw) {
    return NextResponse.json(null, { status: 400 })
  }

  let pitchTypeFit: PitchTypeFitLine[] = []
  try {
    pitchTypeFit = JSON.parse(pitchTypeFitRaw)
  } catch {
    return NextResponse.json(null, { status: 400 })
  }

  const result = await getBatterPitchByPitchResult(batterId, pitcherId, gamePk, pitchTypeFit)
  return NextResponse.json(result)
}